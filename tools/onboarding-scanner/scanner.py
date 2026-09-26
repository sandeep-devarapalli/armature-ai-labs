import datetime as dt
import hmac
import io
import json
import os
import socket
import struct
import threading
import time
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import Image, ImageOps

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 16_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)


class Rejected(Exception):
    pass


class Unavailable(Exception):
    pass


class Clamd:
    def __init__(self):
        self.host = os.environ.get('CLAMD_HOST', 'clamav')
        self.port = int(os.environ.get('CLAMD_PORT', '3310'))
        self.timeout = 20

    def exchange(self, command, data=None):
        deadline = time.monotonic() + self.timeout
        try:
            with socket.create_connection((self.host, self.port), timeout=self.timeout) as conn:
                def send(value):
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise Unavailable()
                    conn.settimeout(remaining)
                    conn.sendall(value)
                send(command)
                if data is not None:
                    for start in range(0, len(data), 65536):
                        chunk = data[start:start + 65536]
                        send(struct.pack('!I', len(chunk)) + chunk)
                    send(struct.pack('!I', 0))
                result = bytearray()
                while len(result) < 2048:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        raise Unavailable()
                    conn.settimeout(remaining)
                    chunk = conn.recv(2048 - len(result))
                    if not chunk:
                        break
                    result.extend(chunk)
                    if b'\0' in result:
                        return bytes(result).split(b'\0', 1)[0].decode('ascii')
        except (OSError, UnicodeError) as error:
            raise Unavailable() from error
        raise Unavailable()

    def ready(self):
        version = self.exchange(b'zVERSION\0')
        try:
            prefix, serial, stamp = version.split('/', 2)
            if not prefix.startswith('ClamAV ') or not serial.isdigit():
                raise ValueError()
            # The container runs UTC; clamd VERSION emits ctime in local time.
            updated = dt.datetime.strptime(stamp, '%a %b %d %H:%M:%S %Y').replace(tzinfo=dt.timezone.utc)
            age = (dt.datetime.now(dt.timezone.utc) - updated).total_seconds()
            if not -300 <= age <= 72 * 3600:
                raise ValueError()
        except ValueError as error:
            raise Unavailable() from error

    def scan(self, data):
        result = self.exchange(b'zINSTREAM\0', data)
        if result == 'stream: OK':
            return
        if result.startswith('stream: ') and result.endswith(' FOUND'):
            raise Rejected()
        raise Unavailable()


def normalize(data, content_type):
    expected = {'image/png': ('PNG', b'\x89PNG\r\n\x1a\n'), 'image/jpeg': ('JPEG', b'\xff\xd8\xff')}
    if content_type not in expected or not data.startswith(expected[content_type][1]):
        raise Rejected()
    if content_type == 'image/jpeg' and not data.endswith(b'\xff\xd9'):
        raise Rejected()
    if content_type == 'image/png':
        cursor = 8
        while cursor + 12 <= len(data):
            size = struct.unpack('!I', data[cursor:cursor + 4])[0]
            kind = data[cursor + 4:cursor + 8]
            cursor += size + 12
            if cursor > len(data):
                raise Rejected()
            if kind == b'IEND':
                if size != 0 or cursor != len(data):
                    raise Rejected()
                break
        else:
            raise Rejected()
    try:
        with Image.open(io.BytesIO(data)) as source:
            if source.format != expected[content_type][0] or getattr(source, 'n_frames', 1) != 1:
                raise Rejected()
            width, height = source.size
            if width < 1 or height < 1 or max(width, height) > 8192 or width * height > MAX_PIXELS:
                raise Rejected()
            source.verify()
        with Image.open(io.BytesIO(data)) as source:
            source.load()
            oriented = ImageOps.exif_transpose(source)
            # A fresh pixel-only image prevents metadata/exif/profile copying.
            mode = 'RGBA' if content_type == 'image/png' and ('A' in oriented.getbands() or 'transparency' in oriented.info) else 'RGB'
            converted = oriented.convert(mode)
            clean = Image.new(mode, converted.size)
            clean.paste(converted)
            output = io.BytesIO()
            clean.save(output, format=expected[content_type][0])
            normalized = output.getvalue()
            if len(normalized) > MAX_BYTES:
                raise Rejected()
            return normalized
    except (OSError, ValueError, SyntaxError, Image.DecompressionBombWarning, Image.DecompressionBombError) as error:
        raise Rejected() from error


class Handler(BaseHTTPRequestHandler):
    server_version = 'PrivateScanner'

    def log_message(self, *_args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def respond(self, status, body, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def error(self, status, code):
        self.respond(status, json.dumps({'error': code}).encode())

    def authorized(self):
        provided = self.headers.get_all('Authorization', [])
        if len(provided) != 1 or not hmac.compare_digest(provided[0].encode(), ('Bearer ' + self.server.secret).encode()):
            self.error(401, 'unauthorized')
            return False
        return True

    def do_GET(self):
        if not self.authorized():
            return
        if self.path != '/health':
            return self.error(404, 'not_found')
        try:
            self.server.clamd.ready()
            self.respond(200, b'{"ready":true}')
        except Unavailable:
            self.respond(503, b'{"ready":false}')

    def do_POST(self):
        if not self.authorized():
            return
        if self.path != '/scan':
            return self.error(404, 'not_found')
        lengths = self.headers.get_all('Content-Length', [])
        if len(lengths) != 1 or not lengths[0].isdigit() or self.headers.get('Transfer-Encoding') or self.headers.get('Content-Encoding'):
            return self.error(411, 'length_required')
        length = int(lengths[0])
        if not 0 < length <= MAX_BYTES:
            return self.error(413, 'size_limit')
        if not self.server.scan_slots.acquire(blocking=False):
            return self.error(503, 'busy')
        try:
            self.server.clamd.ready()
            deadline = time.monotonic() + 15
            chunks = bytearray()
            while len(chunks) < length:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise Unavailable()
                self.connection.settimeout(remaining)
                chunk = self.rfile.read1(min(65536, length - len(chunks)))
                if not chunk:
                    break
                chunks.extend(chunk)
            data = bytes(chunks)
            del chunks
            if len(data) != length:
                return self.error(400, 'incomplete_body')
            self.server.clamd.scan(data)
            content_type = self.headers.get('Content-Type', '')
            normalized = normalize(data, content_type)
            self.server.clamd.scan(normalized)
            self.respond(200, normalized, content_type)
        except Rejected:
            self.error(422, 'unsafe_or_invalid_image')
        except (Unavailable, OSError):
            self.error(503, 'scanner_unavailable')
        finally:
            self.server.scan_slots.release()


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address, secret, clamd=None):
        if len(secret) < 32:
            raise ValueError('SCANNER_SECRET must contain at least 32 characters')
        self.secret = secret
        self.clamd = clamd or Clamd()
        self.scan_slots = threading.BoundedSemaphore(1)
        self.connections = threading.BoundedSemaphore(8)
        super().__init__(address, Handler)

    def process_request(self, request, address):
        if not self.connections.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except Exception:
            self.connections.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.connections.release()

    def handle_error(self, request, client_address):
        pass


if __name__ == '__main__':
    Server(('0.0.0.0', 8080), os.environ.get('SCANNER_SECRET', '')).serve_forever()
