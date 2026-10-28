# Saúde — farmácia Drizzle

Frente exclusiva transferida em 28/10/2026: `src/lib/saude/pharmacy-*.ts`, `tests/pharmacy-*.test.ts` e `tests/helpers/pharmacy-*.ts`. **Migração direta das dez libs concluída: 40 funções exportadas, zero imports/identificadores/chamadas Prisma. SQL integrado e strict após esta entrega dependem da janela central e dos contratos externos abaixo.**

O lote anterior de Finance-Pages/Processos/Transparência recebeu confirmação central de **14 PASS / 0 FAIL**, incluindo os sete cenários Financeiro, o vínculo `requestId` e o guard `publishedAt`. Este resultado não é validação SQL da farmácia.

## Arquivos e contratos preservados

| Lib | Operações e invariantes |
| --- | --- |
| `pharmacy-catalog-service.ts` | Dígito CAS, identidade DCB por código/versão, autoria original, fontes RENAME/REMUME, DCB nullable, CATMAT/unidade local, reativação e conversão Float. |
| `pharmacy-dispensation-service.ts` | Profissional e servidor ativos, vínculo principal ou atribuição à unidade, paciente/pessoa ativos e sem óbito, retirante/vínculo, receituário controlado, validade/saldo, FEFO, dispensação manual/eletrônica, replay e divergências, cancelamento/correção com recomposição de estoque/receita/demanda. |
| `pharmacy-request-policy.ts` | Lock do pedido-pai antes de ler o item, UG/unidade de destino, saldo Decimal sobre os Floats físicos, cumprimento parcial/integral, pedido cancelado não reabre, remessa em trânsito e cancelamento de fulfillment. |
| `pharmacy-request-service.ts` | Demanda por titular ou reposição entre unidades, produtos assistenciais ativos, saldo válido da origem, idempotência, integração com receita/dispensação ou correlato, cancelamento rastreável e impedimento de cancelamento com remessa em trânsito. |
| `pharmacy-kit-service.ts` | Composição versionada, snapshot de itens/receitas/elegibilidade, pacientes ordenados, endereço residencial atual não canônico, condição clínica/gestação, programa e vínculo vigentes, receita/saldo, geração sem movimentação, retirada/retorno/não retirada, revalidação da elegibilidade e replay. |
| `pharmacy-judicial-service.ts` | Paciente/unidade/advogado ativos, titularidade do protocolo, existência da compra, correspondência da receita/medicamento, fases e eventos, lock por número/registro, última versão, arquivamento de predecessoras aprovadas, renovação e limite de fornecimento. |
| `pharmacy-judicial-document.ts` | Extrato PDF privado por unidade, instituição, paciente/CNS, advogado/OAB, protocolo/compra, itens/dispensações/lotes, ordem dos eventos, documentos vinculados e usuário emissor. A autorização ocorre antes da leitura dos detalhes clínicos. |
| `pharmacy-inventory-service.ts` | Escopo assistencial, profissional, responsabilidade do inventoriante, doses inteiras, envio e fechamento pelo motor patrimonial canônico, bloqueio de movimentos e segregação de funções. |
| `pharmacy-invoice-service.ts` | Emitente/CNPJ, estoque assistencial autorizado, NF-e já vinculada a outro estoque, mapeamento único por item/lote, fabricação/validade, conversão da unidade comercial, custo e idempotência do recebimento. |
| `pharmacy-invoice.ts` | Parser puro já independente do ORM: contrato de saída e lógica preservados, incluindo limites, rejeição de entidades externas, modelo/versão, datas, soma dos lotes, hash e emissão com zona. |

### Contexto, executores e transações

- `src/lib/contracts/health-pharmacy.ts`: `HealthPharmacyContext = { user: PermissionUser; database?: DatabaseExecutor }`. Os contextos atuais continuam estruturalmente aceitos; fixtures Drizzle não precisam construir cliente legado.
- Funções públicas que possuem transação preservam os argumentos anteriores e recebem **`connection: DatabaseConnection = databaseConnection` como último argumento opcional**. Retornos continuam os headers completos ou os objetos `{ id }`, `{ fulfillmentId, dispensationId? }`, `{ deliveryIds }` e o `Buffer` já consumidos. O replay de criação de pedido continua trazendo os itens carregados, como antes.
- Leitores usam `DatabaseExecutor`; funções `prescriptionDispensationTx`, `manualDispensationTx`, `cancelKitDispensationInTransaction`, helpers de cumprimento/cancelamento e validação judicial usam a **`DatabaseTransaction` recebida**. Não abrem outra transação/conexão.
- `applyStockMovement` e `reverseStockMovementInTransaction` recebem exatamente esse `tx`, compartilhado com dispensação, eventos, cumprimento de demanda e itens de kit. Uma falha posterior desfaz o lote completo. Os serviços que chamam esses helpers fazem apenas um `withDatabaseTransaction`.
- Mantidos os 60.000 ms explícitos de geração/entrega/retorno de kits; demais transações farmacêuticas usam os 5.000 ms do padrão interativo anterior. Inventário delega a posse da transação e suas opções ao motor patrimonial existente.
- Mantida a sequência de locks de cada operação: acesso → idempotência → receita → judicial/pedido → estoque nas dispensações; registro da dispensação → receita → pedido → reversão nos cancelamentos; delivery → itens ordenados por material nos kits; kit → pacientes ordenados → chave de geração; identidade/número/registro na fase judicial. Não foram acrescentadas ordenações globais diferentes às operações antigas.
- Escopos de unidade, titularidade e sigilo permanecem explícitos. Não foi inferida UG a partir do nome do estoque nem acrescentado filtro financeiro que não existia no serviço legado.

### Escalares e persistência

- `src/db/schema/health-pharmacy.ts`: **23 projeções / 210 colunas**, sendo 19 tabelas de domínio e quatro projeções somente leitura de `HealthStockReceipt`, `HealthStockTransfer`, `HealthStockTransferItem` e `Vaccine`. Sem DDL/registro global. Schemas existentes de pessoas, estoque, profissionais, receitas, clínica, programas, processos, compras e administração são importados.
- Os três repositórios `src/db/repositories/health-pharmacy/{records,kits,judicial}.ts` usam consultas fixas de domínio. Grafos são selecionados em até dois níveis e reconstruídos explicitamente; não há API relacional emulada ou casts de compatibilidade.
- Quantidades farmacêuticas, composição, conversões CATMAT/NF-e e saldos de prescrição/judicial são **Float/float8 físicos**, como no legado. Os agregados de remessa/cota são explicitamente `double precision`; o decoder numérico corresponde a esse tipo físico, não a `numeric`.
- A regra de saldo de pedido continua calculando `Decimal(String(float))` antes de comparar/somar e converte somente na escrita final de `fulfilledQuantity` float8. Os Decimals monetários do movimento pertencem ao writer patrimonial canônico e não são convertidos por esta frente.
- Temporais dos leitores são colunas tipadas Drizzle, incluindo campos nullable; não há timestamps de negócio obtidos por `execute<T>` cru. Locks retornam somente IDs/void. JSON de critérios, eventos e snapshots preserva o round-trip original e não recebe conversão heurística de campos.

## Consumidores conferidos e handoffs externos

Pesquisados imports/usos antes da alteração das assinaturas, e reconferidos ao fim do lote:

- Actions `saude/farmacia/{actions.ts,catalogo,dispensacoes,inventario,judicial,kits,notas,requisicoes}/actions.ts`; formulário `notas/InvoiceImportForm.tsx`; API `saude/farmacia/judicial/[id]/extrato/route.ts`. Mantidos os argumentos existentes, retornos das libs e erros explícitos usados por esses consumidores. Actions/APIs não foram editadas nesta frente.
- Consumidores internos farmacêuticos e as chamadas de `health-stock-service.ts`/`vaccination-stock-service.ts` aos helpers de acesso, pedido e dispensação.
- Testes compartilhados `tests/health-checklist-internal-flows.test.ts` e `tests/health-pharmacy-invoice.test.ts` foram lidos. Permanecem com o owner Saúde; os casos farmacêuticos foram preparados em fixtures independentes sem modificar o teste multissetorial ou sua infraestrutura antiga.

**Contratos ainda mistos no último exame local, para o owner Saúde integrar:**

1. `health-stock-service.ts` ainda declara transação legada e passa esse objeto a `assertPharmacyRequestTransfer`, `lockPharmacyRequestItem` e `recordPharmacyRequestFulfillment`. Esses exports agora exigem a transação Drizzle do próprio writer; seus retornos continuam iguais, inclusive `item.request.destinationWarehouse`.
2. `vaccination-stock-service.ts` ainda passa transação legada a `pharmacyDispensationAccess`. O helper agora aceita `DatabaseExecutor` e continua retornando `{ warehouse, professional, unitId }`.
3. `importPharmacyInvoice(context, raw, connection)` chama **`postHealthStockReceipt(context, payload, connection)`**. O recebimento deve aceitar o contexto mínimo acima e a conexão final opcional, possuir sua única transação e passar seu `tx` real a todos os writers internos. A importação não abre transação externa concorrente. O export `dispensePrescriptionItem` do writer deve encaminhar sua conexão ao wrapper farmacêutico quando a receber.
4. A nova fixture exercita `dispatchHealthStockTransfer(context, raw, connection)` e `receiveHealthStockTransfer(context, transferId, connection)` com o mesmo contexto mínimo/conexão descartável. Os dois exports externos ainda precisam dessa integração. Nenhum cast, cliente misto ou fallback para outra conexão foi introduzido para contornar essa dependência.
5. A API do extrato ainda audita via contrato antigo e o teste multissetorial ainda constrói a fixture legada; pertencem ao owner Saúde/integração central. O `Buffer` e os dados do extrato farmacêutico já usam leitores Drizzle.

## Fixture SQL preparada

- `tests/helpers/pharmacy-database.ts`: reaplica todos os históricos SQL ordenados em PGlite descartável, usa o transporte Neon WebSocket/Drizzle real e fecha/restaura a fixture também em erro de preparação. Seed fixo independente: **32 inserts / 32 tabelas**, com FKs reais, profissional/servidor, duas unidades/estoques, paciente/retirante/óbito, endereço, condição/programa, produtos, lotes válidos/bloqueados/vencidos, receita, protocolo, compra e documento.
- `tests/pharmacy-drizzle.test.ts`: **oito cenários internos** preparados: catálogo; dispensação/correção/rollback; demandas/cancelamento/Decimal; transferência com aceite pelo owner; judicial/renovação/PDF; kits/elegibilidade/snapshot/rollback; inventário/segregação; NF-e/recebimento/conversão/UTC. Inclui falha deliberada após `prescriptionDispensationTx` para provar rollback pelo dono externo da transação, e falha no segundo material do kit após saída anterior.
- O teste integrado confere também idempotência e eventos sem duplicação, retirante divergente, profissional/servidor inativo, titularidade do protocolo, cota judicial, predecessor arquivado, request cancelado sem reabertura, saldo em trânsito, kit versionado, vínculo programático encerrado, doses fracionárias negadas e fechamento concorrente único.
- Golden tipado: SQL `2026-10-19 12:34:56.789` → `2026-10-19T12:34:56.789Z`. A emissão de NF-e `2026-10-01T23:30:00-03:00` é conferida no banco como `2026-10-02T02:30:00.000Z`, decodificando o timestamp cru do assert com `databaseTimestamp`.
- `tests/pharmacy-invoice.test.ts` preserva os dois cenários puros da NF-e existente e usa o helper legado exclusivo `pharmacy-invoice-fixture.ts`, que não precisou de alteração.

## Verificações realmente executadas

1. ESLint direcionado das dez libs, contrato, schema, três repositórios e quatro arquivos de testes/helpers: **aprovado, zero erros/avisos**.
2. Parse/AST de **19 arquivos**, **40 funções de serviço exportadas**, nenhum identificador/import/call Prisma residual.
3. Conferência física offline das **23 projeções / 210 colunas** contra `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: zero divergências de nome, tipo ou nullability. Comparação normaliza apenas grafia de `timestamp (3)`/`timestamp(3) without time zone`.
4. Inspeção dos **315 acessos a colunas** nos 13 arquivos de serviços/repositórios: todos resolvem exports/colunas reais dos schemas importados.
5. Conferência offline dos **32 inserts / 32 tabelas** do helper: nenhuma coluna desconhecida ou campo físico obrigatório sem default omitido. Não equivale à execução dos checks/FKs/triggers.
6. `node --import tsx --test tests/pharmacy-invoice.test.ts`: **2 PASS / 0 FAIL / 0 SKIP**. São testes puros, sem banco.
7. Comparação AST individual das dez libs com a base `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`: mesmos nomes de funções exportadas, schemas Zod e mensagens de erro de negócio. O parser puro `pharmacy-invoice.ts` foi preservado integralmente. Esta conferência não substitui a regressão comportamental SQL.
8. Conferência de completude das 19 tabelas de domínio: nenhuma coluna física omitida dos headers/retornos. Parse e inspeção final dos 20 arquivos do lote (incluindo documento) sem conflitos ou whitespace residual; ESLint dos dois arquivos ajustados no fechamento novamente aprovado.

**A fixture SQL da farmácia ainda não foi executada.** O strict e a execução integrada são centralizados pelo parent, após o handoff dos writers Saúde; lint/AST/catálogo não são evidência de compatibilidade de tipos nem execução SQL.

Comando para a janela central sequencial:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/pharmacy-drizzle.test.ts tests/pharmacy-invoice.test.ts
```

Fechar a fixture antes de abrir outra: configuração Neon é global. Repetir em processos separados com `TZ=UTC`, `TZ=America/Sao_Paulo` e `TZ=Asia/Tokyo` na janela temporal central. Registrar aqui os resultados SQL/strict efetivamente recebidos e corrigir eventuais incompatibilidades próprias antes de declarar aprovação integrada.
