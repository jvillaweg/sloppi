FROM python:3.12-slim

RUN pip install --no-cache-dir fastapi httpx pytest anyio pytest-timeout

WORKDIR /sandbox

CMD ["pytest"]
