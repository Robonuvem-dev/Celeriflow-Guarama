# P0 — LEG-01: Planejamento e Orçamento

Ente: **CÂMARA**. 99 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## LEG-01.1

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   registro   da   realização   das audiências
públicas com campo para todas as solicitações feitas
pela   comunidade,   bairro   a   ser   atendido,   com
informações   de   contato   do   solicitante,   órgão
responsável por sua análise e status da mesma;

- **Diagnóstico da faixa:** Jornada com upload/download, todos os campos, volume/paginação, arquivo preservado e permissão
- **Gap a conferir:** Jornada com upload/download, todos os campos, volume/paginação, arquivo preservado e permissão
- **Fases:** P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/hearings.ts:9; src/lib/planejamento/legislative-bridge.ts:17; src/lib/planejamento/versions.ts:64; src/lib/planejamento/accounting-bridge.ts:15
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R1
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.2

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir anexar documentos no cadastro da audiência
pública e permitir a baixa dos arquivos anexados;

- **Diagnóstico da faixa:** Jornada com upload/download, todos os campos, volume/paginação, arquivo preservado e permissão
- **Gap a conferir:** Jornada com upload/download, todos os campos, volume/paginação, arquivo preservado e permissão
- **Fases:** P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/documents.ts:27; src/app/app-domain/planejamento/actions.ts:30; src/lib/planejamento/classification.ts:80; src/lib/planejamento/credits.ts:16
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R1
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.3

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

No cadastro do PPA, permitir escolher o grau do plano
de contas no PPA a ser utilizado para a informação das
receitas e o nível do orçamento a ser utilizado para as
despesas, tendo como opções orçar a despesa por
elemento/fonte de recursos ou só fonte de recursos;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/navigation.ts:7; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/versions.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.4

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar vínculos para o PPA de acordo com tabela
definida pelo Tribunal de Contas do Estado;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:41; src/lib/planejamento/policy.ts:44; src/lib/planejamento/publication.ts:45
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.5

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar vínculos utilizados na LOA a cada novo PPA
elaborado;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:36; src/lib/planejamento/reports.ts:173; src/lib/planejamento/year-rollover.ts:11; src/lib/planejamento/accounting-bridge.ts:39
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.6

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar programas de governo com no mínimo, as
informações de:   origem,   objetivo,   diretrizes,   público
alvo, fonte de financiamento e gerente responsável;
Permitir incluir para cada programa os seus objetivos e
indicadores;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/maintenance.ts:29; src/lib/planejamento/accounting-bridge.ts:39; src/lib/planejamento/credits.ts:16
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.7

**Fonte:** PDF p.256–256. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar as ações e programas da LOA para cada novo
PPA elaborado, evitando a redigitação de dados. Após
a   importação,   permitir   realizar   as   alterações
necessárias.

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:7; src/lib/planejamento/reports.ts:146; src/lib/planejamento/accounting-bridge.ts:39
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.8

**Fonte:** PDF p.256–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Criar automaticamente códigos reduzidos para despesa
do   PPA   composto   de   órgão,   unidade,   função,
subfunção, programa e ação com o objetivo de facilitar
a execução orçamentária;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:55; src/lib/planejamento/report-catalog.ts:3; src/lib/planejamento/maintenance.ts:11; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.9

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar as receitas e despesas de PPA anterior e da
LOA;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:139; src/lib/planejamento/imports.ts:27; src/lib/planejamento/reports.ts:100; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.10

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na importação da despesa do PPA, da LOA ou de PPA
anterior, permitir importar só as dotações, as dotações
e valores, e ainda determinadas dotações conforme
escolha do usuário;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:23; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/maintenance.ts:32; src/lib/planejamento/reports.ts:100
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.11

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar programação da receita identificando cada
fonte de recurso;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/navigation.ts:13; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/accounting-bridge.ts:39
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.12

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Informar receitas do PPA por meio de rateio automático
para cada conta de receita e suas respectivas fontes de
recursos;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:56; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/navigation.ts:13; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.13

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar projeção de cálculo para obter a previsão do
total a ser arrecadado e do total a ser gasto para cada
ano do PPA;

- **Diagnóstico da faixa:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Gap a conferir:** Conferir complementos S3–S7 no código atual; catálogo oficial, vigência, múltiplos objetivos, importação por ano e fórmula/memória reproduzível
- **Fases:** P1, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/maintenance.ts:28; src/lib/planejamento/imports.ts:39; src/lib/planejamento/report-catalog.ts:20; src/lib/planejamento/revisions.ts:33
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.14

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir alterações orçamentárias para a receita do PPA,
bem como, consultar todas as alterações incluídas e de
uma receita individualmente;

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/accounting-bridge.ts:138; src/lib/planejamento/navigation.ts:10; src/lib/planejamento/catalog.ts:14
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.15

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar orçamento da receita e da Despesa do PPA
com valor orçado atualizado até a data selecionada. A
consulta   deve   permitir   selecionar   uma   ou   mais
entidades;

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:17; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.16

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Informar metas físicas e financeiras da despesa do
PPA, indicando a destinação de recursos, distribuindo
as metas para cada exercício do PPA e atualizando
essas metas durante a execução orçamentária;

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:3; src/lib/planejamento/reports.ts:54; src/lib/planejamento/maintenance.ts:29; src/lib/planejamento/navigation.ts:10
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.17

**Fonte:** PDF p.257–257. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar   previsão   das   transferências   financeiras
identificando a entidade a que se destinam. Permitir a
informação para cada ano do PPA.

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:4; src/lib/planejamento/reports.ts:56; src/lib/planejamento/revenue-execution-bridge.ts:24
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.18

**Fonte:** PDF p.257–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir consultar as alterações orçamentárias do PPA,
por entidade e consolidado, possibilitando informar até
qual data se pretende consultar, permitindo assim a
consulta por ordem cronológica;

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/reports.ts:5; src/lib/planejamento/legacy-reconciliation.ts:20; src/lib/planejamento/operations-core.ts:44
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.19

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consolidar duas ou mais entidades na previsão de
receita, despesa, transferência financeira e alteração
orçamentária;

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/versions.ts:18; src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.20

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Confrontar receitas e despesas do PPA por fonte e
destinação de recursos, consolidando uma ou mais
entidades e trazendo os valores orçados atualizados
até uma data;

- **Diagnóstico da faixa:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Gap a conferir:** Cortes, histórico e transferências/eliminações por ente, saldo e mesma versão/corte na consulta/emissão
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:23; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.21

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastro de emendas ao PPA. O cadastro
deve ter os campos: data, objetivo, justificativa, nome
do vereador responsável pela emenda e o texto jurídico.
No cadastro deve ser possível informar as dotações
que sofreram acréscimo ou redução;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/amendments.ts:15; src/lib/planejamento/reports.ts:5; src/lib/planejamento/versions.ts:66; src/lib/planejamento/credits.ts:27
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.22

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir realizar bloqueio das dotações que não podem
possuir emendas; Ao serem bloqueadas as mesmas
não   estarão   disponíveis   no   sistema   para   sofrer
emendas;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/amendments.ts:58; src/lib/planejamento/reduced-codes.ts:12; src/lib/planejamento/credits.ts:69; src/lib/planejamento/documents.ts:36
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.23

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   sancionar   as   emendas   do   orçamento.   No
sancionamento deve ser possível a aprovação total das
emendas,   a   reprovação   total   ou   o   sancionamento
parcial; No sancionamento parcial, deve ser possível
informar quais dotações foram sancionadas;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/versions.ts:19; src/lib/planejamento/amendments.ts:15; src/lib/planejamento/reports.ts:54; src/lib/planejamento/credits.ts:29
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.24

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatórios gerenciais de receitas, despesas por
fonte de recursos e das transferências financeiras; Os
relatórios devem possibilitar a emissão consolidada ou
selecionando uma ou mais entidades;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/imports.ts:17; src/lib/planejamento/accounting-bridge.ts:139
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.25

**Fonte:** PDF p.258–258. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir compatibilizar as despesas do PPA, replicando
automaticamente para a LDO e LOA as alterações
orçamentárias feitas no PPA;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:3; src/lib/planejamento/accounting-bridge.ts:138; src/lib/planejamento/imports.ts:75; src/lib/planejamento/navigation.ts:10
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.26

**Fonte:** PDF p.258–259. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta das metas físicas e realizas para cada
ano do PPA. A emissão deve ser possível consolidando
uma ou mais entidades e deve filtrar por ação e produto;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/imports.ts:17; src/lib/planejamento/versions.ts:18; src/lib/planejamento/service.ts:25
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.27

**Fonte:** PDF p.259–259. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   os   relatórios   consolidando   uma   ou   mais
entidades   e   trazendo   a   posição   atualizada   do
orçamento até a data selecionada:
Demonstrativo das Receitas;
Demonstrativo das Despesas;
Meta Financeira por Órgão e Unidade;
Meta Física por Programa e Ação;
Programas;
Programas Detalhados;
Anexo PPA Analítico;
Anexo PPA Sintético;
Detalhamento Órgão/Unidade Físico/Financeiro;
Receita por Ano e Receita Global;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/reports.ts:5; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:4
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.28

**Fonte:** PDF p.259–259. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório de compatibilização entre receitas e
despesas do PPA/LDO/LOA com posição atualizada
até a data selecionada e relatório de compatibilização
das   metas   de   despesas   entre   PPA/LDO/LOA   com
posição atualizada até a data selecionada;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/accounting-bridge.ts:35
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.29

**Fonte:** PDF p.259–259. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatório   possibilitando   a   avaliação   dos
resultados dos programas (Art. 4º, inciso I, “e” da LRF).
O relatório deverá conter a programação e execução
física e financeira por programa e ação, permitindo
selecionar os quatro anos do PPA ou apenas um ano
desejado;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:4; src/lib/planejamento/reports.ts:55; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/imports.ts:23
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.30

**Fonte:** PDF p.259–259. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerenciar versão para o PPA com controle de todas as
consultas e emissão de relatórios por versão;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:88; src/lib/planejamento/publication.ts:26; src/lib/planejamento/amendments.ts:64; src/lib/planejamento/classification.ts:23
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.31

**Fonte:** PDF p.259–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir demonstrativos de aplicação em saúde, pessoal
e   educação   com   os   respectivos   percentuais   de
aplicação e emitir o demonstrativo da Receita Corrente
Líquida;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/reports.ts:152; src/lib/planejamento/catalog.ts:14; src/lib/planejamento/municipal-data.ts:11
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.32

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório da receita do PPA, consolidado e por
entidade,   permitir   a   escolha   do   grau   da   receita   e
possibilitar a emissão da receita orçada e atualizada;

- **Diagnóstico da faixa:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Gap a conferir:** Ensaio das variantes e tramitação legislativa; execução LOA→ação/ano; índices apurados distintos dos projetados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:56; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:54; src/lib/planejamento/catalog.ts:14
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.33

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar LDO escolhendo o grau do plano de contas
de receita e despesa a ser utilizado, permitindo informar
no cadastro o projeto de lei e texto jurídico que aprovou
a LDO;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/versions.ts:18; src/lib/planejamento/reports.ts:110; src/lib/planejamento/accounting-bridge.ts:41; src/lib/planejamento/maintenance.ts:31
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.34

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar vínculos para a LDO de acordo com tabela
definida pelo TCE do Estado;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/policy.ts:44; src/lib/planejamento/publication.ts:45
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.35

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir alterações orçamentárias para a receita da LDO,
bem como a consulta de todas as alterações incluídas
e de uma receita específica. Na alteração deve permitir
informar a entidade, a conta de receita, a justificativa e
o texto jurídico;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/imports.ts:17
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.36

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar orçamento da receita e da despesa da LDO
com valor orçado atualizado até a data selecionada; A
consulta deve possibilitar a seleção de uma ou mais
entidades;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:17; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.37

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar   programas   e   ações   na   LDO   e   permitir
importar os dados de outro PPA, LDO ou LOA;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/credits.ts:29; src/lib/planejamento/imports.ts:31; src/lib/planejamento/legacy-reconciliation.ts:13; src/lib/planejamento/report-catalog.ts:7
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.38

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar previsão da despesa do PPA, da LOA ou de
LDO anterior. A importação deve permitir importar só as
dotações e dotações e valores;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:17; src/lib/planejamento/reports.ts:54; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/maintenance.ts:28
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.39

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar para a LDO a previsão da receita do PPA, da
LOA ou de LDO anterior;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:27; src/lib/planejamento/revenue-execution-bridge.ts:42; src/lib/planejamento/accounting-bridge.ts:139; src/lib/planejamento/maintenance.ts:28
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.40

**Fonte:** PDF p.260–260. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir atualizar as metas físicas da LDO e inserir as
metas   físicas   realizadas.   As   metas   realizadas
informadas na LDO devem atualizar automaticamente
as metas do PPA;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:136; src/lib/planejamento/accounting-bridge.ts:139; src/lib/planejamento/credits.ts:29; src/lib/planejamento/imports.ts:17
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.41

**Fonte:** PDF p.260–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consolidar duas ou mais entidades nas rotinas de
previsão de receita, despesa, transferência financeira e
alteração orçamentária da despesa;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/versions.ts:18; src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.42

**Fonte:** PDF p.261–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir consultar as alterações orçamentárias da LDO,
por entidade e consolidado, possibilitando informar até
qual data se pretende consultar, permitindo assim a
consulta por ordem cronológica;

- **Diagnóstico da faixa:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Gap a conferir:** Manutenção anual/versionada, alterações legais, importação origem/ano e realização com estorno sem duplicar
- **Fases:** P1, P2, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/reports.ts:5; src/lib/planejamento/legacy-reconciliation.ts:20; src/lib/planejamento/operations-core.ts:44
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.43

**Fonte:** PDF p.261–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastro de emendas na LDO. O cadastro
deve ter os campos: data, objetivo, justificativa, nome
do vereador responsável pela emenda e o texto jurídico.
No cadastro deve ser possível informar as dotações
que sofreram acréscimo ou redução;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/amendments.ts:15; src/lib/planejamento/reports.ts:5; src/lib/planejamento/versions.ts:66; src/lib/planejamento/credits.ts:27
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.44

**Fonte:** PDF p.261–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir realizar bloqueio das dotações que não podem
possuir emendas; Ao serem bloqueadas as mesmas
não   estarão   disponíveis   no   sistema   para   sofrer
emendas;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/amendments.ts:58; src/lib/planejamento/reduced-codes.ts:12; src/lib/planejamento/credits.ts:69; src/lib/planejamento/documents.ts:36
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.45

**Fonte:** PDF p.261–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   sancionar   as   emendas   do   orçamento.   No
sancionamento deve ser possível a aprovação total das
emendas,   a   reprovação   total   ou   o   sancionamento
parcial. No sancionamento parcial, deve ser possível
informar quais dotações foram sancionadas;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/versions.ts:19; src/lib/planejamento/amendments.ts:15; src/lib/planejamento/reports.ts:54; src/lib/planejamento/credits.ts:29
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.46

**Fonte:** PDF p.261–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Confrontar receitas e despesas da LDO por fonte e
destinação de recursos, consolidando uma ou mais
entidades e trazendo valor orçado atualizado até a data
selecionada;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:23; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.47

**Fonte:** PDF p.261–261. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir os relatórios gerenciais consolidando uma ou
mais entidades e com valor orçado atualizado até a data
selecionada:
Demonstrativo das Receitas;
Demonstrativo   das   Despesas   e   Programas   de
Trabalho;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.48

**Fonte:** PDF p.261–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir cadastro das obras que serão executadas no ano
da LDO informando a entidade responsável pela obra,
a descrição, a data de início, o valor previsto, o valor de
gastos com conservação, o valor em novos projetos e o
valor do ano da LDO;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/legacy-reconciliation.ts:20; src/lib/planejamento/year-rollover.ts:13
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.49

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório Demonstrativo de Obras e Conservação
do Patrimônio;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/municipal-data.ts:13; src/lib/planejamento/reports.ts:173; src/lib/planejamento/year-rollover.ts:50
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.50

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Gerenciar versão para a LDO com controle de todas as
consultas e relatórios por versão;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:88; src/lib/planejamento/amendments.ts:64; src/lib/planejamento/classification.ts:23; src/lib/planejamento/document-response.ts:17
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.51

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir, sobre os valores orçados, Demonstrativo das
Receitas   e   Despesas   com   Manutenção   e
Desenvolvimento do Ensino – MDE, Demonstrativo das
Receitas de Impostos e das Despesas Próprias com
Saúde e Demonstrativo da Despesa com Pessoal;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/reports.ts:142; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/imports.ts:54
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.52

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar memórias de cálculo conforme dispõem a
portaria da STN – Secretaria do Tesouro Nacional;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:20; src/lib/planejamento/municipal-data.ts:10; src/lib/planejamento/operations-core.ts:51; src/lib/planejamento/reports.ts:33
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.53

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatórios   de   memória   de   cálculo   conforme
disposto pela STN – Secretaria do Tesouro Nacional;

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:20; src/lib/planejamento/reports.ts:33; src/lib/planejamento/fiscal-execution.ts:28; src/lib/planejamento/imports.ts:50
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.54

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório de programas e ações, podendo emitir
o relatório por entidade e filtrando por programa, ação
e demais campos da dotação orçamentária. Permitir a
emissão por entidade e consolidado;
LOA   -   LEI   ORÇAMENTÁRIA ANUAL

- **Diagnóstico da faixa:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Gap a conferir:** Dados de obra completos, cenários e memórias/layouts oficiais; mesma fonte para quadros e detalhe
- **Fases:** P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:55; src/lib/planejamento/versions.ts:28; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/navigation.ts:9
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.55

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar a Lei orçamentária anual, permitindo informar
os dados do Projeto de lei e da Lei que a aprovou. No
cadastro deve ser possível incluir anexos;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/navigation.ts:9; src/lib/planejamento/policy.ts:55; src/lib/planejamento/report-catalog.ts:24
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3, R1
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.56

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar as fontes de recurso da LOA de acordo com
tabela definida pelo TC do Estado. Permitir relacionar
no cadastro das fontes qual o grupo, especificação e
detalhamento da STN;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:95; src/lib/planejamento/policy.ts:44; src/lib/planejamento/navigation.ts:14; src/lib/planejamento/report-catalog.ts:11
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.57

**Fonte:** PDF p.262–262. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro único de plano de contas para todas
as entidades;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/navigation.ts:9; src/lib/planejamento/accounting-bridge.ts:41; src/lib/planejamento/imports.ts:23; src/lib/planejamento/reports.ts:106
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.58

**Fonte:** PDF p.262–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O cadastro do plano de contas da receita deve permitir
a   inclusão   das   fontes   de   recurso,   sendo   possível
informar uma ou mais fontes desde que a soma dos
percentuais não ultrapasse 100%;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/accounting-bridge.ts:41; src/lib/planejamento/catalog.ts:14; src/lib/planejamento/navigation.ts:9
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.59

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar   programação   da   receita   e   da   despesa
identificando cada fonte e destinação de recurso;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/navigation.ts:13; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/accounting-bridge.ts:39
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.60

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar receitas e despesas da LOA anterior e da LDO.
Na importação da despesa permitir importar o valor
realizado no ano anterior;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/imports.ts:23; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/reports.ts:100; src/lib/planejamento/fiscal-execution.ts:23
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.61

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Informar receitas da LOA por meio de rateio automático
para cada conta de receita e suas respectivas fontes de
recursos.   O   valor   informado   deve   ser   rateado
automaticamente nos percentuais informado para cada
fonte;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/policy.ts:9; src/lib/planejamento/navigation.ts:13
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.62

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Incluir atualização de receitas mantendo o histórico das
inclusões. O cadastro das atualizações deve possuir a
entidade, tipo da atualização, data, valor, histórico e o
texto jurídico;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/versions.ts:35; src/lib/planejamento/legacy-reconciliation.ts:17
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.63

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar a inclusão de novas naturezas de receita
que não estavam previstas na LOA aprovada;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:136; src/lib/planejamento/navigation.ts:15; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:139
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.64

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Efetuar   lançamentos   contábeis   de   alteração
orçamentária   de   receita   automaticamente   na
contabilidade; Os lançamentos devem ser feitos no
momento da finalização da alteração;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:152; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:139; src/lib/planejamento/navigation.ts:10
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.65

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consultar orçamento de receita e despesa da LOA com
valor   orçado   atualizado   até   a   data   selecionada,
consolidando uma ou mais entidades;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/imports.ts:23; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.66

**Fonte:** PDF p.263–263. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar as despesas que compõem o orçamento,
com identificação do elemento de despesa, destinação
de recursos e valores. O cadastro deve ser feito por
entidade, permitindo consultar o total da entidade e
consolidado;

- **Diagnóstico da faixa:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Gap a conferir:** Catálogos homologados, anexos assinados da versão, implantada canônica, abertura/alteração atômica e consolidação
- **Fases:** P1, P3, P5, P7, P8, P9. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/imports.ts:17; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/service.ts:34
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.67

**Fonte:** PDF p.263–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastro de emendas na LOA. O cadastro
deve ter os campos: data, objetivo, justificativa, nome
do vereador responsável pela emenda e o texto jurídico.
No cadastro deve ser possível informar as dotações
que sofreram acréscimo ou redução;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/amendments.ts:15; src/lib/planejamento/reports.ts:5; src/lib/planejamento/versions.ts:66; src/lib/planejamento/credits.ts:27
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.68

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir realizar bloqueio das dotações que não podem
possuir emendas; Ao serem bloqueadas as mesmas
não   estarão   disponíveis   no   sistema   para   sofrer
emendas;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/amendments.ts:58; src/lib/planejamento/reduced-codes.ts:12; src/lib/planejamento/credits.ts:69; src/lib/planejamento/documents.ts:36
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.69

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   sancionar   as   emendas   do   orçamento.   No
sancionamento deve ser possível a aprovação total das
emendas, reprovação total ou o sancionamento parcial.
No sancionamento parcial, deve ser possível informar
quais dotações foram sancionadas;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/versions.ts:19; src/lib/planejamento/amendments.ts:15; src/lib/planejamento/reports.ts:54; src/lib/planejamento/credits.ts:29
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R6
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.70

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   nas   alterações   orçamentárias   adicionar
diversas dotações e subtrair de diversas fontes para
uma mesma Lei ou decreto;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:24; src/lib/planejamento/navigation.ts:10; src/lib/planejamento/reports.ts:200; src/lib/planejamento/accounting-bridge.ts:138
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.71

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Acompanhar histórico das alterações orçamentárias da
despesa por ordem cronológica;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:36; src/lib/planejamento/report-catalog.ts:3; src/lib/planejamento/maintenance.ts:54; src/lib/planejamento/navigation.ts:10
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.72

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Consolidar duas ou mais entidades na previsão de
receita, despesa, transferência financeira e alteração
orçamentária;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:106; src/lib/planejamento/versions.ts:18; src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:2
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.73

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Disponibilizar   no   início   do   exercício,   o   orçamento
aprovado para a execução orçamentária;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/maintenance.ts:43; src/lib/planejamento/reports.ts:54; src/lib/planejamento/execution-bridge.ts:30; src/lib/planejamento/navigation.ts:7
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.74

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar   cronograma   mensal   de   desembolso   por
entidade. A informação deve ser feita até o nível de
fonte de recursos;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/report-catalog.ts:17; src/lib/planejamento/scheduling.ts:14; src/lib/planejamento/credits.ts:29
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.75

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar valor mensal das metas de arrecadação por
entidade,   informando   os   valores   mês   a   mês   por
modalidade e fonte de recursos;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:56; src/lib/planejamento/revenue-execution-bridge.ts:24; src/lib/planejamento/report-catalog.ts:15; src/lib/planejamento/imports.ts:23
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.76

**Fonte:** PDF p.264–264. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o usuário gerencie os códigos reduzidos
para as contas de receita orçamentária e consignação;
No caso dos códigos reduzidos da despesa, permitir
reordená-los antes do início da execução orçamentária;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:35; src/lib/planejamento/reports.ts:116; src/lib/planejamento/imports.ts:36; src/lib/planejamento/reduced-codes.ts:12
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R2
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.77

**Fonte:** PDF p.264–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   rotina   para   incluir   previa   da   alteração
orçamentária   da   despesa.   Na   rotina   devem   ser
informados   os   dados:   entidade,   tipo   (suplementar,
especial, etc), origem dos recursos e o valor. Deve ser
possível incluir vários lotes de alteração e ao final
realizar   a   impressão   do   decreto   e   projeto   de   lei,
conforme   o   caso.   Ao   ser aprovada   a   previa,   deve
possibilitar a efetivação, gerando automaticamente a
alteração   orçamentária,   bem   como   os   lançamentos
contábeis sem necessidade de redigitação dos dados;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/credits.ts:6; src/lib/planejamento/versions.ts:7; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.78

**Fonte:** PDF p.265–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A previa da alteração deve bloquear o valor na dotação
a   ser   anulada,   desbloqueando   automaticamente   ao
efetivar os lançamentos de suplementação e anulação,
quando da efetivação da alteração;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/operations-core.ts:75; src/lib/planejamento/credits.ts:16; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/reports.ts:54
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.79

**Fonte:** PDF p.265–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina de consistência de dados para o PPA,
LDO e LOA que identifique possíveis inconsistências na
elaboração dos mesmos. Deve ser possível executar as
consistências por peça orçamentária;

- **Diagnóstico da faixa:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Gap a conferir:** Concorrência com consumidores reais, reserva/anulação e ato final, conta/classificação válida e dados executados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/versions.ts:14; src/lib/planejamento/service.ts:18; src/lib/planejamento/reduced-codes.ts:28; src/lib/planejamento/accounting-bridge.ts:24
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.80

**Fonte:** PDF p.265–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   cronograma   de   desembolso   por   fonte   de
recursos   e   por   mês   com   geração   de   relatório.   O
cronograma   deve   ser   incluído   por   entidade,
possibilitando a consulta dos valores por entidade e
consolidado;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/imports.ts:17; src/lib/planejamento/report-catalog.ts:17; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7, R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.81

**Fonte:** PDF p.265–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cadastrar metas de arrecadação por fonte de recursos
e por mês com geração de relatório. O cadastro das
metas deve ser incluído por entidade, possibilitando a
consulta dos valores por entidade e consolidado;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:54; src/lib/planejamento/imports.ts:17; src/lib/planejamento/report-catalog.ts:15; src/lib/planejamento/revenue-execution-bridge.ts:24
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7, R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.82

**Fonte:** PDF p.265–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   a   impressão   dos   decretos   para
suplementação;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/operations-core.ts:101; src/lib/planejamento/report-catalog.ts:26
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8, R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.83

**Fonte:** PDF p.265–265. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Implantar orçamento bloqueando a inclusão, exclusão
ou alteração de previsões de receita e despesa. Na
implantação do orçamento, as dotações orçamentárias
devem   ficar   disponíveis   para   utilização   por   outros
módulos, como por exemplo, o de licitações e contratos
para que se possa dar andamento as licitações do ano
seguinte;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/versions.ts:18; src/lib/planejamento/reports.ts:152; src/lib/planejamento/maintenance.ts:28; src/lib/planejamento/accounting-bridge.ts:88
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.84

**Fonte:** PDF p.265–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   na   implantação   do   orçamento,   a   cópia
automática   de   todos   os   relacionamentos   e
configurações existentes na base, para que não seja
necessário redigitar os dados no novo ano;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:41; src/lib/planejamento/reports.ts:34; src/lib/planejamento/versions.ts:86; src/lib/planejamento/maintenance.ts:43
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R4
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.85

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatórios   da   Lei   4320/64   com   opção   de
publicação simultânea no portal da transparência;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/publication.ts:32; src/lib/planejamento/credits.ts:78; src/lib/planejamento/legislative-bridge.ts:54; src/lib/planejamento/report-catalog.ts:33
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9, R10
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.86

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar cotas de despesa por entidade;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:54; src/lib/planejamento/execution-bridge.ts:86; src/lib/planejamento/imports.ts:23; src/lib/planejamento/navigation.ts:16
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.87

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Configurar o controle das cotas de despesa para os
períodos: bimestral, trimestral e semestral;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:139; src/lib/planejamento/execution-bridge.ts:86; src/lib/planejamento/report-catalog.ts:3; src/lib/planejamento/scheduling.ts:74
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.88

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que nas alterações orçamentárias as cotas
sejam atualizadas automaticamente;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:23; src/lib/planejamento/operations-core.ts:79; src/lib/planejamento/accounting-bridge.ts:138; src/lib/planejamento/execution-bridge.ts:86
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R8
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.89

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatório   de   acompanhamento   das   cotas   de
despesa demonstrando valor previsto e valor realizado;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:142; src/lib/planejamento/scheduling.ts:43; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/execution-bridge.ts:45
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7, R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.90

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Calcular os valores das cotas com base nos valores:
Realizados no ano anterior, onde o sistema calcula os
valores mês a mês com base no executado no ano
anterior;
Realizados   nos   últimos   três   anos,   onde   o   sistema
calcula os valores mês a mês com base no executado
nos últimos três anos e Dividindo o valor orçado por 12
meses;

- **Diagnóstico da faixa:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Gap a conferir:** Homologar S2/S5/S8, todas as variantes de anexos, reprodução de cortes e históricos reais/legados reconciliados
- **Fases:** P2, P3, P4, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:34; src/lib/planejamento/scheduling.ts:13; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/imports.ts:27
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.91

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina para que o usuário possa definir qual
percentual deseja informar para cada mês do ano e o
sistema divide o valor orçado para cada mês de acordo
com o percentual informado;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:95; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/execution-bridge.ts:7; src/lib/planejamento/revenue-execution-bridge.ts:4
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.92

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir contingenciamento do orçamento, aplicando
um percentual de redução sobre todo o orçamento ou
sobre uma dotação específica;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/execution-bridge.ts:30; src/lib/planejamento/reports.ts:95; src/lib/planejamento/scheduling.ts:74; src/lib/planejamento/amendments.ts:43
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.93

**Fonte:** PDF p.266–266. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir liberação dos valores contingenciados;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/imports.ts:88; src/lib/planejamento/legacy-reconciliation.ts:24; src/lib/planejamento/reports.ts:142
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.94

**Fonte:** PDF p.266–267. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir remover os valores de cotas não utilizadas em
meses já fechados e distribuí-las em meses abertos;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/scheduling.ts:13; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/execution-bridge.ts:47; src/lib/planejamento/reports.ts:142
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R7
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.95

**Fonte:** PDF p.267–267. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina de compatibilização da LOA com PPA e
LDO para que as peças orçamentárias fiquem iguais
cumprindo assim as exigências legais;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:14; src/lib/planejamento/versions.ts:35; src/lib/planejamento/credits.ts:71; src/lib/planejamento/navigation.ts:10
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R5
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.96

**Fonte:** PDF p.267–267. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar consulta entre as receitas e despesas da
LOA por fonte de recursos, permitindo consultar os
dados de uma ou mais entidades e realizar a impressão
dos dados consultados;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:95; src/lib/planejamento/imports.ts:23; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/navigation.ts:14
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.97

**Fonte:** PDF p.267–267. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   das   alterações   orçamentárias,
permitindo selecionar qualquer item da classificação da
despesa (MCASP) e os dados relacionados a alteração
orçamentária. O relatório deve possuir os seguintes
filtros: entidade, data (de/até) credito adicional e origem
de recursos. Deve possibilitar a emissão por órgão,
unidade, programa, ação, função, subfunção e fonte de
recursos;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/reports.ts:5; src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/versions.ts:18; src/lib/planejamento/accounting-bridge.ts:18
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.98

**Fonte:** PDF p.267–267. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir, sobre os valores orçados, Demonstrativo das
Receitas   e   Despesas   com   Manutenção   e
Desenvolvimento do Ensino – MDE, Demonstrativo das
Receitas de Impostos e das Despesas Próprias com
Saúde e Demonstrativo da Despesa com Pessoal;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/reports.ts:142; src/lib/planejamento/accounting-bridge.ts:18; src/lib/planejamento/imports.ts:54
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## LEG-01.99

**Fonte:** PDF p.267–267. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir cadastro de renúncia de receita e respectiva
compensação com emissão de relatório de renúncias
objetivando o atendimento a LRF, art. 5º, inciso II;

- **Diagnóstico da faixa:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Gap a conferir:** Ciclo inteiro com estornos, dimensão/filtros exigidos, origem tributária do benefício e metodologia fiscal
- **Fases:** P2, P3, P5, P7, P8. **Responsável funcional:** Planejamento Câmara (pessoa a designar).
- **Fontes municipais:** 079, 081, 082, 083, 084, 085, 105 (referências do Executivo; obter fontes da Câmara).
- **Base candidata:** src/lib/planejamento/report-catalog.ts:2; src/lib/planejamento/reports.ts:152; src/lib/planejamento/fiscal-execution.ts:23; src/lib/planejamento/year-rollover.ts:50
- **Reuso:** docs/EVIDENCIAS_PLANEJAMENTO_CAMARA.md — R3, R9
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
