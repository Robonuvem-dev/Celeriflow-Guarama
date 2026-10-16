# Planejamento e Orçamento e Segurança e Medicina do Trabalho

## Estrutura entregue

| Módulo | Código de acesso | Rota | Referência no checklist |
|---|---|---|---|
| Planejamento e Orçamento | `PLANEJAMENTO` | `/planejamento` | EXE-01 e LEG-01 |
| Segurança e Medicina do Trabalho | `SST` | `/sst` | EXE-10 |

Ambos possuem card independente, layout e painel próprios, registro em Configurações > Módulos e matriz de permissões em Configurações > Perfis. Ativação e acesso são independentes de Financeiro, RH, Saúde e Segurança e Mobilidade.

A migração `20261010140000_add_planning_sst_modules` registra os dois módulos ativos. Perfis granulares existentes continuam com suas permissões atuais; o administrador deve liberar os novos códigos explicitamente. O administrador técnico mantém seu acesso habitual. O cadastro de usuários continua recebendo os acessos do perfil selecionado.

## Mapeamento das dependências existentes

| Área examinada | Estrutura atual | Decisão nesta etapa |
|---|---|---|
| Financeiro — Planejamento | `/financeiro/orcamento/planejamento`, `planejamento-actions.ts`, `src/lib/financeiro/planejamento.ts` | Acesso integrado no novo painel; manter contratos das actions e RBAC financeiro até a transferência interna completa. |
| Instrumentos legais | `MultiYearPlan`, programas, ações, metas, `BudgetGuideline`, `AnnualBudgetLaw`, `PlanningAmendment` | Reutilizar a mesma base de PPA/LDO/LOA e histórico. |
| Execução orçamentária | `BudgetAppropriation`, reservas, `CreditRequest`, empenhos, receitas e contabilidade | Reutilizar as mesmas dotações e fontes; manter os fluxos de execução existentes. |
| Programação financeira | `MonthlyDisbursementSchedule`, `BimonthlyRevenueTarget` | Reutilizar os modelos na futura navegação própria de Planejamento. |
| Cadastros orçamentários | `/financeiro/orcamento/cadastros`, unidades gestoras, natureza da despesa e fontes | Acesso integrado; nenhuma duplicação de cadastros. |
| Tributário | Lançamentos, arrecadação, mapeamentos e integração financeira | Preservar serviços tributários; não há tela própria de PPA/LDO/LOA a transferir do Tributário. |
| Compras e contratos | `PurchasePlanning`, solicitações e processos com vínculos orçamentários | Planejamento de compras permanece em Compras; é uma jornada distinta do planejamento municipal. |
| Câmara | Instrumentos municipais e unidades gestoras compartilhados com a estrutura financeira | A futura transferência deve manter recortes por entidade/UG; nenhum novo acesso transversal é concedido nesta etapa. |
| RH | `Employee`, lotação e `Leave`; `/rh/servidores`, `/rh/licencas` | Acessos integrados no painel SST, mantendo o servidor canônico e as permissões de RH. |
| Saúde | Pacientes, `MedicalRecord`, solicitações de exames, laboratório, profissionais, agenda e vigilância | São fluxos assistenciais do SUS; não foram identificados ASO, PCMSO, PGR ou tabelas ocupacionais próprias a transferir. |
| Almoxarifado e Patrimônio | Materiais, estoques, movimentos e requisições | Reutilizar futuramente para EPI, com movimento real de estoque e autorização própria. |
| Administração/Cadastros | Pessoas, servidores, cargos, organograma e entidades canônicas | Referências compartilhadas para os novos módulos; não criar pessoas/servidores paralelos. |
| GED, auditoria e eSocial | Serviços transversais e evidências existentes | Reutilizar documentos, auditoria e conectores na implementação interna, sem representar prontuário assistencial como prontuário ocupacional. |

Os links de integração só são habilitados quando o perfil possui acesso ao módulo de origem e este está ativo. Acesso a `PLANEJAMENTO` não concede `FINANCEIRO`; acesso a `SST` não concede `RH` ou `SAUDE`. Cada destino continua validando suas próprias permissões e operações.

## Próxima etapa: transferência funcional

1. Extrair as consultas/componentes de planejamento para uma área compartilhada e criar telas próprias em `/planejamento`, mantendo as URLs financeiras antigas compatíveis.
2. Definir a autorização de cada action de planejamento e conferir todos os seus consumidores, incluindo créditos adicionais, dotações e execução financeira. Não trocar o retorno esperado pelos componentes clientes.
3. Auditar os requisitos oficiais de EXE-01/LEG-01 e EXE-10 antes de marcar cobertura funcional.
4. Implementar o domínio ocupacional associado a `Employee`/`Person`, com vigências, exposição a riscos, ASO/exames, programas/laudos, EPI, acidentes e eventos eSocial conforme o TR.
5. Manter controles clínicos e recortes por entidade/UG; o acesso ocupacional não deve liberar prontuários do SUS.

As áreas indicadas nos novos painéis são o escopo de evolução, não funcionalidades ocupacionais já implementadas.

## Plano detalhado de Planejamento e Orçamento

O documento [PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md](PLANO_IMPLEMENTACAO_PLANEJAMENTO_ORCAMENTO.md) compara os 99 requisitos de EXE-01 e os 99 de LEG-01 com o módulo novo, Financeiro e Tributação. Contém matriz integral, evidências, lacunas, fases de desenvolvimento, dependências e roteiro de demonstração por ente.

Diretriz de evolução: **100% funcional por ente**, com domínio/telas de planejamento no módulo novo, retirada das rotinas transferidas dos menus financeiros/tributários e conexão das integrações na etapa final. Foram iniciadas as jornadas `/planejamento/*` e **Câmara → Planejamento e Orçamento** em `/camara/planejamento/*`, com padrão ERP compartilhado e escopo legislativo explícito. A transferência integral, integrações e conclusão dos requisitos ainda estão em desenvolvimento.

Controles separados: [Prefeitura — EXE-01](PLANEJAMENTO_ORCAMENTO_PREFEITURA.md) e [Câmara — LEG-01](PLANEJAMENTO_ORCAMENTO_CAMARA.md), com 99 itens individuais em cada um.

Implementação iniciada: [EXECUCAO_PLANEJAMENTO_ORCAMENTO.md](EXECUCAO_PLANEJAMENTO_ORCAMENTO.md) registra as jornadas próprias, peças/cadastros/receitas/metas/audiências/importações já implementadas, migrations pendentes, dados municipais plausíveis, checks e trabalho restante para atingir 100%.

## Plano detalhado de SST

O documento [PLANO_IMPLEMENTACAO_SST.md](PLANO_IMPLEMENTACAO_SST.md) registra os 74 requisitos das páginas 86–96 do checklist, evidências de reaproveitamento, lacunas, etapas, integrações e padrão de listas com 20 registros sem rolagem interna da tabela.
