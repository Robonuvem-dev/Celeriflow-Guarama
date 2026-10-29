# ITBI — handoff final de fixtures e assertions

## Resultado

Os seis arquivos autorizados passaram: **14 pass, 0 fail, 0 skipped, 0 cancelled**, incluindo testes-pai conforme a contagem TAP do Node.

| Arquivos | Pass / fail | Duração | Log final |
| --- | --- | --- | --- |
| `tests/itbi-drizzle-helpers.test.ts` | 6 / 0 | 28,71 s | `.next/cache/itbi-helpers-final.tap` |
| `tests/itbi-field-history.test.ts`, `tests/itbi-online-channel.test.ts`, `tests/itbi-process-completion.test.ts` | 3 / 0 | 63,36 s | `.next/cache/itbi-channel-history-process-final.tap` |
| `tests/tax-cadastral-migration-chain.test.ts`, `tests/tax-property-cadastral-completion.test.ts` | 5 / 0 | 90,52 s | `.next/cache/itbi-cadastral-final.tap` |

Comando base utilizado: `node --conditions=react-server --import tsx --test --test-reporter=tap --test-concurrency=1`, seguido dos arquivos de cada linha. Limite externo de 180 segundos por execução. A primeira tentativa com os seis arquivos excedeu esse limite; a evidência final vem dos recortes completos acima.

## Mudanças por arquivo

- `itbi-drizzle-helpers.test.ts`: o setup local desativa candidatos históricos ITBI diferentes de `ITBI`; o teste de imutabilidade exige SQLSTATE `P0001` e a mensagem completa do trigger. A fixture de ownership publica inscrição `ITBI-PROPERTY` e define o tipo físico como `Terreno`, conciliando a linha de `RealEstate` com seu perfil versionado.
- `itbi-field-history.test.ts`: exclusões de histórico e declaração exigem `P0001` e a mensagem completa de imutabilidade do ITBI.
- `itbi-online-channel.test.ts`: o setup local mantém apenas o candidato ITBI da fixture ativo.
- `itbi-process-completion.test.ts`: o setup local mantém apenas o candidato ITBI da fixture ativo; rollback da decisão e imutabilidade da impugnação usam `postgresError` com código e mensagem exatos.
- `tax-cadastral-migration-chain.test.ts`: desativa os candidatos ITBI históricos antes de criar o tributo `ITBI` mapeado pelo cenário.
- `tax-property-cadastral-completion.test.ts`: o cenário de transmissão desativa os candidatos históricos antes de criar seu ITBI; tipos físicos dos imóveis são conciliados com os perfis `Terreno`. Assertions PostgreSQL de avaliação, histórico econômico e rollback documental exigem `P0001` e mensagem exata.

Todas as assertions preexistentes de valores, autorização, referências, campos, histórico, frações, restituição da titularidade, documentos e rollback foram preservadas. Foi reutilizado `tests/helpers/postgres-assertion.ts`, sem mudança de assinatura ou implementação nesta tarefa.

## Investigação de ownership

A falha original em `src/lib/tributacao/itbi-ownership.ts:74` ocorria na atualização de `RealEstate` após publicar o perfil transferido. A fixture tinha `propertyType` físico nulo, perfil `kind: Terreno`, inscrição física `ITBI-PROPERTY` e inscrição ausente no perfil. O trigger `enforce_property_edit_restriction`, definido em `20261015150000_property_profiles_and_registration/migration.sql`, exige correspondência entre tipo/inscrição físicos e os valores do perfil. O serviço preserva esses campos e o trigger rejeitava os dados incoerentes da fixture.

Conciliados os dados, o teste passou integralmente, incluindo transmissão parcial, correspondência, retificação, PDFs, estorno e recomposição dos proprietários. A cadeia cadastral também passou com transferência automática, pagamento, retificação e estorno. Não foi necessária alteração de runtime.

## Consumidores dos helpers conferidos

Os helpers existentes não são exclusivos, portanto os ajustes ficaram nos próprios testes autorizados.

`tests/helpers/itbi-drizzle-fixture.ts` é consumido por:

- `tests/itbi-drizzle-helpers.test.ts`
- `tests/itbi-field-history.test.ts`
- `tests/itbi-online-channel.test.ts`
- `tests/itbi-process-completion.test.ts`
- `tests/itbi-expiry.test.ts`

`tests/helpers/tax-chain-database.ts` é consumido por:

- `tests/configurable-fiscal-cadastres.test.ts`
- `tests/drizzle-tax-collection-operations.test.ts`
- `tests/economic-activity-registry.test.ts`
- `tests/economic-profile.test.ts`
- `tests/tax-a1-signature.test.ts`
- `tests/tax-accrual-accounting.test.ts`
- `tests/tax-cadastral-migration-chain.test.ts`
- `tests/tax-channel-financial-integrity.test.ts`
- `tests/tax-document-integration.test.ts`
- `tests/tax-financial-chain.test.ts`
- `tests/tax-property-cadastral-completion.test.ts`
- `tests/helpers/construction-fee-issue-fixture.ts`
- `tests/helpers/tax-document-fixture.ts`

Build e verificações centrais permanecem sob responsabilidade da sessão principal.
