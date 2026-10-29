# Drizzle — instalação, validação e operação

## Instalação e desenvolvimento

O CI usa Node 22. Instale o lock versionado com `npm ci` e configure as variáveis do ambiente sem versionar credenciais. O runtime usa `DATABASE_URL`, driver Neon WebSocket e pool reutilizado por processo. Importar funções puras não abre conexão; o primeiro uso do banco exige a configuração.

```powershell
npm ci
npm run dev
```

Não há geração de cliente de ORM na instalação. Os mapeamentos estão em `src/db/schema`, as consultas por domínio em `src/db/repositories` e os contratos independentes em `src/lib/contracts`.

## Validação centralizada

Durante edição, use lint/parse dirigidos e verifique consumidores de contratos exportados. Consolide as alterações antes da rodada pesada, com um único escritor por arquivo.

```powershell
npm run verify:database-migration
npm run db:migrate:verify
npm run typecheck:auxiliary
npm run test:unit
npm run build
npm audit --omit=dev --audit-level=high
```

`typecheck:auxiliary` cobre scripts/testes e segue seus imports reais, sem omitir erros. `build` gera os tipos de rotas, verifica integralmente as fontes de produção em partições sequenciais e compila o Next somente depois dessa aprovação. A opção do Next para pular tipos elimina apenas a checagem duplicada.

O manifesto e os diagnósticos auxiliares ficam em `.next/cache/auxiliary-typecheck`; os de produção, em `.next/cache/typecheck-partitions`. `--plan` somente inventaria, e `--partition N` é reteste dirigido, não aprovação integral.

O runner de testes seleciona arquivos rastreados e novos não ignorados em `tests`, `src/lib` e `scripts`, carrega `.env.local` e `.env` e aplica `TEST_DATABASE_URL` quando fornecida. Suítes com fixtures locais usam SQL histórico e driver Neon/Drizzle real. Concorrência de sessões externas deve usar o PostgreSQL local descartável configurado para os testes; skips precisam constar no resultado.

## Memória e rastreabilidade

O build limita heap a 4 GiB por processo. Para registrar medições em uma execução final, defina `CELERIFLOW_PROCESS_METRICS_DIR` para um diretório local e acrescente `--require ./scripts/lib/process-metrics.cjs` a `NODE_OPTIONS`. O preload é propagado aos processos Node filhos. Registra heap/RSS amostrados, maxRSS do SO, comando, versão Node, duração e código de saída; não registra variáveis de ambiente.

Compare builds frio/com cache na mesma máquina, registrando SHA e hashes das entradas. Heap e RSS são medidas distintas. Os máximos amostrados não são picos certificados de todas as alocações; uma execução interrompida ou OOM não aprova o build.

## Autoridade SQL

- Autoridade: `db/migration-authority.json` e executor `scripts/database-migrate.mjs`.
- Históricos: 156 arquivos preservados em `prisma/migrations-ibema`; o nome da pasta identifica a origem, não uma dependência da CLI Prisma.
- Futuras mudanças: `db/migrations/<AAAAMMDDhhmmss_nome>/migration.sql`, SQL explícito revisado e checksum dos bytes exatos.
- O executor conectado exige `DATABASE_MIGRATION_URL` explícita. A CLI não carrega `.env` nem escolhe automaticamente um destino.

```powershell
# Verificação offline: não confere o estado instalado.
npm run db:migrate:verify
# Plano somente leitura do destino explicitamente configurado.
npm run db:migrate:plan
# Aplicação de SQL pendente pela autoridade já inicializada.
npm run db:migrate:deploy
```

O banco existente já teve baseline auditada inicializada em 28/10/2026. A evidência está em `drizzle-inventory/audited-baseline-initialization.json`; não repetir essa inicialização. A migração clínica mantém `UNRESOLVED_HISTORICAL_DIFFERENCE`, e a adoção estrita continua bloqueada. Baseline autorizada não significa recuperação dos bytes originais.

`replay` é reservado a banco realmente vazio, com destino deliberado; cria a base pelo histórico e SQL futuro. Nunca usar replay na base existente. Build Vercel de produção executa somente `deploy`; Preview não inicializa autoridade nem aplica migrações.

## Homologação e publicação

Após o build, inicie o servidor com `CELERIFLOW_PUBLIC_BASE_URL=http://localhost:3309` e `npm run start -- --hostname localhost --port 3309`. Execute:

```powershell
node scripts/drizzle-final-homologation.mjs --origin=http://localhost:3309 --crud
```

O procedimento autentica a conta existente, confere sessão/auditoria, páginas de vinte domínios e CRUD temporário com cleanup. Seus pré-requisitos e limites estão em `drizzle-authenticated-homologation-progress.md`. Script preparado não equivale a homologação aprovada.

Publicação segue GitHub → Vercel com identidade Robonuvem-dev, build aprovado e verificação do SHA servido. Resultados de Preview/produção e recibos SQL devem corresponder à versão publicada.

## Recuperação

Evidência de restauração: `drizzle-inventory/recovery.json`. A captura de dados original fica fora do Git; os manifestos auditáveis são versionados. Preserve o ponto de recuperação e considere gravações e efeitos externos posteriores ao corte.

Para voltar o código, use commits normais de reversão. Isso não desfaz DDL ou dados. O executor mantém recibos e rollback transacional do lote ainda não confirmado; não oferece `down` automático. Em `OUTCOME_UNKNOWN`, confira os recibos em nova conexão antes de repetir uma aplicação. Não altere ledger ou checksums para forçar aprovação.
