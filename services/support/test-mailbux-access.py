#!/usr/bin/env python3
"""Verify credential handling and non-mutating mailbox checks without network access."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('mailbux_access', Path(__file__).with_name('mailbux-access.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class MailbuxAccessTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.local = Path(self.temp.name)
        self.file = self.local / 'mailbux.json'
        self.file.write_text(json.dumps({'email': module.EMAIL, 'folder': module.FOLDER, 'app_password': 'TEST-ONLY-NOT-A-REAL-PASSWORD'}))
        self.file.chmod(0o600)
        for name, value in [('LOCAL', self.local), ('FILE', self.file)]:
            helper = patch.object(module, name, value)
            helper.start()
            self.addCleanup(helper.stop)

    def test_tls_authentication_and_readonly_folder_without_mail_commands(self):
        imap = MagicMock()
        imap.select.return_value = ('OK', [b'3'])
        smtp = MagicMock()
        factory = MagicMock()
        factory.return_value.__enter__.return_value = smtp
        output = io.StringIO()
        with patch.object(module.imaplib, 'IMAP4_SSL', return_value=imap) as imap_factory, patch.object(module.smtplib, 'SMTP', factory), contextlib.redirect_stdout(output):
            module.check()
        self.assertEqual(imap_factory.call_args.args, ('my.mailbux.com', 993))
        self.assertEqual(imap_factory.call_args.kwargs['ssl_context'].verify_mode, module.ssl.CERT_REQUIRED)
        imap.select.assert_called_once_with('EZTV-Support-Pilot', readonly=True)
        imap.fetch.assert_not_called()
        imap.store.assert_not_called()
        imap.expunge.assert_not_called()
        imap.create.assert_not_called()
        smtp.starttls.assert_called_once()
        for command in ('sendmail', 'send_message', 'mail', 'rcpt', 'data'):
            getattr(smtp, command).assert_not_called()
        self.assertNotIn('TEST-ONLY-NOT-A-REAL-PASSWORD', output.getvalue())
        report = json.loads((self.local / 'mailbux-check-result.json').read_text())
        self.assertEqual(report['messages_sent'], 0)
        self.assertTrue(report['test_folder_available'])
        self.assertEqual((self.local / 'mailbux-check-result.json').stat().st_mode & 0o077, 0)

    def test_broad_credential_permissions_rejected_before_network(self):
        self.file.chmod(0o644)
        with patch.object(module.imaplib, 'IMAP4_SSL') as connect, self.assertRaises(SystemExit):
            module.check()
        connect.assert_not_called()

    def test_wrong_mailbox_rejected_before_network(self):
        self.file.write_text(json.dumps({'email': 'other@example.invalid', 'folder': module.FOLDER}))
        with patch.object(module.imaplib, 'IMAP4_SSL') as connect, self.assertRaises(SystemExit):
            module.check()
        connect.assert_not_called()

    def test_noninteractive_password_entry_rejected(self):
        with patch.object(module.sys.stdin, 'isatty', return_value=False), patch.object(module.getpass, 'getpass') as prompt, self.assertRaises(SystemExit):
            module.store()
        prompt.assert_not_called()


if __name__ == '__main__':
    unittest.main()
