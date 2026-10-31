FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && mkdir -p /service/ocr-cache && chown node:node /service/ocr-cache
COPY scripts/ged-ocr-engine.mjs scripts/ged-ocr-server.mjs ./scripts/
USER node
ENV GED_OCR_HOST=0.0.0.0 GED_OCR_PORT=3310 GED_OCR_CACHE_PATH=/service/ocr-cache
EXPOSE 3310
CMD ["node", "scripts/ged-ocr-server.mjs"]
