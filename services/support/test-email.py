#!/usr/bin/env python3
"""Run isolated inbound parsing/outbound SMTP tests; never send external email."""
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
SINK = 'eztv-support-mail-sink'
IMAGE = 'axllent/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d'


def dc(*args, **kwargs):
    return subprocess.run(['docker', 'compose', *args], cwd=ROOT, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)


def main():
    config = json.loads(dc('config', '--format', 'json').stdout)
    assert config['name'] == 'eztv-support-pilot' and config['networks']['default']['internal']
    subprocess.run(['docker', 'run', '-d', '--name', SINK, '--network', 'eztv-support-pilot_default',
                    '--network-alias', SINK, '--memory', '128m', '--cpus', '0.25',
                    '--label', 'eztv.disposable-test=true', IMAGE], check=True, stdout=subprocess.DEVNULL)
    try:
        dc('cp', str(SOURCE / 'test-email.rb'), 'zammad-railsserver:/tmp/eztv-test-email.rb')
        result = dc('exec', '-T', '-e', 'EZTV_SUPPORT_PILOT=true', 'zammad-railsserver',
                    'bundle', 'exec', 'rails', 'runner', '/tmp/eztv-test-email.rb')
        lines = result.stdout.decode().splitlines()
        for line in lines:
            if line.startswith('PASS '):
                print(line)
        report = json.loads(next(line.removeprefix('EZTV_EMAIL_RESULT=') for line in lines if line.startswith('EZTV_EMAIL_RESULT=')))
        (ROOT / 'local/email-test-result.json').write_text(json.dumps(report, indent=2) + '\n')
        print(f"{len(report['passed'])} isolated email checks passed. No live mailbox connected.")
    except subprocess.CalledProcessError as error:
        # Synthetic-only runner, but retain diagnostics privately instead of dumping logs.
        log = ROOT / 'local/email-test-error.log'
        log.write_bytes((error.stdout or b'') + (error.stderr or b''))
        log.chmod(0o600)
        raise SystemExit(f'Email test failed; diagnostics retained at {log}')
    finally:
        dc('exec', '-T', '--user', 'root', 'zammad-railsserver', 'rm', '-f', '/tmp/eztv-test-email.rb')
        subprocess.run(['docker', 'rm', '-fv', SINK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
