#!/usr/bin/env python3
"""Store a mailbox app password locally, or verify access without fetching/sending mail."""
import argparse
import getpass
import imaplib
import json
import os
from pathlib import Path
import smtplib
import ssl
import sys
import tempfile

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
LOCAL = ROOT / 'local'
FILE = LOCAL / 'mailbux.json'
HOST = 'my.mailbux.com'
EMAIL = 'support@eztvclub.com'
FOLDER = 'EZTV-Support-Pilot'


def store():
    if not sys.stdin.isatty():
        raise SystemExit('Run --store from your own interactive SSH terminal; do not pass credentials in command arguments.')
    if FILE.exists():
        raise SystemExit('A credential file already exists. Rotate it deliberately through your secure server access.')
    if not ROOT.is_dir():
        raise SystemExit('Prepare the private support pilot first.')
    password = getpass.getpass(f'Mailbux app password for {EMAIL} (hidden): ')
    if not password:
        raise SystemExit('No password entered; nothing saved.')
    LOCAL.mkdir(mode=0o700, exist_ok=True)
    LOCAL.chmod(0o700)
    data = {'email': EMAIL, 'app_password': password, 'imap_host': HOST, 'imap_port': 993,
            'smtp_host': HOST, 'smtp_port': 587, 'smtp_starttls': True,
            'folder': FOLDER, 'keep_on_server': True, 'activate_channel': False}
    fd = os.open(FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        json.dump(data, file, indent=2)
        file.write('\n')
    print('App password saved in the VPS private credential file. No login, mail import, or sending has occurred.')


def check():
    if not FILE.exists():
        raise SystemExit('No credential saved. Run --store from your own SSH terminal first.')
    if FILE.stat().st_mode & 0o077:
        raise SystemExit('Credential file permissions are too broad. Set mode 0600 before proceeding.')
    data = json.loads(FILE.read_text())
    if data.get('email') != EMAIL or data.get('folder') != FOLDER:
        raise SystemExit('Unexpected mailbox or test folder; review before connecting.')
    context = ssl.create_default_context()
    results = {'mailbox': EMAIL, 'imap_login': False, 'smtp_login': False, 'test_folder_available': False,
               'messages_fetched': 0, 'messages_sent': 0, 'channel_activated': False}
    client = None
    try:
        client = imaplib.IMAP4_SSL(HOST, 993, ssl_context=context, timeout=20)
        client.login(EMAIL, data['app_password'])
        results['imap_login'] = True
        status, _ = client.select(FOLDER, readonly=True)
        results['test_folder_available'] = status == 'OK'
    except (OSError, imaplib.IMAP4.error):
        print('IMAP verification failed. Check the app password, IMAP plan access, and network reachability.')
    finally:
        if client:
            try:
                client.logout()
            except (OSError, imaplib.IMAP4.error):
                pass
    try:
        with smtplib.SMTP(HOST, 587, timeout=20) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(EMAIL, data['app_password'])
            results['smtp_login'] = True
            # Deliberately no MAIL, RCPT or DATA commands.
    except (OSError, smtplib.SMTPException):
        print('SMTP verification failed. Check the app password and SMTP access.')
    fd, name = tempfile.mkstemp(prefix='mailbux-check-', suffix='.json', dir=LOCAL)
    with os.fdopen(fd, 'w') as report:
        json.dump(results, report, indent=2)
    os.replace(name, LOCAL / 'mailbux-check-result.json')
    print(json.dumps(results))
    if not results['imap_login'] or not results['smtp_login']:
        raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--store', action='store_true', help='Hidden local app-password prompt; no network calls')
    mode.add_argument('--check', action='store_true', help='TLS/authentication + read-only test-folder check; no mail fetched/sent')
    args = parser.parse_args()
    store() if args.store else check()
