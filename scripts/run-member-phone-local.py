import json, subprocess, os, tempfile, base64, shutil
from pathlib import Path
root=str(Path(__file__).resolve().parents[1])
deno=os.environ.get('DENO_BIN') or shutil.which('deno')
if not deno: raise SystemExit('Set DENO_BIN to the local Deno executable')
name='supabase_auth_armature-membership-levels-check'; backup=name+'-otp-backup'
def run(args,**kw): return subprocess.run(args,check=True,**kw)
config=json.loads(subprocess.check_output(['docker','inspect',name]))[0]
status=json.loads(subprocess.check_output(['/opt/homebrew/bin/supabase','status','--workdir','/private/tmp/armature-membership-levels-check','--output','json'],stderr=subprocess.DEVNULL))
env=dict(v.split('=',1) for v in config['Config']['Env'])
secret='v1,whsec_'+base64.b64encode(b'local-synthetic-hook-secret-32-bytes').decode()
env.update(GOTRUE_EXTERNAL_PHONE_ENABLED='true',GOTRUE_SMS_AUTOCONFIRM='false',GOTRUE_SMS_MAX_FREQUENCY='60s',GOTRUE_SMS_OTP_EXP='300',GOTRUE_SMS_OTP_LENGTH='6',GOTRUE_HOOK_SEND_SMS_ENABLED='true',GOTRUE_HOOK_SEND_SMS_URI='http://host.docker.internal:59428',GOTRUE_HOOK_SEND_SMS_SECRETS=secret)
network=next(iter(config['NetworkSettings']['Networks']))
fd,path=tempfile.mkstemp(prefix='phone-local-',suffix='.env',dir='/private/tmp/armature-membership-levels-check')
with os.fdopen(fd,'w') as f:
 for k,v in env.items(): f.write(f'{k}={v}\n')
backup_created=False
if subprocess.run(['docker','inspect',backup],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
 raise SystemExit('Existing Auth backup found; restore it before retrying')
try:
 run(['docker','stop',name],stdout=subprocess.DEVNULL);run(['docker','rename',name,backup]); backup_created=True
 run(['docker','run','-d','--name',name,'--network',network,'--network-alias','auth','--env-file',path,config['Config']['Image'],'auth'],stdout=subprocess.DEVNULL)
 local=os.environ.copy();local.update(SUPABASE_URL='http://127.0.0.1:59421',SUPABASE_ANON_KEY=status['ANON_KEY'],SUPABASE_SERVICE_ROLE_KEY=status['SERVICE_ROLE_KEY'],MEMBER_PHONE_VERIFICATION_ENABLED='true',MEMBER_PHONE_HOOK_SECRET=secret,MSG91_AUTH_KEY='synthetic',MSG91_WHATSAPP_NUMBER='919000000000',MSG91_WHATSAPP_TEMPLATE='synthetic',MSG91_WHATSAPP_NAMESPACE='synthetic',MSG91_WHATSAPP_LANGUAGE='en',MSG91_SMS_TEMPLATE='synthetic',MSG91_SMS_OTP_VARIABLE='OTP')
 run([deno,'run','--no-config','--no-lock','--allow-env','--allow-net=127.0.0.1:59421,0.0.0.0:59428','--allow-run=docker',root+'/scripts/test-member-phone-local.ts'],cwd=root,env=local)
finally:
 if backup_created:
  subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  subprocess.run(['docker','rename',backup,name],check=True)
  subprocess.run(['docker','start',name],check=True,stdout=subprocess.DEVNULL)
 Path(path).unlink(missing_ok=True)
