"""Synthetic-only real-daemon smoke test; secret is read without logging."""
import io
import os
import time
import urllib.error
import urllib.request
from PIL import Image, PngImagePlugin

secret = os.environ['SCANNER_SECRET']
base = os.environ.get('SCANNER_URL', 'http://127.0.0.1:55580')


def request(path, data=None, token=secret):
    req = urllib.request.Request(base + path, data=data, headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'image/png'})
    try:
        with urllib.request.urlopen(req, timeout=90) as result:
            return result.status, result.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


assert request('/health')[0] == 200, 'Scanner/signatures not ready'
image = io.BytesIO()
metadata = PngImagePlugin.PngInfo()
metadata.add_text('private', 'synthetic-metadata')
Image.new('RGB', (512, 512), 'white').save(image, format='PNG', pnginfo=metadata)
clean = image.getvalue()
# Standard harmless antivirus test marker, never an executable or real malware.
eicar = b'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
for name, payload, expected in [('clean', clean, 200), ('eicar', eicar, 422), ('png-with-eicar', clean + eicar, 422), ('malformed', clean[:30], 422)]:
    start = time.monotonic()
    status, data = request('/scan', payload)
    assert status == expected, (name, status)
    if status == 200:
        assert b'synthetic-metadata' not in data
        with Image.open(io.BytesIO(data)) as decoded:
            assert decoded.size == (512, 512)
    print(f'{name}: {status}, {time.monotonic()-start:.3f}s')
assert request('/scan', clean, 'wrong')[0] == 401
print('wrong-token: 401')
