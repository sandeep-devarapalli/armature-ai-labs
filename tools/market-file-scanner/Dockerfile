FROM python:3.13-slim
WORKDIR /app
COPY tools/onboarding-scanner/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt pypdf==6.20.1 hypercorn==0.18.0
COPY tools/onboarding-scanner/scanner.py /app/scanner_base.py
COPY tools/market-file-scanner/scanner.py /app/scanner.py
COPY tools/market-file-scanner/asgi.py /app/asgi.py
USER 65534:65534
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=UTC
CMD ["python", "asgi.py"]
