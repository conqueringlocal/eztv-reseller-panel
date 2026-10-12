#!/usr/bin/env python3
"""Real HTTP integration checks against the private, synthetic-only pilot."""
import base64
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

BASE = 'http://127.0.0.1:8093/api/v1'
LOCAL = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot')) / 'local'
USERS = json.loads((LOCAL / 'pilot-users.json').read_text())
RESULTS = []


def request(who, method, path, payload=None):
    headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
    if who:
        person = USERS[who]
        encoded = base64.b64encode(f"{person['email']}:{person['password']}".encode()).decode()
        headers['Authorization'] = f'Basic {encoded}'
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if payload is None else json.dumps(payload).encode())
    try:
        response = urllib.request.urlopen(req, timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    content = response.read()
    try:
        body = json.loads(content)
    except ValueError:
        body = content
    return response.status, body


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    RESULTS.append(name)
    print(f'PASS {name}', flush=True)


def ok(who, method, path, payload=None):
    status, body = request(who, method, path, payload)
    if status not in (200, 201):
        # Do not dump authentication or arbitrary response data.
        message = body.get('error', '') if isinstance(body, dict) else ''
        raise AssertionError(f'{method} {path}: HTTP {status} {message}')
    return body


def main():
    status, _ = request(None, 'GET', '/tickets')
    check('Anonymous ticket access denied', status in (401, 403))
    identities = {name: ok(name, 'GET', '/users/me')['id'] for name in USERS}
    check('Six isolated pilot identities can authenticate', len(set(identities.values())) == 6)
    groups = ok('admin', 'GET', '/groups')
    technical = next(group['id'] for group in groups if group['name'] == 'Technical Support')
    provisioning = next(group['id'] for group in groups if group['name'] == 'Provisioning & Renewals')
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S')
    tickets = {}
    for name in ('reseller-a', 'reseller-b', 'distributor', 'unrelated-reseller'):
        tickets[name] = ok(name, 'POST', '/tickets', {
            'title': f'PILOT {stamp} {name} synthetic connection issue',
            'group_id': technical, 'customer_id': identities[name],
            'article': {'subject': 'Synthetic support request', 'body': 'Test device; connection 2; no live account.',
                        'type': 'web', 'internal': False, 'content_type': 'text/plain'},
        })
        check(f'{name} creates ticket with correct ownership', tickets[name]['customer_id'] == identities[name])
    a, b = tickets['reseller-a']['id'], tickets['reseller-b']['id']
    check('Reseller can read own ticket', ok('reseller-a', 'GET', f'/tickets/{a}')['id'] == a)
    for viewer, target in [('reseller-a', b), ('reseller-b', a), ('unrelated-reseller', a), ('distributor', a)]:
        status, _ = request(viewer, 'GET', f'/tickets/{target}')
        check(f'{viewer} cannot read another reseller ticket {target}', status in (401, 403, 404))
    listed = ok('reseller-a', 'GET', '/tickets')
    check('Ticket list contains no other reseller tickets', all(t['customer_id'] == identities['reseller-a'] for t in listed))
    check('Support agent can read both reseller tickets', all(
        ok('agent', 'GET', f'/tickets/{ticket}')['id'] == ticket for ticket in (a, b)))
    status, _ = request('reseller-b', 'PUT', f'/tickets/{a}', {'title': 'forbidden edit'})
    check('Cross-reseller ticket edit denied', status in (401, 403, 404))
    check('Unauthorized edit did not change ticket', ok('agent', 'GET', f'/tickets/{a}')['title'] == tickets['reseller-a']['title'])

    note = ok('agent', 'POST', '/ticket_articles', {
        'ticket_id': a, 'body': 'PILOT INTERNAL ONLY — provider investigation details',
        'type': 'note', 'internal': True, 'content_type': 'text/plain',
        'attachments': [{'filename': 'internal-pilot.txt', 'data': base64.b64encode(b'PRIVATE PILOT NOTE').decode(), 'mime-type': 'text/plain'}],
    })
    public = ok('agent', 'POST', '/ticket_articles', {
        'ticket_id': a, 'body': 'PILOT public reply — we are investigating. Please do not repeat a paid action.',
        'type': 'note', 'internal': False, 'content_type': 'text/plain',
        'attachments': [{'filename': 'setup-pilot.txt', 'data': base64.b64encode(b'PUBLIC PILOT GUIDE').decode(), 'mime-type': 'text/plain'}],
    })
    articles = ok('reseller-a', 'GET', f'/ticket_articles/by_ticket/{a}')
    check('Internal notes hidden from ticket owner', all(article['id'] != note['id'] for article in articles))
    check('Public reply visible to ticket owner', any(article['id'] == public['id'] for article in articles))
    status, _ = request('reseller-a', 'GET', f"/ticket_articles/{note['id']}")
    check('Direct internal note access denied', status in (401, 403, 404))
    private_path = f"/ticket_attachment/{a}/{note['id']}/{note['attachments'][0]['id']}"
    public_path = f"/ticket_attachment/{a}/{public['id']}/{public['attachments'][0]['id']}"
    status, _ = request('reseller-a', 'GET', private_path)
    check('Internal attachment hidden from ticket owner', status in (401, 403, 404))
    status, data = request('reseller-a', 'GET', public_path)
    check('Public attachment available to ticket owner', status == 200 and data == b'PUBLIC PILOT GUIDE')
    status, _ = request('reseller-b', 'GET', public_path)
    check('Attachment protected from another reseller', status in (401, 403, 404))
    reply = ok('reseller-a', 'POST', '/ticket_articles', {
        'ticket_id': a, 'body': 'PILOT reseller follow-up with test device details',
        'type': 'web', 'internal': False, 'content_type': 'text/plain',
    })
    check('Reseller follow-up attributed to correct identity', reply['created_by_id'] == identities['reseller-a'])
    moved = ok('agent', 'PUT', f'/tickets/{a}', {'owner_id': identities['agent'], 'group_id': provisioning, 'priority': '3 high', 'state': 'open'})
    check('Agent can assign, prioritize and escalate queue', moved['owner_id'] == identities['agent'] and moved['group_id'] == provisioning)
    closed = ok('agent', 'PUT', f'/tickets/{a}', {'state': 'closed'})
    reopened = ok('agent', 'PUT', f'/tickets/{a}', {'state': 'open'})
    check('Ticket can close and reopen without losing conversation', closed['state_id'] != reopened['state_id'] and len(ok('agent', 'GET', f'/ticket_articles/by_ticket/{a}')) >= 4)
    visible_users = ok('reseller-a', 'GET', '/users')
    check('User directory is restricted to reseller identity', all(user['id'] == identities['reseller-a'] for user in visible_users))
    status, _ = request('reseller-a', 'GET', f"/users/{identities['reseller-b']}")
    check('Direct access to another reseller profile denied', status in (401, 403, 404))
    status, _ = request('reseller-a', 'POST', '/groups', {'name': 'FORBIDDEN PILOT GROUP'})
    check('Reseller cannot create support groups', status in (401, 403))
    original_roles = ok('reseller-a', 'GET', '/users/me')['role_ids']
    staff_roles = ok('admin', 'GET', '/users/me')['role_ids']
    request('reseller-a', 'PUT', f"/users/{identities['reseller-a']}", {'role_ids': staff_roles})
    check('Reseller cannot grant themselves staff roles', ok('reseller-a', 'GET', '/users/me')['role_ids'] == original_roles)
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        reads = list(pool.map(lambda _: request('reseller-a', 'GET', f'/tickets/{a}')[0], range(10)))
    check('Ten concurrent ticket reads succeed', all(status == 200 for status in reads))
    report = {'tested_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'passed': RESULTS,
              'tickets': {name: ticket['id'] for name, ticket in tickets.items()},
              'sample_parallel_read_seconds': round(time.monotonic() - started, 2),
              'limitations': ['Synthetic local pilot only', 'No SMTP or IMAP delivery test', 'No dashboard SSO or distributor reporting yet', 'Small concurrency smoke test, not a capacity benchmark']}
    (LOCAL / 'pilot-test-result.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'{len(RESULTS)} checks passed. Report saved without passwords or tokens.')


if __name__ == '__main__':
    main()
