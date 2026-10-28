# Revisão da migração Prisma → Drizzle

Data: 28/10/2026. Base Git: `3f05dcd`, com as alterações locais da migração presentes no início da revisão.

## Parecer

**A migração integral ainda não foi entregue.** A implementação atual mantém Prisma e Drizzle em coexistência. A parte revisada possui separação por domínio, DTOs independentes de ORM, consultas parametrizadas e testes de integração relevantes, mas isso não permite declarar a aplicação inteiramente migrada.

O próprio `MIGRACAO_DRIZZLE_STATUS.md` registra os lotes 4–10 pendentes e não declara nenhum lote funcional concluído. **O build integral passou nesta revisão, mas a suíte geral continua reprovada e há uma regressão confirmada no cenário de CI sem banco.** Portanto, não é possível afirmar que a troca foi concluída ou que todos os fluxos estejam homologados.

## Pendências confirmadas

### 1. Dependência extensa de Prisma

Contagem por AST dos arquivos atuais, incluindo imports de tipos:

| Pasta | Arquivos com import/reexport Prisma | Declarações de import/reexport | Chamadas `$transaction` |
|---|---:|---:|---:|
| `src` | 708 | 719 | 997 |
| `scripts` | 75 | 100 | 66 |
| `tests` | 72 | 102 | 229 |

A contagem inclui os arquivos de teste presentes dentro de `src` e os oráculos temporários que deliberadamente usam Prisma. Não representa percentual de funcionalidades migradas. Chamadores que recebem um cliente por parâmetro também podem depender de Prisma sem importá-lo diretamente.

Exemplos de dependências ativas: `src/lib/tributacao`, `src/lib/financeiro`, `src/lib/rh`, `src/lib/saude`, `src/lib/sst`, `src/lib/planejamento`, `src/lib/frotas`, `src/lib/obras`, portais, transparência e APIs.

`src/lib/platform/tenant-context.ts` ainda importa o cliente legado e exige `AppContext.prisma`. Portanto, migrar a consulta de uma página não elimina necessariamente sua dependência transitiva do Prisma.

### 2. Instalação, build e DDL continuam na trilha Prisma

- `package.json`: mantém `@prisma/client`, adaptadores, CLI Prisma e `postinstall: prisma generate`.
- `scripts/build.mjs`: executa `prisma generate`; em produção Vercel também executa `prisma migrate deploy`.
- `prisma.config.ts`: mantém `prisma/migrations-ibema` como trilha ativa.
- `drizzle.config.ts`: usa saída de introspecção em `.agent`, sem uma trilha Drizzle de produção adotada.

Essa coexistência preserva os consumidores ainda legados. A remoção das dependências antes de migrá-los quebraria a aplicação.

### 3. Duas divergências históricas de checksum

`node scripts/drizzle-verify-migration-history.mjs` retornou **exit 1**:

- 125 migrações idênticas;
- 29 diferenças restritas a CRLF/LF;
- 2 divergências reais: `20261011010000_add_sst_clinical_services` e `20261015220000_health_aih_apac_workflows`.

O verificador compara o snapshot capturado com o SQL local. O histórico Git desses dois arquivos remonta ao commit inicial `37064a7`; a pendência é anterior à implementação Drizzle. O resultado não comprova uma regressão funcional nova, mas a proveniência precisa ser reconciliada na adoção definitiva da trilha de migrações. Evidência: `docs/drizzle-inventory/migration-history.json`.

### 4. Cobertura do comando padrão de testes no estado local

`npm run test:unit` encontra somente arquivos já rastreados pelo Git, por meio de `scripts/group-a-tests.mjs`. No início desta revisão, os **12 arquivos `tests/drizzle-*.test.ts` estavam sem rastreamento** e nenhum era selecionado por esse comando.

Os 12 foram executados explicitamente nesta revisão. Uma entrega da migração precisa incluir esses arquivos e os demais arquivos novos referenciados pelo código.

### 5. Meta de memória ainda não comprovada

O build continua configurado com heap de 6.144 MiB e oito partições. As medições anteriores documentadas excedem a meta de 4 GiB. Uma checagem isolada ou incremental bem-sucedida não comprova que o objetivo global de memória foi atingido.

Neste build, o maior `Memory used` reportado pelo TypeScript foi **5.960.502 KiB**, na partição 8. Esse diagnóstico não é um pico certificado de heap V8, mas também não sustenta aprovação da meta de 4 GiB.

### 6. Regressão no ambiente da suíte geral: corrigida

A primeira execução de `npm run test:unit` encontrou vários arquivos que falhavam durante o import com `DATABASE_URL não configurada`, em `src/db/client.ts:10`. O novo cliente é inicializado ao importar serviços compartilhados; o runner carregava somente `.env.local`, inexistente neste ambiente, apesar de o projeto ter `.env` válido.

Correção aplicada em `scripts/run-group-a-tests.mjs`: acrescentado o carregamento de `.env`, preservando a prioridade de variáveis já fornecidas pelo processo e por `.env.local`. O redirecionamento para `TEST_DATABASE_URL`, quando configurado, continua sendo aplicado depois do carregamento.

Reteste explícito com o mesmo carregamento de ambiente aprovou os quatro testes de aquisição patrimonial e os três de acesso à administração, que dependem de imports compartilhados. A suíte contábil também executada nessa conferência teve três falhas por pré-condições da base disponível; elas continuam sendo registradas como falhas, sem desabilitar testes.

### 7. Regressão de import sem banco no CI: pendente

`src/db/client.ts:14` inicializa o cliente imediatamente. O import acrescentado em `src/lib/platform/tenant-context.ts:6` faz funções puras de autorização exigirem `DATABASE_URL`, mesmo quando não executam consultas.

Reprodução sem variáveis de banco, com `node --conditions=react-server --import tsx --test tests/system-administration-page-access.test.ts`: **exit 1**, antes da execução dos três testes. Uma comparação adicional executou o mesmo import e uma asserção de permissão usando a versão de `tenant-context.ts` de `HEAD`: **legado exit 0; versão atual exit 1**.

`.github/workflows/ci.yml` não configura banco/`DATABASE_URL`, e os arquivos `.env` são ignorados pelo Git. Portanto, acrescentar o carregamento de `.env` ao runner não resolve o cenário desse workflow. É necessário desacoplar os imports puros da inicialização do cliente ou provisionar explicitamente o ambiente de integração adequado no CI. Evidências: `.agent/drizzle-review-ci-without-db.log` e `.agent/drizzle-review-ci-regression-comparison.json`.

### 8. Suíte geral reprovada: pendências de ambiente, fixtures e legado

Após a correção do runner, não houve mais erro de `DATABASE_URL` ausente, mas o comando padrão ainda terminou com **91 falhas**. A classificação e a comparação com o legado estão detalhadas abaixo. Essas falhas não podem ser omitidas para declarar a entrega aprovada.

## Verificações desta revisão

### Testes direcionados: aprovados

23 arquivos executados sequencialmente, com `DRIZZLE_VERIFY_DATABASE=1`:

- os 12 arquivos `tests/drizzle-*.test.ts`;
- auditoria, listagem de Construção Civil, integridade canônica e notificações;
- carga municipal, identificadores de Saneamento e fornecedores;
- política de mesclagem PF, administração C3, configuração de instância e responsável de secretaria.

Resultado: **114 testes aprovados, zero falhas, zero ignorados**, em aproximadamente 145 segundos.

As verificações incluem rollback da gravação quando a auditoria falha, constraints reais, escopos de autorização, timestamps, decimal e JSON nulo, idempotência, mesclagem/reversão, timeout transacional e reserva concorrente de identificadores. A carga municipal foi executada em PGlite com o histórico SQL completo. As fixtures dos testes Neon são revertidas ou removidas pelos próprios testes, com conferência de ausência.

### Paridade de leitura com o legado: aprovada

| Verificador `scripts/drizzle-verify-*.ts` | Comparações aprovadas |
|---|---:|
| `administration` | 18 |
| `audit` | 35 |
| `construction-links` | 122 |
| `environment` | 23 |
| `master-data` | 93 |
| `notifications` | 24 |
| `person-merge` | 12 |
| `registry` | 86 |
| `sanitation` | 17 |
| `system-administration` | 66 |
| **Total** | **496** |

Adicionalmente, `drizzle-verify-bi.ts` aprovou **15 cenários**, comparando seis conjuntos de dados por cenário. Todos esses verificadores foram executados em modo somente leitura.

### Mapeamento e interfaces: aprovados

- `drizzle-verify-schema.ts`: **70 tabelas, 728 colunas e 74 FKs declaradas** compatíveis com o catálogo capturado.
- Conferência adicional somente leitura no **banco atual**: todas as **728 colunas das 70 tabelas mapeadas** existem e coincidem em tipo/nulabilidade; nenhuma coluna física dessas tabelas ficou ausente do mapeamento. Isso valida as tabelas atualmente mapeadas, não o restante do banco.
- `drizzle-verify-handoffs.mjs`: raízes JSX dos **56 arquivos TSX alterados** idênticas à base, normalizando apenas CRLF/LF.
- Nenhum import de Prisma/Drizzle/`@/db` foi encontrado em `src/lib/contracts`.
- ESLint dos arquivos TypeScript/JavaScript alterados e novos: **exit 0**.
- `tsc --project tsconfig.migration.json --noEmit`: **exit 0**, com cache incremental; 2.270 arquivos no grafo. Não é medição fria nem substitui o build integral.
- `git diff --check`: apontou uma linha vazia adicional no final de `src/lib/notifications/internal-notifications.ts`; ocorrência de formatação, sem efeito funcional identificado.

### Suíte geral e build integral

A primeira execução de `npm run test:unit`, iniciada antes da correção do runner, terminou com **365 aprovações, 138 falhas e três ignorados** (506 testes contabilizados, aproximadamente 11 min 11 s). Das falhas, 127 arquivos foram interrompidos no import e um teste com import dinâmico falhou pelo mesmo motivo: ausência de `DATABASE_URL` no processo. As dez falhas restantes ocorreram nos testes financeiros que exigem a base POC: dois/cinco usuários distintos, exercício e dotações específicas, contas ativas, natureza de receita e fontes.

**Build integral: aprovado, `npm run build` exit 0.**

- Geração Prisma: 73 s; geração de tipos de rotas: 2 s.
- Oito partições TypeScript estritas aprovadas: 1.337 s, cobrindo 2.602 fontes explicitamente particionadas e 937 validações de rotas; dependências importadas também foram verificadas normalmente.
- Next compilado e **95 páginas estáticas geradas**: 182 s.
- Tempo total aproximado: **26 min 34 s**, com caches existentes. Não é uma medição fria.
- A geração Prisma escreveu sua mensagem informativa no stderr; o PowerShell a registrou como `NativeCommandError`. O processo Prisma concluiu e todas as etapas posteriores passaram; isso não foi falha de build.

**Reexecução de `npm run test:unit`: exit 1, 820 testes contabilizados; 719 aprovados, 91 falhos, dez ignorados**, em aproximadamente **29 min 46 s**. Os 224 arquivos rastreados foram selecionados. O aumento de testes contabilizados ocorre porque os arquivos antes interrompidos no import passaram a executar seus testes internos.

| Grupo de falhas no reteste | Quantidade | Diagnóstico |
|---|---:|---|
| Fixtures de execução/Planejamento | 72 | Regras `isReference: true` são recusadas fora de `CELERIFLOW_ACCOUNTING_MODE=POC`, em `src/lib/planejamento/accounting-bridge.ts:39`. |
| Classificação contábil | 4 | Contas da fixture sem classificação municipal publicada, em `src/lib/financeiro/index.ts:2764`. |
| POC financeira conectada | 10 | Dados prévios exigidos ausentes, incluindo usuários, exercício, dotações, fontes e contas. |
| Taxas cemiteriais | 1 | A fixture esperava um lançamento, mas encontrou zero, em `tests/cemetery-fees-service.test.ts:85`. |
| Tributação da Construção Civil | 1 | Mock transacional sem `itbiDeclaration.count`, consumido por `generateTaxGuideInTransaction`. |
| RH | 1 | Fixture fornece CPF `00000000000`, recusado pelo validador. |
| MSC | 1 | Arquivo `docs/poc-p0/fontes/MSC_STN_2026_20260708.json` ausente, erro `ENOENT`. |
| Custos municipais | 1 | Conexão encerrada no teste isolado com Prisma/PGlite. |
| **Total** | **91** | |

Para verificar a origem, foi criado um worktree temporário de **`HEAD` (`3f05dcd`), anterior às alterações locais Drizzle**, usando as mesmas dependências instaladas. Sete arquivos representativos executaram **24 testes: 15 aprovações e nove falhas**. Foram reproduzidos no legado os erros de modo contábil, as duas falhas de classificação da amostra e cada uma das cinco falhas restantes de fixtures/arquivo/conexão. As fontes desses serviços e fixtures estão idênticas a `HEAD`. Essa comparação é representativa por causa de falha; não é uma execução completa da suíte antiga. O worktree foi removido após a conferência.

Uma conferência adicional da versão atual, **somente em fixtures isoladas** de `annual-rap-postings.test.ts` e `accounting-scope.test.ts`, com `CELERIFLOW_ACCOUNTING_MODE=POC` fornecido ao processo, aprovou **cinco testes, zero falhas**. A configuração do projeto não foi alterada. Esse resultado confirma a pré-condição dos exemplos, sem substituir o resultado reprovado do comando padrão nem aprovar os cenários ainda bloqueados.

Evidências: `.agent/drizzle-review-unit-retest.log`, `.agent/drizzle-review-failure-classification.json`, `.agent/drizzle-review-baseline-tests.log` e `.agent/drizzle-review-poc-mode-sample.log`.

### Smoke HTTP da versão compilada: aprovado

Servidor de produção iniciado a partir deste build, com domínio local coerente com `CELERIFLOW_PUBLIC_BASE_URL`: **dez verificações aprovadas**.

- Página de login: HTTP 200 e conteúdo esperado.
- Administração, Cadastros, Saneamento, Meio Ambiente e Configurações sem sessão: HTTP 307 para login, preservando `returnTo`.
- API de sessão com payload inválido: HTTP 400.
- API de interação de auditoria com payload inválido: HTTP 400; evento válido sem sessão: HTTP 401.
- Logout sem sessão: HTTP 200 e expiração do cookie.

O teste inicial com endereço de conexão `127.0.0.1` e outro hostname provocou um redirecionamento local por normalização do Next para `localhost`. Com servidor, Host e URL pública usando `localhost`, todas as verificações passaram. Isso não exigiu alteração de fonte da aplicação.

Evidência: `.agent/drizzle-review-http-smoke.json`. O servidor foi encerrado ao fim. Autenticação real com Firebase e percursos completos de CRUD pela interface ainda dependem de homologação autenticada.

## Avaliação técnica

Pontos positivos confirmados no código e nas verificações:

- repositórios explícitos por domínio, sem um adaptador genérico que simule a API Prisma;
- contratos de interface separados dos tipos de persistência;
- SQL parametrizado nos repositórios revisados;
- transações Drizzle em uma única conexão, com isolamento e timeouts explícitos;
- auditoria integrada à mesma transação nas operações testadas;
- tratamento explícito de IDs, precisão decimal, JSON nulo e atualização de timestamps;
- comparação com consultas legadas independentes e testes com PostgreSQL real/PGlite;
- preservação do JSX nos handoffs revisados.

**Conclusão:** boa base técnica para uma migração gradual, com paridade comprovada nos cenários cobertos e build integral aprovado. A coexistência atual ainda está distante do critério de migração integral do plano. Há uma regressão de import confirmada para o CI sem banco, e a suíte geral continua reprovada, com causas representativas também reproduzidas no legado. A aprovação da troca completa depende da cobertura residual, adoção da trilha de DDL, retirada efetiva de Prisma e homologação dos fluxos restantes.

## Ordem recomendada de conclusão

1. Resolver a inicialização no import e configurar uma suíte reproduzível no CI, com ambiente/fixtures explícitos e todos os arquivos novos incluídos na entrega.
2. Executar os cenários hoje bloqueados com a base apropriada e corrigir as inconsistências de fixtures/legado; manter o resultado integral como gate de aprovação.
3. Concluir os consumidores Prisma residuais por domínio, verificando todos os chamadores e limites transacionais.
4. Reconciliar os dois históricos SQL divergentes e adotar a trilha definitiva de DDL antes de retirar a infraestrutura Prisma.
5. Homologar login, autorização e CRUD autenticados e medir build frio/com cache contra a meta de memória.

## Alterações feitas nesta revisão

- Correção de uma linha no runner `scripts/run-group-a-tests.mjs`, para carregar `.env` após `.env.local`.
- Este relatório e a evidência regenerada em `docs/drizzle-inventory/migration-history.json`.
- Os dados POC ausentes não foram provisionados para forçar aprovação. As fixtures exercitadas pelos testes seguem a limpeza/rollback próprios das suítes.
- Nenhum commit, push ou deploy foi realizado.

## Evidências locais

Logs e manifests desta revisão estão em `.agent/drizzle-review-*`, incluindo testes direcionados, ESLint, comparações individuais, suíte geral, build e conferência do schema atual. Esses artefatos locais ficam fora do Git.

Antes da suíte geral foi registrada uma impressão SHA-256 de 3.049 arquivos de fontes, scripts, testes e configurações em `.agent/drizzle-review-source-sha.json`. Após a correção do runner e antes do build, o manifesto final foi salvo em `.agent/drizzle-review-source-final-sha.json`. **A conferência posterior ao build e ao reteste confirmou os mesmos 3.049 arquivos e o mesmo SHA-256 `b308deaa8dfff9b733e8b45b6a0d800029572f98cd9dc89571a2aaab29c68916`.** Evidência: `.agent/drizzle-review-source-after-validation.json`.
