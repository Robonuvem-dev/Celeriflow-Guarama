# Órfãos P1/plataforma — ferramentas Drizzle

## Estado em 28/10/2026

Os **sete scripts exclusivos** foram revisados individualmente e migrados. Não há imports/client/tipos/CLI/DMMF Prisma ativos nesses arquivos. A leitura de `_prisma_migrations` no diagnóstico de escopo é histórica, deliberada e somente SELECT.

As regras de `AGENTS.md`, a seção 8 do planejamento e os consumidores foram conferidos. Os scripts não tinham exports consumidos anteriormente; as novas APIs são chamadas pelas próprias CLIs e pela suíte específica. Nenhum contrato exportado compartilhado foi alterado nesta extensão.

## Matriz de contratos

| Arquivo | Implementação e comportamento |
|---|---|
| `scripts/import-poc-p1-cbo.ts` | SHA-256 e Windows-1252, cabeçalho, formato simples, mínimo de 2.000 entradas e unicidade preservados. ID da versão derivado do hash; entradas com cuid v1. Consulta parametrizada de `HealthCbo` só para candidatos/conflitos, sem modificar esse catálogo. Lock transacional por versão; revisão existente exige mesmo hash/status DRAFT/quantidade e mesmos código/kind/nome/canonicalId. Preview mantém o relatório; apply cria versão/entradas/auditoria atomicamente. |
| `scripts/import-poc-p1-cnae.ts` | Hash, contagem declarada, códigos/classe e unicidade preservados. Campos adicionais JSON da fonte continuam íntegros em `attributes.sourceRecord`, com contrato JSON validado, sem cast para tipos ORM. Lock por versão, ID pelo hash e mesmas recusas de de-para, incluindo `parentCode`. |
| `scripts/import-poc-p1-official-catalogs.ts` | Mantidos os três arquivos/abas, hashes, posições de cabeçalho/colunas, versões/datas, contagem mínima, regras de nível, fórmulas somente pelo resultado em cache, hierarquia e IDs determinísticos. Todas as fontes são verificadas antes de abrir conexão para apply; preview não exige banco. O lote inteiro de três versões e respectivas auditorias é transacional. Versão existente continua comparando **hash e quantidade**, preservando edições locais sem regravar entradas. |
| `scripts/prepare-poc-p1-identities.ts` | Mantidos os 21 contribuintes/IDs, CPF sintético determinístico e vínculos PF/fornecedor/credor. Exige usuário ativo para autoria inclusive no preview. Criação aditiva por ID não altera cadastros existentes (`update: {}` do legado). Cada cadeia tem sua própria transação; uma falha na cadeia seguinte não desfaz as anteriores já commitadas. |
| `scripts/verify-poc-p1-scope.ts` | SELECTs explícitos/parametrizados, lista fixa dos sete nomes históricos, mesmos cálculos de escopo/identidade/decimais e mesmas exigências exatas **2 entidades / 42 unidades / 12 exercícios / 18 instrumentos**. Nomes interpolados só vêm das listas fechadas e passam por `identifier()`. Mantidos envelope, conversão numérica, condição de saída e `--write-evidence`. |
| `scripts/verify-municipal-module-readiness.ts` | Somente SELECT; preservados todos os totais, filtro `ACCOUNTING_PROFILE` + `ATIVO`, prefixos CBO/CNAE e o ID exato do catálogo de contas `1.0d`, campos e flags de dependência operacional. |
| `scripts/publish-aurora-public-models.ts` | IDs estáveis por modelo/entidade/v1, dois Poderes, metadados/estágio `REFERENCIA`, fonte, PDF, Blob privado com sufixo e confirmação SHA-256 preservados. Preview apenas conta o que falta, sem render/upload. Publicação existente é reutilizada por ID, inclusive se retirada/revisada, sem sobrescrita. |

## Identidades e segredos

`prepare-poc-p1-identities.ts` **não cria contas Firebase/Auth**. Ele lê apenas o ID de um usuário ativo e escreve `Person`, `Taxpayer`, `Supplier`, `Creditor` e `FinancialAuditLog`. Nenhuma alteração de senha, Firebase UID, perfil, autorização ou RBAC foi introduzida. O relatório CLI mantém apenas modo/quantidade/sinalização fictícia; dados de conexão e variáveis de ambiente não são impressos.

O apply revalida o contribuinte sob lock de linha dentro da mesma transação e usa lock advisory por ID da cadeia para proteger a idempotência do marcador de auditoria. Colisão de documento ou fornecedor/credor inesperado continua abortando a cadeia, sem mesclagem automática. IDs de contribuintes, imóveis e inscrições não mudam.

## Persistência, locks e transações

Novo helper próprio: `scripts/lib/cross-domain-p1-catalogs.ts`.

- `firstActiveP1Actor(db)` mantém a seleção `ativo=true ORDER BY createdAt ASC LIMIT 1`.
- `insertP1DraftCatalog(tx, catalog, actorId, action, payload)` grava exclusivamente `PlanningCatalogVersion`, `PlanningCatalogEntry` e `FinancialAuditLog`, com schemas Drizzle e entradas em lotes de 300.
- As ações aceitas são explicitamente as três ações de importação. Não há emulador de delegates, acesso dinâmico ao ORM nem tradutor da API Prisma.
- Schemas Drizzle existentes fornecem cuid v1/defaults e o `publicKey` UUID da publicação. O seed de identidades usa SQL explícito com `updatedAt` nas criações, preservando o no-op nas entidades já existentes.
- CBO/CNAE: transação/lock de 120 s. Catálogos oficiais: transação/lock de 180 s para o lote. Identidades: 5 s por cadeia, como o timeout padrão anterior. Pools próprios mantêm aquisição de 2 s.
- O importador oficial também serializa por ID de versão antes de conferir/gravar. A publicação usa lock e transação de 120 s por ID, rechecando a existência antes do IO externo.

Na publicação, renderização/upload/leitura permanecem antes do INSERT confirmado. Rollback de PostgreSQL não é rollback de Blob; um upload já concluído pode permanecer sem publicação em caso de falha posterior, como no fluxo original. Não foi introduzida transação distribuída nem auditoria financeira nova para publicações que antes não a emitiam.

## Ledger legado e recibos SQL no diagnóstico P1

Quando existe `public._prisma_migrations`, o verificador continua lendo a tentativa mais recente de cada um dos sete nomes, com `finished_at`/`rolled_back_at` e a ordenação original.

Quando essa tabela não existe, uma base reconstruída pelo executor SQL pode ser diagnosticada pelos **recibos realmente executados**. O fallback exige os dois objetos da autoridade, marcador único/reconhecido (`format_version=1`, `celeriflow-explicit-sql-v1`, origem `replayed`) e recibos `executed` sem `legacy_row`. Uma base marcada `adopted` sem seu ledger preservado não é aprovada por esse fallback. Não há criação de ledger nem gravação de recibos no verificador.

O array de relatório mantém `{migration_name, finished, rolledBack}`; no replay vazio esses estados vêm dos recibos atômicos do novo executor. O diagnóstico segue sem homologar catálogos ou certificar aceite integral da P1.

## Fronteiras de importação e CLI

Os sete módulos são importáveis sem carregar `.env`, ler capturas, conectar ao banco ou executar a CLI. Essa atividade ocorre somente no `main()` guardado pelo caminho do script. Não há `await` de nível superior, mantendo compatibilidade com os testes TSX/CommonJS.

`AuroraModelFiles` é uma fronteira tipada de renderização/Blob para ensaio local. As consultas, constraints, locks e escritas do teste usam o driver Neon/Drizzle real; o teste não usa um ORM simulado. O caminho padrão da CLI mantém os mesmos serviços PDF/Blob privados.

## Testes preparados para o parent

`tests/drizzle-p1-platform-tools.test.ts` contém dois testes de fonte/parsing e uma integração com seis subtestes:

1. CBO: preview sem gravação, encoding/hash, candidatos/conflitos sem alterar `HealthCbo`, criação/replay, IDs/JSON e recusa de revisão local.
2. CNAE: JSON da fonte íntegro, texto com caracteres SQL tratado como valor, preview/replay e recusa de hierarquia divergente.
3. Oficiais: parsing de XLSX real em arquivo temporário, rich text/cache de fórmula, nível/hierarquia/hash/ano; rollback do lote quando a segunda versão diverge; ID determinístico e edição local mantidos; rollback de entradas/versão se a auditoria falha por FK.
4. Identidades: preview, CPF colidente, rollback por cadeia com commits anteriores preservados, reutilização sem alterar cadastro local, 21 vínculos/auditorias e snapshots integrais de `Usuario`/`ConfiguracaoPerfil` preservados.
5. Scope/readiness: transação PostgreSQL `READ ONLY`, lista dos sete recibos reais, ausência de ledger fabricado, fixture física com contagens exatas, recusa de 43ª unidade/recibo ausente e filtros de perfis/catálogos.
6. Publicações: preview sem IO, rejeição de bytes divergentes antes de gravar, PDF real e hash dos bytes, entidades/estágio/fonte/UUIDs, replay sem novo upload e publicação retirada preservada.

O teste de integração instala o histórico pelo executor SQL preservado usando conexão física real, no banco local isolado. **Não foi executado nesta frente.** Deve entrar na janela sequencial do parent:

```powershell
node --max-old-space-size=512 --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-p1-platform-tools.test.ts
```

A exceção autorizada para execução de PGlite durante este trabalho foi o conserto do bootstrap TEST, descrito em `docs/drizzle-cross-domain-tools-progress.md`: smoke aprovado e bootstrap completo **7/7 aprovado**. Essa evidência não aprova os testes P1 acima.

## Correção das fixtures após primeira execução central

O parent informou execução central agregada com **78 testes / 72 PASS / 6 FAIL**. Nesta suíte, três cenários falharam por duas causas de fixture:

- CBO puro/import real: o título de ensaio continha `;`, produzindo mais de duas colunas numa fonte cujo contrato é CSV simples. A fixture agora usa `Descrição oficial ' OR '1'='1' --`, sem delimitador embutido. Asserções verificam o texto exato no parser e na entrada persistida, além do snapshot Auth/RBAC integral após a importação. O parser e o importador de produção não foram alterados.
- Escopo/prontidão: as 42 UGs e a UG excedente não tinham `secretariatId`, que é fisicamente NOT NULL. A fixture cria uma `Secretariat` real por Poder e vincula cada `BudgetUnit`; a 43ª UG usa a secretaria executiva existente. Catálogo físico conferido; nenhum schema/DDL de produção foi alterado.

Checagens após a correção: ESLint do teste **exit 0** e parsing TypeScript **zero erros**. Nenhum teste PGlite foi executado nesta frente; o reteste permanece na janela central. CNAE, catálogos oficiais, identidades e publicações foram informados PASS pelo parent na primeira execução. Os números agregados acima não constituem aprovação desta suíte nem do projeto inteiro.

## Evidências leves e handoff

- ESLint dos sete scripts, helper próprio e teste específico: **exit 0**.
- Parsing sintático via `typescript.createSourceFile`, sem resolver imports ou checar tipos: **11 arquivos, zero erros** (os nove P1 mais fixture e smoke de bootstrap).
- Grep individual do escopo: somente as duas referências históricas a `_prisma_migrations`; sem dependência ativa Prisma/DMMF/CLI.
- Consumidores das novas APIs localizados: CLIs correspondentes, helper próprio e suíte específica.
- Pendente: reteste central da suíte P1 corrigida, checagem estrita de tipos e integração/build centralizados. Não há alteração de package, CI, tsconfig ou documentos globais nesta extensão.

As sete APIs e os testes estão preparados para o parent. Não declarar homologação de banco remoto ou migração integral com base somente no lint/parsing local.
