# Câmara — submódulo Planejamento e Orçamento (LEG-01)

## Meta e acesso legislativo

**Entrega: 99/99 requisitos integralmente funcionais — 100%.** Criar **Câmara → Planejamento e Orçamento** como novo item do menu e card da Câmara, com submódulo em **`/camara/planejamento/*`**.

Fonte: seção 10.38, páginas 256–267 do arquivo `Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`.

O [plano principal](PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md) contém a transcrição integral, diagnóstico, evidências E1–E11, arquitetura e fases F0–F10. Os nomes curtos abaixo são índices de acompanhamento; o aceite de cada linha exige **todo o texto do item de mesmo número na seção 4 do plano principal**. O conteúdo oficial coincide com o Executivo, mas implementação da jornada, dados, permissões, ensaio e aceite legislativos são independentes.

## Submódulo e layout profissional ERP

- Entrada **Planejamento e Orçamento** implementada em `src/app/app-domain/camara/layout.tsx`, com card em `camara/page.tsx` e navegação própria do submódulo.
- Entrada `/camara/planejamento` com painel/catálogo operacional e navegação por Cadastros, Instrumentos, Movimentos, Consultas e Relatórios. Não usar o painel executivo ou o Financeiro como tela de destino.
- Telas próprias de PPA `/camara/planejamento/ppa`, LDO `/camara/planejamento/ldo`, LOA `/camara/planejamento/loa`, listas/detalhes `[id]`, audiências, emendas, importações, alterações, compatibilização, programação, cotas, memórias, renúncias e relatórios.
- Breadcrumb **Câmara Municipal → Planejamento e Orçamento → área → registro**. Manter acesso de retorno à Câmara, título/contexto legislativo, exercício, entidade, UG e versão; conservar filtros/posição da consulta.
- Reutilizar `ModuleShell`, `PageFrame`, `PageHeader` e componentes canônicos de tabela/formulário/paginação. Resolver a composição de navegação para evitar shells duplicados. Layout ERP compacto, responsivo, acessível, ações por registro e situação textual.
- Paginação de 20 registros no servidor, ordenação estável, escopo antes de count/totais, filtros recolhíveis e tabela de altura natural. Formulários com padrão vigente de Label/Input/Select/MoneyInput, validação, mensagens e estados de salvamento.
- Compartilhar domínio e componentes com Planejamento, passando **contexto legislativo explícito**, sem duplicar tabelas canônicas nem apontar ambas as jornadas indiscriminadamente para os mesmos dados.
- Autorizar entrada CAMARA, operação PLANEJAMENTO e entidade/UG permitidas; preparar perfis correspondentes. Proteger URL/action/export/download diretos e não inferir ente pelo prefixo de rota.
- Referenciar vereador, legislatura, proposição, sessão, ato e audiência canônicos quando a operação exigir. Conectar a tramitação e demais módulos em F9, após as telas/regras internas completas.
- Demonstrativos também exigidos neste bloco (inclusive saúde/MDE/RCL) permanecem na entrega. Apresentar recorte/consolidação e metodologia aplicáveis à Câmara; não retirar itens por presunção de inaplicabilidade.
- Preparar dataset legislativo fictício com persistência real e templates identificados; APIs/documentos externos são pedidos em F9. Critério final não aceita integração simulada como concluída.

## Controle individual dos requisitos da Câmara

**Diagnóstico técnico atualizado:** [revisão do código e plano S1–S9](PLANEJAMENTO_ORCAMENTO_DIAGNOSTICO_ATUAL_E_PLANO_EXECUCAO.md), com 99 itens e complementos para a próxima execução. Os estados B/P dessa revisão não promovem os aceites LEG abaixo; os números 49/50 no estado inicial são históricos.

**Progresso técnico F4–F8:** os fluxos internos são expostos em `/camara/planejamento/[kind]/[id]/gestao/[section]`, com contexto legislativo obrigatório. Testes executam operação de emenda/programação/relatório legislativo e recusam consolidação cruzada não autorizada. Evidências e dependências: [PLANEJAMENTO_F4_F8_EVIDENCIAS.md](PLANEJAMENTO_F4_F8_EVIDENCIAS.md). Migrations, ensaio completo da Câmara, conexões F9 e aceite independente F10 continuam necessários; nenhuma caixa integral foi promovida automaticamente.

Cada caixa abaixo é **pendente de entrega e demonstração integral do Legislativo**; não representa inexistência das bases parciais já auditadas. Desenvolvimento interno indicado por fase; todos passam por F0/F1 transversais, F9 quando houver integração/dependência, e F10 para aceite final.

| ID oficial de acompanhamento | Funcionalidade a entregar — texto integral no plano principal | Desenvolvimento | Entrega/aceite LEG |
|---|---|---|:---:|
| LEG-01.1 | Audiências e solicitações comunitárias | F2 | [ ] |
| LEG-01.2 | Anexos e download da audiência | F2 | [ ] |
| LEG-01.3 | Grau/nível orçamentário do PPA | F1 | [ ] |
| LEG-01.4 | Vínculos PPA conforme TCE | F1 | [ ] |
| LEG-01.5 | Importar vínculos LOA→PPA | F3 | [ ] |
| LEG-01.6 | Programas completos, objetivos e indicadores | F2 | [ ] |
| LEG-01.7 | Importar programas/ações LOA→PPA | F3 | [ ] |
| LEG-01.8 | Código reduzido automático PPA | F1 | [ ] |
| LEG-01.9 | Importar receitas/despesas PPA anterior/LOA | F2/F3 | [ ] |
| LEG-01.10 | Importação seletiva: dotações/valores | F3 | [ ] |
| LEG-01.11 | Programação da receita por fonte | F2 | [ ] |
| LEG-01.12 | Rateio automático de receitas PPA | F2 | [ ] |
| LEG-01.13 | Projeção anual de receita/despesa PPA | F2 | [ ] |
| LEG-01.14 | Alterações de receitas PPA e consultas | F4 | [ ] |
| LEG-01.15 | Orçamento PPA por data e entidades | F2/F4/F8 | [ ] |
| LEG-01.16 | Metas físicas/financeiras por ano/destinação | F2/F4 | [ ] |
| LEG-01.17 | Transferências financeiras previstas por ano | F2 | [ ] |
| LEG-01.18 | Alterações PPA cronológicas e consolidadas | F4/F8 | [ ] |
| LEG-01.19 | Consolidação de previsões/alterações PPA | F4/F8 | [ ] |
| LEG-01.20 | Confronto receita/despesa PPA por fonte | F4/F8 | [ ] |
| LEG-01.21 | Emendas PPA completas por dotação | F5 | [ ] |
| LEG-01.22 | Bloqueio de dotações para emendas PPA | F5 | [ ] |
| LEG-01.23 | Aprovação/reprovação/sanção parcial PPA | F5 | [ ] |
| LEG-01.24 | Relatórios PPA: receita/despesa/transferência | F8 | [ ] |
| LEG-01.25 | Replicação de alterações PPA→LDO/LOA | F4 | [ ] |
| LEG-01.26 | Metas previstas/realizadas por ação/produto | F2/F8 | [ ] |
| LEG-01.27 | Todas as famílias de relatórios PPA do item | F8 | [ ] |
| LEG-01.28 | Relatórios de compatibilidade de valores/metas | F4/F8 | [ ] |
| LEG-01.29 | Avaliação de resultados físicos/financeiros | F2/F8 | [ ] |
| LEG-01.30 | Consultas/relatórios por versão PPA | F4/F8 | [ ] |
| LEG-01.31 | Saúde/pessoal/educação/RCL | F8 | [ ] |
| LEG-01.32 | Receita PPA por grau, original/atualizada | F1/F2/F8 | [ ] |
| LEG-01.33 | LDO: graus, projeto e texto jurídico | F1/F2 | [ ] |
| LEG-01.34 | Vínculos LDO conforme TCE | F1 | [ ] |
| LEG-01.35 | Alterações de receitas LDO e dados legais | F2/F4 | [ ] |
| LEG-01.36 | Orçamento LDO por data e entidades | F2/F4/F8 | [ ] |
| LEG-01.37 | Programas/ações LDO e importações | F2/F3 | [ ] |
| LEG-01.38 | Importar despesas PPA/LOA/LDO anterior | F3 | [ ] |
| LEG-01.39 | Importar receitas PPA/LOA/LDO anterior | F2/F3 | [ ] |
| LEG-01.40 | Metas realizadas LDO atualizam PPA | F2/F4 | [ ] |
| LEG-01.41 | Consolidação de previsões/alterações LDO | F4/F8 | [ ] |
| LEG-01.42 | Alterações LDO cronológicas e consolidadas | F4/F8 | [ ] |
| LEG-01.43 | Emendas LDO completas por dotação | F5 | [ ] |
| LEG-01.44 | Bloqueio de dotações para emendas LDO | F5 | [ ] |
| LEG-01.45 | Aprovação/reprovação/sanção parcial LDO | F5 | [ ] |
| LEG-01.46 | Confronto receita/despesa LDO por fonte | F4/F8 | [ ] |
| LEG-01.47 | Demonstrativos de receitas/despesas/programas | F8 | [ ] |
| LEG-01.48 | Obras/conservação planejadas na LDO | F2 | [ ] |
| LEG-01.49 | Relatório de obras/conservação | F8 | [ ] |
| LEG-01.50 | Consultas/relatórios por versão LDO | F4/F8 | [ ] |
| LEG-01.51 | MDE/saúde/pessoal sobre orçamento LDO | F8 | [ ] |
| LEG-01.52 | Cadastro de memórias de cálculo STN | F2 | [ ] |
| LEG-01.53 | Relatórios de memórias STN | F8 | [ ] |
| LEG-01.54 | Programas/ações com filtros completos | F8 | [ ] |
| LEG-01.55 | LOA: projeto/lei/anexos | F2 | [ ] |
| LEG-01.56 | Fontes LOA classificadas TCE/STN | F1 | [ ] |
| LEG-01.57 | Plano de contas único multiente | F1 | [ ] |
| LEG-01.58 | Fontes/percentuais da conta de receita | F1 | [ ] |
| LEG-01.59 | Programação receita/despesa por fonte/destinação | F2/F6 | [ ] |
| LEG-01.60 | Importação LOA/LDO e realizado anterior | F3 | [ ] |
| LEG-01.61 | Rateio automático de receitas LOA | F1/F2 | [ ] |
| LEG-01.62 | Atualizações de receitas LOA com histórico | F4 | [ ] |
| LEG-01.63 | Naturezas novas após aprovação da LOA | F4 | [ ] |
| LEG-01.64 | Partidas automáticas de alteração da receita | F4/F7/F9 | [ ] |
| LEG-01.65 | Orçamento LOA por data e entidades | F4/F8 | [ ] |
| LEG-01.66 | Despesa por elemento/destinação/entidade | F1/F2/F8 | [ ] |
| LEG-01.67 | Emendas LOA completas por dotação | F5 | [ ] |
| LEG-01.68 | Bloqueio de dotações para emendas LOA | F5 | [ ] |
| LEG-01.69 | Aprovação/reprovação/sanção parcial LOA | F5 | [ ] |
| LEG-01.70 | Alterações multidotações/multifontes por ato | F7 | [ ] |
| LEG-01.71 | Histórico cronológico de alterações de despesa | F4/F7/F8 | [ ] |
| LEG-01.72 | Consolidação de previsões/alterações LOA | F4/F8 | [ ] |
| LEG-01.73 | Orçamento aprovado disponível no início do ano | F7/F9 | [ ] |
| LEG-01.74 | Desembolso mensal por entidade/fonte | F6 | [ ] |
| LEG-01.75 | Arrecadação mensal por modalidade/fonte/ente | F6 | [ ] |
| LEG-01.76 | Gerir/reordenar códigos reduzidos | F1/F7 | [ ] |
| LEG-01.77 | Prévia/lotes/projeto/decreto/efetivação contábil | F7/F9 | [ ] |
| LEG-01.78 | Bloqueio/liberação da anulação na prévia | F7 | [ ] |
| LEG-01.79 | Consistências executáveis por peça | F4 | [ ] |
| LEG-01.80 | CMD por fonte/mês e relatório consolidado | F6/F8 | [ ] |
| LEG-01.81 | Metas mensais por fonte e relatório consolidado | F6/F8 | [ ] |
| LEG-01.82 | Impressão de decretos de suplementação | F7/F8 | [ ] |
| LEG-01.83 | Implantação/bloqueio e consumo em outros módulos | F7/F9 | [ ] |
| LEG-01.84 | Cópia anual de relações/configurações | F3/F7/F9 | [ ] |
| LEG-01.85 | Relatórios Lei 4.320/64 e publicação simultânea | F8/F9 | [ ] |
| LEG-01.86 | Cotas de despesa por entidade | F6 | [ ] |
| LEG-01.87 | Cotas bimestrais/trimestrais/semestrais | F6 | [ ] |
| LEG-01.88 | Atualização automática de cotas nas alterações | F6/F7/F9 | [ ] |
| LEG-01.89 | Cotas: previsto versus realizado | F6/F8/F9 | [ ] |
| LEG-01.90 | Cotas: ano anterior/três anos/divisão por 12 | F6/F9 | [ ] |
| LEG-01.91 | Distribuição mensal por percentuais | F6 | [ ] |
| LEG-01.92 | Contingenciamento global/por dotação | F6 | [ ] |
| LEG-01.93 | Liberação de contingenciamentos | F6 | [ ] |
| LEG-01.94 | Redistribuição de cotas não usadas | F6 | [ ] |
| LEG-01.95 | Compatibilização LOA↔PPA/LDO | F4 | [ ] |
| LEG-01.96 | Confronto LOA por fonte/entes e impressão | F8 | [ ] |
| LEG-01.97 | Relatório de alterações com filtros MCASP | F1/F7/F8 | [ ] |
| LEG-01.98 | MDE/saúde/pessoal sobre orçamento LOA | F8 | [ ] |
| LEG-01.99 | Renúncia/compensação e relatório LRF | F2/F8/F9 | [ ] |

## Evidência e conclusão

Controle de ensaio individual preparado: [EVIDENCIAS_PLANEJAMENTO_CAMARA.md](EVIDENCIAS_PLANEJAMENTO_CAMARA.md). Os 99 IDs têm roteiro e resultado legislativo próprio; ensaio autenticado ainda não executado. Publicação técnica/diagnóstico: [S8/S9](PLANEJAMENTO_S8_S9_PUBLICACAO_E_ENSAIO.md).

**Continuação técnica S3–S7:** [registro de implementação, testes e dependências](PLANEJAMENTO_S3_S7_EVIDENCIAS.md). Domínio compartilhado e entradas legislativas não substituem ensaio próprio da Câmara; nenhuma caixa LEG é promovida por esse registro.

Para marcar cada caixa: registrar cenário legislativo, dados/exercício/UG/versão/data, perfil, rota `/camara/planejamento/*`, efeito persistido, saída emitida, testes relevantes e evidência da demonstração; requisitos com integração exigem prova de conexão real. Demonstrar também retorno/navegação dentro da Câmara e tentativa de acesso indevido a dados executivos.

**Estado inicial:** 0 itens com entrega integral comprovada nesta matriz; 49 bases parciais e 50 não evidenciados no diagnóstico original. Critério final **99 caixas concluídas**, independentemente do resultado da Prefeitura. Dependências externas serão pedidas em F9, conforme seção 8.2 do plano.
