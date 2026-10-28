# Drizzle — motores econômicos, documentos cadastrais e alvarás

## Estado da entrega (2026-10-28)

Implementados os **14 motores reservados**, com **zero referências diretas a Prisma**, `$transaction` ou `$queryRaw` nesses arquivos. Persistência própria em `src/db/repositories/tax-economic/`, contratos independentes em `src/lib/contracts/tax-economic.ts` e projeções exclusivas em `src/db/schema/tax-economic.ts`.

Verificações leves efetivamente realizadas:

- ESLint dos motores, repositórios, contratos, projeções, teste e duas páginas consumidoras: **zero erros/avisos**.
- Parse sintático TypeScript/TSX: **25 arquivos**, zero diagnósticos sintáticos.
- Comparação independente com `.agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json`: **25 projeções / 326 colunas**, zero divergências de nome/tipo/nullability.
- Conferidos **156 diretórios de SQL histórico**; a fixture reproduz todos, em ordem, sem metadados de ORM.
- JSX das duas páginas adaptadas comparado à referência `C:/Users/trici/AppData/Local/Temp/opencode/celeriflow-main-sync`: **6 raízes JSX idênticas**.

**Execução dos testes reais, typecheck e build estão pendentes da fila central.** Os resultados acima não representam aprovação de runtime/typecheck/build.

## Inventário e fronteiras públicas

Todos os argumentos posteriores ao banco e os formatos funcionais de retorno foram preservados. Os retornos persistidos são DTOs independentes (`EconomicRegistrationRecord`, `EconomicRegistryRecord`, `EconomicLicenseRecord`, `EconomicAssessmentRecord`), e não payloads gerados pelo ORM.

| Motor | Exportações e executor recebido |
| --- | --- |
| `economic-history.ts` | `createEconomicRegistrationWithHistory`, `updateEconomicRegistrationWithHistory`: `DatabaseConnection`; suas variantes `InTransaction`: `DatabaseTransaction` |
| `economic-profile.ts` | `saveEconomicProfile`, `createEconomicRegistrationWithProfile`, `expireProvisionalEconomicRegistrations`: `DatabaseConnection`; `saveEconomicProfileInTransaction`, `createEconomicRegistrationWithProfileInTransaction`: `DatabaseTransaction` |
| `economic-query.ts` | `readEconomicProfiles`: `DatabaseConnection` para snapshot repeatable-read; `readEconomicProfilesInTransaction`: `DatabaseTransaction` |
| `economic-debt-policy.ts` | `assertEconomicTaxpayerDebtFree`, `enforceEconomicProfileDebtPolicy`: `DatabaseTransaction` |
| `economic-activity-registry.ts` | `publishEconomicActivity`: `DatabaseConnection`; `readEconomicActivitiesInTransaction`, `resolveEconomicActivityCode`: `DatabaseTransaction` |
| `economic-activity-operations.ts` | `unifyEconomicActivities`: `DatabaseConnection` |
| `economic-operations.ts` | `bulkChangeEconomicProfiles`: `DatabaseConnection` |
| `economic-events.ts` | `publishEconomicEventType`, `saveEconomicEvent`, `issueEconomicEventLicense`, `saveEconomicVehicle`: `DatabaseConnection` |
| `license-policy.ts` | `publishLicensePolicy`, `issueConfiguredLicenses`: `DatabaseConnection`; `issueConfiguredLicenseInTransaction`: `DatabaseTransaction` |
| `license-lifecycle.ts` | `transitionConfiguredLicense`: `DatabaseConnection` |
| `license-pdf.ts` | `renderConfiguredLicensePdf`: `DatabaseExecutor`, leitura avulsa sem abrir transação |
| `license-signatures.ts` | `signConfiguredLicense`, `readSignedLicenseArtifact`: `DatabaseConnection` |
| `portal-economic-documents.ts` | `issuePortalEconomicDocument`, `renderPortalEconomicDocument`: `DatabaseConnection` |
| `portal-licenses.ts` | `issuePortalLicense`: `DatabaseConnection` |

São **32 funções públicas**. Schemas Zod conservam entradas, validações e defaults. Serviços continuam lançando erros; actions consumidoras conservam seu tratamento de erro próprio.

### Repositórios

- `registry.ts`: leitores específicos de perfil/histórico/catálogo/atividade/evento/veículo/alvará/documento, inserção aditiva de memória e auditoria, advisory locks transacionais.
- `registrations.ts`: cadastro e PF/PJ nullable, origem ente/UG, processos, propriedades, anexos, serviço ISS/CBO, conta ativa e grant de titular vigente; writers recebem exclusivamente a transação.
- `debt.ts`: lançamentos com guias/pagamentos confirmados, créditos efetivados e dívida ativa; não amplia cardinalidade do lançamento por joins de pagamentos.
- `licenses.ts`: lock, criação, transição, original GED e evidência ICP-Brasil. Relações 1:1 são projetadas explicitamente.
- `snapshot.ts`: Date → ISO, Decimal → string, undefined de objeto omitido, undefined de array → JSON null; raiz JSON null gravada como `'null'::jsonb` em memória/auditoria.
- `test-fixture.ts`: SQL histórico integral e dados isolados por Neon/WebSocket/Drizzle/PGlite. Não deriva DDL de modelos.

As duas novas projeções físicas são `TaxpayerPortalAccess` e `DocumentIcpEvidence`; as demais tabelas importam os mapeamentos existentes, sem editá-los. Campos temporais retornados vêm de selects tipados com decodificação de timestamp. SQL bruto de lock/configuração/catálogo não retorna DTO temporal, portanto não necessita de `databaseTimestamp`.

## Invariantes mantidos

- Escopo ente/UG e conta/perfil ativos; grant `TITULAR`, status ativo, não revogado e `grantedAt <= agora`, com escopo específico (`EMPRESA`, `CERTIDOES`, `ALVARAS`).
- Perfil com origem imutável, comparação de versão, CRC único/versionado, sócios distintos, participações Decimal até seis casas e total exato de 100%, imóveis na mesma origem, processos e anexos GED válidos.
- Redução das versões na mesma ordem original: filtros aplicados antes do latest-by-entity; ordenação final por nome `pt-BR`; cadastros sem perfil preservam o tratamento legado.
- Histórico com baseline, verificação contra edição fora da memória, supressão de no-op, atualização correlata de CNAE principal/secundários e snapshots aditivos.
- Validade provisória inclusiva (`início + dias - 1`), vencimento somente após a data final, lock e revalidação do perfil antes da expiração; replay não duplica expiração.
- CNAE resolve cadeia de unificação, detecta ciclos e impede uso de atividade desativada. Unificação mantém legados sem origem fora da atribuição e verifica conflitos de tratamento/condição urbanística antes de persistir.
- Valores tributários e pagamentos usam `Decimal` do projeto; não passam por `Number`. Débito sem origem/valor conciliado impede validação; dívida de outro ente é tratada como antes. Pagamentos confirmados e compensações efetivadas mantêm o cálculo exato.
- Alteração geral exige o mesmo filtro, conjunto de alvos, `updatedAt`, versão de perfil, versão do catálogo e versões dos formulários. Perfil, cadastro, histórico, formulário, toque de `updatedAt` e marcador compartilham a transação do serviço.
- Eventos e veículos mantêm versões/titular/condutor PF, origem, placa normalizada, unicidade de placa ativa e bloqueio de edição de evento com alvará não cancelado.
- Alvarás mantêm ano corrente, política/versionamento, validade inclusiva, pagamento/compensação, carência limitada à vigência, isenção motivada, bloqueios de CNAE/tipo, provisoriedade e verificação de sócios da inscrição específica.
- Lotes em ordem determinística de inscrição; duplicidade não cancelada bloqueia substituição. Cancelamento é definitivo; `set_config('celeriflow.license_actor', ..., true)` permanece na mesma transação da transição/memória/auditoria.
- Documento cadastral mantém request-key, validação dos mesmos dados no replay, fingerprint cadastral, memória da baixa e reautorização no download; PDF preserva aviso de posição histórica.
- PDF público e assinatura preservam conteúdo, código de autenticidade, hash SHA-256, original privado por instância, evidência criptográfica, validade atual e disponibilidade histórica após suspensão/cancelamento. Falha após upload mantém limpeza do blob.

### Isolamento e tempo limite

| Serviço | Isolamento / timeout |
| --- | --- |
| Histórico create/update | default do banco / 5s (default anterior) |
| Perfil save/create | serializable / 60s |
| Consulta por perfil | repeatable read / 60s |
| Expiração provisória | default do banco / 60s |
| Publicação/unificação de atividade e alteração geral | serializable / 60s |
| Tipos/eventos/veículos e licença de evento | serializable / 5s |
| Política e transição de alvará | serializable / 5s |
| Lote de alvarás e emissão pelo portal | serializable / 60s |
| Emissão de documento cadastral | serializable / 60s |
| Download documental/assinatura | repeatable read / 5s |
| Ingestão GED e callback A1 | transação do GED / 5s do serviço compartilhado |

As chaves de advisory lock e os locks de linha existentes foram mantidos. Helpers transacionais não abrem conexão/transação. Os leitores avulsos recebem o executor fornecido; nenhum repositório importa singleton de produção.

## Integração necessária — owner Tax

Na última leitura, quatro helpers externos ainda recebem o cliente legado. Os motores desta entrega já passam **o mesmo `DatabaseTransaction`** do proprietário da operação:

| Helper externo | Consumidor reservado | Contrato necessário |
| --- | --- | --- |
| `resolveTaxAssessmentScope` (`scope.ts`) | publicação de atividade com serviços ISS | leitor com `DatabaseExecutor`, resolvendo o vínculo pelo executor recebido |
| `readEconomicRegistrationSubjects` (`certificate-subjects.ts`) | emissão com `includePartnerDebts` | leitor com `DatabaseExecutor`; manter sócios da inscrição, política atual e escopo |
| `publishFiscalCatalogInTransaction` (`configurable-cadastres.ts`) | unificação com zoneamento afetado | `DatabaseTransaction`, sem abrir outra transação |
| `saveConfiguredFiscalRecordInTransaction` (`configurable-cadastres.ts`) | alteração geral com formulário | `DatabaseTransaction`, sem abrir outra transação |

`taxAssessmentCompensatedValue` já possui caminho `DatabaseExecutor` e é consumido diretamente pela transação de emissão. `assertPropertyCadastralAccess` já recebe `DatabaseExecutor`.

Os wrappers `publishFiscalCatalog` e `saveConfiguredFiscalRecord` precisam receber `DatabaseConnection` para o terceiro teste da suíte própria. Os contratos já estão alinhados também ao handoff Property. Não introduzir adapter de Prisma, cast de compatibilidade ou chamada de wrapper que crie outra transação dentro destes fluxos.

### GED e assinaturas — contratos disponíveis

Na versão compartilhada efetivamente lida, `ingestGedDocument(DatabaseConnection, input)` expõe `afterCreate?: (tx: DatabaseTransaction, documentId: string) => Promise<void>`. A assinatura usa esse callback, incluindo lock/revalidação do alvará, A1, memória e auditoria. GED, versão, assinatura, evidência e uso do certificado permanecem atômicos. `signDocumentVersionWithA1InTransaction` já recebe `DatabaseTransaction`.

Os nomes mencionados no repasse, **`afterCreateDbTransaction`** e **`requestDocumentSignaturesForActorConnection`**, não existem no serviço compartilhado desta árvore na última leitura. Há `requestDocumentSignaturesForActor(DatabaseConnection, ...)`; o fluxo original de alvará usa **assinatura A1 direta**, sem etapa adicional de solicitação de assinatura. Não foi criada solicitação nova, para preservar comportamento. Se o owner compartilhado publicar os aliases nomeados, ajustar a chamada ao contrato publicado sem mover o callback para fora da transação GED.

## Consumidores conferidos e handoff por owner

Foram pesquisados imports e chamadas de todas as 32 funções antes da alteração; a varredura AST posterior confirmou os consumidores abaixo. Consumidores externos não foram editados por esta frente; alguns já aparecem adaptados por seus owners na árvore concorrente. Conferir o estado final central.

### TaxActions / SST

Todos os seguintes serviços que abrem transação recebem `DatabaseConnection`:

- `src/app/app-domain/tributacao/economico/actions.ts`: `updateEconomicRegistrationWithHistory`.
- `src/app/app-domain/tributacao/economico/[id]/perfil/actions.ts`: create/save de perfil.
- `src/app/app-domain/tributacao/economico/atividades/actions.ts`: publicação/unificação.
- `src/app/app-domain/tributacao/economico/alteracao-geral/actions.ts`: alteração geral.
- `src/app/app-domain/tributacao/economico/eventos-veiculos/actions.ts`: quatro serviços de eventos/veículos.
- `src/app/app-domain/tributacao/alvaras/actions.ts`: lote/transição.
- `src/app/app-domain/tributacao/alvaras/configurados/actions.ts`: política/lote/transição/assinatura.
- `src/app/api/tributacao/economico/expiracao/route.ts`: expiração.

**Caso especial:** `src/app/app-domain/tributacao/cadastros-fiscais/actions.ts` chama `createEconomicRegistrationWithProfileInTransaction`, `updateEconomicRegistrationWithHistoryInTransaction` e `enforceEconomicProfileDebtPolicy`. O proprietário deve migrar a unidade transacional completa e passar seu `DatabaseTransaction`; não chamar wrappers que abram outra transação.

### Portal e rotas de alvará

- `src/app/portal/tributario/empresas/actions.ts`: `issuePortalEconomicDocument(DatabaseConnection, ...)`.
- `src/app/api/portal/tributario/empresas/documentos/[id]/route.ts`: `renderPortalEconomicDocument(DatabaseConnection, ...)`.
- `src/app/portal/tributario/alvaras/actions.ts`: `issuePortalLicense(DatabaseConnection, ...)`.
- `src/app/api/publico/alvaras/[code]/assinatura/route.ts`: `readSignedLicenseArtifact(DatabaseConnection, ...)`.
- `src/app/api/publico/alvaras/[code]/pdf/route.ts`: `renderConfiguredLicensePdf(DatabaseExecutor, ...)`.

Preservar os retornos `{ error }` das actions, códigos HTTP, cache privado/no-store, download e políticas atuais dos consumidores.

### Núcleo Tax

- `src/lib/tributacao/s5-service.ts`: `updateEconomicRegistrationWithHistoryInTransaction` recebe o tx proprietário.
- `src/lib/tributacao/configurable-cadastres.ts`: `enforceEconomicProfileDebtPolicy` e `updateEconomicRegistrationWithHistoryInTransaction` recebem o mesmo tx do formulário.
- A varredura não encontrou chamadas destes motores em `index.ts`; o tipo `TaxActor` continua importado somente como tipo.

### Páginas da reserva anterior

Adaptadas somente as chamadas de serviço em `economico/consulta/page.tsx` e `economico/alteracao-geral/page.tsx` para `databaseConnection`. Consultas de lookup continuam usando o executor de leitura do contexto. JSX integral comparado e idêntico; nenhum componente visual precisou mudar seu DTO.

### Testes externos que precisam adaptar suas fixtures/consumidores

- `tests/economic-profile.test.ts`
- `tests/economic-activity-registry.test.ts`
- `tests/economic-events-vehicles.test.ts`
- `tests/configured-licenses.test.ts`
- `tests/configured-license-signature.test.ts`
- `tests/configurable-fiscal-cadastres.test.ts`
- `tests/tax-cadastral-migration-chain.test.ts`
- `tests/tax-channel-financial-integrity.test.ts`
- `tests/tax-property-cadastral-completion.test.ts`

Esses testes não pertencem à nova reserva e não foram migrados por esta frente. A suíte própria não depende das fixtures deles.

## Suíte autônoma preparada para a fila central

Arquivo: `tests/drizzle-tax-economic.test.ts`. Fixture: `src/db/repositories/tax-economic/test-fixture.ts`. Persistência/locks/constraints são reais via driver Neon/Drizzle sobre PGlite com replay integral dos 156 SQL históricos. Somente transporte de blobs externo é isolado com `MockAgent`; o teste A1 gera certificado local via OpenSSL e usa a implementação criptográfica real. Teardown restaura dispatcher, variáveis e transporte, remove arquivos temporários e fecha a fixture.

1. **Econômico**: nove subtestes sequenciais cobrindo catálogo físico, leitores vazios, PF/PJ nullable, JSON null/Date/Decimal, perfil/CRC/participações, expiração, rollback de última auditoria, unificação sem catálogo afetado, bulk rollback/stale, dívida exata, eventos/veículos, taxas/isenção/carência/cancelamento, titular/scopes/replay/download.
2. **Alvará A1**: falha injetada na última auditoria verifica rollback de documento, versão, assinatura, evidência, uso do certificado e memória/auditoria; sucesso verifica PDF/hash/original privado, duplicidade/limpeza, original após suspensão/cancelamento, imutabilidade e adulteração dos bytes.
3. **Integração Tax**: serviços ISS/CBO e origem via scope, sócios limitados à inscrição, conflito urbanístico, rollback de zoneamento/cadastro/perfil/histórico na última escrita da unificação, e rollback de formulário/cadastro/histórico na última escrita do bulk. Depende dos quatro helpers/wrappers acima migrados.

### Comandos para o controlador central (não executados por esta frente)

Primeira fila, independente da migração dos helpers transacionais externos:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 --test-name-pattern="^(Econômico:|Alvará A1:)" tests/drizzle-tax-economic.test.ts
```

Após integração do núcleo Tax, executar a suíte inteira:

```powershell
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/drizzle-tax-economic.test.ts
```

Depois, o controlador central realiza typecheck/build e reexecuções pertinentes aos diagnósticos novos. Property/pages continuam disponíveis nesta frente para correções urgentes apontadas pela validação central.
