import importlib.util
from pathlib import Path
import smtplib
import unittest
from unittest.mock import patch,MagicMock

spec=importlib.util.spec_from_file_location('notify',Path(__file__).resolve().parents[1]/'services/support/dashboard/notify.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
event={'id':'event','record_id':'ticket-id','number':'36052','audience':'handler','body':'SECRET PRIVATE NOTE','title':'PRIVATE TITLE'}
recipient={'id':'user-id','email':'test@example.test','admin':True}
credentials={'email':'support@eztvclub.com','app_password':'test-only'}

class Notifications(unittest.TestCase):
 def test_message_contains_only_safe_link(self):
  msg=n.message(event,recipient,'delivery-id');text=msg.get_content()
  self.assertIn('/admin/support?ticket=ticket-id',text)
  self.assertNotIn('SECRET',text);self.assertNotIn('PRIVATE',str(msg))
  self.assertIn('email replies are not added',text)
  self.assertEqual(msg['Message-ID'],'<support-delivery-id@eztvclub.com>')
 def test_recipient_header_injection_rejected(self):
  with self.assertRaises(ValueError):n.message(event,{**recipient,'email':'x@example.test\nBcc:attacker@example.test'},'d')
 def test_tls_delivery_confirmed_even_if_quit_fails(self):
  smtp=MagicMock();smtp.quit.side_effect=OSError('quit')
  with patch.object(n.smtplib,'SMTP',return_value=smtp),patch.object(n,'sql') as sql:
   self.assertEqual(n.deliver(event,recipient,'d',credentials),'sent')
   smtp.starttls.assert_called_once();smtp.login.assert_called_once();smtp.send_message.assert_called_once()
   self.assertIn("status='sent'",sql.call_args.args[0])
 def test_uncertain_data_never_looks_like_success(self):
  smtp=MagicMock();smtp.send_message.side_effect=smtplib.SMTPServerDisconnected('uncertain')
  with patch.object(n.smtplib,'SMTP',return_value=smtp),patch.object(n,'sql') as sql:
   self.assertEqual(n.deliver(event,recipient,'d',credentials),'uncertain')
   self.assertIn("status='uncertain'",sql.call_args.args[0])
 def test_auth_failure_does_not_start_data(self):
  smtp=MagicMock();smtp.login.side_effect=smtplib.SMTPAuthenticationError(535,b'denied')
  with patch.object(n.smtplib,'SMTP',return_value=smtp),patch.object(n,'sql') as sql:
   with self.assertRaises(smtplib.SMTPAuthenticationError):n.deliver(event,recipient,'d',credentials)
   smtp.send_message.assert_not_called();sql.assert_not_called()

if __name__=='__main__':unittest.main()
