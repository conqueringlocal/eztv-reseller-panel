#!/usr/bin/env python3
"""Read-only operational check. Prints no environment values or credentials."""
import json
import os
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))


def dc(*args):
    return subprocess.check_output(['docker', 'compose', *args], cwd=ROOT, text=True)


def main():
    config = json.loads(dc('config', '--format', 'json'))
    assert config['name'] == 'eztv-support-pilot'
    assert config['networks']['default']['internal'] is True
    for name, service in config['services'].items():
        if name != 'zammad-nginx':
            assert not service.get('ports'), f'{name}: unexpected published port'
            assert list(service['networks']) == ['default'], f'{name}: unexpected external network'
    ports = config['services']['zammad-nginx']['ports']
    assert len(ports) == 1 and ports[0]['host_ip'] == '127.0.0.1' and str(ports[0]['published']) == '8093'
    for name in ('.env', 'local/pilot-users.json'):
        assert (ROOT / name).stat().st_mode & 0o077 == 0, f'{name}: permissions too broad'
    states = [json.loads(line) for line in dc('ps', '--all', '--format', 'json').splitlines()]
    by_service = {row['Service']: row for row in states}
    assert set(config['services']).issubset(by_service), 'Missing service container'
    for name in config['services']:
        state = by_service[name]
        if name == 'zammad-init':
            assert state['State'] == 'exited' and state['ExitCode'] == 0, 'Initialization incomplete'
        else:
            assert state['State'] == 'running', f'{name}: not running'
            assert state.get('Health') in (None, '', 'healthy'), f'{name}: unhealthy'
    query = """SELECT json_build_object(
      'channels',(SELECT count(*) FROM channels WHERE active),
      'triggers',(SELECT count(*) FROM triggers WHERE active),
      'shared_orgs',(SELECT count(*) FROM organizations WHERE active AND shared),
      'saved_replies',(SELECT count(*) FROM text_modules WHERE active AND name LIKE 'eztv-%'))"""
    isolation = json.loads(dc('exec', '-T', 'zammad-postgresql', 'psql', '-U', 'postgres', '-d', 'zammad_production', '-Atc', query))
    assert isolation == {'channels': 0, 'triggers': 0, 'shared_orgs': 0, 'saved_replies': 4}
    with urllib.request.urlopen('http://127.0.0.1:8093', timeout=15) as response:
        assert response.status == 200
    print('PASS: services running, init complete, HTTP available, loopback-only proxy, isolated backend, external channels disabled, private organizations, four saved replies, protected credentials.')


if __name__ == '__main__':
    main()
