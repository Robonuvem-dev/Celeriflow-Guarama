# Checkup dos 28 módulos — localização de Gestão e Controle de Custos

Data: **11/10/2026**. Objetivo: conferir a aderência de **EXE-04, 31 requisitos**, aos módulos já existentes e decidir se Custos deve ficar em Administração/indicadores ou em outro módulo. **Controle Interno em Auditoria foi confirmado pelo usuário.**

## 1. Resultado

**Recomendação revisada: Gestão e Controle de Custos como área própria em Financeiro e Contábil; indicadores consolidados e gerenciais em Administração/BI.**

| Papel | Localização |
|---|---|
| Cadastro de objetos/itens/agregadores, relacionamentos, parâmetros, apropriação, pendências e estornos | **Financeiro → Gestão e Controle de Custos**, `/financeiro/custos/*` |
| Relatórios reconciliáveis, notas e gráficos EXE-04.28–31 | Custos/Financeiro, com dados do ledger canônico de custos |
| Visão municipal, comparação setorial e acompanhamento gerencial | **Administração → Indicadores**, `/administracao/indicadores`, consumindo Custos |
| Estrutura LOA, dotações, programas/ações, metas e versões | Planejamento fornece referência e recebe custos realizados para avaliação |
| Folha, consumo de materiais, depreciação e operações setoriais | Produtores canônicos em RH, Patrimônio/Almoxarifado e módulos operacionais |
| Checklists, auditorias, achados, pareceres, providências, notificações e obrigações | **Auditoria → Controle Interno**, `/auditoria/controle-interno/*` |
| Entidades, centros organizacionais, pessoas e produtos | Cadastro Único, sem copiar registros para Custos |

Administração tem aderência gerencial, mas o fato de já possuir BI não torna o painel o responsável pelos comandos financeiros de apropriação/estorno. O usuário pediu confirmar **ou revisar** a localização; esta revisão substitui a hipótese intermediária de implantar todo o domínio em Administração.

Plano resultante: [PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md](PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md). Ordem proposta: **F11 Custos → F12 Controle Interno → F9/F10 de Planejamento**. Nenhuma mudança funcional de menu/serviço ou homologação de checklist foi realizada por esta análise.

## 2. Método e alcance do checkup

- Conferidos **28 módulos declarados** no array `menuItems` de `src/app/app-domain/dashboard/page.tsx`, com nome, código, acesso e rota. Esse é o inventário do produto no código, não uma consulta aos módulos ativados na instância nem certificação de que os 28 estejam integralmente homologados.
- Conferidos os layouts/menus das áreas, incluindo as rotas de entrada; aprofundados Administração/BI, Financeiro, Planejamento, Patrimônio/Almoxarifado, RH, Frotas e Auditoria nos serviços/modelos relevantes.
- Comparados os **31 itens do checklist oficial**, páginas 40–44, com a responsabilidade de cada módulo. Matriz individual no plano de implantação e na análise de aderência.
- Critérios: proximidade dos fatos geradores, transação de origem/estorno, abrangência municipal, conservação/idempotência, autorização e utilidade gerencial. Classificação qualitativa: sede do domínio, produtor, consumidor ou infraestrutura de apoio. Não atribuir percentuais de cobertura a menus/cadastros.

## 3. Mapa dos 28 módulos existentes

O papel abaixo é de arquitetura de Custos; não afirma que todas as integrações já estejam conectadas.

| # | Código / módulo | Aderência a Custos | Papel recomendado e fundamento |
|---|---|---|---|
| 1 | ADMINISTRACAO — Administração | Gerencial alta; operação indireta | Visão consolidada, organograma e BI. Consome indicadores de custos; não possui atualmente ciclo de apropriação/VPD/estorno. |
| 2 | CADASTROS — Cadastros | Fundação alta | Entidades, organograma, centros de custo, pessoas, produtos/fornecedores. Centro organizacional não é o objeto gerencial de custo. |
| 3 | PROCESSOS — Processos e Protocolo | Apoio | Tramitação e documentos dos procedimentos; não reconhece custos por si só. |
| 4 | ATENDIMENTO — Atendimento ao Cidadão | Setorial indireta | Pode fornecer demanda/volume de serviços para indicador futuro; seu domínio é chamados/Ouvidoria. |
| 5 | TRANSPARENCIA — Portal Transparência | Consumidor/publicação | Publica relatórios autorizados; não efetua apropriações. |
| 6 | TRIBUTACAO — Tributário | Complementar | Receitas, taxas e débitos; apurar receita tributária não é apropriar despesa municipal. Dados úteis a auditorias/custo versus receita, se aplicável. |
| 7 | FINANCEIRO — Financeiro e Contábil | **Maior aderência operacional** | Liquidações, VPD, lançamentos contábeis, prestação de contas e estornos. Melhor sede dos comandos e da reconciliação de Custos. |
| 8 | PLANEJAMENTO — Planejamento e Orçamento | Estrutural/avaliativa alta | Objetos gerados da LOA, dotações, programa/ação e metas. Fornece previsto e consome custo realizado; orçamento fixado não equivale a custo. |
| 9 | SST — Segurança e Medicina do Trabalho | Produtor/consumidor setorial | Equipamentos/benefícios e estimativas de absenteísmo. Estimativa de custo SST não substitui reconhecimento/apropriação. Não transferir dados clínicos para métricas gerais. |
| 10 | COMPRAS — Compras e Contratos | Origem de vínculos alta | Produtos/contratos/recebimentos e dotação. Compra/reserva não significa consumo; utilizar origem na liquidação/estoque. |
| 11 | RH — RH e Folha | Produtor alta | Funcionário, verba, contrato, local/centro, bruto/encargos; fonte obrigatória EXE-04.24–25, sem abrigar o custo de todos os outros setores. |
| 12 | PORTAL_SERVIDOR — Portal do Servidor | Acesso de apoio | Autosserviço funcional; não é domínio de apropriação municipal. |
| 13 | PATRIMONIO — Almoxarifado e Patrimônio | Produtor alta | Consumo de materiais e depreciação, EXE-04.26–27. Controla bens/estoque; não cobre folha/liquidações/VPD de todos os setores. |
| 14 | EDUCACAO — Educação | Objeto/produção setorial | Escola, matrícula, merenda e transporte; referências para objetos e indicadores setoriais futuros, com custos originados nos produtores canônicos. |
| 15 | SAUDE — Saúde | Objeto/produção setorial | Unidades, atendimento, farmácia e produção/faturamento. Custo assistencial setorial não é motor municipal único de custos. |
| 16 | SOCIAL — Assistência Social | Objeto/produção setorial | Unidades/programas/benefícios e atendimento SUAS; relacionar fatos e consumo sem duplicar despesas financeiras. |
| 17 | MEIO_AMBIENTE — Meio Ambiente | Setorial indireta | Serviços, licenciamento, resíduos e áreas verdes; utiliza objetos/indicadores da própria atuação. |
| 18 | SANEAMENTO — Água e Saneamento | Setorial | Serviços/manutenção, consumo e faturas; receitas de faturas não são automaticamente custos apropriados. |
| 19 | OBRAS — Obras e Construção Civil | Objeto/produção setorial alta | Obras, medições, equipes e materiais. Distinguir incorporação de ativo/capitalização de consumo/VPD e custo; não abrigar o custo municipal inteiro. |
| 20 | ILUMINACAO_PUBLICA — Iluminação Pública | Objeto/produção setorial | Energia/OS/equipamentos; classificar despesa e consumo pelo objeto/período, respeitando origem financeira/patrimonial. |
| 21 | FROTAS — Frotas | Produtor/consulta setorial alta | Gastos, consumos, manutenção e seguros já têm serviços próprios. Fonte importante, mas limitada a veículos/máquinas. |
| 22 | CULTURA — Cultura e Lazer | Objeto/produção setorial | Projetos/eventos/espaços/esporte e fundos; consumir custos por projeto/objeto, sem apropriar outra vez a mesma despesa. |
| 23 | CEMITERIOS — Cemitérios | Setorial | Estrutura e serviços funerários/taxas; fornecedor de referências de serviços, não apropriação municipal geral. |
| 24 | CAMARA — Câmara Municipal | Recorte de entidade | Possível habilitação de custos legislativos no serviço comum, com escopo próprio. Não duplica cadastros/ledger. |
| 25 | SEGURANCA — Segurança e Mobilidade | Setorial | Equipes, rondas, OS/equipamentos e mobilidade; consume materiais/serviços e pode utilizar métricas setoriais. |
| 26 | AUDITORIA — Auditoria | Fiscalização alta; operação indireta | Sede confirmada de Controle Interno; fiscaliza integridade da apropriação e preserva evidências, sem se tornar seu executor financeiro. |
| 27 | SUPORTE_TECNICO — Suporte Técnico | Infraestrutura | SLA/manutenção da plataforma; eventual objeto de custo administrativo, não sede do motor de custos. Página examinada apresenta preparação de fluxos, não motor de apropriação. |
| 28 | CONFIGURACOES — Configurações | Infraestrutura | Perfis, usuários, integrações/certificados/instância; hospeda configurações técnicas compartilhadas, não os lançamentos gerenciais de custo. |

## 4. Evidências decisivas nos candidatos principais

| Local | O que foi encontrado | Consequência para a decisão |
|---|---|---|
| `financeiro/layout.tsx` | Áreas de empenhos, liquidações, pagamentos, restos, contabilidade/fechamento e relatórios | Apropriação e estorno podem ser expostos no fluxo financeiro já exigido pelo checklist. |
| `src/lib/financeiro/index.ts`, `createSettlement`, linhas 865–1002 | Transação com liquidação, documento, retenções, atualização de execução, evento contábil e auditoria | Conectar Custos na mesma transação; não pedir lançamento independente em Administração após liquidar. O serviço examinado ainda não contém a apropriação de EXE-04.17. |
| Mesmo arquivo, `cancelSettlement`, linhas 1004–1025 | Lock de empenho, exercício aberto, verificação de pagamentos e reversão contábil | Incluir proteção/estorno dos custos junto à reversão financeira para EXE-04.18; não confundir o bloqueio atual por pagamento com bloqueio por custo já apropriado. |
| `administracao/{page.tsx,layout.tsx}` | Estrutura institucional e entrada BI; contagens gerais e demandas fixas no painel | Adequado à leitura gerencial, não possui ledger/ciclo de custo municipal. |
| `administracao/indicadores/page.tsx` | Reexporta `../../indicadores/page` | Há uma implementação comum de indicadores; ampliá-la como consumidora, sem outro cálculo de custos. |
| `indicadores/page.tsx`, linhas 10–25 | Soma `FleetOperation.cost` e pagamentos emitidos/pagos; conta planos/achados | Painel atual não atende EXE-04.28–31. Pagamento não é custo apropriado; períodos/escopos precisam ficar explícitos. |
| `src/lib/rh/finance-bridge.ts` | Plano por centro de custo, bruto/encargos, vínculo ao cálculo oficial e solicitações de despesa financeiras | Fonte valiosa para custos de pessoal; criar solicitação de despesa não comprova apropriação automática na liquidação de folha. |
| `src/lib/patrimonio/stock-service.ts`, `applyStockMovement` | Comando em transação existente, valor unitário e referências a liquidação/serviço/reversão | Preparado para adicionar reflexo de custo de consumo transacional; item sem valor precisa pendência explícita. |
| `src/lib/patrimonio/asset-lifecycle.ts`, `depreciateAssetsForMonth` | Histórico mensal e atualização do valor do bem em transação | Fonte de depreciação, mas trecho examinado não apropria custos nem comprova o ciclo contábil completo de depreciação. Conexão é uma entrega F11, não requisito já atendido. |
| `src/lib/frotas/{service,queries}.ts` | `FleetConsumption`, `FleetExpense`, OS/`AssetMaintenance` e uso de `MaterialMovement`; despesas identificadas por `sourceKey` | Reusar correlação entre registros e não somar espelhos do mesmo fato. |
| `auditoria/page.tsx` e `platform/audit-query.ts` | Eventos imutáveis, filtros e paginação, sob AUDITORIA | Base de evidência e sede adequada de Controle Interno; construir gestão de auditorias separadamente da leitura de logs. |
| `cadastros/layout.tsx` e `CostCenter` | Centro organizacional já é cadastro comum; Patrimônio também possui acesso a centros | Reutilizar IDs e validar consumidores; evitar terceiro cadastro de centro organizacional em Custos. |

Os caminhos de páginas/layouts desta tabela são relativos a `src/app/app-domain`. Recomendar um módulo não significa declarar implementado seu checklist.

## 5. Resultado da comparação

| Candidato | Pontos favoráveis | Limitação | Resultado |
|---|---|---|---|
| Financeiro e Contábil | Proximidade da liquidação/VPD, reversão, exercício, lançamentos e conciliação | Ainda precisa de domínio completo de custos e integrações reais | **Sede operacional recomendada** |
| Administração/Indicadores | Organograma, gestão municipal, BI transversal | Indicadores são consumidores; não há ciclo financeiro de apropriação/estorno | **Sede da visão gerencial** |
| Planejamento e Orçamento | LOA e classificação, metas e avaliação de programas | Predominantemente previsto/versão; não reconhecimento de consumo | Referência estrutural e avaliação |
| Almoxarifado e Patrimônio | Consumo e depreciação | Não abrange todas as VPD/folha/liquidações municipais | Produtor obrigatório |
| RH e Folha | Principal fonte de custos de pessoal | Restrito a pessoal; não abrange os outros tipos | Produtor obrigatório |
| Frotas | Já possui gastos/consumos/manutenção e correlação de origens | Restrito a frota; indicador legado precisa reconciliação | Produtor/consulta setorial |
| Auditoria | Evidência e controle transversal | Auditor fiscaliza; não deve efetuar a apropriação que fiscaliza | Controle Interno confirmado |

A localização Financeiro + BI é suportada principalmente por EXE-04.16–27, em especial **17–18, 21–23 e 25**, que exigem o momento e a reversão do reconhecimento financeiro/contábil. **3, 13 e 14** exigem Planejamento como referência. **28–31** justificam também a exposição em indicadores, sem deslocar as operações de origem.

## 6. Vínculo proposto com indicadores de Administração

Uma consulta canônica de Custos deve alimentar relatórios, gráficos no Financeiro e painel Administração sob os mesmos filtros/valores, com permissão própria para métricas agregadas e escopo por entidade/UG/centro. A permissão ADMINISTRACAO sozinha não libera consulta a detalhes financeiros de todos os entes.

### Indicadores obrigatórios do checklist

1. **Apropriado versus pendente**, por entidade/consolidado e tipo de despesa, com períodos independentes de despesa e apropriação (28–29).
2. **Custo por objeto no período**, com gráfico e detalhamento reconciliável (30).
3. **Apropriações por item**, com filtros entidade/item (31).

### Visões gerenciais complementares propostas

- Tendência mensal por órgão/unidade/programa/ação, por competência de reconhecimento e por data de apropriação explicitadas.
- Custos de pessoal, consumo de materiais, depreciação e demais serviços, sem tratar empenhado/liquidado/pago como sinônimos de custo.
- Cobertura de integração/valoração: origens conhecidas, valores ausentes, critérios não mapeados e pendências, separando **zero** de **não apurado**.
- Custo por unidade de serviço/produto somente quando houver numerador e produção física canônicos, mesmo período/objeto e unidade de medida válida. Sem inventar custo por aluno/consulta/quilômetro com denominador desconhecido.
- Previsto versus realizado em programas usando dois conjuntos explicitamente distintos: orçamento/metas de Planejamento e custo/produção reais. Uma diferença não prova economia sem considerar cobertura, produção e reconhecimento.

Visões complementares não aumentam o denominador de 31 itens e não substituem nenhuma saída obrigatória.

### Reconciliação necessária no BI atual

- Substituir leitura de `FleetOperation` como indicador único de custos de frota por consulta reconciliada às origens atuais. Mapear o legado antes de combiná-lo com as tabelas novas.
- Um consumo ligado a `MaterialMovement` gera `FleetConsumption` e um `FleetExpense` com origem CONSUMO. São referências do mesmo fato: **não somar os três valores**.
- Uma OS pode atualizar `AssetMaintenance` e criar/atualizar `FleetExpense`; não somar manutenção e despesa novamente no indicador municipal.
- Valor sem valoração (`null`) continua pendência, não custo zero. Somatórios mostram total conhecido e cobertura incompleta.
- Pagamentos emitidos e pagos já possuem card distinto; manter sua semântica explícita e não adicioná-los ao total de custos reconhecidos/apropriados.
- Ao levar Controle Interno a Auditoria, revisar os indicadores que leem diretamente `InternalControlPlan`/`InternalControlFinding`, reutilizando consulta autorizada do domínio de controle.
- Tratar indisponibilidade de origem como não apurado/erro explícito. Os `catch(() => 0)` observados no painel não são padrão para afirmar cobertura regular ou custo completo.

## 7. Efeito no plano de implantação

- **F11:** sede `/financeiro/custos`; serviços `src/lib/custos`, operações FINANCEIRO + privilégio de Custos; conectar produtores e estornos reais; publicar consultas de leitura autorizada para BI em Administração.
- **F12:** sede `/auditoria/controle-interno`, conforme confirmação; migrar base atual, checklists/gestão e integrações, com permissões de auditor e destinatário distintas.
- Administração terá indicadores de Custos e atalho autorizado ao submódulo financeiro; poderá acessar Controle Interno por atalho autorizado. Cada área mantém um domínio e um CRUD canônicos.
- Sem novo cartão independente de Custos no inventário dos 28 módulos; sem novo módulo chamado Controladoria. Cada checklist conserva avaliação própria.
- As matrizes e etapas F11/F12 são mantidas no plano revisado; esta conferência é arquitetural/documental, anterior à implementação e aos ensaios de aceite.
