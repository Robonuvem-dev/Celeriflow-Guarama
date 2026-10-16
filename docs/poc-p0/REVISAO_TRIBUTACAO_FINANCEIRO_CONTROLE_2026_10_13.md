# Revisão de Tributação, Financeiro e Controle Interno — 13/10/2026

## Escopo e estado do controle

A continuação solicitada para P5–P10 está registrada em [EXECUCAO_P5_P10_2026_10_13.md](EXECUCAO_P5_P10_2026_10_13.md), com requisitos associados a cada entrega e limites de atendimento. Não houve nova rodada de verificações.

Fontes: `CONTROLE_REQUISITOS.json`, EXE-02/LEG-02, EXE-03, EXE-12–17 e EXE-24–26, plano consolidado P1–P4 e plano de Custos/Controle Interno. São 823 registros de checklist: 378 financeiros nos dois entes, 36 de Controle Interno e 409 tributários. Os 189 textos financeiros são compartilhados entre Prefeitura/Câmara, mas exigem verificação operacional independente.

Esta revisão **não substitui a matriz individual, não promove busca lexical a atendimento e não registra aceite integral**. A matriz P0 conserva a fotografia original. Os desenvolvimentos abaixo têm evidências próprias e limites identificados.

**Estado mais recente:** a continuação de NFS-e/ITBI/perfis DA e restituições de diárias descrita ao final deste documento contém alterações locais **ainda não validadas**. Os builds e resultados aprovados das seções históricas antecedem essas alterações. Por solicitação do responsável, lint, Prisma, testes e build foram reservados para o fechamento da implementação integral; nenhuma nova execução dessas verificações ocorreu nesta continuação.

## Desenvolvimentos desta continuação

| Área / requisito relacionado | Implementação e evidência | Limite de encerramento |
|---|---|---|
| Controle, EXE-03.7 e .13 | Checklists publicados por plano, categoria, grupos e números únicos; editor operacional; pesquisa por categoria. `control-checklists.ts`, `ControlChecklistsClient.tsx`. | Conferência autenticada de interface pendente. Reutilização entre planos e revisão de todo o catálogo municipal ainda não verificadas. |
| Controle, EXE-03.8 e .12 | Respostas configuráveis por grupo, resposta irregular configurada, avaliação fundamentada e abertura atômica do apontamento; replay sem duplicação. Regra `BANK_ACCOUNT_SOURCE` consulta contas bancárias ativas da UG, aplica a primeira resposta como regular ou a resposta irregular configurada e preserva IDs da origem no histórico. | Diagnóstico implementado cobre fonte das contas; os demais diagnósticos orçamentários/constitucionais e produtores continuam pendentes. Não considerar os itens completos. |
| Controle, EXE-03.9 | Apontamentos preservados; responsável conferido na secretaria da UG; eventos de criação com ator e evidências referenciadas. | Revisão integral das permissões GED continua pendente. |
| Controle, EXE-03.10 e .11 | Parecer e providência corretiva por apontamento; identificação canônica do servidor em parecer de contratação; guarda de secretaria/UG e histórico aditivo. | Uso real com processos municipais e conferência de tela pendentes. |
| Controle, ciclo de decisão | Resolução exige fundamento; conclusão exige apontamentos resolvidos e todas as perguntas publicadas respondidas; reabertura justificada. Locks plano → apontamento e rollback do histórico. | Não substitui notificações, agenda, relatório circunstanciado ou publicação na Transparência. |
| Tributação, saldo e emissão de DAM | `assessmentPosition` conta pagamentos confirmados inclusive em guia documentalmente cancelada. Recusa pagamentos sem Decimal conciliado; não reabre disponibilidade artificialmente. | Demais regras de acréscimos, parcelamento e períodos ainda exigem encerramento próprio. |
| Tributação, reconhecimento/DA | Fixtures reconciliadas ao schema e ao fluxo real: endereço/CDA disponíveis, origem do catálogo explícita, emissão de CDA e extinção pela baixa DA canônica. | Sem enfraquecer a guarda que impede extinção de DA pelo fluxo de lançamento comum. |

Migration aditiva: `20261013100000_internal_control_decision_history`, aplicada por `prisma migrate deploy`. Cliente Prisma regenerado. Nenhum dado financeiro foi inserido para simular operação municipal.

## Verificações já aprovadas

- Dívida/guia/arrecadação parcial, replay, estorno e rollback: **2/2**, Prefeitura e Câmara, PostgreSQL real isolado.
- Diárias autorizadas/pagas, prestação, GED, UG e replay: **2/2**, Prefeitura e Câmara.
- Controle: isolamento por UG, parecer, resolução, fechamento/reabertura e rollback do histórico: **1/1**.
- Controle: edição de checklist, resposta irregular, rollback do achado, respostas concorrentes, replay e fechamento: **2/2**, Prefeitura e Câmara.
- Reconhecimento tributário, VPA sem duplicação, benefícios, extinção, DA, retorno à origem e estornos históricos: **2/2**, Prefeitura e Câmara, após corrigir as fixtures.
- Rodada adicional de cadeia fiscal, reconhecimento tributário (incluindo saldo pago em guia cancelada), conciliação e patrimônio: **26/26 aprovados** em PostgreSQL real isolado.
- Diagnóstico bancário nos dois entes: **2/2 aprovados**, no mesmo teste de checklist ampliado: ausência de dados sem resultado regular inferido, fonte faltante em outra UG ignorada, regra manual recusada, replay do diagnóstico, fatos alterados exigindo nova edição e resultado anterior preservado.
- ESLint do bloco aprovado. `npm run build` completo **aprovado, saída 0**, após o diagnóstico automático: geração Prisma, tipos de rotas, TypeScript integral e compilação/prerenderização Next. Comandos anteriores em background foram cancelados pelo reinício do servidor; o build em primeiro plano os substituiu.

## Dependências operacionais confirmadas por leitura do banco

`npx tsx scripts/verify-municipal-module-readiness.ts`, em 13/10/2026, confirmou: **0 contas bancárias, 0 mapeamentos financeiros tributários e 0 perfis de reconhecimento ativos**. A configuração exige dados de contas efetivas, fonte, UG/ente e vínculos arrecadadores. Não inferir agência/conta nem ativar reconhecimento sobre vínculos inexistentes.

## Desenvolvimento ainda pendente — responsabilidade técnica

As pendências abaixo **não dependem apenas do usuário** e não podem ser convertidas em aceite por falta de cadastro operacional:

- P1: consumidores/produtores remanescentes, adoção/de-para/vigência CNAE/CBO/serviços, fonte/MSC e conciliação de legados.
- P2: validação da gestão operacional de perfis DA e das transações NFS-e/ITBI implementadas nesta continuação; regularização de posições históricas, acréscimos/longo prazo e integração completa da escrita/fiscalização/LRF.
- P3: itens/documentos/subempenhos, estornos parciais, lotes/cronologia/pré-autorização/extras, pendências bancárias e ciclo anual/RP integral.
- P4: validação do tratamento equivalente das restituições nas diárias implementado nesta continuação; matrizes/consumo/amortização/exaustão patrimonial e demais produtores RH/Compras/obras/convênios. Regularização de prestação aprovada e devolução parcial do exercício corrente para adiantamentos foram implementadas e verificadas nas continuações anteriores.
- Controle: diagnósticos automáticos além da fonte das contas, cadastros/ciclo completos de controladores/notificados, notificações e resposta, agenda/obrigações, consultas canônicas Ouvidoria/Jurídico, relatórios RH/constitucionais, circunstanciado/anexos/publicação e demais subcritérios EXE-03.
- Reconciliação individual das evidências de todos os requisitos e testes pertinentes. Os resultados positivos deste bloco não são certificação dos 823 registros.

**P1–P4 e os três checklists completos permanecem em desenvolvimento. Não há autorização técnica de encerramento integral neste documento.**

## Continuação — regularização de prestação aprovada e restituição anterior

- `reopenAdvanceReport` aceita prestação aprovada ou impugnada, conciliando o estágio com a decisão registrada. Exige responsável distinto do solicitante/apresentante, parecer GED válido, data posterior ou igual à revisão e permissões financeiras de criação/alteração. A interface oferece a regularização da prestação aprovada.
- Inverte as partidas históricas de revisão e apresentação, preserva payload/documentos/IDs dos eventos originais, registra a decisão anterior e abre novo ciclo. Confere origem, UG/ente, data e valores Decimal das partidas antes da inversão. Serialização do titular usa a mesma chave da concessão.
- A restituição usada em prestação ativa continua protegida. Após reabertura, o ciclo novo não referencia a restituição antiga; o estorno financeiro nativo pode ocorrer e a prestação posterior precisa conciliar apenas os recebimentos vigentes.
- `advance-prior-year-refund.test.ts`: pagamentos nativos em 2025 e devoluções em 2026 nos dois entes; recebimentos parciais, concorrência/replay, limite acumulado, prestação/aprovação, estorno recusado antes de regularização, rollback por trigger na reabertura aprovada, preservação das aprovações anteriores, estorno com caixa exato e aprovação de novo ciclo. O relógio da fixture é controlado no teste para executar a aprovação nativa no exercício original; nenhum relógio/dado de produção foi alterado.
- A fixture compartilhada passou a criar colunas enum com o tipo PostgreSQL correspondente. O teste positivo revelou que a coluna de estágio da receita era TEXT enquanto Prisma enviava `RevenueStage`; corrigida a preparação, sem contornar a consulta de produção.
- **4/4 testes aprovados** de restituição anterior/regularização e diárias/adiantamentos, Prefeitura e Câmara. Após a correção da fixture, regressão de cadeia fiscal, conciliação, patrimônio e Controle Interno: **27/27 aprovados**. ESLint do bloco aprovado; novo `npm run build` completo aprovado, saída 0.
- A continuação seguinte implementa o produtor de recomposição parcial do corrente para adiantamentos. O tratamento equivalente de restituições nas diárias permanece em desenvolvimento.

## Continuação — devolução parcial do exercício corrente de adiantamentos

- `src/lib/financeiro/allowance-expense-refunds.ts`: recebimento e estorno transacionais por solicitação/pagamento. Exige pagamento integral da concessão sem retenções, mesmo exercício aberto, UG/ente/fonte/conta original, comprovante válido e servidor responsável vinculado ao usuário.
- Cada recebimento cria movimento de anulação parcial do empenho, registros corretivos negativos de liquidação/pagamento na **data da devolução**, documentos financeiros próprios, inversões proporcionais das linhas históricas de empenho/liquidação/pagamento e entrada de tesouraria. Recompõe cotas/cronograma de Planejamento. Os registros e documentos originais conservam valores, IDs e datas. **Não cria receita orçamentária para a devolução do corrente.**
- Os registros corretivos pertencem à execução financeira canônica: somam aos originais nos saldos liquidados/pagos, sem reescrever o passado. Não são ordens bancárias pendentes de transmissão. A origem RH guarda IDs das correções, caixa, movimento e partidas, com chave única/replay e limite acumulado entre devoluções do corrente e receitas de restituição anterior.
- Estorno preserva os registros negativos e acrescenta correções positivas na data do estorno; recompõe empenho/liquidação/pagamento/cotas, inverte as partidas da devolução e retira o ingresso de caixa. Recusa falta de saldo/dotação, exercício/período fechado e prestação ativa. Retoma a prestação após regularização independente já implementada.
- Guardas nativas impedem estorno isolado do pagamento original enquanto existem devoluções vigentes e cancelamento/estorno isolado dos registros corretivos. Depois de estornar todas as devoluções, a cadeia original pode ser estornada/anulada integralmente: os pares corretivos preservados e conciliados não bloqueiam a anulação final do empenho.
- A prestação exclui correções técnicas da comprovação do pagamento original e exige despesas + **todas** as restituições vigentes = concessão. Referência do corrente: `DESPESA:<id do evento>`; referências de receita anterior conservam o ID da receita. A interface de adiantamentos tem os dois comandos novos e o histórico documental inclui recebimentos/estornos do corrente.
- Testes nos dois entes: rollback por trigger no final do recebimento, concorrência/replay, limite acumulado, recomposição de disponibilidade, totais liquidados/pagos e caixa exatos, documentos originais preservados, ausência de receita RH no corrente, registro corretivo protegido, restituição omitida recusada, revisão/reabertura, estorno com replay/divergência e cancelamento integral posterior da cadeia original.
- Rodada integrada: **33/33 aprovados** em PostgreSQL real isolado. Após ampliar a anulação integral pós-estornos e exigir autor da liquidação, rodada focal: **6/6 aprovados**. Build completo com TypeScript/Next **aprovado, saída 0**. A primeira tentativa de build detectou opcionalidade do autor da liquidação; corrigida com exigência explícita de vínculo do usuário ao servidor responsável.
- Esta entrega encerra a pendência específica do corrente em adiantamentos, **não encerra automaticamente P1–P4** nem certifica os demais subcritérios financeiros/fiscais/Controle Interno.

## Continuação — lacunas confirmadas do checklist, ainda sem validação final

### Delimitação do planejamento

O plano consolidado abrange P1–P10. P1–P4 são etapas das integrações internas, não equivalem ao atendimento integral dos 823 requisitos dos três domínios. Os requisitos próprios de P5–P10, incluindo o ciclo de Controle Interno/Custos, relatórios e intercâmbios, continuam exigidos. A distribuição em fases não constitui dispensa ou aceite. Não foram adicionados novos objetivos além dos contratos de integração e subcritérios documentados.

### NFS-e, escrita e débito — GAP-09 / EXE-24.24–29 / contrato §7

- Emissão coordena nota, memória fiscal, declaração canônica, escritas automáticas prestador/tomador quando identificado, constituição do ISS próprio ou retido e reconhecimento contábil canônico em uma transação. O tomador identificado assume o débito de ISS retido; a nota avulsa conserva o débito aprovado da origem, sem segunda constituição.
- Cancelamento e substituição serializam a nota, extinguem o débito não recebido/não compensado/não inscrito em DA, cancelam suas guias e atualizam as escritas de origem. As partidas e os valores históricos da nota são preservados; há movimento de extinção do direito reconhecido. Recebimentos, compensações e DA exigem regularização pela origem antes da alteração fiscal.
- A substituição é atômica e tem replay pelo vínculo da nota substituta. Falha em qualquer etapa reverte nota nova, débito, escritas, devolução de créditos e vínculos. A alíquota congelada da origem é preservada; mudança de UG arrecadadora impede substituição silenciosa em outro ente.
- Consumos de créditos são preservados e o saldo de dedução é recomposto ao cancelar/substituir. Créditos repetidos, inscrição divergente, valores não finitos e dedução manual negativa são recusados.
- Prazo de cancelamento usa `nfseCancellationDays` no parâmetro vigente da competência e fica registrado no snapshot; fallback de sete dias é identificado como estimado. O fluxo não atribui validade legal automática a essa estimativa.
- DMS automática não admite retificação manual. Retificação manual conserva a edição anterior, valida identidade/competência/UG e gera novo documento; aceita as direções prestados/tomados da interface existente. Listagem de documentos fiscais e ações passaram a usar o escopo autorizado.
- Aprovação/liberação de avulsa usam débito/guia canônicos, locks, pagamento integral Decimal e emissão única. RPS convertido não pode ser cancelado isoladamente deixando a NFS-e ativa. Autorização de manutenção de RPS considera o prestador credenciado na UG.
- **Limites ainda abertos:** retroativas/complementares, conversão integral dos lotes RPS, modalidades fiscais, apuração completa da escrita, segregação durável dos legados auxiliares, canais oficiais e demais variantes de P5/P7/P9/P10. As proteções novas não certificam todos os itens da NFS-e.

### ITBI — GAP-08 / EXE-14.19 / contrato §7

- Novas declarações guardam tributo/UG/ente. Análise, transmissão, DAM e GED conferem o escopo. Aprovação reconhece o direito pela matriz canônica, sem transferir a titularidade nessa etapa.
- Seleção automática passa a `AUTO_ON_PAYMENT`. O valor legado `AUTO_ON_APPROVAL` é normalizado apenas em novas criações/análises, com indicação no evento da análise; não há alteração em massa das declarações existentes.
- Pagamento integral confirmado aciona somente a transmissão aprovada, preserva as frações dos coproprietários e registra posição fiscal temporal em `TaxRegistryEntry/FISCAL_OWNERSHIP`. Pagamento parcial não transfere o imóvel.
- Estorno de qualquer parcela que reduza o total recebido abaixo do débito recompõe a posição fiscal anterior por nova edição, inclusive quando a parcela estornada não foi a última que acionou a transferência. Histórico, partes, snapshots e eventos anteriores permanecem disponíveis.
- Transmissão posterior, alteração do titular principal fora da origem e datas incompatíveis impedem recomposição automática incorreta. O hook não impõe regras ITBI sobre pagamentos de outros tributos.
- **Limites ainda abertos:** retificação do transferido com novo processo/guia, editor manual completo de titularidades, declarações de múltiplos imóveis, demais modalidades/portal e regularização de transmissões legadas.

### Perfil municipal de dívida ativa — P2

- `DEBT_ACCOUNTING_PROFILE` tem edição aditiva por tributo/UG/ente, catálogo municipal publicado, vigência, fundamento, chave e vínculo de substituição. Confere direito original, direito DA e VPD de extinção em contas distintas e com naturezas adequadas.
- Interface do motor fiscal permite configurar a constituição ou a reclassificação DA. Reclassificação utiliza o perfil vigente e congela as contas e o ID da edição em `DEBT_ACCOUNTING_POSITION`; nova edição não reescreve posições já constituídas.
- A matriz operacional anterior continua disponível para origens configuradas por eventos. Legados não recebem reconhecimento retroativo implícito.
- **Limites ainda abertos:** homologação dos perfis reais, regularização histórica e tratamento integral de acréscimos/curto e longo prazo.

### Diárias — EXE-02/LEG-02.61–71 / P4

- `receiveCurrentYearTravelRefund` e `reverseCurrentYearTravelRefund` reaproveitam o motor de recomposição do corrente, com parcialidade, caixa, cotas, anulação/reforço do empenho, registros corretivos de liquidação/pagamento e documentos/partidas próprios. Identificam a origem como diária; não geram receita orçamentária no corrente.
- `receivePriorYearTravelRefund` registra receita nativa somente para pagamento de exercício anterior do mesmo ente/UG. Limite acumulado considera receitas anteriores e devoluções correntes vigentes. O estorno segue o motor financeiro e preserva o evento RH.
- Prestação comprova o pagamento original integral, exclui registros corretivos dessa comprovação e exige todas as restituições vigentes com referências únicas: `DESPESA:ID` ou IDs de receitas separados por vírgula. Conferência inclui valores Decimal, datas, exercício/ente, UG e caixa.
- Prestação ativa protege pagamento e devoluções contra estornos isolados. Regularização por responsável independente preserva o relatório anterior, seu payload e GED; permite correções e reapresentação com data posterior ou igual à reabertura. Anulação integral da execução regularizada atualiza a solicitação para `CANCELADA`.
- Interface contém recebimentos corrente/anterior, seus estornos, regularização, prestação e histórico documental PDF/CSV/XLSX. Histórico inclui referências, valores, status, documentos e posições preservadas.
- O motor compartilhado agora reconcilia também `BudgetAppropriation.committedValueDecimal` e o espelho Float após cada devolução/estorno. Ordens de locks das mutações da concessão foram alinhadas à solicitação antes de empenho/pagamento.
- **Limites ainda abertos:** autorização/assinatura de todos os participantes e prestação integral dos instrumentos previstos nos demais subcritérios; a nova restituição não conclui o checklist financeiro inteiro.

### Verificação preparada, não executada

- `tests/tax-document-integration.test.ts`: seis cenários por par de entes, cobrindo emissão/escritas/débito, avulsa, substituição/cancelamento, transferência ITBI parcial/integral, estorno de parcela anterior e perfil DA, com concorrência e falhas injetadas.
- `tests/travel-refunds.test.ts`: quatro cenários corrente/anterior × Executivo/Legislativo, com parcialidade, concorrência, rollback, saldo da dotação/caixa, regularização e conservação do histórico.
- `tests/municipal-travel-allowance.test.ts`: atualizado para exigir regularização da prestação antes do estorno do pagamento.
- Fixtures ampliadas para tabelas fiscais usadas pelos hooks; numeração autoincremental da nota preparada como sequência PostgreSQL.
- Nenhum desses cenários possui resultado aprovado registrado nesta continuação. Não foram executados lint, geração/validação Prisma, migrations ou build. Não houve commit/push nem alteração do banco municipal por essa implementação.
