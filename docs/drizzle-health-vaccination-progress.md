# Vacinação — migração direta para Drizzle

## Entrega e estado real

- Inventário exclusivo: **sete arquivos `src/lib/saude/vaccination-*.ts`** — seis serviços com persistência e `vaccination-card-policy.ts`, política pura. Todos os sete estão sem referências/imports/identificadores/chamadas Prisma diretos.
- Preservadas as **30 funções públicas originais**. Acrescentado `recordVaccinationInTransaction` para composição explícita com o dono da transação clínica: **31 funções exportadas** no total.
- Persistência em três repositórios exclusivos (`records.ts`, `cards.ts`, `search.ts`), contrato mínimo e schema próprio com **12 tabelas completas / 149 colunas**.
- Conferência offline de nomes, tipos físicos e nullability aprovada contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`. Timestamps Drizzle `timestamp (3)` correspondem a `timestamp(3) without time zone` do catálogo.
- Fixture independente com replay ordenado dos **156 históricos SQL**, **29 inserts / 29 tabelas** de seed e transporte real Neon WebSocket → Drizzle → PGlite descartável. Campos obrigatórios e nomes do seed conferidos offline.
- **SQL integrado e strict ainda não executados/aprovados neste lote.** A integração externa de `health-stock-service.ts` é necessária para validar o recebimento/transferência e remover os contratos mistos conhecidos.

## Arquivos e contratos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/saude/vaccination-service.ts` | Aplicação, calendário/faixa etária, contraindicação/interações, campanha, indicação, profissional, paciente, estoque, replay e vínculos clínicos |
| `src/lib/saude/vaccination-stock-service.ts` | Conversão de frascos em doses na entrada, preparo/diluente, lote, frasco já aberto, perdas e conciliação |
| `src/lib/saude/vaccination-registry-service.ts` | Fabricantes, mapeamentos versionados, configuração, regras de calendário, interações, campanhas, eventos de carteira, ESAVI e condutas |
| `src/lib/saude/vaccination-active-search.ts` | Pacientes autorizados, endereço residencial mais recente, contato, histórico e pendências |
| `src/lib/saude/vaccination-form-options.ts` | DTOs serializáveis para vacina/lote/diluente/frasco/profissional/campanha |
| `src/lib/saude/vaccination-document-service.ts` | Carteira e certidão PDF, cabeçalho institucional e validação de acesso |
| `src/lib/saude/vaccination-card-policy.ts` | Política pura de idade civil, intervalo, repetição, contraindicação, aprazamento e validade de lote |

`HealthVaccinationContext = { user: PermissionUser; database?: DatabaseExecutor }` aceita os contextos existentes estruturalmente e permite fixture sem cliente legado.

- Leituras dos repositórios e helpers de acesso recebem `DatabaseExecutor`.
- Wrappers que possuem transação mantêm os argumentos anteriores e acrescentam `connection: DatabaseConnection = databaseConnection` como último argumento opcional.
- `recordVaccination(context, raw, connection?)` mantém `{ id }`, com `withDatabaseTransaction` e `timeoutMs: 60_000`.
- `recordVaccinationInTransaction(tx: DatabaseTransaction, context, raw)` realiza o mesmo fluxo na transação clínica existente e mantém `{ id }`.
- `openVaccineVialInTransaction(tx: DatabaseTransaction, context, input)` recebe a mesma transação da aplicação ou preparo. Consumo de diluente e dose chama `applyStockMovement(tx, ...)` com esse mesmo objeto.
- Demais transações próprias usam `timeoutMs: 5_000`, equivalente ao timeout transacional legado padrão. `receiveVaccineVials` encaminha sua conexão ao dono externo do recebimento.
- Retornos integrais de fabricantes, vacinas, regras, campanhas, eventos, perfis de lote, frascos e condutas são mantidos; aplicação retorna `{ id }`, perda retorna `{ movementId }`, documento retorna `Buffer`.
- `VaccinationFormOptions`, `vaccinationStatusNames`, argumentos/defaults anteriores, schemas Zod e mensagens explícitas de negócio foram conferidos individualmente com a base histórica.

## Invariantes preservadas

- Autorização por unidade assistencial e vínculos existentes; leitura da carteira admite unidade de referência, aplicação anterior ou atendimento autorizado. Lista vazia de unidades continua negando acesso e retornando busca/opções assistenciais vazias.
- Portal recebe o paciente identificado por `getPatientPortalAccess`; seus consumidores mantêm o vínculo de titularidade e passam contexto estruturalmente compatível.
- Busca ativa restringe paciente e pessoa ativos sem óbito, pesquisa nome/CPF/CNS, escolhe endereço residencial não canônico mais recente e aplica o mesmo escopo aos registros/eventos. Contato mantém a seleção de um registro ativo sem prioridade adicional de domínio.
- Profissional e servidor precisam estar ativos; lotação direta ou atribuição ativa valida a unidade; equipe só compõe o snapshot quando pertence à unidade da aplicação.
- Calendário mantém versões, fechamento da vigência anterior em um milissegundo, dose/estratégia normalizada, faixa etária, dose anterior, intervalo mínimo e repetição. Resgate compõe histórico; indicação e aprazamento não substituem aplicação.
- Contraindicação e revogação são avaliadas na data de referência; eventos preservam fonte, motivo, autoria, lotes e vínculos. ESAVI exige correspondência com paciente/imunobiológico e temporalidade da aplicação; conduta preserva profissional e autoria.
- Chegada/agendamento e prontuário são conferidos contra paciente/unidade, com vínculo entre prontuário e agendamento quando informado.
- Quantidades de material, custo por dose, doses de diluente e horas após abertura permanecem **Float/float8**. Dose aplicada e perda vacinal continuam inteiras pelas validações originais. Numerics monetários do motor compartilhado permanecem Decimal.
- `SUM(remainingDoses)` físico int8 é lido como texto e decodificado com `Decimal` antes da conversão ao limite numérico legado de comparação com saldo Float; sem `Number` intermediário.
- Timestamps de negócio usam colunas tipadas Drizzle. Não há seleção SQL crua de timestamp a decodificar no domínio; qualquer seleção futura dessa natureza requer `databaseTimestamp`, preservando `null`.
- Política de dia brasileiro, nascimento civil UTC, fim de mês, ano bissexto e validade de lote até `23:59:59.999-03:00` preservada. Política pura idêntica à base.
- JSON de snapshots, mapeamentos e histórico de ajustes mantém a representação existente, incluindo `null` SQL/JSON. Ajustes mantêm o round-trip JSON original, com data ISO em string.
- Replay preserva os checks clínicos e de contexto originais, sem duplicar aplicação/movimentos/auditoria. Snapshot de código/calendário/fabricante/equipe permanece histórico após mudanças cadastrais.
- Mantida a sequência dos advisory locks: aplicação `VACCINATION:<key>` → `VACCINATION_PATIENT:<patient>` → `VACCINE_LOT:<stock>` → `WAREHOUSE_INVENTORY:<warehouse>`. Preparo/perda/conciliação mantêm lote → inventário; calendário mantém o lock por código.
- Seleções relacionais são recompostas explicitamente após joins de até dois níveis; consultas de domínio fixas usam filtros SQL e tabelas reais.

## Consumidores conferidos e handoffs externos

Imports e chamadas foram conferidos nas actions de vacinação/gestão, formulário client, páginas de vacinação/carteiras/carteira individual, portal do paciente, duas APIs de PDF, libs internas e testes de saúde compartilhados.

1. **Owner Saúde — recebimento:** `receiveVaccineVials(context, raw, connection)` chama `postHealthStockReceipt(context, payload, connection)`. O export externo ainda está em `AppContext`/transação legada e precisa aceitar contexto mínimo estrutural e conexão final opcional, além de escrever perfil de lote/metadados na mesma transação do estoque.
2. **Owner Saúde — transferência:** o cenário independente espera `dispatchHealthStockTransfer(context, raw, connection)` e `receiveHealthStockTransfer(context, transferId, connection)`. Preservar doses correspondentes a frascos fechados completos, reserva das doses dos frascos abertos, fabricante/doses por frasco/validade e replay do aceite; todos os movimentos/metadados na mesma transação.
3. **Owner Saúde — clínica:** quando um writer de prontuário já possuir transação, usar `recordVaccinationInTransaction(tx, context, raw)`. A entrada `recordVaccination(context, raw, connection?)` é o dono da transação apenas quando chamada isoladamente. O teste preparado insere prontuário, abre frasco, consome diluente/dose e provoca falha posterior para verificar rollback único.
4. **Owner Saúde — UI/API:** actions e páginas ainda possuem leituras externas legadas; API profissional de documento ainda audita pelo contrato antigo. A API do portal já usa `insertAuditEvent` com executor. Integração central deve ajustar seus próprios consumidores preservando `Promise<void>` dos formulários e tratamento de erro dos wrappers client.
5. **Integração central — testes compartilhados:** `tests/health-checklist-internal-flows.test.ts` e `tests/health-vaccination-calendar.test.ts` continuam com seus casos anteriores. Os novos arquivos exclusivos reproduzem os cenários vacinais em fixture própria; o checklist multissetorial precisa receber a conexão/fixture integrada pelo respectivo owner.
6. `pharmacyDispensationAccess` já recebe o executor Drizzle real de preparo/perda/conciliação. Esse handoff de vacinação foi resolvido neste escopo; os handoffs restantes de `health-stock-service.ts` para Farmácia seguem com o owner Saúde.

## Evidências executadas

- `node --import tsx --test tests/vaccination-calendar.test.ts`: **5 PASS / 0 FAIL / 0 SKIP**.
- ESLint direcionado aprovado nos serviços, repositórios, contrato, schema e testes exclusivos.
- Parse/AST aprovado em **15 arquivos TypeScript**; **350 acessos a colunas** conferidos contra exports/colunas reais dos schemas importados.
- Comparação AST individual com `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`: exports anteriores preservados, schemas Zod idênticos, nenhuma mensagem explícita de negócio removida; política pura idêntica.
- Grep nos sete `vaccination-*.ts`: zero referências Prisma e zero métodos de API relacional legada.
- Schema: 12 tabelas, 149 colunas, nenhuma divergência de nome/tipo/nullability ou coluna omitida.
- Seed: 29 inserts, 29 tabelas, nenhum campo obrigatório omitido nem coluna desconhecida, conferido contra catálogo físico offline.

## SQL preparado para a janela central

`tests/vaccination-drizzle.test.ts` contém **nove cenários internos**, sem execução SQL neste lote:

1. Gestão, fontes, headers, Float, versões e vigências UTC.
2. Escopos de referência/atendimento/histórico, endereço/contato e opções de formulário.
3. Aplicação, doses inteiras, óbito/nascimento, servidor/profissional ativo, lote bloqueado/vencido, replay, Decimal monetário e snapshots.
4. Resgate/aprazamento, contraindicação histórica e revogação com autoria.
5. Rollback clínico único de prontuário, frasco, diluente, dose, movimentos e auditoria.
6. Chegada/prontuário, indicação, profissional com atribuição externa, concorrência e interação entre imunobiológicos.
7. Preparo/replay, frasco já aberto, JSON null, conciliação, perdas abertas/fechadas, lotes e rollback durante inventário.
8. ESAVI, condutas, PDF, sigilo entre unidades e null SQL versus JSON.
9. Recebimento externo, conversão de frascos, transferência proibida de doses já abertas/frasco parcial, transferência válida, metadados, aceite idempotente e aplicação no destino.

Após integração dos handoffs, o parent pode executar:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/vaccination-drizzle.test.ts tests/vaccination-calendar.test.ts
```

Repetir a regressão temporal em processos separados com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo`, conforme a janela central. Golden temporal tipado: `2026-10-19 12:34:56.789` → `2026-10-19T12:34:56.789Z`; frasco preparado nesse instante com seis horas → `2026-10-19T18:34:56.789Z`; lote civil de `2026-10-19` → `2026-10-20T02:59:59.999Z`.

**Pendente receber resultados efetivos de SQL, strict e build centrais.** Evidência estática e teste puro não constituem aprovação integrada.
