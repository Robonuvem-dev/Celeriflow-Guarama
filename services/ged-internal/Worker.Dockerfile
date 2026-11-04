FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-dejavu-core ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY package.json package-lock.json ./
# tsx is currently a repository development dependency, required by this worker.
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ged-worker.mjs ./scripts/
USER node
ENV NODE_ENV=production
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/ged-worker.mjs"]
