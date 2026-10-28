# Saúde, Assistência Social e Portal do Paciente — progresso Drizzle

## Estado em 2026-10-28

A migração integral deste escopo **ainda não está concluída**. O inventário estático atual identifica **90 arquivos de produção com referências diretas a Prisma** e **11 scripts/testes auxiliares residuais**. Ausência de referência direta não significa ausência de dependência transitiva.

| Área | Arquivos de produção residuais |
| --- | ---: |
| `src/lib/saude/**` | 34 |
| `src/app/app-domain/saude/**` | 45 |
| `src/app/api/saude/**` | 11 |
| `src/app/app-domain/social/**` | 0 |
| Demais diretórios exclusivos Social/Portal | 0 referências diretas |
| **Total** | **90** |

Inventário inicial: 203 arquivos de produção com referências diretas. As alterações permanecem locais. Build, typecheck, testes comportamentais e scripts com acesso ao banco não foram executados por esta frente; a validação pesada está coordenada pelo parent.

## Entrega implementada

- Social: schemas físicos de 23 tabelas, contratos independentes e repositories em `src/db/repositories/social/`. Leituras de todas as páginas, CadÚnico/RMA, políticas de sigilo/escopo, famílias canônicas, atendimentos, histórico individual, catálogos, profissionais, encaminhamentos, requisições, estoque próprio, cotas, comprovantes e notificações foram migrados.
- Entrega de benefício mantém locks da requisição e do benefício, avaliação obrigatória, cota vigente, baixa condicional do saldo, movimento único e atualização do item na mesma transação. Auditoria e notificações usam os repositories compartilhados com o mesmo `tx`.
- `social/beneficios/page.tsx` usa leituras Drizzle, inclusive secretarias/dotações/naturezas. A projeção de finanças em `src/db/schema/social-finance-options.ts` preserva datas e decimais, e não realiza mutações financeiras.
- Histórico de atendimentos de pessoa é filtrado em SQL por `personId` e política de acesso; não carrega o prontuário municipal para filtrar em memória.
- Portal: resolução da identidade a partir da sessão, consultas de agenda, vacinas, dispensações ativas, laudos liberados/publicados, encaminhamentos, documentos, campanhas, contatos e ouvidoria foram migrados para `src/db/repositories/health/patient-portal.ts`.
- Ouvidoria usa `nextYearlyCodeDrizzle({ db: tx, key: "OUV", prefix: "OUV", padding: 6, existingCodes })`; contador, manifestação, identidade opcional e auditoria compartilham transação. Registros anônimos não gravam `OmbudsmanIdentity`; listagem por pessoa continua limitada à identidade e exclui interações internas.
- Linha do tempo usa SQL parametrizado com os mesmos limites por origem e limite global. O vínculo do plano terapêutico foi conferido: a tabela da equipe é `HealthTeam`.
- Datas de consultas SQL brutas são hidratadas explicitamente em UTC por `src/db/repositories/health/timestamp.ts`: o driver Neon/Drizzle deixa `timestamp`/`date` como texto em `execute(sql)`. O generic da consulta não converte os valores em runtime.
- Ações programáticas (`care-program-service.ts`) migradas com upsert, validação de unidade/paciente, advisory lock por paciente/programa, verificação de sobreposição e encerramento com row lock.
- Consumidores de `executeConfiguredHealthHttp` em vacinação/farmácia passam `db` como primeiro argumento, conforme contrato compartilhado.
- `scripts/prepare-aurora-social-catalogs.ts` e `scripts/verify-health-s3.ts` migrados. Ambos continuam apenas preparados; não foram executados.
- Social financeiro: `createSocialBenefit` e `createSocialProgram` usam `createLegacyExpenseInTransaction(tx, input)` do parent na mesma transação dos vínculos, preservando a despesa legada `Empenhada`. Removidos `getTenantPrisma` e `ModuleOperation` das actions Social.
- Agenda/cadastro: profissionais, pacientes, endereços, equipes, unidades, administração, vínculos, horários, slots, agendas, acolhimento, espera, painéis e regulação usam Drizzle, com locks e snapshots preservados. Comprovante de agendamento e suas relações físicas foram convertidos.
- Assistência: `care-service`, `clinical-extension-service`, `prescription-service`, `clinical-document-service` e `care-lines-service` convertidos. Inclui condições/revisões, questionários, medicação contínua, administração e materiais com `applyStockMovement(tx, ...)`, exames, receitas, conclusão e GED transacional.
- Atenção primária/território: serviços convertidos para famílias canônicas, visitas, atenção domiciliar, atividade coletiva, alimentação e finalização de fichas e-SUS. Indicadores e séries anuais usam Drizzle; datas de vacinação/dispensação consultadas por SQL são hidratadas explicitamente.
- Produção: preços/vigências, captura de origens, fatos/revisões/críticas, competências, fechamento/reabertura, arquivos, prévias, custos e PDFs convertidos. Valores persistidos permanecem `Decimal` até a formatação, inclusive devoluções, reversões e rateio de diluente.
- AIH/APAC: laudos, numeração, decisões, renovação, cancelamento, pagamento manual e alta/óbito convertidos; telas de laudos, fatos, preços, produção e prévias acompanham os novos contratos.
- Consumidores clínicos: prontuário, complementos, linhas de cuidado, atendimento, indicadores e downloads de anexos usam consultas explícitas com os DTOs destinados às telas. Seleções não expõem colunas clínicas adicionais ao client.
- Rede e prestadores: contatos/expedientes, mantenedoras, convênios e coberturas convertidos; portal de guias/histórico mantém filtro pelo fornecedor. Documentos padrão usam o callback GED `afterCreate` com o mesmo `DatabaseTransaction` e mantêm `{ error }` nas actions chamadas pelo client.
- Catálogo físico independente do parent: corrigidas exatamente cinco nulabilidades em arrays — `HealthChronicAssessment.riskFactors/complications` e `HealthCollectiveActivity.themes/practices/participantIds` recebem `.notNull()`. Removidos os fallbacks `?? []` introduzidos nos consumidores desses campos. Entradas de domínio e contrato de acompanhamento já exigem arrays; DTOs raw com `LEFT JOIN` mantêm nulabilidade apenas das relações opcionais.
- Enum Social: `socialProcurementOriginPolicy = pgEnum("ProcurementOriginPolicy", ["NONE", "PROCUREMENT_SOURCE", "CONTRACT"])` preserva nome físico e labels ordenados. Parent confirmou que a divergência de identificador raw versus `format_type` quoted era falso positivo do verificador; nenhuma alteração adicional no enum ou DDL.

## Contratos e handoffs intermodulares

1. **Financeiro Social resolvido:** helper do parent integrado no mesmo `tx`, sem alterar a criação legada de `Expense` nem o fluxo de retorno das actions.
2. **Estoque patrimonial:** `applyStockMovement` já recebe `DatabaseTransaction` no trabalho compartilhado atual. Os consumidores Saúde residuais precisam migrar a unidade transacional inteira (recebimentos, transferências, dispensação, frascos/diluentes, inventário, requisições, judicial e kits). Não passar uma transação Prisma ao helper Drizzle nem criar movimentos fora da transação assistencial.
3. **GED/assinaturas:** os contratos compartilhados atuais incluem `ingestGedDocument` com callback `afterCreate(tx: DatabaseTransaction, documentId)` e `signDocumentVersionWithA1InTransaction`. Migrar os consumidores Saúde preservando atomicidade da vinculação clínica, versão documental, assinatura, auditoria e publicação.
4. **Portal / dependências transitivas:** agenda já usa `appointment-service.ts` convertido; carteira/certidão e página de saúde ainda dependem de `vaccination-registry-service.ts`/`vaccination-document-service.ts` legados. Não considerar o Portal integralmente migrado apenas porque seus diretórios já não contêm referências diretas.
5. **Agenda/assistência:** `runHealthTransaction` usa serializable, timeout total de 15.000 ms e até três tentativas de serialização/deadlock. `appointment-service.ts` reexporta a mesma função/classe de erro para preservar identidade. Grep global dos consumidores de `clinicalRecordForActor`, `registerProductionFactTx`, `captureCareIndicatorContext`, `recordPatientDeathInTransaction`, `createHealthAppointmentInTransaction`, `assertPatientRegistrationCurrent`, `assertProfessionalCanBook` e `treatmentReportForActor` encontrou Prisma residual apenas no teste integrado legado; isso não substitui a validação de tipos/SQL.
6. **Teste integrado legado:** `tests/health-checklist-internal-flows.test.ts` ainda depende de `Prisma.dmmf` e da fixture `createPlanningExecutionFixture`. Essa fixture e os serviços legados precisam ser alinhados ao banco Drizzle. O teste integrado não foi declarado compatível nem executado após as mudanças.

## Verificação realizada e testes preparados

Comando estático executado:

```text
node scripts/drizzle-health-social-check.mjs
```

Resultado atual: 337 arquivos de produção inventariados; 405 arquivos TS/TSX/JS auxiliares, schemas e produção analisados sintaticamente; zero erros de parsing; 52 arquivos TSX alterados comparados ao `HEAD`, com zero diferenças nos fragmentos JSX após normalização apenas de CRLF/LF. Essa verificação não faz typecheck nem valida SQL em runtime. A checagem estática adicional de imports locais não encontrou export ausente; a busca de propriedades de tabelas foi revisada manualmente nos casos de colunas herdadas por `...timestamps()` e variável local que sombreia `materials`.

`git diff --check` também passou para os arquivos rastreados alterados no escopo Saúde/Social/Portal, seus dois testes Social e os dois scripts de banco migrados.

O script é somente leitura: não abre conexão e não gera DDL. O JSON inclui todos os caminhos e todas as linhas com identificadores/imports Prisma. A análise é de referências diretas por AST e não substitui o rastreamento de dependências transitivas.

Testes preparados para execução sequencial pelo parent:

```text
node --conditions=react-server --import tsx --test --test-concurrency=1 tests/social-access-policy.test.ts tests/social-benefit-delivery.test.ts tests/patient-portal-drizzle.test.ts tests/patient-timeline-drizzle.test.ts
```

- Social access: consulta real de sigilo, envolvimento profissional, OWN/UNIT/MUNICIPAL, unidade confidencial e ausência de vínculo; validações de vigência/expediente.
- Social delivery: rejeição sem autorização ou vínculo, rollback de cota/item quando falta estoque, limite de saldo em entregas concorrentes, rejeição de reentrega/cota esgotada e rollback de item/saldo/cota/movimento quando a etapa transacional posterior falha.
- Portal: titularidade direta e por servidor, inatividade, isolamento de laudos, publicação, datas UTC/milissegundos, vagas, rollback de manifestação/identidade/contador por falha de auditoria, bootstrap da sequência, anonimato e exclusão de interações internas com limite de movimentos por manifestação.
- Linha do tempo: origens clínicas distintas, isolamento por paciente, datas UTC, cancelamento de dispensação, links, equipe terapêutica, ordenação e limite global.

Os quatro testes usam `tests/helpers/local-drizzle-database.ts`: PGlite isolado com transporte WebSocket e o driver Neon/Drizzle de produção. Foram removidas as fixtures node-postgres dos dois testes Social, eliminando a necessidade de mascarar incompatibilidade de `NodePgTransaction` com `DatabaseTransaction`.

Parent informou aprovação dos testes Portal e linha do tempo, incluindo anonimato e rollback. Esta frente não executou testes comportamentais. Cobertura ainda pendente de confirmação: Social, actions ponta a ponta, famílias canônicas/rollback, ações programáticas, agenda/regulação/produção, estoque assistencial/financeiro, carteira/certidão vacinal e testes integrados legados. Typecheck estrito e execução de schemas aguardam RAM/coordenação sequencial do parent.

## Inventário residual exato — produção

Os caminhos abaixo são relativos aos diretórios indicados. O script acima fornece todas as linhas atualizadas.

### `src/lib/saude/` — 34

```text
followup-exchange-service.ts
followup-receiver-service.ts
followup-source-service.ts
health-merge-service.ts
health-report-extra.ts
health-report-service.ts
health-stock-service.ts
laboratory-service.ts
pharmacy-catalog-service.ts
pharmacy-dispensation-service.ts
pharmacy-inventory-service.ts
pharmacy-invoice-service.ts
pharmacy-judicial-document.ts
pharmacy-judicial-service.ts
pharmacy-kit-service.ts
pharmacy-request-policy.ts
pharmacy-request-service.ts
raas-source-service.ts
sisab-service.ts
specialized-care-service.ts
sus-import-service.ts
tfd-clinical-service.ts
tfd-document-service.ts
tfd-report-service.ts
tfd-service.ts
tfd-transport-service.ts
tfd-trip-document.ts
vaccination-active-search.ts
vaccination-document-service.ts
vaccination-form-options.ts
vaccination-registry-service.ts
vaccination-service.ts
vaccination-stock-service.ts
vigilance-service.ts
```

### `src/app/app-domain/saude/` — 45

```text
acompanhamento/page.tsx
acompanhamento/receptores/[id]/page.tsx
acompanhamento/remessas/[id]/page.tsx
administracao/importacoes/actions.ts
administracao/importacoes/page.tsx
administracao/laboratorio/actions.ts
administracao/laboratorio/page.tsx
administracao/page.tsx
administracao/unificacoes/actions.ts
administracao/unificacoes/page.tsx
centro-especializado/page.tsx
farmacia/actions.ts
farmacia/catalogo/page.tsx
farmacia/chamadas/page.tsx
farmacia/dispensacoes/actions.ts
farmacia/dispensacoes/page.tsx
farmacia/inventario/page.tsx
farmacia/judicial/actions.ts
farmacia/judicial/page.tsx
farmacia/kits/page.tsx
farmacia/notas/page.tsx
farmacia/page.tsx
farmacia/requisicoes/actions.ts
farmacia/requisicoes/page.tsx
gerencial/page.tsx
integracoes/page.tsx
laboratorio/actions.ts
laboratorio/page.tsx
producao/raas/page.tsx
relatorios/page.tsx
sisab/page.tsx
tfd/laudos/[id]/page.tsx
tfd/laudos/actions.ts
tfd/laudos/page.tsx
tfd/page.tsx
tfd/viagens/[id]/page.tsx
tfd/viagens/actions.ts
tfd/viagens/page.tsx
vacinacao/actions.ts
vacinacao/carteira/[id]/page.tsx
vacinacao/esavi/page.tsx
vacinacao/gestao/actions.ts
vacinacao/gestao/page.tsx
vacinacao/page.tsx
vigilancia/page.tsx
```

### `src/app/api/saude/` — 11

```text
acompanhamento/receptores/[contract]/route.ts
acompanhamento/remessas/[id]/retorno/route.ts
acompanhamento/remessas/[id]/route.ts
farmacia/judicial/[id]/anexo/[documentId]/route.ts
farmacia/judicial/[id]/extrato/route.ts
producao/raas-origens/route.ts
sisab/lotes/[id]/route.ts
tfd/[id]/documento/route.ts
tfd/relatorio/route.ts
tfd/viagens/[id]/documento/route.ts
vacinacao/carteira/[id]/documento/route.ts
```

## Inventário residual exato — scripts/testes auxiliares

```text
scripts/import-health-care-catalogs.ts
scripts/load-sigtap-base.ts
scripts/prepare-aurora-health-identifiers.ts
scripts/verify-aurora-pharmacy-journey.ts
scripts/verify-b1.ts
scripts/verify-s4-ab.ts
scripts/verify-s4-cd.ts
scripts/verify-s4-close.ts
scripts/verify-s4-final.ts
scripts/verify-s5.ts
tests/health-checklist-internal-flows.test.ts
```

`verify-b1.ts` tem escopo misto; coordenar a parte não-Saúde com o parent antes de editar. A fixture compartilhada do teste integrado está fora da responsabilidade exclusiva desta frente.
