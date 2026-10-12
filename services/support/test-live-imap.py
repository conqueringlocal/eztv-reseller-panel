#!/usr/bin/env python3
"""Import synthetic messages through the real test folder; no external mail sent."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
os.umask(0o077)

def dc(*args):
    return subprocess.run(['docker', 'compose', *args], cwd=ROOT, capture_output=True, check=True)

try:
    dc('cp', str(SOURCE / 'test-live-imap.rb'), 'zammad-railsserver:/tmp/eztv-live-imap.rb')
    result = dc('exec', '-T', '-e', 'EZTV_SUPPORT_PILOT=true', 'zammad-railsserver',
                'bundle', 'exec', 'rails', 'runner', '/tmp/eztv-live-imap.rb')
    lines = result.stdout.decode().splitlines()
    report = json.loads(next(line.split('=', 1)[1] for line in lines if line.startswith('EZTV_LIVE_IMAP=')))
    (ROOT / 'local/live-imap-result.json').write_text(json.dumps(report, indent=2) + '\n')
    for line in lines:
        if line.startswith('PASS '):
            print(line)
except Exception as error:
    raw = (getattr(error, 'stdout', None) or b'') + (getattr(error, 'stderr', None) or b'')
    secret = json.loads((ROOT / 'local/mailbux.json').read_text())['app_password']
    (ROOT / 'local/live-imap-error.log').write_text(raw.decode(errors='replace').replace(secret, '[REDACTED]'))
    raise SystemExit('Live IMAP test failed; diagnostics retained privately.')
finally:
    dc('exec', '-T', '--user', 'root', 'zammad-railsserver', 'rm', '-f', '/tmp/eztv-live-imap.rb')
