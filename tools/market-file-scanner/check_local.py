"""Synthetic real HTTP plus ClamAV checks. Never reads user documents."""
import hashlib
import io
import json
import secrets
import threading
import time
import urllib.request
import zipfile
from scanner import Server
secret=secrets.token_hex(32)
server=Server(('127.0.0.1',0),secret)
threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
def scan(data,name,mime='application/octet-stream'):
    request=urllib.request.Request(base+'/scan',data=data,headers={'Authorization':'Bearer '+secret,'Content-Type':mime,'X-File-Name':name,'X-Content-SHA256':hashlib.sha256(data).hexdigest()})
    with urllib.request.urlopen(request,timeout=90) as response: return json.load(response)
try:
    server.clamd.ready()
    cases=[(b'ISO-10303-21;\nEND-ISO-10303-21;','part.step','clean'),(b'hello engineer','notes.txt','clean'),(b'<html>active</html>','notes.txt','rejected'),(b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*','eicar.txt','rejected')]
    archive=io.BytesIO()
    with zipfile.ZipFile(archive,'w') as z:z.writestr('run.sh',b'#!/bin/sh\necho unsafe')
    cases.append((archive.getvalue(),'unsafe.zip','rejected'))
    durations=[]
    for data,name,expected in cases:
        start=time.monotonic();result=scan(data,name);durations.append(round(time.monotonic()-start,3));assert result=={'sha256':hashlib.sha256(data).hexdigest(),'status':expected},(name,result)
    data=b'engineering measurements\n'*(6*1024*1024//25)
    start=time.monotonic();assert scan(data,'large.txt')['status']=='clean';durations.append(round(time.monotonic()-start,3))
    maximum=b'engineering data\n'*(50*1024*1024//17)+b'x'*(50*1024*1024%17)
    assert len(maximum)==50*1024*1024
    start=time.monotonic();assert scan(maximum,'maximum.txt')['status']=='clean';durations.append(round(time.monotonic()-start,3))
    print(json.dumps({'checks':len(cases)+2,'passed':True,'antivirus':'real local ClamAV with freshness check','large_bytes':len(data),'durations_seconds':durations}))
finally:server.shutdown();server.server_close()
