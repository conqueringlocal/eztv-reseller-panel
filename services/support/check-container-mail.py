#!/usr/bin/env python3
"""Verify application AND worker access to Mailbux without fetching/sending mail."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
os.umask(0o077)
credential = ROOT / 'local/mailbux.json'
if credential.stat().st_mode & 0o077:
    raise SystemExit('Credential file must be private.')
data = credential.read_bytes()
reports = {}
for service in ('zammad-railsserver', 'zammad-scheduler'):
    def dc(*args, **kwargs):
        return subprocess.run(['docker', 'compose', *args], cwd=ROOT,
                              capture_output=True, check=True, **kwargs)
    try:
        dc('cp', str(SOURCE / 'check-container-mail.rb'), service + ':/tmp/eztv-check-mail.rb')
        result = dc('exec', '-T', service, 'bundle', 'exec', 'ruby', '/tmp/eztv-check-mail.rb', input=data)
        line = next(line for line in result.stdout.decode().splitlines() if line.startswith('EZTV_CONTAINER_MAIL='))
        reports[service] = json.loads(line.split('=', 1)[1])
        assert all(reports[service][key] is True for key in ('imap_login', 'smtp_login', 'test_folder_available', 'general_internet_blocked'))
        print(f'PASS: {service}: verified TLS, IMAP/SMTP login, read-only test folder; no messages fetched or sent.')
    except Exception as error:
        raw = (getattr(error, 'stdout', None) or b'') + (getattr(error, 'stderr', None) or b'')
        secret = json.loads(data)['app_password']
        (ROOT / 'local/container-mail-error.log').write_text(raw.decode(errors='replace').replace(secret, '[REDACTED]'))
        raise SystemExit(f'{service}: check failed; diagnostics retained privately.')
    finally:
        dc('exec', '-T', '--user', 'root', service, 'rm', '-f', '/tmp/eztv-check-mail.rb')
(ROOT / 'local/container-mail-result.json').write_text(json.dumps(reports, indent=2) + '\n')
