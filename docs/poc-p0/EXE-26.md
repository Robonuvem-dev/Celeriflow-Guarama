# P0 — EXE-26: Gestão e Fiscalização Fazendária

Ente: **PREFEITURA**. 95 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-26.1

**Fonte:** PDF p.181–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir o controle de autorizações para
utilização de Impressoras de Cupom Fiscal. Na inclusão
do pedido de Autorização deve solicitar no mínimo as
informações   das   empresas   solicitantes,   a   data   da
solicitação   e   o   modelo   do   equipamento   com   seu
número de série de fabricação. Deve permitir as ações
de Deferimento, Indeferimento, Alteração e também
Impressão da Autorização.

- **Diagnóstico da faixa:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Gap a conferir:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/nfse/NfseClient.tsx:28; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.2

**Fonte:** PDF p.182–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   o   cadastro   e   controle   das empresas
gráficas autorizadas a fazer a impressão dos blocos de
notas fiscais.

- **Diagnóstico da faixa:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Gap a conferir:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/layout.tsx:14; src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/page.tsx:25; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.3

**Fonte:** PDF p.182–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir o controle das autorizações de
impressão de notas fiscais. Na inclusão do pedido de
Autorização deve solicitar no mínimo as informações
das empresas solicitantes,   a data de   validade   e a
quantidade de blocos. Deve ainda permitir a alteração,
consulta, cancelamento e impressão da autorização;

- **Diagnóstico da faixa:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Gap a conferir:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:28; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.4

**Fonte:** PDF p.182–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   permitir   incluir   autorizações   para
incineração   de   Notas   Fiscais,   estas   devem   estar
relacionadas com as autorizações de impressão de
notas fiscais. Ou seja, somente uma autorização de
impressão de notas fiscais já autorizada pode receber
uma autorização de incineração.

- **Diagnóstico da faixa:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Gap a conferir:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/index.ts:66; src/lib/tributacao/s3-service.ts:84; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s4-engine.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.5

**Fonte:** PDF p.182–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   o   cadastro   e   configuração   das   infrações
previstas da legislação municipal. Permitindo configurar
ao menos os percentuais de penalidade, com valores
diferenciados   para   reincidentes,   o   tributo   para
lançamento   do   débito   e   espaço   para   descrever   a
fundamentação legal.

- **Diagnóstico da faixa:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Gap a conferir:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:55; src/lib/tributacao/s9-service.ts:5; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:17; src/lib/tributacao/s3-service.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.6

**Fonte:** PDF p.182–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   ser   possível   definir   se   a   multa   de   infração
acessória   será   lançada   junto   ao   documento   de
autuação principal ou se será gerada em lançamento
separado.

- **Diagnóstico da faixa:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Gap a conferir:** PARCIAL em regras/registro fiscal; ciclos ECF/AIDF/incineração NÃO VERIFICADOS. Formulários e transições próprias, não texto genérico
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:107; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.7

**Fonte:** PDF p.182–182. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve possuir o registro e controle de todas as
visitas realizadas as empresas pelo fisco municipal.
Neste registro deve possuir ao menos a identificação da
empresa, o fiscal responsável pela visita, a data da
visita e o motivo.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:5; src/lib/tributacao/s3-service.ts:39; src/lib/tributacao/s10-service.ts:34; src/lib/tributacao/s4-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.8

**Fonte:** PDF p.182–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   criar   classificações   para   os
procedimentos   fiscais,   permitindo   que   os
procedimentos fiscais sejam agrupados por áreas de
interesse.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:40; src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:127; src/app/app-domain/tributacao/imoveis/property-actions.ts:18; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.9

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve possuir cadastro de todos os serviços possíveis
de   execução   pelo   fisco   municipal,   bem   como   a
possibilidade   de   definir   uma   pontuação   para   cada
serviço.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/nfse/NfseClient.tsx:52; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10; src/lib/tributacao/index.ts:66
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.10

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir incluir procedimentos fiscais para, ao menos,
empresas   estabelecidas   no   município,   contribuintes
eventuais   de   fora   do   município   e   para   instituições
financeiras.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/page.tsx:25; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:221; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.11

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o gerenciamento de todos os procedimentos
fiscais cadastrados, permitindo filtros de pesquisa no
mínimo   por   fiscal   responsável,   pelo   contribuinte
fiscalizado, pelo ano e número do procedimento fiscal,
pela data da inclusão e pela situação.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11; src/app/app-domain/tributacao/nfse/NfseClient.tsx:28; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.12

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar   o   status   dos   procedimentos   fiscais
cadastrados com situação: aberto, iniciada, fechada ou
cancelada;

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:64; src/lib/tributacao/s2-service.ts:72; src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:15; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.13

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a inclusão de documentos como anexo do
procedimento fiscal.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:401; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:6; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:23; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.14

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir serviço de denuncia fiscal, onde os cidadãos
poderão   informar   ao   fisco   possíveis   irregularidade.
Deve permitir que o cidadão se identifique ou faça a
denúncia de forma anônima.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s6-service.ts:7; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/recadastramento/actions.ts:11; src/lib/tributacao/s4-service.ts:50
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.15

**Fonte:** PDF p.183–183. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir a alteração, cancelamento e transferência
do procedimento fiscal entre usuários do grupo fisco.

- **Diagnóstico da faixa:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Gap a conferir:** PARCIAL em ordens/planos. Completar entidades/ações, fonte canônica de denúncia e escopo por fiscal, inclusive alteração/transferência
- **Fases:** P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/lib/tributacao/s4-service.ts:50; src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.16

**Fonte:** PDF p.183–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   geração,   em   formato   PDF,   de   todos   os
documentos inerentes a um procedimento fiscal, sendo
eles Termo de início, Intimação, Termo de recebimento
de documentos, Termo de devolução de documentos,
Termo de apreensão de documentos, Documentos de
autuação   Principal   e   Acessório,   Planilha   de
Homologação da Fiscalização, Termo de prorrogação
fiscal e o Termo de encerramento de fiscalização;

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/lib/tributacao/s6-service.ts:13; src/lib/tributacao/s9-service.ts:279
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.17

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   a   geração   de   múltiplas   intimações,
conforme a necessidade do fisco.

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/index.ts:66; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/imoveis/property-actions.ts:18; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.18

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   prorrogação   da   ação   fiscal   conforme   a
necessidade do fisco.

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:39; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:6; src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:105
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.19

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Quando necessário, deve permitir a geração de termos
adicionais, conforme a necessidade do fiscal, sem a
necessidade de novos desenvolvimentos no software.

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s2-service.ts:3; src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/imoveis/property-actions.ts:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.20

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir o envio de todos os termos gerados para
o e-mail dos contribuintes fiscalizados, no decorrer da
ação fiscal. Deve ainda permitir consultar todos os e-
mails já enviados.

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s3-service.ts:34; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s5-service.ts:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.21

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir configurar textos padrões para o e-mail de cada
termo, que será enviado no corpo do e-mail.

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:266; src/lib/tributacao/s7-service.ts:82; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:3; src/lib/tributacao/s6-service.ts:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.22

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   possuir   integração   com   o   Domicilio
Eletrônico do Contribuinte, permitindo enviar todos os
termos, em forma de comunicado, para o contribuinte
fiscalizado, no decorrer da ação fiscal.

- **Diagnóstico da faixa:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Gap a conferir:** PARCIAL em TIAF/recebimento/devolução/apreensão/DTE. Conferir também autuações principal/acessória, planilha, prorrogação/encerramento e modelos extras; e-mail real ao final
- **Fases:** P5, P7, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:167; src/app/app-domain/tributacao/recadastramento/actions.ts:11; src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s9-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.23

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o fiscal faça a homologação da ação fiscal,
podendo   alterar,   incluir   ou   excluir   documentos.   Os
documentos   declarados   na   escrituração   fiscal   do
contribuinte devem ser apresentados na homologação,
sem a necessidade de importações de arquivos.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:6; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.24

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir que o fiscal execute manutenção de
forma global nos documentos fiscais da homologação,
alterando alíquotas, Itens da Lista de Serviço, Local de
Incidência   do   Imposto   e   tributação   de   múltiplos
documentos de uma só vez.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/nfse/NfseClient.tsx:117
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.25

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir a homologação de serviços prestados e
serviços tomados.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:780; src/lib/tributacao/index.ts:66; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.26

**Fonte:** PDF p.184–184. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   homologação   dos   documentos   devem   ser
ordenados por competência, em ordem ascendente.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/lib/tributacao/nfse-danfse.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.27

**Fonte:** PDF p.184–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a impressão da Planilha de Homologação dos
serviços Prestados, Tomados ou de Ambos.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:780; src/app/app-domain/tributacao/base-territorial/TerritorialBaseClient.tsx:19; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.28

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   homologação   da   ação   fiscal   de   forma
resumida, para serviços prestados e tomados, onde
será   informado   por   competência,   apenas   a   Base
Cálculo, o Item da Lista de Serviço com LC 116/2023, a
alíquota e uma descrição.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:80; src/lib/tributacao/nfse-danfse.ts:4; src/lib/tributacao/s4-service.ts:23; src/lib/tributacao/s6-service.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.29

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o lançamento por estimativa ou arbitramento,
onde através de campos customizáveis pré-definidos, o
fisco poderá informar parâmetros que serão utilizados
em fórmulas de cálculos, também customizáveis, para
o sistema irá efetuar o cálculo do imposto devido. O
fisco   deve   ter   acesso   as   configurações   sem   a
necessidade de novos desenvolvimentos.

- **Diagnóstico da faixa:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Gap a conferir:** PARCIAL em mapa fiscal; completar carga canônica documental e editor/lote, fórmulas/parametrização e confronto com declarado
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s3-service.ts:84; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:240; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.30

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir a homologação da ação fiscal
para Instituições Financeiras, com base no modelo
conceitual DES-IF do padrão ABRASF.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:12; src/lib/tributacao/s6-service.ts:7; src/lib/tributacao/s7-service.ts:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.31

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   homologação   da   ação   fiscal   das   instituições
financeiras, o sistema deve cruzar os dados enviados
pelo   contribuinte   na   sua   apuração   mensal   com   as
informações   contidas   no   demonstrativo   contábil,
destacando as contas com divergências.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11; src/lib/tributacao/s2-service.ts:3; src/lib/tributacao/s3-service.ts:34; src/lib/tributacao/s6-service.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.32

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve apresentar ao menos os valores de débitos e
créditos   contidas   na   apuração   mensal   e   no
demonstrativo   contábil,   separado   por   conta   cosif   e
competência,   apresentando   ainda   coluna   com   a
diferença.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:48; src/lib/tributacao/s10-service.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.33

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   que   o   fisco   efetue   alterações   nas
declarações das contas, podendo alterar o código de
tributação e os valores de crédito e débito. Deve permitir
ainda incluir novas contas e excluir contas existente.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s3-service.ts:80; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:39; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s6-service.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.34

**Fonte:** PDF p.185–185. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir imprimir a planilha de homologação das
instituições financeiras.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/cobranca/parcelamentos/[id]/termo/route.ts:3; src/app/app-domain/tributacao/cobranca/relatorios/beneficios/route.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.35

**Fonte:** PDF p.185–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a fiscalização e homologação das empresas
enquadradas como Simples Nacional, apresentando
além das informações dos documentos declarados, os
valores declarados pelo   contribuinte no   sistema   da
receita federal, contidos no arquivo PGDAS-D.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s5-service.ts:4; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:20; src/lib/tributacao/s7-service.ts:47; src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.36

**Fonte:** PDF p.186–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   possuir   relatório   que   apresente   as
divergências entre os valores declarados na receita
federal   e   os   valores   declarados   no   sistema   do
município, por empresas enquadradas como Simples
Nacional.

- **Diagnóstico da faixa:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Gap a conferir:** PARCIAL em S5/S6/malhas; completar fluxos internos e vincular importação oficial no final
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s5-service.ts:4; src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3; src/app/app-domain/tributacao/vaf/VafClient.tsx:120; src/lib/tributacao/s10-service.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.37

**Fonte:** PDF p.186–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a inclusão de documentos de autuação com
base   nas   infrações   previstas   na   legislação   do
município. Na inclusão deve possuir campo descritivo
para livre utilização do fisco, identificação se é sobre
serviços   prestados   ou   tomados,   seleção   das
competências   as   quais   a   autuação   corresponde   e
também descrição da penalidade.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/nfse/NfseClient.tsx:314; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:57; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.38

**Fonte:** PDF p.186–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

No caso de documento de autuação acessório, deve
ser possível informar se o contribuinte é reincidente na
infração cometida.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/recadastramento/actions.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.39

**Fonte:** PDF p.186–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

No caso de documento de autuação principal, deve ser
exibido   uma   lista   de   todos   os   documentos   fiscais
relacionados   na   homologação   separados   por
competência.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:107; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.40

**Fonte:** PDF p.186–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Após a inclusão do documento de autuação principal e
antes da etapa da geração do cálculo para cobrança,
deve ser possível verificar a receita original lançada
pelo contribuinte e também a receita apurada pelo fisco.
E,   em   caso   de   empresa   enquadrado   no   Simples
Nacional, também deve apresentar a receita declarada
no PGDAS-D.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/index.ts:23; src/lib/tributacao/s5-service.ts:4; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.41

**Fonte:** PDF p.186–186. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser apresentado também todos os pagamentos já
efetuados   pelo   contribuinte   no   período   fiscalizado,
separado   por   competência,   e   deve   calcular
automaticamente a diferença a recolher, a correção
monetária, os juros e a multa.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:140; src/lib/tributacao/fiscal-engine.ts:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.42

**Fonte:** PDF p.186–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve dar liberdade para o fisco de manipular os dados,
caso   algum   erro   operacional   de   pagamento   tiver
acontecido, recalculando a planilha e atualizando os
valores.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s4-service.ts:3; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:24; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.43

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível definir para o cálculo do documento
de autuação principal, se será gerado um lançamento
de débito para cada competência apurada, ou se será
gerado   um único   lançamento com   o valor total do
débito.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19; src/lib/tributacao/index.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.44

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   efetuar   prévia   do   cálculo   final   antes   da
efetivação para conferência do fisco.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/index.ts:23; src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:290; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.45

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve emitir o documento de autuação, contendo todos
os dados da apuração, e também os descritivos da
infração, em formato pdf.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/index.ts:66; src/lib/tributacao/s4-service.ts:91; src/lib/tributacao/s5-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.46

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve possuir configuração para definir os dias para o
vencimento   do   débito   lançado   e   o   prazo   para   o
contribuinte entrar com recurso.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/s3-service.ts:83; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/index.ts:66
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.47

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

As datas de vencimento e recurso devem ser sugeridas
com base nesta configuração.

- **Diagnóstico da faixa:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Gap a conferir:** PARCIAL em mapa/autuação; completar todos os valores/fontes, memória, seleção, vencimento/recurso sugeridos e revisão auditada
- **Fases:** P2, P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/fiscal-engine.ts:3; src/lib/tributacao/index.ts:50; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19; src/app/app-domain/tributacao/operacoes/actions.ts:31
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.48

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   incluir   recursos   sobre   os   documentos   de
autuação.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:391; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.49

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A entrada com recurso deve ser efetuada pelo domicilio
eletrônico do contribuinte, evitando que o contribuinte
precise deslocar-se até a prefeitura.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/lib/tributacao/index.ts:66; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.50

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   fisco   poderá   relacionar   número   de   protocolo   ao
recurso e também definir se alterará a situação do
documento de autuação para contencioso.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/cda-pdf.ts:52; src/app/app-domain/tributacao/fiscalizacao/documentos/[id]/route.ts:4; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:26; src/app/app-domain/tributacao/nfse/NfseClient.tsx:383
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.51

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve possuir gerenciamento de todos os recursos,
permitindo   o   cadastro   de   perecer,   o   provimento,
improvimento ou provimento parcial.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/index.ts:66; src/lib/tributacao/s3-service.ts:84; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.52

**Fonte:** PDF p.187–187. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   suspender   os   débitos   relacionados   os
documentos de autuação, na inclusão do recurso.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:27; src/lib/tributacao/s7-service.ts:279; src/lib/tributacao/s9-service.ts:91
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.53

**Fonte:** PDF p.187–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir a geração do boleto para pagamento
bancário   com   código   de   barras   das   infrações
levantadas,   obedecendo   aos   convênios   bancários
utilizados pelo município, com cobrança registrada.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.54

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Os boletos de pagamento podem ser parametrizados
para   saírem   com   descontos   na   multa,   conforme
previsão na legislação tributária do município, caso o
pagamento seja efetuado até a data do vencimento;

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/index.ts:29; src/lib/tributacao/s9-service.ts:26; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:6; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.55

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível efetuar a transferência para dívida
ativa os documentos de autuação não pagos.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s8-service.ts:81; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:159
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.56

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir o parcelamento e reparcelamento dos
débitos   relacionados   os   documentos   de   autuação,
obedecendo   as   parametrizações   definidas   pela   lei
municipal.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:156; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s8-service.ts:228; src/lib/tributacao/s9-service.ts:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.57

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível definir se os parcelamentos terão
juros simples ou composto, o valor mínimo de cada
parcela, a quantidade máxima de parcelas, os valores
de entrada e também os descontos, quando existir
necessidade.

- **Diagnóstico da faixa:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Gap a conferir:** PARCIAL em DTE/crédito/acordo; conectar decisão→débito→DA/parcelamento com suspensão/reversão. Cobrança registrada ao final
- **Fases:** P2, P5, P7, P9, P10. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/fiscal-engine.ts:3; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/layout.tsx:14; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.58

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   para   análise   fiscal   de   instituições
financeiras,   que   apresente   as   inconsistências   entre
demonstrativo contábil e apuração mensal.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:12; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11; src/app/app-domain/tributacao/vaf/VafClient.tsx:157
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.59

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   importação   do   arquivo   de   Estatística
Bancária   Mensal   (ESTBAN)   fornecido   pelo   Banco
Central.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s6-service.ts:50; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:6; src/app/app-domain/tributacao/nfse/NfseClient.tsx:682
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.60

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir consultar os valores importados do arquivo
ESTBAN,   agrupando   por   competência   e   instituição
financeira.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:216; src/lib/tributacao/s6-service.ts:13; src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts:7; src/app/app-domain/tributacao/vaf/VafClient.tsx:252
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.61

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatório   de   contribuintes   omissos   de   suas
declarações.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:368; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:38; src/app/app-domain/tributacao/page.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.62

**Fonte:** PDF p.188–188. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatórios de contribuintes que informaram que
não tiveram movimentações em suas declarações.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:368; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:327; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:23; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.63

**Fonte:** PDF p.188–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   que   apresente   as   empresas
enquadradas   como   Simples   Nacional   que
ultrapassaram o faturamento permitido neste regime.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/vaf/VafClient.tsx:31; src/lib/tributacao/s5-service.ts:4; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:43; src/app/app-domain/tributacao/economico/EconomicoClient.tsx:24
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.64

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   que   apresente   as   empresas
enquadradas   como   MEI   -   Micro   Empreendedor
Individual, que ultrapassaram o faturamento permitido
neste regime.

- **Diagnóstico da faixa:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Gap a conferir:** PARCIAL em análises normalizadas; parser real e relatórios de todos os recortes NÃO VERIFICADOS
- **Fases:** P5, P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:43; src/app/app-domain/tributacao/vaf/VafClient.tsx:31; src/lib/tributacao/s10-service.ts:34; src/lib/tributacao/s5-service.ts:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.65

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório que apresente todas as notas fiscais
declaradas   pelos   contribuintes,   seja   para   serviços
prestados ou tomados.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:24; src/app/app-domain/tributacao/page.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.66

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   gráfico   evolutivo,   que   apresente   por
competência, os valores de ISS Declarados e Pagos.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/vaf/VafClient.tsx:252; src/lib/tributacao/s4-service.ts:73; src/lib/tributacao/s5-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.67

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório que permita apurar quais empresas
estão exercendo determinada atividade, podendo filtrar
por código da atividade ou inscrição municipal.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:315; src/app/app-domain/tributacao/nfse/NfseClient.tsx:52; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:49; src/app/app-domain/tributacao/vaf/VafClient.tsx:71
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.68

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatório   que   apresente   divergências   entre
informações   declaradas   pelo   prestador   com   as
informações declaradas pelo tomador, referentes a um
mesmo documento fiscal.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:102; src/lib/tributacao/s4-service.ts:22; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:7; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.69

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir   relatório   que   apresente   as   divergências
significativas   de   faturamento   das   empresas   entre
determinadas   competências,   podendo   definir   o
percentual de divergência, o código da atividade e o
período de análise.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:315; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:291; src/app/app-domain/tributacao/vaf/VafClient.tsx:187; src/lib/tributacao/s10-service.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.70

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório dos contribuintes que estão autorizados
e emitir NFS-e e não estão emitindo.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:368; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/layout.tsx:59; src/app/app-domain/tributacao/page.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.71

**Fonte:** PDF p.189–189. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   de   ficha   de   fiscalização,   onde
apresente   todos   os   procedimentos   fiscais,   seus
documentos de autuação e contribuinte, bem como a
situação dos débitos dos mesmos. Podendo filtrar por
número   do   processo   fiscal,   período,   situação   do
processo e inscrição municipal.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/lib/tributacao/s9-service.ts:5; src/app/app-domain/tributacao/nfse/NfseClient.tsx:52
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.72

**Fonte:** PDF p.189–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório que apresente a arrecadação por item
da lista de serviço, podendo ordenar por valor da receita
bruta ou valor do ISS. Deve possuir filtro por valor de
receita bruta, valor de ISS, período e tipo do serviço
(prestado ou tomado).

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s4-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:25; src/app/app-domain/tributacao/nfse/NfseClient.tsx:80; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:82
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.73

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Referente a fiscalização de Instituições Financeiras,
possuir   relatório   de   contas   tributáveis   sem
movimentação.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:173; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s7-service.ts:279; src/app/app-domain/tributacao/fiscalizacao/actions.ts:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.74

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   de   cumprimento   das   obrigações
acessórias, referente a entrega dos módulos da DES-
IF.

- **Diagnóstico da faixa:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Gap a conferir:** PARCIAL em BI/malhas; completar cada relatório/filtro/ordenação sobre fontes conciliadas, sem usar declarado como arrecadado
- **Fases:** P2, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:967
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.75

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   importação   dos   dados   referente   as
administradoras de cartões de crédito.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos
- **Gap a conferir:** NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos
- **Fases:** P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:441; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/lib/tributacao/s6-service.ts:50; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:143
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.76

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir um detalhamento dos valores importados, por
contribuinte,   das   operadoras   de   cartão   de   crédito,
apresentando a natureza da operação e os valores por
dia do mês.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos
- **Gap a conferir:** NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos
- **Fases:** P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s4-service.ts:66; src/app/app-domain/tributacao/nfse/NfseClient.tsx:167; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:139; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.77

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   relatório   de   inteligência   fiscal   que   faça   o
cruzamento dos valore declarados no PGDAS-D, com
os valores declarados no arquivo de operadoras de
cartão   de   crédito   e   os   valore   declarados   pelos
contribuintes   na   escrituração   fiscal   do   sistema   do
município.   Deve   permitir   filtrar   por   contribuinte,
percentual de diferença e por período.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos
- **Gap a conferir:** NÃO VERIFICADO no ciclo oficial; engine reutilizável. Parser/versionamento e cruzamento com identidade/competência/percentual corretos
- **Fases:** P7, P9. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s2-service.ts:3; src/lib/tributacao/s5-service.ts:6; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11; src/app/app-domain/tributacao/vaf/VafClient.tsx:157
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.78

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   controle   de   ordens   de   serviços,   onde   o
responsável pelo setor de fiscalização possa incluir
ordens de serviço para os fiscais. Deve permitir informar
na ordem de serviço, qual empresa deve ser fiscaliza, o
fiscal responsável pela ordem, o prazo para execução
da ordem, a descrição o período a ser apurado.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/s6-service.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.79

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   que   o   fiscal   responsável   adicione
comentários durante a execução da mesma.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:22; src/lib/tributacao/s3-service.ts:42
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.80

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir a inclusão de anexos a ordem de serviço
e também a impressão da ordem.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/lib/tributacao/s6-service.ts:7; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:53; src/lib/tributacao/index.ts:66
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.81

**Fonte:** PDF p.190–190. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   ser   possível   abrir   um   procedimento   fiscal
relacionado a ordem de serviço.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/lib/tributacao/s6-service.ts:7; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.82

**Fonte:** PDF p.190–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir vincular mais de um fiscal a ordem de serviço.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/lib/tributacao/s6-service.ts:93; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/tiaf/route.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.83

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   concluir   a   ordem   de   serviço   descrevendo
parecer da conclusão.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:221; src/lib/tributacao/s6-service.ts:98; src/app/app-domain/tributacao/cemiterios/actions.ts:6; src/app/app-domain/tributacao/cobranca/actions.ts:20
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.84

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   criar   grupos   de   fiscais,   permitindo   a
classificação por área de atuação.

- **Diagnóstico da faixa:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Gap a conferir:** PARCIAL em S7; conferir todos os subcritérios/ações e isolamento da equipe
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:47; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:26; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:370; src/app/app-domain/tributacao/imoveis/[id]/page.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.85

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir controle de plantão fiscal, podendo configurar o
horário de expediente do plantão e os fiscais que farão
parte do mesmo.

- **Diagnóstico da faixa:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Gap a conferir:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/layout.tsx:14; src/app/app-domain/tributacao/economico/[id]/page.tsx:6; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/imoveis/[id]/page.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.86

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   lançamento   do   plantão   fiscal   deve   ser   feito
mensalmente, sorteando os fiscais para os dias de
trabalho.

- **Diagnóstico da faixa:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Gap a conferir:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:11; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:19; src/lib/tributacao/s2-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.87

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O gerenciamento do plantão deve identificar os dias
que são feriados e não gerar plantão para estes dias.

- **Diagnóstico da faixa:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Gap a conferir:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:309; src/lib/tributacao/s3-engine.ts:22; src/lib/tributacao/s6-engine.ts:7; src/lib/tributacao/s6-service.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.88

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o lançamento de pontuação para o controle de
produtividade dos fiscais.

- **Diagnóstico da faixa:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Gap a conferir:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:211; src/app/app-domain/tributacao/layout.tsx:14; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:26; src/lib/tributacao/s7-service.ts:106
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.89

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cada   fiscal   deve   possuir   acesso   apenas   a   suas
movimentações no plantão fiscal.

- **Diagnóstico da faixa:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Gap a conferir:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s2-service.ts:3; src/lib/tributacao/s3-service.ts:34; src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.90

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O responsável pela pasta deve possuir acesso total ao
plantão, podendo acompanhar as jornadas, visualizar
as atividades e efetuar manutenção em todos os dias
do plantão fiscal.

- **Diagnóstico da faixa:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Gap a conferir:** PARCIAL demonstrativo; escala/produtividade operacional NÃO VERIFICADA. Usar calendário vigente e registrar sorteio/alterações, ACL e pontuação canônica
- **Fases:** P5, P7. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s3-service.ts:42; src/lib/tributacao/s7-service.ts:4; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.91

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   rotina   para   geração   de   notificação   prévia,
anterior ao procedimento fiscal. Esta notificação pode
ser gerada   individualmente, por contribuinte,   ou de
forma   geral   com   base   em   regras   previamente
cadastradas.

- **Diagnóstico da faixa:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Gap a conferir:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Fases:** P2, P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/index.ts:35; src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.92

**Fonte:** PDF p.191–191. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A notificação prévia de forma geral deve ser feita de
forma automática, notificando todos os contribuintes
encontrados pela regra, através do Domicilio Eletrônico
do Contribuinte.

- **Diagnóstico da faixa:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Gap a conferir:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Fases:** P2, P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:240; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s8-service.ts:96
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.93

**Fonte:** PDF p.191–192. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Após   a   notificação   prévia   automática   deve   possuir
controle de prazo para regularização, onde dentro deste
prazo o contribuinte poderá se regularizar. O sistema
deve ter capacidade de identificar os contribuintes que
se regularizaram.

- **Diagnóstico da faixa:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Gap a conferir:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Fases:** P2, P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/lib/tributacao/s8-service.ts:96; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.94

**Fonte:** PDF p.192–192. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Após   este   prazo   o   sistema   deve   apresentar   os
contribuintes que não se regularizaram e apresentá-los
para abertura de procedimento fiscal.

- **Diagnóstico da faixa:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Gap a conferir:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Fases:** P2, P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/lib/tributacao/s3-service.ts:42; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-26.95

**Fonte:** PDF p.192–192. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O contribuinte deve ser notificado ao acessar o sistema,
que possui notificações para serem visualizadas.

- **Diagnóstico da faixa:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Gap a conferir:** PARCIAL em malhas/DTE; fechar job, evidência de regularização e consulta para abrir procedimento, sem duplicar notificações/fatos
- **Fases:** P2, P5. **Responsável funcional:** Fiscalização Fazendária (pessoa a designar).
- **Fontes municipais:** 108, 080.
- **Base candidata:** src/lib/tributacao/index.ts:66; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s3-service.ts:83; src/lib/tributacao/s4-service.ts:45
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
