import datetime as dt
import http.client
import io
import threading
import unittest
from unittest.mock import Mock

from PIL import Image, PngImagePlugin
from scanner import Clamd, MAX_BYTES, Rejected, Server, Unavailable, normalize


def fixture(format='PNG', size=(32, 32)):
    out = io.BytesIO()
    image = Image.new('RGB', size, 'white')
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text('private', 'must disappear')
    image.save(out, format=format, pnginfo=metadata)
    return out.getvalue()


class ImageTests(unittest.TestCase):
    def test_png_and_jpeg(self):
        for format, mime in [('PNG', 'image/png'), ('JPEG', 'image/jpeg')]:
            with Image.open(io.BytesIO(normalize(fixture(format), mime))) as image:
                self.assertEqual(image.size, (32, 32))
                self.assertNotIn('private', image.info)

    def test_malformed_and_mismatched(self):
        for value, mime in [(b'notimage', 'image/png'), (fixture(), 'image/jpeg'), (fixture()[:30], 'image/png'), (fixture() + b'trailing', 'image/png'), (fixture('JPEG') + b'trailing', 'image/jpeg')]:
            with self.assertRaises(Rejected):
                normalize(value, mime)

    def test_dimensions(self):
        with self.assertRaises(Rejected):
            normalize(fixture(size=(8193, 1)), 'image/png')
        with self.assertRaises(Rejected):
            normalize(fixture(size=(4001, 4000)), 'image/png')

    def test_animation(self):
        out = io.BytesIO()
        Image.new('RGB', (8, 8), 'red').save(out, format='PNG', save_all=True, append_images=[Image.new('RGB', (8, 8), 'blue')])
        with self.assertRaises(Rejected):
            normalize(out.getvalue(), 'image/png')


class ClamdTests(unittest.TestCase):
    def test_verdicts(self):
        scanner = Clamd()
        scanner.exchange = Mock(return_value='stream: OK')
        scanner.scan(b'x')
        scanner.exchange.return_value = 'stream: Eicar-Test-Signature FOUND'
        with self.assertRaises(Rejected): scanner.scan(b'x')
        for verdict in ['stream: OK ERROR', 'stream: ERROR', 'something OK']:
            scanner.exchange.return_value = verdict
            with self.assertRaises(Unavailable): scanner.scan(b'x')

    def test_freshness(self):
        scanner = Clamd()
        for hours, works in [(1, True), (73, False), (-1, False)]:
            stamp = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=hours)).strftime('%a %b %d %H:%M:%S %Y')
            scanner.exchange = Mock(return_value='ClamAV 1.4.0/123/' + stamp)
            if works: scanner.ready()
            else:
                with self.assertRaises(Unavailable): scanner.ready()
        scanner.exchange.return_value = 'garbage'
        with self.assertRaises(Unavailable): scanner.ready()


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clamd = Mock()
        cls.server = Server(('127.0.0.1', 0), 'synthetic-test-secret-32-characters', cls.clamd)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.clamd.reset_mock(side_effect=True)

    def request(self, body=None, headers=None, method='POST', path='/scan'):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=3)
        connection.request(method, path, body, headers or {})
        response = connection.getresponse()
        value = (response.status, response.read())
        connection.close()
        return value

    def headers(self):
        return {'Authorization': 'Bearer synthetic-test-secret-32-characters', 'Content-Type': 'image/png'}

    def test_auth(self):
        self.assertEqual(self.request(fixture())[0], 401)
        self.clamd.scan.assert_not_called()

    def test_clean(self):
        data = fixture()
        status, normalized = self.request(data, self.headers())
        self.assertEqual(status, 200)
        self.assertEqual(self.clamd.scan.call_count, 2)
        self.assertEqual(self.clamd.scan.call_args_list[0].args[0], data)
        self.assertNotIn(b'must disappear', normalized)

    def test_unavailable_and_infected(self):
        self.clamd.ready.side_effect = Unavailable()
        self.assertEqual(self.request(fixture(), self.headers())[0], 503)
        self.clamd.ready.side_effect = None
        self.clamd.scan.side_effect = Rejected()
        self.assertEqual(self.request(fixture(), self.headers())[0], 422)

    def test_oversize(self):
        self.assertEqual(self.request(b'', self.headers() | {'Content-Length': str(MAX_BYTES + 1)})[0], 413)

    def test_busy(self):
        self.server.scan_slots.acquire()
        try: self.assertEqual(self.request(fixture(), self.headers())[0], 503)
        finally: self.server.scan_slots.release()

    def test_health(self):
        self.assertEqual(self.request(headers=self.headers(), method='GET', path='/health'), (200, b'{"ready":true}'))
        self.assertEqual(self.request(method='GET', path='/health')[0], 401)


if __name__ == '__main__':
    unittest.main()
