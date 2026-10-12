#!/usr/bin/env python3
"""Prepare an isolated Zammad pilot. Never changes dashboard/Supabase data."""
import json
import os
from pathlib import Path
import secrets
import subprocess

SOURCE = Path(__file__).resolve().parent
TARGET = Path(os.environ.get("EZTV_SUPPORT_DIR", "/opt/eztv-support-pilot"))
UPSTREAM = "https://github.com/zammad/zammad-docker-compose.git"
REVISION = "b51cba16ab6d753efcb6676a30afaf97753b72cb"


def main():
    os.umask(0o077)
    if not TARGET.exists():
        subprocess.run(["git", "clone", UPSTREAM, str(TARGET)], check=True)
        subprocess.run(["git", "checkout", "--detach", REVISION], cwd=TARGET, check=True)
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=TARGET, text=True).strip()
    if actual != REVISION:
        raise SystemExit("Unexpected upstream revision. Review before changing the existing stack.")
    local = TARGET / "local"
    local.mkdir(exist_ok=True, mode=0o700)
    local.chmod(0o700)
    (local / "pilot.yml").write_text((SOURCE / "pilot.yml").read_text())
    (local / "image-lock.yml").write_text((SOURCE / "image-lock.yml").read_text())
    env = TARGET / ".env"
    if not env.exists():
        env.write_text((SOURCE / "pilot.env.example").read_text().replace(
            "GENERATE_A_RANDOM_PASSWORD", secrets.token_hex(32)))
    env.chmod(0o600)
    credentials = local / "pilot-users.json"
    if not credentials.exists():
        credentials.write_text(json.dumps({
            name: {"email": f"{name}@pilot.eztv.invalid", "password": secrets.token_urlsafe(32)}
            for name in ("admin", "agent", "reseller-a", "reseller-b", "distributor", "unrelated-reseller")
        }, indent=2) + "\n")
    credentials.chmod(0o600)
    subprocess.run(["docker", "compose", "config", "--quiet"], cwd=TARGET, check=True)
    print(f"Pilot prepared at {TARGET}; secrets remain in local mode-0600 files.")


if __name__ == "__main__":
    main()
