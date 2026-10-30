# Central de Assinaturas — lote backend central

## Entrega

- Schema Drizzle: `src/db/schema/signature-central.ts`.
- Repositório: `src/db/repositories/documents/central.ts`.
- Core: `src/lib/signatures/central-service.ts`.
- Evidência, senha, storage e retenção: `central-evidence.ts`, `central-password.ts`, `central-storage.ts`, `central-retention.ts`, no mesmo diretório.
- Helpers exclusivos: `central-error.ts`, `central-http.ts`, `central-rate-limit.ts`.
- SQL futuro: `db/migrations/20261029190000_signature_central/migration.sql`.
- APIs: `/api/assinatura-digital/assinar`, `/validar`, `/documentos/[id]`, `/comprovantes/[id]`, `/retencao`.
- Testes: `tests/signature-central-backend.test.ts`; configuração de tipos: `tests/tsconfig.signature-central.json`.

## Contratos de integração

Os seis métodos exigidos pelo contrato estão exportados com os DTOs originais e datas ISO: `listCentralSigners`, `saveCentralSigner`, `listCentralDocumentTypes`, `saveCentralDocumentType`, `searchCentralOrigins`, `listCentralSignatureRecords`.

Os serviços reafirmam view/create/update. Histórico, downloads e comprovantes restringem a leitura ao ator, à conta capturada do assinador ou ao administrador do sistema. Buscas retornam no máximo 20 candidatos; inventários e histórico não têm truncamento silencioso.

`AppContext.database` é respeitado nas leituras. Somente o contexto `{database: db}` permite selecionar automaticamente a conexão de produção, reconhecendo **por identidade a mesma Proxy `db` importada**. Banco injetado diferente dessa Proxy exige `databaseConnection`, e o `connection.db` deve ser exatamente o mesmo banco do contexto. Banco ausente, conexão ausente para banco injetado ou conexão incompatível são recusados antes de adquirir pool; não existe fallback global silencioso. A extensão é estrutural, sem editar o DTO compartilhado. As transações usam `withDatabaseTransaction` existente, com conexão dedicada do pool. O helper A1 recebe o executor transacional em `context.database`; sua transação aninhada usa savepoint nessa mesma conexão, comprovado no teste ponta a ponta.

APIs mantêm `{record}`/`{error}` e `CentralValidation`; falha técnica retorna HTTP503 com `{error}`, nunca `{valid:false}`. Comparação negativa de código+arquivo permanece inválida, sem procurar outro código. Evidência corrompida resulta inválida. Todas as respostas usam `Cache-Control: no-store`.

Erros inesperados nas transações são sanitizados porque as actions de cadastro exibem `Error.message`: SQL, parâmetros, hashes de senha e detalhes dos provedores não atravessam essa fronteira.

## Arquivos, criptografia e identidade

- Um arquivo por multipart, 3 MiB, limite real do stream além do `Content-Length`; campos duplicados rejeitados. O limite UI de 20 pertence ao executor UI.
- SHA-256 calculado nos bytes reais. Campos extras `url`/`hashSha256` não são prova nem fonte de leitura.
- Nome sanitizado; whitelist e cabeçalhos físicos PDF/JPEG/PNG/OLE; texto UTF-8 sem NUL; estrutura ZIP DOCX/ODT verificada, sem inflar o corpo do documento. ODT confere entrada `mimetype` limitada.
- Scrypt com salt aleatório por senha, parâmetros versionados e comparação timing-safe. Senha inicial obrigatória; atualização vazia preserva hash; listas retornam somente `hasPassword`.
- SERVIDOR exige vínculo RH ativo. CIDADAO com `personId` exige Person ativa e compatível. Nos dois casos, nome/cargo/documento/vínculo continuam vindo da fonte canônica, sem aceitar identidade substituída pelo client.
- CIDADAO também aceita cadastro **manual CPF ou CNPJ**, com `employeeId=null` e `personId=null`, sem exigir importação nem criar vínculos automaticamente. Nome de 2 a 200 caracteres, cargo de até 160, sem controles; CPF/CNPJ com dígitos verificadores; e-mail opcional válido até 254 caracteres; telefone/celular opcionais com caracteres telefônicos e 8 a 15 dígitos, até 40 caracteres. Dados são validados e preservados para o snapshot da assinatura.
- `accountUserId` é opcional e exige conta ativa com vínculo comprovável: mesmo Employee no SERVIDOR; no CIDADAO, Employee ativo da conta com mesmo CPF/CNPJ, ou Person canônica ativa com mesmo CPF/CNPJ e e-mail da conta. E-mail manual declarado pelo client, sozinho, **não** permite atribuir uma conta ativa arbitrária. Essa compatibilidade é reavaliada ao assinar.
- Validade, atividade, senha pessoal e eventuais vínculos são reavaliados ao assinar, inclusive para assinadores manuais.
- INTERNAL exige `SIGNATURE_CENTRAL_PRIVATE_KEY_PEM` estável; nenhuma chave é gerada automaticamente. Suporta RSA >=2048, EC e Ed25519, com snapshot SPKI e fingerprint SHA-256.
- `getCentralInternalConfigurationStatus()` exporta somente indicadores da configuração interna. A integração visual deve usar uma inspeção compatível com o algoritmo escolhido; se outro executor usar inspeção fixa `sign("sha256", ...)`, configurar RSA/EC ou reutilizar este helper para Ed25519.
- A1 usa `signCentralA1Envelope` do executor A1. A evidência contém cadeia e raiz públicas históricas. Verificação também reutiliza `assertCentralA1Owner` do helper A1 para comprovar o CPF/CNPJ do snapshot. Nenhum arquivo A1 ou crypto comum foi alterado por este lote.
- Envelope canônico inclui identidade/vínculos/validade capturados, ator, tipo, método/integração, hash/tamanho/nome/MIME, código, instante e prazo. Verificação confere assinatura, canonicalização, hash do envelope, snapshot e colunas do registro; upload de validação e download conferem hash real do arquivo.
- Não altera PDF nem afirma PAdES. Comprovante JSON é evidência destacada persistida no banco.

## Limites de tentativas HTTP

- `POST assinar` usa limiter **próprio da Central**, com **60 requisições/minuto por ator e 60 por assinador**: um lote normal de 20 e suas novas tentativas cabem no orçamento. Conta requisições bem-sucedidas e malsucedidas. Chave por ator antes de ler multipart; chave independente por assinador antes de chamar o serviço/scrypt. Trocar assinador não contorna o orçamento do ator; trocar ator não contorna o orçamento do assinador.
- Orçamento separado de **10 falhas de senha/minuto por assinador**. O core lança `CentralCredentialError` com código estruturado `CENTRAL_INVALID_PASSWORD`; somente essa classe registra falha, sem matching de mensagem. Na décima falha, responde 429; tentativas seguintes são bloqueadas antes do serviço/scrypt. Erros de arquivo, vínculo, permissão ou infraestrutura não contam como senha incorreta. Sucessos não consomem nem zeram o orçamento de falhas.
- `createCentralRateLimiter` aceita relógio injetável; usa janela fixa de 60.000 ms, expira com `now >= resetAt` e produz `Retry-After >= 1` enquanto bloqueado. Mapa limitado a 10.000 entradas, varredura oportunista de expirados, sem timers e sem expulsão de contadores ativos para abrir espaço. Ao atingir capacidade, novas chaves são recusadas até uma expiração, mantendo o teto de memória.
- `POST validar` continua reutilizando **sem alterações** `src/lib/platform/rate-limit.ts`: 10 tentativas/minuto por IP do primeiro `x-forwarded-for` válido (fallback compartilhado `unknown`), antes de ler multipart/hash/consulta. Assinatura/export do limiter compartilhado não foram alterados.
- Resposta HTTP429 com `{error}`, cabeçalho **`Retry-After` em segundos, mínimo 1**, e `Cache-Control: no-store`, disponíveis para consumo pela UI. Chaves namespaced e com identidade hasheada.
- Os contadores são locais à instância do processo; este lote não introduz infraestrutura externa de rate limiting nem alterações de UI. A retenção continua exatamente em 90 dias.

## Retenção e saga

- Blob sempre privado; namespace exclusivo `instances/<instanceId>/signature-central/<recordId>/original`. Banco armazena pathname próprio, sem URL pública/URL arbitrária.
- Prazo exatamente 90×24 horas desde a assinatura; endpoint de download aplica HTTP410 independentemente da execução do cron.
- Retenção exclui somente path do namespace próprio, preserva linha, hash e evidência. Falha de `del` mantém `storageDeletedAt` nulo e produz log apenas ID/código. Reexecução é idempotente.
- Antes de `put`, uma intenção PENDING é commitada com path determinístico e índice único `(actorId,requestId)`. Digest de requisição inclui arquivo e parâmetros; reutilização divergente dá HTTP409.
- A segunda transação bloqueia a intenção durante assinatura/upload/gravação. Retry concorrente retorna o mesmo registro e não repete upload concluído.
- Upload incerto ou falha SQL após upload deixam intenção durável: retry sobrescreve somente o mesmo path; worker limpa intenções abandonadas após 24h sem nova tentativa. Não há blob permanente sem referência de cleanup.
- Retry após limpeza rearma o marcador e o relógio da intenção **antes** de qualquer novo upload. Uma segunda falha não perde a referência de cleanup.
- Commit de resultado incerto não aciona compensação destrutiva: a linha durável decide entre retornar SIGNED ou retomar PENDING.
- `CRON_SECRET` obrigatório e comparação timing-safe. Principal deve conectar o cron diário no `vercel.json`.

## Verificações offline

Comandos exclusivos deste lote:

```sh
node --conditions=react-server --import tsx --test tests/signature-central-backend.test.ts
npx tsc --project tests/tsconfig.signature-central.json --noEmit
```

Resultado após revisão do lote de 20: **17/17 testes passaram**, **TypeScript direcionado sem erros** e **ESLint direcionado sem erros/avisos** nos arquivos TS alterados nesta revisão. Logs de falha de retenção e indisponibilidade durante os testes são falhas injetadas e verificadas, sem informações sensíveis.

17 testes reais: PGlite PostgreSQL usando o driver Neon/Drizzle e o helper transacional de produção, Blob fake isolado, chaves reais e cadeia A1 temporária. Cobrem senha/identidade/permissões, CPF/CNPJ, preservação de senha, 90 dias/410, mascaramento, código+arquivo divergente, múltiplos registros por hash, adulteração de prova/colunas/chave/cadeia, rotação/remoção de ENV preservando snapshots, upload incerto, trigger SQL falhando depois de put, concorrência, limpeza e nova falha após limpeza, ownership, limites/formato/multipart, constraints SQL e as cinco fronteiras HTTP.

Regressões acrescentadas na revisão: contexto normal `{database: db}` com `globalThis.celeriflowDatabase` apontando exclusivamente para pool fake/local sobre PGlite, com contagem de aquisição; banco injetado sem conexão e conexão divergente recusados sem aquisição global; cadastro manual CPF/CNPJ com assinatura INTERNAL e **A1 e-CNPJ real**; contatos inválidos, vínculo injetado, conta aleatória e e-mail manual sem comprovação recusados; cidadão importado preserva nome/cargo canônicos; alteração posterior de e-mail canônico da conta impede novas assinaturas; constraints aceitam cidadão sem Person e continuam recusando SERVIDOR sem RH, CIDADAO com Employee e kind desconhecido.

Regressões do limiter: **20 assinaturas reais via POST, com 20 requestIds e registros distintos, todas HTTP200 sem 429**; restante do orçamento exercitado com serviço instrumentado até a tentativa 60; tentativa 61 bloqueada sem chamada ao serviço, por ator e por assinador entre atores. Dez erros HTTP400 não contam como falhas de senha; nove senhas incorretas retornam403, a décima retorna429, e nova tentativa (inclusive senha correta) não chama o serviço enquanto bloqueado. Validação pública conserva 10/IP. Testes puros com relógio injetado verificam 59.999ms bloqueado com Retry-After1, 60.000ms permitido, janela independente de senha, teto do mapa, recuperação de entradas expiradas e ausência de expulsão de contadores ativos.

Migrações executadas somente no PGlite em memória. Sem build/typegen/npm ci, commit/push ou acesso ao banco/Blob reais.

## Pendências externas concretas

1. Principal: aplicar migrações futuras pelo fluxo normal; provisionar Blob privado, ENV estável de assinatura e `CRON_SECRET`; conectar cron e executar integração/build geral.
2. A1: manter os exports de `central-a1.ts` e `assertCentralA1Owner` de `central-a1-certificate.ts` usados na verificação histórica; testes centrais reutilizam a fixture isolada `tests/helpers/central-a1-certificates.ts` desse lote.
3. Validação com Blob real/Vercel e implantação de cron não foram executadas: são verificações de integração/deploy do principal, não substituídas pelos fakes offline.
