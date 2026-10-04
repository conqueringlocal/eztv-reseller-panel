const headers = {
  "Access-Control-Allow-Origin": "https://reseller.eztvclub.com",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
const phases = [
  "waiting_config",
  "waiting_code",
  "waiting_password",
  "ready",
  "error",
];
const errors = [
  "setup_expired",
  "invalid_code",
  "invalid_password",
  "code_expired",
  "invalid_config",
  "telegram_unavailable",
  "flood_wait",
  "session_revoked",
  "channel_unavailable",
  "sync_failed",
];
const uuid = (s: unknown) =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
const str = (s: unknown, max: number) =>
  typeof s === "string" && s.length <= max;
const int = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
const source = (s: unknown) => typeof s === "string" && /^-?\d{1,20}$/.test(s);
const errorCode = (s: unknown) => s === null || errors.includes(String(s));
const date = (s: unknown) =>
  typeof s === "string" && s.length < 40 && Number.isFinite(Date.parse(s));
export function createSportsHandler(db: any) {
  const rpc = async (name: string, args: any = {}) => {
    const r = await db.rpc(name, args);
    if (r.error) throw Error("database_failed");
    return r.data;
  };
  return async (req: Request) => {
    if (req.method === "OPTIONS") return reply({});
    if (req.method !== "POST")
      return reply({ error: "Method not allowed" }, 405);
    try {
      let actor: string | null = null;
      const workerToken = req.headers.get("x-sports-reader-token");
      const worker = workerToken
        ? (await rpc("authorize_sports_reader", { p_token: workerToken })) ===
          true
        : false;
      if (workerToken && !worker) return reply({ error: "Unauthorized" }, 401);
      if (!worker) {
        const token = req.headers
          .get("authorization")
          ?.match(/^Bearer (.+)$/i)?.[1];
        if (!token) return reply({ error: "Sign in required" }, 401);
        const a = await db.auth.getUser(token);
        if (a.error || !a.data?.user)
          return reply({ error: "Sign in required" }, 401);
        actor = a.data.user.id;
        if (
          (await rpc("has_role", { _user_id: actor, _role: "admin" })) !== true
        )
          return reply({ error: "Administrator access required" }, 403);
        if (a.data.user.factors?.some((f: any) => f.status === "verified")) {
          const claims = JSON.parse(
            atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
          );
          if (claims.aal !== "aal2")
            return reply({ error: "Complete administrator MFA first" }, 403);
        }
      }
      const raw = await req.text();
      if (raw.length > (worker ? 11500000 : 5000))
        return reply({ error: "Request too large" }, 413);
      let b;
      try {
        b = JSON.parse(raw);
      } catch {
        return reply({ error: "Invalid request" }, 400);
      }
      if (!b || typeof b !== "object")
        return reply({ error: "Invalid request" }, 400);
      if (worker) {
        if (b.action === "verification_work")
          return reply(await rpc("sports_verification_work"));
        if (
          b.action === "verification_save" &&
          int(b.generation) &&
          uuid(b.post_id) &&
          /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
          /^[a-f0-9]{32}$/.test(b.content_hash) &&
          Array.isArray(b.items) &&
          b.items.length <= 1000 &&
          JSON.stringify(b.items).length <= 200000
        ) {
          await rpc("save_sports_verification", {
            p_generation: b.generation,
            p_day: b.date,
            p_post: b.post_id,
            p_hash: b.content_hash,
            p_items: b.items,
          });
          return reply({ ok: true });
        }
        if (
          b.action === "verification_health" &&
          Array.isArray(b.sources) &&
          b.sources.length === 4 &&
          b.sources.every(
            (s: any) =>
              ["NHL", "MLB", "NBA", "NFL"].includes(s.league) &&
              typeof s.ok === "boolean" &&
              int(s.events),
          )
        ) {
          await rpc("sports_verification_health", {
            p_sources: b.sources.map((s: any) => ({
              league: s.league,
              ok: s.ok,
              events: s.events,
            })),
          });
          return reply({ ok: true });
        }
        if (b.action === "poll") return reply(await rpc("poll_sports_reader"));
        if (
          b.action === "job_result" &&
          uuid(b.id) &&
          phases.includes(b.phase) &&
          errorCode(b.error) &&
          (b.channels === null ||
            (Array.isArray(b.channels) &&
              b.channels.length <= 1000 &&
              b.channels.every((c: any) => source(c.id) && str(c.title, 256))))
        ) {
          await rpc("finish_sports_reader_job", {
            p_id: b.id,
            p_phase: b.phase,
            p_channels: b.channels,
            p_error: b.error,
          });
          return reply({ ok: true });
        }
        if (
          b.action === "sync_result" &&
          int(b.generation) &&
          int(b.cursor) &&
          errorCode(b.error)
        ) {
          await rpc("finish_sports_reader_sync", {
            p_generation: b.generation,
            p_cursor: b.cursor,
            p_error: b.error,
          });
          return reply({ ok: true });
        }
        if (
          b.action === "upload" &&
          int(b.generation) &&
          source(b.source_id) &&
          int(b.message_id) &&
          b.message_id > 0 &&
          str(b.data, 11184812)
        ) {
          const s = await db
            .from("sports_reader_state")
            .select("enabled,source_id,generation")
            .single();
          if (
            s.error ||
            !s.data?.enabled ||
            s.data.source_id !== b.source_id ||
            s.data.generation !== b.generation
          )
            return reply({ error: "Source changed or paused" }, 409);
          const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0));
          if (!bytes.length || bytes.length > 8388608)
            return reply({ error: "Invalid attachment size" }, 400);
          const begins = (...prefix: number[]) =>
            prefix.every((x, i) => bytes[i] === x);
          const mime = begins(255, 216, 255)
            ? "image/jpeg"
            : begins(137, 80, 78, 71, 13, 10, 26, 10)
              ? "image/png"
              : begins(37, 80, 68, 70, 45)
                ? "application/pdf"
                : begins(82, 73, 70, 70) &&
                    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
                  ? "image/webp"
                  : null;
          if (!mime) return reply({ error: "Unsupported attachment" }, 400);
          const hash = Array.from(
            new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          )
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
          const ext = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "application/pdf": "pdf",
          }[mime];
          const path = `${b.source_id}/${b.message_id}/${hash}.${ext}`;
          const result = await db.storage
            .from("sports-reader-media")
            .upload(path, bytes, { contentType: mime, upsert: true });
          if (result.error) throw Error("upload_failed");
          return reply({ path, mime });
        }
        if (b.action === "post" && int(b.generation)) {
          const p = b.post;
          if (
            !p ||
            !source(p.source_id) ||
            !int(p.message_id) ||
            p.message_id < 1 ||
            !str(p.content, 32000) ||
            !date(p.posted_at) ||
            (p.edited_at !== null && !date(p.edited_at)) ||
            !str(p.fingerprint, 128) ||
            !str(p.media_notice, 200) ||
            (p.album_id !== null && !source(p.album_id)) ||
            !Array.isArray(p.media) ||
            p.media.length > 1 ||
            !p.media.every(
              (m: any) =>
                str(m.path, 180) &&
                m.path.startsWith(`${p.source_id}/${p.message_id}/`) &&
                /^[\d/-]+[a-f0-9]{64}\.(jpg|png|webp|pdf)$/.test(m.path) &&
                [
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "application/pdf",
                ].includes(m.mime),
            )
          )
            return reply({ error: "Invalid post" }, 400);
          await rpc("ingest_telegram_sports_post", {
            p_generation: b.generation,
            p_data: p,
          });
          return reply({ ok: true });
        }
      } else {
        if (b.action === "status") {
          const [state, jobs] = await Promise.all([
            db.from("sports_reader_state").select("*").single(),
            db
              .from("sports_reader_jobs")
              .select("id,kind,status,created_at")
              .order("created_at", { ascending: false })
              .limit(1),
          ]);
          if (state.error || jobs.error) throw Error("status_failed");
          return reply({ state: state.data, job: jobs.data?.[0] || null });
        }
        if (
          b.action === "source" &&
          (b.source_id === null || source(b.source_id)) &&
          str(b.timezone, 100) &&
          typeof b.enabled === "boolean"
        ) {
          try {
            new Intl.DateTimeFormat("en", { timeZone: b.timezone });
          } catch {
            return reply({ error: "Choose a valid timezone" }, 400);
          }
          await rpc("configure_sports_source", {
            p_admin: actor,
            p_source: b.source_id,
            p_timezone: b.timezone,
            p_enabled: b.enabled,
          });
          return reply({ ok: true });
        }
        if (
          ["configure", "code", "password", "channels", "disconnect"].includes(
            b.action,
          ) &&
          uuid(b.id)
        ) {
          let payload = {};
          if (b.action === "configure") {
            if (
              !int(b.api_id) ||
              b.api_id < 1 ||
              !/^[a-f0-9]{32}$/i.test(b.api_hash) ||
              !/^\+\d{7,16}$/.test(b.phone)
            )
              return reply(
                {
                  error:
                    "Enter the Telegram API ID, API hash and international phone number",
                },
                400,
              );
            payload = {
              api_id: b.api_id,
              api_hash: b.api_hash,
              phone: b.phone,
            };
          } else if (b.action === "code") {
            if (typeof b.code !== "string" || !/^\d{4,8}$/.test(b.code))
              return reply({ error: "Enter the Telegram login code" }, 400);
            payload = { code: b.code };
          } else if (b.action === "password") {
            if (!str(b.password, 256) || !b.password)
              return reply(
                { error: "Enter your Telegram two-step password" },
                400,
              );
            payload = { password: b.password };
          }
          await rpc("queue_sports_reader_job", {
            p_admin: actor,
            p_id: b.id,
            p_kind: b.action,
            p_payload: payload,
          });
          return reply({ ok: true });
        }
      }
      return reply({ error: "Invalid action or input" }, 400);
    } catch {
      return reply(
        {
          error:
            "Unable to complete this step. Refresh status before trying again.",
        },
        409,
      );
    }
  };
}
