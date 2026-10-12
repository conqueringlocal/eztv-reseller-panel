#!/usr/bin/env python3
"""Save a verified mailbox credential into an inactive private-pilot channel."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
os.umask(0o077)
credential = ROOT / 'local/mailbux.json'
if credential.stat().st_mode & 0o077:
    raise SystemExit('Credential file must have private permissions.')
data = json.loads(credential.read_text())
report = json.loads((ROOT / 'local/mailbux-check-result.json').read_text())
if not all(report.get(key) is True for key in ('imap_login', 'smtp_login', 'test_folder_available')):
    raise SystemExit('Run the read-only mailbox access check successfully first.')


def dc(*args, **kwargs):
    return subprocess.run(['docker', 'compose', *args], cwd=ROOT,
                          capture_output=True, check=True, **kwargs)


try:
    dc('cp', str(SOURCE / 'configure-mailbux.rb'), 'zammad-railsserver:/tmp/eztv-configure-mailbux.rb')
    result = dc('exec', '-T', '-e', 'EZTV_SUPPORT_PILOT=true', 'zammad-railsserver',
                'bundle', 'exec', 'rails', 'runner', '/tmp/eztv-configure-mailbux.rb',
                input=json.dumps(data).encode())
    line = next(line for line in result.stdout.decode().splitlines() if line.startswith('EZTV_MAILBUX_CONFIG='))
    config = json.loads(line.removeprefix('EZTV_MAILBUX_CONFIG='))
    (ROOT / 'local/mailbux-channel-result.json').write_text(json.dumps(config, indent=2) + '\n')
    print('PASS: Mailbux channel prepared in Zammad; channel and sender inactive, test folder only, TLS verification enabled.')
except Exception as error:
    # Retain diagnostics privately, removing the credential before saving.
    raw = (getattr(error, 'stdout', None) or b'') + (getattr(error, 'stderr', None) or b'')
    sanitized = raw.decode(errors='replace').replace(data['app_password'], '[REDACTED]')
    (ROOT / 'local/mailbux-config-error.log').write_text(sanitized)
    # Do not print subprocess output or exception details.
    raise SystemExit('Mailbox configuration did not complete. Raw diagnostic output withheld.')
finally:
    dc('exec', '-T', '--user', 'root', 'zammad-railsserver', 'rm', '-f', '/tmp/eztv-configure-mailbux.rb')
