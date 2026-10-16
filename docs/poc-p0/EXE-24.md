# P0 — EXE-24: Nota Fiscal Eletrônica

Ente: **PREFEITURA**. 59 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-24.1

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   possuir   cadastro   mobiliário   único
integrado com o sistema de arrecadação do município.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/app/app-domain/tributacao/operacoes/actions.ts:31; src/lib/tributacao/index.ts:66; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.2

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir a emissão de NFS-e seguindo os
parâmetros previstos na legislação municipal.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:240; src/lib/tributacao/s3-service.ts:39; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s9-service.ts:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.3

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A   emissão   da   NFS-e   deve   ser   possível   por
preenchimento manual no sistema.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/divida-ativa/actions.ts:4; src/app/app-domain/tributacao/imoveis/property-actions.ts:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.4

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A emissão da NFS-e deve ser possível por aplicativo
para dispositivo móvel, compatível pelo menos com os
sistemas operacionais IOS e Android.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/recadastramento/actions.ts:16; src/lib/tributacao/index.ts:66; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.5

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A emissão da NFS-e deve ser possível por integração
por   WebService,   para   contribuintes   que   utilizam
sistema de gestão próprios.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/lib/tributacao/index.ts:66; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.6

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema de notas deve possuir integração com o ADN
(Ambiente de Dados Nacional), enviando para o ADN
notas   emitidas   no   município   quando   o   local   da
prestação ou tomador for de outra cidade e recebendo
documentos quando o local de prestação ou o domicilio
do tomador for o município;

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/nfse-danfse.ts:5; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:22; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:10; src/app/app-domain/tributacao/nfse/NfseClient.tsx:117
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.7

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em   momento   após   emissão   da   NFS-e,   deve   ser
enviado e-mail automaticamente notificando o tomador
do serviço.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/nfse-danfse.ts:3; src/lib/tributacao/s4-service.ts:57; src/lib/tributacao/s6-service.ts:7; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.8

**Fonte:** PDF p.169–169. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível enviar manualmente qualquer NFS-e
por email.

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/recadastramento/actions.ts:16; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/domicilio-tributario/actions.ts:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.9

**Fonte:** PDF p.169–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir a configuração de exigência de
assinatura digital para as notas fiscais emitidas, com a
possibilidade de exigir assinatura apenas no XML das
notas gerada por WebService;

- **Diagnóstico da faixa:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Gap a conferir:** PARCIAL na emissão web; aplicativo/canais e integrações NÃO VERIFICADOS integralmente. Não contar página responsiva como app comprovado; assinatura deve atender classe/formato exigido
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.10

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   o   município   configure   o   prazo   para
cancelamento de NFS-e, sendo ele em horas, dias ou
competência.

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:821; src/app/app-domain/tributacao/nfse/NfseClient.tsx:300; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:26
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.11

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cancelamento de qualquer NFS-e, por parte
do contribuinte emissor, desde que esteja dentro do
prazo autorizado.

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s3-service.ts:83; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/lib/tributacao/s7-service.ts:47
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.12

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir gerenciamento de NFS-e para o contribuinte,
onde ele poderá consultar e visualizar as NFS-e já
emitidas;

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/cobranca/relatorios/beneficios/route.ts:3; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:77
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.13

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   fisco   deve   possuir   autonomia   para   autorizar   ou
remover   autorização   de   qualquer   contribuinte   para
emissão de NFS-e.

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:26; src/lib/tributacao/index.ts:66; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.14

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O fisco deve ter a possibilidade de configurar o sistema
para liberação automática de autorização para emissão
de NFS-e;

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/documentos/[id]/route.ts:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.15

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Cada NFS-e deve possuir apenas um item de lista de
serviço, conforme classificação da Lei Complementar
116/03;

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10; src/lib/tributacao/nfse-danfse.ts:6; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.16

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   o   emissor   possa   cadastrar, durante   o
preenchimento da NFS-e, informações alternativas de
endereço, nome fantasia e e-mail para o tomador do
serviço, diferentes das contidas no cadastro municipal
de contribuintes,

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/nfse-danfse.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:174; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:266; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:307
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.17

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir serviço em portal de Internet para verificar a
autenticidade das Notas Fiscais eletrônicas emitidas,
via QR code ou digitação do código de autenticidade.
Este serviço não deve solicitar usuário e senha e deve
ser aberto para qualquer contribuinte.

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:32; src/lib/tributacao/index.ts:29; src/lib/tributacao/s2-service.ts:10; src/lib/tributacao/s7-service.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.18

**Fonte:** PDF p.170–170. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O fisco pode autorizar os contadores a emitirem NFS-e
para seus clientes.

- **Diagnóstico da faixa:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Gap a conferir:** PARCIAL; prazo fixo confirmado. Configurar temporalidade, revogação e representação por contador; guardar dados do documento sem sobrescrever cadastro
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:399; src/lib/tributacao/__tests__/s4-engine.test.ts:8; src/lib/tributacao/index.ts:257; src/lib/tributacao/property-cadastral-engine.ts:14
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.19

**Fonte:** PDF p.170–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O contribuinte deverá ter a possibilidade de configurar,
em momento anterior a emissão, o logo da empresa,
observações,   tabelas   com   linhas   e   colunas   e
informações   complementares   para   serem
apresentadas na NFS-e impressa.

- **Diagnóstico da faixa:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Gap a conferir:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Fases:** P5, P7, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:23; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:223; src/lib/tributacao/index.ts:105
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.20

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O contribuinte emissor poderá definir endereço de e-
mail para o qual deseja enviar suas notas fiscais.

- **Diagnóstico da faixa:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Gap a conferir:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Fases:** P5, P7, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:27; src/lib/tributacao/s9-engine.ts:24; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.21

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Após   o   término   do   prazo   de   cancelamento,   deve
permitir ao contribuinte emissor de NFS-e efetuar uma
solicitação para cancelamento de determinada nota,
informando o motivo e sua respetiva substituta quando
houver. Está solicitação deve ser disponibilizada para
análise do fisco.

- **Diagnóstico da faixa:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Gap a conferir:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Fases:** P5, P7, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s4-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:2; src/lib/tributacao/s3-service.ts:48; src/lib/tributacao/s9-service.ts:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.22

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O usuário fiscal deve possuir o controle das solicitações
de   cancelamentos   de   NFS-e,   podendo   o   mesmo
deferir/indeferir as respetivas solicitações, informando o
motivo.   Deve permitir executar este procedimento de
forma individual ou em lote.

- **Diagnóstico da faixa:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Gap a conferir:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Fases:** P5, P7, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/lib/tributacao/s3-service.ts:42; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/nfse/NfseClient.tsx:63
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.23

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A solicitação de cancelamento poderá ser inserida por
requisição WebService;

- **Diagnóstico da faixa:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Gap a conferir:** PARCIAL no cancelamento; personalização/decisão completa NÃO VERIFICADAS. Completar estados/motivos/ações; WS no final
- **Fases:** P5, P7, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:477; src/lib/tributacao/s4-service.ts:23; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:507; src/lib/tributacao/index.ts:243
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.24

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Todas   as   notas   emitidas   deverão   ser   lançadas
automaticamente na escrituração fiscal do prestador,
não permitindo que o mesmo exclua ou altere estas
notas;

- **Diagnóstico da faixa:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Gap a conferir:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Fases:** P2, P5, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/fiscalizacao/documentos/[id]/route.ts:4; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:19; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.25

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Se o tomador do serviço destacado na NFS-e possuir
empresa estabelecida no município, a nota fiscal deve
ser lançada na sua escrituração de serviços tomados,
não permitindo a exclusão ou alteração das mesmas.
Nestes casos deve permitir que o tomador apenas
marque a nota fiscal como rejeitada.

- **Diagnóstico da faixa:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Gap a conferir:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Fases:** P2, P5, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:7; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:139
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.26

**Fonte:** PDF p.171–171. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   permitir   a   cópia   de   notas   fiscais   já
geradas para a geração de novas, evitando o retrabalho
de digitação nos casos de notas iguais.

- **Diagnóstico da faixa:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Gap a conferir:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Fases:** P2, P5, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/imoveis/property-actions.ts:18; src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.27

**Fonte:** PDF p.171–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a substituição   de notas fiscais, desde que
informada uma nova nota válida.

- **Diagnóstico da faixa:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Gap a conferir:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Fases:** P2, P5, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:4; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:22; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.28

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve permitir que seja configurado o prazo em que uma
nota poderá ser substituída pelo contribuinte;

- **Diagnóstico da faixa:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Gap a conferir:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Fases:** P2, P5, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/s3-service.ts:83; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:4
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.29

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Para emissões por integração Webservice, deve ser
possível visualizar e fazer o download do arquivo XML
de envio e de retorno. Deverá ser possível identificar a
situação do arquivo, se importado com sucesso ou com
erro. Deverá ainda ser discriminado o motivo para os
XMLs que apresentarem erro.

- **Diagnóstico da faixa:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Gap a conferir:** PARCIAL; apenas declaração prestador explícita. Corrigir GAP-09, rastreabilidade e proteção; XML/retorno oficial no final
- **Fases:** P2, P5, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:43; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:17; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.30

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   a   utilização   de   Recibo   Provisório   de
Serviço (RPS) com numeração sequencial crescente.

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s6-service.ts:7; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:53
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.31

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve ser possível configurar um prazo máximo para
converter um RPS em NFS-e, conforme estipulado na
legislação tributária municipal. Após este prazo o RPS
deve ser rejeitado.

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/lib/tributacao/s3-service.ts:39; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:207; src/lib/tributacao/s9-service.ts:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.32

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   conversão   de   um   RPS   em   NFS-e,   a   data   de
utilização do RPS será utilizada como data fato gerador
da NFS-e;

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:26; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:17; src/app/app-domain/tributacao/alvaras/actions.ts:10; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:102
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.33

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve possuir serviço disponível para o tomador de
serviço denuncie a não conversão do RPS em nota
fiscal de serviço eletrônica;

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:7; src/app/app-domain/tributacao/nfse/NfseClient.tsx:160; src/lib/tributacao/s4-service.ts:28; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.34

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema deve permitir a configuração de geração de
créditos para o tomador destacado na NFS-e, para
serem utilizados no abatimento do IPTU;

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:389; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:39; src/app/app-domain/tributacao/nfse/NfseClient.tsx:293
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.35

**Fonte:** PDF p.172–172. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Deve   permitir   que   o   fisco   municipal   configure   o
percentual sobre o valor do ISS que será utilizado como
crédito. Esse percentual pode ser diferenciado entre
tomadores pessoas físicas e jurídicas.

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s2-service.ts:8; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:25; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.36

**Fonte:** PDF p.172–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   configurar   quais   itens   da   lista   de   serviço
exigirão a informação do número C.N.O, relacionado a
construção civil, no momento de emissão da NFS-e.
Deve ser possível definir ainda se a informação será
obrigatória ou opcional.

- **Diagnóstico da faixa:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Gap a conferir:** PARCIAL em lote RPS/créditos de dedução; não confundir dedução NFS-e com crédito do tomador no IPTU. Completar regra de incentivo/CNO e conversão fiscal
- **Fases:** P2, P5. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:212; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:330; src/lib/tributacao/index.ts:23
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.37

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório dos maiores emissores de NFS-e do
município, podendo filtrar por período.

- **Diagnóstico da faixa:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Gap a conferir:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:32; src/app/app-domain/tributacao/divida-ativa/cda/[id]/pdf/route.ts:23; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:346; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.38

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta de créditos de IPTU, com filtros por
tomador do serviço e por situação do crédito;

- **Diagnóstico da faixa:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Gap a conferir:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:293; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:389; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:39; src/app/app-domain/tributacao/nfse/[id]/xml/route.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.39

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ter a opção de visualizar uma prévia da NFS-e antes
de efetivar sua emissão;

- **Diagnóstico da faixa:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Gap a conferir:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:290; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:755; src/app/app-domain/tributacao/nfse/NfseClient.tsx:212
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.40

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   a   opção   de   salvar   NFS-e   em   rascunho,
permitindo finalizar seu preenchimento em momento
posterior;

- **Diagnóstico da faixa:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Gap a conferir:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:98; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:380; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.41

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   emissão   de   NFS-E   com   data   retroativa,
lançando a mesma na escrituração da competência
correspondente   a   data   do   fato   gerador.   Se   a
competência   estiver   paga,   deve   gerar   um   registro
complementar.

- **Diagnóstico da faixa:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Gap a conferir:** NÃO VERIFICADO integralmente; competência/cálculo existentes. Complementar não reabre indevidamente competência paga; manter referência fiscal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33; src/app/app-domain/tributacao/nfse/NfseClient.tsx:28; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.42

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Para integração Webservice o município poderá definir
layout próprio ou poderá utilizar o padrão ABRASF de
NFS-e.

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:217; src/lib/tributacao/nfse-danfse.ts:12; src/lib/tributacao/s4-service.ts:76; src/lib/tributacao/s9-service.ts:205
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.43

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ter   a   possibilidade   de   disponibilizar   unidades   de
serviço para serem informadas na NFS-e, como por
exemplo, quantidade, unidades e Horas.

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/fiscal-engine.ts:37; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:290; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:26; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:63
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.44

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a utilização de canhoto a ser impresso junto a
NFS-e;

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:363; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:52
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.45

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ter a possibilidade de configurar se o valor líquido será
apresentado no corpo da NFS-e, ou se será apenas
apresentado o valor Total.

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s9-service.ts:67; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:52; src/app/app-domain/tributacao/divida/DividaClient.tsx:30; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.46

**Fonte:** PDF p.173–173. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   informar   a   forma   de   pagamento   no
momento da emissão da NFS-e, com as opções à vista,
a prazo, cartão de débito e cartão de crédito. Para as
opções a prazo permitir informar o número de parcelas
e seus vencimentos;

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:212; src/lib/tributacao/s2-service.ts:39; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.47

**Fonte:** PDF p.173–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o emissor informe valores de dedução
referente a materiais, no caso de NFS-e de construção
civil.

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:335; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:330; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:315; src/lib/tributacao/s3-service.ts:163
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.48

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   os   contribuintes   cadastrem   seus
fornecedores do software.

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:368; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/app/app-domain/tributacao/page.tsx:25; src/lib/tributacao/s8-service.ts:96
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.49

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir configurar se o preenchimento do tomador
será,   ou   não,   obrigatório,   no   momento   de
preenchimento da NFS-e;

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s4-service.ts:7; src/app/app-domain/tributacao/base-territorial/actions.ts:7; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:17; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:540
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.50

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Sistema   deve   armazenar   histórico   de   alíquotas
utilizadas por empresas enquadradas como Simples
Nacional.

- **Diagnóstico da faixa:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Gap a conferir:** PARCIAL nos valores/deduções; complementar configurações/campos/histórico e DANFSE; layout interoperável ao final
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/vaf/VafClient.tsx:120; src/lib/tributacao/s10-service.ts:34; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:48; src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.51

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastro e controle de tomadores recorrente,
onde o contribuinte poderá configurar o sistema para
que gere notas ficais automaticamente todos os meses.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/lib/tributacao/s7-service.ts:47; src/lib/tributacao/s9-service.ts:15; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:223
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.52

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ter a possibilidade de utilização de carta de correção,
podendo   corrigir   apenas   as   informações   de
Nome/Razão do tomador, Endereçamento e descrição
dos serviços. Não pode permitir a alteração de valores.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/lib/tributacao/s4-service.ts:57; src/app/app-domain/tributacao/nfse/NfseClient.tsx:293; src/app/app-domain/tributacao/vaf/VafClient.tsx:252; src/lib/tributacao/s9-service.ts:395
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.53

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatórios dos contribuintes emissores da NFS-
e que mais cancelam.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:350; src/lib/tributacao/s8-service.ts:96; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:368; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:327
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.54

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de NFS-e em lote por integração
Webservice.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:671; src/lib/tributacao/index.ts:149; src/lib/tributacao/s4-service.ts:130; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:351
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.55

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a exportação de dados de permissionários para
o TSE.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** Não localizada por busca lexical; investigar antes de classificar ausência.
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.56

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   exportação   de   dados   de   NFS-e   de
Candidatos e Partidos para o TSE.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** Não localizada por busca lexical; investigar antes de classificar ausência.
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.57

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir utilizar a informação do CNAE na NFS-e.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:175; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:43; src/app/app-domain/tributacao/economico/[id]/page.tsx:19; src/app/app-domain/tributacao/economico/actions.ts:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.58

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir informar um intermediário na NFS-e.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** Não localizada por busca lexical; investigar antes de classificar ausência.
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-24.59

**Fonte:** PDF p.174–174. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir que o município configure seu próprio layout da
NFS a ser impressa.

- **Diagnóstico da faixa:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Gap a conferir:** PARCIAL em carta; demais NÃO VERIFICADOS. Recorrência idempotente, dados de autorização e relatórios; TSE/WS nas últimas fases
- **Fases:** P5, P7, P9, P10. **Responsável funcional:** Tributação/NFS-e (pessoa a designar).
- **Fontes municipais:** 108.
- **Base candidata:** src/app/app-domain/tributacao/nfse/NfseClient.tsx:217; src/lib/tributacao/nfse-danfse.ts:12; src/app/app-domain/tributacao/divida-ativa/cda/[id]/pdf/route.ts:23; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
