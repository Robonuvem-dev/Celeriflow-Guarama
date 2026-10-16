# Planejamento e Orçamento — análise de cobertura e plano para a POC

Data da análise: **11/10/2026**. Escopo: **EXE-01 (Prefeitura) e LEG-01 (Câmara)**.

Diretriz atualizada do usuário: **entrega de 100% funcional**, com demonstração completa para ambos os entes; domínio de Planejamento no módulo novo; integrações e dependências externas na última etapa de implementação.

**Revisão atual após F0–F8 e início de F9:** [Diagnóstico atual e plano de execução S1–S9](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md), baseado no código `b965d82`. Contém confronto dos 99 itens, lacunas funcionais confirmadas e sequência de retomada. A conclusão/inventário P/N abaixo preservam o diagnóstico original anterior às entregas; não representam a quantidade atual de funcionalidades implementadas. O texto integral da seção 4 permanece como referência de escopo.

## 1. Conclusão e prioridade — diagnóstico original

**Prioridade recomendada: alta. Existe uma base reaproveitável no Financeiro, mas o módulo novo ainda não constitui uma jornada operacional própria e a cobertura integral do checklist não está comprovada.**

- `/planejamento` possui ativação, layout e permissão `PLANEJAMENTO`, mas apresenta links para as telas financeiras. As áreas anunciadas no painel são escopo de evolução.
- Financeiro já contém cadastro básico de PPA, programas, objetivos, indicadores, ações e metas anuais; LDO com prioridades e riscos; LOA com previsões/fixações; dotações vinculadas; CMD e MBA; histórico interno; workflow legal e créditos adicionais.
- Tributação fornece arrecadação integrada ao Financeiro e benefícios com valores de renúncia. São fontes de dados para planejamento, projeções e acompanhamento; ainda é necessário construir a ponte para renúncia **prevista e compensação orçamentária**.
- As maiores lacunas são: entidade/UG em toda a cadeia, receitas próprias de PPA/LDO, classificação completa, importações entre peças, consultas por data e versão, emendas legislativas com sanção parcial, compatibilização, cotas/contingenciamento, metas mensais por fonte, memórias STN e relatórios completos/publicação.
- **Não basta mover telas para o menu novo.** A implantação precisa completar modelos, regras, autorização, consultas e documentos mantendo as mesmas dotações e receitas canônicas.

### 1.1 Decisões de entrega

- **Meta obrigatória: EXE-01 99/99 e LEG-01 99/99.** Todos os subcritérios, telas, tabelas, formulários, operações, cálculos, relatórios e integrações precisam funcionar. Não há pacote reduzido nem aceitação de pendências na apresentação do sistema como pronto.
- Criar/completar **tabelas e relacionamentos, serviços, actions, consultas, telas e relatórios** sob responsabilidade do novo Planejamento e Orçamento. Reaproveitar os registros existentes por migração controlada, preservando IDs e histórico.
- Prefeitura: jornada em **`/planejamento`**. Câmara: criar **submódulo Planejamento e Orçamento**, item novo do menu/card da Câmara, com jornada **dentro de `/camara/planejamento`**, PPA, LDO, LOA e demais áreas legislativas, layout profissional ERP, domínio canônico compartilhado e recorte explícito da Câmara.
- Transferir as funcionalidades de planejamento hoje expostas em Financeiro/Tributação e retirar seus formulários/listagens/entradas duplicadas dos menus de origem após a troca de consumidores. Esses módulos passam a buscar os dados orçamentários em Planejamento pelos contratos internos.
- Desenvolver primeiro o funcionamento interno das duas jornadas. **Conectar integrações internas e externas em F9**, depois de tabelas, telas, cálculos e contratos prontos. Projetar contratos/FKs desde a fundação para permitir essa conexão sem reconstruir o domínio.
- APIs, documentos/layouts externos e acessos que precisem do usuário ficam no registro de pendências de F9. Solicitar somente quando chegar à etapa correspondente. Dependência pendente não conta como funcionalidade pronta.
- Preparar modelos e dados fictícios plausíveis com persistência e regras reais, inclusive vereadores, assessores, órgãos e fornecedores. Usar nomes completos e descrições municipais naturais. A base fictícia é identificada e isolada por configuração técnica; **não usar “demo”, “POC” ou “teste” nos cadastros, documentos e interface apresentados ao cliente**. Adaptadores simulados não substituem integração real no aceite final.
- Manter rigorosamente os padrões existentes de tabelas, formulários, componentes, paginação e feedback, nos dois caminhos de acesso.

### 1.2 Avaliação condicional de F11/F12 — Custos e Controle Interno

Pedido de 11/10/2026: analisar os checklists de Gestão e Controle de Custos e Gestão de Controle Interno antes de F9/F10; incluir e executar F11/F12 em Planejamento somente se aderentes, deixando os demais para outra frente.

**Decisão: aderência parcial por integração, sem incorporação dos dois domínios completos ao Planejamento.** EXE-04 tem 31 itens e sua apropriação nasce na liquidação/VPD, folha, almoxarifado e patrimônio: o checkup dos 28 módulos recomenda Custos no Financeiro e Contábil e indicadores em Administração/BI. EXE-03 tem 36 itens de auditoria/documentos/notificações/obrigações e consultas a vários módulos: localização em **Auditoria confirmada pelo usuário**. Tributação fornece dados para essas rotinas.

A análise individual dos **67 itens** está em [ANALISE_ADERENCIA_CUSTOS_CONTROLE_INTERNO.md](ANALISE_ADERENCIA_CUSTOS_CONTROLE_INTERNO.md). Após as novas orientações, **F11/F12 ficam planejadas nas áreas próprias antes de F9/F10**, conforme [PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md](PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md) e [CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md](CHECKUP_28_MODULOS_ADERENCIA_CUSTOS.md). EXE-01/LEG-01 continuam com 99 itens cada; EXE-03/EXE-04 mantêm avaliação própria. A publicação dos planos não inicia a implementação ou promove aceites.

## 2. Fontes e critério de avaliação

### 2.1 Fontes oficiais e referências de produto

1. Fonte direta da matriz: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`:
   - seção **10.37**, Planejamento e Orçamento Executivo: páginas do arquivo **1–13**, itens **1–99**;
   - seção **10.38**, Planejamento e Orçamento Legislativo: páginas do arquivo **256–267**, itens **1–99**.
2. Especificações complementares preservadas em `docs/Termo de Referencia/ESPECIFICAÇÕES FUNCIONAIS DOS MÓDULOS EXECUTIVO.pdf` e `DESCRITIVO MÓDULOS CÂMARA MUNICIPAL.pdf`. Os identificadores desta matriz usam a numeração local do checklist de demonstração; não misturar essa numeração com a numeração contínua das especificações.
3. Metodologia: `docs/CHECKLIST_POC_IBEMA_CODEX.md`, em especial regras de avaliação, EXE-01, LEG-01 e organização funcional.
4. Arquitetura atual: `docs/MODULOS_PLANEJAMENTO_SST.md`.
5. Referência visual de funcionalidades da POC: `docs/Analise_POC_do Megacity.md`, seção 3.1. O documento analisa 92 capturas de `telas POC.zip`, com menus de relatórios/importações PPA/LDO/LOA. Menus e capturas isoladas não comprovam processamento nem substituem os requisitos oficiais. Esta análise reutiliza o inventário documental das capturas; não é uma nova homologação daquele sistema.

Os dois blocos de Planejamento do checklist têm **o mesmo conteúdo funcional**, com diferenças de paginação/formatação. A seção 4 preserva a transcrição integral comum. O planejamento e o aceite por ente ficam separados em:

- **[Prefeitura — EXE-01](PLANEJAMENTO_ORCAMENTO_PREFEITURA.md):** 99 linhas individuais, acesso `/planejamento`, dados, fluxos e evidências do Executivo.
- **[Câmara — LEG-01](PLANEJAMENTO_ORCAMENTO_CAMARA.md):** 99 linhas individuais, acesso `/camara/planejamento`, dados, fluxos e evidências do Legislativo.

Cada linha dos documentos separados referencia o texto integral de mesmo número na seção 4 deste plano. Saúde, educação e outros demonstrativos também aparecem no bloco Legislativo: implementar a apresentação aplicável ao ente com memória de cálculo, sem retirar itens do escopo.

### 2.2 Denominadores e estados

| Avaliação | Total oficial | PPA | LDO | LOA | Meta funcional |
|---|---:|---:|---:|---:|---:|
| EXE-01 | 99 | 32 | 22 | 45 | 99/99 — 100% |
| LEG-01 | 99 | 32 | 22 | 45 | 99/99 — 100% |

**Critério de conclusão: 99 itens integralmente funcionais e demonstrados em cada ente.** Um item parcial, integração pendente ou relatório incompleto impede declarar 100%. O acompanhamento é independente: entrega do Executivo não conclui a do Legislativo e vice-versa.

As regras contratuais originais de avaliação estão preservadas em `CHECKLIST_POC_IBEMA_CODEX.md`. A diretriz deste desenvolvimento é mais exigente: **100% antes da apresentação final ao cliente como sistema pronto**, sem usar tolerância contratual para reduzir a entrega.

Legenda da matriz:

- **P — parcial:** foi encontrada implementação relacionada, mas faltam partes explícitas do requisito ou prova completa da jornada.
- **N — não evidenciado:** não foi localizada rotina específica suficiente no recorte auditado. Pode haver infraestrutura reutilizável; não significa que todo componente precise nascer do zero.
- **A — atende tecnicamente:** reservado para fluxo completo comprovado, com todos os campos, filtros, efeitos e saídas exigidos.
- **H — homologado:** exige registro de demonstração e aceite por ente; não é inferido por código ou teste.

**Nenhum item foi classificado A/H nesta análise.** Numerador de atendimento integral comprovado: **0/99 para EXE-01 e 0/99 para LEG-01**, ou 0% de comprovação integral nesta matriz. Isso não mede quantidade de código pronta nem afirma inexistência das bases abaixo. Parcial não entra no numerador funcional. Homologação da POC: **pendente nos dois entes**.

| Resultado do diagnóstico | EXE-01 | LEG-01 |
|---|---:|---:|
| Parcial (P) | 49 | 49 |
| Não evidenciado (N) | 50 | 50 |
| Atendimento integral comprovado (A/H) | 0 | 0 |
| Total de itens examinados | 99 | 99 |

Os 49 parciais indicam base relacionada, não 49 requisitos atendidos. A conferência documental verificou sequência 1–99 sem omissões ou duplicidades.

## 3. Inventário auditado e reaproveitamento

Os códigos E abaixo são referências de evidência utilizadas item a item na matriz.

| Evidência | Arquivos/modelos e achados | Reaproveitamento e limite |
|---|---|---|
| E1 — módulo novo | `src/app/app-domain/planejamento/page.tsx:7–27`, `layout.tsx`; migração `20261010140000_add_planning_sst_modules`; `tests/planning-sst-modules.test.ts` | Painel usa `getTenantContextForModule("PLANEJAMENTO")`; links dependem de ativação/acesso FINANCEIRO. Testes verificam acesso/ativação, não requisitos orçamentários. |
| E2 — PPA | `src/lib/financeiro/planejamento.ts:248–415`; `MultiYearPlan`, `ProgramPPA`, `ObjectivePPA`, `IndicatorPPA`, `ActionPPA`, `GoalPPA`, `prisma/schema.prisma:3430–3542` | Cadastro e metas financeiras Decimal/ano. Programa só tem código/nome/tipo; faltam origem, diretrizes, público, financiamento e gerente. Metas não têm realizado/produto/destinação. PPA não tem configuração de grau nem receitas próprias. |
| E3 — LDO/LOA | `planejamento.ts:419–558`; `BudgetGuideline`, prioridades/riscos, `AnnualBudgetLaw`, previsões/fixações, schema `3544–3657` | Cadeia PPA→LDO→LOA e equilíbrio da LOA. Previsão/fixação tem código, nome e valor; não representa classificação completa por fonte/entidade. Prioridade/risco não equivale à memória de cálculo STN. |
| E4 — UI/actions | `src/app/app-domain/financeiro/orcamento/planejamento/{page.tsx,PlanejamentoClient.tsx}`; `planejamento-actions.ts` | Seções PPA, LDO/LOA, dotações, CMD/MBA e histórico. Actions validam Zod e retornam `{ error?, data? }`; todas autorizam FINANCEIRO. Página carrega árvore integral sem paginação e sem filtro de entidade/UG no PPA, LDO, LOA, snapshots ou CMD; filtro de UG está na lista de opções. Não confundir opções filtradas com proteção dos registros. |
| E5 — workflow/snapshots | `planejamento.ts:134–224,560–648`; `PlanningAmendment`; UI histórico `PlanejamentoClient.tsx:261–274` | Snapshot original/proposto com versão incremental e lock. **Não aplica os valores ao instrumento nem possui vereador, itens, bloqueio ou sanção parcial.** Workflow da peça exige atores distintos, GED final e referência de publicação; action de transição não tem consumidor de UI localizado na busca em `src`. Publicação registrada não equivale à publicação no portal. |
| E6 — dotações/cadastros | `planejamento.ts:650–744`; `BudgetAppropriation`, `BudgetUnit`, `ResourceSource`, `RevenueNature`, `ExpenseNature`; `/financeiro/orcamento/cadastros` | Mesmas dotações canônicas; valida PPA/programa/ação/LOA, UG e limite da fixação sob lock. Fontes/naturezas possuem código/nome, sem tabela TCE/STN versionada ou rateio percentual da receita. Código da dotação é informado pelo usuário e globalmente único. |
| E7 — programação | `planejamento.ts:226–243,746–802,1125–1198`; `MonthlyDisbursementSchedule`, `BimonthlyRevenueTarget`; `src/lib/financeiro/index.ts:229–298` | CMD por LOA/mês/UG e MBA por LOA/bimestre. Faltam fonte e entidade; MBA não é meta mensal por modalidade. CMD restringe reserva/empenho, não mede pagamento. Dotações antigas sem fixação LOA não passam pelo controle CMD. Relatório de acompanhamento existe no serviço, sem consumidor localizado em `src`. |
| E8 — créditos/execução | `planejamento.ts:806–1064`; `CreditRequest`/itens; `src/lib/financeiro/index.ts:477–527`; `/financeiro/orcamento`, `CreditRequestDialog.tsx` | Várias dotações, tipos de créditos, ato/GED/fonte, segregação, publicação, efetivação transacional/idempotente e movimentos de saldo. **Movimento orçamentário não gera partidas contábeis nesse serviço.** Não há reserva das anulações na criação da prévia. Crédito adicional não equivale à emenda legislativa. |
| E9 — relatórios | `src/lib/financeiro/{report-definition.ts,report-delivery.ts,report-export.ts,report-print.ts,report-access.ts,relatorios-legais.ts}`; `/api/financeiro/relatorios/print`; `tests/{public-finance.test.ts,finance-report-definition.test.ts}` | PPA/LDO/LOA/CMD/MBA e anexos internos, infraestrutura PDF/CSV/snapshots. Saídas de planejamento são `INTERNAL_PARTIAL`/`NOT_STATUTORY`. RREO/RGF/balanços são bases, não prova dos demonstrativos projetados nem de todos os anexos 4.320/64. Teste que reconhece `LOA_ANEXO_PROGRAMACAO` não testa cálculo/jornada. |
| E10 — Tributação | `src/lib/tributacao/index.ts:70–90,168–232`; `s8-engine.ts`, `s8-service.ts:687`; `/tributacao/cobranca/relatorios/beneficios/route.ts` | Mapeia tributo→natureza/fonte/conta e confirma pagamento com evento idempotente `TRIBUTARIO:TAX_PAYMENT:${payment.id}:REVENUE`. Benefícios têm crédito/redução/renúncia Decimal e relatório imprimível. Falta previsão plurianual, compensação e vínculo com peça/versionamento. Não somar novamente TaxPayment e Revenue no realizado. |
| E11 — entidades/audiências/atos | `GovernmentEntity`, `LegalText`, `LegalTextVersion`, schema `743–807`; `CamAudiencia`, schema `11786–11804`; GED/processos transversais | Entidade canônica já existe e deve ser reutilizada. PPA/LDO/LOA e BudgetUnit não têm vínculo direto de entidade no schema examinado. Audiência da Câmara tem tema/data/local/ata/documentos, mas não solicitações comunitárias estruturadas com bairro/contato/órgão/status nem vínculo de planejamento comprovado. |

### 3.1 Problemas específicos a resolver antes de aproveitar os cálculos

1. `generateBudgetChangesComparison` (`planejamento.ts:1070–1119`) calcula `totalAtualizado = totalExpense + soma(totalValue dos créditos)`. `totalValue` contém acréscimos, **sem deduzir anulações**. Remanejamento de R$ 100 com anulação de R$ 100 pode inflar o total em R$ 100. Recalcular pelo efeito líquido dos movimentos efetivados, mantendo o original e separando reforço de redistribuição.
2. Essa função usa `findFirst` para a LOA do exercício e não recebe entidade/data/versão. Com mais de uma peça, o resultado pode selecionar base inadequada. Sua rota de impressão precisa ser auditada junto com o serviço na implementação.
3. `generateCmdMbaExecutionReport` agrega empenhos por mês/UG e receitas por bimestre, converte Decimal em Number e usa a data atual como fallback de `collectionDate`. Não usar esse fallback em relatório oficial nem tratar empenhado como desembolso pago. Definir estágios, estornos, período civil e arredondamento.
4. Workflow de peça tem transação, mas leitura/transição não usa lock/CAS como o crédito. Adição de itens e sanção precisam serialização comum para impedir alteração concorrente após fechamento.
5. `assertPlanningEditable` bloqueia SANCTIONED/PUBLISHED; programação também usa esse bloqueio. É necessário separar revisão legal do instrumento de revisão autorizada da programação durante a execução.
6. Códigos globalmente únicos (`MultiYearPlan.code`, `BudgetAppropriation.code`, `CreditRequest.number`) precisam política por entidade/exercício/peça, com migração e compatibilidade planejadas.

## 4. Matriz integral requisito → situação → desenvolvimento

Texto do checklist com quebras de linha normalizadas. Cada linha equivale a **EXE-01.n e LEG-01.n**; as colunas E/L mantêm o estado de cada avaliação. A referência `pE/pL` é a página do arquivo do checklist. Nos itens que atravessam páginas, consta o intervalo. PPA: 1–32; LDO: 33–54; LOA: 55–99.

Fases F0–F10 são detalhadas na seção 5. As fases indicadas nas linhas correspondem ao desenvolvimento interno; **conexões entre módulos, publicação e dependências externas passam por F9, e todos os itens passam pelo aceite separado F10**. A coluna final identifica a base encontrada e o complemento necessário; o aceite exige executar **todo o texto do requisito**, inclusive campos, filtros e relatórios agrupados dentro de um único item.

| Item (EXE-01.n / LEG-01.n) | pE / pL | Requisito oficial | E | L | Evidência, lacuna e fase |
|---|---|---|:---:|:---:|---|
| 1 | 1 / 256 | Possibilitar o registro da realização das audiências públicas com campo para todas as solicitações feitas pela comunidade, bairro a ser atendido, com informações de contato do solicitante, órgão responsável por sua análise e status da mesma. | N | N | E11: audiência genérica não cobre demandas. Cadastro/vínculo com peça, solicitações e análise, F2. |
| 2 | 2 / 256 | Permitir anexar documentos no cadastro da audiência pública e permitir a baixa dos arquivos anexados. | P | P | E11/GED: completar vínculo e upload/download autorizado em Planejamento, F2. |
| 3 | 2 / 256 | No cadastro do PPA, permitir escolher o grau do plano de contas no PPA a ser utilizado para a informação das receitas e o nível do orçamento a ser utilizado para as despesas, tendo como opções orçar a despesa por elemento/fonte de recursos ou só fonte de recursos. | P | P | E2: PPA básico; criar parâmetros e aplicar validação/consulta/impressão, F1. |
| 4 | 2 / 256 | Cadastrar vínculos para o PPA de acordo com tabela definida pelo Tribunal de Contas do Estado. | P | P | E6: fonte básica; tabela TCE-PR vigente e vínculos por peça, F1. |
| 5 | 2 / 256 | Importar vínculos utilizados na LOA a cada novo PPA elaborado. | N | N | Importação seletiva com origem/mapeamento e prévia, F3. |
| 6 | 2 / 256 | Cadastrar programas de governo com no mínimo, as informações de: origem, objetivo, diretrizes, público alvo, fonte de financiamento e gerente responsável; permitir incluir para cada programa os seus objetivos e indicadores. | P | P | E2/E4: objetivos/indicadores existem; completar campos e manutenção, F2. |
| 7 | 2 / 256 | Importar as ações e programas da LOA para cada novo PPA elaborado, evitando a redigitação de dados. Após a importação, permitir realizar as alterações necessárias. | N | N | Cópia mapeada editável sem alterar origem, F3. |
| 8 | 2 / 256–257 | Criar automaticamente códigos reduzidos para despesa do PPA composto de órgão, unidade, função, subfunção, programa e ação com o objetivo de facilitar a execução orçamentária. | N | N | E6: código manual; classificação/código reduzido automático e unicidade, F1. |
| 9 | 2 / 257 | Importar as receitas e despesas de PPA anterior e da LOA. | N | N | Criar previsões PPA e importar fontes/valores, F2/F3. |
| 10 | 2 / 257 | Na importação da despesa do PPA, da LOA ou de PPA anterior, permitir importar só as dotações, as dotações e valores, e ainda determinadas dotações conforme escolha do usuário. | N | N | Modos estrutura/estrutura+valor e seleção individual, F3. |
| 11 | 2 / 257 | Cadastrar programação da receita identificando cada fonte de recurso. | N | N | E3 só possui previsão LOA genérica; programação plurianual por natureza/fonte/ente, F2. |
| 12 | 3 / 257 | Informar receitas do PPA por meio de rateio automático para cada conta de receita e suas respectivas fontes de recursos. | N | N | Rateio Decimal sobre configuração de fontes e tratamento do resíduo, F2. |
| 13 | 3 / 257 | Efetuar projeção de cálculo para obter a previsão do total a ser arrecadado e do total a ser gasto para cada ano do PPA. | N | N | E10 histórico reutilizável; cenários com premissas/memória, F2. |
| 14 | 3 / 257 | Incluir alterações orçamentárias para a receita do PPA, bem como, consultar todas as alterações incluídas e de uma receita individualmente. | N | N | Eventos de previsão de receita, histórico por conta/data, F4. |
| 15 | 3 / 257 | Consultar orçamento da receita e da Despesa do PPA com valor orçado atualizado até a data selecionada. A consulta deve permitir selecionar uma ou mais entidades. | P | P | E2/E4 mostram base atual; criar receita, corte temporal e seleção de entes, F2/F4/F8. |
| 16 | 3 / 257 | Informar metas físicas e financeiras da despesa do PPA, indicando a destinação de recursos, distribuindo as metas para cada exercício do PPA e atualizando essas metas durante a execução orçamentária. | P | P | E2: meta anual; completar destinação, realizado e revisão durante execução, F2/F4. |
| 17 | 3 / 257 | Cadastrar previsão das transferências financeiras identificando a entidade a que se destinam. Permitir a informação para cada ano do PPA. | N | N | Previsão distinta da transferência de tesouraria, origem/destino/ano, F2. |
| 18 | 3 / 257–258 | Permitir consultar as alterações orçamentárias do PPA, por entidade e consolidado, possibilitando informar até qual data se pretende consultar, permitindo assim a consulta por ordem cronológica. | P | P | E5: snapshots internos; eventos efetivos e consulta temporal consolidada, F4/F8. |
| 19 | 3 / 258 | Consolidar duas ou mais entidades na previsão de receita, despesa, transferência financeira e alteração orçamentária. | N | N | E11: entidade canônica; consolidar com regras para transferências internas, F0/F4/F8. |
| 20 | 3 / 258 | Confrontar receitas e despesas do PPA por fonte e destinação de recursos, consolidando uma ou mais entidades e trazendo os valores orçados atualizados até uma data. | N | N | Dataset de confronto por fonte, ente e corte, F4/F8. |
| 21 | 3–4 / 258 | Permitir o cadastro de emendas ao PPA. O cadastro deve ter os campos: data, objetivo, justificativa, nome do vereador responsável pela emenda e o texto jurídico. No cadastro deve ser possível informar as dotações que sofreram acréscimo ou redução. | P | P | E5 não é emenda legislativa; modelar cabeçalho/autor/itens e efeitos, F5. |
| 22 | 4 / 258 | Permitir realizar bloqueio das dotações que não podem possuir emendas; ao serem bloqueadas as mesmas não estarão disponíveis no sistema para sofrer emendas. | N | N | Elegibilidade específica de emenda, UI e servidor, F5. |
| 23 | 4 / 258 | Permitir sancionar as emendas do orçamento. No sancionamento deve ser possível a aprovação total das emendas, a reprovação total ou o sancionamento parcial; no sancionamento parcial, deve ser possível informar quais dotações foram sancionadas. | N | N | E5 workflow da peça não decide itens; decisão total/parcial por dotação, F5. |
| 24 | 4 / 258 | Emitir relatórios gerenciais de receitas, despesas por fonte de recursos e das transferências financeiras; os relatórios devem possibilitar a emissão consolidada ou selecionando uma ou mais entidades. | P | P | E9 fornece motor; criar dados PPA/transferência e filtros completos, F8. |
| 25 | 4 / 258 | Permitir compatibilizar as despesas do PPA, replicando automaticamente para a LDO e LOA as alterações orçamentárias feitas no PPA. | N | N | Relação existente não replica alterações; prévia/propagação idempotente, F4. |
| 26 | 4 / 258 | Possuir consulta das metas físicas e realizas para cada ano do PPA. A emissão deve ser possível consolidando uma ou mais entidades e deve filtrar por ação e produto. | P | P | E2 metas previstas; realizado, produto e filtros/saída, F2/F8. |
| 27 | 5 / 259 | Emitir os relatórios consolidando uma ou mais entidades e trazendo a posição atualizada do orçamento até a data selecionada: Demonstrativo das Receitas; Demonstrativo das Despesas; Meta Financeira por Órgão e Unidade; Meta Física por Programa e Ação; Programas; Programas Detalhados; Anexo PPA Analítico; Anexo PPA Sintético; Detalhamento Órgão/Unidade Físico/Financeiro; Receita por Ano e Receita Global. | P | P | E9 anexo interno; implementar **todas as dez famílias listadas** e data/entes, F8. |
| 28 | 5 / 259 | Emitir relatório de compatibilização entre receitas e despesas do PPA/LDO/LOA com posição atualizada até a data selecionada e relatório de compatibilização das metas de despesas entre PPA/LDO/LOA com posição atualizada até a data selecionada. | N | N | Dois demonstrativos de divergência/compatibilidade com corte comum, F4/F8. |
| 29 | 5 / 259 | Emitir relatório possibilitando a avaliação dos resultados dos programas (Art. 4º, inciso I, “e” da LRF). O relatório deverá conter a programação e execução física e financeira por programa e ação, permitindo selecionar os quatro anos do PPA ou apenas um ano desejado. | P | P | E2/E9 só previstas; execução física/financeira e avaliação anual/quadrienal, F2/F8. |
| 30 | 5 / 259 | Gerenciar versão para o PPA com controle de todas as consultas e emissão de relatórios por versão. | P | P | E5 snapshot não controla todas as consultas/relatórios; versões efetivas, F4/F8. |
| 31 | 5 / 259 | Emitir demonstrativos de aplicação em saúde, pessoal e educação com os respectivos percentuais de aplicação e emitir o demonstrativo da Receita Corrente Líquida. | P | P | E9 RREO/RGF são base; quatro demonstrativos e memória das bases, F8. |
| 32 | 6 / 260 | Emitir relatório da receita do PPA, consolidado e por entidade, permitir a escolha do grau da receita e possibilitar a emissão da receita orçada e atualizada. | N | N | Receita PPA/classificação, grau e corte/entes, F1/F2/F8. |
| 33 | 6 / 260 | Cadastrar LDO escolhendo o grau do plano de contas de receita e despesa a ser utilizado, permitindo informar no cadastro o projeto de lei e texto jurídico que aprovou a LDO. | P | P | E3/E5: LDO e ato final; graus, projeto/texto e UI, F1/F2. |
| 34 | 6 / 260 | Cadastrar vínculos para a LDO de acordo com tabela definida pelo TCE do Estado. | P | P | E6 fontes; tabela vigente/vínculos LDO, F1. |
| 35 | 6 / 260 | Incluir alterações orçamentárias para a receita da LDO, bem como a consulta de todas as alterações incluídas e de uma receita específica. Na alteração deve permitir informar a entidade, a conta de receita, a justificativa e o texto jurídico. | N | N | Previsão e eventos LDO com dados legais e histórico, F2/F4. |
| 36 | 6 / 260 | Consultar orçamento da receita e da despesa da LDO com valor orçado atualizado até a data selecionada; a consulta deve possibilitar a seleção de uma ou mais entidades. | P | P | E3/E4: diretrizes não são orçamento detalhado; previsões/corte/entes, F2/F4/F8. |
| 37 | 6 / 260 | Cadastrar programas e ações na LDO e permitir importar os dados de outro PPA, LDO ou LOA. | P | P | E3 vínculo ao PPA; programa/ação anual e importação editável, F2/F3. |
| 38 | 6 / 260 | Importar previsão da despesa do PPA, da LOA ou de LDO anterior. A importação deve permitir importar só as dotações e dotações e valores. | N | N | Modos de importação das três origens, F3. |
| 39 | 6 / 260 | Importar para a LDO a previsão da receita do PPA, da LOA ou de LDO anterior. | N | N | Previsões LDO e importação mapeada, F2/F3. |
| 40 | 6 / 260 | Permitir atualizar as metas físicas da LDO e inserir as metas físicas realizadas. As metas realizadas informadas na LDO devem atualizar automaticamente as metas do PPA. | N | N | Realização anual e propagação sem duplicar contagem, F2/F4. |
| 41 | 6 / 260 | Consolidar duas ou mais entidades nas rotinas de previsão de receita, despesa, transferência financeira e alteração orçamentária da despesa. | N | N | Consolidação LDO autorizada, F0/F4/F8. |
| 42 | 7 / 261 | Permitir consultar as alterações orçamentárias da LDO, por entidade e consolidado, possibilitando informar até qual data se pretende consultar, permitindo assim a consulta por ordem cronológica. | P | P | E5 histórico interno; eventos efetivos, data e entes, F4/F8. |
| 43 | 7 / 261 | Permitir o cadastro de emendas na LDO. O cadastro deve ter os campos: data, objetivo, justificativa, nome do vereador responsável pela emenda e o texto jurídico. No cadastro deve ser possível informar as dotações que sofreram acréscimo ou redução. | P | P | E5: construir emenda LDO estruturada, F5. |
| 44 | 7 / 261 | Permitir realizar bloqueio das dotações que não podem possuir emendas; ao serem bloqueadas as mesmas não estarão disponíveis no sistema para sofrer emendas. | N | N | Bloqueio específico na LDO, F5. |
| 45 | 7 / 261 | Permitir sancionar as emendas do orçamento. No sancionamento deve ser possível a aprovação total das emendas, a reprovação total ou o sancionamento parcial. No sancionamento parcial, deve ser possível informar quais dotações foram sancionadas. | N | N | Decisão por item LDO e efetivação auditada, F5. |
| 46 | 7 / 261 | Confrontar receitas e despesas da LDO por fonte e destinação de recursos, consolidando uma ou mais entidades e trazendo valor orçado atualizado até a data selecionada. | N | N | Confronto LDO por fonte/corte/entes, F4/F8. |
| 47 | 7 / 261 | Emitir os relatórios gerenciais consolidando uma ou mais entidades e com valor orçado atualizado até a data selecionada: Demonstrativo das Receitas; Demonstrativo das Despesas e Programas de Trabalho. | P | P | E9 infraestrutura; ambos demonstrativos com orçamento LDO completo, F8. |
| 48 | 7 / 261 | Emitir cadastro das obras que serão executadas no ano da LDO informando a entidade responsável pela obra, a descrição, a data de início, o valor previsto, o valor de gastos com conservação, o valor em novos projetos e o valor do ano da LDO. | N | N | Programação de investimento/conservação anual; referenciar obra canônica quando existente, F2. |
| 49 | 8 / 262 | Emitir relatório Demonstrativo de Obras e Conservação do Patrimônio. | N | N | Dataset da programação LDO de obras/conservação, F8. |
| 50 | 8 / 262 | Gerenciar versão para a LDO com controle de todas as consultas e relatórios por versão. | P | P | E5 snapshots; versões legais consultáveis/relatáveis, F4/F8. |
| 51 | 8 / 262 | Emitir, sobre os valores orçados, Demonstrativo das Receitas e Despesas com Manutenção e Desenvolvimento do Ensino – MDE, Demonstrativo das Receitas de Impostos e das Despesas Próprias com Saúde e Demonstrativo da Despesa com Pessoal. | P | P | E9: projetar os três sobre orçamento LDO, não substituir por executado, F8. |
| 52 | 8 / 262 | Cadastrar memórias de cálculo conforme dispõem a portaria da STN – Secretaria do Tesouro Nacional. | N | N | Premissas/fontes/fórmulas e referência normativa por exercício, F2. |
| 53 | 8 / 262 | Emitir relatórios de memória de cálculo conforme disposto pela STN – Secretaria do Tesouro Nacional. | N | N | Saída reproduzível da memória e layout vigente, F8. |
| 54 | 8 / 262 | Possuir relatório de programas e ações, podendo emitir o relatório por entidade e filtrando por programa, ação e demais campos da dotação orçamentária. Permitir a emissão por entidade e consolidado. | P | P | E2/E9: completar dimensões LDO/filtros/entes, F8. |
| 55 | 8 / 262 | Cadastrar a Lei orçamentária anual, permitindo informar os dados do Projeto de lei e da Lei que a aprovou. No cadastro deve ser possível incluir anexos. | P | P | E3/E5: lei e GED final; projeto, texto e múltiplos anexos na UI, F2. |
| 56 | 8 / 262 | Cadastrar as fontes de recurso da LOA de acordo com tabela definida pelo TC do Estado. Permitir relacionar no cadastro das fontes qual o grupo, especificação e detalhamento da STN. | P | P | E6: fonte código/nome; TCE/STN e vigências, F1. |
| 57 | 8 / 262 | Possuir cadastro único de plano de contas para todas as entidades. | P | P | E6 cadastros compartilhados; explicitar árvore única/grau/vigência e uso multiente, F1. |
| 58 | 8 / 262 | O cadastro do plano de contas da receita deve permitir a inclusão das fontes de recurso, sendo possível informar uma ou mais fontes desde que a soma dos percentuais não ultrapasse 100%. | N | N | Relação natureza-fontes e percentuais validada no servidor, F1. |
| 59 | 9 / 263 | Cadastrar programação da receita e da despesa identificando cada fonte e destinação de recurso. | P | P | E3/E6 despesa tem fonte na dotação; receita genérica e programação sem destinação, F2/F6. |
| 60 | 9 / 263 | Importar receitas e despesas da LOA anterior e da LDO. Na importação da despesa permitir importar o valor realizado no ano anterior. | N | N | Importar estrutura/previsão/realizado com estágio e origem explícitos, F3. |
| 61 | 9 / 263 | Informar receitas da LOA por meio de rateio automático para cada conta de receita e suas respectivas fontes de recursos. O valor informado deve ser rateado automaticamente nos percentuais informado para cada fonte. | N | N | E10 mapeamento de uma fonte não é rateio; distribuir previsão LOA, F1/F2. |
| 62 | 9 / 263 | Incluir atualização de receitas mantendo o histórico das inclusões. O cadastro das atualizações deve possuir a entidade, tipo da atualização, data, valor, histórico e o texto jurídico. | N | N | Histórico efetivo de previsão LOA com todos os campos, F4. |
| 63 | 9 / 263 | Possibilitar a inclusão de novas naturezas de receita que não estavam previstas na LOA aprovada. | P | P | E6 cria natureza; falta inclusão formal na previsão aprovada por ato/revisão, F4. |
| 64 | 9 / 263 | Efetuar lançamentos contábeis de alteração orçamentária de receita automaticamente na contabilidade; os lançamentos devem ser feitos no momento da finalização da alteração. | N | N | E10 arrecadação não é alteração de previsão; evento contábil atômico e idempotente, F4/F7. |
| 65 | 9 / 263 | Consultar orçamento de receita e despesa da LOA com valor orçado atualizado até a data selecionada, consolidando uma ou mais entidades. | P | P | E3/E8/E9: corrigir comparação e construir corte/entes/receita atualizada, F4/F8. |
| 66 | 9 / 263 | Cadastrar as despesas que compõem o orçamento, com identificação do elemento de despesa, destinação de recursos e valores. O cadastro deve ser feito por entidade, permitindo consultar o total da entidade e consolidado. | P | P | E6 dotação com natureza/fonte/UG; classificar elemento/destinação e entidade/totais, F1/F2/F8. |
| 67 | 9 / 263 | Permitir o cadastro de emendas na LOA. O cadastro deve ter os campos: data, objetivo, justificativa, nome do vereador responsável pela emenda e o texto jurídico. No cadastro deve ser possível informar as dotações que sofreram acréscimo ou redução. | P | P | E5 snapshots e E8 créditos não cumprem emenda; cabeçalho/itens LOA, F5. |
| 68 | 10 / 264 | Permitir realizar bloqueio das dotações que não podem possuir emendas; ao serem bloqueadas as mesmas não estarão disponíveis no sistema para sofrer emendas. | N | N | Bloqueio de elegibilidade LOA, F5. |
| 69 | 10 / 264 | Permitir sancionar as emendas do orçamento. No sancionamento deve ser possível a aprovação total das emendas, reprovação total ou o sancionamento parcial. No sancionamento parcial, deve ser possível informar quais dotações foram sancionadas. | N | N | Decisão por item LOA e reflexo só dos sancionados, F5. |
| 70 | 10 / 264 | Permitir nas alterações orçamentárias adicionar diversas dotações e subtrair de diversas fontes para uma mesma Lei ou decreto. | P | P | E8 vários itens existem; comprovar múltiplas fontes, origem dos recursos e regra legal, F7. |
| 71 | 10 / 264 | Acompanhar histórico das alterações orçamentárias da despesa por ordem cronológica. | P | P | E8 movimentos/auditoria; consulta paginada cronológica e ligação ao ato, F4/F7/F8. |
| 72 | 10 / 264 | Consolidar duas ou mais entidades na previsão de receita, despesa, transferência financeira e alteração orçamentária. | N | N | Consolidação LOA com seleção autorizada/transferências, F0/F4/F8. |
| 73 | 10 / 264 | Disponibilizar no início do exercício, o orçamento aprovado para a execução orçamentária. | P | P | E6 dotação é criada no rascunho; implantação/abertura por ente vinculada à aprovação, F7. |
| 74 | 10 / 264 | Cadastrar cronograma mensal de desembolso por entidade. A informação deve ser feita até o nível de fonte de recursos. | P | P | E7 CMD por UG; completar fonte/ente e revisão, F6. |
| 75 | 10 / 264 | Cadastrar valor mensal das metas de arrecadação por entidade, informando os valores mês a mês por modalidade e fonte de recursos. | P | P | E7 MBA bimestral; criar metas mensais por modalidade/fonte/ente, F6. |
| 76 | 10 / 264 | Permitir que o usuário gerencie os códigos reduzidos para as contas de receita orçamentária e consignação; no caso dos códigos reduzidos da despesa, permitir reordená-los antes do início da execução orçamentária. | N | N | Sequência/gestão de códigos reduzidos e trava após execução, F1/F7. |
| 77 | 10–11 / 264–265 | Possuir rotina para incluir previa da alteração orçamentária da despesa. Na rotina devem ser informados os dados: entidade, tipo (suplementar, especial, etc), origem dos recursos e o valor. Deve ser possível incluir vários lotes de alteração e ao final realizar a impressão do decreto e projeto de lei, conforme o caso. Ao ser aprovada a previa, deve possibilitar a efetivação, gerando automaticamente a alteração orçamentária, bem como os lançamentos contábeis sem necessidade de redigitação dos dados. | P | P | E8 rascunho e efetivação de saldo; origem/lotes/minutas/partidas e jornada UI, F7. |
| 78 | 11 / 265 | A previa da alteração deve bloquear o valor na dotação a ser anulada, desbloqueando automaticamente ao efetivar os lançamentos de suplementação e anulação, quando da efetivação da alteração. | N | N | Reserva específica desde a prévia; liberar em efetivação/cancelamento, F7. |
| 79 | 11 / 265 | Possuir rotina de consistência de dados para o PPA, LDO e LOA que identifique possíveis inconsistências na elaboração dos mesmos. Deve ser possível executar as consistências por peça orçamentária. | P | P | E2/E3/E6 validam gravação; criar execução por peça com relatório de críticas, F4. |
| 80 | 11 / 265 | Possuir cronograma de desembolso por fonte de recursos e por mês com geração de relatório. O cronograma deve ser incluído por entidade, possibilitando a consulta dos valores por entidade e consolidado. | P | P | E7/E9 CMD interno; completar fonte/ente/consolidação e saída, F6/F8. |
| 81 | 11 / 265 | Cadastrar metas de arrecadação por fonte de recursos e por mês com geração de relatório. O cadastro das metas deve ser incluído por entidade, possibilitando a consulta dos valores por entidade e consolidado. | P | P | E7/E9: mensal/fonte/ente e relatório, F6/F8. |
| 82 | 11 / 265 | Possibilitar a impressão dos decretos para suplementação. | N | N | E8 guarda GED de ato, não emite decreto; template vinculado aos itens reais, F7/F8. |
| 83 | 11 / 265 | Implantar orçamento bloqueando a inclusão, exclusão ou alteração de previsões de receita e despesa. Na implantação do orçamento, as dotações orçamentárias devem ficar disponíveis para utilização por outros módulos, como por exemplo, o de licitações e contratos para que se possa dar andamento as licitações do ano seguinte. | P | P | E5/E6 bloqueio pós-sanção e integração parcial; estado implantado/ano futuro/consumidores, F7. |
| 84 | 11 / 265 | Permitir na implantação do orçamento, a cópia automática de todos os relacionamentos e configurações existentes na base, para que não seja necessário redigitar os dados no novo ano. | N | N | Virada controlada com prévia de relações copiadas/incompatíveis, F3/F7. |
| 85 | 12 / 266 | Emitir relatórios da Lei 4320/64 com opção de publicação simultânea no portal da transparência. | P | P | E9 infraestrutura de relatório/snapshot; catálogo completo e publicação integrada, F8. |
| 86 | 12 / 266 | Controlar cotas de despesa por entidade. | P | P | E7 limite mensal UG não é motor de cotas completo; entidade e consumo, F6. |
| 87 | 12 / 266 | Configurar o controle das cotas de despesa para os períodos: bimestral, trimestral e semestral. | N | N | Configuração dos três períodos sobre calendário mensal, F6. |
| 88 | 12 / 266 | Permitir que nas alterações orçamentárias as cotas sejam atualizadas automaticamente. | N | N | Reflexo transacional e política de distribuição por períodos abertos, F6/F7. |
| 89 | 12 / 266 | Emitir relatório de acompanhamento das cotas de despesa demonstrando valor previsto e valor realizado. | P | P | E7 serviço compara limite/empenhado; definir realizado, fonte/ente, estornos e UI, F6/F8. |
| 90 | 12 / 266 | Calcular os valores das cotas com base nos valores: Realizados no ano anterior, onde o sistema calcula os valores mês a mês com base no executado no ano anterior; Realizados nos últimos três anos, onde o sistema calcula os valores mês a mês com base no executado nos últimos três anos e Dividindo o valor orçado por 12 meses. | N | N | Três métodos: ano anterior, últimos três anos e divisão por 12; memória/resíduo, F6. |
| 91 | 12 / 266 | Possuir rotina para que o usuário possa definir qual percentual deseja informar para cada mês do ano e o sistema divide o valor orçado para cada mês de acordo com o percentual informado. | N | N | Distribuição percentual mensal com total e centavos consistentes, F6. |
| 92 | 12 / 266 | Permitir contingenciamento do orçamento, aplicando um percentual de redução sobre todo o orçamento ou sobre uma dotação específica. | N | N | Eventos de limitação por dotação/lote, sem reescrever orçamento original, F6. |
| 93 | 12 / 266 | Permitir liberação dos valores contingenciados. | N | N | Liberação parcial/total vinculada ao bloqueio, sem exceder saldo, F6. |
| 94 | 12 / 266 | Permitir remover os valores de cotas não utilizadas em meses já fechados e distribuí-las em meses abertos. | N | N | Redistribuir saldo preservando histórico dos meses fechados, F6. |
| 95 | 13 / 267 | Possuir rotina de compatibilização da LOA com PPA e LDO para que as peças orçamentárias fiquem iguais cumprindo assim as exigências legais. | N | N | E3 encadeamento não é compatibilização; comparar e propagar por ano/ato, F4. |
| 96 | 13 / 267 | Possibilitar consulta entre as receitas e despesas da LOA por fonte de recursos, permitindo consultar os dados de uma ou mais entidades e realizar a impressão dos dados consultados. | P | P | E3/E6/E9 bases; confronto com receita classificada/filtros e impressão, F8. |
| 97 | 13 / 267 | Possuir relatório das alterações orçamentárias, permitindo selecionar qualquer item da classificação da despesa (MCASP) e os dados relacionados a alteração orçamentária. O relatório deve possuir os seguintes filtros: entidade, data (de/até) credito adicional e origem de recursos. Deve possibilitar a emissão por órgão, unidade, programa, ação, função, subfunção e fonte de recursos. | P | P | E8/E9 histórico parcial; todas dimensões/filtros/agrupamentos e efeito líquido, F1/F7/F8. |
| 98 | 13 / 267 | Emitir, sobre os valores orçados, Demonstrativo das Receitas e Despesas com Manutenção e Desenvolvimento do Ensino – MDE, Demonstrativo das Receitas de Impostos e das Despesas Próprias com Saúde e Demonstrativo da Despesa com Pessoal. | P | P | E9 executado não substitui projetado LOA; três demonstrativos e bases, F8. |
| 99 | 13 / 267 | Possuir cadastro de renúncia de receita e respectiva compensação com emissão de relatório de renúncias objetivando o atendimento a LRF, art. 5º, inciso II. | P | P | E10 benefício realizado/relatório existe; previsão, compensação, exercício/ente/peça e saída LRF, F2/F8. |

## 5. Plano de desenvolvimento por dependências

Todas as fases incluem interface, persistência, autorização no servidor e evidência de demonstração. Prioridade **P0** significa fundação necessária para as demais fases; **P1** significa entrega exigida para completar o checklist. Estimativas abaixo são de tamanho relativo (M/G), não compromisso de prazo sem conhecer equipe, dados e layouts.

### F0 — escopo, autorização e jornada do módulo (P0, G)

- Reutilizar `GovernmentEntity` para Prefeitura/Câmara e mapear explicitamente unidades orçamentárias/gestoras às entidades, com vigência quando necessária. Não deduzir ente por nome/secretaria.
- Resolver ownership de peças: instrumento municipal compartilhado com participação por entidade, ou peças específicas vinculadas ao mesmo ciclo legal. Registrar essa decisão antes da migração, permitindo os dois recortes exigidos e evitando duplicação de orçamento.
- Adicionar vínculos/participações de entidade nos instrumentos e linhas de receita/despesa/transferência/evento; índices por ente, exercício, peça, versão, data e classificação.
- Criar policy central: ativação `PLANEJAMENTO`, operação e escopo entidade/UG. Planejamento autoriza elaboração; Financeiro autoriza execução contábil/financeira. Operações integradas usam autorização explícita adequada ao efeito; não aceitar acesso a qualquer módulo como liberação de todos os efeitos.
- Criar páginas operacionais próprias e actions de Planejamento sobre serviços canônicos. Antes de alterar assinaturas, localizar **todos** os consumidores; preservar `{ error?, data? }` para clientes existentes. URLs financeiras antigas devem continuar compatíveis.
- Criar em paralelo funcional as entradas Prefeitura e Câmara: `/planejamento/*` e `/camara/planejamento/*`. A segunda deve manter breadcrumb, retorno, filtros, entidade e navegação dentro de Câmara, sem encaminhar o usuário ao Financeiro ou à área da Prefeitura.
- Atualizar `src/app/app-domain/camara/{page.tsx,layout.tsx}`: hoje só apresentam áreas legislativas e não possuem entrada de Planejamento. Acrescentar card/submenu e fluxo de detalhes. Usar componentes compartilhados com contexto explícito e evitar dois shells aninhados ou manutenção de telas duplicadas.
- A política legislativa exige entrada `CAMARA`, operação de `PLANEJAMENTO` e escopo autorizado; parametrizar os perfis com esses acessos. Permissão de Planejamento da Prefeitura não concede acesso legislativo automaticamente. Validar também actions/downloads diretos.
- Consultas, totais, `count`, exportações e downloads precisam aplicar escopo antes de carregar dados. Corrigir o carregamento integral atualmente presente em E4.
- Listas: 20 itens no servidor, ordenação estável com desempate por ID, filtros recolhíveis, altura natural da tabela, cabeçalho compacto; usar contrato vigente de `ErpPagination` (`previousHref`, `nextHref`, `jumpTo`).
- Formulários: componentes e validação de campo do projeto, `MoneyInput`, seletores canônicos, campos obrigatórios visíveis, mensagens de erro/sucesso, estados de salvamento e confirmação de operações conforme os padrões vigentes. Layout responsivo e acessível; manter filtros/posição ao retornar do detalhe. Não criar um padrão visual diferente para Câmara.

**Aceite:** usuário apenas de Planejamento realiza elaboração no módulo novo; usuário da Câmara não acessa dados restritos da Prefeitura por URL/action/export; consolidação só usa entidades autorizadas. Testar criação e consumo cruzados com IDs de outro escopo.

### F1 — classificações, vínculos, graus e códigos reduzidos (P0, G)

Itens principais: 3–5, 8, 33–34, 56–58, 66, 76, 97.

- Completar catálogo único de naturezas/contas orçamentárias com árvore, níveis, códigos e vigências. Manter distinção entre natureza de receita/despesa e conta contábil PCASP.
- Complementar `ResourceSource` com classificações TCE-PR e grupo/especificação/detalhamento STN. Carregar tabela oficial por versão/exercício e validar uso, sem hardcode de exemplos como tabela oficial.
- Estruturar órgão, unidade, função, subfunção, programa, ação, elemento e destinação. Preservar IDs e relações de dotações existentes.
- Configurar graus de receita/despesa por peça; suportar despesa por elemento+fonte ou só fonte conforme requisito.
- Criar percentuais natureza→fontes, soma ≤100%, vigência e regra para percentual ainda não distribuído. A rotina de rateio deve exigir distribuição completa ou apresentar a parcela pendente, sem perder valor silenciosamente.
- Gerar/gerenciar códigos reduzidos, inclusive receita orçamentária/consignação; permitir reordenação de despesa só antes da execução. Separar código exibido do ID estável usado pelos consumidores.

**Aceite:** dois entes usam o mesmo catálogo; 101% é recusado; níveis escolhidos refletem cadastros e relatórios; reordenar códigos não rompe referência e é impedido após início da execução.

### F2 — elaboração completa PPA/LDO/LOA e participação social (P1, G)

Itens principais: 1–2, 6, 11–13, 15–17, 26, 29, 33, 35–37, 39–40, 48, 52, 55, 59, 61, 66, 99.

- Completar programa com todos os campos do item 6, responsáveis canônicos, manutenção e indicadores. Ação inclui produto/unidade/classificação e metas previstas/realizadas por ano/ente/fonte.
- Criar linhas de previsão de receita/despesa do PPA e da LDO; anualizar valores e transferência prevista com entidade de origem/destino. Não usar movimentação bancária como previsão.
- Audiências: realização, demandas ilimitadas por registro, bairro, solicitante/contato, órgão analista, status, pareceres, documentos GED e vínculo com ciclo/peça. Avaliar extensão de `CamAudiencia` ou composição compartilhada depois de conferir consumidores.
- Ratear receitas PPA/LOA em Decimal, com algoritmo determinístico de resíduo; somatório deve conservar exatamente o valor informado.
- Projeções por ano com método, base histórica, premissas/indexadores e memória; E10 e receitas financeiras alimentam histórico sem dupla contagem. Ausência de histórico deve ser mostrada; permitir base de implantação identificada e conferida.
- LDO: programas/ações anuais, orçamento, prioridades/riscos, metas fiscais e memórias de cálculo com portaria/manual STN aplicável identificado.
- Obras/conservação: programação por ano/ente com todos os valores do item 48; vínculo opcional com cadastro canônico, sem confundir obra municipal planejada com licença privada de construção.
- LOA: projeto de lei, lei, texto jurídico, anexos e linhas totalmente classificadas. Evitar pedir data de publicação definitiva como evidência de um rascunho.
- Renúncia: previsão por tributo/modalidade, base legal, estimativa por exercício, medida de compensação, metodologia e acompanhamento; preparar vínculo de benefícios tributários por identificador de origem, com conexão dos realizados em F9. Separar compensação orçamentária da compensação de crédito do contribuinte.

**Aceite:** elaborar ciclo de quatro anos com os dois entes, receitas rateadas, metas físicas/financeiras, obras, audiência e renúncia compensada. Conferir valores linha a linha e demonstrar os campos obrigatórios.

### F3 — importações e cópia para novo exercício (P1, G)

Itens: 5, 7, 9–10, 37–39, 60, 84.

- Criar assistente com origem PPA/LDO/LOA/exercício, destino, entidades, filtros e seleção de dotações/programas/ações/fontes.
- Modos: só estrutura; estrutura+valores; realizado do ano anterior onde exigido. Definir se realizado é empenhado/liquidado/pago e registrar a escolha normativa na memória.
- Prévia mostra quantidades, totais, códigos incompatíveis, itens ignorados e razões. Remapear IDs/códigos sem alterar origem.
- Execução idempotente por lote com estado, auditoria, resumo e rollback de lote transacional ou execução em etapas explicitamente recuperável.
- Cópia anual inclui relacionamentos/configurações válidos; listar o que não pode ser copiado por vigência/permissão. Não carregar atos finais como se aprovassem automaticamente o novo exercício.

**Aceite:** todas as origens exigidas, os modos e seleção individual são demonstrados; repetir lote não duplica; falha não deixa orçamento parcialmente efetivado sem identificação/recuperação.

### F4 — histórico efetivo, versões, consistências e compatibilização (P0/P1, G)

Itens: 14–15, 18–20, 25, 28, 30, 35–36, 40–42, 46, 50, 62–65, 71–72, 79, 95.

- Separar snapshot de proposta interna, versão aprovada e evento de alteração efetiva. Preservar `PlanningAmendment` como histórico interno, com migração aditiva para domínio legal completo.
- Registrar valores originais, eventos assinados positivos/negativos, data de efeito, data de registro, motivo, ato/texto e entidade. Consulta em uma data reconstrói posição, não usa saldo atual indiscriminadamente.
- Toda consulta/saída recebe peça, exercício, versão, data de corte e conjunto de entidades; versionar também classificações relevantes à reprodução.
- Consistências por peça: equilíbrio, fontes/percentuais, vigência, classificações, metas, programa/ação, relação PPA/LDO/LOA, alocação/fixação, duplicidades e escopo. Relatório deve orientar correção e bloquear apenas etapas onde a regra exige.
- Compatibilização PPA→LDO→LOA e LOA→LDO/PPA com prévia de diferenças, mapeamento por ano/ação/fonte e propagação auditada/idempotente. Igualdade é das dimensões e parcelas correspondentes; não igualar artificialmente valor quadrienal a valor de um ano.
- Peças fechadas só recebem revisão por fluxo formal/ato aplicável; não sobrescrever silenciosamente a versão sancionada.
- Atualização do realizado físico na LDO reflete no PPA exatamente uma vez. Consolidação define apresentação bruta e eliminações de transferências internas quando aplicáveis, com memória.

**Aceite:** posições antes/depois de duas alterações e versões distintas são reproduzíveis; compatibilização identifica conflito e aplica só mudanças autorizadas; concorrência entre revisão e sanção não altera versão fechada.

### F5 — emendas legislativas PPA/LDO/LOA (P1, G)

Itens: 21–23, 43–45, 67–69.

- Modelar emenda por peça/versão com data, objetivo, justificativa, vereador canônico, texto jurídico, anexos e itens de acréscimo/redução por dotação.
- Bloqueio de elegibilidade por dotação impede inclusão tanto na UI quanto por action; guardar motivo/autor/data.
- Decisões: aprovação integral, reprovação integral, sanção parcial com seleção explícita de itens/dotações e fundamento. O workflow genérico da peça não substitui este domínio.
- Efetivar só itens sancionados, com locks de peça/dotação, consistências e idempotência. Preservar proposta/rejeições e vínculo ao ato.
- Articular tramitação com Câmara/GED/atos legais sem criar vereador ou pessoa duplicados; manter autorização para decisão legal separada da edição.

**Aceite:** para cada peça, demonstrar emenda bloqueada, aprovada, reprovada e parcialmente sancionada; efeitos financeiros correspondem somente aos itens válidos. Repetição não reaplica valores.

### F6 — programação mensal, cotas e contingenciamento (P1, G)

Itens: 59, 74–75, 80–81, 86–94.

- Estender programação de desembolso por mês/entidade/UG/fonte; criar metas mensais de receita por entidade/modalidade/fonte. Agregação bimestral pode alimentar MBA existente, sem estimar meses por divisão arbitrária de bimestre antigo.
- Criar cota orçamentária por dotação/fonte/ente com configuração bimestral, trimestral e semestral sobre meses.
- Métodos: histórico do ano anterior, histórico de três anos, valor orçado/12 e percentuais informados por mês; parâmetros, bases e resíduos registrados.
- Definir realizado/consumo por estágio e preparar contratos de reservas, empenhos, anulações e pagamentos conforme política aprovada; conectar os consumidores reais em F9. Manter desembolso pago distinto de limite de empenhamento.
- Atualizar cotas automaticamente nas alterações; contingenciar orçamento inteiro ou dotação por percentual; liberar parcial/total com vínculo ao evento original.
- Fechar meses e redistribuir somente cota não utilizada para meses abertos, sem apagar histórico do mês fechado.
- Reconciliar dotações legadas sem vínculo LOA; demonstrar status de migração e regra de transição em vez de afirmar que CMD controla todo o orçamento.

**Aceite:** todos os métodos/períodos, alterações automáticas, contingenciamento/liberação e redistribuição conservam totais e saldos; duas sessões concorrentes não consomem a mesma disponibilidade.

### F7 — créditos, implantação e ponte contábil/Compras (P0/P1, G)

Itens: 64, 70–71, 73, 76–78, 82–84, 88, 97.

- Completar a prévia `CreditRequest` com entidade, origem legal dos recursos, lotes e discriminação de fontes/atos. Validar cada modalidade e disponibilidade da origem (anulação, superávit, excesso etc.) conforme regras aplicáveis.
- Criar reserva de anulação específica desde a prévia; não reutilizar sem distinção uma reserva de compra. Liberar/consumir atomicamente em cancelamento/efetivação, com ordem estável de locks.
- Emitir projeto/decreto a partir dos itens reais; anexar versão GED identificável, separando minuta de ato final/publicado.
- Desenvolver o comando canônico de efetivação em Planejamento: movimento orçamentário, saldos, liberação de bloqueio, reflexo de cotas e contrato das partidas contábeis. Preparar fronteira transacional/idempotência; conectar e comprovar as partidas financeiras em F9. No fluxo conectado, falha contábil deve desfazer o efeito orçamentário.
- Implantação por entidade/exercício/versão: validações, totais, aprovação, bloqueio das previsões originais e abertura contábil rastreada; preservar orçamento original e permitir só alterações formais.
- Preparar contrato de consulta/uso de dotações implantadas por Compras/Licitações/Contratos do ano seguinte e execução financeira; conexão em F9. Distinguir reserva/preparação futura de empenho em exercício não aberto.
- Auditar todos os consumidores `BudgetAppropriation`, reservas, empenhos, receitas, abertura/encerramento e pontes de Compras antes de mudar semântica de disponibilidade.

**Verificação interna F7:** prévia bloqueia a anulação e efetivação orçamentária conserva saldos, com rollback/repetição/concorrência e contratos preparados. **Aceite integral dos itens relacionados:** só depois de F9, com partidas contábeis reais e dotação futura consumida em Compras.

### F8 — consultas, relatórios oficiais e transparência (P1, G)

Itens: 15, 18–20, 24, 26–32, 36, 41–42, 46–47, 49–51, 53–54, 65–66, 71–72, 80–82, 85, 89, 96–99.

- Criar catálogo de relatórios com mapeamento individual dos requisitos; item com dez saídas só atende quando todas estiverem prontas.
- Reutilizar motor canônico de dataset/PDF/CSV, acrescentando definição `PLANEJAMENTO`, permissão `issueReports`, escopo entidade/UG e filtros comuns.
- Implementar todas as saídas da matriz: receitas/despesas/transferências PPA; metas financeiras/físicas; programas/detalhados; PPA analítico/sintético; detalhamento órgão/unidade; receitas ano/global/grau; compatibilidade valores/metas; avaliação física/financeira; LDO receitas/despesas/programa de trabalho; obras/conservação; memórias STN; CMD/metas/cotas; alterações MCASP; renúncia/compensação; decretos e projetos.
- Demonstrativos de MDE, saúde e pessoal precisam bases legais/classificações, percentuais e memória de exclusões. Usar **valores orçados** onde o item exige; apresentar executado em seção distinta. RCL deve possuir composição e período reproduzíveis. Validar particularidades do Legislativo sem simplesmente remover os relatórios.
- Item 85: definir com Contabilidade o catálogo de anexos aplicáveis da Lei 4.320/64 e cada variante. A referência financeira de execução lista anexos 1, 2, 6, 7, 8, 9 e alínea 1, com agrupamentos; o catálogo do planejamento deve explicitar escopo e layouts, não assumir que um PDF de LOA atende tudo.
- Corrigir comparação de créditos pelo efeito líquido; considerar anulações/estornos e evitar `findFirst` ambíguo. Totais das consultas e documentos devem ser iguais sob mesmos filtros.
- Preparar geração, snapshot final de peça/versão/data/entes, hash e estados de publicação no módulo novo. Conectar publicação simultânea ao storage/portal em F9; não anunciar publicação concluída antes da disponibilidade pública real.
- Preservar aviso `NOT_STATUTORY` das saídas atuais até concluir/validar cada saída nova. Homologação de layout/cálculo é evidência específica, não mudança cosmética do aviso.

**Verificação interna F8:** todos os filtros/agrupamentos exigidos, PDF legível, CSV consistente, versões antigas reproduzíveis e demonstrativos conferidos. **Aceite integral das saídas dependentes de publicação/layout externo:** depois de F9, com link público do mesmo documento/versão e validação dos documentos recebidos.

### F11/F12 — adaptação dos módulos existentes antes de F9/F10

| Identificação solicitada | Resultado da análise | Encaminhamento |
|---|---|---|
| F11 — Gestão e Controle de Custos | Planejada no Financeiro e Contábil; indicadores em Administração/BI | Implantar 31 itens e produtores/estornos reais antes de encerrar F11; Planejamento fornece LOA/classificações/dotações e consome custos realizados |
| F12 — Gestão de Controle Interno | Planejada em Auditoria, conforme confirmação do usuário | Implantar 36 itens, gestão de auditorias e integrações próprias antes de encerrar F12; Planejamento é um dos domínios fiscalizados |

Regras de apropriação e auditoria transversal não devem ser implementadas novamente sob permissão `PLANEJAMENTO`. O plano próprio da seção 1.2 define fases, produtores de dados, fronteiras transacionais, acesso/indicadores e 67 aceites. Nenhuma dessas fases foi executada por esta análise. Conexões indispensáveis a Custos/Controle Interno são entregas das próprias F11/F12; F9 posterior continua dedicada a encerrar as integrações do checklist de Planejamento.

### F9 — conexão das integrações e resolução de dependências externas (P1, G)

**Última etapa de implementação funcional**, após F0–F8 nas duas jornadas. Todas as dependências identificadas são registradas desde o começo; conexão e pedidos ao usuário ficam concentrados aqui.

- Transferir consumidores de Financeiro/Tributação/Compras/Câmara/relatórios para os contratos de Planejamento descritos na seção 6.4, preservando referências e efeitos transacionais.
- Conectar orçamento/dotações/fontes/programação/cotas às reservas e execução; histórico de receita/despesa aos acompanhamentos/projeções; benefícios tributários à renúncia prevista/compensação; tramitação legislativa aos atos/peças.
- Prever contratos de leitura por entidade/UG/peça/versão para Custos e Controladoria, conforme a análise de aderência. Conectar consumidores disponíveis sem mover apropriações/achados para Planejamento; futuras integrações de custos realizados e índices executados usam origem rastreável, sem dupla contagem nem confusão entre projetado e executado. Os 31/36 aceites permanecem nas frentes próprias.
- Conectar GED, assinatura, storage e publicação na transparência. Reutilizar infraestrutura disponível e implementar adaptadores reais onde necessários.
- APIs/provedores oficiais: usar adaptador versionado, autorização, timeout, retorno, estado, retry/idempotência e evidência. Definir primeiro quais requisitos realmente precisam comunicação externa; tabela/layout obtido por documento não exige inventar API.
- Solicitar ao usuário, **nesta etapa**, as APIs/documentos/credenciais/atos/layouts que não puderem ser obtidos pelas fontes disponíveis. Registrar para cada pedido: ente, IDs afetados, arquivo/serviço, motivo, formato, responsável e cenário de validação.
- Aplicar/conferir classificações e templates oficiais pendentes; substituir dados/templates demonstrativos onde necessário e repetir os testes afetados.
- Completar limpeza de menus e redirecionamentos antigos só após comprovar consumidores conectados. Nenhum formulário de planejamento deve permanecer como implementação paralela no Financeiro/Tributação.

**Aceite:** efeitos e consultas entre módulos funcionam usando a mesma origem canônica; comunicação/publicação real e erros/repetições comprovados. Mocks e dependências ainda pendentes não concluem os itens.

### F10 — preparação e homologação integral da POC (P1, M)

- Criar `docs/EVIDENCIAS_PLANEJAMENTO_ORCAMENTO.md` durante a implementação com uma linha para cada ID de ente e requisito, roteiro, pré-condição, evidência, commit, data, executor e resultado.
- Manter numerador separado para EXE-01/LEG-01; item parcialmente executado continua não atendido. Não usar soma 198 para compensar falha de um ente.
- Executar ensaio de **99/99 Prefeitura e 99/99 Câmara**, com todos os subcritérios e integrações reais. Após aceite, atualizar A/H com link de evidência por ente.
- Corrigir todos os itens pendentes e repetir os cenários afetados **antes** da demonstração final como sistema pronto. A entrega só encerra quando ambos os controles atingirem 100%.

## 6. Sequência recomendada e desenho técnico

### 6.1 Ordem de execução

1. **F0 + F1:** escopo/rotas/RBAC e classificação; desbloqueiam quase todos os requisitos.
2. **F2:** peças completas, receitas/metas/audiências/memória/renúncia.
3. **F3 + F4:** importações, eventos/versões e compatibilização; estabelecer histórico antes de novas efetivações.
4. **F5:** emendas legislativas completas.
5. **F6 + F7:** programação/cotas e implantação/créditos internos, com contratos preparados de saldo, consumo e contabilidade.
6. **F8:** concluir consultas, catálogo de relatórios e preparação de publicação; desenvolver as saídas junto a cada fase.
   - **F11 → F12 antes de F9/F10:** análise de aderência e checkup dos 28 módulos concluídos em 11/10/2026. Implantar Custos no Financeiro, indicadores em Administração/BI e Controle Interno em Auditoria conforme plano próprio; preservar denominadores e domínios independentes. Sequência vigente **F8 → F11 → F12 → F9 → F10**.
7. **F9:** conectar todas as integrações; solicitar e resolver APIs/documentos externos pendentes; concluir transferência de consumidores e limpeza dos menus.
8. **F10:** ensaio final, correções e homologação **100% Prefeitura + 100% Câmara**. Ensaios internos devem acontecer a cada fase.

Não estimar ganho percentual por fase antes de cumprir todos os subcritérios dos itens. É possível compartilhar serviços, mas a aceitação continua individual por número e ente.

### 6.2 Áreas propostas do novo módulo

Rotas abaixo são **propostas, ainda não entregues**:

Cada rota executiva da tabela tem equivalente legislativo sob **`/camara/planejamento`**: por exemplo, `/camara/planejamento/ppa`, `/camara/planejamento/ldo`, `/camara/planejamento/loa`, detalhes `[id]`, cadastros, audiências, importações, emendas, programação, cotas, memórias e relatórios. Câmara permanece no seu contexto durante toda a jornada. Conjunto de entidades selecionado nunca pode ampliar acesso pelo simples prefixo de URL.

| Área | Rotas propostas | Responsabilidade |
|---|---|---|
| Ciclos/instrumentos | `/planejamento/ppa`, `/planejamento/ldo`, `/planejamento/loa` e detalhes `[id]` | Elaborar, consultar, revisar, tramitar e implantar. |
| Participação | `/planejamento/audiencias` | Audiências/demandas/anexos/análise. |
| Cadastros | `/planejamento/cadastros` | Catálogos compartilhados, graus, vínculos, códigos e rateio. |
| Recuperação de dados | `/planejamento/importacoes` | Prévia, lote, seleção, execução e histórico. |
| Alterações | `/planejamento/emendas`, `/planejamento/alteracoes`, `/planejamento/compatibilizacao` | Emendas, créditos, eventos/versões e consistências. |
| Programação | `/planejamento/programacao`, `/planejamento/cotas` | CMD/metas mensais/cotas/contingenciamento. |
| LRF | `/planejamento/renuncias`, `/planejamento/memorias` | Previsões, compensação e memória. |
| Saídas | `/planejamento/consultas`, `/planejamento/relatorios` | Catálogo, filtros, comparação e publicação. |

O domínio de planejamento deve ficar em **`src/lib/planejamento/`** (policy, query, instruments, imports, amendments, revisions, compatibility, schedules, quotas, revenue-waivers, reports e integrations). Actions e telas pertencem ao módulo novo, com entrada legislativa dentro de Câmara. Serviços de escrituração/tesouraria permanecem canônicos no Financeiro e são consumidos por contratos explícitos em F9. A propriedade funcional de uma tabela não exige renomear fisicamente tabelas existentes; mover responsabilidade e completar relações preservando IDs/FKs/histórico.

### 6.4 Transferência de responsabilidade e simplificação dos menus

| Funcionalidade/dados | Responsável após transferência | Uso pelos módulos consumidores |
|---|---|---|
| PPA/LDO/LOA, programas/objetivos/indicadores/ações/metas, previsões/fixações e versões | Planejamento | Financeiro e Câmara consultam peça/versão aprovada e vínculos. |
| Cadastros orçamentários, classificação, fonte/destinação, códigos reduzidos e rateios | Planejamento, sobre catálogo canônico único | Financeiro/Tributação/Compras selecionam e validam os dados pelos contratos do novo domínio. PCASP/escrituração continuam no Financeiro. |
| Dotação original/atualizada, alterações/créditos, implantação, programação/cotas/contingenciamento | Planejamento | Financeiro/Compras consultam disponibilidade e registram consumo/estorno pelo contrato; execução de empenho/liquidação/pagamento permanece no módulo financeiro. |
| Audiências/demandas de planejamento, emendas, compatibilização, memórias e relatórios projetados | Planejamento; entrada legislativa em Câmara | Câmara usa sua jornada e referências canônicas de vereador/ato/sessão; documentos e relatórios têm escopo explícito. |
| Renúncia prevista, medidas de compensação, memória e relatório orçamentário LRF | Planejamento | Tributação fornece eventos de benefício realizado e consulta referências/limites quando necessário. Aplicação/cobrança de benefício tributário permanece operação tributária. |
| Receita arrecadada/despesa executada, partidas, tesouraria e lançamentos tributários | Financeiro/Tributação como fontes canônicas de execução | Planejamento recebe/consulta esses dados em F9 para realizado, projeções, cotas e confronto; não duplica arrecadação/escrituração. |

Etapas da transferência:

1. Inventariar consumidores de cada tabela/action/serviço/relatório individualmente, incluindo menu/layout, URLs antigas e integrações de Compras.
2. Entregar telas, forms e serviços completos de Planejamento e suas migrações aditivas, com testes internos nas duas entradas.
3. Preparar contratos internos de consulta/alteração/consumo com tenant, entidade, UG, exercício, peça/versão/data, operação e idempotência quando houver efeito. A dependência de fonte não deve permitir ao usuário contornar ACL.
4. Em F9, trocar consumidores para a nova origem; conferir saldos, histórico, referências, transações e relatórios antes/depois.
5. Retirar do menu Financeiro os grupos de elaboração PPA/LDO/LOA, programação, emendas/créditos e relatórios projetados transferidos; manter menu focado em execução, escrituração, tesouraria e relatórios financeiros. Consultas contextuais podem exibir dados de Planejamento ou abrir sua tela, sem formulário duplicado.
6. Retirar de Tributação as entradas de planejamento/relatório orçamentário de renúncia transferidas, preservando operações tributárias e sua rastreabilidade. Onde existe somente evento tributário realizado, construir o cadastro orçamentário no novo domínio em vez de mover a cobrança para ele.
7. URLs antigas passam a redirecionar para a jornada autorizada correta; remover implementação duplicada após conferir todos os consumidores. Não manter o novo módulo dependente de links para telas antigas.

**Aceite da transferência:** dados cadastrados em Planejamento são usados por Financeiro/Tributação/Compras sem recadastro; menus não exibem rotinas de planejamento duplicadas; entrada da Câmara retorna sempre ao fluxo legislativo; saldos e efeitos de execução permanecem reconciliados.

### 6.3 Evolução do schema e migrações

- **Reutilizar:** GovernmentEntity/UG, PPA/LDO/LOA, programas/ações, fontes/naturezas, dotações, reservas, créditos, receitas, contabilidade, GED/atos/auditoria.
- **Complementar/adicionar:** participação das entidades nas peças; linhas anuais de previsão PPA/LDO; classificações/vínculos/graus; rateios; produtos/metas realizadas; transferências previstas; demandas de audiência; memórias; investimentos LDO; eventos e versões efetivas; emendas/itens/decisões; lotes de importação; metas mensais; cotas/movimentos/contingenciamentos; renúncias/compensações.
- Persistir dinheiro em Decimal com política explícita de casas/arredondamento; receber strings decimais quando possível. Não decidir saldo por somas JavaScript de Float.
- Unicidades por ente/exercício/peça/versão conforme domínio; distinguir catálogo municipal único de registro operacional segregado. Eventos com chave de idempotência por origem/efeito.
- Migrações **aditivas**, com backfill verificável e relatório de registros sem classificação/ownership. Não inventar entidade de registro antigo. Não editar migrações aplicadas nem resetar o banco.
- A divergência histórica de checksum RH foi resolvida em 11/10/2026 após o pull até `17ff495`, restaurando os bytes originais e protegendo os finais de linha. Os três previews RH verificam o checksum exato; checker geral passou com 59 migrations. Conferir o conjunto de increments SST/Planejamento pendentes antes de deploy; ver `RH_MIGRATION_FOUNDATION_CORRECAO_CHECKSUM.md`.
- `npm run build` pode executar migrate deploy com `VERCEL_ENV=production` em `scripts/build.mjs`; os checks locais precisam ambiente de build definido para não implantar migrações durante análise/validação.

## 7. Verificações técnicas e evidências exigidas por entrega

A análise inicial foi documental e os testes citados no inventário não certificam o checklist. A implementação foi iniciada posteriormente; [EXECUCAO_PLANEJAMENTO_ORCAMENTO.md](EXECUCAO_PLANEJAMENTO_ORCAMENTO.md) registra as novas suítes, serviços/telas, build aprovado e migrations ainda não aplicadas. Compatibilização/cotas e aceite completo continuam nas fases a concluir.

Na implementação, priorizar testes que verificam efeitos/invariantes reais:

1. **Escopo:** leitura, escrita, totais, exportação e GED com IDs de outro ente/UG; módulo desligado e operação não concedida.
2. **Rateio:** soma 100/101%, resíduo de centavos, valor pequeno, fontes inativas e preservação do total.
3. **Temporalidade:** posição antes/depois, registro retroativo com data de efeito explícita, consulta por versão e revisão de peça fechada.
4. **Importação:** origem preservada, seleção, estrutura/valor/realizado, mapeamento de códigos, repetição e rollback.
5. **Emenda:** bloqueio de item, reprovação total, sanção parcial, efetivação exatamente uma vez e revisão concorrente.
6. **Compatibilização:** comparação por ano/ação/fonte, conflito de versões fechadas e realizado LDO refletido no PPA sem duplicação.
7. **Cotas:** períodos, todos os métodos, contingenciamento/liberação, redistribuição de não utilizado, mês fechado e concorrência de consumo.
8. **Crédito/contabilidade:** acréscimo menos anulação, remanejamento com efeito líquido zero, prévia reservada, rollback de partidas e idempotência. Testes PostgreSQL isolados para locks e transações.
9. **Implantação/consumidores:** dotação futura em Compras, orçamento implantado imutável, exercício fechado e regressão de reservas/empenhos/receitas financeiros.
10. **Relatórios:** dataset reconciliado ao saldo canônico, filtros combinados, estornos, Decimal, memória legal, PDF paginado e publicação da versão exata com falha de storage/portal identificada.

Checks por fase: Prisma validate/generate quando houver schema; lint direcionado; testes novos e regressões das pontes afetadas; `git diff --check`; build antes de qualquer commit/publicação, conforme AGENTS.md. Testes server-only devem usar `--conditions=react-server`; não executar suites em paralelo à geração Prisma. Conferir scripts vigentes antes de fixar comandos de CI.

## 8. Dados e documentos necessários para a demonstração

Preparar dados fictícios e modelos internos na F2; **pedidos de API/documento/acesso externo ao usuário ficam para F9**. A lista abaixo é inventário de preparação, não solicitação imediata.

- Entidades Prefeitura e Câmara com UG/órgãos/vigências e perfis: elaborador, analista, responsável pela decisão legal, execução financeira e leitura/auditoria. Fluxo atual de créditos exige atores distintos em criação, submissão, aprovação, sanção, publicação e efetivação: preparar usuários suficientes ou revisar policy aprovada, sem contornar a regra com alteração direta de banco.
- Um ciclo PPA de quatro anos, LDO e LOA de um ano do ciclo, peças do exercício anterior e dados de três anos para métodos históricos. Valores de POC fictícios, coerentes e identificados.
- Tabelas vigentes TCE-PR/STN/MCASP e modelos esperados de anexos, memórias, decretos e projetos; validação da Contabilidade para bases MDE/saúde/pessoal/RCL e renúncia/compensação.
- Lei/projeto, ato de alteração e documentos GED finalizados; evidência de publicação, signatários e armazenamento disponível. Templates jurídicos precisam revisão do responsável do ente.
- Arrecadação tributária mapeada e conciliada com receita canônica; execução de despesa com movimentos/estornos que permitam conferir consumo e realizado.
- Transferência prevista entre entes, programação de obra/conservação, audiência com duas demandas e documento, renúncia prevista com compensação e benefício tributário relacionado.
- Portal de transparência/storage configurados para publicar documento real. Credenciais ficam no servidor, fora do Markdown/Git.

### 8.1 Modelo demonstrável a entregar durante o desenvolvimento interno

- Dataset reproduzível por comando explícito, exclusivo de ambiente de demonstração, sem afetar produção e sem rodar automaticamente em deploy. Repetição deve ser idempotente.
- Prefeitura e Câmara com entidades/UG e perfis próprios; mesmo catálogo municipal de classificação.
- Ciclo PPA fictício 2026–2029 e LDO/LOA 2027 em cada recorte, com receitas/despesas equilibradas, fontes, programas, indicadores, produtos e metas anuais. Registros prévios 2024–2026 para métodos históricos, identificados como exemplos.
- Audiência com solicitações e anexo; memória de cálculo; obra/conservação; renúncia prevista/compensação; emendas de aprovação total, reprovação e sanção parcial.
- Programação dos 12 meses, cotas de períodos diferentes, contingenciamento/liberação e prévia de crédito com acréscimo/anulação para demonstrar efeito líquido.
- Templates internos imprimíveis de projeto de lei, decreto, audiência, memória, PPA/LDO/LOA e relatórios. Etiquetar exemplos/minutas e permitir edição pelos formulários do sistema; os modelos oficiais pendentes são ajustados em F9.
- Cada operação deve persistir dados, validar regras e permitir consulta/reemissão; screenshots, JSON solto ou um botão sem efeito não constituem modelo funcional.

**Estado:** dataset municipal plausível e script de carga criados, incluindo vereadores/assessores e peças canônicas. A carga ainda não foi executada; cenários adicionais e templates completos serão concluídos nas fases seguintes. A identificação da base fictícia é técnica, sem rótulos “demo”, “POC” ou “teste” na interface/cadastros apresentados.

### 8.2 Registro de dependências para pedir ao usuário no final

| Dependência | Etapa do pedido/conexão | IDs/cenários relacionados | Resultado esperado |
|---|---|---|---|
| Tabelas oficiais TCE-PR/STN/MCASP e layouts não obtidos nas fontes disponíveis | F9 | 4, 34, 56–58, 97 e classificação transversal | Versão/exercício registrados e catálogo validado. |
| Portaria/manual STN e modelos de demonstrativos/memórias específicos dos entes | F9 | 31, 51–53, 85, 98–99 | Fórmulas/bases/saídas conferidas por referência normativa. |
| Projetos, leis, decretos, anexos e signatários reais de Prefeitura/Câmara | F9 | 21–23, 33, 43–45, 55, 67–69, 77, 82–85 | Templates finais e workflow legal demonstrável. |
| API, autorização, credenciais ou acesso externo realmente necessário para assinatura/publicação | F9 | 2, 55, 77, 82, 85 e fluxo GED/legal | Adaptador real, retorno/erros e documento disponível. |
| Histórico real/mapeamentos de implantação que não estejam disponíveis | F9 | 13, 60, 75, 81, 89–90, 99 | Origem conferida para substituir exemplos na implantação/homologação. |

Quando surgir uma dependência adicional, acrescentar o ente e seus IDs afetados neste registro; continuar as tarefas internas independentes e formular o pedido concreto em F9.

## 9. Roteiro de ensaio da POC

Executar roteiro da **Prefeitura a partir de `/planejamento`** e roteiro da **Câmara a partir de `/camara` → `/camara/planejamento`**, além da consolidação autorizada. Registrar evidências distintas nos dois documentos de acompanhamento. Fluxo da Câmara deve incluir entrada, detalhe, operação, relatório e retorno dentro do módulo legislativo.

| Passo | Demonstração | Itens cobertos no ensaio |
|---|---|---|
| 1 | Entrar no módulo com perfil/ente/UG; demonstrar acesso recusado a outro escopo. | Transversal a todos. |
| 2 | Graus, vínculos oficiais, plano único, percentuais e códigos reduzidos; reprovar 101% e reordenação após execução. | 3–5, 8, 33–34, 56–58, 76. |
| 3 | Realizar audiência, cadastrar solicitações e baixar anexo. | 1–2. |
| 4 | Elaborar programas/indicadores/metas, receitas PPA rateadas/projetadas e transferência prevista. | 6, 11–13, 16–17. |
| 5 | Importar todas as origens/modos, escolher dotações e mostrar prévia/resumo; repetir lote. | 5, 7, 9–10, 37–39, 60, 84. |
| 6 | Elaborar LDO, obra/conservação/memória, LOA/projeto/anexos e despesas classificadas; tramitar/implantar. | 33, 37, 48, 52, 55, 59, 66, 73, 83–84. |
| 7 | Registrar alterações de receita, nova natureza e efeitos contábeis; consultar antes/depois e versões; compatibilizar. | 14–15, 18–20, 25, 28, 30, 35–36, 40–42, 46, 50, 62–65, 71–72, 79, 95. |
| 8 | Emendas de cada peça: bloquear dotação, aprovar/reprovar/sancionar parcialmente e conferir efeitos. | 21–23, 43–45, 67–69. |
| 9 | Programação mensal por fonte/modalidade; cotas em três períodos e todos os métodos; contingenciar/liberar/redistribuir. | 74–75, 80–81, 86–94. |
| 10 | Prévia em lotes/multifontes, reserva de anulação, decreto/projeto e crédito efetivado com partidas, sem duplicidade. | 64, 70–71, 77–78, 82, 88, 97. |
| 11 | Atualizar realizado físico/financeiro e emitir catálogo inteiro com data/versão/entes/filtros; conferir cada saída do item 27. | 24, 26–32, 47, 49, 51, 53–54, 65, 80–81, 85, 89, 96–98. |
| 12 | Renúncia prevista/compensação, vínculo tributário e relatório LRF; publicar anexos e abrir documento no portal. | 85, 99. |

O roteiro agrupa demonstrações para reduzir navegação; **não agrupa a pontuação**. A evidência final precisa checar cada campo, modalidade de operação, filtro e saída do texto oficial.

## 10. Próxima entrega executável

Começar por **F0/F1**, entregando uma primeira jornada real no módulo novo com escopo entidade/UG e cadastros compartilhados completos. Em seguida completar **F2** com a receita e despesa de cada peça. Isso cria a base necessária para importação, versões, compatibilização, emendas e relatórios, com maior reaproveitamento do código existente e menor retrabalho.

Checklist de partida:

- [ ] Aprovar ownership municipal/por entidade das peças e mapeamento explícito entidade↔UG.
- [ ] Auditar consumidores das actions/serviços que serão compartilhados e das dotações financeiras.
- [ ] Especificar migração aditiva/backfill/classificações e resolver histórico de migração antes de deploy.
- [ ] Criar policy/queries de Planejamento e telas próprias com paginação/escopo reais.
- [ ] Entregar telas PPA/LDO/LOA e demais áreas em `/planejamento/*` e `/camara/planejamento/*`, mantendo padrão de formulários/tabelas e contexto de navegação.
- [ ] Preparar dataset/modelos demonstráveis com persistência real e identificação de exemplo.
- [ ] Preparar contratos de transferência de consumidores e simplificação dos menus; conexão das integrações em F9.
- [ ] Completar classificações oficiais/graus/fontes/rateios/códigos reduzidos.
- [ ] Iniciar matriz de execução/evidências sem promover P/N para A/H antes da prova integral.

**Estado deste documento:** plano ajustado às orientações de 100%, transferência funcional, jornadas separadas e integrações no final; implementação iniciada em partes de F0–F3, conforme `EXECUCAO_PLANEJAMENTO_ORCAMENTO.md`. Conclusão das fases e homologação integral ainda pendentes; matriz da seção 4 preserva o diagnóstico inicial.
