# GED — OCR, conversão, PDF/A e busca semântica próprios

> **Hospedagem revisada por decisão do usuário:** a aplicação e o processamento devem operar na Vercel, em `guarama.celeriflow.com.br`. O procedimento vigente está em `GED_VERCEL_PROCESSAMENTO_INTERNO.md`; a instalação permanente descrita abaixo foi substituída e não é dependência da entrega atual.

Data: 01/11/2026. Escopo aprovado: fase 10.1 e busca semântica interna da fase 10.2. E-mail continua preparado e pendente para o final; FTP/WebDAV e conclusão de LDAP/AD estão fora desta entrega.

## Estado da entrega

**Implementação e pacote de instalação preparados; instalação, ativação e homologação ainda pendentes.** Não confundir arquivos de implantação com serviços publicados. Nesta execução não foram rodados testes, lint, typecheck, build, migrações ou serviços. Os testes continuam na fase 11, conforme a sequência acordada.

O ambiente de desenvolvimento inspecionado não dispõe de Docker, LibreOffice nem veraPDF no PATH, e o Python encontrado é o alias da Windows Store. Ainda é necessário definir um host permanente e domínio dos serviços. Nenhum segredo de produção foi criado, alterado ou transferido automaticamente.

## Componentes entregues

| Componente | Implementação | Contrato |
|---|---|---|
| OCR português | `scripts/ged-ocr-engine.mjs`, `scripts/ged-ocr-server.mjs`, imagem em `services/ged-ocr/` | `POST /ocr`: PDF, PNG ou JPEG, páginas/zonas, texto e coordenadas normalizadas |
| Conversão Office/ODF/HTML | `scripts/ged-document-engine.mjs`, `scripts/ged-document-server.mjs`, imagem em `services/ged-documents/` | `POST /convert`: `{ filename, contentBase64, output: "pdf" }` → `{ pdfBase64 }` |
| Validação PDF/A | Mesmo serviço documental, com veraPDF 1.28.2 | `POST /pdfa`: `{ contentBase64 }` → `{ compliant, profile, report }` |
| Embeddings internos | `services/ged-semantic/server.py` e Dockerfile | `POST /embed`: `{ text }` → `{ model, vector }` |
| Worker contínuo | `scripts/ged-worker.mjs` e `services/ged-internal/Worker.Dockerfile` | Processamento, regras e alertas internos; não envia e-mail |
| Implantação | `services/ged-internal/compose.yaml` e `Caddyfile` | TLS automático, autenticação dos serviços, caches persistentes, healthchecks, reinício após falha e limites de recursos |
| Configuração | `npm run ged:configure -- <dominio> <email>` | Cria chaves aleatórias e arquivos locais exclusivos, sem sobrescrever configuração existente ou imprimir chaves |

Os serviços são utilizados pelo backend. Não oferecem navegação no acervo, consulta de documentos, FTP ou WebDAV. O acesso humano ao GED continua dentro da aplicação e sujeito às permissões existentes.

### Regras de processamento

- Original de até 20 MiB; PDF/OCR com até 200 páginas, respeitando os limites de pixels e tempo existentes. Trabalhos que excederem esses limites exigem divisão/reprocessamento.
- Conversão aceita DOC/DOCX, XLS/XLSX, PPT/PPTX/PPS/PPSX, ODT/ODS/ODP/ODF, RTF e HTML/HTM. A aplicação mantém seu próprio conjunto de formatos autorizados; o suporte adicional do conversor não muda o contrato de upload.
- Cada conversão usa diretório e perfil LibreOffice isolados, removidos ao terminar. Os originais não são sobrescritos.
- O pacote instala Writer, Calc, Impress e Math. Validação PDF/A usa o relatório real do veraPDF em XML bruto; erro de ferramenta não é tratado como aprovação. A validação não transforma automaticamente um PDF comum em PDF/A.
- Modelo padrão: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, revisão `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, CPU. O identificador retornado inclui revisão e versão da estratégia de fragmentação.
- A fragmentação semântica respeita o orçamento de tokens do modelo, com sobreposição. O cliente divide textos maiores que o limite HTTP e agrega vetores normalizados; não descarta silenciosamente o restante da página. Páginas sem texto não recebem vetor.
- Alterar modelo, revisão ou estratégia exige reindexar as versões existentes. Consultas continuam filtradas por modelo e autorização documental; a implantação do serviço não amplia permissões.
- Modelos e idioma são baixados inicialmente para os caches. O conteúdo documental é processado nos serviços próprios; não é enviado a uma API comercial de OCR/embeddings. A instalação inicial exige acesso aos repositórios de pacotes/modelos.
- OCR, conversão e semântica limitam processamento concorrente; sobrecarga retorna erro para retentativa. O worker preserva as filas e reservas existentes e encerra o pool de banco ao parar. Em `--once`, falha de ciclo produz código de saída diferente de zero.

## Instalação no host permanente

Referência inicial de capacidade: Linux com Docker Engine/Compose v2.24 ou superior, aproximadamente 4 vCPU, 12 GiB de RAM e 20 GiB livres. É uma estimativa inicial, não dimensionamento homologado para volume de produção. O host deve alcançar o banco Neon e o Blob do ambiente correto.

### 1. Configurar domínio e chaves

Apontar um domínio exclusivo dos serviços para o host e disponibilizar portas 80/443 para o gateway TLS. Informar domínio e endereço de contato reais:

```sh
npm run ged:configure -- ged-servicos.seu-dominio.gov.br administrador@seu-dominio.gov.br
```

O comando cria em `services/ged-internal/`:

- `.env`: domínio, contato TLS e quatro chaves aleatórias de 256 bits;
- `.env.application`: endpoints HTTPS e as mesmas chaves para configurar no ambiente da aplicação;
- `.env.worker`: campos vazios de `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN` e `CELERIFLOW_INSTANCE_ID`, a preencher com os valores do mesmo ambiente da aplicação.

Esses arquivos são ignorados pelo Git. O comando não modifica o `.env` da aplicação. Não regenerar chaves sobre uma instalação ativa; eventual rotação deve atualizar aplicação, worker e serviços de maneira coordenada.

### 2. Construir e iniciar os serviços

No host, a partir da raiz do repositório:

```sh
docker compose --project-directory services/ged-internal build
docker compose --project-directory services/ged-internal up -d
```

O worker é um perfil separado e ainda não inicia neste comando. O gateway aguarda a prontidão dos três serviços. OCR e modelo semântico podem demorar no primeiro download. As portas dos motores não são publicadas diretamente no host; os endpoints da aplicação passam por HTTPS e exigem as chaves respectivas.

### 3. Conectar a aplicação

Configurar no ambiente hospedado os oito valores de `.env.application`:

```dotenv
GED_OCR_ENDPOINT=https://ged-servicos.seu-dominio.gov.br/ocr
GED_OCR_API_KEY=<chave OCR>
GED_SEMANTIC_ENDPOINT=https://ged-servicos.seu-dominio.gov.br/embed
GED_SEMANTIC_API_KEY=<chave semantica>
GED_CONVERSION_ENDPOINT=https://ged-servicos.seu-dominio.gov.br/convert
GED_CONVERSION_API_KEY=<chave conversao>
GED_PDFA_ENDPOINT=https://ged-servicos.seu-dominio.gov.br/pdfa
GED_PDFA_API_KEY=<chave PDF-A>
```

As chaves ficam exclusivamente no servidor. Se a administração do GED tiver endpoints explícitos salvos, eles têm precedência sobre o ambiente: alinhar os valores ou deixá-los vazios para usar o fallback. O serviço semântico usa a rota `/embed`; não configurar apenas a raiz do host.

### 4. Ativar o worker após disponibilizar o schema

**Não iniciar consumo de filas antes de aplicar e verificar a migração GED no ambiente escolhido.** Essa verificação/aplicação integra a fase 11 e não foi feita nesta entrega. Depois da migração e do preenchimento de `.env.worker`:

```sh
docker compose --project-directory services/ged-internal --profile worker up -d --build worker
```

O worker precisa dos mesmos endpoints e chaves da aplicação; o Compose já os injeta. Banco, token Blob e identidade da instância são fornecidos por `.env.worker`. A aplicação e o worker devem apontar para o mesmo município/ambiente. Habilitar processamento automático, semântica e validação PDF/A nas configurações do GED conforme o escopo desejado.

### 5. Operação

```sh
docker compose --project-directory services/ged-internal --profile worker ps
docker compose --project-directory services/ged-internal --profile worker logs --tail 100 worker
docker compose --project-directory services/ged-internal logs --tail 100 ocr documents semantic gateway
docker compose --project-directory services/ged-internal --profile worker stop
```

Os logs operacionais do worker expõem contagens e mensagens genéricas, sem conteúdo ou credenciais. Os motores possuem `/health` para o healthcheck interno; o gateway não publica essa rota. `restart: unless-stopped` recupera processos encerrados, mas um estado `unhealthy` exige diagnóstico e não equivale a reinício automático. Não remover os volumes de cache/TLS em uma parada normal.

## Aceite reservado à fase 11

1. Construir as imagens e confirmar prontidão, permissões dos volumes, certificados e autenticação (ausente, incorreta e válida).
2. Executar o teste real existente `node --test tests/ged-ocr-server.test.mjs`; verificar imagem, PDF digitalizado, página e zona. Complementar com originais do acervo e precisão observada.
3. Converter cada formato autorizado com os arquivos preparados, incluindo DOC, XLS, PPS e ODF; verificar abertura, páginas, extração e preservação dos originais. Conferir também isolamento entre conversões e retomada após timeout.
4. Validar referências PDF/A pass/fail e PDF comum; comprovar que não conformidade não é confundida com indisponibilidade nem com conversão PDF/A.
5. Comparar buscas semânticas em português com sinônimos e documentos não relacionados; testar conteúdo relevante no fim de textos longos, estabilidade do identificador/dimensões, reindexação e indisponibilidade.
6. Aplicar o fluxo completo pelo GED: upload → fila → OCR/conversão → derivados → índice lexical/semântico → consulta autorizada e download, incluindo usuários de outro setor/grupo.
7. Validar worker contínuo, execução única, retentativas, concorrência, reinício e parada. Confirmar que alertas geram intenção de e-mail sem envio externo.
8. Rodar os checks de migração, tipos, lint, testes relevantes, build e regressão visual previstos no plano. As adequações de interface inventariadas em `GED_REVISAO_PADRAO_MODULOS.md` continuam pendentes.

## Dependências para ativação

Faltam: host permanente, domínio/DNS, contato TLS e configuração dos ambientes da aplicação/worker. A publicação só poderá ser declarada concluída após instalação e observação do serviço real. E-mail não bloqueia essa ativação; FTP/WebDAV e LDAP/AD não são dependências.
