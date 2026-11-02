FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-math default-jre-headless \
    fonts-dejavu-core fonts-liberation curl unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY services/ged-documents/auto-install.xml /tmp/auto-install.xml
RUN curl --fail --location --retry 3 https://software.verapdf.org/releases/1.28/verapdf-greenfield-1.28.2-installer.zip -o /tmp/verapdf.zip \
    && echo "d1693a5f0bf0997180f6d97e8a5568b0cf39e27eee338d439c8adb58435c1e89  /tmp/verapdf.zip" | sha256sum -c - \
    && mkdir /tmp/verapdf-installer && unzip -q /tmp/verapdf.zip -d /tmp/verapdf-installer \
    && find /tmp/verapdf-installer -name 'verapdf-izpack-installer-*.jar' -exec java -jar {} /tmp/auto-install.xml \; \
    && test -x /opt/verapdf/verapdf && ln -s /opt/verapdf/verapdf /usr/local/bin/verapdf \
    && rm -rf /tmp/verapdf.zip /tmp/verapdf-installer /tmp/auto-install.xml
WORKDIR /service
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY scripts/ged-document-engine.mjs scripts/ged-document-server.mjs ./scripts/
USER node
ENV GED_DOCUMENT_HOST=0.0.0.0 GED_DOCUMENT_PORT=3312
EXPOSE 3312
CMD ["node", "scripts/ged-document-server.mjs"]
