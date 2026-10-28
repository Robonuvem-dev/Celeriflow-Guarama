# Migração Drizzle — contratos e handoffs

## Regras de integração

- Consultar todos os consumidores antes de alterar função exportada.
- Actions aguardadas pela UI preservam objetos de sucesso/erro; actions de formulário preservam `Promise<void>`.
- Repositórios retornam DTOs explícitos, sem tipos ORM na UI.
- Cada transação intermodular migra inteira, em uma conexão; não combinar uma transação Prisma com outra Drizzle.
- IDs existentes, nomes físicos e tipos SQL permanecem os mesmos.
- As APIs de decimal, geração de IDs, JSON nulo e atualização de timestamps terão testes de compatibilidade antes de seu uso pelos módulos.

## Handoffs de páginas

Base visual analisada: `4476c3e`. Conferência posterior de `origin/main` em `3f05dcd` alterava somente documentação. O JSX das oito páginas abaixo foi comparado por AST com a base e permaneceu idêntico (desconsiderados CRLF/LF).

| Página em `src/app/app-domain/saneamento/` | Consulta extraída em `src/db/repositories/sanitation/queries.ts` | Contrato |
|---|---|---|
| `page.tsx` | `getSanitationTotals` | Três totais numéricos originais |
| `unidades/page.tsx` | `listConsumerUnits` | Mesmas nove propriedades; filtros e paginação de 20 |
| `leituras/page.tsx` | `listMeterReadings` | Registro completo e `unit.code`; competência atual definida na página |
| `faturas/page.tsx` | `listInvoices` | Mesmas sete propriedades; `dueDate` serializado na página |
| `servicos/page.tsx` | `listServiceOrders` | Registro completo e unidade opcional |
| `qualidade/page.tsx` | `listWaterQualityAnalyses` | Mesmas oito propriedades; data serializada na página |
| `portal/page.tsx` | `listPortalRequests` | Mesmas sete propriedades; data serializada na página |
| `relatorios/page.tsx` | `listSavedReports` | Mesmas seis propriedades |

Os DTOs estão em `src/lib/contracts/sanitation.ts`. As alterações nas páginas se limitam a imports e consultas; os componentes client continuam consumindo os mesmos formatos.

### Administração, Meio Ambiente e núcleo de Cadastros

Conferência ampliada com `scripts/drizzle-verify-handoffs.mjs`: **55 arquivos TSX alterados** com raízes JSX textualmente iguais a `3f05dcd` por AST (somente CRLF/LF normalizados), incluindo a página genérica de catálogos, páginas intermodulares, mesclagem, auditoria, notificações, configurações e formulário da instituição.

- Onze páginas de Administração: instituição, secretarias, departamentos, cargos, servidores, unidades, calendário e formulários de seleção usam `repositories/administration/queries.ts`. Criações/edições e auditoria permanecem na mesma transação Drizzle. DTOs em `contracts/administration.ts`.
- Dez páginas de Meio Ambiente: painel e nove listagens usam `repositories/environment/queries.ts`. Paginação/busca local, filtros, estados, revalidações e retornos das actions foram preservados. `generateEnvironmentalLicense` recebe `DatabaseExecutor`; seu consumidor de produção e testes foram conferidos. DTO da listagem de emissões mantém todas as propriedades do registro anterior.
- Oito páginas de Cadastros: PF, PJ, fornecedores e novo fornecedor, documentos e novo documento, imóveis e novo imóvel usam `repositories/registry`. Retornos completos, relações opcionais, datas e nulos comparados ao legado.
- `getSupplierList` e `getSupplierReportRows` recebem `DatabaseExecutor`; página e endpoint CSV adaptados. `buildSupplierWhere` retorna SQL parametrizado e seu único consumidor direto adicional, o teste de suporte, foi adaptado. Projeções e serialização para a UI/CSV permanecem iguais; evidências de documentos são carregadas em lote, sem N+1.
- Actions de criação de PF/PJ/fornecedor e actions internas de formulário continuam `Promise<void>`; actions de edição de fornecedor mantêm `{ error?: string }`. Demais actions de Cadastros mantêm o retorno do registro.
- O histórico imobiliário de Cadastros define `celeriflow.cadastral_actor` na mesma conexão/transação da gravação; os triggers continuam responsáveis por versões e proteção. Helpers Prisma de Tributação permanecem temporariamente para seus consumidores ainda não migrados.
- `master-data-page.tsx` usa `loadMasterDataPage` para os 14 catálogos: paginação de 20, DTO de linhas, colunas, campos, opções e ordenações conferidos com o trecho original por AST. Dashboard, organograma e qualidade usam `registry/overview.ts`; seus DTOs completos também foram comparados.
- `master-data-actions.ts` mantém `{ error?: string }`, autorização/revalidação e auditoria atômica, incluindo famílias, moeda padrão e versões jurídicas. A reconciliação preserva `reconcileCanonicalIdentity(context, raw)` e o retorno `{ error?: string }` de sua action; locks, idempotência, validação e log financeiro usam uma conexão Drizzle.
- `listConstructionPropertyUpdates` recebe `DatabaseExecutor`. Os dois consumidores de produção (Cadastros/imóveis e Obras/vistorias) e o teste PostgreSQL foram adaptados; filtros puros são reexportados do caminho anterior. DTO explícito mantém registro completo e conclusão `{ number, kind }`; escopo é aplicado antes da contagem/paginação. `resolveConstructionAccess(context)` mantém assinatura e passa a consultar papéis vigentes via Drizzle.

## Plataforma e serviços

- `AppContext.user` mantém a estrutura original por meio de `PermissionUser`, em `src/lib/contracts/identity.ts`.
- `AppContext.prisma` permanece temporariamente para consumidores não migrados; o campo opcional `database` permite usar Drizzle sem invalidar fixtures/contextos existentes. Contextos reais fornecem ambos durante a coexistência.
- Funções de autorização exportadas e `AccessError` mantêm nomes e assinaturas. `AccessError` foi extraída para arquivo independente e reexportada no caminho anterior.
- Resolução de identidade e ativação de módulos usam os repositórios Drizzle; reparação técnica do administrador conserva seus upserts, chave de conflito e valores anteriores.
- `getAdministrationBi(context, selection)` preserva assinatura e DTO, passando a consumir `loadAdministrationBiSource`. Ambos os consumidores (página e endpoint de exportação) foram localizados antes da alteração.
- `processWaterReadingAndBill` passa a receber `DatabaseExecutor`; seu único consumidor de produção, `leituras/leituras-actions.ts`, foi localizado e adaptado. Retorno e cálculo progressivo preservados com decimal independente.
- Actions de Saneamento e `searchConsumerUnits` preservam parâmetros, retornos de sucesso/erro, autorização e revalidações.
- `writeAuditEvent` legado permanece usando a transação recebida. `insertAuditEvent` é o repositório novo; não grava pela conexão global quando chamado dentro de uma transação.
- Mesclagem PF: assinaturas dos serviços agora recebem `DatabaseConnection` (mutações) ou `DatabaseExecutor` (candidatos). Todos os consumidores encontrados nas quatro actions foram adaptados; retornos `{ success: true } | { error: string }` e campos da página preservados. Execução/reversão continuam serializáveis; proposta, ledger e auditoria são gravados atomicamente.
- `readCanonicalIdentityIssues` recebe `DatabaseExecutor`; script operacional e teste de integridade adaptados. O oráculo temporário usa a implementação original do Git para evitar comparar o leitor novo consigo mesmo.
- Auditoria: `buildAuditEventWhere`/`buildAuditEventPageQuery` retornam filtros/ordenação SQL parametrizados; todos os consumidores localizados foram adaptados. `getAuditEventPage` recebe `DatabaseExecutor` e devolve `AuditEventPage` explícito com ator/perfil. Duas páginas preservam JSX, contagens e agrupamentos. APIs de sessão/interação preservam respostas, autenticação e cookies, substituindo somente a escrita da evidência.
- Notificações: listagem/contagem recebem `DatabaseExecutor`; reconhecimento recebe `DatabaseTransaction`. Duas páginas e duas actions foram adaptadas, mantendo `{ error: string | null }` e revalidações. Resolução dos links reautoriza Processos antes de aplicar o mesmo escopo de setor atual ou histórico. `createInternalNotifications` legado ainda atende produtores Prisma; `insertInternalNotifications` está preparado para produtores Drizzle e só pode ser chamado na transação completa de origem.
- Cargas municipais: `seedSanitationCity` e o contexto das onze funções `seed*` intermodulares recebem `DatabaseTransaction`; todos os consumidores transacionais encontrados nos dois runners e no teste foram adaptados. IDs determinísticos, dados e ordem de inserção preservados; contagens consideram apenas inserções efetivas. O writer SQL só aceita as 128 tabelas fixas dessa carga e não expõe consultas/mutações genéricas. `unit-identifier.ts` reexporta as implementações puras e a reserva Drizzle; nenhuma transação Prisma recebe o helper novo.
- Gestão de acesso: actions de usuários/perfis continuam com os mesmos parâmetros e `{ error: string | null }`; autorização, proteção do administrador técnico, vínculo funcional, provisionamento Firebase e revalidações mantidos. Remoção de ACL individual na edição, gravação de usuário/perfil e auditoria compartilham transação. Páginas de usuários/perfis/módulos, dashboard e instância mantêm DTOs e JSX. APIs antigas de Configurações preservam `void`/erros lançados; `saveInstanceConfiguration` mantém `{ error?, message? }` e grava valores JSON tipados com auditoria por chave na mesma transação.

## Autoridade de DDL

Durante o inventário e a implantação da infraestrutura, a trilha `prisma/migrations-ibema` permanece a única autoridade de DDL. Drizzle Kit será usado para introspecção, sem `push` nem inicialização de baseline no banco atual. A mudança de autoridade ocorrerá somente após validar a reprodução do histórico e a adoção do banco instalado.

Reprodução e restauração locais aprovadas em `docs/drizzle-inventory/recovery.json`. A conferência de proveniência encontrou duas migrações com checksums históricos diferentes do SQL atual, sem origem anterior disponível no Git local. Os dois hashes permanecem registrados em `docs/drizzle-inventory/migration-history.json`; não alterar o ledger instalado para fazer uma comparação passar. A adoção deve preservar explicitamente essa evidência histórica.
