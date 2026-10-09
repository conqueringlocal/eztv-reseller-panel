#!/usr/bin/env python3
"""Create pilot backup, restore into disposable PostgreSQL, verify data/files."""
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import time
import uuid

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
NAME = 'eztv-support-restore-' + uuid.uuid4().hex[:8]
QUERY = """SELECT json_build_object(
  'tickets',(SELECT count(*) FROM tickets),
  'articles',(SELECT count(*) FROM ticket_articles),
  'users',(SELECT count(*) FROM users),
  'organizations',(SELECT count(*) FROM organizations),
  'stored_files',(SELECT count(*) FROM stores),
  'attachment_data',(SELECT count(*) FROM store_provider_dbs),
  'attachment_content_digest',(SELECT md5(string_agg(md5(data),',' ORDER BY id)) FROM store_provider_dbs))"""


def run(*args, **kwargs):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs).stdout


def dc(*args, **kwargs):
    return run('docker', 'compose', *args, cwd=ROOT, **kwargs)


def main():
    os.umask(0o077)
    config = json.loads(dc('config', '--format', 'json'))
    assert config['name'] == 'eztv-support-pilot' and config['networks']['default']['internal'] is True
    postgres_image = config['services']['zammad-postgresql']['image']
    target = ROOT / 'local' / 'recovery' / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    target.mkdir(parents=True, mode=0o700)
    expected = json.loads(dc('exec', '-T', 'zammad-postgresql', 'psql', '-U', 'postgres', '-d', 'zammad_production', '-Atc', QUERY))
    dc('run', '--rm', '-T', '-e', 'BACKUP_ONCE=true', 'zammad-backup')
    listing = dc('exec', '-T', 'zammad-backup', 'sh', '-c', 'ls -1 /var/tmp/zammad/*_zammad_db.psql.gz').decode().splitlines()
    database = sorted(listing)[-1]
    storage = database.replace('_db.psql.gz', '_files.tar.gz')
    for source in (database, storage):
        dc('cp', f'zammad-backup:{source}', str(target / Path(source).name))
        (target / Path(source).name).chmod(0o600)
    sql_file, storage_file = target / Path(database).name, target / Path(storage).name
    restored_files = target / 'restored-files'
    restored_files.mkdir(mode=0o700)
    with tarfile.open(storage_file, 'r:gz') as archive:
        members = archive.getmembers()
        assert all(m.name == 'opt/zammad/storage' or m.name.startswith('opt/zammad/storage/') for m in members)
        assert all(m.isfile() or m.isdir() for m in members)
        archive.extractall(restored_files, filter='data')
    hashes = {str(p.relative_to(restored_files)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in restored_files.rglob('*') if p.is_file()}
    try:
        run('docker', 'run', '-d', '--name', NAME, '--network', 'none', '--memory', '512m', '--cpus', '0.5',
            '--label', 'eztv.disposable-test=true', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', postgres_image)
        for _ in range(30):
            try:
                run('docker', 'exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres')
                break
            except subprocess.CalledProcessError:
                time.sleep(1)
        run('docker', 'exec', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE ROLE zammad LOGIN')
        run('docker', 'exec', NAME, 'createdb', '-U', 'postgres', '-O', 'zammad', 'zammad_restore')
        with gzip.open(sql_file, 'rb') as source:
            run('docker', 'exec', '-i', NAME, 'psql', '-U', 'postgres', '-d', 'zammad_restore', '-v', 'ON_ERROR_STOP=1', input=source.read())
        actual = json.loads(run('docker', 'exec', NAME, 'psql', '-U', 'postgres', '-d', 'zammad_restore', '-Atc', QUERY))
        assert actual == expected, 'Restored database counts differ from pilot snapshot'
        report = {'tested_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'database_counts_verified': actual, 'storage_files_extracted': len(hashes),
                  'storage_sha256': hashes, 'backup_directory': str(target),
                  'limitations': ['Same VPS backup, not off-site', 'Database restore and archive extraction tested; full application disaster recovery still required before production']}
        (ROOT / 'local' / 'recovery-test-result.json').write_text(json.dumps(report, indent=2) + '\n')
        print('PASS isolated PostgreSQL restore: tickets, articles, identities, organizations and attachment rows match.')
        print(f'PASS storage archive extracted safely: {len(hashes)} files.')
    finally:
        subprocess.run(['docker', 'rm', '-fv', NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
