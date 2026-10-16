# POC Ibema — diagnóstico e plano consolidado para 100% dos checklists

**Referência:** 12/10/2026. **Natureza:** análise documental/técnica e plano de desenvolvimento, ajustes, integração e homologação. **Meta:** atendimento integral de cada requisito e de seus subcritérios, por módulo e por ente.

**Atualização de execução — 13/10/2026:** a [revisão dos três domínios](poc-p0/REVISAO_TRIBUTACAO_FINANCEIRO_CONTROLE_2026_10_13.md) registra a implementação local de NFS-e/escrita/débito, transferência fiscal ITBI após quitação, perfis contábeis DA e devoluções corrente/anterior de diárias. Essas alterações mais recentes ainda não passaram pela rodada final de validação. A matriz diagnóstica abaixo conserva seu corte original e não constitui evidência de aceite das novas entregas. P1–P4 não substituem as exigências P5–P10: o planejamento integral permanece aberto.

## 1. Conclusão executiva e decisões confirmadas

O produto possui bases operacionais relevantes em Tributação, Financeiro/Contabilidade e Planejamento. Entretanto, **a existência de serviços, telas, modelos e testes não comprova 100% dos checklists**. As principais frentes são:

1. Fechar o escopo por entidade e unidade gestora na escrituração e nos relatórios, permitindo Prefeitura, Câmara e consolidação autorizada sem misturar fatos.
2. Corrigir as integrações internas de arrecadação, estornos, dívida ativa, renúncias, restituições, folha, compras, patrimônio e orçamento antes de consumir seus resultados em Custos e Controle Interno.
3. Completar os comportamentos fiscais/cadastrais e financeiros específicos exigidos nos checklists: cadastros temporais, parametrização, operações em lote, etapas intermediárias, prestações de contas e fechamento/abertura.
4. Implantar Gestão e Controle de Custos em Financeiro e o ciclo funcional de Gestão de Controle Interno em Auditoria, reaproveitando os registros canônicos e a base inicial de apontamentos.
5. Adequar os demonstrativos e documentos aos layouts e composições aplicáveis. Os relatórios financeiros atuais identificam explicitamente sua condição **interna/não estatutária**; não se resolve isso retirando o aviso.
6. Finalizar os intercâmbios externos por arquivo e os conectores nas últimas fases, depois de estabilizar os fatos e classificações internas que os alimentam.
7. Executar aceites individuais: **1.052 requisitos em 15 checklists**, sem média entre módulos e sem promover item parcial a atendido.

### 1.1 Diretrizes confirmadas com o usuário

- Incluir **Prefeitura e Câmara** em Planejamento e Gestão Contábil e Financeira, com homologação independente.
- Incluir integralmente os **31 requisitos de Custos**.
- Reorganizar a ordem por dependência, mantendo correspondência com F11/F12 e S1–S9 anteriores.
- Incluir integralmente Controle Interno, IPTU, ISS, ITBI, Receitas Diversas, Arrecadação, Dívida Ativa, Nota Fiscal Eletrônica, Escrita Fiscal e Fiscalização Fazendária.
- Entregar o plano em Markdown na pasta `docs`.

### 1.2 Limites da conclusão atual

Esta revisão confrontou o checklist funcional local, os planos/evidências existentes, o schema, serviços, consumidores e rotas relevantes. Não executou os 1.052 roteiros autenticados, não aplicou migrations e não conferiu o banco operacional. Portanto:

- **Não se declara percentual atual de atendimento integral**, nem aptidão para a POC.
- `PARCIAL` significa base identificada com lacuna concreta; `NÃO ATENDE` significa ausência do comportamento suficiente no recorte verificado; `NÃO VERIFICADO` exige comprovação específica antes de decidir por desenvolvimento.
- As matrizes agrupadas abaixo **cobrem todos os números locais**, mas não atribuem aprovação individual a um grupo. Em grupo com bases heterogêneas, a situação é diagnóstica; cada linha oficial deve ter sua própria evidência no aceite.
- Resultados de testes citados dos documentos anteriores são históricos, não execução nesta entrega.
- Requisitos transversais de cadastro único, permissões, documentos, assinatura, relatórios e publicação entram como dependências dos blocos analisados. A meta deste documento não representa homologação dos outros módulos nem dos 100 itens tecnológicos.

## 2. Fontes, identificação e denominadores

### 2.1 Fonte funcional e convenção de IDs

Fonte funcional local: [`Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`](Termo%20de%20Referencia/Checklist%20real%20POC%20M%C3%93DULOS%20EXECUTIVO%20e%20CAMARA.pdf), 344 páginas. Foi extraído o texto para localizar os blocos e conferir a sequência de números. **Páginas abaixo são desse PDF local**, diferentes da paginação integral do edital.

O [`CHECKLIST_POC_IBEMA_CODEX.md`](CHECKLIST_POC_IBEMA_CODEX.md) define as regras de evidência e a fonte oficial soberana. Havendo divergência de redação, prevalece o edital/TR oficial. Usar `EXE-02.177`, por exemplo, para o **item local 177 de Gestão Contábil e Financeira**; não confundir com o número global `1.xxx` da especificação descritiva ou comentários `TRI-xxx` no código.

| Checklist | Área do produto | Páginas locais | Total/meta 100% | Mínimo contratual 90% |
|---|---|---:|---:|---:|
| EXE-01 — Planejamento e Orçamento | Planejamento | 1–13 | 99 | 90 |
| LEG-01 — Planejamento e Orçamento | Câmara/Planejamento | 256–267 | 99 | 90 |
| EXE-02 — Gestão Contábil e Financeira | Financeiro e Contábil | 13–35 | 189 | 171 |
| LEG-02 — Gestão Contábil e Financeira | Financeiro e Contábil, escopo Câmara | 267–289 | 189 | 171 |
| EXE-03 — Gestão de Controle Interno | Auditoria/Controle Interno | 35–40 | 36 | 33 |
| EXE-04 — Gestão e Controle de Custos | Financeiro/Custos | 40–44 | 31 | 28 |
| EXE-12 — Gestão de IPTU | Tributação | 98–102 | 30 | 27 |
| EXE-13 — Gestão de ISS | Tributação | 102–107 | 41 | 37 |
| EXE-14 — Gestão de ITBI | Tributação | 107–110 | 26 | 24 |
| EXE-15 — Gestão de Receitas Diversas | Tributação | 110–111 | 9 | 9 |
| EXE-16 — Gestão de Arrecadação | Tributação | 111–121 | 56 | 51 |
| EXE-17 — Gestão de Dívida Ativa | Tributação | 121–126 | 28 | 26 |
| EXE-24 — Nota Fiscal Eletrônica | Tributação/NFS-e | 169–174 | 59 | 54 |
| EXE-25 — Gestão e Escrita Fiscal | Tributação/Escrita Fiscal | 174–181 | 65 | 59 |
| EXE-26 — Gestão e Fiscalização Fazendária | Tributação/Fiscalização | 181–192 | 95 | 86 |
| **Total de controle do escopo** | **15 checklists; não usar média para aprovação** | — | **1.052** | **Não se aplica globalmente** |

Os dois blocos Contábil/Financeiro possuem 189 números locais. Usar a mesma implementação quando os comportamentos coincidirem; conferir a redação e os subcritérios de cada ente no aceite. Custos e Controle Interno não possuem bloco legislativo próprio nesse checklist: arquitetura por entidade não cria um denominador contratual adicional.

### 2.2 Documentos técnicos prévios incorporados

- [`PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md`](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md): matriz histórica dos 99 comportamentos e retomada S1–S9.
- [`PLANEJAMENTO_S1_CONTABILIDADE_EVIDENCIAS.md`](PLANEJAMENTO_S1_CONTABILIDADE_EVIDENCIAS.md), [`PLANEJAMENTO_S2_EXECUCAO_FINANCEIRO_COMPRAS_EVIDENCIAS.md`](PLANEJAMENTO_S2_EXECUCAO_FINANCEIRO_COMPRAS_EVIDENCIAS.md), [`PLANEJAMENTO_S3_S7_EVIDENCIAS.md`](PLANEJAMENTO_S3_S7_EVIDENCIAS.md) e [`PLANEJAMENTO_S8_S9_PUBLICACAO_E_ENSAIO.md`](PLANEJAMENTO_S8_S9_PUBLICACAO_E_ENSAIO.md): evolução posterior ao diagnóstico inicial.
- [`EVIDENCIAS_PLANEJAMENTO_PREFEITURA.md`](EVIDENCIAS_PLANEJAMENTO_PREFEITURA.md) e [`EVIDENCIAS_PLANEJAMENTO_CAMARA.md`](EVIDENCIAS_PLANEJAMENTO_CAMARA.md): 99 controles independentes por ente; ensaio integral ainda pendente no registro consultado.
- [`PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md`](PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md) e [`ANALISE_ADERENCIA_CUSTOS_CONTROLE_INTERNO.md`](ANALISE_ADERENCIA_CUSTOS_CONTROLE_INTERNO.md): matrizes dos 31 + 36 requisitos, a reutilizar sem duplicar backlog.
- [`CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md`](CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md): origens de custo e riscos de dupla contagem.
- [`CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md`](CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md), [`ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md`](ANALISE_NOVOS_DOCUMENTOS_IBEMA_2025_2026.md) e [`COMPARACAO_DOCUMENTAL_IBEMA_001_141.md`](COMPARACAO_DOCUMENTAL_IBEMA_001_141.md): IDs documentais estáveis, modelos, competências, divergências e limites de carga.

## 3. Inventário técnico: funcionalidades existentes e limites

Os caminhos de interface são rotas expostas pelo produto; seus arquivos ficam em `src/app/app-domain/`. Referências a serviços nesta seção são evidências de implementação, não de homologação funcional integral.

| Área | Evidência real no repositório | O que reaproveitar | Lacuna/limite observado |
|---|---|---|---|
| Execução da despesa | `src/lib/financeiro/index.ts`: `createExpenseRequest`, `createBudgetReservation`, `createCommitment`, `createCommitmentMovement`, `createSettlement`, `createPayment`, estornos | Reservas, empenhos ordinário/global/estimativo, retenções, documentos financeiros, partidas e locks; telas `/financeiro/empenhos`, `/liquidacoes`, `/pagamentos` | Não comprova subempenhos, estornos parciais de todos os estágios, múltiplos documentos/itens na liquidação, todas as consultas inter-relacionadas e automações da folha |
| Contabilidade | Mesmo serviço: `postAccountingTransactionInTransaction`, `postAccountingEventInTransaction`, fechamentos mensais e anual; `/financeiro/contabilidade` | Partidas balanceadas, autoria, evento, origem, chave idempotente, recusa de competência fechada no motor canônico | `AccountingTransaction`/`AccountingEntry` não têm entidade/UG ou dimensões MSC explícitas; validação de conta encontrada não comprova conta de último nível; uma regra D/C não cobre toda a matriz pública |
| Receitas/tesouraria | `recordConfirmedRevenue`, `launchRevenue`, `collectLaunchedRevenue`, `reverseRevenue`, redistribuição de fonte, transferências, saldos e boletim | Arrecadação contábil e financeira na mesma transação, integração de realizado ao Planejamento | Relação permitida natureza × fonte × banco precisa ser completada: na arrecadação a fonte da conta é tratada como indicação padrão, não uma lista de vínculos permitidos |
| Restos e encerramento | `prepareAnnualAccountingClose`, `trackPayableCarryForwardPayment`, `cancelPayableCarryForward`, `reregisterPayableCarryForward`, `finalizeAnnualAccountingClose` | Apuração de processado/não processado, eventos, acompanhamento e segregação de fechamento | Cancelamento examinado altera status/evento sem contabilizar o cancelamento; fechamento final altera estados sem gerar toda a escrituração de encerramento/abertura/transportes exigida |
| Conciliação | `reconciliation-engine.ts`, `importBankStatementCsv`, conciliação com tesouraria e sessões/matches no schema; `/financeiro/conciliacao-bancaria` | Base de extratos, vínculos, pendências e consultas | CSV/importação de DTO não comprova leitura real de OFC/OFX; verificar N:N, parcial, saldo pendente, transporte mensal e emissão histórica |
| Relatórios financeiros | `relatorios-legais.ts`, `report-delivery.ts`, `report-definition.ts`, `report-export.ts`, `/financeiro/relatorios` | Diário, razão, balancetes, sínteses RREO/RGF/balanços, CSV/PDF/XLSX/TXT e snapshots internos | `NOT_STATUTORY`, `INTERNAL_REVIEW`/`INTERNAL_PARTIAL`; filtro contábil de UG recusado; entrega principal tem exercício/tipo/mês, não todos os filtros do edital; DVP calculável não significa opção final completa de emissão |
| Motor tributário | `src/lib/tributacao/index.ts`, `fiscal-engine.ts`, `s2-service.ts`; `/tributacao/motor-fiscal`, `/operacoes`, `/guias` | Lançamento Decimal, memória, parâmetros, guias parciais/agrupadas, crédito, retorno controlado, certidões e mapeamento financeiro | Parametrização e registros genéricos não comprovam todos os formulários/ações; guia agrupada cria guias individuais com groupId, sem comprovar uma guia bancária única |
| IPTU/cadastro imobiliário | `property-cadastral-engine.ts`, `imoveis/property-actions.ts`, `/tributacao/imoveis`, `/base-territorial` | Prévia de valor venal/IPTU, subunidade e fração, cópia de características, registros auxiliares | Prévia isolada não oferece todo o cálculo anual/lote efetivável; cópia de características não equivale a copiar N cadastros; cadastro temporal, bloqueio supervisor e desmembramento/remembramento precisam fechamento |
| ISS/cadastro econômico | `economico/actions.ts`, `/tributacao/economico`, `/alvaras`, registros fiscais; `TaxServiceActivity` | Inscrição, CNAE principal, regime e ativação; serviços e alíquotas | CRUD principal examinado cria/edita poucos campos e não registra por si só todas as mudanças com antes/depois; relacionamentos de sócios/contador/endereço, consultas históricas e regras de alvará exigem integração completa |
| ITBI | `s3-service.ts`, `s3-engine.ts`, `/tributacao/itbi` | Declaração, fração transmitida, adquirentes, protocolo, análise, cálculo e DAM | Transferência automática ocorre em aprovação, não em pagamento; usa primeiro adquirente no cadastro; falta concluir múltiplos imóveis/unidades, modalidades, retificação e jornada dos tabelionatos |
| NFS-e e DMS | `s4-service.ts`, `s4-engine.ts`, `nfse-danfse.ts`, `/tributacao/nfse`, rotas XML/PDF, consulta pública | Credenciamento, emissão, uma atividade, cálculo, declaração do prestador, RPS, substituição, cancelamento, carta e avulsa | Prazo de cancelamento fixo em sete dias; seleção de parâmetro não filtra vigência pela competência; falta escrita automática do tomador, reversão fiscal consistente e ciclo completo de configuração/canais |
| Simples Nacional | `s5-service.ts`, `s5-engine.ts`, `/tributacao/simples-nacional` | Importação normalizada, divergências, comunicação e preparação de exclusão | Arquivo de exclusão é `CELERIFLOW_SN_EXCLUSAO_INTERNA_V1`, não layout da Receita; entrada de linhas normalizadas não comprova parser TXT oficial |
| DES-IF | `s6-service.ts`, `s6-engine.ts`, `/tributacao/iss-bancario` | Instituição/dependência, COSIF/PGCC/tarifas, validação, apuração, guias e fiscalização | Recebimento usa payload estruturado; não comprova quatro módulos ABRASF a partir dos arquivos originais, todas as partidas/rateios e devoluções exigidas |
| Fiscalização | `s7-service.ts`, `s7-engine.ts`, `inteligencia-tributaria-engine.ts`, `/tributacao/fiscalizacao` | Planos/ordens, TIAF, documentos, mapa/autuação, DTE, malhas, regras e produtividade | Concluir subcritérios de homologação, recursos, ESTBAN/cartões, relatórios e plantões; rotina demonstrativa de produtividade não comprova escala mensal real com feriados e ACL |
| Cobrança/benefícios | `s8-service.ts`, `s8-engine.ts`, `/tributacao/cobranca` | Parcelamento, pagamentos, reparcelamento, status, regras de benefício e acesso portal | Conferir termos legais, vigência, rescisão/imputação, antecipação e execução automática; benefício tributário não está comprovado como renúncia contábil/orçamentária completa |
| Dívida ativa | `s9-service.ts`, `s9-engine.ts`, `cda-pdf.ts`, `/tributacao/divida-ativa` | Inscrição, validação, CDA/versionamento, suspensão, livro consultivo, protesto e execução internos | Livro limita 500 registros; baixa/prescrição/devolução não demonstram partidas integradas; pagamento e atualização da dívida ocorrem em transações distintas; protesto usa remessa interna |
| Planejamento | `src/lib/planejamento/*`, páginas/componentes próprios e `/camara/planejamento/*` | PPA/LDO/LOA canônicos, catálogos, revisões, emendas, créditos, cotas, realizado, ponte contábil, GED/legislativo, relatórios/publicação | S1–S8 evoluíram tecnicamente; registros S9 mantêm 198 aceites não executados; referências normativas, implantação e homologação visual continuam necessárias |
| Controle Interno | `/controle-interno`, `src/lib/c7/operations-service.ts`, `InternalControlPlan`/`InternalControlFinding`; `/auditoria`, `src/lib/platform/audit-*` | Planos, apontamentos, responsável, evidência, prazo e resolução; logs técnicos rastreáveis | Não há ciclo suficiente de checklist/questionário/diagnóstico/agenda/publicação/relatório para os 36 requisitos; área funcional em Auditoria precisa implantação |
| Custos | `CostCenter`, orçamento, liquidação, RH, estoque e patrimônio; plano F11 existente | Dimensão organizacional e produtores dos fatos | Não foi localizado domínio operacional completo de objetos/itens/agregadores/apropriações/estornos e suas telas; centro de custo não substitui objeto de custo |

### 3.1 Achados prioritários com evidência concreta

| ID interno | Problema | Evidência | Requisitos afetados | Ação e prova de correção |
|---|---|---|---|---|
| GAP-01 | Escopo multientidade incompleto no ledger financeiro | `FinancialYear.year @unique`; `AccountingTransaction` sem ente/UG; `generateDiarioContabil`/razão/balancete recusam filtro de unidade | CF 4, 106–113; Planejamento e Controle Interno 1 | Definir vínculo canônico da UG ao ente, escopo no lançamento e em todas as consultas; dois entes com mesma competência, contas compartilhadas e saldos distintos |
| GAP-02 | Dois caminhos podem contabilizar o mesmo retorno tributário | `confirmTaxPayment` → `recordConfirmedRevenue` → `RECEITA_ARRECADADA`; `processBankReturnAction` chama adicionalmente `sendAccountingReference` | CF 116, 177–180; Arrecadação 44–45 | Reconciliar se eventos representam estágios distintos; se representam o mesmo fato, eliminar duplicidade preservando trilha. Demonstrar uma escrituração por estágio/origem e replay seguro |
| GAP-03 | Ponte tributária alternativa contorna guardas do motor financeiro | `sendAccountingReference` escolhe `rules[0]` com `take: 1` e cria `AccountingTransaction` diretamente | CF 1, 3, 6, 72–74, 91; Arrecadação 44 | Reusar motor canônico com evento por tipo, competência, conta analítica, escopo e idempotência com validação de conteúdo; recusar regra ambígua e mês fechado |
| GAP-04 | Estorno financeiro de receita tributária é bloqueado sem reversão tributária completa localizada | `reverseRevenue` recusa `taxIntegration`; busca de consumidores não localizou comando completo de estorno tributário | CF 177–181; Arrecadação 27–32, 44; Dívida 25 | Comando coordenado de reversão de pagamento, guia, crédito, receita, tesouraria, contabilidade e realizado; parcial/total conforme exigido e sem apagar histórico |
| GAP-05 | Retorno com valor excedente possui aplicação fragmentada | `processCollectionReturn` confirma até o saldo da guia, depois cria crédito/excedente e evento fora da transação inicial | Arrecadação 27–32, 44; CF 177, 180–181 | Contabilizar o total recebido, distinguindo baixa e crédito/passivo do excedente; falha/retry não perde nem duplica crédito ou recebimento |
| GAP-06 | Débito histórico depende do exercício do lançamento aberto | `confirmTaxPayment` abre `guide.assessment.year` e exige pagamento dentro daquele ano | Dívida 9, 15, 17, 25, 27; Arrecadação 19/27; CF 177/179 | Separar exercício de origem do crédito e exercício da arrecadação; receber dívida de ano encerrado no ano corrente, com classificação adequada |
| GAP-07 | Atualização de dívida/baixa por protesto pode divergir de tesouraria | `settleDebtByGuide` confirma pagamento antes de outra transação; `resolveProtestItem` pode marcar dívida paga sem confirmar receita | Dívida 15, 23–25; Arrecadação 44 | Vincular guia à dívida, validar valor/origem e atualizar saldos/eventos coordenadamente; retorno de protesto não deve presumir recebimento inexistente |
| GAP-08 | ITBI transfere antes do gatilho exigido | `analyzeItbiDeclaration` atualiza `realEstate.taxpayerId` em `AUTO_ON_APPROVAL` e usa primeiro adquirente | ITBI 5–6, 18–22 | Configuração de transferência no pagamento, titularidades/percentuais e histórico; aprovação não paga não transfere quando essa for a regra |
| GAP-09 | NFS-e e escrita podem manter imposto de nota cancelada/substituída | `emitNfse` cria `TaxDeclaration`; cancelamento muda invoice/evento, substituição emite nova nota antes de vincular versões | NFS-e 10–11, 21–28, 41; Escrita 4, 15, 24 | Mesma transição fiscal para nota/escrita/débito/crédito; regra temporal configurável; atomicidade/idempotência e proteção de notas automáticas |
| GAP-10 | Folha integrada somente até solicitação de despesa | `rh/finance-bridge.ts`: resultado `committed: false, paid: false`; `provision-commitment.ts` baixa direito/provisão no empenho | CF 17–22; Custos 24–25 | Completar empenhos por tipo, críticas, liquidação/retenções, pagamento e reversões; conciliar provisões contábeis e baixa no pagamento exigida pelo checklist |
| GAP-11 | RGF simplificado não é composição fiscal por ente | `generateRGF`: receitas do exercício e empenhos 3.1; limites fixos 54/48,6; zero RCL produz percentual zero | CF 1/60; Controle 23/34; Planejamento 31/51/98 | Motor fiscal comum com janela de 12 meses, exclusões/ajustes e particularidades legislativas; ausência de base gera não apurado, não regularidade |
| GAP-12 | Fechamento e RP têm acompanhamento, mas não escrituração integral | Cancelamento de RP e fechamento final verificados sem chamadas de postagem; `AccountingEntry.transactionId` opcional | CF 29/37, 93–105 | Completar eventos de cancelamento, inscrição, fechamento, abertura, reapuração e transportes; reconciliar partidas legadas sem transação e bloquear novas partidas órfãs |

**Prioridade:** GAP-01–12 são estruturais/P0 para o requisito afetado. Não esperar banco, Receita Federal ou TCE para corrigir esses fluxos internos.

## 4. Matriz de Gestão Contábil e Financeira — Prefeitura e Câmara

Convenção: **CF n = EXE-02.n e LEG-02.n**, com validação de redação e aceite separados. Toda a sequência **1–189** está coberta abaixo. `NÃO VERIFICADO` não autoriza reimplementar: primeiro localizar a implementação/consumidores e provar o comportamento. “Base parcial” indica reaproveitamento, sem aprovação do conjunto.

| Itens CF | Comportamentos do checklist | Situação diagnóstica / base | Trabalho para integralidade | Fases |
|---|---|---|---|---|
| 1–6 | Escrituração normativa, arquivos, vínculo à origem, unidades/consolidação, três estágios, bloqueio por período | PARCIAL; motor financeiro e relatórios internos | Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração | P1–P3, P9–P10 |
| 7–13 | Tipos, subempenho, históricos, filtro de dotação, saldos histórico/atual, autônomo, duplicação | PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios | Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas | P3–P4, P9 |
| 14–16 | Apropriação mensal de seguros/assinaturas, adiantamentos/controle, anulação parcial/total e nota | PARCIAL na anulação; demais NÃO VERIFICADOS | Competência e cronograma automático; contas de controle e baixa por prestação; nota de estorno e efeito líquido por origem | P3–P4 |
| 17–22 | Empenhos por tipo de folha, críticas, provisões/encargos, liquidação/retenções, desmovimentação, fluxo digital até todos pagos | PARCIAL; ponte RH gera despesas e direitos | Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos | P4 |
| 23–26 | Ordem de compra, desdobramento homogêneo, contrato único, reserva automática e estorno de itens | PARCIAL; recebimento aprovado → despesa/reserva/empenho | Cobrir requisição/ordem antes do recebimento quando exigido; contrato/licitação acessíveis; agrupamento por desdobramento e centro; baixa da reserva e devolução dos itens | P4 |
| 27–29 | Consultas relacionadas de empenho/RP; cancelamento com valores processado/não processado | PARCIAL; vínculos e acompanhamento RP | Detalhe navegável de todos os fatos, anexos/processo/assinantes/partidas; cancelamento com saldo e evento contábil | P3–P4, P7 |
| 30–35 | Extras das retenções, sem empenho prévio, múltiplas NFs/estrangeiro, duplicidade, estorno parcial/substituição, itens | PARCIAL; `createSettlement` aceita documento e retenções | Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto | P3–P4 |
| 36–41 | Consulta DANFE, partidas de emissão/estorno/RP, digitalizados, débitos do credor, vigência/saldo contratual e licitatório | PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS | Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP | P2–P4, P7, P10 |
| 42–46 | Em liquidação/ativo/VPD/itens, relatório, bloqueio valor/percentual, consulta por modalidade, multas de trânsito | NÃO VERIFICADO no fluxo completo; orçamento/Frotas reutilizáveis | Reconhecimento intermediário contábil, material em verificação e relatório; bloqueio/desbloqueio com partidas e critérios; multa/infrator/controles da origem | P3–P4, P7 |
| 47–50 | Assinaturas, razão cronológico navegável, superávit por ente/consolidado, SEFAZ | PARCIAL em documentos/origens; superávit/SEFAZ NÃO VERIFICADOS | Fluxo de todos os assinantes; razão de movimentos; superávit/suplementado/saldo por fonte e ente; conector SEFAZ ao final | P3, P7, P10 |
| 51–58 | Obras completas/medições/anexos/transparência; relatórios de dotação, bens e empenhos/RP com filtros/consolidação | PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS | Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações | P4, P7 |
| 59–60 | Todas as variantes dos anexos de execução LOA com publicação e os demonstrativos/gráficos de audiência | PARCIAL; datasets internos e Planejamento | Cada anexo e alínea do PDF, com mesma classificação/corte; amortização, ata, metas nominal/primária, pessoal, receita/despesa, arrecadação/desembolso, transferências, investimentos, suprimentos à Câmara, saúde/educação/renúncia | P7 |
| 61–62 | Diárias/adiantamentos, roteiro configurável, empenho final e prestação com contabilidade | NÃO VERIFICADO no fluxo integral; processos/RH/GED disponíveis | Solicitação, aprovação por roteiro, autorização, empenho automático, concessão, prestação/restituição e partidas vinculadas | P4, P7 |
| 63–71 | Prestação online, valores do beneficiário, anexos, revisão, aprovação/partidas; convênios/contas automáticas; atrasos/bloqueio | PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO | Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento | P4, P7 |
| 72–77 | Eventos e prévia de partidas, conta analítica, sistemas em partidas dobradas/diário, extras/estornos/assinatura | PARCIAL; eventos, retenções, documentos | Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura | P3–P4, P7 |
| 78–82 | Consórcios e prestação, precatórios e juros/cancelamento/baixa TJ, empenhos e relatório | NÃO VERIFICADO no ciclo suficiente | Cadastros, anexos, movimentações, vínculos e lançamentos simultâneos; relatório saldo inicial/movimentos/final; baixa informada pelo TJ sem criar API não exigida | P4, P7 |
| 83–90 | Dívida fundada/campos TCE, parcelas/comparativos, contas herdadas, atualizações/curto prazo; PPP/parcelas/anexos/empenhos | PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS | Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional | P4, P7 |
| 91–99 | Fechar mês, patrimônio/depreciação/exaustão/amortização, abertura orçamento/exercício/MSC, reabrir saldos, superávit, críticas/etapas | PARCIAL; mensal, ponte Planejamento, patrimônio | Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas | P3–P4, P7, P9 |
| 100–105 | Transportar programações, estimativos, inscrição individual RP, partidas de encerramento, extras e desfazimentos independentes | PARCIAL na inscrição RP; demais NÃO VERIFICADOS | Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores | P3–P4 |
| 106–113 | Consulta única de partidas/origem/usuário/contas correntes; saldos mensais/fontes; seleção/soma; balancetes/diário/razão/termos/disponibilidade | PARCIAL; consultas e relatórios básicos | Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras | P3, P7, P9 |
| 114–115 | DARF/PASEP/GPS/recibos IRRF/ISS; extras emitidas/estornadas/pagas com filtros/totalizações | NÃO VERIFICADO nas saídas integrais | Documentos aplicáveis ao período com cálculo/origem; extratos e relatório consolidado sem duplicar retenção/pagamento | P7, P9 |
| 116–120 | Tesouraria contábil, consulta de empenho/RP/extras/retenções, visualizar/estornar/partidas/anexos, filtros assinatura/FUNDEB/FMS e duplicações | PARCIAL; receitas/pagamentos integrados | Consulta unificada e filtros exigidos; duplicar todos os cinco tipos com nova identidade e novas validações; estornos coordenados | P2–P3, P7 |
| 121–132 | Múltiplas fontes por banco, receitas/deduções em lote, classificação/fonte, extras, MSC, lançamentos imediatos, estornos e FUNDEB automático | PARCIAL; classificação/receita/postagem | Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento | P2–P3, P9 |
| 133–139 | Movimento/aplicação/resgate, saldos por fonte, partidas/estornos/anexos/borderô e transferências entre entidades | PARCIAL; tesouraria e banco virtual | Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental | P3–P4, P7, P10 |
| 140–146 | Diárias publicadas, lotes de liquidações/extras/RP, saldo no pagamento, vencimento/ordem cronológica, borderô/individual | PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS | Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte | P3–P4, P7 |
| 147–149 | Retorno bancário, baixa automática/borderô e opção de baixa no envio | NÃO VERIFICADO em banco oficial; base SIMULADO POC | Remessa/retorno oficiais, configuração explícita de quando reconhecer o pagamento, conciliação de rejeições/retornos parciais | P9–P10 |
| 150–157 | Estornos contábeis, filtros/lotes, extras em lote, pré-autorizados, total/parcial, ordens e cheques | PARCIAL; pagamento/estorno básicos | Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única | P3–P4, P7 |
| 158–168 | Conciliação conjunta, OFC/OFX, pendências manuais/automáticas/transportadas, N:N/parcial, históricos, filtros/ordenação e relatórios | PARCIAL; engine/sessões/extrato CSV | Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final | P3, P7, P9 |
| 169–176 | Partidas/estornos por pagamento, a pagar por unidade, autorização/assinantes borderô, diário, receitas mensais/3 anos/planilha, extrato credor | PARCIAL nas bases; saídas completas NÃO VERIFICADAS | Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP | P3, P7, P10 |
| 177–181 | Tributação: lançamento/arrecadação/recolhimento, renúncias, dívida ativa, prévia/críticas e restituição conforme exercício | PARCIAL com lacunas confirmadas GAP-02–07 | Eventos por estágio, todas as extinções/benefícios, dívida/estornos, prévia bloqueante, dedução no ano corrente ou empenho no anterior | P2 |
| 182–189 | Assinatura OP/comprovante e participantes configuráveis, multas trânsito publicadas, pagar seleção, anexos, relatório completo e portal fornecedor | PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO | Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos | P3–P4, P7 |

**Câmara:** validar os mesmos números em escopo legislativo, matriz contábil/assinantes próprios, duodécimos/transferências e índices conforme aplicação legal. Limites de pessoal do Executivo não podem ser reutilizados silenciosamente. Dados municipais do pacote `Novos docs` não provam saldos/cadastros da Câmara.

## 5. Matriz tributária — nove checklists independentes

### 5.1 EXE-12 — Gestão de IPTU (30 itens)

Base: `RealEstate`, registros territoriais, `property-cadastral-engine.ts`, `imoveis/*`, motor fiscal e guias. Fonte documental principal: ID 108 para território/zoneamento; IDs 101/113–115/140–141 para classificação e totais. **Faltam PGV/CTM e bases individuais vigentes no pacote recebido.**

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–7 | Edifícios/condomínios/loteamentos/localidades; zonas configuráveis/múltiplas/inativas; situações; vistoria/formulários/anexos; PGV por bairro/via/testadas | PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica | P1, P5 |
| 8–12 | Urbano/rural/terreno/unidade; pai do terreno; áreas, matrícula, coproprietários, endereços, mapas, afastamentos/uso; adicionais e inscrição configurável | PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição | P5 |
| 13–19 | Histórico/espelho por data, detalhe de isenção/alvará/vistoria/entrega/ITBI/protocolos/débitos, anexos, linha do tempo, mudanças antes/depois e bloqueio supervisor | PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária | P2, P5, P7 |
| 20–24 | Cópia de N cadastros com edição, alteração geral de qualquer campo/PGV, protocolo da alteração, desmembrar/unificar com novos IDs e comprovante | Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas | P5, P7 |
| 25–26 | Simulação sem mudar cadastro, englobadas/efetivação; mínimos/descontos/débito impeditivo/opções de pagamento/fórmulas anuais | PARCIAL; prévia atual não cobre todas as opções nem persistência do lote simulado. Reutilizar motor com snapshot/ID e política anual conferida | P2, P5 |
| 27–30 | Notificação/aviso PDF em lote e boleto/TXT/XML; consulta/cancelamento/reemissão; comparativo de anos e resumo completo/inadimplência | NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final | P7, P9 |

### 5.2 EXE-13 — Gestão de ISS (41 itens)

Base: `EconomicRegistration`, `TaxServiceActivity`, `/economico`, `/alvaras`, cadastros fiscais e Simples. Fontes: ID 108, LC 030/2021 p. 391–480 e LC 031/2021 p. 481–503; agregados de arrecadação não são cadastro de empresas.

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–10 | Contador único/vínculo; CNAE↔lista de serviço↔CBO; risco; alteração/unificação de atividades; situações; vistorias; tipos de empresa/sócio e percentuais/débitos | PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão | P1, P5 |
| 11–16 | Todos os filtros; empresa vinculada a pessoa/imóvel/atividades/sócios/contrato social/regime; provisória com baixa automática; última alteração; dois endereços; débitos empresa/sócios | PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada | P2, P5 |
| 17–24 | Anexos, mapa individual/resultado, campos adicionais, histórico antes/depois/espelho por data, consulta integrada e alterações gerais | PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações | P5, P7 |
| 25–31 | Tipos/layouts/validades anuais de alvará, bloqueios/mensagens, habilitação no portal, consulta/reemissão/assinatura/cancelamento, protocolos, lote e autenticidade | PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública | P5, P7 |
| 32–36 | Tipos/eventos/dados/adicionais/alvará personalizado, veículos vinculados/condutor/placas e certidões online de baixa/inscrição | NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais | P5, P7 |
| 37–39 | Fórmulas ISS fixo/anual/taxas, mínimos/descontos; notificações com boleto/TXT/XML; comparativo de exercícios/receitas/pessoa/empresa | PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final | P5, P7, P9 |
| 40–41 | TXT Receita/saída pendentes, histórico/download e termos deferimento/indeferimento das empresas do arquivo | PARCIAL no Simples normalizado; parser/layout oficial, análise e termos completos sem tratar exclusão interna como arquivo oficial | P7, P9 |

### 5.3 EXE-14 — Gestão de ITBI (26 itens)

Base real: declaração, frações/partes, processo, análise/DAM/documento em `s3-service.ts`. Não há no pacote novo tabela completa vigente de ITBI nem registros individuais de transmissão.

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–6 | Interno/online; dados/mapa do imóvel, múltiplas unidades/venais, fórmula própria, alíquotas habilitadas online, transmissão parcial/múltiplos adquirentes/100%, correspondência | PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro | P5 |
| 7–13 | Adicionais tipados/anexos/histórico, tabelionato/usuário, liberação automática ou análise/impugnação, comprador ou vendedor devedor, consulta privada/impressão | PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável | P5, P7 |
| 14–18 | Cálculo+comprovante+guia, modalidades isento/imune/prévia/capital, mensagens/readequação online, anexos também no cadastro imobiliário | PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada | P2, P5, P7 |
| 19–22 | Transferência automática no pagamento ou manual, retificação do transferido com novo ID e guia retificadora | NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias | P2, P5 |
| 23–26 | Quitação/declarações configuráveis, cancelar vencidos por dias, fila cronológica e avisos/bloqueios | NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal | P5, P7 |

### 5.4 EXE-15 — Gestão de Receitas Diversas (9 itens)

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–3 | Fórmulas/parâmetros de taxas automáticas, vínculo pessoa/imóvel/empresa e cancelar serviços não realizados por prazo | PARCIAL no motor/solicitação. Serviço prestado deve determinar cancelamento, sem inferir não realização apenas por atraso; configuração anual e vínculo correto | P2, P5 |
| 4–8 | Notas avulsas internas/online, copiar/cancelar/alterar, limites PF/PJ mês/ano, anexos, liberação/pagamento/débitos/modalidades/retenções e aceite | PARCIAL em `NfseOccasionalRequest`. Completar limites, todos os tipos/ações e aceite versionado; sincronizar débito, emissão e cancelamento | P5, P7 |
| 9 | Guia padrão bancário, acréscimos e layouts configuráveis | PARCIAL no DAM; concluir cálculo temporal e documento; layout/convênio bancário na fase externa | P5, P7, P9–P10 |

### 5.5 EXE-16 — Gestão de Arrecadação (56 itens)

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–7 | Bancos/agências/convênio por ente/tributo, contribuinte único, moedas/indexadores, novas receitas, fórmulas anuais/vínculos, cópia anual, adicionais usados em fórmulas | PARCIAL; consolidar cadastros e configuração sem código, vínculo por entidade e editor com campos tipados/valores históricos | P1, P5 |
| 8–12 | Opções de pagamento, mínimos PF/PJ, desconto condicionado a tipos de dívida, simulado/normal geral/individual com ID/efetivação/logs/exclusão parcial, atualização/multa/juros/Selic | PARCIAL no motor. Simulação persistida não movimenta extrato; efetivação usa snapshot; distinguir mínimos do débito e parcela e regras por exercício | P2, P5 |
| 13–17 | FEBRABAN, registro WS condicional, PIX condicional, carnês com todos os filtros/reimpressão/e-mail e guia unificada/desconto | PARCIAL na emissão; PIX atual é referência interna sem payload bancário. Completar consulta/unificação no núcleo; banco/PIX oficiais no final | P5, P7, P9–P10 |
| 18–21 | Restrições/visibilidade/alerta, extrato por tipos de dívida, ações e histórico completo, entregas/devoluções em lote com anexos | PARCIAL nas bases; completar extrato único e detalhes sem duplicar crédito de exercício/inscrito; rastrear entrega/devolução de cada classe documental | P2, P5, P7 |
| 22–26 | Finalidades/validades/formulários de certidão, CND/CPEN/positiva, gerenciar/reimprimir, QR/autenticidade e documentos diversos configuráveis | PARCIAL; motor de situação/documentos disponível, mas todo o ciclo/layout/configurações NÃO VERIFICADO. Certidão deve refletir suspensões e terceiros obrigados | P5, P7 |
| 27–32 | Baixa central por arquivo/lote/original, manual normal/duplicada/dação/depósito/parcial, diferença a menor, compensação inclusive outro titular e restituição | PARCIAL; retorno e créditos atuais não cobrem o ciclo integral. Corrigir GAP-04–06; regras/fundamento e saldos conservados; arquivos ao final | P2, P5, P9 |
| 33–38 | Massa falida/processo, transação/dação, outorga/fórmulas/obras/reserva/notas/remissão parcial, prorrogações, isenções/processos e protocolo de cancelamento/suspensão/remissão | PARCIAL em registro de evento/benefício; demais NÃO VERIFICADOS. Fluxos específicos com cálculo/saldo/documento/decisão, sem substituir por observação genérica | P2, P5, P7 |
| 39–43 | Coproprietários na inscrição IPTU/taxas, toda receita, agrupamento por tributo/lançamento/parcela, inscrição automática e classificação TCE | PARCIAL na inscrição; completar coproprietários, opções e jobs, classificação externa versionada e movimento único | P1–P2, P5, P9 |
| 44–46 | Integração diária de todas as movimentações, consulta/impressão por movimento/conta/valor e estoque atualizado mensal/log/indicador | PARCIAL com lacunas confirmadas. Motor contábil por tipo e reconciliação diária; atualização preserva posição histórica, memória e falhas | P2, P7 |
| 47–52 | TXT/XML carnês/histórico/download, segundo plano, inicialização 01/01, depuração/impressão fórmula/parâmetros, CPF/CNPJ e cálculo geral durável | PARCIAL na memória; execução durável/automática e arquivos NÃO VERIFICADOS. Configuração vigente, jobs retomáveis e relatório de inconsistências | P5, P7, P9 |
| 53–56 | Maiores devedores/pagadores, lançados, a receber e estados do débito com todos os filtros | NÃO VERIFICADO em todas as variantes; usar dívida/recebimento/evento canônicos e datas de vencimento/pagamento/cancelamento separadas | P7 |

### 5.6 EXE-17 — Gestão de Dívida Ativa (28 itens)

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–3 | Livro cadastrado/emitido, número/data da inscrição e estorno somente sem movimento posterior, retorno ao exercício/cancelamento contábil | PARCIAL; listagem atual não comprova livro completo e retorno altera status. Completar livro/folha/termo/registro e guardas/movimento contábil | P2, P5, P7 |
| 4–7 | Modalidades/entrada/mínimos PF/PJ/tipos, limite de acordos, vigência/receitas elegíveis e desconto à vista | PARCIAL em regras/parcelamento; validar todos os critérios do checklist e REFIMI histórico sem abrir campanha fora da vigência | P5 |
| 8–14 | Consulta com filtros/atrasos, termo/responsável/origens diversas, portal/aceite/documentos, privilégio por modalidade, cancelar em lote/job/e-mail/imputação/proporção, antecipação/estorno | PARCIAL em acordo/pagamento/reparcelamento. Completar composição por origem e reconstituição do saldo/desconto na rescisão; job e privilégio no servidor | P2, P5, P7, P10 |
| 15–19 | Gerenciamento por vínculos/tipos/todas as ações, contagem de acordos/ajuizamento, valores atualizados/simulação/data/estados, responsáveis em lote e permissões por tipo | PARCIAL; integrar extrato e todas as ações, saldo histórico e ACL de administrativa/judicial/cartório, inclusive portal | P2, P5, P7 |
| 20–22 | Execução fiscal individual/lote/agrupamentos/mínimos/identificação/endereço/prévia; custas/honorários; CDA/petição/estorno/incluir/cancelar | PARCIAL em CDA/processo interno; completar prévia, filtros/validações, peças e custas, sem presumir ajuizamento oficial por protocolo interno | P5, P7 |
| 23–24 | Remessa CRA/comarca/responsáveis e desistência/cancelamento do protesto | PARCIAL/SIMULADO POC; remessa `REMESSA_INTERNA_CONTROLADA`. Preparar seleção no núcleo e validar arquivo/retorno/anuência oficialmente nas fases finais | P5, P9–P10 |
| 25–28 | Integração de todos os eventos, inscrição mensal/email, guias portal com bloqueios/PIX, notificações PDF/boleto/TXT/XML | PARCIAL; corrigir baixas/transações, job e portal restrito; recibo/email real e banco/PIX/TXT/XML ao final | P2, P5, P7, P9–P10 |

### 5.7 EXE-24 — Nota Fiscal Eletrônica (59 itens)

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–9 | Cadastro único, legislação/manual, aplicativo iOS/Android, WS, ADN, emails automático/manual e assinatura configurável/XML | PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido | P5, P7, P9–P10 |
| 10–18 | Prazo configurável/cancelamento, consulta emissor, habilitar/revogar/automático, um serviço, dados alternativos tomador, autenticidade pública e contador | PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro | P5, P7 |
| 19–23 | Personalização prévia/logo/tabelas/complementos, emails, pedido fora do prazo/substituta e decisão individual/lote/WS | PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final | P5, P7, P10 |
| 24–29 | Escrita automática prestador/tomador, proteção das notas/rejeição tomador, cópia, substituição/prazo e XML envio/retorno/erros | PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final | P2, P5, P9–P10 |
| 30–36 | RPS sequencial/prazo/fato gerador/denúncia, crédito IPTU/percentuais PF-PJ e CNO por serviço | PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal | P2, P5 |
| 37–41 | Maiores emissores, consulta crédito IPTU, prévia, rascunho e retroativa com complementar se paga | NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal | P5, P7 |
| 42–50 | Layout próprio/ABRASF WS, unidades, canhoto, líquido/total, pagamento/parcelas, materiais, fornecedor software, tomador obrigatório e alíquota histórica Simples | PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final | P5, P7, P9–P10 |
| 51–59 | Tomadores recorrentes/emissão mensal, carta limitada, ranking cancelamentos, WS lote, TSE permissionários/candidatos/partidos, CNAE/intermediário e layout municipal | PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases | P5, P7, P9–P10 |

### 5.8 EXE-25 — Gestão e Escrita Fiscal (65 itens)

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–10 | Cadastro único, declarações prestado/tomado/dados mínimos, editar não NFS-e, TXT, cálculo, seleção de documentos/guia, contador, localização e ranking serviço | PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final | P2, P5, P7, P9 |
| 11–19 | Solicitação cadastro/vínculo/baixa/análise, usuário e NFS-e automáticos opcionais, manutenção inscrição, complementar/retificar, natureza por serviço, assinatura/MEI, recibo e identificação | PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração | P5, P7 |
| 20–27 | Alíquota municipal imutável exceto Simples, eventual externo, solicitação acesso/colaborador, retificação+guia, ADN/MEI nacional, um serviço por documento | PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final | P5, P9–P10 |
| 28–34 | Declaração customizada/fórmula/enquadramento, cadastrar parte na emissão, isento/imune/estimativa/fixo, complementar, compensação deferida futura, reduzir alíquota/base por item/teto | PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização | P2, P5 |
| 35–42 | Prazo/multa automática de prestado/tomado, escrita automática omisso, LC123/faturamento/alíquota, sem movimento, TXT exportado, histórico e mínimo acumulado | PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final | P5, P7, P9 |
| 43–50 | DES-IF ABRASF, plano IF/COSIF/correlação, importação de contas, grupos 7/8, informações comuns/tarifas e apuração por dependência/subtítulo | PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final | P5, P7, P9 |
| 51–58 | Partidas dobradas, confronto, arrecadação COSIF, balancete por inscrição/CPF-CNPJ, quatro módulos, rateio/apuração e histórico PGCC | PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente | P5, P7, P9 |
| 59–65 | Livro prestados/tomados, procuração digital, COSIF, atualização sem inscrição/análise, layout recibo, CNO e Lei 13.352/2016 | PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre | P5, P7 |

### 5.9 EXE-26 — Gestão e Fiscalização Fazendária (95 itens)

| Itens | Exigências e comparação | Situação / ação necessária | Fases |
|---|---|---|---|
| 1–6 | ECF/autorização/ações, gráficas, AIDF/validade/blocos/ações, incineração vinculada, infrações/reincidência/tributo/fundamento e multa acessória junto/separada | PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico | P5, P7 |
| 7–15 | Visitas/empresa/fiscal/data/motivo, classificações/serviços/pontos, eventual/IF, filtros/status/anexos, denúncia identificada/anônima e transferência fiscal | PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência | P5 |
| 16–22 | Todos os termos PDF, múltiplas intimações/prorrogação/adicionais sem código, e-mail/texto/histórico e DTE | PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final | P5, P7, P10 |
| 23–29 | Homologação da escrita sem importar, manutenção global, prestado/tomado/competência ascendente/planilha, resumo e estimativa/arbitramento configurável | PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado | P2, P5, P7 |
| 30–36 | DES-IF/homologação/confronto D-C por COSIF/competência/diferença/alteração/planilha; Simples e PGDAS/divergência | PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final | P5, P7, P9 |
| 37–47 | Autuação/fundamento/reincidência/docs por competência, receita original/fisco/PGDAS, pagos/diferença/acréscimos, correção operacional, por competência ou total, prévia/PDF/prazos | PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada | P2, P5, P7 |
| 48–57 | Recurso/DTE/protocolo/contencioso/parecer/decisões/suspensão, boleto/desconto, inscrição DA, parcelar/reparcelar/juros/mínimos/entrada | PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final | P2, P5, P7, P9–P10 |
| 58–64 | Análise IF, ESTBAN/importação/consulta, omissos/sem movimento e excesso Simples/MEI | PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS | P5, P7, P9 |
| 65–74 | Notas prestado/tomado, gráfico declarado/pago, atividade, prestador×tomador, variação faturamento/percentual/período, autorizado sem emitir, ficha fiscal, serviço/arrecadação, IF sem movimento e módulos DES-IF | PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado | P2, P7 |
| 75–77 | Importar cartões, natureza/valores diários e cruzar PGDAS×cartões×escrita com filtros | NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos | P7, P9 |
| 78–84 | OS por empresa/fiscal/prazo/período, comentários/anexos/impressão, procedimento relacionado, múltiplos fiscais, conclusão/parecer e grupos | PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe | P5, P7 |
| 85–90 | Plantão/expediente/equipe, sorteio mensal, feriados, produtividade, fiscal restrito e gestor completo | PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica | P5, P7 |
| 91–95 | Pré-notificação individual/por regra, execução automática DTE, prazo/regularização/não regularizados e alerta ao login | PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos | P2, P5 |

## 6. Controle Interno, Custos e Planejamento

### 6.1 EXE-03 — Gestão de Controle Interno (36 itens)

**Diagnóstico:** planos/apontamentos existem, mas a jornada integral do controlador ainda não foi comprovada. Reaproveitar `InternalControlPlan`, `InternalControlFinding`, GED, notificações, processos e trilha de Auditoria. Localização canônica: **`/auditoria/controle-interno/*`**, a desenvolver; a rota `/controle-interno` atual deve preservar acesso/histórico durante a transição.

| Itens | Entrega estritamente vinculada ao checklist | Situação atual e fechamento | Fases |
|---|---|---|---|
| 1–2 | Integração por ente e privilégio por perfil/usuário | PARCIAL nos domínios/permissões; completar ACL do controlador/notificado e consultas canônicas | P1, P6 |
| 3–6 | Documentos, consulta por categoria/tipo/data/status/publicação, observação/anexos/notificar/responder/imprimir e publicar automaticamente | PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente | P6–P7 |
| 7–17 | Grupos/itens numerados, respostas automáticas/configuráveis, achados manuais, parecer/providência/contratação/funcionário, categorias/padrões, seleção/inativação/cópia | PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver | P6 |
| 18–22 | Centro/órgão/unidade, agenda, responsável respondente, datas/checklist e todas as ações da consulta gerencial | Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar | P6 |
| 23 | Quatro diagnósticos mínimos: fornecedor devedor, empenho maior que contrato, fonte negativa, índices saúde/educação | NÃO ATENDE integralmente no domínio atual. Depende de P2–P4/P7; resultado sem base = NÃO AVALIADO, não REGULAR | P6–P7 |
| 24–29 | Caixa pessoal/respostas, agenda/criticidade/visibilidade/baixa, alertas/prazos/justificativas, recortes e emails/retornos | Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final | P6–P7, P10 |
| 30–31 | Consulta de Ouvidoria e processos contra Município | NÃO VERIFICADO no acesso funcional do controlador; identificar fonte jurídica e permissões; execução fiscal contra contribuinte não atende o item 31 | P6 |
| 32–36 | Relatório circunstanciado/quadros/anexos/publicação, LRF/anuais, estatística cargos histórica/extintos e calendário por meses | PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas | P6–P7 |

**Referências municipais:** IDs 004/028/077/078/097/109/119/127/128/130. Usar plano/risco, matriz de achados e relatório final como modelos do ciclo exigido. IN 02/2026 pode fornecer evidência/memória de benefício em achados e quadros: **não acrescentar um novo módulo de benefícios de auditoria como requisito contratual**.

Matriz individual dos 36 itens e subcritérios: seção 7.1 de [`PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md`](PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md). Este consolidado muda a ordem/dependências, não o denominador ou as exigências.

### 6.2 EXE-04 — Gestão e Controle de Custos (31 itens)

**Diagnóstico:** os produtores existem parcialmente; o domínio de Custos completo está planejado, não entregue no inventário atual. `CostCenter` organiza a estrutura municipal, não oferece apropriação, objeto, item, agregador ou ledger de custo.

| Itens | Entrega e comparação | Situação / aceite necessário | Fases |
|---|---|---|---|
| 1–6 | Objetos hierárquicos, filho/código automático, gerar LOA por seis níveis/ente/consolidado, detalhar e excluir descendentes sem vínculos impeditivos | NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar | P6 |
| 7–11 | Identificação telefone/placa/texto/customizada, descrição/detalhe/fixo-variável, agregadores ≤100%, padrões e ativação | NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo | P6 |
| 12–16 | Múltiplos itens/objetos/dotações, importar relação ano anterior, habilitar ente e gatilhos liquidação/folha/estoque/patrimônio | NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos | P6 |
| 17–20 | Distribuir na liquidação sem excesso; bloquear estorno e desfazer apropriação na mesma tela; manual só pendentes, estorno/desfazer e notas | NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta | P6–P7 |
| 21–23 | Material verificado/não estocável, prestação em VPD, lançamentos manuais VPD | Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente | P4, P6 |
| 24–27 | Todos os critérios de folha/contrato e liquidação de múltiplos empenhos, depreciação/bem e almoxarifado por todas as dimensões | Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos | P4, P6 |
| 28–31 | Relatórios por ente/consolidado/data despesa/data apropriação/tipo/pendentes, saldo por tipo e gráficos objeto/item | NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração | P6–P7 |

Matriz individual e provas dos 31 itens: seção 6.1 do plano existente de Custos/Controle Interno. O BI de Administração apenas consome o domínio canônico, conforme a decisão anterior; não construir outro ledger nem novos indicadores fora dos gráficos/consultas exigidos.

### 6.3 EXE-01 e LEG-01 — Planejamento e Orçamento (99 + 99 itens)

**Atualização indispensável:** o diagnóstico inicial de 49 bases parciais/50 não evidenciadas é histórico. S1–S8 acrescentaram pontes, catálogos/manutenção, execução, relatórios e publicação; não planejar novamente essas entregas como ausentes. O registro mais recente de S8/S9 informa 66 testes/cenários históricos aprovados, três migrations então pendentes no banco configurado, zero peças operacionais e todos os 198 ensaios autenticados não executados. **Esses dados são de 11/10, não uma nova consulta desta análise.**

| Itens comuns por ente | Obrigação / base atual | Trabalho de fechamento | Fases |
|---|---|---|---|
| 1–2 | Audiências/demandas/anexos; `hearings.ts`, GED | Jornada com upload/download, todos os campos, volume/paginação, arquivo preservado e permissão | P5, P7–P8 |
| 3–13 | PPA/graus/vínculos/programas/objetivos/indicadores/importação/código/receita/rateio/projeção | Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível | P1, P5, P7–P8 |
| 14–20 | Alterações/data/metas/transferências/histórico/consolidação/confronto PPA | Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão | P2–P3, P5, P7–P8 |
| 21–32 | Emendas/decisão/bloqueio/relatórios/propagação/metas/compatibilidade/avaliação/versões/índices/graus PPA | Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados | P2–P5, P7–P8 |
| 33–42 | LDO/graus/vínculos/alterações/programas/importações/realizado PPA/consolidação/histórico | Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar | P1–P2, P5, P7–P8 |
| 43–54 | Emendas LDO, confronto/relatórios, obras/conservação, versões, índices orçados, memória STN e filtros | Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe | P4–P5, P7–P8 |
| 55–66 | LOA/lei/anexos, fontes TCE/STN/plano único/rateio/programação/importações/alteração/partidas/consulta/despesa | Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação | P1, P3, P5, P7–P9 |
| 67–79 | Emendas, crédito multidotação, histórico/consolidado, disponibilidade, CMD/arrecadação, reduzidos, prévia/minuta/partidas/reserva/consistências | Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados | P2–P5, P7–P8 |
| 80–90 | CMD/metas/arrecadação/relatórios, decretos, orçamento futuro Compras, cópia anual, anexos/publicação, cotas/períodos/atualização/previsto-realizado/histórico | Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados | P2–P5, P7–P8 |
| 91–99 | Percentuais/contingência/liberação/redistribuição, compatibilização, confronto, alterações MCASP, índices orçados, renúncia/compensação | Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal | P2–P3, P5, P7–P8 |

Controles individuais já existentes: `EVIDENCIAS_PLANEJAMENTO_PREFEITURA.md` e `EVIDENCIAS_PLANEJAMENTO_CAMARA.md`. Conferir cada requisito contra o texto integral mantido em `PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md`; registrar a nova evidência por ente, sem preencher os dois automaticamente pelo teste de um.

## 7. Contratos das integrações internas e prova de ponta a ponta

Integração interna significa operar/consultar as mesmas origens canônicas. Importar CSV entre módulos do próprio ERP não atende a integração total exigida. Estabilizar estes contratos **antes das fases externas**.

| Origem → consumidor | Situação localizada | Contrato/dados mínimos a fechar | Prova obrigatória |
|---|---|---|---|
| Cadastro Único → Tributação/credor/RH/Controle | Pessoa/empresa/contribuinte/fornecedor/credor coexistem | Identidade canônica, documento validado, relações e histórico; resolver representações sem unir pessoas pelo nome | Um fornecedor/contribuinte com débitos é localizado nos três estágios; mesma identidade com mais de um vínculo não duplica |
| Planejamento → Financeiro/Contabilidade | Pontes e hooks existentes | Peça/versão/ente/UG/ano, dotação/natureza/fonte, ato e comando; seis eventos de abertura/alteração com origem imutável | Implantar/alterar/repetir; falha contábil reverte orçamento/versão/cota; duas sessões respeitam disponibilidade |
| Financeiro/Compras → Planejamento | Reserva/cota/empenho/pagamento/estorno presentes | Data legal e registro, estágio, origem/chave, bruto/estorno, reserva já consumida, período/contingência | Empenho e estorno/pagamento atualizam realizado uma vez; reserva futura não permite empenho fora do exercício |
| Tributação → receita/tesouraria/contabilidade/Planejamento | Baixa real interna integrada, com caminho paralelo | Lançamento/arrecadação/recolhimento/estorno, valor recebido/aplicado/excedente, natureza/fonte/banco/ente/UG, exercício origem/recebimento | Mesma cobrança paga duas vezes não duplica; excedente mantém saldo; falha no fim preserva toda a cadeia |
| Benefício/extinção/DA → Contabilidade e renúncia de Planejamento | Eventos genéricos/parciais | Modalidade/fundamento/vigência, componente principal/multa/juros/correção, valor e competência, origem anterior, compensação fiscal prevista/realizada | Isenção/anistia/remissão/prescrição/cancelamento não viram caixa; contabilização e relatório reconciliados por tipo |
| Restituição/compensação → Financeiro/Tributação | Crédito/pedido/decisão parciais | Crédito total/disponível/reservado/utilizado, titular/origem, decisão, exercício arrecadado e destino financeiro | Dedução no mesmo exercício; empenho para ano anterior; recusa de consumir crédito duas vezes ou restituir já compensado |
| NFS-e/RPS → Escrita → débito/guia | Declaração do prestador existe | Documento/versão/fato gerador/serviço/incidência, prestador/tomador/retido, competência, origem automática protegida | Emissão alimenta os dois lados aplicáveis; cancelamento/substituição/retroativa/complementar preservam vínculo e imposto correto |
| ITBI → imóvel/guia/GED | Transferência na aprovação | Imóveis/unidades/partes/percentuais, regra de transferência, pagamento efetivo, endereço escolhido, anexos e histórico | Pagamento aciona apenas a transmissão aprovada e preserva coproprietários; retificação cria novo processo/guia vinculados |
| Dívida/parcelamento/execução/protesto → extrato/contabilidade | Múltiplos modelos e transações | Origem do crédito, livro/inscrição, parcelas componentes, pagamentos, descontos/desfazimento, saldo atualizado e status fiscal/jurídico distintos | Inscrever não duplica recebível; parcelar não cria dívida adicional; pagar/estornar conserva todo o estoque e registros |
| RH/Folha → Financeiro/Contabilidade/Custos | Despesa nativa e provisões internas existem | Folha/tipo/competência/contrato/centro/rubrica, bruto/encargo/retenção/líquido, classificação, liberação, empenhos e pagamentos vinculados | Todos os tipos e lote; críticas bloqueantes; extras conciliadas; cancelar apenas com guardas; contabilizar provisão/baixa sem duplicidade |
| Compras/Contrato → reserva/empenho/liquidação | Recebimento aprovado conectado | Requisição/ordem/processo/contrato/aditivo/itens/desdobramento/atesto/centro, reserva e saldo contratado | Itens de desdobramentos distintos não entram no mesmo empenho; anular devolve itens/reserva corretos |
| Patrimônio → contabilidade/Custos | Baixa patrimonial tem ponte; demais eventos precisam cobertura | Bem, aquisição/incorporação, vida útil/movimento/competência, depreciação/exaustão/amortização/estorno, conta e objeto | Mesma depreciação só reconhecida/apropriada uma vez; estorno reverte ledger e contabilidade coerentemente |
| Almoxarifado/verificação → VPD/Custos | Movimento/recebimento disponíveis | Produto/classe/subclasse/quantidade/unidade/custo/local/centro, destino estoque/consumo e documento | Entrada ao estoque não é apropriada novamente na liquidação/saída; consumo valorizado e devolução conservam valores |
| Obras/convênio/dívida/PPP → Financeiro/relatórios | Vínculos parciais | Instrumento vigente/contas/parcelas/medições/objeto, empenhos/itens/valores, prestação/decisão, anexos | Cadastro financeiro abre origem, saldos/execução conferem e prestação reconhece VPD no momento aplicável |
| Todos os domínios → Controle Interno | Consulta técnica/achado básico | Origem com ente/período/revisão e regra, evidência sem copiar fato operacional; cobertura das fontes | Quatro diagnósticos corretos e casos não avaliados; usuário auditado responde sem editar o fato financeiro |
| Financeiro/Planejamento/RH/Ouvidoria/Jurídico → relatórios do controle | Fontes parciais | Consulta com ACL de origem, período/versão e metodologia; cargo/extinto histórico e processo contra Município | Relatório/statística corresponde à data consultada; informação sigilosa não vaza em exportação/publicação |
| GED/assinaturas/portal → áreas analisadas | Infraestrutura existente | Documento/versão/bytes/hash, assinantes autorizados, ordem/status, origem/layout/corte, publicação confirmada e anexos | Arquivo público é o mesmo final; nenhum envio sem assinaturas obrigatórias; falha não anuncia entrega/publicação |

### 7.1 Regras de integridade para essas conexões

1. Guardar **ente/UG, ano/competência, data do fato, data do registro, origem, versão e chave de evento**. Não inferir ente por usuário/nome da secretaria.
2. Um evento possui uma identidade: repetição com o mesmo conteúdo é segura; chave reutilizada com conteúdo diferente é conflito, não sucesso silencioso.
3. Valores financeiros e rateios usam Decimal e política explícita de centavos. Antes de usar legado Float, reconciliar os campos Decimal existentes e os consumidores.
4. Fato financeiro, partidas, tesouraria, realizado e apropriação obrigatória devem conservar valores na mesma transação, quando exigida simultaneidade; comunicações externas usam estados/outbox sem declarar envio fictício.
5. Estorno é movimento compensatório vinculado ao original; não apagar o histórico nem alterar snapshot aprovado. Parcial conserva o remanescente e protege fatos posteriores.
6. Aplicar escopo antes de listar, contar, agregar, exportar, buscar opções/documentos e executar jobs. Consolidar somente entes autorizados.
7. Compor relatórios pelo **evento e período**, não pelo status atual isolado. Não apagar da apuração de julho um fato de julho estornado em agosto sem respeitar o corte.
8. Ausência de razão, histórico, classificação ou origem gera crítica/não apurado, nunca zero presumido, regularidade ou aprovação automática.

## 8. Referências de `Novos docs`: dados, colunas e modelos de exportação

Originais: **`docs/Novos docs/Novos docs/`**. IDs desta seção são os do catálogo 001–141, com 136 conteúdos distintos após exclusão autorizada de cópias. A pasta foi conferida nesta análise, assim como os cabeçalhos reais dos dois CSVs. Para PDFs, aproveita-se o mapeamento documental existente, complementando conferência página/linha/célula na implantação de cada layout/regra; não houve nova transcrição de todos os milhares de lançamentos.

### 8.1 Catálogos, orçamento, receita e execução

| IDs / arquivos de referência | Destino / tipo de dado | Colunas e estrutura a tratar | Modelo de saída e regra interna |
|---|---|---|---|
| 079 `Lei Nº 664-2025 LDO 2026.pdf`; 085 `LEI Nº 724-2026 LDO 2027.pdf` | LDO por exercício, diretrizes/metas/riscos fiscais e memória | Lei/artigo/anexo, ano da peça, descrição/código, meta, risco, valor, metodologia e notas | Anexos/relatórios LDO; 2027 não substitui parâmetros 2026 pelo ano de publicação |
| 081 `LEI Nº 687-2025 - PPA 2026-2029.zip` | PPA, programas/ações/metas e quatro anos | Programa/objetivo/indicador, ação/produto/unidade/meta física, fonte/valor anual e total quadrienal | Anexos PPA e avaliação; partes `.part01/.part02` são transporte do mesmo documento |
| 082 `LEI Nº 701-2025 ALTERA PPA 2026-2029.pdf`; 084 `Lei Nº 711-2026 Altera PPA 2026-2029.pdf` | Alterações legais coordenadas | Peça/ano/linha anterior/nova, ação, valor/meta, ato/data/vigência | Histórico e compatibilidade; 701 afeta PPA/LDO; 711 inclui ação 1.053 e afeta PPA/LDO/LOA |
| 083 `LEI Nº 702-2025 LOA 2026.pdf` | LOA inicial e anexos | Órgão/unidade/função/subfunção/programa/ação/natureza/fonte, receita/despesa inicial | Modelos dos anexos da Lei 4.320; inicial R$ 44.199.100,00, não saldo atualizado por créditos |
| 046–052 `Despesa Orçada por ...` | Catálogos e agrupamentos iniciais | Código/descrição/valor fixado por função/natureza/órgão/programa/projeto/subfunção/unidade | Relatórios de despesa por dimensão; preservar zeros/níveis e não somar agrupamentos entre si |
| 100 `Orçamento Anual - Despesa Por Fonte de recursos.pdf`; 101 `Orçamento anual - Receita Prevista.pdf` | Fonte/destinação e receita prevista | Código textual/descrição/valor; hierarquia; redutoras/deduções | Confronto receita/despesa por fonte; códigos de fonte externos separados do ID interno |
| 105 `Plano de Contas.pdf` | Catálogo contábil, 198 p. | Reduzido, conta hierárquica, descrição, natureza D/C e indicação analítica | Catálogo/seleção/razão; não contém saldos iniciais nem matriz de eventos/MSC |
| 008/009 `balancete agosto 2026.pdf` / `balancete Julho 2026.pdf` | Execução analítica por dotação | Classificação/fonte, inicial, suplementos/reduções, atual, empenhado/liquidado/pago mês e acumulado, saldos | Balancete da despesa; separar folha analítica/subtotal e competência |
| 061–074 `Excução de despesa...` / `Execução orçamento...` | Execução por órgão/unidade/grupo/função/programa/subfunção/projeto/unidade orçamentária | Código/descrição, inicial/atualizado e empenhado/liquidado no período/exercício, conforme cada original | Modelos de agrupamento; órgão 02 difere de unidade 02001; não inferir unidade só pelo título |
| 053 `Despesas por Orgão.csv` | Snapshot de 14 órgãos | **Código; Descrição; Valor Orçado; Valor Empenhado; Valor Liquidado; Valor Retido; Valor Pago**; cabeçalho linha 5 | Exportação municipal semicolon/decimal vírgula; não impor `liquidado - retido = pago` sem conferir conceito de retenção/estornos/período |
| 075 `ingressos de receitas.pdf`; 113/114 `Receita Realizada - ...`; 140/141 `Tributos ... Mensal ...` | Totais arrecadados e deduções por receita/fonte/operação | Código/descrição/finalidade/fonte/operação, arrecadado mês/ano, renúncia/deduções | Receitas/tributos por competência; são agregados, não pagamentos de contribuintes; não lançar novamente o mesmo ingresso |
| 115 `Receitas.csv` | Hierarquia de 410 registros de receita | **Receita; Descrição; Valor Previsto; Orçado Atualizado; Arrecadado**; cabeçalho linha 5 | Preservar código como texto e parent/leaf; somar somente nível analítico compatível, sem contar rubrica pai e filha duas vezes |
| 019/020 `Contas e Recursos Recebidos - ...` | Receita de transferências/recursos | Classificação, repassador, arrecadado mês/ano | Modelo de receita por origem; não é extrato bancário nem conta-corrente individual |
| 006 `apresentacao_audiencia_2_2026.pdf` | Apresentação LRF/gráficos | Identificação, período/escopo, receitas/despesas/resultados/limites e gráficos | Layout de audiência CF 60; valores devem provir de demonstrativos conciliados da mesma competência |
| 102 `PLANEJAMENTO ESTRATÉGICO Junho 2026.pdf`; 106/107 PMAS/PMS; 001/003/112/118/129 relatórios de gestão | Metas/indicadores setoriais e avaliação | Programa/objetivo/ação/indicador, unidade/meta/resultado/período/responsável e execução por fonte | Referência para avaliação física, sem criar novos módulos/indicadores obrigatórios além do checklist; não somar relatório anual com quadrimestres |

### 8.2 Empenho, liquidação, pagamento e instrumentos

| IDs / fontes | Colunas/dados do modelo | Uso interno e exportação vinculada |
|---|---|---|
| 054 `Documento de exemplo de pagamento de Empenho.pdf`; 055/056 `Empenho - Agosto/Julho.pdf` | Município, número/exercício/tipo/data, credor/CPF-CNPJ/banco, dotação/fonte, processo/licitação, itens/quantidade/preço/total, histórico e assinaturas | Modelo de **nota de empenho**, não comprovante de pagamento. Nota 8817/2026 é referência de disposição/campos; documento novo exige seus próprios assinantes/assinaturas |
| 132 `RELAÇÃO DE EMPENHOS EMITIDOS - TRANSPARÊNCIA.pdf` | Número/exercício/data/credor/programática/fonte/valor/modalidade/processo/objeto | Relação de emitidos e cadeia da despesa; um registro por compromisso, movimentos de reforço/anulação separados |
| 133 `RELAÇÃO DE EMPENHOS LIQUIDADOS - TRANSPARÊNCIA.pdf` | Empenho/exercício origem, liquidação/exercício/data/valor/documento | Relação de liquidações/atesto; um evento por liquidação; permitir exercício origem diferente da competência atual |
| 134 `RELAÇÃO DE EMPENHOS PAGOS - TRANSPARÊNCIA.pdf` | Empenho, pagamento/data/valor, elementos da execução | Relação de pagos; distinguir bruto, líquido, retenção e estorno; valor original do empenho não se repete como gasto a cada pagamento |
| 076 `inst normativa 58 - empenhos apagar.pdf` | Fonte/saldo, empenho/fornecedor/licitação/valor/acumulado/objeto até julho | Consulta/relatório a pagar; arquivo é relatório, não norma a ser implementada como legislação |
| 045 `despesa extra.pdf` | Nota/data/credor/conta/vencimento/processo/valor/anulado/pago/estornado/saldo | Extras e repasses/consignações; folha→retenção/passivo→repasse; total pago não comprova pagamento de salário |
| 015/016 `Compras - Agosto/Julho.pdf`; 017/018 `Compras com Documentos Fiscais - ...` | Empenho/data/secretaria/credor/CPF-CNPJ/item/unidade/quantidade/unitário/total; documento/modelo/número/valor na variante fiscal | Consulta relacionada CF 23/27/32/35 e modelo de relatório. Um item pode ter vários documentos: não repetir seu total como nova compra |
| 021 `cONTRATOS EMITIDOS AT´PE AGOSTO.pdf` | Número/data/contratado/modalidade/licitação/valor/objeto | Contrato único e filtros; relação não contém todos os aditivos/saldos/vigências/itens para validar limites |
| 023 `Dados Essenciais Termos de Colaboração 2022-2026.pdf`; 135 `relação de transferências financeiras a terceiros.pdf`; 138 termo AACADI; 139 transferências voluntárias | Instrumento/ano/lei/fiscal/entidade/objeto/status/vigência, dotação, previsto/total/liberado/recebido/saldo/prazo/documento | Convênio/repasse e prestação de contas online. Repasses não provam prestação aprovada; prazo de 60 dias do AACADI é regra daquele termo, não padrão universal |
| 013 `Cartilha Diárias Atualização Julho 2025.pdf`, p. 6–8 | Circunstanciado: pessoa/órgão/período/destino/valor/atividades/objetivo/data/declaração/assinatura. Solicitação/autorização: matrícula/saída-retorno/hora/destino/placa/banco/quantidade/unitário/total/autoridades | Três modelos GED/RH/Financeiro exigidos no ciclo de diária/prestação; legislação, unidade monetária e arredondamento devem ser conferidos antes do cálculo |

### 8.3 Demonstrativos legais: referência não equivale a composição pronta

| IDs / família | Colunas/quadros a preservar | Origem e reconciliação necessárias |
|---|---|---|
| 031 caixa/RP; 032 dívida líquida; 035 garantias; 036 operações de crédito; 039 pessoal; 040 simplificado RGF | Fonte/destinação, disponibilidade bruta, obrigações/RP, insuficiência/líquido; DC/deduções/DCL/RCL/limites/comparativos; DTP bruta/deduções | Razão, tesouraria/fontes, compromissos/RP e composição fiscal versionada; janela de pessoal 12 meses e periodicidade efetiva pelo conteúdo |
| 033 função; 037 regra de ouro; 038 saúde; 041 RREO simplificado; 042 PPP | Função/subfunção/dotação/empenho/liquidação/percentuais; receita crédito/despesa capital; ASPS computáveis/deduções/RP; PPP/saldos/impacto plurianual | Evento de execução e classificação legal, não nome da secretaria; layout sem movimento não comprova inexistência de recurso funcional |
| 091 MDE/FUNDEB; 092 previdenciário; 093 primário/nominal; 094 alienação; 095 RP; 096 RCL; 131 RREO balanço | Impostos/transferências/base/deduções/despesa computável/limites; receita/despesa previdenciária; resultados/ajustes; alienação/aplicação; RP inscritos/liquidados/pagos/cancelados/saldo; série RCL 12 meses | Composição específica de cada anexo e corte. ID 096 tem conteúdo de RCL apesar do título genérico; modelos de RPPS zerados não validam um RPPS municipal |
| 123 `RelatorioDCBalancoFinanceiro_1-6 2025.pdf` | Atual/anterior, receita/despesa orçamentária/extra e saldos | Conteúdo de **12/2025**, não semestre pelo sufixo. Fluxo completo da tesouraria/passivos e transferências |
| 124 `RelatorioDCBalancoOrcamentario_2-6 2025.pdf` | Previsão inicial/atual/realizado, dotação/execução e RP | DCASP anual, diferente de balanço mensal/RREO; conciliar deduções e ano anterior |
| 125 `RelatorioDCBalancoPatrimonial_1-6 2025.pdf` | Ativo/passivo/PL e quadros/comparativos | Saldos iniciais + partidas patrimoniais; obrigação trabalhista agregada não cria folha ou bem individual |
| 126 `RelatorioDCDemVariacoesPatrimoniais_1-6 2025.pdf` | VPA/VPD/resultado/atual-anterior | Reconhecimento patrimonial e classificação, não somatório indistinto de caixa |
| 010/011 `Balanço Orçamentario - Agosto/Julho.pdf` | Previsão inicial/atual, receita período/acumulada/saldo e despesas | Modelo mensal próprio. Total de julho R$ 136.350.600,00 requer investigação; não usar como resultado esperado sem conciliar com LOA |

Documentos do Executivo são exemplos municipais de colunas/arranjo, não layout de arquivo SIM-AM/MSC/REINF nem modelo homologado da Câmara. Homologar cada anexo/variante expressamente exigido, com responsável contábil e referência normativa vigente.

### 8.4 Controle Interno e tributação: fontes específicas

| IDs / arquivos | Dados/campos e modelo | Tratamento e limite |
|---|---|---|
| 004 `5._LEVANTAMENTO_DE_PROBLEMAS_E_AREAS_CRITICAS_PARA_AUDITORIA_INTERNA_5.1_assinado.pdf`; 028 `DECRETO Nº 2726-2025 PAT.pdf` | Objeto/área/processo/risco/critério/prioridade, atividade/cronograma/responsável | Programação da auditoria; plano não comprova execução nem achado concluído; conferir OCR de 2026 |
| 078 `Instrução Normativa nº 01-2026.pdf`; 097 `MATRIZ DE ACHADOS EMPENHOS, LIQUIDAÇÕES E PAGAMENTOS.pdf` | Objeto/período/equipe; achado/evidência/critério/causa/efeito/recomendação/responsável/prazo, resposta/providência | Modelo de checklist/análise/achado/monitoramento e relatório. Verificação proposta não é irregularidade comprovada |
| 077 `Instrução Normativa CI Nº 02-2026.pdf` | Classificação benefício efetivo/potencial/não financeiro, metodologia/base/período/valor/memória/documentos/validador | Campos/evidências reaproveitáveis em achados/quadros do relatório, quando usados; não somar estimativa e realizado nem multiplicar mês por 12 sem base |
| 128 `Relatório Controle Interno 2025.pdf` | RACI: gestão/controles/áreas/quadros/anexos/evidências/conclusões | Principal modelo do relatório circunstanciado/anual; certidão p. 33 informa RGPS, não fornece alíquotas/incidências |
| 109 `Prestação de Contas 2025 Instrução 1736-2026.pdf`; 025 declaração de análise | Processo/ano/estágio/análise/conclusão/evidência/link | Histórico processual; instrução técnica e tramitação não são julgamento definitivo |
| 119 `RELATORIO FINAL AUDITORIA SAÚDE TERRITORIALIZAÇÃO E VÍNCULOS.pdf`; 130 `Relatório Final de Auditoria _assinado.pdf` | Objeto/período/critério/achados/conclusão/recomendação | Modelos de relatório final. Divergência de datas do transporte escolar deve ser preservada e conferida, não corrigida por suposição |
| 127 monitoramento transparência; 098 maturidade PDMC; 007 quantitativo Controle | Critério/área/nota/constatação/ação e estrutura/responsabilidade | Evidências/contexto do controle; maturidade 69,4 e ITP 96,74 são notas históricas da prefeitura, não percentuais de atendimento do software |
| 080 `LEI Nº 677-2025 REFIMI - Tributario.pdf` | Vigência/receitas/debitos elegíveis, redução por modalidade, nº parcelas, mínimo PF/PJ, vencimentos e fundamento | Dívida/benefícios e renúncia; débitos até 31/12/2024, 90% à vista/60% até 3/30% até 6 sobre multa/juros, mínimo PF 40/PJ 70; campanha histórica até 31/08/2025 com eventual prorrogação legal, não habilitar 2026 automaticamente |
| 108 `Plano_Diretor_-_Ibema_-_PR.pdf` | Zoneamento/índices/território/Obras/Posturas; LC030 ISS p.391–480 e LC031 risco/licenciamento/taxas p.481–503 | IPTU/ISS/NFS-e/construção e cadastros. Conferir município/artigo/tabela/alterações; CNAE, serviço LC116 e grau de risco são dimensões distintas |
| 087 `Links de Transparencias e APIS.txt` | Contrato externo de consulta da transparência e links | Referência de migração/consulta, não nova integração obrigatória. API Elotech não implementada por haver link; opção somente na fase externa se necessária ao checklist |
| 024/099/136 contatos/organograma/responsáveis; 088–090/111/137 pessoal | Órgão/unidade/função/vigência, matrícula/cargo/lotação/situação/regime/referência | Mapear centro administrativo ↔ unidade orçamentária e estatística de cargos por data; relação de ativos não contém cargos extintos nem histórico completo |

### 8.5 Dicionário mínimo interno e regras de transformação

Nomes abaixo são **contrato lógico de dados a mapear**, não nomes definitivos de novas tabelas ou autorização para duplicar tabelas existentes.

| Conjunto | Tipo/dados mínimos | Tratamento obrigatório |
|---|---|---|
| Proveniência | ID catálogo, arquivo/hash/página/linha, entidade/UG, exercício/competência, data emissão/coleta, versão de layout/lei/artigo | Preservar a fonte de cada valor e a referência histórica |
| Código/classificação | Texto com zeros/pontuação, hierarquia/pai/nível/analítico, versão/vigência, correspondência ao ID canônico | Nunca converter 02001 ou natureza/fonte em número e perder identificação |
| Valor | Decimal BRL/escala adequada; sinal bruto/redutor/estorno, período versus acumulado, previsto versus atualizado versus executado | Importar `1.234,56` como 1234.56; arredondamento explícito; manter USD distinto de BRL |
| Evento de despesa | Origem/ente/exercício/número/estágio/evento/data, dotação/fonte/credor/documento/itens/valor/anulação/estorno | Não transformar relacionamento 1:N em N empenhos nem repetir o valor original em cada evento |
| Receita/tributo | Natureza/fonte/operação, origem fiscal/componente, lançado/arrecadado/recolhido, pagamento/crédito/baixa/exercício e renúncia | Não criar pagamentos individuais a partir de totais mensais; separar principal de DA, multas/juros e redutoras |
| Conta/partida | Conta analítica/natureza/ente/UG/fonte/MSC, evento/revisão/competência/origem, débito/crédito e saldo abertura | Plano de contas é catálogo; razão/saldo e dimensão MSC precisam fonte própria |
| Objeto/item/custo | Origem reconhecida/VPD/consumo, valor apropriável/estornado, critério/objeto/item/percentual/competência/data apropriação | Orçado, pagamento e custo não são sinônimos; não criar custo livre sem origem reconhecida |
| Auditoria | Plano/checklist/versão/item/equipe/centro, resposta/achado/parecer/providência/responsável/prazo/evidência/publicação | Snapshot ao enviar, resposta atribuída ao destinatário, evolução do achado preservada |
| Exportação | ID/layout/versão, filtro/corte/entes, dataset/hash arquivo, usuário/emissão/assinatura/publicação | Emitir a partir da origem canônica; assinatura do PDF fonte não é reutilizada |

**CSV municipal conferido:** ambos têm preâmbulo de quatro linhas, cabeçalho na linha 5, separador `;`, decimal brasileiro e coluna vazia terminal. Exportação fiel deve reproduzir isso se essa for a versão escolhida; exportação analítica interoperável pode ter outro contrato documentado. Não misturar os dois sem identificação.

**Duplicidade:** preferir uma origem por fato; chave externa = entidade + exercício + documento/estágio/evento, com refinamento necessário a cada modelo. Mesmo evento em PDF, CSV e API não pode produzir três registros. Guardar rejeições/conflitos e reconciliação, em vez de sobrescrever valores divergentes.

### 8.6 Dados que ainda faltam para uma implantação confiável

- CTM vigente/consolidado, PGV, alíquotas e bases IPTU/ITBI/taxas, indexadores/valores anuais e regras de desconto/isenção/retificação; LC de ISS recebida precisa alterações/vigência confirmadas.
- Cadastros individuais de imóveis/testadas/coproprietários, empresas/sócios/contadores, lançamentos/parcelas/DA/livros/acordos/pagamentos, documentos fiscais e processos reais. Totais de tributos não os substituem.
- Razão e partidas analíticas, saldos iniciais conciliados por ente/UG/conta/fonte/banco, matriz contábil aprovada, dimensões MSC e tabelas/layouts TCE/STN por exercício.
- Base da Câmara: peças/saldos/execução, responsáveis/assinantes, regras fiscais e instrumentos próprios; o pacote municipal não a comprova.
- Documentos/itens/aditivos/medições/atestos e prestação de contas de contratos/convênios; parcelas de dívida/PPP/precatórios e consórcios quando necessários aos cenários.
- Histórico de folha/provisões/retidos/encargos/cargos/extinções; depreciação/exaustão/amortização e estoque/consumo valorizado com critérios de custo.
- Definição da fonte dos processos contra o Município e acesso de Controle Interno; não presumir conector judicial.
- Arquivos originais e layouts bancários/Receita/DES-IF/ESTBAN/cartões/TSE, credenciais/certificados/convênios aplicáveis às fases finais.

Obter documentos/parâmetros locais durante as primeiras fases. **Isso não é integração externa e não deve ser adiado**, pois define o cálculo interno que será exportado.

## 9. Fases consolidadas de execução

`P0–P11` são identificadores de fase deste plano, diferentes dos rótulos de prioridade P0/P1 do checklist geral. Não estimar prazo em dias sem inventário item/subcritério, dados, equipe e implantação definidos. Cada fase termina com evidência do comportamento, além de código.

### P0 — consolidar rastreabilidade e preparar o ensaio

**Execução registrada em 12/10/2026:** [fechamento P0](poc-p0/FECHAMENTO_P0.md) e [controles individuais](poc-p0/INDICE.md). Após esclarecimento do usuário de que o banco atual contém dados fictícios, a preparação passou a utilizar essa base, preservando registros e integrações. 68 migrations já aplicadas; dataset de ensaio aditivo carregado. Ensaio autenticado não executado nesta fase e não bloqueia o início das correções de P1.

**Objetivo:** transformar o diagnóstico em controle executável sem duplicar entregas existentes.

- Fixar revisão/commit de partida e inventário de migrations/status em **ambiente isolado**; registrar o estado real atual, sem usar o readiness antigo como estado presente.
- Desdobrar os 15 blocos oficiais em linhas individuais: ID, texto integral/subcritérios, situação, evidência/caminho, rota, gap, responsável, fase, fonte documental, dependência e aceite por ente.
- Reusar as 198 linhas de Planejamento e as matrizes 31/36 de Custos/Controle; completar Contábil/Financeiro e os nove blocos tributários.
- Para cada `NÃO VERIFICADO`, procurar produtor, consumidores, schema, UI/API, exportação e testes antes de decidir que precisa desenvolvimento.
- Preparar instância de ensaio com Prefeitura/Câmara, mais de 20 registros nos catálogos/consultas relevantes, anos anteriores/corrente/futuro e usuários com papéis distintos.
- Mapear cada dado/documento recebido ao requisito; separar referência de layout, parâmetro legal, histórico e dado operacional.

**Saída:** 1.052 IDs sem lacunas/duplicações no controle; backlog limitado ao checklist; banco/versão e dataset de ensaio identificados. Não carregar dados fictícios no banco operacional.

### P1 — fundação compartilhada, escopo e classificações

**Reorganização solicitada em 13/10/2026:** a sequência de execução e os critérios de encerramento das frentes integradas estão em [Plano final de implantação](PLANO_FINAL_IMPLANTACAO_MODULOS_INTEGRADOS.md). O escopo e a matriz individual deste plano permanecem a referência; a reorganização não declara fases concluídas.

**Continuação local de 13/10/2026:** [registro de escopo, identidades e classificações](poc-p0/EXECUCAO_P1_2026_10_13.md). Implementações e leituras municipais registradas; sem validação técnica das alterações novas e sem encerramento da fase.

**Continuação mais recente:** [bloco integrado P1–P4](poc-p0/EXECUCAO_P1_P4_BLOCO_INTEGRADO.md). Três versões oficiais TCE-PR de 2026 importadas em revisão (14.494 entradas), com origem/hash/atributos e código externo separado do vínculo canônico. De-para e homologação local permanecem pendentes.

**Execução em andamento:** [P1 — fundação compartilhada](poc-p0/EXECUCAO_P1_ESCOPO_CONTABIL.md). Exercícios/fechamentos por entidade, receita com UG persistida, relatórios e Controle Interno com escopo autorizado; referência de retorno tributário reutiliza a partida canônica. Identidades de ensaio foram conciliadas e classificações sintéticas ganharam origem/vigência/hash. P1 permanece em andamento: revisão integral dos produtores restantes, relações CNAE/CBO/serviços, fonte/MSC e homologação dos catálogos oficiais ainda precisam ser concluídas.

**Dependência:** P0. **Prioridade dos gaps:** estrutural.

- Fechar entidade/UG/órgão/unidade/centro nos comandos e leituras financeiras, fiscais, custo e controle; definir o caminho canônico de escopo sem duplicar cadastro.
- Planejamento já tem escopo próprio: alinhar FinancialYear/dotações/banco/ledger aos mesmos entes, preservando IDs/legado e exercício comum quando esse desenho for utilizado.
- Reconciliar identidade pessoa↔empresa↔contribuinte↔fornecedor↔credor; unificação não pode perder vínculos ou história.
- Homologar/importar catálogos versionados PCASP/naturezas/fontes/TCE/STN, CNAE/CBO/serviços e relacionamento administrativo-orçamentário; campos externos textuais separados do ID.
- Consolidar conta analítica, D/C, dimensões de fonte/MSC e regras vigentes; parâmetros municipais e dados faltantes são tratados agora.
- Reconciliação Decimal/Float e saldos legados, sem promover agregado de relatório a lançamento analítico.

**Saída:** consultas/contagens/exportações isolam Prefeitura/Câmara; consolidação explicitamente autorizada; toda classificação usada no ensaio tem origem/vigência; conta sintética inválida é recusada quando o checklist exige último nível.

### P2 — fechar Tributação ↔ Financeiro ↔ Contabilidade ↔ Planejamento

**Continuação:** [crédito e restituição no bloco P1–P4](poc-p0/EXECUCAO_P1_P4_BLOCO_INTEGRADO.md). Excedente recebe ingresso extraorçamentário/obrigação; compensação extingue saldo sem caixa; restituição paga fecha tesouraria e partida própria. Eventos da matriz municipal, estornos tributários integrais e produtores fiscais restantes continuam pendentes.

**Bloco integrado P1/P2 executado:** [cadeia tributária](poc-p0/EXECUCAO_P2_CADEIA_TRIBUTARIA.md). Motor parametrizado/guia/retorno usam escopo autorizado; arrecadação de débito histórico ocorre no exercício corrente; baixa e crédito excedente são atômicos. Dezesseis testes aprovados em validação conjunta, três de concorrência externa não executados. A fase continua em andamento, inclusive o ingresso financeiro do excedente, os estornos/compensações e os eventos contábeis específicos.

**Dependência:** P1. **Requisitos centrais:** CF 177–181, Arrecadação 27–32/39–46, Dívida 25, Planejamento 75/81/99, NFS-e/Escrita e diagnóstico Controle 23.

- Corrigir GAP-02–09: origem e estágio único, motor contábil comum, arrecadação histórica, excedente e crédito, vínculo dívida/guia, estorno completo, restituição e renúncia.
- Definir e implementar todos os eventos exigidos de crédito/exercício/DA/extinção/benefícios, conta/cálculo/competência e críticas antes da contabilização; não enviar toda operação para um evento genérico de arrecadação.
- Completar revisão da NFS-e/escrita/débito e transferência ITBI no gatilho configurado do pagamento, preservando etapas e históricos.
- Fechar renúncia tributária prevista/realizada e compensação fiscal em Planejamento. Compensação do contribuinte é outro fluxo e não atende sozinha renúncia LRF.
- Ensaiar todos os pontos de entrada reais, inclusive actions de retorno/guia/dívida/receita, não apenas chamar serviço isolado.

**Saída:** cada evento é rastreável até origem/conta/tesouraria/realizado; replay não duplica; falha no fechamento da cadeia reverte ou mantém estado recuperável explícito; dívida de ano encerrado é recebida corretamente no corrente; nenhum crédito se perde.

### P3 — completar contabilidade, tesouraria, RP e abertura/fechamento

**Bloco iniciado:** [P1–P4 integrado](poc-p0/EXECUCAO_P1_P4_BLOCO_INTEGRADO.md). Transferências bancárias conferem ambas as UGs, conteúdo do replay, vínculo de entidade, saldo e competência. A fase integral permanece em andamento.

**Dependência:** P1–P2.

- Completar subempenhos/históricos/cópias, saldos por data, estágio em liquidação/ativo/VPD, documentos e itens múltiplos/estrangeiro/duplicidade, estornos parciais e notas conforme CF.
- Toda postagem passa pelas mesmas guardas de período/escopo/conta/evento/origem; conciliar registros antigos sem transação e impedir nova escrituração órfã.
- Completar fonte permitida por conta, receitas/redutoras/extras/rateios e lotes simultâneos; retenções/extras e sua origem/pagamento/estorno sem dupla obrigação.
- Fechar pagamentos parciais/lotes mistos/cronologia/pré-autorização/cheques/duplicação e relação entre bruto, líquido, extras e tesouraria.
- Conciliação N:N/parcial/pendências/transportes/históricos com saldo demonstrável; parsers externos ficam em P9.
- Completar fechamento/abertura provisória/refeita, RP por estágio, cancelamento/inscrição com partidas, estimativos, transportes de programas/extras e desfazimentos independentes; novo ano funciona antes de concluir anterior.

**Saída:** fatos e reversões reconciliam banco/fonte/conta/dotação/competência; mês fechado recusa todas as origens; etapas do ano anterior e abertura corrente são reemitíveis e reexecutáveis sem duplicar saldo.

### P4 — integrações produtivas: folha, compras, patrimônio, estoque e instrumentos

**Bloco iniciado:** [P1–P4 integrado](poc-p0/EXECUCAO_P1_P4_BLOCO_INTEGRADO.md). Alienação patrimonial usa classificação explícita e serviço financeiro canônico, com receita/tesouraria/partida/realizado na mesma transação da baixa. Os demais produtores e reversões permanecem em revisão.

**Continuação municipal:** folha com ciclo nativo e provisões por componente do empenho; diárias com roteiro publicado e empenho automático; adiantamentos com concessão, apresentação, revisão independente e estorno em contas de controle oficiais. Testes PostgreSQL segregados Prefeitura/Câmara aprovados. Restituição parcial/por exercício, reapresentação de impugnação, demais produtores patrimoniais/estoque/instrumentos e reconciliação integral dos critérios continuam em implementação; resultados não representam conclusão de P4.

**Dependência:** P1–P3. Executar somente os comportamentos desses produtores necessários aos checklists analisados.

- Folha: liberação RH→críticas→empenho automático por tipo/classificação→liquidação/extras→pagamento de todos→conclusão digital; desmovimentação bloqueada após liquidação/pagamento; provisões/encargos/baixas contábeis.
- Compras: requisição/ordem/contrato/processo/itens/desdobramento/centro→reserva/empenho; consultar origem; estorno devolve corretamente itens e reservas.
- Patrimônio/estoque: incorporação/a incorporar, movimentações, depreciação/exaustão/amortização e consumo valorizado; distinguir estoque de material consumido já na verificação/liquidação.
- Obras: cadastro/conta de incorporação/medições/anexos/contratos/aditivos/licitação e empenhos, valores/execução/transparência exigidos.
- Diárias/adiantamentos: roteiro de processo, liberação/empenho e prestação; convênios/beneficiário online/documentos/revisão/aprovação/contas automáticas/atrasos/bloqueio.
- Consórcios, precatórios, dívida fundada e PPP: localizar base existente e completar campos/movimentos/parcelas/partidas/vínculos/relatórios expressamente exigidos, inclusive cenário sem movimento real.

**Saída:** operação originada no outro módulo chega ao Financeiro com IDs e documentos originais; reversão não deixa origem financeira ou setorial divergente; todos os produtores de custos/controle têm saldo e reconhecimento verificáveis.

### P5 — completar jornadas tributárias e elaboração/manutenção de Planejamento

**Registro da execução P5–P10 em 13/10/2026:** [entregas locais, requisitos vinculados e pendências](poc-p0/EXECUCAO_P5_P10_2026_10_13.md). As alterações novas ainda não foram validadas; o registro não encerra fases nem promove requisitos a ATENDE.

**Dependência:** P1; etapas com efeitos financeiros exigem P2–P4. Cadastros sem esses efeitos podem avançar paralelamente após a fundação.

- Executar todas as linhas da seção 5: campos/relacionamentos/histórico/espelhos por data, formulários/regras configuráveis, vistorias/mapas, cópias/lotes, unificação/desmembramento, alvarás e ITBI.
- Motor anual por receita/fórmula/tributo, simulados identificáveis, efetivação, critérios de débito/desconto/mínimos/opções/atualização, jobs duráveis e virada automática exigida.
- Parcelamento/DA: modalidades/vigência/ACL/termos/rescisão/imputação/antecipação/inscrição/movimentos e execução fiscal documental, sem adicionar conector judicial não previsto.
- NFS-e/escrita: todos os dados/configurações/prazos/representações/rascunho/retroativa/RPS/proteção/créditos IPTU/CNO, assinatura exigida e ciclos internos de DES-IF/Simples.
- Fiscalização: autorizações/documentos, homologação individual/global, autuação/recurso/DTE/regularização, equipe/plantão/calendário/produtividade e jobs.
- Planejamento: revisar S3–S7 entregues, completar somente lacunas demonstradas nos 99 comportamentos; programas/metas/obras/memórias/renúncia/importação anual/copias/compatibilização/GED/tramitação.
- Portais necessários ao checklist são integrações internas do produto: contribuinte/contador/tabelionato/beneficiário/fornecedor respondem/consultam o domínio canônico com escopo. Não adiar esses portais para a fase de banco externo.
- Para app iOS/Android de NFS-e, comprovar o comportamento exigido usando a base existente ou completar esse canal; incluir apenas os serviços pertinentes ao item NFS-e 4 nesta entrega.

**Saída:** todas as operações internas exigidas executáveis pela interface com persistência, ações/validações, histórico e canais autorizados. JSON/IDs livres não substituem os seletores/editoração requeridos. Arquivos oficiais ainda pendentes ficam claramente identificados.

### P6 — Custos em Financeiro e Controle Interno em Auditoria

**Dependência:** fundação P1, origens P2–P4 e comportamentos pertinentes de P5. Cadastro/checklist pode começar antes, mas automação não é concluída sem os produtores.

**Custos (F11):**

- Objetos/árvore/geração LOA por seis níveis, itens/classificações/padrões/ativação, agregadores/percentuais e relações/cópia anual.
- Apropriação manual e na liquidação, pendentes, estorno/desfazer na mesma tela/nota, limites e concorrência.
- Gatilhos reais liquidação/em verificação/VPD/prestação, folha por todos os critérios e lote, depreciação e consumo de almoxarifado.
- Relatórios/gráficos 28–31 e leitura autorizada em Administração, com data despesa diferente da data apropriação.

**Controle Interno (F12):**

- Adotar planos/apontamentos existentes preservando IDs/histórico e resolver ente comprovadamente, com compatibilidade de acesso da rota antiga.
- Documentos/observações/anexos/notificações/respostas/impressão; checklist/grupo/item/categoria/padrão/cópia/versão e respostas possíveis.
- Auditoria agendada/questionário/encaminhamento/resposta/análise/achado/parecer/providência/encerramento/cancelamento/duplicação.
- Diagnósticos das quatro famílias, fonte canônica, competência e status não avaliado; caixa pessoal, agenda/criticidade/visibilidade/baixa/calendário/alertas.
- Consultas Ouvidoria/processos contra Município/cargos históricos, quadros/anexos e relatório circunstanciado/relatórios legais/publicação.

**Saída:** controle exige evidência dos 31 e 36 itens; relatórios/comunicações oficiais ainda não homologados permanecem pendentes até P7/P10. Não declarar F11/F12 integralmente concluídas apenas com CRUD.

### P7 — relatórios, documentos, assinatura e publicação exigidos

**Dependência:** fontes de P1–P6. Desenvolver por família de relatório com dataset compartilhado, sem duplicar cálculo fiscal entre Financeiro, Planejamento e Controle.

- Implementar/adequar todas as saídas da matriz: filtros, agrupamentos/totalizadores, período versus acumulado, ente/consolidado, original/atual/versão e todos os subquadros oficiais exigidos.
- Motor fiscal comum: RCL executada com 12 meses e ajustes, DTP, MDE/FUNDEB, ASPS, primário/nominal, caixa/RP/dívida/garantias/crédito e particularidades legislativas; separar previsões de execução.
- DCASP/Lei 4.320 e anexos LOA, termos diário/razão, relatórios específicos de dotações/empenhos/RP/extras/pagamentos/disponibilidade/bens/obras/diárias/dívida/PPP, com fontes documentais da seção 8.
- Tributários: espelhos/declarações/avisos/notificações/guias/termos/CDA/petição/recibos/livros, comparativos e todos os relatórios/malhas/plantões dos nove checklists.
- Custos/Controle: notas/estornos/gráficos, circunstanciado/quadros/anexos, calendário/estatística cargos e emissão dos relatórios legais a partir da mesma fonte financeira.
- Templates versionados, prévia, geração dos formatos expressamente requeridos pelo item, memória e origem; PDFs municipais de exemplo não são especificação de TXT externo.
- Assinatura/tramitação com todos os responsáveis, mesmo artefato final/anexos no portal, publicação automática/simultânea quando exigida, falha/retry/retirada e autenticidade.
- Aproveitar a publicação rastreável de Planejamento S8; conferir storage real e layout antes de promover de REVIEW_COPY para emissão normativa.

**Saída:** validação aritmética por linha/subtotal/total + validação visual/normativa por versão/ente. Dataset, tela, PDF e planilha conferem; arquivo publicado e arquivado são idênticos. Credenciais/serviços externos de assinatura/email pendentes ficam explícitos em P10.

### P8 — ensaio integral do núcleo interno e regressão cruzada

**Dependência:** P1–P7. Esta fase precede os intercâmbios externos e reduz retrabalho de payload/layout.

- Executar cada item interno por ente e todos os subcritérios; registrar claramente os que aguardam componente externo, sem marcar como atendidos.
- Testar ações reais/UI/exportações/downloads/portal, concorrência, replay/conflito, falhas intermediárias, estornos, competência fechada e isolamento entre usuários/entes.
- Cenários mínimos: cadeia orçamento→compra→empenho→liquidação→pagamento→estorno; folha por tipo; crédito/receita/renúncia/restituição; IPTU/ISS/ITBI/NFS-e/escrita/DA; reconhecimento/custo; quatro diagnósticos; publicação.
- Atualizar as 198 evidências Planejamento e as matrizes Custos/Controle; consolidar as evidências individuais Contábil/Financeiro/tributárias.

**Saída:** nenhum bloqueador interno aberto para gerar/importar os dados externos; divergências resolvidas na fase de origem. A aprovação do núcleo não é o aceite final de 1.052/1.052.

### P9 — última frente de desenvolvimento: intercâmbios externos por arquivo

**Dependência:** P8; layouts oficiais/arquivos originais/versionamento fornecidos. Todos os parsers/geradores externos ficam aqui, inclusive quando não exigem credencial.

- Contabilidade: SIM-AM/TCE-PR, SIOPE, SIOPS, MSC/STN, REINF e outros arquivos expressamente necessários ao requisito, sem inventar formatos/sistemas adicionais.
- Autônomos/folha: contribuições/informações necessárias aos itens CF 12/17–22, SEFIP/eSocial quando aplicável; reusar domínio RH/eSocial, sem duplicar uma integração.
- Arrecadação/pagamento: remessa/retorno/carnês TXT/XML e FEBRABAN/borderô nos layouts do convênio; OFC/OFX originais para conciliação; arquivo preservado/hash/lote/validações/download.
- Fiscal: TXT municipal de escrita, Simples/Receita/PGDAS-D e saída/termos, quatro módulos DES-IF ABRASF/PGCC/tarifas/partidas/rateios, ESTBAN e cartões, TSE permissionários/NFS-e candidatos/partidos.
- Protesto: remessa CRA, comarca/responsáveis e arquivos/retornos de desistência/cancelamento exigidos. Não chamar arquivo interno de layout oficial.
- Validar conteúdo, tipos, encoding, delimitadores, casas decimais, versão, obrigatoriedade, identificação, totais e regras de importação idempotente.
- Recusar lote inválido e apresentar crítica precisa; processamento parcial somente se o contrato do layout e o requisito admitirem, com balanço de aceitos/rejeitados.

**Saída:** arquivo real validado no leiaute aplicável e, quando disponível/exigido, no validador do destinatário; original e processamento rastreáveis. Exportar XLSX/CSV interno não atende sozinho um arquivo legal oficial.

### P10 — últimas integrações: conectores e homologação externa

**Dependência:** P8/P9 e pré-requisitos concretos do fornecedor/órgão. Preservar simuladores atuais como ferramenta de ensaio, identificados como tal.

- Banco/convênio: registro WS e PIX tributário condicionais, envio/retorno/consulta de pagamentos/borderô, estados e autorizações/assinantes. `BankIntegrationClient` atual aceita Banco Virtual Robonuvem; implementar provedor oficial sem renomear o simulador.
- PIX: cobrança/txid/payload/QR compatível, consulta/retorno/baixa/reversão quando aplicável. `copyAndPaste: PIX-...` atual é referência interna e não comprova cobrança bancária.
- NFS-e: interface WS para softwares contribuintes, layout próprio/ABRASF, autenticação/assinatura, lote/protocolo/XML de ida/volta/erro/cancelamento; não presumir que basta cliente de envio a outro fornecedor.
- ADN/MEI nacional: recebimento e envio nos casos exigidos, identificação/origem/competência, eventos e escrita deduplicada.
- SEFAZ/consulta de NF contra entidade e acesso à nota conforme CF 36/50; certificado/credenciamento e retorno real.
- CRA/cartórios: transmissão/retorno conforme o meio realmente disponibilizado; documento interno não significa protesto efetivado.
- eSocial: comunicação exigida para autônomos/folha por integração existente de RH; validar apenas os eventos/retornos necessários às dependências deste plano.
- E-mail/assinatura externos quando necessários aos itens: notificações automáticas/manuais e histórico/retornos reais; assinatura qualificada/formatos conforme exigência, sem confundir assinatura interna de hash com PAdES/XMLDSig completo.
- API Elotech (ID 087): utilizar somente se escolhida como fonte necessária de migração/conferência; não acrescentar obrigação contratual. Base/porta/paginação/chave e duplicidade com PDFs/CSVs precisam validação.

**Saída:** envio/retorno/protocolo/erro e rastreabilidade comprovados no ambiente permitido; registrar REAL/HOMOLOGAÇÃO/SIMULADO POC e a conclusão de atendimento separadamente. Dependência não resolvida mantém o requisito aberto.

### P11 — aceite final de 100% por checklist e por ente

**Dependência:** P0–P10 e resolução de todos os bloqueadores dos requisitos.

- Reexecutar itens afetados pelos conectores/arquivos e regressões com as integrações finais.
- Registrar uma linha por ID com todos os subcritérios, roteiro/dados/perfil/ente/UG/ano/competência/versão, resultado, artefatos/hash/URL/protocolo quando aplicável, data/executor/commit e norma/layout.
- **Somente ATENDE pontua.** PARCIAL, NÃO ATENDE e NÃO VERIFICADO ficam abertos; no cálculo conservador não pontuam.
- Conferir os denominadores da seção 2 e fechar exatamente **99/99, 99/99, 189/189, 189/189, 36/36, 31/31 e os nove denominadores tributários**, sem compensar um módulo por outro.
- Ensaio da apresentação presencial por módulo/ente e documentos finais reemitíveis. Build/teste verde não substitui a demonstração dos requisitos.

**Saída:** 1.052/1.052 apenas como controle de completude; aprovação calculada individualmente para cada checklist. Se um subcritério não for comprovado, não declarar 100% daquele bloco.

### 9.1 Correspondência com os planos anteriores

| Plano anterior | Aproveitamento nesta sequência |
|---|---|
| Planejamento S1 contabilidade / S2 execução | Reutilizar testes/implementação em P1–P4; corrigir integrações com consumidores atuais, não recomeçar |
| Planejamento S3–S6 catálogos/manutenção/importação/GED | Revalidar e completar P1/P5; nenhuma entrega histórica ganha aceite automático |
| Planejamento S7 relatórios | P7, com motor fiscal comum e referências municipais |
| Planejamento S8 publicação | P7; validar storage/layout/implantação real |
| Planejamento S9 / F10 homologação | P8 para núcleo e P11 para final, 99 requisitos independentes por ente |
| F11 Custos | P6/P7, com produtores em P3/P4 e aceite final P11 |
| F12 Controle Interno | P6/P7; email externo P10; aceite final P11 |
| F9 integrações Planejamento | Distribuída em P1–P7 conforme origem; intercâmbios realmente externos em P9/P10 |

## 10. Matriz de dependências externas das fases finais

Solicitar materiais/acessos antecipadamente, sem antecipar o desenvolvimento dos conectores. O núcleo trabalha com contrato validado e dados de ensaio; faltas de parâmetros locais são resolvidas em P1, não nesta matriz.

| Dependência / itens principais | Material concreto necessário | Responsável esperado | Prova final |
|---|---|---|---|
| TCE/SIM-AM, STN/MSC, SIOPE/SIOPS/REINF — CF 2/12/94/106/129 e classificações relacionadas | Layout/versão/exercício, exemplos válidos, regras/validador, dimensões da conta-corrente e campos obrigatórios | Contabilidade Prefeitura/Câmara e responsável pela prestação | Arquivo íntegro, crítica/validação, total reconciliado à origem e histórico |
| Banco/arrecadação — Arrecadação 1/13–16/27–28/47–48; Dívida 27; Receitas Diversas 9 | Banco/convênio/carteira/layout, referências, arquivos, homologação e credenciais WS/PIX se convênio existir | Tesouraria/Tributação/banco | Cobrança/retorno correspondente, lote/original, baixa e estorno sem duplicidade |
| Pagamento/borderô — CF 137/142/146–149/171–172 | Layout de remessa/retorno, método de reconhecimento, assinantes/alçadas e canal oficial | Tesouraria/ordenador/banco | Sem assinaturas não envia; retorno parcial/rejeição/aceite concilia cada pagamento |
| OFC/OFX — CF 159 | Arquivos originais com conta/período/IDs/sinais, exemplos SGML/XML/encoding usados | Tesouraria/banco | Importar, imprimir, repetir sem duplicar e conciliar com pendências |
| NFS-e WS — NFS-e 5/9/23/29/42/54 | Layout municipal ou ABRASF/versão/XSD, política assinatura/autenticação, exemplos lote e retorno | Tributação/software contribuinte | Requisição real, protocolo e XML íntegro com consulta/cancelamento/erros |
| ADN/MEI — NFS-e 6; Escrita 25–27 | Credenciamento/convênio, certificado/endpoints/padrão/eventos e ambiente | Tributação/Administração e órgão nacional | Receber/enviar conforme o caso, repetir/retificar sem duplicar documento/escrita |
| Simples/PGDAS-D — ISS 40–41; Fiscalização 35–36/63–64/77 | TXT e layout oficiais, autorização de dados e recorte por competência | Tributação/Receita/contador | Parser, empresas do lote, críticas, termos e saída oficial quando exigida |
| DES-IF/PGCC/ESTBAN/cartões — Escrita 43–58; Fiscalização 30–34/58–60/73–77 | Quatro módulos/arquivos, versão ABRASF, COSIF/PGCC, tarifas, exemplos e meio de fornecimento | Tributação/instituições/Bacen/operadoras | Importação por dependência/competência e confrontos reproduzíveis; ausência não vira zero |
| CRA/protesto — Dívida 23–24 | Convênio/meio de envio, layout/retorno, comarcas e regras de desistência/cancelamento | Tributação/Procuradoria/CRA | Remessa validada e retorno real com responsável/estado/documento |
| SEFAZ/DANFE — CF 36/50 | Ambiente/certificado/credenciamento e meio autorizado de consulta | Contabilidade/Compras/SEFAZ | NF contra entidade correta, conteúdo/consulta acessível e erros tratados |
| TSE — NFS-e 55–56 | Layout vigente, identificação de permissionário/candidato/partido e arquivos de exemplo | Tributação/órgão destinatário | Dois conjuntos de exportação corretos, origem/versão e conferência |
| eSocial/SEFIP autônomos — CF 12 e dependências folha | Classificação e dados dos contribuintes, evento/layout/ambiente e configuração do domínio RH | RH/Contabilidade | Origem financeira rastreável e retorno pelo domínio existente, sem fluxo duplicado |
| E-mail/assinatura — Controle 29; NFS-e 7–9/20; Fiscalização 20–21; Dívida 12/26; CF assinatura/borderô | Provedor ativo/retornos, política documental, responsáveis, certificado/formato quando necessário | Administração/TI/autoridades | Documento exato assinado; tentativa/envio/retorno e resposta distinguidos |

**Escopo de exclusão de novos conectores:** não acrescentar Gov.br/LDAP/DNE/PNCP/SUS/MNI judicial apenas porque aparecem em catálogo geral ou comentário no código. Dependências transversais já exigidas por outro checklist devem ser tratadas no respectivo plano; nesta entrega entram apenas se forem indispensáveis ao comportamento dos 15 blocos e com vínculo explícito ao item oficial.

## 11. Verificação técnica, evidências e gestão de execução

### 11.1 Evidência por requisito

Modelo mínimo a usar no controle individual:

```text
ID/ente + texto oficial + subcritérios
Status: ATENDE | PARCIAL | NÃO ATENDE | NÃO VERIFICADO
Tipo: NATIVO | CONFIGURAÇÃO | INTEGRAÇÃO REAL | HOMOLOGAÇÃO | SIMULADO POC | SEM EVIDÊNCIA
Código/schema/API/tela e revisão
Fonte documental ID/arquivo/página; norma/artigo/vigência/layout
Dados: ente/UG/ano/competência/origem/versão/perfil
Roteiro e resultado esperado de cada subcritério
Resultado obtido, artefato/hash/URL/protocolo e efeito persistido
Falha/estorno/replay/escopo quando pertinentes
Gap/dependência/fase/responsável
Data/executor/commit e conclusão individual
```

Relatório que exige vários quadros/ações/filtros não é atendido pela existência de apenas um deles. Item de arquivo/integração não é atendido por JSON interno ou nome de provedor no catálogo. Não calcular percentual numérico de desenvolvimento a partir da quantidade de telas/funções.

### 11.2 Testes e checks vinculados ao risco real

**Otimização autorizada:** agrupar mudanças relacionadas em blocos integrados e executar testes, lint, inventário e build no fechamento do bloco. Não repetir a validação completa a cada ajuste. Reexecutar somente em caso de falha ou alteração relevante posterior; migrations ainda não aplicadas podem ser agrupadas e as já aplicadas permanecem preservadas. Aproveitar a geração Prisma incluída no build quando uma execução isolada não for necessária para continuar o código/testes.

- Integração PostgreSQL: atomicidade, duas sessões, locks em ordem estável, replay/conflito, estorno parcial, saldo/excedente e rollback da cadeia.
- Autorização: dois entes/UGs e perfis distintos, acesso direto às actions/APIs/downloads/exportações e jobs; consolidação sem acesso a um dos entes deve falhar.
- Temporalidade: competência/fato/registro, origem de dívida antiga, RCL 12 meses, mudança legal, fechamento/abertura/reapuração e cortes de relatório anteriores ao estorno.
- Origem/custo: não duplicar bruto/líquido/retenção, estoque/liquidação/consumo, aquisição/depreciação, transferência entre entes ou fontes.
- Controle: questionário preservado após alteração do catálogo, destinatário isolado, duplicação sem respostas antigas, quatro diagnósticos e NÃO AVALIADO quando faltar base.
- Documentos: bytes arquivados/publicados iguais, layout/total conferidos, assinatura bloqueante e retorno/email não inferido de fila.

Reutilizar as suítes disponíveis de Planejamento (`planning-accounting`, `planning-execution`, `planning-completion`, `planning-publication`, domínio/operations/postgres), `procurement-finance-bridge`, `purchase-planning`, `public-finance`, `finance-report-definition`, `construction-taxation`, testes RH e `src/lib/financeiro/__tests__`/`src/lib/tributacao/__tests__`. Acrescentar cenários apenas para os contratos/invariantes modificados; suíte existente não cobre automaticamente o checklist inteiro.

Ao implementar: ler guias Next locais relevantes antes de alterar APIs/actions/rotas; conferir **todos os consumidores antes de mudar assinatura/retorno**; manter o padrão `{ error }` das actions cliente e o contrato de forms; alterações de banco aditivas/reconciliáveis; preservar migrations já aplicadas e trabalho existente. Rodar Prisma quando aplicável, lint direcionado, TypeScript/testes relevantes e **build antes de commit**, conforme AGENTS.md. Verificar o comportamento do script de build e usar a modalidade segura documentada (`VERCEL_ENV=development`) para evitar implantação implícita.

### 11.3 Critérios de impedimento do aceite final

- Qualquer requisito/subcritério em aberto ou dependente de comunicação oficial não comprovada.
- Escopo contábil/financeiro misturando Prefeitura e Câmara ou consolidado sem autorização.
- Saldo não reconciliado, chave duplicada, partida órfã, recebimento perdido/excedente não contabilizado ou ausência de reversão.
- Relatório sem classificação/composição/layout/competência homologados ou variante exigida ausente.
- Simulador, assinatura interna, arquivo normalizado ou protocolo interno apresentados como comprovação oficial.
- Origem ausente tratada como zero/regularidade, ou dado agregado convertido em movimento individual inventado.

## 12. Próximo passo e encerramento do plano

Iniciar **P0/P1**, com controle individual e fundação de escopo/classificação. Em seguida fechar **P2/P3/P4**, pois esses fatos alimentam os nove checklists tributários, Custos, Controle e relatórios de Planejamento. Executar **P5/P6/P7**, ensaiar núcleo em **P8**, finalizar somente então os **arquivos externos P9 e conectores P10**, e concluir os aceites em **P11**.

As escolhas de escopo, entes, inclusão de Custos e reorganização foram confirmadas com o usuário. As faltas documentais/configurações e decisões normativas ainda necessárias estão registradas nas seções 8.6 e 10 e devem ser resolvidas na fase afetada; não foram preenchidas com valores ou regras inventadas.

**Este documento entrega um plano de trabalho completo para os blocos solicitados, com cobertura numérica e dependências mapeadas. Não certifica que os módulos hoje atendem a 100%. A conclusão de 100% depende da implementação das lacunas, validação dos itens não verificados e evidência individual dos 1.052 requisitos.**
