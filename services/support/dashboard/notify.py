#!/usr/bin/env python3
"""Durable dashboard notifications. No ticket bodies, private notes or attachments in mail."""
import argparse
import email.message
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import smtplib
import ssl
import subprocess
import time
import urllib.request
import uuid

ROOT=Path('/opt/eztv-support-pilot')
ENDPOINT='https://hddnqgggjjlildufirof.supabase.co/functions/v1/reseller-helpdesk'

def literal(value):
    return 'NULL' if value is None else "'"+str(value).replace("'","''")+"'"

def sql(query):
    return subprocess.check_output(['docker','compose','exec','-T','zammad-postgresql','psql','-U','postgres','-d','zammad_production','-XqAt','-v','ON_ERROR_STOP=1'],input=query,text=True,cwd=ROOT,stderr=subprocess.PIPE).strip()

def rows(query):
    return json.loads(sql('SELECT coalesce(json_agg(x),\'[]\'::json) FROM ('+query+') x;'))

def recipients(event,key):
    body=json.dumps({'purpose':'support-notification-route','issued_at':int(time.time()),'creator_id':event['creator_id'],'handler_id':event['handler_id'],'audience':event['audience']}).encode()
    signature=hmac.new(key,body,hashlib.sha256).hexdigest()
    req=urllib.request.Request(ENDPOINT,data=body,headers={'Content-Type':'application/json','x-eztv-notification-signature':signature})
    with urllib.request.urlopen(req,timeout=20) as response:
        return json.load(response)['recipients']

def message(event,recipient,delivery_id):
    address=recipient['email']
    if not isinstance(address,str) or len(address)>254 or not re.fullmatch(r'[A-Za-z0-9.!#$%&\x27*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',address):
        raise ValueError('Invalid recipient')
    msg=email.message.EmailMessage()
    msg['From']='EZTV Support <support@eztvclub.com>'
    msg['To']=address
    msg['Subject']=f"EZTV support ticket #{event['number']}: update"
    msg['Message-ID']=f'<support-{delivery_id}@eztvclub.com>'
    path='admin' if recipient['admin'] else 'reseller'
    url=f"https://reseller.eztvclub.com/{path}/support?ticket={event['record_id']}"
    text='There is an update to a support ticket assigned to you.' if event['audience']=='handler' else 'Your support ticket has an update.'
    msg.set_content(f"{text}\n\nTicket #{event['number']}\nOpen the ticket to review its current status and reply:\n{url}\n\nSign in with your own dashboard account.\nReply in the dashboard; email replies are not added to the ticket.\n\nEZTV Support\n")
    return msg

def deliver(event,recipient,delivery_id,credentials):
    # Failures before DATA are safely retryable. An uncertain DATA result is not:
    # preserving the record for review avoids sending duplicate notifications.
    msg=message(event,recipient,delivery_id)
    smtp=smtplib.SMTP('my.mailbux.com',587,timeout=20)
    try:
        smtp.ehlo();smtp.starttls(context=ssl.create_default_context());smtp.ehlo()
        smtp.login(credentials['email'],credentials['app_password'])
        sql(f"UPDATE eztv_support_deliveries SET status='sending',updated_at=now() WHERE id={literal(delivery_id)};")
        try:
            smtp.send_message(msg)
            sql(f"UPDATE eztv_support_deliveries SET status='sent',sent_at=now(),last_error=NULL,updated_at=now() WHERE id={literal(delivery_id)};")
        except smtplib.SMTPResponseException:
            raise
        except Exception:
            sql(f"UPDATE eztv_support_deliveries SET status='uncertain',last_error='smtp_confirmation_unknown',updated_at=now() WHERE id={literal(delivery_id)};")
            return 'uncertain'
        return 'sent'
    finally:
        # A QUIT failure must not undo a confirmed DATA acceptance.
        try:smtp.quit()
        except Exception:smtp.close()

def run(send=False):
    if not send:
        print(json.dumps({'pending_events':int(sql("SELECT count(*) FROM eztv_support_notifications WHERE status='pending';")),'mail_sent':0}));return
    credentials=json.loads((ROOT/'local/mailbux.json').read_text())
    if credentials['email']!='support@eztvclub.com':raise ValueError('Unexpected sender')
    key=(ROOT/'local/dashboard/signing-key').read_bytes().strip()
    sql("UPDATE eztv_support_deliveries SET status='uncertain',last_error='worker_interrupted_during_smtp' WHERE status='sending' AND updated_at<now()-interval '5 minutes';")
    events=rows("SELECT n.*,r.creator_id,r.handler_id,t.number FROM eztv_support_notifications n JOIN eztv_support_tickets r ON r.id=n.record_id JOIN tickets t ON t.id=r.ticket_id WHERE n.status='pending' ORDER BY n.created_at LIMIT 25")
    counts={'sent':0,'retry':0,'uncertain':0,'skipped':0}
    for event in events:
        try:
            targets=recipients(event,key)  # fresh hierarchy/address at delivery time
        except Exception:
            counts['retry']+=1;continue
        target_ids=[t['id'] for t in targets]
        for target in targets:
            did=str(uuid.uuid4())
            sql(f"INSERT INTO eztv_support_deliveries(id,notification_id,recipient_id,created_at,updated_at) VALUES({literal(did)},{literal(event['id'])},{literal(target['id'])},now(),now()) ON CONFLICT(notification_id,recipient_id) DO NOTHING;")
            delivery=rows(f"SELECT * FROM eztv_support_deliveries WHERE notification_id={literal(event['id'])} AND recipient_id={literal(target['id'])}")[0]
            if delivery['status']!='pending':continue
            ready=sql(f"SELECT next_attempt_at IS NULL OR next_attempt_at<=now() FROM eztv_support_deliveries WHERE id={literal(delivery['id'])};")=='t'
            if not ready:continue
            did=delivery['id']
            sql(f"UPDATE eztv_support_deliveries SET attempts=attempts+1,updated_at=now() WHERE id={literal(did)};")
            try:
                status=deliver(event,target,did,credentials);counts[status]+=1
            except Exception as error:
                # Never log exception messages (SMTP payloads may contain secrets).
                status='failed' if delivery['attempts']>=4 or isinstance(error,ValueError) else 'pending'
                allowed="('pending','sending')" if isinstance(error,smtplib.SMTPResponseException) else "('pending')"
                sql(f"UPDATE eztv_support_deliveries SET status={literal(status)},last_error={literal(type(error).__name__)},next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE id={literal(did)} AND status IN {allowed};")
                counts['retry']+=1
        permitted=','.join(literal(v) for v in target_ids) or 'NULL'
        sql(f"UPDATE eztv_support_deliveries SET status='skipped',updated_at=now() WHERE notification_id={literal(event['id'])} AND status='pending' AND recipient_id NOT IN ({permitted});") if target_ids else sql(f"UPDATE eztv_support_deliveries SET status='skipped',updated_at=now() WHERE notification_id={literal(event['id'])} AND status='pending';")
        pending=int(sql(f"SELECT count(*) FROM eztv_support_deliveries WHERE notification_id={literal(event['id'])} AND status IN ('pending','sending');"))
        if pending==0:
            sql(f"UPDATE eztv_support_notifications SET status={literal('complete' if targets else 'skipped')},updated_at=now() WHERE id={literal(event['id'])};")
            if not targets:counts['skipped']+=1
    print(json.dumps(counts))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--send',action='store_true');args=parser.parse_args()
    with open(ROOT/'local/dashboard/notify.lock','w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:raise SystemExit(0)
        run(args.send)
