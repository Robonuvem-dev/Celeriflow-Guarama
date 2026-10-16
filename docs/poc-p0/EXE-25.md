# P0 — EXE-25: Gestão e Escrita Fiscal

Ente: **PREFEITURA**. 65 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-25.1

**Fonte:** PDF p.174–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   possuir   cadastro   Mobiliário   Único
integrado ao sistema de arrecadação do município.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/app/app-domain/tributacao/operacoes/actions.ts:31; src/lib/tributacao/index.ts:66; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.2

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   funcionalidade   para   escrituração   dos
Prestadores   de   Serviços   e   Tomadores   de   Serviço
estabelecidos   no   município,   onde   os   contribuintes
poderão declarar seus documentos fiscais.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210; src/app/app-domain/tributacao/nfse/NfseClient.tsx:314; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:11; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:24
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.3

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na escrituração via digitação de documentos fiscais de
serviços, deve solicitar no mínimo as informações do
número   do   documento,   data   de   emissão,   local   da
prestação do serviço, Item da Lista de serviço conforme
LC   116/03,   valor   do   serviço,   alíquotas   e   o
tomador/prestador do serviço.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:28; src/lib/tributacao/nfse-danfse.ts:5; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33; src/lib/tributacao/s4-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.4

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   alterar   qualquer   documento   fiscal   já
declarado, desde que não seja oriundo do sistema de
emissão de NFS-e.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:19; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.5

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   também   permitir   escrituração   de   documentos
fiscais de serviços prestados e tomados, através de
importação de arquivo no formato txt, conforme layout
definido pelo município;

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:314; src/lib/tributacao/s5-service.ts:10; src/lib/tributacao/s6-service.ts:7; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.6

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve efetuar o cálculo automático do tributo devido com
base   nas   informações   dos   documentos   fiscais
declarados.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:15; src/lib/tributacao/index.ts:50
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.7

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o contribuinte possa escolher sobre quais
documentos deseja emitir o boleto para pagamento do
ISSQN.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:223; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210; src/lib/tributacao/s8-service.ts:96; src/lib/tributacao/s9-engine.ts:24
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.8

**Fonte:** PDF p.175–175. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   os   contadores   tenham   acesso   aos
documentos   declarados   pelos   seus   clientes   e   que
possam executar movimentações, como declaração de
novos documentos e emissão dos boletos.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s7-service.ts:279; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:385; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.9

**Fonte:** PDF p.175–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   o   fisco   consiga   identificar,   através   de
consulta ou relatório, serviços prestados por empresas
de fora do Município, serviços prestados por empresas
estabelecidas no município, serviços prestados para
fora   da   cidade   por   empresas   estabelecidas   no
município.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:314; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:11; src/lib/tributacao/index.ts:182; src/lib/tributacao/nfse-danfse.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.10

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório com relação dos itens da lista de
serviços com maiores arrecadações/declarações.

- **Diagnóstico da faixa:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Gap a conferir:** PARCIAL em `TaxDeclaration`/DMS. Declarar por documento, origem protegida, seleção→guia, cálculo por legislação/local/retido e representação; TXT ao final
- **Fases:** P2, P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:39; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:55; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:346; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:38
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.11

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   funcionalidade   onde   os   contribuintes   e
contadores   possam   solicitar   a   criação   de   novo
cadastro,   a   alteração   de   cadastro,   vínculo   de
responsabilidade,   baixa   de   responsabilidade.   Esta
solicitação deve ficar pendente para análise do fisco,
podendo ser deferida ou indeferida.

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.12

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao deferir um cadastro do tipo Novo, o fisco deverá ter
a   possibilidade   de   autorizar   que   o   sistema   incluía
usuário de acesso ao sistema para o mesmo de forma
automática;

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:385; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:289; src/lib/tributacao/s3-service.ts:43
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.13

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao deferir um cadastro do tipo novo, o fisco deverá ter
a possibilidade incluir autorização para utilização de
NFS-e de forma automática;

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:124; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:289; src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:142
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.14

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir ao fisco municipal cadastrar, alterar e alterar a
situação cadastral de inscrições municipais;

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:174; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:17; src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.15

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   possuir   a   funcionalidade   de
complementar e/ou retificar uma declaração;

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:194; src/lib/tributacao/s10-service.ts:181; src/lib/tributacao/s3-service.ts:84; src/lib/tributacao/s5-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.16

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o fisco municipal configure previamente
quais naturezas de operação estarão disponíveis para
cada item da lista de serviço. No momento de efetuar a
escrituração   de   um   documento   fiscal,   somente   as
naturezas   de   operação   previamente   configuradas
poderão   aparecer   para   seleção   por   parte   do
contribuinte.

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:28; src/app/app-domain/tributacao/nfse/NfseClient.tsx:52
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.17

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ter a possibilidade para configurar a exigência ou não,
de assinatura digital no momento do fechamento da
escrituração fiscal, podendo criar exceção para Micro
Empreendedores Individuais.

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s3-service.ts:42; src/lib/tributacao/s9-service.ts:210; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:223; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:23
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.18

**Fonte:** PDF p.176–176. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração do recibo de declaração de ISS e de
ISS retido pelo próprio contribuinte;

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:217; src/lib/tributacao/s4-service.ts:76; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:185
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.19

**Fonte:** PDF p.176–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao efetuar a declaração de um documento fiscal para
escrituração, deve solicitar no mínimo as informações
de   número   de   documento,   razão   social   do
declarante/contribuinte,   CNPJ/CPF,   endereço
completo,   número   de   inscrição   municipal,   quando
existir,   data   de   emissão   do   documento,   valor   dos
serviços prestados e/ou tomados e alíquota.

- **Diagnóstico da faixa:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Gap a conferir:** PARCIAL em credenciamento/cadastros; completar fluxo cidadão/fisco e assinatura no fechamento, receipt/layout e versões de declaração
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:28; src/lib/tributacao/s9-service.ts:5; src/lib/tributacao/s3-service.ts:34; src/lib/tributacao/s7-service.ts:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.20

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Quando a incidência do imposto for no município a
alíquota deve ser previamente carregada conforme o
cadastro municipal, não permitindo alteração. Exceto
para empresas enquadradas como Simples Nacional.

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/redesim/RedesimClient.tsx:13; src/lib/tributacao/nfse-danfse.ts:3; src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:20
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.21

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a escrituração de serviços eventuais, por parte
de contribuintes de outros municípios.

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:368; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/itbi/[id]/documento/route.ts:12; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.22

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir ao declarante fazer solicitação de acesso ao
sistema. Esta solicitação deve ser analisada e deferida,
ou indeferida, pelos servidores do município.

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s3-service.ts:48; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:2; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.23

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que os contribuintes concedam permissão de
acesso   aos   seus   colaboradores,   desde   que   estes
também tenham usuário criado no sistema.

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:109; src/lib/tributacao/s7-service.ts:11; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:385; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.24

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir declarações retificadoras com a
possibilidade de emissão de nova guia de pagamento,
no caso de alteração do valor do ISSQN devido;

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:755; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/index.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.25

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   possuir   integração   com   o   ADN   -
Ambiente   de   Dados   Nacional,   podendo   receber
documentos oriundos de outros municípios, desde que
possuam convénio com receita federal.

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s5-service.ts:6; src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.26

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve receber os documentos fiscais gerados
pelos contribuintes MEI no Sistema Nacional.

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210; src/app/app-domain/tributacao/layout.tsx:14; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10; src/lib/tributacao/s5-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.27

**Fonte:** PDF p.177–177. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Para permitir a integração com o ADN, sistema deve
aceitar   apenas   um   item   enumerado   na   Lista   de
Serviços (LC 116/03) por documento fiscal declarado;

- **Diagnóstico da faixa:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Gap a conferir:** PARCIAL; aplicar competência e autorização de cálculo, isolamento por pessoa/representado e complementar; recebimento ADN/MEI ao final
- **Fases:** P5, P9, P10. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.28

**Fonte:** PDF p.177–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   permitir   que   o   município   configure
declarações   de   serviços   customizadas,   onde   o
município poderá definir campos a serem preenchidos
pelo contribuinte e também definir a fórmula de cálculo.
Deverá ainda permitir enquadrar e desenquadrar os
cadastros mobiliários que utilizarão estas declarações
customizadas.

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/index.ts:23; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s3-service.ts:83; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.29

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastro de novos tomadores/prestadores de
serviço pelos próprios declarantes, no momento da
declaração do documento fiscal;

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:318; src/lib/tributacao/s5-service.ts:26; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:26
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.30

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   escrituração   de   serviços   prestados   e
tomados   para   contribuintes   isentos,   imunes,   com
regime de estimativa e regime fixo;

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:780; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:176; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:72; src/app/app-domain/tributacao/vaf/VafClient.tsx:31
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.31

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração parcelas complementares por parte
do contribuinte, sem intervenção do Município e sem
perder a referência com a competência a qual ela
complementa;

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/nfse-danfse.ts:8; src/app/app-domain/tributacao/guias/[id]/route.ts:14; src/app/app-domain/tributacao/nfse/NfseClient.tsx:300; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.32

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   o   contribuinte   faça   a   inclusão   de
requisições   de   compensação   (valor   pago   a   maior).
Após   deferido   pelo   Município,   os   valores   desta
requisição ficarão disponíveis para serem abatidos do
valor devido de competências futuras;

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/index.ts:13; src/lib/tributacao/s2-service.ts:8; src/lib/tributacao/s4-service.ts:75; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.33

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina para autorizar a utilização de redução de
alíquota e redução da base de cálculo.

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/itbi/ItbiClient.tsx:11; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19; src/app/app-domain/tributacao/nfse/[id]/xml/route.ts:9; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.34

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Para a redução da base de cálculo, deve ser possível
definir   quais   itens   da   lista   de   serviço   (LC116/03)
poderão   sofrer dedução,   podendo   ainda determinar
qual o percentual máximo para dedução;

- **Diagnóstico da faixa:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Gap a conferir:** PARCIAL no motor/crédito/benefício; fluxo completo e limites NÃO VERIFICADOS. Tratamento de crédito entre competências com saldo/fundamento e sem dupla utilização
- **Fases:** P2, P5. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/lib/tributacao/index.ts:12; src/lib/tributacao/s4-service.ts:66; src/lib/tributacao/fiscal-engine.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.35

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a configuração e lançamento de multa para
contribuintes que entregarem sua escrituração fora do
prazo definido pelo município. Está multa poderá ser
para escrituração de serviços prestados, tomados e
ambos.

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:2; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.36

**Fonte:** PDF p.178–178. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A multa deve ser lançada forma automática, quando o
contribuinte efetuar a escrituração;

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s9-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.37

**Fonte:** PDF p.178–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir também a escrituração de forma
automática   pelo   sistema,   em   caso   do   contribuinte
deixar de executar.

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.38

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Atender a LC 123/2006 referente ao Simples Nacional,
solicitando o faturamento das empresas e calculando a
alíquota automaticamente.

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:121; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:20; src/app/app-domain/tributacao/vaf/VafClient.tsx:120; src/lib/tributacao/__tests__/s5-engine.test.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.39

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o contribuinte entregue sua escrituração
como sem movimento;

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/motor-fiscal/[id]/page.tsx:17; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:72; src/app/app-domain/tributacao/nfse/NfseClient.tsx:756
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.40

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que os contribuintes façam a exportação de
documentos   declarados   em   formato   txt,   utilizando
layout pré-definido pelo município;

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210; src/app/app-domain/tributacao/layout.tsx:10; src/lib/tributacao/nfse-danfse.ts:12; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.41

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve possuir consulta com histórico de todas
as escriturações efetuadas pelos contribuintes;

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/s10-engine.ts:174
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.42

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a configuração de valor mínimo para geração
de boletos. Caso uma competência não atingir este
valor, ele deve ficar acumulado e ser somado a próxima
competência, assim sucessivamente, até atingir o valor
definido.

- **Diagnóstico da faixa:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Gap a conferir:** PARCIAL em DMS/Simples; concluir cálculo, jobs e memória, nunca inventar base de omisso; acumulação rastreável; TXT ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:25; src/app/app-domain/tributacao/recadastramento/actions.ts:16; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:185; src/lib/tributacao/fiscal-engine.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.43

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   escrituração   de   Instituições   Financeiras
através da importação de declaração da DES-IF no
padrão ABRASF.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6; src/lib/tributacao/s5-service.ts:15; src/lib/tributacao/s6-service.ts:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.44

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   gerenciamento   dos   planos   de   contas   das
instituições financeiras, disponível ao fisco do município
e   para   os   responsáveis   pelas   declarações   das
instituições financeiras, podendo o fisco do município
acessar todos os planos de contas das instituições
financeiras.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:314; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:28; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:336; src/app/app-domain/tributacao/divida-ativa/cda/[id]/pdf/route.ts:23
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.45

**Fonte:** PDF p.179–179. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   que   as   instituições   financeiras   possam
cadastrar as contas colocando os dados como: número
da conta, nome da conta, descrição da conta, código
COSIF   da   qual   a   conta   está   vinculada,   código   da
atividade da qual a mesma está correlacionada.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:3; src/lib/tributacao/index.ts:12; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.46

**Fonte:** PDF p.179–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   as   instituições   financeiras   possam
cadastrar   suas   contas   através   da   importação   de
arquivos,   através   de   layout   disponibilizado   pelo
software.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:143; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:26; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.47

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir lançamento por Plano de contas COSIF e Plano
de   Contas   de   cada   Instituição   Financeira,   ambos
deverão possuir relacionamento com os códigos de
serviço pertinentes.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s6-service.ts:23; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:48; src/lib/tributacao/index.ts:105; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:58
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.48

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar a importação de declaração de Instituições
Financeiras (DESIF), com obrigatoriedade do grupo
contábil 7.0.0.00.00-9, e também para o grupo contábil
8.0.0.00.00-6, no padrão ABRASF, conforme definido
na legislação municipal.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s6-service.ts:3; src/lib/tributacao/s7-service.ts:91; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:123
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.49

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   a   importação   de   arquivos   de   Informações
Comuns aos Municípios com a Tabela de Tarifas.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:143; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6; src/lib/tributacao/s5-service.ts:15
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.50

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Importar os arquivos de apuração mensal do ISSQN,
discriminando   a   identificação   da   dependência,
demonstrativo da apuração da receita tributável e do
ISSQN mensal devido por subtítulo e demonstrativo do
ISSQN mensal a recolher, no padrão ABRASF.

- **Diagnóstico da faixa:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Gap a conferir:** PARCIAL no modelo/apuração; quatro módulos/arquivos e consultas completos NÃO VERIFICADOS. Consolidar domínio interno e parsers oficiais no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:139; src/lib/tributacao/s6-service.ts:42; src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/mapa/route.ts:3; src/lib/tributacao/nfse-danfse.ts:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.51

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a importação de arquivo com as informações
do   demonstrativo   das   partidas   contábeis   (Partidas
Dobradas).

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s5-service.ts:15; src/lib/tributacao/s6-service.ts:50
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.52

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório para o cruzamento entre as contas
declaradas   pela   Instituição   Financeira   com   os
demonstrativos contábeis da Instituição, apontando as
divergências encontradas.

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:216; src/app/app-domain/tributacao/vaf/VafClient.tsx:190; src/lib/tributacao/index.ts:230; src/lib/tributacao/s10-service.ts:290
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.53

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   demonstrativo   da   arrecadação   por   conta
COSIF das Instituições Financeiras com domicilio fiscal
no município.

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/mapa/route.ts:3; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:12; src/app/app-domain/tributacao/layout.tsx:16; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.54

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta do Balancete Analítico por cadastro
mobiliário e pelo CPF/CNPJ da instituição financeira.

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:28; src/lib/tributacao/s6-service.ts:16; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:7; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:64
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.55

**Fonte:** PDF p.180–180. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   importação   dos   quatros   módulos   da
declaração DES-IF no padrão ABRASF;

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s5-service.ts:15; src/lib/tributacao/s6-service.ts:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.56

**Fonte:** PDF p.180–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na consulta de importação dos dados de Demonstrativo
Contábil, deve possuir a discriminação da identificação
da   dependência,   balancete   analítico   mensal   e
demonstrativo de rateio de receitas.

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.57

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na consulta de importação do arquivo de Apuração
Mensal   do   ISSQN,   apresentar   a   Identificação   da
dependência, Demonstrativo da apuração da receita
tributável e do ISSQN a recolher;

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:139; src/lib/tributacao/s6-service.ts:50; src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/mapa/route.ts:3; src/lib/tributacao/nfse-danfse.ts:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.58

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Manter registro das importações do Plano Geral de
Contas Comentado;

- **Diagnóstico da faixa:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Gap a conferir:** PARCIAL; comprovar todas as coleções e versões, rateios/partidas e memória; usar imposto apurado/recebido distintamente
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:187; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:23; src/app/app-domain/tributacao/fiscalizacao/s7-actions.ts:15; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:139
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.59

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   geração   e   impressão   livro   fiscal,   para
serviços prestados e tomados.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:522; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:23; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.60

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a inclusão e controle de procurações digitais.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:17; src/app/app-domain/tributacao/layout.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.61

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   que   apresente   a   arrecadação   por
conta COSIF.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/guias/GuiasClient.tsx:10; src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/mapa/route.ts:3; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:8; src/lib/tributacao/index.ts:82
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.62

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   solicitação   de   atualização   cadastral   de
contribuintes que   não possuam   cadastro mobiliário.
Está solicitação deve passar por análise do fisco, e
quando   deferida   deve   atualizar   o   cadastro   do
contribuinte. Deve ser possível pedir atualização de
dados de Nome/Razão Social, Contato e Endereço.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:3; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.63

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o município configure e defina o layout dos
documentos de recibo de entrega que deseja utilizar.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:205; src/app/app-domain/tributacao/layout.tsx:10; src/lib/tributacao/nfse-danfse.ts:12; src/lib/tributacao/s7-service.ts:279
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.64

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Para   declarações   de   serviço   de   construção   Civil,
permitir que o município configure se irá solicitar a
informação do CNO da obra, sendo esta informação
opcional ou obrigatória.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:2; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:2; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-25.65

**Fonte:** PDF p.181–181. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve atender a Lei Nº13352/2016.

- **Diagnóstico da faixa:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Gap a conferir:** PARCIAL em procuração/DTE; livro/layouts/regras completas NÃO VERIFICADAS. Tratar salão-parceiro/profissional-parceiro conforme requisito/norma, sem generalizar dedução livre
- **Fases:** P5, P7. **Responsável funcional:** Tributação/Escrita Fiscal (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/imoveis/property-actions.ts:18; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/app/app-domain/tributacao/operacoes/actions.ts:31
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
