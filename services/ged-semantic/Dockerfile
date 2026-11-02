FROM python:3.11-slim-bookworm
RUN useradd --create-home --uid 1000 semantic \
    && mkdir -p /home/semantic/.cache/huggingface \
    && chown -R semantic:semantic /home/semantic/.cache
WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY server.py ./
USER semantic
ENV GED_SEMANTIC_HOST=0.0.0.0 GED_SEMANTIC_PORT=3311 \
    HF_HOME=/home/semantic/.cache/huggingface PYTHONUNBUFFERED=1 \
    HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1
EXPOSE 3311
CMD ["python", "server.py"]
