"""Private, polling-only Telegram reader. Never sends messages or marks posts read."""
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import time
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from telethon import TelegramClient, errors, utils

ALLOWED = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
LIMIT = 8 * 1024 * 1024


def stamp(dt):
    return dt.isoformat() if dt else None


def parse_date(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def private_write(path, data):
    temp = path.with_suffix(".tmp")
    with open(temp, "w", opener=lambda p, f: os.open(p, f, 0o600)) as file:
        json.dump(data, file)
        file.flush()
        os.fsync(file.fileno())
    temp.replace(path)


class Backend:
    def __init__(self):
        self.url = os.environ["SPORTS_READER_URL"]
        self.token = os.environ["SPORTS_READER_TOKEN"]

    async def call(self, action, **data):
        def send():
            request = Request(self.url, json.dumps({"action": action, **data}).encode(), {
                "Content-Type": "application/json", "X-Sports-Reader-Token": self.token,
            })
            with urlopen(request, timeout=40) as response:
                return json.load(response)
        # Retry only idempotent writes. Never retry poll: it claims one-time secrets.
        for attempt in range(3 if action != "poll" else 1):
            try:
                return await asyncio.to_thread(send)
            except Exception:
                if action == "poll" or attempt == 2:
                    raise RuntimeError("backend_unavailable") from None
                await asyncio.sleep(2 ** attempt)


class Reader:
    def __init__(self, directory, backend):
        self.directory = Path(directory)
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(self.directory, 0o700)
        self.path = self.directory / "connection.json"
        self.config = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.backend = backend
        self.client = None
        self.cache = {}
        self.last_scan = 0
        self.last_sync = 0
        self.flood_until = 0
        self.current_generation = None

    def save(self):
        private_write(self.path, self.config)

    async def connect(self):
        if not self.config.get("api_id"):
            raise RuntimeError("invalid_config")
        if self.client is None:
            self.client = TelegramClient(str(self.directory / "telegram"), self.config["api_id"], self.config["api_hash"], receive_updates=False, flood_sleep_threshold=0, request_retries=1, connection_retries=2, timeout=15)
        if not self.client.is_connected():
            await self.client.connect()
        return self.client

    async def channels(self):
        client = await self.connect()
        return [{"id": str(utils.get_peer_id(d.entity)), "title": d.title[:256]} for d in await client.get_dialogs() if getattr(d.entity, "broadcast", False)][:1000]

    async def job(self, job, state):
        kind, payload = job["kind"], job["payload"] or {}
        phase, channels, error = state["phase"], None, None
        try:
            if time.time() < self.flood_until:
                raise RuntimeError("flood_wait")
            if kind == "configure":
                if self.client:
                    await self.client.disconnect()
                    self.client = None
                # Reconfiguration removes the previous local authorization before requesting a new one.
                for path in self.directory.glob("telegram.session*"):
                    path.unlink()
                self.config = {"api_id": payload["api_id"], "api_hash": payload["api_hash"], "phone": payload["phone"]}
                self.save()
                client = await self.connect()
                sent = await client.send_code_request(self.config["phone"])
                self.config["phone_code_hash"] = sent.phone_code_hash
                self.save()
                phase = "waiting_code"
            elif kind == "disconnect":
                if self.config.get("api_id"):
                    client = await self.connect()
                    if await client.is_user_authorized():
                        await client.log_out()
                    else:
                        await client.disconnect()
                self.client = None
                for path in self.directory.glob("telegram.session*"):
                    path.unlink(missing_ok=True)
                self.config = {}
                self.save()
                self.cache.clear()
                phase, channels = "waiting_config", []
            else:
                client = await self.connect()
                if kind == "code":
                    await client.sign_in(phone=self.config["phone"], code=payload["code"], phone_code_hash=self.config.get("phone_code_hash"))
                elif kind == "password":
                    await client.sign_in(password=payload["password"])
                if not await client.is_user_authorized():
                    raise RuntimeError("session_revoked")
                channels = await self.channels()
                phase = "ready"
                self.config.pop("phone_code_hash", None)
                self.save()
        except errors.SessionPasswordNeededError:
            phase = "waiting_password"
        except errors.PhoneCodeInvalidError:
            phase, error = "waiting_code", "invalid_code"
        except errors.PhoneCodeExpiredError:
            phase, error = "waiting_config", "code_expired"
        except errors.PasswordHashInvalidError:
            phase, error = "waiting_password", "invalid_password"
        except errors.FloodWaitError as exc:
            self.flood_until = time.time() + exc.seconds + 5
            self.config["flood_until"] = self.flood_until
            self.save()
            error = "flood_wait"
        except (errors.ApiIdInvalidError, errors.PhoneNumberInvalidError):
            phase, error = "waiting_config", "invalid_config"
        except Exception:
            error = "flood_wait" if time.time() < self.flood_until else "telegram_unavailable"
        # Persist only the sanitized result so a backend outage cannot lose a successful login.
        self.config["pending_result"] = {"id":job["id"], "phase":phase, "channels":channels, "error":error}
        self.save()
        await self.flush_result()

    async def flush_result(self):
        if self.config.get("pending_result"):
            await self.backend.call("job_result", **self.config["pending_result"])
            self.config.pop("pending_result", None)
            self.save()

    async def import_message(self, message, state):
        if getattr(message, "action", None):
            return
        content = (message.message or "")[:32000]
        # Telegram document/photo identity and edit time prevent unnecessary downloads.
        media_id = str(getattr(getattr(message, "photo", None), "id", "") or getattr(getattr(message, "document", None), "id", ""))
        digest = hashlib.sha256(json.dumps([content, stamp(message.edit_date), media_id], ensure_ascii=False).encode()).hexdigest()
        key = (state["source_id"], message.id)
        if self.cache.get(key) == digest:
            return
        media, notice, complete = [], "", True
        file = getattr(message, "file", None)
        if file:
            mime = file.mime_type or ("image/jpeg" if message.photo else "")
            if mime not in ALLOWED:
                notice = "Attachment format is not supported. View the original in Telegram."
            elif not file.size or file.size > LIMIT:
                notice = "Attachment exceeds the 8 MB import limit. View the original in Telegram."
            else:
                try:
                    data = await message.download_media(file=bytes)
                    if not data or len(data) > LIMIT:
                        raise ValueError("invalid_media")
                    result = await self.backend.call("upload", generation=state["generation"], source_id=state["source_id"], message_id=message.id, data=base64.b64encode(data).decode())
                    media = [{"path": result["path"], "mime": result["mime"]}]
                except errors.FloodWaitError:
                    raise
                except Exception:
                    notice, complete = "Attachment download pending. The reader will retry automatically.", False
        elif getattr(message, "media", None):
            notice = "This post includes media that cannot be imported."
        if not content and not media and not notice:
            return
        post = {"source_id":state["source_id"], "message_id":message.id, "content":content, "posted_at":stamp(message.date), "edited_at":stamp(message.edit_date), "media":media, "media_notice":notice, "album_id":str(message.grouped_id) if message.grouped_id else None, "fingerprint":digest}
        await self.backend.call("post", generation=state["generation"], post=post)
        if complete:
            self.cache[key] = digest
            if len(self.cache) > 2000:
                self.cache.pop(next(iter(self.cache)))

    async def sync(self, state):
        cursor = state["cursor_id"]
        error = None
        try:
            if time.time() < self.flood_until:
                raise RuntimeError("flood_wait")
            client = await self.connect()
            if not await client.is_user_authorized():
                raise RuntimeError("session_revoked")
            entity = await client.get_entity(int(state["source_id"]))
            if not getattr(entity, "broadcast", False):
                raise RuntimeError("channel_unavailable")
            options = {"min_id":cursor, "reverse":True, "limit":100}
            if cursor == 0:
                options["offset_date"] = parse_date(state["bootstrap_at"])
            async for message in client.iter_messages(entity, **options):
                await self.import_message(message, state)
                cursor = max(cursor, message.id)
            # Checkpoint before edit reconciliation; never advance beyond a failed post write.
            await self.backend.call("sync_result", generation=state["generation"], cursor=cursor, error=None)
            if time.time() - self.last_scan >= 900:
                cutoff = datetime.now(timezone.utc) - timedelta(days=7)
                async for message in client.iter_messages(entity, limit=500):
                    if message.date < cutoff:
                        break
                    # Avoid pulling older posts outside the requested initial history.
                    if message.date >= parse_date(state["bootstrap_at"]):
                        await self.import_message(message, state)
                self.last_scan = time.time()
        except errors.FloodWaitError as exc:
            self.flood_until = time.time() + exc.seconds + 5
            self.config["flood_until"] = self.flood_until
            self.save()
            error = "flood_wait"
        except (errors.ChannelPrivateError, errors.ChannelInvalidError):
            error = "channel_unavailable"
        except (errors.AuthKeyUnregisteredError, errors.SessionRevokedError):
            error = "session_revoked"
        except Exception as exc:
            error = str(exc) if str(exc) in {"session_revoked", "channel_unavailable", "flood_wait"} else "sync_failed"
        await self.backend.call("sync_result", generation=state["generation"], cursor=cursor, error=error)

    async def run(self):
        self.flood_until = self.config.get("flood_until", 0)
        while True:
            try:
                await self.flush_result()
                result = await self.backend.call("poll")
                state = result["state"]
                if result.get("job"):
                    await self.job(result["job"], state)
                elif state["enabled"] and state["phase"] == "ready":
                    if state["generation"] != self.current_generation:
                        self.current_generation = state["generation"]
                        self.cache.clear()
                        self.last_scan = self.last_sync = 0
                    if time.time() - self.last_sync >= 60:
                        await self.sync(state)
                        self.last_sync = time.time()
            except Exception:
                print("Sports reader: backend unavailable; retrying.", flush=True)
            await asyncio.sleep(15)


if __name__ == "__main__":
    os.umask(0o077)
    asyncio.run(Reader(os.environ.get("SPORTS_READER_STATE", "/var/lib/eztv-sports-reader"), Backend()).run())
