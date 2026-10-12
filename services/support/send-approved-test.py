#!/usr/bin/env python3
"""Send ONE owner-approved external test; never rerun after an uncertain outcome."""
import argparse
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
BODY = '''This is the EZTV reseller help desk setup test you approved.

Please reply to this email with "Received". If convenient, attach a harmless test
image so we can also verify incoming attachments. Please do not include customer
credentials, payment information, or private customer details.

The attached text file is a safe delivery test. No reseller announcement or
customer account change has been made.

EZTV Support
support@eztvclub.com
'''

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipient', required=True)
    parser.add_argument('--send-approved-test', action='store_true', help='Use only after the owner explicitly approves sending to this recipient')
    args = parser.parse_args()
    recipient = args.recipient.strip().lower()
    if not re.fullmatch(r'[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}', recipient):
        raise SystemExit('Provide one valid recipient address.')
    if not args.send_approved_test:
        print(f'PREVIEW ONLY\nFrom: EZTV Support <support@eztvclub.com>\nTo: {recipient}\nSubject: EZTV support setup test [unique reference]\n\n{BODY}')
        return
    os.umask(0o077)
    local = ROOT / 'local'
    with (local / 'approved-mail-test.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        ledger = local / 'approved-mail-test.json'
        if ledger.exists():
            raise SystemExit('A test attempt is already recorded. Reconcile its ticket and delivery before any repeat; no email sent.')
        data = {'recipient': recipient, 'nonce': secrets.token_hex(12), 'approved_test': True,
                'body': BODY, 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'status': 'attempt_started'}
        with ledger.open('x') as out:
            json.dump(data, out, indent=2)
            out.flush()
            os.fsync(out.fileno())
        def dc(*parts, **kwargs):
            return subprocess.run(['docker', 'compose', *parts], cwd=ROOT, capture_output=True, check=True, **kwargs)
        try:
            dc('cp', str(SOURCE / 'send-approved-test.rb'), 'zammad-railsserver:/tmp/eztv-approved-test.rb')
            result = dc('exec', '-T', '-e', 'EZTV_SUPPORT_PILOT=true', 'zammad-railsserver',
                        'bundle', 'exec', 'rails', 'runner', '/tmp/eztv-approved-test.rb', input=json.dumps(data).encode())
            report = json.loads(next(line.split('=', 1)[1] for line in result.stdout.decode().splitlines() if line.startswith('EZTV_APPROVED_TEST=')))
            data.update(report, status='smtp_accepted_awaiting_recipient')
            ledger.write_text(json.dumps(data, indent=2) + '\n')
            print(f"SMTP accepted one test to {recipient}; ticket {report['ticket_number']}. Recipient delivery/reply confirmation still required.")
        except Exception as error:
            raw = (getattr(error, 'stdout', None) or b'') + (getattr(error, 'stderr', None) or b'')
            secret = json.loads((local / 'mailbux.json').read_text())['app_password']
            (local / 'approved-mail-test-error.log').write_text(raw.decode(errors='replace').replace(secret, '[REDACTED]'))
            raise SystemExit('Test outcome needs review. Attempt retained to prevent an automatic repeat; diagnostics remain private.')
        finally:
            dc('exec', '-T', '--user', 'root', 'zammad-railsserver', 'rm', '-f', '/tmp/eztv-approved-test.rb')

if __name__ == '__main__':
    main()
