# P0 — EXE-04: Gestão e Controle de Custos

Ente: **PREFEITURA**. 31 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-04.1

**Fonte:** PDF p.40–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   cadastro   de   objeto   de   custo,   contendo   a
descrição,   descrição   detalhada   e   possibilidade   de
classificar hierarquicamente   os objetos para melhor
organização e compreensão dos mesmos.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Gap a conferir:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/classification-engine.ts:54; src/lib/financeiro/__tests__/financial-documents.test.ts:54; src/lib/financeiro/planejamento.ts:358; src/lib/financeiro/report-delivery.ts:139
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.1
- **Aceite esperado:** Cadastrar raiz/filhos e consultar hierarquia

## EXE-04.2

**Fonte:** PDF p.40–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir funcionalidade que agilize a inclusão de objetos
de   custo   hierarquicamente   inferiores   a   objetos   já
cadastrados, que na inclusão já demonstrem o objeto
de custos superior e a classificação hierárquica correta
do objeto de custos que está sendo incluído, sem a
necessidade de   o usuário   informar manualmente   a
classificação.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Gap a conferir:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/rh/payroll-configuration.ts:14; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:40; src/lib/financeiro/index.ts:10; src/lib/financeiro/yield-engine.ts:15
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.1
- **Aceite esperado:** Criar filho de objeto selecionado e conferir código/pai

## EXE-04.3

**Fonte:** PDF p.40–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir funcionalidade que gere automaticamente os
objetos de custo, na hierarquia do orçamento anual,
permitindo ao usuário escolher até que nível pretende
controlar   os   objetos   de   custo,   sendo   os   níveis
possíveis:   órgão,   unidade,   função,   sub   função,
programa e ação. Essa geração deve ser possível por
entidade e de forma consolidada objetivando agilidade
e rapidez no cadastro de objetos de custo.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Gap a conferir:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/lib/financeiro/planejamento.ts:7; src/lib/rh/workforce-service.ts:9; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.1
- **Aceite esperado:** Executar todos os seis níveis e recortes; repetir lote sem duplicar

## EXE-04.4

**Fonte:** PDF p.40–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir incluir níveis hierarquicamente inferiores em
objetos   de   custos   que   foram   gerados   de   forma
automática com base na Lei Orçamentária Anual.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Gap a conferir:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/lib/financeiro/report-print.ts:6; src/lib/financeiro/planejamento.ts:164; src/lib/financeiro/report-delivery.ts:55
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.1
- **Aceite esperado:** Detalhar objeto gerado preservando origem

## EXE-04.5

**Fonte:** PDF p.40–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao realizar a exclusão de um objeto de custos, todos os
objetos   de   custo   hierarquicamente   inferiores   a   ele
deverão ser também excluídos, mantendo a integridade
dos dados.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Gap a conferir:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:459; src/lib/patrimonio/asset-lifecycle.ts:81; src/lib/patrimonio/stock-service.ts:86; src/lib/rh/benefit-calculation.ts:13
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.1
- **Aceite esperado:** Excluir subárvore elegível sem órfãos

## EXE-04.6

**Fonte:** PDF p.40–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Validar para que a exclusão dos objetos de custos seja
permitida apenas se não tiverem item de custo em
movimentações relacionadas. Caso o objeto de custo
possua custos alocados ou itens de custo, o mesmo
não poderá ser excluído emitindo uma mensagem de
alerta para o usuário.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Gap a conferir:** NÃO ATENDE integralmente; construir sobre classificação LOA canônica, bloquear árvore usada e gerar sem duplicar
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:19; src/lib/financeiro/index.ts:10; src/lib/patrimonio/stock-service.ts:9; src/lib/rh/payroll-configuration.ts:30
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.1/F11.4
- **Aceite esperado:** Recusar nó/subárvore usados, inclusive em concorrência

## EXE-04.7

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O cadastro de itens de custo deve permitir informar no
mínimo itens com configuração de telefone, placas de
veículo e texto, bem como permitir o cadastro de novas
classificações que serão utilizadas para identificação
dos itens.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Gap a conferir:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/rh/payroll-configuration.ts:30; src/lib/rh/service-time-allowance.ts:11; src/lib/rh/workforce-service.ts:9
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.2
- **Aceite esperado:** Usar três padrões e classificação criada pelo usuário

## EXE-04.8

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de item de custos com no mínimo as
informações   de:   identificador,   descrição,   descrição
detalhada e deve identificar se o item é um custo fixo
ou variável.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Gap a conferir:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/rh/obligation-export.ts:10; src/lib/rh/payroll-configuration.ts:11; src/lib/rh/workforce-service.ts:9; src/lib/financeiro/classification-engine.ts:53
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.2
- **Aceite esperado:** Cadastro/alteração com todos os campos

## EXE-04.9

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de agregadores de custo. O cadastro
deve possuir a descrição e permitir incluir um ou mais
objetos de custo e o percentual. Se houver mais de um
objeto de custo, a soma dos percentuais não poderá
ultrapassar 100%.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Gap a conferir:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/planejamento.ts:17; src/lib/rh/workforce-service.ts:9; src/lib/financeiro/index.ts:105; src/lib/rh/benefit-calculation.ts:13
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.2
- **Aceite esperado:** Validar 100%, recusar 101% e explicitar resíduo

## EXE-04.10

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve disponibilizar itens de custo padrão,
para   serem   utilizados   pelo   usuário,   sem   que   haja
necessidade de digitação de itens de custo de forma
manual.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Gap a conferir:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/rh/payroll-configuration.ts:10; src/lib/financeiro/index.ts:10; src/lib/patrimonio/stock-service.ts:9; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:40
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.2
- **Aceite esperado:** Selecionar catálogo inicial disponível

## EXE-04.11

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   sistema   deve   ter as opções de   alterar,   ativar e
desativar o item de custos. Caso o item seja desativado,
o mesmo não poderá mais estar disponível para ser
utilizado.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Gap a conferir:** NÃO ATENDE integralmente; catálogo operacional e rateio conservando centavos/resíduo
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/planejamento.ts:7; src/lib/rh/workforce-service.ts:23; src/lib/financeiro/index.ts:105; src/lib/rh/credit-requests.ts:8
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.2
- **Aceite esperado:** Inativar e tentar usar por tela/action; histórico preservado

## EXE-04.12

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Relacionar os objetos de custo aos itens de custo
permitindo que um objeto de custo seja relacionado a
mais de um item de custo.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Gap a conferir:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:152; src/lib/rh/report-service.ts:16; src/lib/rh/workforce-service.ts:9; src/lib/financeiro/planejamento.ts:7
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.3
- **Aceite esperado:** Relações e consultas múltiplas persistidas

## EXE-04.13

**Fonte:** PDF p.41–41. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   importar   os   relacionamentos   de   objeto   de
custo x item de custo de Lei Orçamentária anterior,
inserindo automaticamente esses registros no sistema.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Gap a conferir:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/rh/workforce-service.ts:9; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:19; src/lib/financeiro/classification-engine.ts:53; src/lib/financeiro/index.ts:18
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.3
- **Aceite esperado:** Copiar exercício anterior, conferir mapeamento e replay

## EXE-04.14

**Fonte:** PDF p.41–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir o relacionamento dos objetos de custo e
itens   de   custo   com   as   dotações   do   orçamento.   O
relacionamento deve permitir selecionar vários objetos
de custo e itens a várias dotações.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Gap a conferir:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/planejamento.ts:17; src/lib/financeiro/report-print.ts:618; src/lib/patrimonio/asset-acquisition-service.ts:58
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.3
- **Aceite esperado:** Seleção múltipla e recusa de dotação de outro escopo

## EXE-04.15

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a configuração de quais entidade irão utilizar as
rotinas de apropriação de custos.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Gap a conferir:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:456; src/lib/rh/payroll-configuration.ts:255; src/lib/rh/poc-bootstrap.ts:14; src/lib/financeiro/planejamento.ts:106
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.0/F11.5
- **Aceite esperado:** Habilitar uma entidade e recusar operação na desabilitada

## EXE-04.16

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir configuração para apropriação de custos: na
liquidação, apropriar custos de folha de pagamento,
apropriar custos das movimentações do almoxarifado e
apropriar custos da movimentação do patrimônio.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Gap a conferir:** NÃO ATENDE integralmente; relações vigentes/precedência e cópia sem movimentos
- **Fases:** P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/report-print.ts:237; src/lib/patrimonio/stock-service.ts:62; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/lib/financeiro/index.ts:60
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.3/F11.5/F11.6
- **Aceite esperado:** Conferir gatilhos por entidade, vigência e origem

## EXE-04.17

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Realizar na liquidação do empenho a apropriação dos
custos conforme relacionamento dos itens de custos e
dotações. Caso haja mais itens de custo para uma
mesma dotação, o sistema deve permitir a distribuição
dos   valores   até   o   total   do   valor   que   está   sendo
liquidado. Se o usuário incluir valor maior o sistema
deve validar e não permitir a inclusão.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Gap a conferir:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/planejamento.ts:17; src/lib/financeiro/report-print.ts:55
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.4/F11.5
- **Aceite esperado:** Liquidação real com distribuição, excesso/concorrência/rollback

## EXE-04.18

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Impedir o estorno de liquidação com valor de custos já
apropriado. O sistema de custos deve ter integração
total, para que no momento da liquidação seja possível,
sem sair da tela de liquidação, incluir o estorno da
apropriação para garantir a integridade dos valores
apropriados.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Gap a conferir:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/lib/rh/workforce-service.ts:71; src/lib/financeiro/bank-integration-client.ts:44
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.4/F11.5
- **Aceite esperado:** Fluxo integrado na tela financeira sem sair dela e rollback

## EXE-04.19

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina para apropriação manual de custos em
itens de custos que não foram apropriados. Na consulta
dos valores só devem ser exibidos valores a apropriar.
Também deve ser possível estornar na mesma rotina
os valores apropriados e excluir o estorno.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Gap a conferir:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/patrimonio/stock-service.ts:74; src/lib/rh/workforce-service.ts:71
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.4
- **Aceite esperado:** Pendentes corretos; apropriar/estornar/desfazer com conservação e trilha

## EXE-04.20

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir nota de apropriação e de estorno de apropriação
de custos.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Gap a conferir:** NÃO ATENDE integralmente; lock da origem, saldo apropriável/estornável e transação conjunta
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/rh/payroll-provisions.ts:55; src/lib/rh/provision-commitment.ts:16; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:106
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.4/F11.7
- **Aceite esperado:** PDFs reais dos dois movimentos com origem e valores

## EXE-04.21

**Fonte:** PDF p.42–42. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Quando utilizada a rotina denominada “em liquidação”,
utilizada   na   de   verificação   de   materiais   o   sistema
deverá   realizar   nesse   momento   a   apropriação   dos
custos do material que estiver sendo verificado, caso
esse material não seja destinado ao estoque.

- **Diagnóstico da faixa:** Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente
- **Gap a conferir:** Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/patrimonio/stock-service.ts:16; src/lib/financeiro/report-print.ts:237; src/lib/patrimonio/__tests__/inventory-service.test.ts:20
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.5
- **Aceite esperado:** Comparar material estocável e consumo imediato; não duplicar na liquidação

## EXE-04.22

**Fonte:** PDF p.42–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao realizar a prestação de contas de recursos que
foram adiantados para fins de suprimento de fundos ou
mediante transferências voluntárias, no momento em
que o valor repassado for lançado como despesa, o
sistema deve realizar a apropriação do custo. Entende-
se como lançamento em despesa o momento em que é
feito   o   lançamento   contábil   em   conta   de   variação
patrimonial diminutiva.

- **Diagnóstico da faixa:** Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente
- **Gap a conferir:** Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/report-print.ts:95; src/lib/financeiro/classification-engine.ts:20; src/lib/financeiro/index.ts:25; src/lib/financeiro/relatorios-legais.ts:22
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.5
- **Aceite esperado:** Evento contábil VPD real, distinto do adiantamento/pagamento

## EXE-04.23

**Fonte:** PDF p.43–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a apropriação dos custos nos lançamentos
manuais quando os mesmos envolverem lançamentos
em variação patrimonial diminutiva.

- **Diagnóstico da faixa:** Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente
- **Gap a conferir:** Depende de reconhecer origem real em P3–P4; não apropriar entrada em estoque e consumo novamente
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/report-print.ts:465; src/lib/financeiro/report-delivery.ts:5; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:26; src/lib/financeiro/classification-engine.ts:137
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.5
- **Aceite esperado:** Escrituração real vinculada e estorno consistente

## EXE-04.24

**Fonte:** PDF p.43–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   configurar   os   objetos   de   custo   para   as
despesas de folha de pagamento por funcionário, por
funcionário e verba da folha de pagamento, só por
verba e por localização/centro de custo. Quando um
funcionário possuir mais de um contrato de trabalho
com o Município permitir a configuração por contrato de
trabalho.

- **Diagnóstico da faixa:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Gap a conferir:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/rh/report-service.ts:11; src/lib/rh/payroll-configuration.ts:30; src/lib/rh/poc-bootstrap.ts:7; src/lib/rh/workforce-service.ts:9
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.3/F11.6
- **Aceite esperado:** Exercitar cada critério e dois contratos da mesma pessoa

## EXE-04.25

**Fonte:** PDF p.43–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na liquidação dos empenhos de folha de pagamento,
realizar a apropriação dos custos, de forma automática.
Ainda que seja feita a liquidação simultânea de vários
empenhos de folha de pagamento, a apropriação deve
ser feita de forma automática, não devendo chamar a
rotina de apropriação.

- **Diagnóstico da faixa:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Gap a conferir:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/lib/rh/provision-commitment.ts:16; src/lib/rh/vacation-rights.ts:7
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.6
- **Aceite esperado:** Lote real, seleção automática, replay e rollback

## EXE-04.26

**Fonte:** PDF p.43–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao   integrar as movimentações de depreciação   dos
bens da entidade, o sistema deve realizar a apropriação
dos custos de forma automática. A apropriação deve
ser   feita   conforme   configuração   de   relacionamento
entre objeto de custos e bens patrimoniais.

- **Diagnóstico da faixa:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Gap a conferir:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/report-print.ts:6; src/lib/rh/poc-bootstrap.ts:7; src/lib/rh/workforce-service.ts:57
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.6
- **Aceite esperado:** Movimento patrimonial real, competência/mapeamento e reversão

## EXE-04.27

**Fonte:** PDF p.43–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na integração das movimentações do almoxarifado o
sistema   deve   realizar   a   apropriação   automática
conforme configuração entre objetos de custo, item e
produto, classe de produtos, subclasse e centros de
custo e localização.

- **Diagnóstico da faixa:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Gap a conferir:** Produtores parciais; integrar automação real/replay/reversão, sem apropriar bruto+líquido+retenção como três custos
- **Fases:** P4, P6. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/rh/workforce-service.ts:9; src/lib/patrimonio/stock-service.ts:31; src/lib/financeiro/bank-integration-client.ts:16; src/lib/financeiro/classification-engine.ts:38
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.6
- **Aceite esperado:** Todos os critérios, consumo valorizado real e estorno

## EXE-04.28

**Fonte:** PDF p.43–43. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório de controle de custos por entidade e
consolidado que permita filtrar por período da despesa
e   período   da   apropriação,   por   tipo   de   despesa,
demonstrando as despesas que já foram apropriadas e
que estão pendentes de apropriação.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Gap a conferir:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:392; src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/report-delivery.ts:107; src/lib/financeiro/report-print.ts:167
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.7
- **Aceite esperado:** Filtros independentes, acesso e valores reconciliados

## EXE-04.29

**Fonte:** PDF p.43–44. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   que   demonstre   as   despesas   que
foram   apropriadas   e   o   saldo   a   apropriar.   Deve
apresentar no final da impressão um totalizador por tipo
de despesa.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Gap a conferir:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/report-print.ts:7; src/lib/financeiro/index.ts:105; src/lib/financeiro/planejamento.ts:17; src/lib/financeiro/relatorios-legais.ts:289
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.7
- **Aceite esperado:** Conferir detalhes/saldos e totalizador no PDF

## EXE-04.30

**Fonte:** PDF p.44–44. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   gráfico   de   custo   por   objeto   de   custo.   O
indicador   deve   demonstrar   por   objeto,   o   valor
apropriado no período informado.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Gap a conferir:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/planejamento.ts:17; src/lib/rh/payroll-configuration.ts:11; src/lib/rh/workforce-service.ts:9
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.7
- **Aceite esperado:** Gráfico e detalhamento com mesmos filtros/valores

## EXE-04.31

**Fonte:** PDF p.44–44. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir gráfico que demonstre as apropriações por item
de custo. Deve ser possível filtrar por entidade e por
item de custo.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Gap a conferir:** NÃO ATENDE integralmente; mesma fonte canônica/filtro/totais no relatório e indicador Administração
- **Fases:** P6, P7. **Responsável funcional:** Contabilidade/Custos (pessoa a designar).
- **Fontes municipais:** 008, 053, 105, 133.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/patrimonio/stock-service.ts:31; src/lib/financeiro/planejamento.ts:7; src/lib/patrimonio/asset-lifecycle.ts:51
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F11.7
- **Aceite esperado:** Filtrar item/ente e reconciliar ao ledger
