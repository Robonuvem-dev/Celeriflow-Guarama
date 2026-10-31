# OCR próprio — Tesseract

## Configuração local executada

- Motor real Tesseract.js 7, idioma `por`; PDF rasterizado por PDF.js e canvas nativo, sem depender de texto embutido.
- Endpoint local: `http://127.0.0.1:3310/ocr`, registrado em `.env.local` (ignorado pelo Git).
- Cache do modelo em `C:\Users\trici\AppData\Local\Temp\opencode\ged-ocr-cache` nesta máquina; nenhum documento é escrito nesse cache.
- `GET /health` informa prontidão, motor, idioma e ocupação.

Iniciar o serviço:

```powershell
npm run ged:ocr
```

O comando escuta somente loopback por padrão. Para exigir autenticação local, defina `GED_OCR_API_KEY` no ambiente do serviço e o mesmo valor em `.env.local` para o Next. O serviço não lê automaticamente o arquivo de configuração do Next.

Teste real do motor e HTTP:

```powershell
node --test tests/ged-ocr-server.test.mjs
```

O teste usa imagem sintética com os textos `PROTOCOLO MUNICIPAL 2026` e `PROCESSO 4321`, PDF digitalizado sem camada de texto e seleção isolada da região de processo. Confere texto, confiança, preservação do número da página e ausência do texto externo na zona. Também verifica autenticação, formato físico e regiões/páginas inválidas. Não usa respostas OCR simuladas.

## Operação e limites

- Recebe o contrato JSON documentado em `IMPLEMENTACAO_GED_ASSINATURA_DIGITAL.md`.
- PDF, PNG ou JPEG de até 20 MiB; até 200 páginas, rasterização a 144 dpi e limite de 16 megapixels por página.
- Uma operação por processo; concorrência recebe HTTP429 com `Retry-After`. Escalar por réplicas quando houver demanda.
- Reconhecimento limitado a 55 segundos; o worker é reinicializado após expiração. Dividir lotes/documentos grandes e repetir o job pela tela de processamento.
- Zonas são recortadas antes do reconhecimento, com coordenadas normalizadas. A confiança é informada de 0 a 1.
- Não registra bytes, textos reconhecidos, credenciais nem documentos em logs. O modelo do idioma é baixado na inicialização e reutilizado no cache.
- Não é um serviço agendado do Windows: o processo precisa estar em execução. O pacote contém também a imagem de serviço para um host permanente.

## Hospedagem permanente

Há um Dockerfile em `services/ged-ocr/Dockerfile`, com contexto na raiz do repositório:

```sh
docker build -f services/ged-ocr/Dockerfile -t celeriflow-ged-ocr .
docker run --restart unless-stopped -p 127.0.0.1:3310:3310 \
  --env GED_OCR_API_KEY --volume ged-ocr-cache:/service/ocr-cache \
  celeriflow-ged-ocr
```

Forneça `GED_OCR_API_KEY` como segredo do host, com pelo menos 32 caracteres. A imagem escuta em `0.0.0.0` e recusa iniciar sem essa chave. Publique `/ocr` atrás de proxy HTTPS com limite de corpo de 28,1 MB e timeout de pelo menos 65 segundos. Configure na aplicação publicada:

```dotenv
GED_OCR_ENDPOINT=https://<host-ocr>/ocr
GED_OCR_API_KEY=<mesmo-segredo-do-servico>
```

O proprietário escolheu **manter local por enquanto**. O endereço `127.0.0.1` desta estação não é acessível pela Vercel. A configuração local não ativa OCR no domínio público. A imagem de publicação fica preparada para a próxima etapa e não foi executada nesta máquina (Docker não instalado).

## Homologação de aplicação

Com o serviço OCR e o build de produção local em execução na porta3309:

```powershell
node --conditions=react-server --import tsx scripts/ged-homologation.mjs
```

O runner autentica a conta administrativa existente, mantém tokens/cookies em memória e usa Neon/Blob reais. Cria somente registros sintéticos identificados por `HML-GED-<UUID>`. Assinaturas são preservadas como evidência; não há remoção de documentos de negócio.

As etapas de Central usam o domínio já publicado para assinar com a chave estável protegida na Vercel. Nenhuma chave privada é copiada/gerada pelo runner. As demais operações usam o build local e o mesmo banco configurado.

O navegador Chromium local (Edge/Chrome) é controlado por Playwright Core; é possível informar outro executável em `GED_HML_BROWSER_EXECUTABLE`. Capturas e medições ficam em diretório temporário por execução, e o resultado sanitizado é gravado em `docs/GED_HOMOLOGACAO_RESULTADO.json`.
