# Handoff — consumidores tributários da conexão Drizzle

## Referência

- Diagnósticos de origem: `.next/cache/build-cold-final.log`, linhas 148–178.
- Escopo: consumidores do portal tributário, quatro páginas tributárias e action de cadastros fiscais autorizados nesta tarefa.
- Documentação Next local consultada antes da edição: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

## Correções

- Seis route handlers agora passam `databaseConnection` aos wrappers que recebem `DatabaseConnection`: documentos de empresas, DAM ITBI, PDF do processo, declarações configuradas, download de documentos e registro de anexos de solicitação.
- Em `solicitacao-anexos/route.ts`, as verificações `assertOnlineItbiDraftAccess` continuam recebendo `db` (`DatabaseExecutor`); os dois registros de upload recebem a conexão completa.
- As três actions em `src/app/portal/tributario/itbi/actions.ts` passam `databaseConnection` à emissão de declaração, impugnação e mensagem do processo.
- As páginas `comparativo-anual`, `domicilio-tributario`, `movimentacoes-contabeis` e `resumo-anual` passam `databaseConnection` aos respectivos wrappers transacionais. As consultas dos repositórios continuam usando `context.database ?? db`.
- Em `cadastros-fiscais/actions.ts`, `eventScope` tem declaração explícita `JsonObject`, evitando a inferência de propriedades opcionais com `undefined` na união com `{}` e mantendo o conteúdo do JSON.

## Contratos verificados

- Lidas as implementações dos wrappers consumidos: todos os argumentos substituídos exigem `DatabaseConnection` e usam transações ou encaminham a conexão a serviços transacionais.
- `src/db/client.ts` fornece `databaseConnection` com o mesmo `db` municipal e o getter do pool real; não foi construído pool artificial nem usado cast para simular conexão.
- `buildAppContext` em `src/lib/platform/tenant-context.ts` define `database: db`, confirmando a correspondência com a conexão municipal.
- `insertActionIntegration` recebe o `$inferInsert` de `taxIntegrationEvents`; a anotação `JsonObject` elimina a origem do diagnóstico JSON sem modificar a assinatura da action.
- Nenhuma assinatura exportada foi alterada. Contratos de retorno e tratamento de erros das actions preservados. JSX e CSS preservados.
- `itbi/anexos/route.ts` também foi lido: seus validadores usam `DatabaseExecutor` e o serviço de registro já administra sua própria conexão; não precisou de edição.

## Validação e próximo passo

- ESLint direcionado aos route handlers tributários e aos seis arquivos de pages/actions restantes: **PASS**, saída vazia, código 0.
- Build, tsc e testes pesados não executados, conforme divisão de responsabilidades. A sessão principal deve executar a validação centralizada e confirmar a eliminação dos diagnósticos da partição 2.
- Nenhum commit ou push realizado.

## Extensão — diagnóstico de produção 4

- Origem: `.next/cache/production-diagnostic-4.log`, linhas 3–7.
- Documentação Next local adicional consultada antes da edição: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`.
- Corrigidos exclusivamente os três consumidores adicionais autorizados:
  - `src/app/portal/tributario/alvaras/actions.ts`: `issuePortalLicense(databaseConnection, ...)`.
  - `src/app/portal/tributario/empresas/actions.ts`: `issuePortalEconomicDocument(databaseConnection, ...)`.
  - `src/app/portal/tributario/itbi/novo/actions.ts`: `submitOnlineItbi(databaseConnection, ...)`; a prévia continua com `previewOnlineItbiProperty(db, ...)`, que recebe `DatabaseExecutor`.
- Implementações dos três wrappers lidas: todos abrem transações via `withDatabaseTransaction` e exigem `DatabaseConnection`. Assinaturas exportadas, autenticação, retornos e erros das actions preservados.
- Varredura read-only em todo `src/app` pelos nomes/imports e chamadas das 13 wrappers auditadas inicialmente e das três novas: após os ajustes, **zero ocorrências** passando `db` ou `database` como primeiro argumento. Os demais consumidores usam `databaseConnection`, `taxActionConnection(context)` ou `connection` obtida de `taxActionContext`; os dois consumidores com variável `connection` também foram lidos.
- Varredura adicional dos usos de `db` como primeiro argumento em `src/app/portal/tributario`: os restantes são consultas `DatabaseExecutor` (`portalTaxpayerGrants`, `portalTaxpayerOptions`, `portalEconomicRegistrations`, `portalLicenseOptions`, `portalItbiOptions`, `publicPrizeDraw`, `readPortalItbiChannel`, `readOnlineItbiEntitlements`, `previewOnlineItbiProperty`, `readTaxpayerAccount`). Assinaturas conferidas; nenhuma correção adicional necessária.
- ESLint diretamente pelo executável local, limitado às três novas actions: **PASS**, saída vazia, código 0.
- Nesta extensão não foram executados build, tsc, testes, npm ou comandos Git. Validação de produção permanece centralizada na sessão principal.

## Planejamento

- Origem: diagnósticos `.next/cache/production-diagnostic-7.log`, `production-diagnostic-8.log`, `production-diagnostic-10.log` e `production-diagnostic-13.log`: três chamadas enviavam `PlanningContext` com conexão opcional a escritores que exigem `PlanningPublicationConnectionContext`.
- Guia Next local consultado antes da alteração das actions: `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`.
- Lidos `access.ts`, `database.ts`, o contrato `planning-publication-operations.ts` e as implementações de publicação e retirada para conferir a origem do contexto, as permissões e as transações de escrita.
- `src/app/app-domain/planejamento/actions.ts`: os casos `reportPublish` e `reportWithdraw` agora enviam `{ ...context, connection: planningConnection(context) }`.
- `src/lib/planejamento/report-response.ts`: a publicação simultânea ao snapshot recebe o mesmo contexto completo.
- O helper existente `planningConnection` retorna a conexão explícita do contexto quando fornecida ou `databaseConnection` municipal real. Não foi fabricado pool, utilizado cast nem passado executor leitor como conexão de escrita.
- Nenhuma assinatura exportada ou definição de contexto foi alterada; não foi necessário modificar `access.ts`, `database.ts`, o contrato ou a implementação de publicação. O contrato escritor continua exigindo conexão obrigatória.
- Autenticação, jurisdição, verificações de autoridade legal e permissões de Transparência preservadas. `savePlanningRecord` continua retornando `{ error }` ao consumidor `PlanningForm`, que usa `await`; a resposta de publicação simultânea continua preservando o snapshot e retornando `publicationStatus: "FAILED"` em falha de publicação. Ambos os POSTs executivo e legislativo continuam usando a mesma função de resposta.
- ESLint local direcionado aos dois arquivos alterados: **PASS**, saída vazia, código 0.
- Build, tsc, testes, npm e comandos Git não executados nesta tarefa. A confirmação dos diagnósticos permanece com a validação centralizada da sessão principal.
