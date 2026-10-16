# P0 — EXE-03: Gestão de Controle Interno

Ente: **PREFEITURA**. 36 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-03.1

**Fonte:** PDF p.35–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   Módulo   de   Controle   interno   deve   ser totalmente
integrado aos demais módulos do sistema, permitindo
a   gestão   por   entidade,   de   modo   que   não   haja
necessidade de importação ou exportação de dados.

- **Diagnóstico da faixa:** PARCIAL nos domínios/permissões; completar ACL do controlador/notificado e consultas canônicas
- **Gap a conferir:** PARCIAL nos domínios/permissões; completar ACL do controlador/notificado e consultas canônicas
- **Fases:** P1, P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:32; src/app/app-domain/controle-interno/actions.ts:14; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/app/app-domain/controle-interno/page.tsx:6
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.0/F12.4/F12.6
- **Aceite esperado:** Consultas/diagnósticos com os mesmos registros canônicos

## EXE-03.2

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   atribuições   de   acesso   as   rotinas   mediante
privilégio por perfil e a usuários específicos, permitindo
a caracterização dos usuários que acessam o sistema.

- **Diagnóstico da faixa:** PARCIAL nos domínios/permissões; completar ACL do controlador/notificado e consultas canônicas
- **Gap a conferir:** PARCIAL nos domínios/permissões; completar ACL do controlador/notificado e consultas canônicas
- **Fases:** P1, P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/platform/tenant-context.ts:41; src/app/app-domain/auditoria/page.tsx:244; src/lib/platform/audit-query-service.ts:11
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.0
- **Aceite esperado:** Perfil/override individuais, operações e entidade por servidor

## EXE-03.3

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   o   cadastro   de   documentos   diversos   como
instruções   normativas,   pareceres,   notificações   e
demais   documentos   do   controle   interno.   Deve   ser
possível   notificar   determinados   usuários   das   IN,
notificações,   pareceres   e   demais   documentos.   A
notificação deve ser enviada da própria consulta, pois
deve   permitir   a   resposta   por   parte   dos   usuários
notificados,   deixando   as   mesmas   visíveis   para
impressão.

- **Diagnóstico da faixa:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Gap a conferir:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/controle-interno/actions.ts:14; src/lib/platform/instance-configuration.ts:15; src/app/app-domain/auditoria/page.tsx:35; src/app/app-domain/controle-interno/ControlClient.tsx:14
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.1/F12.5
- **Aceite esperado:** Emitir/notificar/responder/imprimir no ciclo real

## EXE-03.4

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   consulta   integrada   que   demonstre   as
instruções normativas, pareceres do controle interno,
notificações e documentos diversos. A consulta deve
demonstrar   todos   os   documentos,   demonstrando   a
categoria, o tipo do documento, a data e a situação.
Permitir   que   seja   possível   filtrar   quais   documentos
estão publicados no portal.

- **Diagnóstico da faixa:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Gap a conferir:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:21; src/lib/platform/instance-configuration.ts:15; src/lib/c7/operations-service.ts:16; src/lib/platform/blob.ts:26
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.1/F12.7
- **Aceite esperado:** Filtrar publicação confirmada e demais campos

## EXE-03.5

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A consulta de documentos deve possuir, sobre cada
registro inserido, as ações de visualizar, alterar, incluir
observações,   enviar   o   documento   a   pessoas   que
devem ser notificadas, consultar resposta do notificado
e incluir anexos.

- **Diagnóstico da faixa:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Gap a conferir:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/platform/blob.ts:28; src/app/app-domain/auditoria/page.tsx:31; src/lib/platform/instance-configuration.ts:15; src/lib/c7/operations-service.ts:40
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.1
- **Aceite esperado:** Executar todas as ações, com histórico e GED

## EXE-03.6

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   a   publicação   automática   no   Portal   de
Transparência   do   Município,   dos   documentos   do
controle interno e auditorias realizadas.

- **Diagnóstico da faixa:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Gap a conferir:** PARCIAL na infraestrutura; ciclo funcional NÃO ATENDE integralmente
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:35; src/app/app-domain/controle-interno/actions.ts:14; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/app/app-domain/controle-interno/page.tsx:6
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.7
- **Aceite esperado:** Link público confirmado do mesmo documento/versão

## EXE-03.7

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastro de checklist, baseado em grupos
e itens que servirão de base para as auditorias. Os itens
devem ser numerados para controle dos mesmos.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:21; src/app/app-domain/controle-interno/actions.ts:14; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/app/app-domain/controle-interno/page.tsx:6
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2
- **Aceite esperado:** Catálogo com numeração estável e editor operacional

## EXE-03.8

**Fonte:** PDF p.36–36. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   configuração   do   checklist,   informando   a
resposta em relação à irregularidade automaticamente
diagnosticada.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:37; src/lib/platform/tenant-context.ts:237
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2/F12.4
- **Aceite esperado:** Regra → evidência → resposta configurada

## EXE-03.9

**Fonte:** PDF p.36–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   inserir   irregularidades   de   forma   manual,
possibilitando registrar aquelas irregularidades que o
sistema   não   tem   condições   de   apontar
automaticamente.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:51; src/app/app-domain/controle-interno/actions.ts:27; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/lib/c7/operations-service.ts:40
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.3
- **Aceite esperado:** Achado manual com evidência/origem e responsável

## EXE-03.10

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Registrar   o   parecer   do   controle   interno   em   cada
irregularidade e especificar a providência que deve ser
tomada para sanar a mesma.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/controle-interno/actions.ts:14; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/app/app-domain/auditoria/page.tsx:35; src/app/app-domain/controle-interno/page.tsx:6
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.3
- **Aceite esperado:** Parecer, ação corretiva e acompanhamento verificáveis

## EXE-03.11

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

No cadastro de parecer, permitir identificar se o parecer
é relativo a uma contratação e se for o caso permitir a
identificação do funcionário.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/platform/instance-configuration.ts:25
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.1/F12.3
- **Aceite esperado:** Vínculo canônico do funcionário/contratação correto

## EXE-03.12

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cadastrar possíveis respostas para os grupos
da checklist, possibilitando respostas automáticas.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** Não localizada por busca lexical; investigar antes de classificar ausência.
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2/F12.4
- **Aceite esperado:** Configuração de grupo usada em diagnóstico real

## EXE-03.13

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir enquadrar a checklist em categorias facilitando
assim a localização da mesma.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** Não localizada por busca lexical; investigar antes de classificar ausência.
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2
- **Aceite esperado:** Cadastro e pesquisa por categoria

## EXE-03.14

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   sistema   deve   disponibilizar   checklist   padrão,   já
cadastradas para as diversas áreas da prefeitura.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/c7/operations-service.ts:40; src/lib/platform/blob.ts:61; src/lib/platform/instance-configuration.ts:5; src/lib/platform/instance.ts:7
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2
- **Aceite esperado:** Catálogo inicial das áreas e uso sem redigitação

## EXE-03.15

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao selecionar uma checklist para uma nova auditoria,
possibilitar que possam ser escolhidos apenas os itens
que se deseja analisar, entre os itens disponíveis.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:118; src/lib/platform/audit-evidence.ts:28; src/lib/platform/audit-query.ts:85; src/lib/platform/blob.ts:88
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2/F12.3
- **Aceite esperado:** Seleção parcial preservada no questionário emitido

## EXE-03.16

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar que possam ser incluídos novos itens a uma
checklist, mesmo que esta já tenha sido utilizada e
permitir que possam ser desativados itens, caso o item
seja uma análise que se tornou desnecessária.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:96; src/app/app-domain/controle-interno/ControlClient.tsx:3; src/lib/platform/tenant-context.ts:118; src/lib/platform/instance-configuration.ts:5
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2
- **Aceite esperado:** Evoluir catálogo sem reescrever auditoria anterior

## EXE-03.17

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir duplicar uma checklist mantendo a checklist
original,   e   copiando   os   itens   permitindo   a   edição
conforme a necessidade.

- **Diagnóstico da faixa:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Gap a conferir:** PARCIAL em apontamento manual; checklist/questionário e evolução funcional a desenvolver
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/platform/tenant-context.ts:365
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.2
- **Aceite esperado:** Copiar/editar com origem intacta

## EXE-03.18

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir vincular o Órgão ou Unidade, através de centro
de custo, a uma auditoria a ser realizada.

- **Diagnóstico da faixa:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Gap a conferir:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:118; src/lib/platform/audit-query.ts:85; src/lib/platform/tenant-context.ts:184
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.0/F12.3
- **Aceite esperado:** Centro canônico e escopo da auditoria coerentes

## EXE-03.19

**Fonte:** PDF p.37–37. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o agendamento de auditoria, para facilitar a
programação das atividades do controle interno.

- **Diagnóstico da faixa:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Gap a conferir:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:35; src/app/app-domain/controle-interno/actions.ts:14; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/app/app-domain/controle-interno/page.tsx:6
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.3
- **Aceite esperado:** Auditoria aparece na programação nas datas informadas

## EXE-03.20

**Fonte:** PDF p.37–38. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   encaminhar   uma   auditoria   ao   responsável,
para que o mesmo informe as respostas solicitadas na
checklist.

- **Diagnóstico da faixa:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Gap a conferir:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:118; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/lib/c7/operations-service.ts:24; src/lib/platform/audit-query.ts:85
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.3/F12.5
- **Aceite esperado:** Destinatário correto responde com acesso restrito

## EXE-03.21

**Fonte:** PDF p.38–38. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   incluir   uma   auditoria   com   no   mínimo   as
informações de data inicial e final, descrição, centro de
custo e responsável. O cadastro da auditoria deve estar
integrado   ao   cadastro   da   checklist   para possibilitar
selecionar   a   checklist   desejada   e   já   buscar
automaticamente os seus itens.

- **Diagnóstico da faixa:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Gap a conferir:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:21; src/lib/c7/operations-service.ts:16; src/lib/platform/tenant-context.ts:11; src/app/app-domain/controle-interno/ControlClient.tsx:14
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.3
- **Aceite esperado:** Cadastro completo e cópia dos itens no ciclo

## EXE-03.22

**Fonte:** PDF p.38–38. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir consulta gerencial que demonstre todas as
auditorias   cadastradas   e   que   possua   as   ações   de
duplicar,   enviar   questionário,   analisar,   visualizar
analise, encerrar e cancelar. Deve demonstrar dados
da auditoria, como descrição, data de inclusão, data
limite para resposta, auditor responsável e situação.

- **Diagnóstico da faixa:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Gap a conferir:** Base de plano/prazo; agendar/duplicar/enviar/analisar/encerrar/cancelar com snapshot de questionário e transições a completar
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:21; src/lib/c7/operations-service.ts:16; src/lib/platform/audit-query.ts:50; src/app/app-domain/controle-interno/ControlClient.tsx:14
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.3
- **Aceite esperado:** Todas as ações/colunas com transições válidas e histórico

## EXE-03.23

**Fonte:** PDF p.38–38. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   sistema   deve   possuir   funcionalidade   que   faça
auditorias automáticas sobre os dados incluídos no
sistema,   que   demonstre   alguma   irregularidade.   A
funcionalidade deve detectar irregularidades no mínimo
de: empenhos emitidos contra fornecedor com débitos
com o Município, valores empenhados maiores que o
valor do contrato, fontes de recurso com saldo negativo,
e o não atingimento dos índices constitucionais em
educação e saúde.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente no domínio atual. Depende de P2–P4/P7; resultado sem base = NÃO AVALIADO, não REGULAR
- **Gap a conferir:** NÃO ATENDE integralmente no domínio atual. Depende de P2–P4/P7; resultado sem base = NÃO AVALIADO, não REGULAR
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/c7/operations-service.ts:39; src/app/app-domain/auditoria/page.tsx:251; src/lib/platform/blob.ts:61; src/lib/platform/instance.ts:7
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.4
- **Aceite esperado:** Casos positivos/negativos nas quatro famílias, fontes reais e período correto

## EXE-03.24

**Fonte:** PDF p.38–38. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina de notificações do controle interno, que
aponte se há alguma notificação pendente e permita
visualizar e responder as notificações recebidas. Essa
rotina deve ser por usuário, ou seja, cada usuário
recebe as notificações endereçadas a ele.

- **Diagnóstico da faixa:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Gap a conferir:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Fases:** P6, P7, P10. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:29; src/app/app-domain/controle-interno/actions.ts:13; src/lib/c7/operations-service.ts:6; src/app/app-domain/controle-interno/ControlClient.tsx:14
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.5
- **Aceite esperado:** Dois destinatários isolados; resposta auditada

## EXE-03.25

**Fonte:** PDF p.38–38. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir agenda de obrigações, com opção de informar
o nível de criticidade da agenda, as pessoas ou centro
de   custos   que   poderão   visualizar   o   registro   e   a
informação de quem poderá baixar o evento incluído.

- **Diagnóstico da faixa:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Gap a conferir:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Fases:** P6, P7, P10. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:159; src/lib/platform/instance-configuration.ts:21
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.5
- **Aceite esperado:** Visualização e baixa verificadas separadamente

## EXE-03.26

**Fonte:** PDF p.38–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

A agenda deve enviar alertas aos usuários de eventos
que   estão   a   expirar   e   expirados,   obrigando   o
responsável pelo evento a justificar conforme o nível de
criticidade do evento.

- **Diagnóstico da faixa:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Gap a conferir:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Fases:** P6, P7, P10. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:159; src/lib/c7/operations-service.ts:24; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/lib/platform/blob.ts:61
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.5
- **Aceite esperado:** Job real, alertas e tentativa de baixa sem justificativa

## EXE-03.27

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a configuração do período de antecedência
para o envio de alertas e do prazo de expiração de
determinado evento da agenda.

- **Diagnóstico da faixa:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Gap a conferir:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Fases:** P6, P7, P10. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:36; src/lib/platform/instance-configuration.ts:6; src/lib/platform/audit-query.ts:85; src/lib/platform/tenant-context.ts:237
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.5
- **Aceite esperado:** Parâmetros aplicados nas datas/alertas efetivos

## EXE-03.28

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir na consulta dos eventos da agenda, consultar
apenas os eventos pendentes e consultar os eventos
pelos períodos diário, semanal, mensal e anual.

- **Diagnóstico da faixa:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Gap a conferir:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Fases:** P6, P7, P10. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:51; src/lib/platform/audit-evidence.ts:26; src/lib/platform/blob.ts:88; src/lib/platform/instance.ts:7
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.5
- **Aceite esperado:** Todos os recortes, incluindo limites de período

## EXE-03.29

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   consulta   centralizada   de   todos   os   e-mails
enviados   pelo   controle   interno,   possibilitando   a
visualização   do   título   do   e-mail,   o   controlador   que
enviou, a pessoa a quem foi enviado, a data de envio e
a situação do mesmo (se houve ou não retorno).

- **Diagnóstico da faixa:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Gap a conferir:** Infraestrutura compartilhada parcial; implantar ciclo do controle e provedor real na fase final
- **Fases:** P6, P7, P10. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:21; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/lib/c7/operations-service.ts:16; src/app/app-domain/controle-interno/actions.ts:14
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.6
- **Aceite esperado:** Envio/tentativas/retorno reais; resposta não inferida de envio

## EXE-03.30

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   consulta   dos   processos   de   ouvidoria,
possibilitando ao controlador visão das reclamações ou
sugestões da sociedade.

- **Diagnóstico da faixa:** NÃO VERIFICADO no acesso funcional do controlador; identificar fonte jurídica e permissões; execução fiscal contra contribuinte não atende o item 31
- **Gap a conferir:** NÃO VERIFICADO no acesso funcional do controlador; identificar fonte jurídica e permissões; execução fiscal contra contribuinte não atende o item 31
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:188; src/lib/platform/blob.ts:91
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.6
- **Aceite esperado:** Consulta canônica autorizada, preservando restrições de identificação

## EXE-03.31

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   o   controlador   possa   consultar   os
processos abertos contra o Município, objetivando o
conhecimento de situações diversas que possam estar
acontecendo.

- **Diagnóstico da faixa:** NÃO VERIFICADO no acesso funcional do controlador; identificar fonte jurídica e permissões; execução fiscal contra contribuinte não atende o item 31
- **Gap a conferir:** NÃO VERIFICADO no acesso funcional do controlador; identificar fonte jurídica e permissões; execução fiscal contra contribuinte não atende o item 31
- **Fases:** P6. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:251; src/lib/c7/operations-service.ts:39; src/lib/platform/blob.ts:91
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.6
- **Aceite esperado:** Registros jurídicos reais, situação e origem identificados

## EXE-03.32

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Emitir relatório circunstanciado, permitindo a publicação
automática no Portal da Transparência.

- **Diagnóstico da faixa:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Gap a conferir:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:50
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.7
- **Aceite esperado:** Emitir documento completo e confirmar publicação

## EXE-03.33

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   gerenciamento   dos   quadros   que
compõem   o   relatório   circunstanciado,   e   permitir   a
inclusão de anexos. Os anexos devem ser publicados
de forma automática no portal de transparência.

- **Diagnóstico da faixa:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Gap a conferir:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:146; src/lib/platform/blob.ts:26; src/lib/platform/instance-configuration.ts:21
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.7
- **Aceite esperado:** Quadros editáveis e anexos corretos com acesso público confirmado

## EXE-03.34

**Fonte:** PDF p.39–39. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir do controle interno, a emissão dos relatórios
legais   da   Lei   de   Responsabilidade   Fiscal   e   dos
relatórios anuais obrigatórios, para acompanhamento
dos índices constitucionais.

- **Diagnóstico da faixa:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Gap a conferir:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/app/app-domain/auditoria/page.tsx:33; src/app/app-domain/controle-interno/actions.ts:14; src/app/app-domain/controle-interno/ControlClient.tsx:14; src/app/app-domain/controle-interno/page.tsx:6
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.7
- **Aceite esperado:** Leiautes aplicáveis e cálculo executado conferidos

## EXE-03.35

**Fonte:** PDF p.39–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório de estatísticas de cargos. O relatório
deve   permitir   os   filtros   por   data,   cargo,   servidor,
enquadramento, permitindo ainda demonstrar todos os
cargos e incluir cargos extintos.

- **Diagnóstico da faixa:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Gap a conferir:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/c7/operations-service.ts:16; src/app/app-domain/auditoria/page.tsx:21; src/lib/platform/audit-evidence.ts:43; src/lib/platform/audit-query.ts:50
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.6/F12.7
- **Aceite esperado:** Histórico RH real e todos os filtros, inclusive extintos

## EXE-03.36

**Fonte:** PDF p.40–40. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar a emissão do calendário de obrigações,
listando   todos   os   meses   ou   apenas   os   meses
selecionados.

- **Diagnóstico da faixa:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Gap a conferir:** PARCIAL nas fontes financeiras/RH/GED; completar documentos, integração/read models e todas as saídas
- **Fases:** P6, P7. **Responsável funcional:** Controladoria (pessoa a designar).
- **Fontes municipais:** 004, 028, 077, 078, 097, 109, 119, 128, 130.
- **Base candidata:** src/lib/platform/instance-configuration.ts:16; src/app/app-domain/auditoria/page.tsx:33; src/lib/platform/blob.ts:88; src/lib/platform/instance.ts:7
- **Reuso:** docs/PLANO_IMPLEMENTACAO_CUSTOS_CONTROLE_INTERNO.md — F12.5/F12.7
- **Aceite esperado:** Seleção múltipla de meses e emissão reconciliada à agenda
