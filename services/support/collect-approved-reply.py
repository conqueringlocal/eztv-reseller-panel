#!/usr/bin/env python3
"""Collect the owner-approved test reply without enabling ordinary inbox intake."""
import fcntl
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
os.umask(0o077)
local = ROOT / 'local'
with (local / 'approved-mail-test.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    ledger = local / 'approved-mail-test.json'
    data = json.loads(ledger.read_text())
    def dc(*parts, **kwargs):
        return subprocess.run(['docker', 'compose', *parts], cwd=ROOT, capture_output=True, check=True, **kwargs)
    try:
        dc('cp', str(SOURCE / 'collect-approved-reply.rb'), 'zammad-railsserver:/tmp/eztv-collect-reply.rb')
        result = dc('exec', '-T', '-e', 'EZTV_SUPPORT_PILOT=true', 'zammad-railsserver',
                    'bundle', 'exec', 'rails', 'runner', '/tmp/eztv-collect-reply.rb', input=json.dumps(data).encode())
        report = json.loads(next(line.split('=', 1)[1] for line in result.stdout.decode().splitlines() if line.startswith('EZTV_REPLY_RESULT=')))
        (local / 'approved-reply-result.json').write_text(json.dumps(report, indent=2) + '\n')
        data.update(reply_verification=report, status='round_trip_verified', inbox_delivery_confirmed=True)
        ledger.write_text(json.dumps(data, indent=2) + '\n')
        print(json.dumps(report))
    except Exception as error:
        raw = (getattr(error, 'stdout', None) or b'') + (getattr(error, 'stderr', None) or b'')
        secret = json.loads((local / 'mailbux.json').read_text())['app_password']
        (local / 'approved-reply-error.log').write_text(raw.decode(errors='replace').replace(secret, '[REDACTED]'))
        raise SystemExit('Reply verification needs review; diagnostics retained privately. No outgoing email sent.')
    finally:
        dc('exec', '-T', '--user', 'root', 'zammad-railsserver', 'rm', '-f', '/tmp/eztv-collect-reply.rb')
