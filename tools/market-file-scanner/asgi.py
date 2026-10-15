"""Bounded h2c gateway for Cloud Run's end-to-end HTTP/2 file transport."""
import asyncio
import hashlib
import hmac
import json
import os
import urllib.parse
from hypercorn.asyncio import serve
from hypercorn.config import Config
from scanner import LIMIT, bounded_validate, Rejected, Unavailable
from scanner_base import Clamd

secret=os.environ.get('SCANNER_SECRET','')
if not 32<=len(secret)<=256: raise RuntimeError('Invalid scanner configuration')
slot=asyncio.Semaphore(1)
clamd=Clamd()

def inspect(data,name,mime,expected):
    digest=hashlib.sha256(data).hexdigest()
    if expected!=digest: return 400,{'error':'digest_mismatch'}
    try:
        clamd.ready()
        if not name or len(name)>200 or any(ord(c)<32 or ord(c)==127 for c in name) or '/' in name or '\\' in name: raise Rejected()
        clamd.scan(data)
        bounded_validate(data,name,mime)
        return 200,{'sha256':digest,'status':'clean'}
    except Rejected: return 200,{'sha256':digest,'status':'rejected'}
    except (Unavailable,OSError): return 503,{'error':'scanner_unavailable'}

async def app(scope,receive,send):
    if scope['type']!='http': return
    async def reply(status,body):
        encoded=json.dumps(body).encode()
        await send({'type':'http.response.start','status':status,'headers':[(b'content-type',b'application/json'),(b'cache-control',b'no-store'),(b'x-content-type-options',b'nosniff')]})
        await send({'type':'http.response.body','body':encoded})
    headers={}
    for key,value in scope['headers']:
        if key in headers: return await reply(400,{'error':'duplicate_header'})
        headers[key]=value
    if not hmac.compare_digest(headers.get(b'authorization',b''),('Bearer '+secret).encode()): return await reply(401,{'error':'unauthorized'})
    if scope['path']=='/health' and scope['method']=='GET':
        try: await asyncio.to_thread(clamd.ready); return await reply(200,{'ready':True})
        except Unavailable: return await reply(503,{'ready':False})
    if scope['path']!='/scan' or scope['method']!='POST': return await reply(404,{'error':'not_found'})
    length=headers.get(b'content-length',b'')
    if not length.isdigit() or b'content-encoding' in headers: return await reply(411,{'error':'length_required'})
    if not 0<int(length)<=LIMIT: return await reply(413,{'error':'size_limit'})
    if slot.locked(): return await reply(503,{'error':'busy'})
    async with slot:
        try:
            data=bytearray()
            async with asyncio.timeout(105):
                while True:
                    event=await receive()
                    if event['type']=='http.disconnect': return
                    data.extend(event.get('body',b''))
                    if len(data)>int(length): return await reply(413,{'error':'size_limit'})
                    if not event.get('more_body',False): break
            if len(data)!=int(length): return await reply(400,{'error':'incomplete_body'})
            payload=bytes(data);del data
            status,body=await asyncio.to_thread(inspect,payload,urllib.parse.unquote(headers.get(b'x-file-name',b'').decode('ascii')),headers.get(b'content-type',b'').decode('ascii'),headers.get(b'x-content-sha256',b'').decode('ascii'))
            return await reply(status,body)
        except (TimeoutError,UnicodeError): return await reply(408,{'error':'invalid_or_timed_out_request'})

if __name__=='__main__':
    config=Config();config.bind=['0.0.0.0:8080'];config.workers=1
    config.h2_max_concurrent_streams=4;config.max_app_queue_size=1;config.read_timeout=110;config.keep_alive_timeout=5;config.accesslog=None
    asyncio.run(serve(app,config))
