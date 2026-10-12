#!/usr/bin/env python3
"""Verify the external-test sender against Mailpit with no external recipients."""
import os
from pathlib import Path
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
SINK = 'eztv-support-mail-sink'
IMAGE = 'axllent/mailpit@sha256:ed9b00c609e77e99c79b93f1178255ebc271868920f2c69a8d166bd5634ed10d'
os.umask(0o077)
def dc(*args):
    return subprocess.run(['docker', 'compose', *args], cwd=ROOT, capture_output=True, check=True)

subprocess.run(['docker', 'run', '-d', '--name', SINK, '--network', 'eztv-support-pilot_default',
                '--network-alias', SINK, '--memory', '128m', '--cpus', '0.25',
                '--label', 'eztv.disposable-test=true', IMAGE], check=True, stdout=subprocess.DEVNULL)
try:
    for source, target in [('send-approved-test.rb', 'eztv-approved-test.rb'), ('test-approved-delivery.rb', 'eztv-test-approved.rb')]:
        dc('cp', str(SOURCE / source), 'zammad-railsserver:/tmp/' + target)
    result = dc('exec', '-T', '-e', 'EZTV_SUPPORT_PILOT=true', 'zammad-railsserver',
                'bundle', 'exec', 'rails', 'runner', '/tmp/eztv-test-approved.rb')
    passed = [line for line in result.stdout.decode().splitlines() if line.startswith('PASS ')]
    assert passed
    (ROOT / 'local/approved-delivery-sink-result.txt').write_text('\n'.join(passed) + '\n')
    for line in passed:
        print(line)
except Exception as error:
    # No live credentials are input to this process; retain diagnostics privately.
    raw = (getattr(error, 'stdout', None) or b'') + (getattr(error, 'stderr', None) or b'')
    (ROOT / 'local/approved-delivery-sink-error.log').write_bytes(raw)
    raise SystemExit('Local send-procedure test failed; diagnostics retained privately.')
finally:
    dc('exec', '-T', '--user', 'root', 'zammad-railsserver', 'rm', '-f', '/tmp/eztv-approved-test.rb', '/tmp/eztv-test-approved.rb')
    subprocess.run(['docker', 'rm', '-fv', SINK], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
