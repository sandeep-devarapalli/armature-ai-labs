# Runs an assignment's pytest files inside Pyodide. The worker writes every file into /work first.
# Returns JSON: [{test, outcome, seconds, message}] in the order pytest reports them.
import io, json, os, sys, importlib, contextlib, shutil

WORK = '/work'


def reset_work():
    # Leave /work first: the browser file system will not remove the current directory.
    os.chdir('/')
    if os.path.isdir(WORK):
        for entry in os.listdir(WORK):
            path = os.path.join(WORK, entry)
            shutil.rmtree(path) if os.path.isdir(path) and not os.path.islink(path) else os.remove(path)
    os.makedirs(WORK, exist_ok=True)
    for name in list(sys.modules):
        mod = sys.modules.get(name)
        path = getattr(mod, '__file__', None) or ''
        if path.startswith(WORK + '/') or name in ('conftest',):
            del sys.modules[name]
    importlib.invalidate_caches()


def run(test_files):
    import pytest
    results = []

    class Collector:
        def pytest_runtest_logreport(self, report):
            if report.when == 'call' or (report.when == 'setup' and report.outcome != 'passed'):
                message = ''
                if report.outcome != 'passed':
                    message = str(report.longrepr)[-3000:]
                    if report.capstdout:
                        message += '\n--- printed output ---\n' + report.capstdout[-1000:]
                results.append({'test': report.nodeid, 'outcome': report.outcome, 'seconds': round(report.duration, 2), 'message': message})

        def pytest_collectreport(self, report):
            if report.outcome == 'failed':
                results.append({'test': report.nodeid or 'collection', 'outcome': 'failed', 'seconds': 0, 'message': str(report.longrepr)[-3000:]})

    sys.dont_write_bytecode = True
    os.chdir(WORK)
    if WORK not in sys.path:
        sys.path.insert(0, WORK)
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        code = pytest.main(['-q', '-p', 'no:cacheprovider', '-p', 'no:faulthandler', '-o', 'console_output_style=classic', *test_files], plugins=[Collector()])
    if not results and int(code) not in (0, 5):
        results.append({'test': 'pytest', 'outcome': 'failed', 'seconds': 0, 'message': out.getvalue()[-3000:]})
    return json.dumps(results)
