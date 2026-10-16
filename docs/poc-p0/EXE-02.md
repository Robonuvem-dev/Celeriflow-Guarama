# P0 — EXE-02: Gestão Contábil e Financeira

Ente: **PREFEITURA**. 189 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-02.1

**Fonte:** PDF p.13–13. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Realizar escrituração contábil, absolutamente adaptada
às exigências do TCE, bem como à Lei Federal nº
4.320/1964, à Lei Complementar Federal nº 101/2000,
bem como às demais normas regulamentadoras da
escrituração pública.

- **Diagnóstico da faixa:** PARCIAL; motor financeiro e relatórios internos
- **Gap a conferir:** Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração
- **Fases:** P1, P2, P3, P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:57; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:39; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:59; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.2

**Fonte:** PDF p.13–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotinas de geração de arquivos para prestações
de   contas/envio   de   dados   para   diversos
órgãos/sistemas,   tais   como:   TCE-PR/SIM-AM;
FNDE/SIOPE;   FNS/SIOPS;   STN/MSC;   Receita
Federal/REINF;   bem   como   outros
arquivos/órgãos/sistemas   que   necessitem   de
informações contábeis.

- **Diagnóstico da faixa:** PARCIAL; motor financeiro e relatórios internos
- **Gap a conferir:** Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração
- **Fases:** P1, P2, P3, P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/index.ts:392; src/lib/financeiro/report-delivery.ts:59; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.3

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A   escrituração   contábil   deve   ser   completamente
vinculada   aos   registros   que   lhe   suportam,   não   se
admitindo, em nenhuma fase do processo, o registro
contábil   independente   dos   cadastros   que   lhe
originaram;

- **Diagnóstico da faixa:** PARCIAL; motor financeiro e relatórios internos
- **Gap a conferir:** Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração
- **Fases:** P1, P2, P3, P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/contas-bancarias/actions.ts:15
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.4

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   existência   de   mais   de   uma   unidade   na
mesma base de dados, com contabilização distinta, que
possibilite a emissão de relatórios anuais e da LRF de
forma consolidada;

- **Diagnóstico da faixa:** PARCIAL; motor financeiro e relatórios internos
- **Gap a conferir:** Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração
- **Fases:** P1, P2, P3, P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:53; src/lib/financeiro/report-delivery.ts:11; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:48
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.5

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   aos   atos   da   execução   orçamentária   e
financeira que sejam usadas as três fases da despesa:
empenho, liquidação e pagamento com a escrituração
contábil automática;

- **Diagnóstico da faixa:** PARCIAL; motor financeiro e relatórios internos
- **Gap a conferir:** Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração
- **Fases:** P1, P2, P3, P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:8; src/lib/financeiro/index.ts:4; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69; src/app/app-domain/financeiro/layout.tsx:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.6

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar operações orçamentárias e financeiras por
período, impedindo o usuário de qualquer alteração,
inclusão ou exclusão nos registros;

- **Diagnóstico da faixa:** PARCIAL; motor financeiro e relatórios internos
- **Gap a conferir:** Escopo, matriz pública e guardas em todas as origens; arquivos no layout oficial; fechamento impeditivo de alteração
- **Fases:** P1, P2, P3, P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/lib/financeiro/report-print.ts:474; src/lib/financeiro/planejamento.ts:21; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.7

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que seja efetuado o registro de empenhos por
estimativa, global e ordinário;

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/lib/financeiro/index.ts:494; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:169; src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:140
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.8

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que seja efetuado o registro de subempenho
sobre o empenho global e estimado. O sistema deve
permitir a liquidação tanto de empenhos globais como
de subempenhos, não permitindo que seja gerado um
subempenho sobre um empenho global que já possua
liquidação.

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/app/app-domain/financeiro/liquidacoes/actions.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.9

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Utilizar histórico padronizado e históricos com texto livre
no empenho;

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:216; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/lib/financeiro/classification-engine.ts:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.10

**Fonte:** PDF p.14–14. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir facilitador, para que na emissão do empenho
seja informada qualquer parte da dotação, e o sistema
filtre as dotações com aquela informação;

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/lib/financeiro/report-print.ts:148; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/app/app-domain/financeiro/empenhos/actions.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.11

**Fonte:** PDF p.14–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que no empenho possa visualizar saldo da
dotação atualizado até a data de emissão do empenho
e também até a data atual, não permitindo em nenhuma
das   duas   situações   que   o   valor   do   empenho   seja
superior ao saldo da dotação;

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/report-print.ts:19; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:81; src/app/app-domain/financeiro/orcamento/OrcamentoClient.tsx:95
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.12

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Fazer a distinção do contribuinte autônomo, objetivando
a geração da SEFIP e e-Social;

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:172; src/lib/financeiro/relatorios-legais.ts:559
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.13

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a duplicação do empenho, informando a data,
valor e o histórico. Os demais dados o sistema deve
gravar de forma automática conforme os dados do
empenho original, fazendo automaticamente a baixa do
saldo da dotação e os lançamentos contábeis;

- **Diagnóstico da faixa:** PARCIAL nos tipos; NÃO VERIFICADO nos demais subcritérios
- **Gap a conferir:** Subempenho com guardas de liquidação; histórico padronizado/livre; busca por qualquer dimensão; saldo na data e atual; identidade autônomo; cópia com nova reserva/partidas
- **Fases:** P3, P4, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:70
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.14

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Apropriar mês a mês despesas com assinaturas e
seguros.   Possuir   rotina   que   faça   a   apropriação
automática   dos   valores   com   seus   respectivos
lançamentos contábeis;

- **Diagnóstico da faixa:** PARCIAL na anulação; demais NÃO VERIFICADOS
- **Gap a conferir:** Competência e cronograma automático; contas de controle e baixa por prestação; nota de estorno e efeito líquido por origem
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:112; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:104; src/lib/financeiro/index.ts:106
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.15

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Inscrever as contas contábeis automaticamente nas
contas   de   controle   dos   empenhos   que   gerem
adiantamento   de   valores   e   o   lançamento   de   baixa
quando as prestações de contas;

- **Diagnóstico da faixa:** PARCIAL na anulação; demais NÃO VERIFICADOS
- **Gap a conferir:** Competência e cronograma automático; contas de controle e baixa por prestação; nota de estorno e efeito líquido por origem
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/layout.tsx:14; src/app/app-domain/financeiro/receitas/ReceitasClient.tsx:76
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.16

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Estorno   parcial ou   total de   empenho   informando   o
motivo da anulação, emitindo nota de estorno.

- **Diagnóstico da faixa:** PARCIAL na anulação; demais NÃO VERIFICADOS
- **Gap a conferir:** Competência e cronograma automático; contas de controle e baixa por prestação; nota de estorno e efeito líquido por origem
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/relatorios-legais.ts:106; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:169
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.17

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema de folha de pagamento deve ser totalmente
integrado ao sistema de contabilidade, permitindo a
geração automática de empenhos da folha. Deve ser
possível empenhar por tipo de folha (mensal, ferias, 13º
salário, etc).

- **Diagnóstico da faixa:** PARCIAL; ponte RH gera despesas e direitos
- **Gap a conferir:** Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/pagamentos/actions.ts:8; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.18

**Fonte:** PDF p.15–15. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

consulta dos empenhos da folha deverá demonstrar
possíveis irregularidades, como dotação sem saldo,
relacionamentos não cadastrados, etc, e não permitir
empenhar até que as irregularidades sejam resolvidas.

- **Diagnóstico da faixa:** PARCIAL; ponte RH gera despesas e direitos
- **Gap a conferir:** Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:242; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:113; src/lib/financeiro/index.ts:43; src/app/app-domain/financeiro/empenhos/actions.ts:107
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.19

**Fonte:** PDF p.15–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Integrar com a folha de pagamento para lançamento
das provisões de férias e de 13º salário, bem como de
seus encargos, fazendo a baixa dos valores quando do
pagamento;

- **Diagnóstico da faixa:** PARCIAL; ponte RH gera despesas e direitos
- **Gap a conferir:** Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:104; src/lib/financeiro/report-print.ts:260; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:177; src/app/app-domain/financeiro/layout.tsx:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.20

**Fonte:** PDF p.16–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   liquidar   automaticamente   os   empenhos   da
folha,   gerando   automaticamente   as   notas
extraorçamentárias das retenções.

- **Diagnóstico da faixa:** PARCIAL; ponte RH gera despesas e direitos
- **Gap a conferir:** Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:163; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:169; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:217; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:202
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.21

**Fonte:** PDF p.16–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir desmovimentar uma   competência   da folha,
estornando   os   empenhos   para   nova   geração.   O
sistema deverá consistir na desmovimentação, e não
permiti-la caso os empenhos estejam liquidados ou
pagos.

- **Diagnóstico da faixa:** PARCIAL; ponte RH gera despesas e direitos
- **Gap a conferir:** Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:712; src/app/app-domain/financeiro/liquidacoes/actions.ts:146; src/lib/financeiro/relatorios-legais.ts:559; src/app/app-domain/financeiro/automacoes/page.tsx:49
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.22

**Fonte:** PDF p.16–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   fluxo   de   empenhamento   da   folha   de
pagamento, que inicie com a liberação da folha na área
de recursos humanos e finalize o processo somente
quando todos os empenhos da folha forem pagos e que
todo o processo seja feito de forma digital;

- **Diagnóstico da faixa:** PARCIAL; ponte RH gera despesas e direitos
- **Gap a conferir:** Completar lote originado da folha, prévia bloqueante, contabilidade de provisões, liquidação automática e extras; recusar desmovimentar já liquidado/pago; acompanhar todos os pagamentos
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:5; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:5; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.23

**Fonte:** PDF p.16–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir total integração com o sistema de compras e
licitações, permitindo empenhar automaticamente as
ordens de compras emitidas pelo sistema de compras
e licitações. A integração deverá ser de forma que o
item a ser adquirido (material ou serviço) seja vinculado
ao   desdobramento   da   despesa,   não   permitindo   a
vinculação   no   mesmo   empenho   de   itens   com
desdobramentos   de   despesa   diferentes.   Permitir   a
contabilização por centro de custos.   Permitir consultar
a partir da ordem a ser empenhada, a ordem completa,
o contrato e a licitação;

- **Diagnóstico da faixa:** PARCIAL; recebimento aprovado → despesa/reserva/empenho
- **Gap a conferir:** Cobrir requisição/ordem antes do recebimento quando exigido; contrato/licitação acessíveis; agrupamento por desdobramento e centro; baixa da reserva e devolução dos itens
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:5; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:17; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.24

**Fonte:** PDF p.16–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de contratos único, ou seja, ao ser
cadastrado   o   contrato,   ele   fica   disponível   para   ser
utilizado em todas as rotinas da contabilidade, sem
necessidade de alteração de sistema ou entidade;

- **Diagnóstico da faixa:** PARCIAL; recebimento aprovado → despesa/reserva/empenho
- **Gap a conferir:** Cobrir requisição/ordem antes do recebimento quando exigido; contrato/licitação acessíveis; agrupamento por desdobramento e centro; baixa da reserva e devolução dos itens
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:193; src/lib/financeiro/planejamento.ts:63; src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:140
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.25

**Fonte:** PDF p.16–16. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar   automaticamente   o   bloqueio   de   dotação
orçamentária, quando da emissão de requisição de
compras e ordem de compras, devendo o mesmo ser
baixado   automaticamente   quando   da   emissão   do
empenho;

- **Diagnóstico da faixa:** PARCIAL; recebimento aprovado → despesa/reserva/empenho
- **Gap a conferir:** Cobrir requisição/ordem antes do recebimento quando exigido; contrato/licitação acessíveis; agrupamento por desdobramento e centro; baixa da reserva e devolução dos itens
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/lib/financeiro/report-print.ts:148; src/app/app-domain/financeiro/empenhos/actions.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.26

**Fonte:** PDF p.16–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Estornar os itens da ordem de compras quando o
empenho for estornado, mantendo assim a integridade
das informações;

- **Diagnóstico da faixa:** PARCIAL; recebimento aprovado → despesa/reserva/empenho
- **Gap a conferir:** Cobrir requisição/ordem antes do recebimento quando exigido; contrato/licitação acessíveis; agrupamento por desdobramento e centro; baixa da reserva e devolução dos itens
- **Fases:** P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/app/app-domain/financeiro/pagamentos/actions.ts:15
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.27

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   consulta   inter-relacionada   de   empenhos.   A
partir do empenho, consultar a ordem de compras, o
contrato,   a   licitação,   as   liquidações,   estorno   de
liquidações,   retenções,   pagamentos,   estorno   de
pagamentos,   nota   de   despesa   extraorçamentária,
processo digital, anexos relacionados ao empenho, os
assinantes da nota de empenho e os lançamentos
contábeis;

- **Diagnóstico da faixa:** PARCIAL; vínculos e acompanhamento RP
- **Gap a conferir:** Detalhe navegável de todos os fatos, anexos/processo/assinantes/partidas; cancelamento com saldo e evento contábil
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:3; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:20; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/report-print.ts:148
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.28

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir consulta inter-relacionada de restos. A partir do
empenho, consultar a ordem de compras, o contrato, a
licitação,   as   liquidações,   estorno   de   liquidações,
retenções, pagamentos, estorno de pagamentos, nota
de despesa extraorçamentária, processo digital, anexos
relacionados ao empenho, os assinantes da nota de
empenhe os lançamentos contábeis;

- **Diagnóstico da faixa:** PARCIAL; vínculos e acompanhamento RP
- **Gap a conferir:** Detalhe navegável de todos os fatos, anexos/processo/assinantes/partidas; cancelamento com saldo e evento contábil
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:3; src/lib/financeiro/report-print.ts:148; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:20; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.29

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cancelar restos a pagar demonstrando no momento do
cancelamento o valor processado e não processado;

- **Diagnóstico da faixa:** PARCIAL; vínculos e acompanhamento RP
- **Gap a conferir:** Detalhe navegável de todos os fatos, anexos/processo/assinantes/partidas; cancelamento com saldo e evento contábil
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/app/app-domain/financeiro/restos-a-pagar/RestosAPagarClient.tsx:23; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:46; src/lib/financeiro/report-delivery.ts:172
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.30

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerar automaticamente   as notas de   despesa   extra
orçamentárias para as retenções que são passíveis de
recolhimento na liquidação do empenho da despesa;

- **Diagnóstico da faixa:** PARCIAL; `createSettlement` aceita documento e retenções
- **Gap a conferir:** Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:148; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/index.ts:3; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:147
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.31

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Informar na liquidação do empenho, se o valor liquidado
era uma despesa sem empenho prévio;

- **Diagnóstico da faixa:** PARCIAL; `createSettlement` aceita documento e retenções
- **Gap a conferir:** Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:22; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:151; src/lib/financeiro/report-print.ts:148; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:147
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.32

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Informar   um   ou   vários   documentos   fiscais   na
liquidação, com controle de pessoa estrangeira;

- **Diagnóstico da faixa:** PARCIAL; `createSettlement` aceita documento e retenções
- **Gap a conferir:** Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:211; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:151; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.33

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Validar na liquidação documento fiscal duplicado para
mesmo fornecedor mediante configuração;

- **Diagnóstico da faixa:** PARCIAL; `createSettlement` aceita documento e retenções
- **Gap a conferir:** Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:30; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/liquidacoes/actions.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.34

**Fonte:** PDF p.17–17. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir estorno total ou parcial, do saldo da liquidação,
podendo   fazer   a   substituição   ou   alteração   dos
documentos fiscais;

- **Diagnóstico da faixa:** PARCIAL; `createSettlement` aceita documento e retenções
- **Gap a conferir:** Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/report-print.ts:6; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:151
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.35

**Fonte:** PDF p.17–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a inclusão de itens na liquidação. A rotina deve
ter   a   opção   de   carregar   os   itens   do   empenho   ou
informá-los diretamente na liquidação;

- **Diagnóstico da faixa:** PARCIAL; `createSettlement` aceita documento e retenções
- **Gap a conferir:** Modelar coleção de documentos/itens e opções exigidas; regra configurável de duplicidade; distinguir retenção de nota extra recolhível; reversão parcial sem perder atesto
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/__tests__/financial-documents.test.ts:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.36

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir na liquidação ao informar no documento fiscal
uma nota Danfe-e a consulta da nota no site da Receita
Federal;

- **Diagnóstico da faixa:** PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS
- **Gap a conferir:** Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP
- **Fases:** P2, P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/lib/financeiro/index.ts:60; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:30
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.37

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar automaticamente os lançamentos contábeis na
emissão e estorno de empenho, liquidação e estorno de
liquidação e cancelamento de restos;

- **Diagnóstico da faixa:** PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS
- **Gap a conferir:** Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP
- **Fases:** P2, P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:147
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.38

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir   documentos   digitalizados,   nas   rotinas   de
empenho, restos a pagar e liquidação;

- **Diagnóstico da faixa:** PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS
- **Gap a conferir:** Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP
- **Fases:** P2, P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/layout.tsx:14; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.39

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Validar existência de débitos com o credor nas rotinas
de emissão do empenho, liquidação e pagamento;

- **Diagnóstico da faixa:** PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS
- **Gap a conferir:** Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP
- **Fases:** P2, P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/report-print.ts:148; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:151
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.40

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consistir a data de vigência e o saldo do contrato na
emissão de empenhos relacionado a contratos;

- **Diagnóstico da faixa:** PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS
- **Gap a conferir:** Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP
- **Fases:** P2, P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:222; src/lib/financeiro/index.ts:59; src/app/app-domain/financeiro/empenhos/actions.ts:67; src/app/app-domain/financeiro/liquidacoes/actions.ts:76
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.41

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consistir em vigência do processo licitatório durante a
emissão de empenhos relacionados a licitações;

- **Diagnóstico da faixa:** PARCIAL em GED/contrato/partidas; demais NÃO VERIFICADOS
- **Gap a conferir:** Dívida canônica nos três estágios; vigência real de licitação; consulta fiscal externa ao final; completar cancelamento de RP
- **Fases:** P2, P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:481; src/app/app-domain/financeiro/empenhos/actions.ts:75; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:71; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:222
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.42

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina para informar valores em liquidação. A
rotina deve permitir informar se o valor será lançado em
conta de ativo ou VPD, e deve possibilitar a informação
dos itens da nota, realizando os lançamentos contábeis
de forma automática;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo completo; orçamento/Frotas reutilizáveis
- **Gap a conferir:** Reconhecimento intermediário contábil, material em verificação e relatório; bloqueio/desbloqueio com partidas e critérios; multa/infrator/controles da origem
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:14; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.43

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório de empenhos e restos com a situação
“em liquidação”. O relatório deve possibilitar a listagem
de empenhos e restos com verificação de materiais e
os empenhos e restos que por sua natureza possuem
lançamentos em contas orçamentárias “em liquidação”;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo completo; orçamento/Frotas reutilizáveis
- **Gap a conferir:** Reconhecimento intermediário contábil, material em verificação e relatório; bloqueio/desbloqueio com partidas e critérios; multa/infrator/controles da origem
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/lib/financeiro/report-print.ts:181; src/lib/financeiro/report-delivery.ts:59; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:152
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.44

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Bloquear   e   desbloquear   dotações   por   valor   e   por
percentual,   efetuando   os   respectivos   lançamentos
contábeis;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo completo; orçamento/Frotas reutilizáveis
- **Gap a conferir:** Reconhecimento intermediário contábil, material em verificação e relatório; bloqueio/desbloqueio com partidas e critérios; multa/infrator/controles da origem
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/reconciliation-engine.ts:6; src/lib/financeiro/report-print.ts:174; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.45

**Fonte:** PDF p.18–18. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar bloqueios de dotação por tipo de modalidade
de licitação e a consulta dos bloqueios que visam a
limitação de empenho;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo completo; orçamento/Frotas reutilizáveis
- **Gap a conferir:** Reconhecimento intermediário contábil, material em verificação e relatório; bloqueio/desbloqueio com partidas e critérios; multa/infrator/controles da origem
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:73; src/app/app-domain/financeiro/orcamento/actions.ts:37; src/app/app-domain/financeiro/orcamento/CreditRequestDialog.tsx:104
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.46

**Fonte:** PDF p.18–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerenciar multas de trânsito, identificando o infrator, o
valor da multa, bem como os lançamentos de controle;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo completo; orçamento/Frotas reutilizáveis
- **Gap a conferir:** Reconhecimento intermediário contábil, material em verificação e relatório; bloqueio/desbloqueio com partidas e critérios; multa/infrator/controles da origem
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:172; src/lib/financeiro/index.ts:31; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:299; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:61
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.47

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   fluxo   de   assinatura   digital   de   empenhos,
liquidação e pagamento, controlando para que todos os
assinantes possam assinar digitalmente;

- **Diagnóstico da faixa:** PARCIAL em documentos/origens; superávit/SEFAZ NÃO VERIFICADOS
- **Gap a conferir:** Fluxo de todos os assinantes; razão de movimentos; superávit/suplementado/saldo por fonte e ente; conector SEFAZ ao final
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/lib/financeiro/index.ts:60; src/lib/financeiro/report-print.ts:237; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:163
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.48

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta da razão do empenho, demonstrando
as movimentações por ordem cronológica e permitir
que em cada movimentação se possa acessar a rotina
que lhe deu origem;

- **Diagnóstico da faixa:** PARCIAL em documentos/origens; superávit/SEFAZ NÃO VERIFICADOS
- **Gap a conferir:** Fluxo de todos os assinantes; razão de movimentos; superávit/suplementado/saldo por fonte e ente; conector SEFAZ ao final
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:148; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:105; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:147
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.49

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta de superavit financeiro que demonstre
o valor do superavit, os valores já suplementados e o
saldo a suplementar. A consulta deve ser feita por
entidade e consolidada;

- **Diagnóstico da faixa:** PARCIAL em documentos/origens; superávit/SEFAZ NÃO VERIFICADOS
- **Gap a conferir:** Fluxo de todos os assinantes; razão de movimentos; superávit/suplementado/saldo por fonte e ente; conector SEFAZ ao final
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/planejamento.ts:6; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176; src/lib/financeiro/report-print.ts:174
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.50

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta integrada à SEFAZ para busca de
notas fiscais eletrônicas emitidas contra a entidade. Na
consulta, deve ser possível visualizar a nota emitida
diretamente no site da Receita Federal;

- **Diagnóstico da faixa:** PARCIAL em documentos/origens; superávit/SEFAZ NÃO VERIFICADOS
- **Gap a conferir:** Fluxo de todos os assinantes; razão de movimentos; superávit/suplementado/saldo por fonte e ente; conector SEFAZ ao final
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30; src/lib/financeiro/index.ts:24; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:169; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.51

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro das obras do Município. O cadastro
deve   permitir   informar   os   dados   da   obra,   sua
localização, tipo da obra a ser realizada, conta de
incorporação, valor, contrato e licitação;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:46; src/app/app-domain/financeiro/orcamento/OrcamentoClient.tsx:115; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.52

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar consultar os empenhos relacionados a cada
obra cadastrada;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:130; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:119; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:104; src/app/app-domain/financeiro/empenhos/actions.ts:98
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.53

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   uma   consulta   integradas   das   obras,   onde
selecionando   determinada   obra,   o   sistema   permita
consultar seus dados de cadastro, contratos/aditivos,
licitação e empenhos relacionados. Deve permitir incluir
anexos, informar a situação da obra e as medições;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/empenhos/actions.ts:67; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.54

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A consulta das obras deve demonstrar o valor da obra,
valor contratado, valor já empenhado e o percentual
executado;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/planejamento.ts:17; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:46; src/lib/financeiro/index.ts:31; src/lib/financeiro/__tests__/financial-documents.test.ts:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.55

**Fonte:** PDF p.19–19. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar que o cadastro da obra seja disponibilizado
no portal de transparência do Município, demonstrando
todos os dados de cadastro, anexos e valores;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:15; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:46; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:104; src/lib/financeiro/bank-integration-client.ts:192
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.56

**Fonte:** PDF p.19–20. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório analítico que detalhe as dotações e
sua   movimentação   com   possibilidade   de   filtrar   por
qualquer   campo   da   dotação   e   de   considerar   as
reservas de dotação;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/orcamento/OrcamentoClient.tsx:95; src/lib/financeiro/index.ts:43; src/lib/financeiro/report-print.ts:180; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:153
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.57

**Fonte:** PDF p.20–20. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório de bens demonstrando os bens que
foram e não foram incorporados. Permitir a emissão
consolidada, filtrando por qualquer campo da dotação e
filtrar   pelo   tipo   do   bem,   conta   contábil   e   data   de
incorporação. O relatório deve demonstrar ainda os
bens   que   estão   a   incorporar   listando   o   respectivo
empenho;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/lib/financeiro/report-print.ts:19; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:73; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.58

**Fonte:** PDF p.20–20. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatórios de empenhos e restos por entidade ou
consolidado, possuindo filtros compostos por todos os
campos da dotação. Possuir opção filtro por credor,
obra,   licitação   e   possibilitar   totalizar   por   todos   os
campos da dotação com opção de listar ou não os
empenhos e restos;

- **Diagnóstico da faixa:** PARCIAL em vínculo obra/empenho; saídas integrais NÃO VERIFICADAS
- **Gap a conferir:** Conta de incorporação, contratos/aditivos/licitação, valores/percentual executado; bens incorporados/a incorporar por empenho; todos os filtros/totalizações
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:46; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:27; src/lib/financeiro/report-delivery.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.59

**Fonte:** PDF p.20–21. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatórios de execução da LOA com publicação
simultânea no portal da transparência:
Anexo   01   –   Demonstrativo   Rec.   e   Desp.   Cat.
Econômica;
Alínea 1 – Receita (fonte) despesa (função);
Anexo 2 - Desp. Cat. Econômica (elemento);
Anexo 2 - Desp. Cat. Econômica (ação);
Anexo 2 - Desp. Cat. Econômica (órgão);
Anexo 2 - Desp. Cat. Econômica (org. unidade);
Anexo   2   –   Desp,   por   Unidade   Orç.   Seg.   Cat.
Econômica;
Anexo 6 – Programa de trabalho por órgão e unidade;
Anexo 7 – Prog. De trabalho (Func./Sub./Pro./Ativ.);
Anexo 8 – Desp. Por função/Sub/prog e vínculo e
Anexo 9 – Despesa por órgão e função;

- **Diagnóstico da faixa:** PARCIAL; datasets internos e Planejamento
- **Gap a conferir:** Cada anexo e alínea do PDF, com mesma classificação/corte; amortização, ata, metas nominal/primária, pessoal, receita/despesa, arrecadação/desembolso, transferências, investimentos, suprimentos à Câmara, saúde/educação/renúncia
- **Fases:** P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:11; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:18; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.60

**Fonte:** PDF p.21–21. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatórios   com   gráficos   comparativos,   para
apresentação em audiências públicas:
a)   a) Amortização da dívida;
b) Ata da Audiência Pública;
c) Avaliação das Metas de Resultado Nominal;
d) Avaliação das Metas de Resultado primário;
e) Avaliação dos Gastos com pessoal;
f) Comparativo da Receita e Despesa;
g) Avaliação das Metas de Arrecadação;
h) Confronto Arrecadação e Desembolso;
i) Demonstrativo das Transferências financeiras;
j) Demonstrativo das metas de investimento;
k) Demonstrativo dos Suprimentos as Câmara;
l) Indicadores de Gastos com Saúde;
m) Indicadores de Gastos com Educação e Renúncia
de Receita;

- **Diagnóstico da faixa:** PARCIAL; datasets internos e Planejamento
- **Gap a conferir:** Cada anexo e alínea do PDF, com mesma classificação/corte; amortização, ata, metas nominal/primária, pessoal, receita/despesa, arrecadação/desembolso, transferências, investimentos, suprimentos à Câmara, saúde/educação/renúncia
- **Fases:** P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:11; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:59; src/lib/financeiro/planejamento.ts:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.61

**Fonte:** PDF p.21–21. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   solicitação   de   diárias   e   adiantamentos
integradas a fluxo de processo. O fluxo deve possibilitar
a   sua   configuração   conforme   a   necessidade   da
entidade. Deve ser possível o cadastro de roteiros para
que a solicitação seja tramitada para os responsáveis
pela liberação e que seja feita a emissão do empenho
de forma automática no final do processo;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo integral; processos/RH/GED disponíveis
- **Gap a conferir:** Solicitação, aprovação por roteiro, autorização, empenho automático, concessão, prestação/restituição e partidas vinculadas
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:5; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.62

**Fonte:** PDF p.21–21. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   prestação   de   contas   de   diária,   e
adiantamentos,   fazendo   os   lançamentos   contábeis
automáticos tanto na concessão quanto na prestação
de contas;

- **Diagnóstico da faixa:** NÃO VERIFICADO no fluxo integral; processos/RH/GED disponíveis
- **Gap a conferir:** Solicitação, aprovação por roteiro, autorização, empenho automático, concessão, prestação/restituição e partidas vinculadas
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/lib/financeiro/index.ts:106; src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/report-delivery.ts:59
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.63

**Fonte:** PDF p.21–22. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   rotina   de   Prestação   de   contas   online,   que
possibilite   a   prestação   de   contas   das   entidades
beneficiadas com recursos, ou dos adiantamentos de
recursos, mediante cadastro de usuário e senha, para
acesso   a   rotina   no   Município.   As   entidades
beneficiadas   podem   realizar   de   forma   online   a
prestação de contas de qualquer lugar com acesso à
internet;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:62; src/lib/financeiro/bank-integration-client.ts:35; src/lib/financeiro/relatorios-legais.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.64

**Fonte:** PDF p.22–22. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A   rotina   de   prestação   de   contas   online,   deve
demonstrar   os   valores   passiveis   de   prestação   de
contas da entidade logada e permitir a inclusão dos
documentos fiscais digitalizados, bem como de outros
anexos.

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/report-print.ts:6; src/lib/financeiro/report-delivery.ts:59; src/lib/financeiro/classification-engine.ts:153
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.65

**Fonte:** PDF p.22–22. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Todas as informações inseridas de forma online, ficam
disponíveis para serem analisadas pelo Município e
caso haja alguma discrepância nas informações, deve
haver possibilidade de solicitação de revisão, também
online;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/index.ts:105; src/lib/financeiro/planejamento.ts:17; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.66

**Fonte:** PDF p.22–22. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve permitir a aprovação e conclusão das
prestações de contas feitas de forma online. Ao realizar
a   conclusão,   o   sistema   gera   automaticamente   os
lançamentos contábeis;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/lib/financeiro/index.ts:105; src/lib/financeiro/report-delivery.ts:59; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.67

**Fonte:** PDF p.22–22. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve possuir um cadastro de convênios de
repasse que permita a vinculação dos mesmos aos
empenhos correspondentes de forma automática. No
cadastro, devem ser informadas as contas que serão
utilizadas para a movimentação do convênio, sendo
que   na   movimentação   (empenhos,   liquidações,
pagamentos e prestação de contas), as contas não
sejam   mais   requeridas,   resultando   em   agilidade   e
redução de erros de lançamentos;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.68

**Fonte:** PDF p.22–22. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   ser   possível   incluir   anexos   no   cadastro   de
convênios de repasse, bem como realizar a consulta
dos empenhos relacionados a ele;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/pagamentos/actions.ts:8; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.69

**Fonte:** PDF p.22–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve possuir rotina para prestação de contas
dos convênios de repasse realizando os lançamentos
contábeis de forma automática;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/lib/financeiro/index.ts:105; src/lib/financeiro/report-delivery.ts:59
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.70

**Fonte:** PDF p.23–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir controle das prestações de contas em atraso
demonstrando através de consulta o responsável pela
prestação   de   contas,   a   data   limite,   o   prazo   para
prestação e a situação (prazo normal, prazo próximo ao
limite, prazo expirado);

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:20; src/lib/financeiro/index.ts:59; src/lib/financeiro/relatorios-legais.ts:340; src/lib/financeiro/planejamento.ts:50
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.71

**Fonte:** PDF p.23–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   configuração   para   controle   de   prazo   de
prestação de contas, não permitindo que se façam
novos adiantamentos a beneficiários com prestação de
contas em atraso;

- **Diagnóstico da faixa:** PARCIAL em `Covenant`/vínculo empenho; ciclo online NÃO VERIFICADO
- **Gap a conferir:** Portal restrito ao beneficiário, revisão online, conclusão contábil, conta herdada do instrumento, prazos e impedimento de novo adiantamento
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:59; src/lib/financeiro/classification-engine.ts:134; src/lib/financeiro/relatorios-legais.ts:389; src/lib/financeiro/report-print.ts:457
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.72

**Fonte:** PDF p.23–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Utilizar   rotina   de   eventos   para   todas   as   rotinas
existentes no sistema, permitindo a visualização dos
lançamentos contábeis efetuados, trazendo histórico
padrão para cada evento utilizado; A rotina de eventos
cadastrados   deve   ficar   disponível   para   consulta,
permitindo que o usuário possa verificar para cada
transação os lançamentos que serão efetuados;

- **Diagnóstico da faixa:** PARCIAL; eventos, retenções, documentos
- **Gap a conferir:** Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:40; src/lib/financeiro/classification-engine.ts:27; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.73

**Fonte:** PDF p.23–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar para que as contas contábeis só recebam
lançamentos   no   último   nível   de   desdobramento   do
Plano de Contas;

- **Diagnóstico da faixa:** PARCIAL; eventos, retenções, documentos
- **Gap a conferir:** Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/lib/financeiro/index.ts:106; src/lib/financeiro/report-print.ts:457; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:62
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.74

**Fonte:** PDF p.23–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar escrituração contábil nos sistemas patrimonial,
orçamentário e de controle em partidas dobradas, em
conformidade com os art. 83 a 106 da Lei 4.320/64,
inclusive com registro em livro diário;

- **Diagnóstico da faixa:** PARCIAL; eventos, retenções, documentos
- **Gap a conferir:** Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/report-delivery.ts:4; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:25; src/lib/financeiro/report-print.ts:114
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.75

**Fonte:** PDF p.23–23. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de Despesas extraorçamentárias, de
modo a emitir um documento para recolhimento dos
valores retidos dos credores. Este cadastro deve ter
consistência com os parâmetros do TCE, exigindo um
empenho de origem, se a rubrica assim o exigir.

- **Diagnóstico da faixa:** PARCIAL; eventos, retenções, documentos
- **Gap a conferir:** Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/index.ts:60; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:147
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.76

**Fonte:** PDF p.23–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerenciar notas de despesas extraorçamentárias e dos
seus   estornos;   No   gerenciador   deve   ser   possível
visualizar as notas extras manuais ou originárias de
empenhos e receitas extras. No gerenciador deve ser
possível efetuar e consultar dados do pagamento das
extras, bem como seus lançamentos contábeis;

- **Diagnóstico da faixa:** PARCIAL; eventos, retenções, documentos
- **Gap a conferir:** Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:99; src/lib/financeiro/index.ts:60; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34; src/lib/financeiro/relatorios-legais.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.77

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   assinar   digitalmente   as   notas
extraorçamentárias;

- **Diagnóstico da faixa:** PARCIAL; eventos, retenções, documentos
- **Gap a conferir:** Matriz versionada e consulta antes da operação; somente último nível; extras manuais/originadas/receitas com contas e exigência de empenho; gerenciamento completo e assinatura
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/relatorios-legais.ts:463; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:174; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:169; src/lib/financeiro/report-delivery.ts:322
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.78

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de consórcios. No cadastro deverão
ser informados os dados do consórcio e sua área de
atuação. Deve ser possível realizar a prestação de
contas com seus respectivos lançamentos contábeis,
incluir anexos e consultar os empenhos relacionados ao
consórcio.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente
- **Gap a conferir:** Cadastros, anexos, movimentações, vínculos e lançamentos simultâneos; relatório saldo inicial/movimentos/final; baixa informada pelo TJ sem criar API não exigida
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.79

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de precatórios. No cadastro deve ser
possível informar o   tipo de precatório,   sua   origem,
beneficiário e a respectiva dotação orçamentária;

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente
- **Gap a conferir:** Cadastros, anexos, movimentações, vínculos e lançamentos simultâneos; relatório saldo inicial/movimentos/final; baixa informada pelo TJ sem criar API não exigida
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/lib/financeiro/report-print.ts:167; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:73; src/app/app-domain/financeiro/orcamento/actions.ts:26
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.80

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   ser   possível   realizar   movimentações   de
acréscimo de juros, cancelamentos e baixa dos valores
pagos pelo TJ, se precatório de emenda especial. O
sistema   deve   fazer   os   lançamentos   contábeis   das
movimentações de forma simultânea ao registro;

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente
- **Gap a conferir:** Cadastros, anexos, movimentações, vínculos e lançamentos simultâneos; relatório saldo inicial/movimentos/final; baixa informada pelo TJ sem criar API não exigida
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.81

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível consultar os empenhos relacionados
aos precatórios, ao selecionar o precatório cadastrado;

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente
- **Gap a conferir:** Cadastros, anexos, movimentações, vínculos e lançamentos simultâneos; relatório saldo inicial/movimentos/final; baixa informada pelo TJ sem criar API não exigida
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/pagamentos/actions.ts:8; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42; src/app/app-domain/financeiro/contas-bancarias/actions.ts:15
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.82

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório das movimentações dos precatórios,
demonstrando o saldo inicial, as movimentações e o
saldo atual;

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente
- **Gap a conferir:** Cadastros, anexos, movimentações, vínculos e lançamentos simultâneos; relatório saldo inicial/movimentos/final; baixa informada pelo TJ sem criar API não exigida
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:218; src/lib/financeiro/report-print.ts:464; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:269; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:366
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.83

**Fonte:** PDF p.24–24. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastramento e incorporações posteriores
(correção   monetária,   juros,   encargos)   de   todas   as
Dívidas Fundadas com todos os campos exigidos pelo
TCE. Também deve gravar em seu cadastro, para fins
gerenciais, um histórico da movimentação das dívidas,
a informação do número de parcelas da dívida e o
comparativo anual entre o previsto e o realizado dos
valores;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/bank-integration-client.ts:7; src/lib/financeiro/index.ts:105; src/lib/financeiro/planejamento.ts:17; src/lib/financeiro/report-print.ts:95
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.84

**Fonte:** PDF p.24–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve possuir um cadastro das dívidas do
Município, que permita a vinculação das mesmas aos
empenhos correspondentes de forma automática. No
cadastro, devem ser informadas as contas que serão
utilizadas para a movimentação da dívida, sendo que
na   movimentação   (empenhos,   liquidações   e
pagamentos) as contas não sejam mais requeridas,
resultando   em   agilidade   e   redução   de   erros   de
lançamentos;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30; src/app/app-domain/financeiro/layout.tsx:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.85

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir informar as parcelas da dívida, realizando o
comparativo entre os valores informados e os valores
efetivamente pagos;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:185; src/lib/financeiro/index.ts:184; src/lib/financeiro/planejamento.ts:533; src/app/app-domain/financeiro/contas-bancarias/TreasuryTransferSection.tsx:66
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.86

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   incluir   para   as   dívidas   cadastradas,   as
movimentações que lhes são pertinentes: atualizações,
cancelamentos, correções, transferência de longo para
curto prazo, realizando os lançamentos contábeis de
forma automática;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:20; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.87

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório gerencial de uma dívida especifica e
de todas as dívidas fundadas;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:329; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:92; src/lib/financeiro/classification-engine.ts:119; src/lib/financeiro/index.ts:710
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.88

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro das Parcerias Públicos Privadas que
o poder público tem firmadas com outros entes públicos
ou privados. O cadastro deve ter no mínimo o tipo da
parceria, a situação, a empresa parceira, objeto da
parceria e o valor. No cadastro ainda deve ser possível
informar   as   parcelas   da   parceria   objetivando   o
preenchimento do anexo 13 – Dem. das Parcerias
Público Privadas;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/classification-engine.ts:20; src/lib/financeiro/report-delivery.ts:53
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.89

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível incluir anexos na parceria público
privada;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42; src/app/app-domain/financeiro/contas-bancarias/actions.ts:15; src/app/app-domain/financeiro/pagamentos/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.90

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve possuir mecanismo para relacionar os
empenhos à Parceria Público Privada, de modo que
seja possível consultar pela parceria cadastrada os
empenhos relacionados;

- **Diagnóstico da faixa:** PARCIAL em `FundedDebt` e vínculo empenho; demais NÃO VERIFICADOS
- **Gap a conferir:** Cadastro/histórico completos, eventos contábeis e relatórios; PPP com parcelas do anexo 13; casos sem movimento preservam capacidade funcional
- **Fases:** P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/app/app-domain/financeiro/pagamentos/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.91

**Fonte:** PDF p.25–25. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   processo   de   encerramento   mensal,   que
verifique eventuais divergências de saldos e que após
o   encerramento   não   seja   alterado   os   lançamentos
contábeis;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/lib/financeiro/report-print.ts:474; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:91; src/lib/financeiro/report-delivery.ts:40
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.92

**Fonte:** PDF p.25–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Integrar   com   o   sistema   de   Patrimônio,   efetuando
automaticamente na contabilidade os lançamentos de
movimentação dos bens bem como os lançamentos de
depreciação, exaustão e amortização;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:37; src/lib/financeiro/report-print.ts:463; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:198; src/app/app-domain/financeiro/layout.tsx:20
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.93

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerar automaticamente os lançamentos de abertura do
orçamento anual, demonstrando na rotina o total a ser
lançado de receita e de despesa. Abertura deve ser
feita por entidade.

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/planejamento.ts:17; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:60
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.94

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar os lançamentos de abertura do exercício, de
forma automática, realizando os lançamentos contábeis
de abertura bem como gravando no próprio lançamento
os conta correntes necessários a geração da MSC;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:18; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:14; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.95

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Iniciar os movimentos contábeis no novo exercício,
mesmo que o anterior ainda não esteja encerrado;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/relatorios-legais.ts:22; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:51
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.96

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   refazer   os   lançamentos   de   abertura   do
exercício,   gravando   os   novos   saldos   após   o
encerramento do exercício anterior;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:104; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:36; src/lib/financeiro/report-print.ts:474; src/lib/financeiro/report-delivery.ts:59
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.97

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar automaticamente na abertura do exercício os
valores de superávit na fonte de recurso correta, para
cada conta bancária;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/lib/financeiro/report-print.ts:114; src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:42; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.98

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar antes do encerramento consistência da base de
dados com emissão de relatório de inconsistências
objetivando   a   integridade   das   informações   para   o
encerramento;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:146; src/lib/financeiro/index.ts:43; src/lib/financeiro/report-delivery.ts:59; src/lib/financeiro/report-print.ts:94
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.99

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Encerrar exercício em etapas, permitindo ao usuário o
acompanhamento   e   a   conferência   dos   valores   e
lançamentos contábeis em cada etapa;

- **Diagnóstico da faixa:** PARCIAL; mensal, ponte Planejamento, patrimônio
- **Gap a conferir:** Conectar todas as movimentações patrimoniais; abertura provisória e refeita, novo exercício com anterior aberto, contas correntes MSC e saldos por banco/fonte; críticas e etapas completas
- **Fases:** P3, P4, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:40; src/lib/financeiro/index.ts:10; src/lib/financeiro/planejamento.ts:17; src/app/app-domain/financeiro/orcamento/actions.ts:49
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.100

**Fonte:** PDF p.26–26. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir copiar as programações de pagamento em
aberto ou aguardando retorno do banco, para o ano
seguinte na rotina de encerramento do exercício. O
sistema deverá fazer a baixa das programações no
exercício atual e copiá-las para o próximo exercício;

- **Evidência técnica atual:** `annual-payment-program-transport.ts`, `payment-bank-return.ts` e tela `/financeiro/contabilidade/etapas-anuais`. Executivo validou preparação documental antes dos fechamentos mensais, encerramento com autorizador distinto, baixa da ordem original e cópia nativa no destino/RAP, com líquido/retenções preservados, correlação bancária única, replay e uma única saída de caixa. Ordens abertas e aguardando banco passaram; lote incompleto reverte todas as baixas. Parcelas contratuais vinculadas ainda exigem tratamento próprio. Aceite autenticado municipal não executado; evidências em `PREPARACAO_JORNADAS_GLOBAIS_2026_10_14.md`.
- **Diagnóstico da faixa:** PARCIAL na inscrição RP; demais NÃO VERIFICADOS
- **Gap a conferir:** Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:20; src/lib/financeiro/report-print.ts:315; src/app/app-domain/financeiro/orcamento/OrcamentoClient.tsx:156; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.101

**Fonte:** PDF p.26–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   no   encerramento   do   exercício   anular
empenhos estimativos para que os mesmos não sejam
inscritos   em   restos   a   pagar;   Caso   os   empenhos
estimativos   não   sejam   anulados   o   sistema   deve
inscreve-los em restos a pagar;

- **Evidência técnica atual:** `annual-estimative-balances.ts`, tela `/financeiro/contabilidade/etapas-anuais` e `tests/annual-estimative-balances.test.ts`. Executivo validou manutenção para inscrição e anulação automática do saldo não liquidado, com composição nativa, concorrência/replay e rollback do lote. Etapa exige exercício e dezembro abertos; após fechamento mensal, inscrição preserva a parcela processada. Aceite autenticado municipal ainda pendente; detalhes em `PREPARACAO_JORNADAS_GLOBAIS_2026_10_14.md`.
- **Diagnóstico da faixa:** PARCIAL na inscrição RP; demais NÃO VERIFICADOS
- **Gap a conferir:** Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:104; src/app/app-domain/financeiro/restos-a-pagar/RestosAPagarClient.tsx:25; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:46; src/lib/financeiro/report-delivery.ts:59
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.102

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Inscrever   em   restos   a   pagar,   individualmente   no
encerramento   do   exercício,   os   empenhos   a   pagar,
demonstrando quais os valores processados e não
processados;

- **Evidência técnica atual:** inscrição/reapuração individual por empenho e tipo em `annual-payable-registration.ts`, com memória de valores/status e desmovimentação independente; `tests/annual-payable-registration.test.ts` e `tests/annual-rap-postings.test.ts` aprovados para Executivo. Publicação específica das partidas passou a ser obrigatória na validação final. Adoção municipal das duas matrizes orçamentárias realizada apenas na UG `-1`, sem inscrições/fatos artificiais. Aceite autenticado não executado.
- **Diagnóstico da faixa:** PARCIAL na inscrição RP; demais NÃO VERIFICADOS
- **Gap a conferir:** Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:104; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:46; src/app/app-domain/financeiro/restos-a-pagar/RestosAPagarClient.tsx:25; src/lib/financeiro/report-delivery.ts:59
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.103

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar lançamentos contábeis de encerramento do
exercício automaticamente;

- **Evidência técnica atual:** edições anuais de resultado (classes 3/4), orçamento (classes 5/6) e partidas específicas de inscrição RAP, com partidas originais/MSC, composição complementar, desmovimentação independente e bloqueio final por saldos/inscrição divergente. Suítes `annual-budget-close` e `annual-rap-postings` aprovadas para Executivo. Matriz de inscrição orçamentária adotada apenas na UG `-1`; implantação patrimonial/DDR por origem e abertura RAP seguinte ainda pendentes. Detalhes em `PREPARACAO_JORNADAS_GLOBAIS_2026_10_14.md`. Sem aceite integral.
- **Diagnóstico da faixa:** PARCIAL na inscrição RP; demais NÃO VERIFICADOS
- **Gap a conferir:** Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:104; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/lib/financeiro/report-delivery.ts:59; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.104

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cópia das notas extraorçamentárias a pagar
para o exercício seguinte;

- **Evidência técnica atual:** `annual-extra-note-transport.ts` e tela anual copiam para o exercício sequencial documentos de retenções e créditos tributários extraorçamentários existentes, com ID documental próprio, banco/fonte/UG e vínculo à dívida canônica. Executivo validou R$ 1,30 sem duplicação de caixa/obrigação; recolhimento nativo posterior reduziu o saldo para R$ 0,70 e impediu repetição. Replay e desmovimentação/reedição aprovados. Cadastro genérico de novas dívidas e aceite autenticado permanecem pendentes.
- **Diagnóstico da faixa:** PARCIAL na inscrição RP; demais NÃO VERIFICADOS
- **Gap a conferir:** Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/relatorios-legais.ts:458; src/lib/financeiro/report-print.ts:264; src/lib/financeiro/report-delivery.ts:107; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.105

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   desmovimentação   do   encerramento   do
exercício, da inscrição dos restos a pagar e das notas
extraorçamentárias separadamente;

- **Evidência técnica atual:** desmovimentações próprias de resultado, orçamento, partidas RAP, inscrições RAP, transporte RAP, cópias extras e programações. Executivo aprovou preservação das edições/matrizes anteriores, replay e guardas por pagamento, abertura, transporte posterior e encerramento definitivo. Programações desmovimentadas preservam a etapa RAP até a sua própria desmovimentação. Reversão após encerramento definitivo e aceite municipal ainda exigem conferência específica; não se declarou atendimento integral.
- **Diagnóstico da faixa:** PARCIAL na inscrição RP; demais NÃO VERIFICADOS
- **Gap a conferir:** Transportes únicos sem pagamento duplicado; opção de anular estimativos; postar encerramento; reversões independentes com guardas de fatos posteriores
- **Fases:** P3, P4. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:104; src/lib/financeiro/report-delivery.ts:59; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:46; src/app/app-domain/financeiro/restos-a-pagar/RestosAPagarClient.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.106

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta unificada dos lançamentos contábeis
efetuados nos sistemas integrados; Deve ser permitido
consultar o lançamento, o evento a ele associado, o
conta corrente do estado (caso haja) o conta corrente
da MSC e o usuário que fez o lançamento;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:28; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:40; src/lib/financeiro/classification-engine.ts:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.107

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar saldos das contas contábeis e dos saldos por
vínculo de recursos de cada conta, demonstrando os
valores mês a mês;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/report-print.ts:40; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:13; src/lib/financeiro/bank-integration-client.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.108

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir ferramenta de soma, onde ao consultar os
lançamentos   contábeis   de   determinada   conta,   ao
seleciona-los o sistema demonstre em tela o número de
registros selecionados, o valor a debito, o valor a credito
e a diferença;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:14; src/lib/financeiro/reconciliation-engine.ts:6; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.109

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consolidar balancete da administração direta e indireta;
O balancete de verificação deve ser emitido das contas
de receita, despesa e das contas contábeis. Deve ser
possível a emissão por indicador de superavit, por mês
ou diário e com possibilidade de paginação;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/index.ts:22; src/lib/financeiro/report-delivery.ts:6; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.110

**Fonte:** PDF p.27–27. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   Livro   Diário   com   termo   de   abertura   e
encerramento;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:36; src/lib/financeiro/index.ts:1578; src/lib/financeiro/report-delivery.ts:7; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:91
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.111

**Fonte:** PDF p.27–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   livro   razão   com   termo   de   abertura   e
encerramento. Deve ser possível a emissão do razão
agrupando por data, tipo de lançamento e com opção
de resumir por fonte de recursos;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:59; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:10; src/lib/financeiro/classification-engine.ts:29; src/lib/financeiro/report-delivery.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.112

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   Balancete   Analítico   por   Fonte   de   Recursos.
Devem ser emitidas as contas de receita, despesa e
contas contábeis, com possibilidade de listar e resumir
por fonte de recursos e resumir por especificação. Deve
ser possível listar uma ou mais contas e uma ou mais
fontes de recursos.

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/classification-engine.ts:29; src/lib/financeiro/planejamento.ts:17; src/app/app-domain/financeiro/contas-bancarias/actions.ts:15
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.113

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório de saldo de disponibilidade de recursos.
Possibilitar   a   seleção   de   uma   ou   mais   fontes   de
recursos. O relatório deve demonstrar por fonte de
recursos: o saldo disponível, empenhos a pagar, restos
a pagar, extras a pagar e o déficit/superavit por fonte;

- **Diagnóstico da faixa:** PARCIAL; consultas e relatórios básicos
- **Gap a conferir:** Dimensões entidade/MSC/TCE/fonte; seleção com contagem/D/C/diferença; termos, agrupamentos, filtros compostos e disponibilidade com empenhos/RP/extras
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/planejamento.ts:17; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.114

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir DARF/PASEP/GPS e imprimir recibo de IRRF e
ISSQN;

- **Diagnóstico da faixa:** NÃO VERIFICADO nas saídas integrais
- **Gap a conferir:** Documentos aplicáveis ao período com cálculo/origem; extratos e relatório consolidado sem duplicar retenção/pagamento
- **Fases:** P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/rendimentos/RendimentosClient.tsx:15; src/lib/financeiro/yield-engine.ts:9; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:14; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.115

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório das notas extraorçamentárias emitidas,
estornadas e pagas, consolidando por entidade. Deve
ser possível filtrar por credor, conta, fonte de recursos
e número do empenho. Deve permitir totalizar por fonte
de recursos, conta contábil e credor;
GESTÃO FINANCEIRA

- **Diagnóstico da faixa:** NÃO VERIFICADO nas saídas integrais
- **Gap a conferir:** Documentos aplicáveis ao período com cálculo/origem; extratos e relatório consolidado sem duplicar retenção/pagamento
- **Fases:** P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:28; src/lib/financeiro/relatorios-legais.ts:22; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.116

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   total   integração   com   o   sistema   contábil,
efetuando a contabilização automática dos pagamentos
e recebimentos efetuados pela tesouraria;

- **Diagnóstico da faixa:** PARCIAL; receitas/pagamentos integrados
- **Gap a conferir:** Consulta unificada e filtros exigidos; duplicar todos os cinco tipos com nova identidade e novas validações; estornos coordenados
- **Fases:** P2, P3, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:24; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:17; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.117

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   consulta   gerencial   dos   pagamentos.   Na
consulta   devem   ser   listados   todos   os   pagamentos
efetuados, de empenhos, restos e extras. A consulta
também   de   demonstrar   as   retenções   baixadas   na
liquidação e no pagamento;

- **Diagnóstico da faixa:** PARCIAL; receitas/pagamentos integrados
- **Gap a conferir:** Consulta unificada e filtros exigidos; duplicar todos os cinco tipos com nova identidade e novas validações; estornos coordenados
- **Fases:** P2, P3, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:3; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33; src/app/app-domain/financeiro/layout.tsx:14; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.118

**Fonte:** PDF p.28–28. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sobre os registros da consulta, o sistema deve permitir
visualizar,   estornar,   consultar   os   lançamentos
contábeis e incluir anexos;

- **Diagnóstico da faixa:** PARCIAL; receitas/pagamentos integrados
- **Gap a conferir:** Consulta unificada e filtros exigidos; duplicar todos os cinco tipos com nova identidade e novas validações; estornos coordenados
- **Fases:** P2, P3, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/__tests__/revenue-lifecycle.test.ts:20; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:53
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.119

**Fonte:** PDF p.28–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A consulta gerencial deve permitir filtra os registros que
foram assinados digitalmente, os que possuem anexo,
os   que   tem   finalidade   FUNDEB   e   finalidade   FMS
informados;

- **Diagnóstico da faixa:** PARCIAL; receitas/pagamentos integrados
- **Gap a conferir:** Consulta unificada e filtros exigidos; duplicar todos os cinco tipos com nova identidade e novas validações; estornos coordenados
- **Fases:** P2, P3, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/planejamento.ts:17; src/lib/financeiro/relatorios-legais.ts:289; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:154; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:53
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.120

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve possuir ação de duplicar nas rotinas de
pagamento, movimento bancário, receita orçamentária,
dedução de receita e transferência financeira;

- **Diagnóstico da faixa:** PARCIAL; receitas/pagamentos integrados
- **Gap a conferir:** Consulta unificada e filtros exigidos; duplicar todos os cinco tipos com nova identidade e novas validações; estornos coordenados
- **Fases:** P2, P3, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:29; src/lib/financeiro/classification-engine.ts:6; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.121

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve permitir a gestão das contas bancárias
em rotina especifica, permitindo a vinculação de uma ou
mais fontes de recurso à conta bancária. Esta definição
deve   ser   observada   em   qualquer   movimentação
realizada no sistema;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/lib/financeiro/classification-engine.ts:25; src/lib/financeiro/report-print.ts:113; src/app/app-domain/financeiro/contas-bancarias/actions.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.122

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir várias receitas orçamentárias simultaneamente
com contrapartida uma única conta bancária;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/report-delivery.ts:6; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:99
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.123

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o lançamento das receitas de acordo com a
Portaria   vigente   relacionada   a   receita   pública.   O
sistema deve consistir na receita com sua fonte de
recurso   x   conta   bancária,   não   permitindo   salvar
arrecadação que esteja divergente;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:59; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:28
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.124

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a informação da fonte de recursos no momento
do lançamento da receita, para os casos em que não
há rateio de percentual entre as fontes;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/lib/financeiro/classification-engine.ts:29; src/lib/financeiro/planejamento.ts:516; src/app/app-domain/financeiro/orcamento/cadastros/CadastrosClient.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.125

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar   dedução   de   receita   utilizando   rubricas
redutoras,   conforme   Manual   de   Procedimentos
Contábeis da STN (Secretaria do Tesouro Nacional);

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/index.ts:375; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.126

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir   várias   deduções   de   receita   simultaneamente
tendo como contrapartida uma única conta bancária;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/classification-engine.ts:25; src/lib/financeiro/report-print.ts:114
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.127

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir receitas extraorçamentárias;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:468; src/lib/financeiro/index.ts:1709; src/lib/financeiro/relatorios-legais.ts:358; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:99
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.128

**Fonte:** PDF p.29–29. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Selecionar várias receitas extraorçamentárias e gerar
automaticamente   as   notas   extraorçamentárias,
mantendo rastreabilidade dos registros;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:99; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:468; src/lib/financeiro/relatorios-legais.ts:358
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.129

**Fonte:** PDF p.29–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar os lançamentos contábeis das movimentações
financeiras   automaticamente   ao   incluir   o   registro,
gravando simultaneamente a conta corrente da MSC
quando for o caso.

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/lib/financeiro/index.ts:25; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.130

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Todas   as   movimentações   relacionadas   a   contas
bancárias   e   aplicações   devem   ser   imediatamente
reproduzidas em registros contábeis, não se admitindo
lapso de tempo;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:566; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/app/app-domain/financeiro/contas-bancarias/actions.ts:63; src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.131

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar na rotina de inclusão, para cada receita,
dedução de receita e receita extra os lançamentos
contábeis,   podendo   estorná-los   e   fazendo
automaticamente os lançamentos contábeis do estorno,
mantendo o registro da situação;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:36; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.132

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Realizar automaticamente nos lançamentos de receita
de cota parte, o lançamento dos 20% do FUNDEB na
dedução da receita;

- **Diagnóstico da faixa:** PARCIAL; classificação/receita/postagem
- **Gap a conferir:** Lista de fontes permitidas, natureza compatível, rateio/manual, lotes atômicos, extra→nota rastreável; FUNDEB na operação aplicável e MSC em cada evento
- **Fases:** P2, P3, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:29; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21; src/lib/financeiro/bank-integration-client.ts:55
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.133

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir   lançamentos   de   movimentação   bancária
(depósitos,   transferências,   resgates   e   aplicações),
informando as fontes e destinações de recursos;

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/layout.tsx:20; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:5; src/lib/financeiro/bank-integration-client.ts:61; src/lib/financeiro/classification-engine.ts:134
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.134

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar   saldos   da   conta   bancária   por   fonte   de
recursos   no   momento   das   suas   movimentações
(depósitos, transferências, resgates e aplicações);

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/bank-integration-client.ts:7; src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/layout.tsx:24; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.135

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar   na   rotina   de   inclusão,   para   cada
movimentação   bancária   os   lançamentos   contábeis,
permitindo estorná-los e fazendo automaticamente os
lançamentos contábeis do estorno, mantendo o registro
da situação;

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:105; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:36; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:187
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.136

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   inclusão   de   anexos   nos   registros   de
movimento bancário;

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:67; src/lib/financeiro/index.ts:194; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:24; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:134
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.137

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   geração   de   borderô   dos   registros   de
movimento bancário;

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:24; src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:67; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:134; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:47
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.138

**Fonte:** PDF p.30–30. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Informar   as   transferências   financeiras   entre   as
entidades as Adm. Direta e Indireta, indicando o tipo da
transferência   (Concedida/recebida)   e   a   entidade
recebedora;

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/bank-integration-client.ts:8; src/lib/financeiro/index.ts:184; src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:29; src/lib/financeiro/classification-engine.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.139

**Fonte:** PDF p.30–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar   em   cada   transferência   financeira   os
lançamentos contábeis, podendo estorná-los e fazendo
automaticamente os lançamentos contábeis do estorno,
mantendo o registro da situação;

- **Diagnóstico da faixa:** PARCIAL; tesouraria e banco virtual
- **Gap a conferir:** Fonte/destinação em todo movimento; devolução consistente; transferência concedida/recebida e eliminações na consolidação; borderô documental
- **Fases:** P3, P4, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:30; src/lib/financeiro/index.ts:53; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:108; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:105
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.140

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar   as   diárias   permitindo   incluir   o
funcionário/servidor, objetivo,   destino, período,   valor
concedido, empenho da despesa e a Lei que autoriza a
concessão de diárias;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/lib/financeiro/report-print.ts:148; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.141

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Disponibilizar no portal da transparência os dados das
diárias assim que forem incluídos;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:15
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.142

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Criar lote com diversas liquidações e notas extras para
pagamento posterior, definindo a data de vencimento,
podendo ser pago através da rotina de pagamento ou
envio/baixa de borderô;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:58; src/lib/financeiro/index.ts:22; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:35; src/app/app-domain/financeiro/pagamentos/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.143

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar   saldo   da   conta   bancária,   saldo   por
fonte/destinação   de   recursos,   na   Inclusão   de
pagamentos;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:25; src/app/app-domain/financeiro/contas-bancarias/ContasBancariasClient.tsx:42; src/app/app-domain/financeiro/contas-bancarias/actions.ts:13; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:205
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.144

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir   empenhos,   restos   a   pagar   e   notas
extraorçamentárias em um lote de pagamentos;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:712; src/app/app-domain/financeiro/layout.tsx:14; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:163; src/lib/financeiro/report-delivery.ts:322
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.145

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar prazo de vencimento dos pagamentos de
empenhos, visando o controle dos pagamentos em
ordem cronológica;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/pagamentos/actions.ts:85; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:78; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:163
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.146

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir borderôs para agrupamento de pagamentos a
diversos fornecedores para um banco, efetuar o mesmo
tratamento para os pagamentos individuais;

- **Diagnóstico da faixa:** PARCIAL nos pagamentos; demais subcritérios NÃO VERIFICADOS
- **Gap a conferir:** Origem legal e servidor; lote misto e vencimentos; fila cronológica com justificativas aplicáveis; documentos e saldos por banco/fonte
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:835; src/app/app-domain/financeiro/layout.tsx:16; src/app/app-domain/financeiro/pagamentos/actions.ts:85; src/lib/financeiro/reconciliation-engine.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.147

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Integrar com os arquivos de retorno dos bancos, com
baixa de pagamento automática pelo software;

- **Diagnóstico da faixa:** NÃO VERIFICADO em banco oficial; base SIMULADO POC
- **Gap a conferir:** Remessa/retorno oficiais, configuração explícita de quando reconhecer o pagamento, conciliação de rejeições/retornos parciais
- **Fases:** P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:177; src/app/app-domain/financeiro/layout.tsx:16; src/app/app-domain/financeiro/pagamentos/actions.ts:8; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.148

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar o pagamento do borderô através de arquivo de
retorno do banco;

- **Diagnóstico da faixa:** NÃO VERIFICADO em banco oficial; base SIMULADO POC
- **Gap a conferir:** Remessa/retorno oficiais, configuração explícita de quando reconhecer o pagamento, conciliação de rejeições/retornos parciais
- **Fases:** P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/bank-integration-client.ts:5; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:19; src/app/app-domain/financeiro/download-extratos/DownloadExtratosClient.tsx:10; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.149

**Fonte:** PDF p.31–31. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Configurar a baixa dos registros no envio do borderô,
permitindo que o pagamento dos registros se dê no
momento da geração.

- **Diagnóstico da faixa:** NÃO VERIFICADO em banco oficial; base SIMULADO POC
- **Gap a conferir:** Remessa/retorno oficiais, configuração explícita de quando reconhecer o pagamento, conciliação de rejeições/retornos parciais
- **Fases:** P9, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/pagamentos/actions.ts:8; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/download-extratos/DownloadExtratosClient.tsx:226
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.150

**Fonte:** PDF p.31–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar movimentação de pagamentos, registrando
todos os pagamentos efetuados, podendo estornar os
lançamentos   contábeis   automaticamente   nas
respectivas contas contábeis;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:144; src/lib/financeiro/index.ts:106; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:49
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.151

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Filtrar itens a pagar por data de vencimento, credor,
destinação/fonte de recursos, podendo selecionar e
pagar simultaneamente os registros;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:59; src/app/app-domain/financeiro/orcamento/CreditRequestDialog.tsx:145; src/lib/financeiro/report-print.ts:19; src/app/app-domain/financeiro/contas-bancarias/actions.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.152

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Pagar de uma só vez as despesas extraorçamentárias
geradas através de retenção na liquidação;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:237; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:147; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.153

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar pagamentos pré-autorizados filtrando por data
de vencimento;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:35; src/app/app-domain/financeiro/pagamentos/actions.ts:35; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69; src/lib/financeiro/index.ts:59
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.154

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar   pagamentos   totais   ou   parciais,   bem   como
estornos totais ou parciais de pagamentos;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:177; src/app/app-domain/financeiro/layout.tsx:16; src/app/app-domain/financeiro/pagamentos/actions.ts:88; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.155

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar   para   cada   pagamento   incluído   os
lançamentos   contábeis   realizados,   permitindo   seu
estorno e fazendo automaticamente os lançamentos
contábeis;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:105; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.156

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir ordens de pagamento de restos a pagar, despesa
extraorçamentária e de empenhos;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/layout.tsx:13; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:22; src/lib/financeiro/report-print.ts:181
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.157

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Listar cheques emitidos na   rotina de   pagamento e
cheques avulsos numa única consulta;

- **Diagnóstico da faixa:** PARCIAL; pagamento/estorno básicos
- **Gap a conferir:** Cobrir todas as modalidades, inclusive parcial e pré-autorização; ordens por origem, extras e cheques na consulta única
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:281; src/app/app-domain/financeiro/contabilidade/ContabilidadeClient.tsx:67; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:177; src/app/app-domain/financeiro/layout.tsx:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.158

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerenciar   a   conciliação   bancária   com   o   extrato,
visualizando   os   lançamentos   contábeis   e
movimentação bancária numa única tela;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/lib/financeiro/index.ts:106; src/lib/financeiro/reconciliation-engine.ts:35; src/lib/financeiro/report-delivery.ts:62
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.159

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar arquivos de extrato bancário nas extensões
OFC e OFX para a conciliação bancária e permitir a
impressão do extrato importado;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:7; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:18; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:36; src/app/app-domain/financeiro/layout.tsx:24
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.160

**Fonte:** PDF p.32–32. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir pendências da conciliação para lançamentos
contábeis e registros do extrato;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54; src/lib/financeiro/reconciliation-engine.ts:35
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.161

**Fonte:** PDF p.32–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Criar automaticamente pendências para o extrato e
lançamentos contábeis e copiar automaticamente as
pendências não baixadas para a próxima conciliação.

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:23; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:54
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.162

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Selecionar múltiplos lançamentos contábeis exibindo a
soma dos mesmos e permitindo conciliar com um ou
vários registros do extrato;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:23; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:104
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.163

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Conciliar de forma parcial, à medida que os valores vão
sendo conciliados deverão ser ocultados da consulta de
lançamentos a conciliar, facilitando a conferência dos
valores que ainda não foram conciliados;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:30; src/lib/financeiro/report-print.ts:6; src/app/app-domain/financeiro/rendimentos/RendimentosClient.tsx:96
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.164

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Visualizar   e   imprimir   conciliações   de   períodos
anteriores;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/relatorios/page.tsx:52; src/lib/financeiro/classification-engine.ts:148; src/lib/financeiro/planejamento.ts:22; src/lib/financeiro/report-delivery.ts:62
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.165

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir os filtros na tela de conciliação: data, descrição,
valor, controle de lançamento;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:20; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:36; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:46; src/lib/financeiro/report-print.ts:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.166

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ordenar coluna de valor na conciliação para o lado dos
lançamentos   contábeis   e   para   o   lado   do   extrato
bancário;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:31; src/lib/financeiro/reconciliation-engine.ts:6; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:24; src/lib/financeiro/report-print.ts:174
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.167

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar pendências baixadas na conciliação;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:2528; src/lib/financeiro/report-delivery.ts:62; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:42; src/app/app-domain/financeiro/conciliacao-bancaria/ConciliacaoBancariaClient.tsx:36
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.168

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   os   relatórios   de   pendência   e   conciliação
bancária;

- **Diagnóstico da faixa:** PARCIAL; engine/sessões/extrato CSV
- **Gap a conferir:** Mesmo estado de saldo e partidas/extrato; não duplicar matches, remanescente correto, histórico preservado; parsers OFC/OFX e arquivo original ao final
- **Fases:** P3, P7, P9. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:11; src/app/app-domain/financeiro/layout.tsx:24; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:27; src/lib/financeiro/index.ts:1110
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.169

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar   para   cada   pagamento   incluído   os
lançamentos contábeis e para cada lançamento permitir
o   seu   estorno,   fazendo   automaticamente   os
lançamentos contábeis de estorno;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:105; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/layout.tsx:10; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.170

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar despesa empenhada a pagar por unidade
orçamentária;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/lib/financeiro/relatorios-legais.ts:22; src/lib/financeiro/report-delivery.ts:55; src/lib/financeiro/report-print.ts:168
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.171

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir autorização bancária para envio de ao banco
após assinatura do ordenador da despesa;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-print.ts:181; src/lib/financeiro/index.ts:392; src/lib/financeiro/report-delivery.ts:62; src/app/app-domain/financeiro/download-extratos/DownloadExtratosClient.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.172

**Fonte:** PDF p.33–33. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir controle de assinaturas para envio de borderô
ao banco, bloqueando a geração e envio do borderô ao
banco caso não tenha as autorizações necessárias;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:322; src/lib/financeiro/relatorios-legais.ts:476; src/app/app-domain/financeiro/automacoes/page.tsx:13; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.173

**Fonte:** PDF p.33–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir demonstrativo diário de receitas arrecadadas e
despesas realizadas;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:1964; src/lib/financeiro/relatorios-legais.ts:26; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:99; src/lib/financeiro/report-delivery.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.174

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir demonstrativo das receitas arrecadadas mês a
mês com possibilidade de listar fontes de recursos e
resumir por fonte;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:1112; src/app/app-domain/financeiro/orcamento/cadastros/CadastrosClient.tsx:17; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.175

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório das receitas arrecadas mês a mês dos
últimos três anos, listando as fontes de recursos e com
possibilidade de emissão em planilhas;

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:4; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:8; src/lib/financeiro/bank-integration-client.ts:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.176

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir extrato do credor, demonstrando informações
dos empenhos e dos restos a pagar na mesma opção;
Integrar com o sistema tributário, efetuando de forma
automática os lançamentos contábeis de arrecadação
de receitas:

- **Diagnóstico da faixa:** PARCIAL nas bases; saídas completas NÃO VERIFICADAS
- **Gap a conferir:** Fluxo de assinatura bloqueante, despesas por unidade, receitas sem duplicar hierarquia/acumulados e extrato de empenhos/RP
- **Fases:** P3, P7, P10. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:106; src/lib/financeiro/report-delivery.ts:52; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/app/app-domain/financeiro/layout.tsx:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.177

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

movimentações   de   Lançamento,   Arrecadação   e
Recolhimento   conforme   classificação   da   receita
orçamentária e contábil;

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas GAP-02–07
- **Gap a conferir:** Eventos por estágio, todas as extinções/benefícios, dívida/estornos, prévia bloqueante, dedução no ano corrente ou empenho no anterior
- **Fases:** P2. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6; src/lib/financeiro/index.ts:18; src/lib/financeiro/report-print.ts:114; src/app/app-domain/financeiro/receitas/ReceitasClient.tsx:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.178

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

movimentações de renúncia de receita (cancelamento,
prescrição, anistia, isenção, etc.);

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas GAP-02–07
- **Gap a conferir:** Eventos por estágio, todas as extinções/benefícios, dívida/estornos, prévia bloqueante, dedução no ano corrente ou empenho no anterior
- **Fases:** P2. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:1072; src/app/app-domain/financeiro/download-extratos/extratos-actions.ts:147; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:21; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.179

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

movimentações da Dívida Ativa (Inclusão, Manutenção,
Exclusão)   conforme   classificação   da   receita
orçamentária e contábil;

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas GAP-02–07
- **Gap a conferir:** Eventos por estágio, todas as extinções/benefícios, dívida/estornos, prévia bloqueante, dedução no ano corrente ou empenho no anterior
- **Fases:** P2. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:18; src/lib/financeiro/report-print.ts:8; src/app/app-domain/financeiro/receitas-constitucionais/ReceitasConstitucionaisClient.tsx:6; src/app/app-domain/financeiro/orcamento/cadastros/CadastrosClient.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.180

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar lançamentos tributários para conferência dos
valores antes de efetuar a integração bem como a
emissão   de   relatório   de   críticas   caso   haja
inconsistências ou falta de configurações nas receitas;

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas GAP-02–07
- **Gap a conferir:** Eventos por estágio, todas as extinções/benefícios, dívida/estornos, prévia bloqueante, dedução no ano corrente ou empenho no anterior
- **Fases:** P2. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:43; src/lib/financeiro/report-print.ts:166; src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts:204; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:104
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.181

**Fonte:** PDF p.34–34. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Nos   casos   em   que   houver   restituição   de   receita,
integrar esses valores do tributário e permitir ao usuário
gerar um empenho para restituir se o valor é de ano
anterior e gerar uma dedução de receita se a restituição
ocorrer no ano corrente da receita;

- **Diagnóstico da faixa:** PARCIAL com lacunas confirmadas GAP-02–07
- **Gap a conferir:** Eventos por estágio, todas as extinções/benefícios, dívida/estornos, prévia bloqueante, dedução no ano corrente ou empenho no anterior
- **Fases:** P2. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:10; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:32; src/app/app-domain/financeiro/rendimentos/RendimentosClient.tsx:14; src/lib/financeiro/classification-engine.ts:20
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.182

**Fonte:** PDF p.34–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   fluxo   de   assinatura   digital   de   ordens   de
pagamento, que permita tramitar as ordens entre os
assinantes   de   forma   automática,   só   finalizando   o
processo se todos os responsáveis tiverem incluído sua
assinatura;

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:5; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:44; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.183

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Configurar   por   fonte   de   recursos   as   receitas
arrecadadas com multa de trânsito e as respectivas
despesas,   com   publicação   automática   no portal da
transparência;

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/report-delivery.ts:15; src/app/app-domain/financeiro/orcamento/planejamento/PlanejamentoClient.tsx:176; src/lib/financeiro/index.ts:1112; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:99
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.184

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar os itens a pagar por data de vencimento,
credor,   destinação/   fonte   de   recursos   e   com
possibilidade de selecionar e pagar simultaneamente
os registros mostrados.

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:59; src/app/app-domain/financeiro/orcamento/CreditRequestDialog.tsx:145; src/lib/financeiro/report-print.ts:19; src/app/app-domain/financeiro/contas-bancarias/actions.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.185

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir incluir anexos no registro de pagamento;

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34; src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/FinanceiroDashboardClient.tsx:177; src/app/app-domain/financeiro/layout.tsx:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.186

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a assinatura digital na ordem de pagamento e
no   comprovante   de   pagamento.   O   sistema   deve
transferir automaticamente o documento para que mais
pessoas possam realizar a assinatura digital.

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:60; src/app/app-domain/financeiro/pagamentos/PagamentosClient.tsx:69; src/lib/financeiro/report-print.ts:6; src/lib/financeiro/__tests__/financeiro-lagoaseca.test.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.187

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deve permitir a configuração das pessoas a
quem   o   documento   será   transferido   para   assinar
digitalmente.

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:105; src/app/app-domain/financeiro/empenhos/EmpenhosClient.tsx:231; src/app/app-domain/financeiro/liquidacoes/LiquidacoesClient.tsx:237; src/lib/financeiro/__tests__/accounting-close-workflow.test.ts:26
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.188

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório de pagamentos efetuados. O relatório
deve ter no mínimo os filtros: data de pagamento,
credor, fonte de recursos, banco e permitir agrupar por
banco, credor, fonte de recursos e listando ou não as
retenções;

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/lib/financeiro/index.ts:3; src/lib/financeiro/report-print.ts:19; src/app/app-domain/financeiro/contas-bancarias/actions.ts:11; src/app/app-domain/financeiro/pagamentos/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-02.189

**Fonte:** PDF p.35–35. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta no Portal do Município, para que os
fornecedores,   mediante   usuário   e   senha,   possam
consultar os valores a receber e recebidos, sem ter
necessidade de entrar em contato com o Município para
receber informações.

- **Diagnóstico da faixa:** PARCIAL em GED/pagamentos; ciclo total NÃO VERIFICADO
- **Gap a conferir:** Tramitação de todos os assinantes, publicação por fonte/finalidade, filtros/agrupamentos/retenções e consulta privada dos próprios recebíveis/recebidos
- **Fases:** P3, P4, P7. **Responsável funcional:** Contabilidade/Tesouraria (pessoa a designar).
- **Fontes municipais:** 008, 009, 010, 011, 031, 039, 045, 053, 054, 105, 123, 124, 125, 126, 132, 133, 134.
- **Base candidata:** src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts:142; src/app/app-domain/financeiro/resgates-aplicacoes/ResgatesAplicacoesClient.tsx:104; src/lib/financeiro/bank-integration-client.ts:192; src/lib/financeiro/index.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
