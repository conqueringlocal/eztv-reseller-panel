#!/usr/bin/env python3
"""Prepare restricted Mailbux connectivity; never activate mail channels."""
import os
from pathlib import Path
import shutil
import subprocess

ROOT = Path(os.environ.get('EZTV_SUPPORT_DIR', '/opt/eztv-support-pilot'))
SOURCE = Path(__file__).resolve().parent
os.umask(0o077)
env = ROOT / '.env'
original = env.read_text()
if 'COMPOSE_PROJECT_NAME=eztv-support-pilot' not in original.splitlines():
    raise SystemExit('Expected private support pilot configuration.')
for name in ('mail-gateway.yml', 'mail-gateway.cfg'):
    shutil.copyfile(SOURCE / name, ROOT / 'local' / name)
# The config contains no credentials; HAProxy runs as a non-root user.
(ROOT / 'local/mail-gateway.cfg').chmod(0o644)
lines = original.splitlines()
compose = [i for i, line in enumerate(lines) if line.startswith('COMPOSE_FILE=')]
if len(compose) != 1:
    raise SystemExit('Expected one COMPOSE_FILE definition.')
if ':local/mail-gateway.yml' not in lines[compose[0]]:
    lines[compose[0]] += ':local/mail-gateway.yml'
env.write_text('\n'.join(lines) + '\n')
try:
    subprocess.run(['docker', 'compose', 'config', '--quiet'], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except subprocess.CalledProcessError:
    env.write_text(original)
    raise SystemExit('Compose validation failed; original environment restored.')
print('Gateway prepared. Start mail-gateway, then run check-container-mail.py. No channel activated or mail sent.')
