"""Private, bounded engineering-file scanner. Never handles identity verification."""
import hashlib
import io
import json
import multiprocessing
import resource
import os
import re
import struct
import sys
import time
import urllib.parse
import zipfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'onboarding-scanner'))
from scanner_base import Handler as BaseHandler, Server as BaseServer, Rejected, Unavailable, normalize
from pypdf import PdfReader

LIMIT = 50 * 1024 * 1024
MIMES = {'png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp','pdf':'application/pdf','txt':'text/plain','csv':'text/csv','zip':'application/zip','docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'}
CAD = {'step','stp','stl','iges','igs','dxf','dwg','kicad_pcb','kicad_sch','fcstd'}
ACTIVE = {'.exe','.dll','.com','.scr','.msi','.bat','.cmd','.ps1','.sh','.py','.js','.vbs','.html','.htm','.svg','.jar','.app','.lnk','.url','.macro','.fcmacro'}

def validate(data, name, mime, depth=0, budget=None):
    budget = budget if budget is not None else [0, 0]
    ext = Path(name).suffix.lower().lstrip('.')
    if ext not in MIMES and ext not in CAD or not data or len(data)>LIMIT or depth>3:
        raise Rejected()
    if mime not in (MIMES.get(ext,'application/octet-stream'),'application/octet-stream'):
        raise Rejected()
    if data.startswith((b'MZ',b'\x7fELF',b'#!')):
        raise Rejected()
    if ext in {'png','jpg','jpeg','webp'}:
        normalize(data,MIMES[ext])
    elif ext == 'pdf':
        try:
            pdf=PdfReader(io.BytesIO(data),strict=True)
            if pdf.is_encrypted or len(pdf.pages)>1000: raise Rejected()
            visited=set()
            def visit(obj,level=0):
                if level>50 or len(visited)>100000: raise Rejected()
                obj=obj.get_object() if hasattr(obj,'get_object') else obj
                if id(obj) in visited: return
                visited.add(id(obj))
                if isinstance(obj,dict):
                    if set(obj)&{'/JS','/JavaScript','/Launch','/EmbeddedFile','/EmbeddedFiles','/OpenAction','/AA','/RichMedia','/XFA','/SubmitForm','/ImportData'}: raise Rejected()
                    for value in obj.values(): visit(value,level+1)
                elif isinstance(obj,list):
                    for value in obj: visit(value,level+1)
            visit(pdf.trailer)
        except Rejected: raise
        except Exception as error: raise Rejected() from error
    elif ext in {'zip','docx','xlsx','pptx','fcstd'}:
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names=set()
                for info in archive.infolist():
                    if info.is_dir(): continue
                    budget[0]+=1; budget[1]+=info.file_size
                    path=Path(info.filename)
                    if budget[0]>200 or budget[1]>100*1024*1024 or info.file_size>LIMIT or info.file_size>max(1,info.compress_size)*100 or info.flag_bits&1 or path.is_absolute() or '..' in path.parts or '\\' in info.filename or (info.external_attr>>16)&0o170000==0o120000 or info.filename in names: raise Rejected()
                    names.add(info.filename)
                    suffix=path.suffix.lower()
                    if suffix in ACTIVE or 'vbaproject' in info.filename.lower() or '/embeddings/' in info.filename.lower(): raise Rejected()
                    content=archive.read(info)
                    if ext=='zip': validate(content,path.name,MIMES.get(suffix[1:],'application/octet-stream'),depth+1,budget)
                    elif suffix in {'.xml','.rels'}:
                        text=content.decode('utf-8')
                        if re.search(r'<!DOCTYPE|<!ENTITY|TargetMode\s*=\s*[\"\']External|<script',text,re.I): raise Rejected()
                    elif suffix in {'.png','.jpg','.jpeg','.webp'}: validate(content,path.name,MIMES[suffix[1:]],depth+1,budget)
                    elif ext=='fcstd' and suffix in {'.brp','.brep','.bin','.dat'}: pass
                    else: raise Rejected()
                required={'docx':'word/document.xml','xlsx':'xl/workbook.xml','pptx':'ppt/presentation.xml','fcstd':'Document.xml'}.get(ext)
                if required and required not in names: raise Rejected()
        except Rejected: raise
        except Exception as error: raise Rejected() from error
    elif ext=='dwg':
        if not re.match(rb'AC10[0-9]{2}',data): raise Rejected()
    elif ext=='stl' and len(data)>=84 and 84+50*struct.unpack('<I',data[80:84])[0]==len(data): pass
    else:
        try: text=data.decode('utf-8')
        except UnicodeError as error: raise Rejected() from error
        if '\0' in text or re.search(r'<\s*(html|script|iframe)|<!doctype\s+html',text,re.I): raise Rejected()
        if ext in {'step','stp'} and not text.lstrip().startswith('ISO-10303-21;'): raise Rejected()
        if ext=='stl' and not (text.lstrip().startswith('solid') and 'endsolid' in text): raise Rejected()
        if ext in {'igs','iges'} and not any(len(line)>=73 and line[72]=='S' for line in text.splitlines()): raise Rejected()
        if ext=='dxf' and 'SECTION' not in text: raise Rejected()
        if ext in {'kicad_pcb','kicad_sch'} and not text.lstrip().startswith('('+ext): raise Rejected()

def validation_worker(connection, data, name, mime):
    try:
        resource.setrlimit(resource.RLIMIT_AS,(512*1024*1024,512*1024*1024))
        resource.setrlimit(resource.RLIMIT_CPU,(15,15))
        validate(data,name,mime)
        connection.send(True)
    except Exception:
        connection.send(False)
    finally:
        connection.close()

def bounded_validate(data,name,mime):
    context=multiprocessing.get_context('fork')
    reader,writer=context.Pipe(duplex=False)
    process=context.Process(target=validation_worker,args=(writer,data,name,mime))
    process.start(); writer.close()
    try:
        if not reader.poll(20): raise Rejected()
        if not reader.recv(): raise Rejected()
    except EOFError as error: raise Rejected() from error
    finally:
        if process.is_alive(): process.terminate()
        process.join(); reader.close()

class Handler(BaseHandler):
    def do_POST(self):
        if not self.authorized(): return
        if self.path!='/scan': return self.error(404,'not_found')
        lengths=self.headers.get_all('Content-Length',[])
        if len(lengths)!=1 or not lengths[0].isdigit() or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding'): return self.error(411,'length_required')
        length=int(lengths[0])
        if not 0<length<=LIMIT: return self.error(413,'size_limit')
        if not self.server.scan_slots.acquire(blocking=False): return self.error(503,'busy')
        digest=None
        try:
            self.server.clamd.ready()
            deadline=time.monotonic()+20
            data=bytearray()
            while len(data)<length:
                remaining=deadline-time.monotonic()
                if remaining<=0: raise Unavailable()
                self.connection.settimeout(remaining)
                chunk=self.rfile.read1(min(65536,length-len(data)))
                if not chunk: raise Unavailable()
                data.extend(chunk)
            data=bytes(data)
            digest=hashlib.sha256(data).hexdigest()
            if self.headers.get('X-Content-SHA256')!=digest: return self.error(400,'digest_mismatch')
            name=urllib.parse.unquote(self.headers.get('X-File-Name',''))
            if len(name)>200 or any(ord(c)<32 or ord(c)==127 for c in name) or '/' in name or '\\' in name: raise Rejected()
            self.server.clamd.scan(data)
            bounded_validate(data,name,self.headers.get('Content-Type',''))
            self.respond(200,json.dumps({'sha256':digest,'status':'clean'}).encode())
        except Rejected:
            self.respond(200,json.dumps({'sha256':digest,'status':'rejected'}).encode())
        except (Unavailable,OSError): self.error(503,'scanner_unavailable')
        finally: self.server.scan_slots.release()

class Server(BaseServer):
    def __init__(self,address,secret,clamd=None):
        super().__init__(address,secret,clamd)
        self.RequestHandlerClass=Handler

if __name__=='__main__': Server(('0.0.0.0',8080),os.environ.get('SCANNER_SECRET','')).serve_forever()
