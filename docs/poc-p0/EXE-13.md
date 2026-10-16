# P0 — EXE-13: Gestão de ISS

**Revisão de 15/10/2026:** os 41 itens têm referências individuais de código, regressão e pendências em [REVISAO_IPTU_ISS_ITBI_2026_10_15.md](REVISAO_IPTU_ISS_ITBI_2026_10_15.md#exe-13--iss--cadastro-econômico-41-itens), incluindo unificação CNAE/zoneamento, alvarás, eventos, veículos, documentos do portal e Simples TXT. Aceites não promovidos.

**Quinta continuação:** prazo provisório e política de dívida por tipo de empresa; alvarás anuais configurados, emissão interna/em lote/portal, autenticidade e cancelamento auditado, detalhados na seção «Quinta continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Assinatura oficial e demais limites são explícitos; aceites permanecem não executados.

**Sexta continuação:** bloqueios de alvará por tipo de empresa/CNAE e mensagem própria; carência limitada à taxa vinculada, compensação separada do caixa e sócios limitados à inscrição emissora. Detalhes na seção «Sexta continuação» do mesmo documento.

**Quarta continuação:** cadastro CNAE com lista de serviços ISS/CBO, risco versionado e unificação dos códigos principal/secundários dos perfis conciliados, com resolução dos códigos antigos, detalhados na seção «Quarta continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Referências genéricas e de outros módulos ainda exigem revisão; aceites permanecem não executados.

**Terceira continuação:** inclusão coordenada de empresa/perfil, CRC versionado, validade provisória em dias, política compartilhada de débitos, sócios na avaliação de certidão e alteração geral econômica detalhados na seção «Terceira continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Os limites são registrados por subcritério; aceites permanecem não executados.

**Segunda continuação:** perfil econômico com contador/sócios/atividades/endereço/anexos, tipos configurados, expiração de provisórias, formulários/vistorias e consulta com mapa detalhados na seção «Segunda continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). A cobertura de cada subcritério e seus limites estão registrados; os aceites abaixo permanecem não executados.

**Continuação de desenvolvimento:** histórico nativo/REDESIM/Simples, espelho cadastral e comparativo de exercícios documentados em [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md), relacionados a .14/.21/.22/.39. O registro explicita cobertura e limites; não altera os aceites abaixo.

Ente: **PREFEITURA**. 41 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-13.1

**Fonte:** PDF p.102–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastro único de contador e permitir
relacionamento de contador nas empresas.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/vaf/VafClient.tsx:187; src/lib/tributacao/s10-service.ts:34; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:30; src/app/app-domain/tributacao/page.tsx:85
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.2

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   o   cadastro   de   atividades   padrão   CNAE   e
relacionamento com a lista de serviço.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:38; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:175; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:30; src/app/app-domain/tributacao/nfse/NfseClient.tsx:53
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.3

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir relacionar o cadastro de atividades com   a
tabela de CBO (Código Brasileiro de ocupação) para
identificação dos autônomos;

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:472; src/lib/tributacao/s9-engine.ts:25; src/app/app-domain/tributacao/base-territorial/actions.ts:11; src/app/app-domain/tributacao/base-territorial/TerritorialBaseClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.4

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   definir   grau   de   risco   em   cada   atividade
classificando entre: baixo, médio, alto ou dependente.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/redesim/RedesimClient.tsx:10; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:38; src/app/app-domain/tributacao/nfse/NfseClient.tsx:102
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.5

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir alteração de forma geral das características de
uma atividade.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:315; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:44; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.6

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir unificar atividades econômicas, na unificação
todos os registros relacionados a atividade unificada,
deverão ser alterados automaticamente para o novo
código.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:289; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:43; src/app/app-domain/tributacao/nfse/NfseClient.tsx:383; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.7

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   o   cadastramento   de   situação   cadastral   da
empresa, por padrão possuir as situações cadastrais:
ativo, desativo baixado e suspenso.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:103; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:28; src/app/app-domain/tributacao/economico/EconomicoClient.tsx:45; src/app/app-domain/tributacao/pessoas/BulkTaxpayerUpdate.tsx:7
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.8

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir realizar e gerenciar as vistorias nas empresas,
cadastrar   tipos   de   vistorias   e   possibilitar   cadastrar
formulários específicos nas vistorias. Permitir adicionar
arquivos e imagens nas vistorias realizadas.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:121; src/app/app-domain/tributacao/guias/GuiasClient.tsx:66; src/app/app-domain/tributacao/page.tsx:85; src/app/app-domain/tributacao/pessoas/relatorio/route.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.9

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastramento dos tipos de empresas:
MEI, LTDA, MEI, EPP etc.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:38; src/app/app-domain/tributacao/layout.tsx:19; src/app/app-domain/tributacao/page.tsx:85; src/app/app-domain/tributacao/pessoas/relatorio/route.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.10

**Fonte:** PDF p.103–103. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   o   cadastramento   de   tipos   de   sócios:
Administrador,   diretor,   coordenador   etc,   controlar   o
percentual de cada sócio. No cadastramento dos tipos
de sócio poder definir quais desses tipos serão válidos
para   verificação   de   débitos   para   fins   de   certidão
negativa dos débitos.

- **Diagnóstico da faixa:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Gap a conferir:** PARCIAL nos catálogos/inscrição; complementar relações e migração de referências na unificação, percentuais e configuração de quais sócios entram na certidão
- **Fases:** P1, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:30; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/lib/tributacao/index.ts:207; src/lib/tributacao/s2-service.ts:77
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.11

**Fonte:** PDF p.103–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   o   controle   e   gerenciamento   de   todas   as
empresas   estabelecidas   no   município,   tanto   físicas
quanto jurídicas, permitindo filtrar por: tipo de empresa,
atividades (principal e secundária), nome da empresa,
optante do simples nacional, data início de atividade,
por contador, por sócio e por informações adicionais do
cadastro econômico.

- **Diagnóstico da faixa:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Gap a conferir:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/vaf/VafClient.tsx:24; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:11; src/lib/tributacao/s10-service.ts:34; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.12

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir incluir empresas no município relacionando ao
cadastro   único   de   contribuintes.   Na   inclusão   da
empresa   permitir:   relacionar   o   cadastro   imobiliário,
informar as atividades principais e/ou secundarias, tipo
de empresa, contador, sócios, dados do contrato social
e regime de tributação.

- **Diagnóstico da faixa:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Gap a conferir:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/vaf/VafClient.tsx:31; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:44; src/lib/tributacao/s10-service.ts:34; src/app/app-domain/tributacao/page.tsx:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.13

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   cadastrar   e   controlar   cadastro   econômicos
provisório, possibilitando definir dias de validade destes
cadastros.   O   sistema   deverá   baixar   ou   desativar
automaticamente os econômicos provisórios vencidos.

- **Diagnóstico da faixa:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Gap a conferir:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:379; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:102; src/app/app-domain/tributacao/certidoes/CertidoesClient.tsx:85; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:309
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.14

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Ao   alterar   um   cadastro   mobiliário   demonstrar   ao
usuário a data e o nome do usuário que realizou a
última alteração, a fim de facilitar para o usuário da
última alteração realizada na empresa;

- **Diagnóstico da faixa:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Gap a conferir:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:22; src/lib/tributacao/s10-service.ts:19; src/lib/tributacao/s8-service.ts:12
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.15

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na inclusão ou alteração da empresa permitir informar
o   endereço   da   empresa   e   o   endereço   de
correspondência.

- **Diagnóstico da faixa:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Gap a conferir:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:29; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:804; src/app/app-domain/tributacao/pessoas/page.tsx:35; src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.16

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   configurar   para   validar   a   existência   de
débitos da empresa no ato de alterar ou incluir uma
empresa, como também permitir configurar para validar
a existência de débitos dos sócios.

- **Diagnóstico da faixa:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Gap a conferir:** PARCIAL; CRUD principal limitado. Concluir cadastro/regras, histórico e agendamento de provisórias; dívida canônica compartilhada
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:27; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:518; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:45
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.17

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir anexar arquivos no cadastro da empresa.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:390; src/app/app-domain/tributacao/economico/[id]/page.tsx:19; src/app/app-domain/tributacao/page.tsx:85; src/app/app-domain/tributacao/pessoas/page.tsx:35
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.18

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir atribuir coordenadas geográfica da empresa
através da ferramenta de mapas.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:390; src/app/app-domain/tributacao/economico/[id]/page.tsx:19; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:706; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:37
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.19

**Fonte:** PDF p.104–104. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir ver no mapa as empresas que retornaram em
uma   consulta.   Por   exemplo,   consultar   todas   as
empresas de uma atividade especifica, o recurso de ver
no mapa deve carregar todas as empresas consultadas
se elas possuírem coordenadas geográficas.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s10-service.ts:34; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:24; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:72; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.20

**Fonte:** PDF p.104–105. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cadastramento de informações adicionais no
cadastro   econômico,   sem   intervenção   técnica,   o
usuário   poderá   incluir   informações   e   formulários
sempre que necessário.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:46; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:388; src/app/app-domain/tributacao/layout.tsx:17; src/app/app-domain/tributacao/recadastramento/actions.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.21

**Fonte:** PDF p.105–105. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Registrar   automaticamente   o   histórico   de   todas   as
alterações   realizadas   na   empresa,   informando   no
mínimo: data de alteração, campo alterado, informação
anterior, informação nova e usuário que realizou o
procedimento.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33; src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.22

**Fonte:** PDF p.105–105. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   a   visualização   do   espelho   do   cadastro
econômico através de uma data especifica, o sistema
deverá   informar   ao   usuário   exatamente   os   dados
cadastrais da empresa na data informada.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:46; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/economico/[id]/page.tsx:7; src/app/app-domain/tributacao/layout.tsx:17
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.23

**Fonte:** PDF p.105–105. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

No próprio gerenciamento e consulta de empresas, ao
selecionar uma empresa o sistema deverá dispor de
recursos   para   detalhar:   vistorias   realizadas   na
empresa,   processos   de   fiscalização,   Protocolos
diversos, alvarás expedidos, permitir detalhar débitos
da empresa e histórico financeiro da empresa.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:275; src/app/app-domain/tributacao/vaf/VafClient.tsx:187; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:169; src/lib/tributacao/s10-service.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.24

**Fonte:** PDF p.105–105. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir alteração geral do cadastro mobiliário podendo
o usuário definir os filtros de alteração. Por exemplo:
Permitir alterar todas as atividades de determinadas
empresas,   ou   então,   permitir   alterar   a   situação
cadastral   “baixar”,   “ativar”,   “desativar”,   “suspender”
todas   as   empresas   que   possuem   determinada
características, entre outras informações relacionadas
ao cadastro mobiliário.

- **Diagnóstico da faixa:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Gap a conferir:** PARCIAL em registros auxiliares; provar mapa e consulta completa, manutenção temporal e lote com filtros/validações
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts:8; src/lib/tributacao/s10-service.ts:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.25

**Fonte:** PDF p.105–105. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastramento de tipos de alvarás, definir
configurações distintas por ano e para cada tipo como,
por   exemplo:   Atribuir   prazo   de   validade,   validar   a
existência de débitos na inclusão, permitir relacionar
layouts distintos para cada tipo de alvará.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s3-service.ts:34; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:44; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.26

**Fonte:** PDF p.105–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   nas   configurações   dos   tipos   de   alvarás
definir   métodos   de   bloqueio   para   emissão.   Por
exemplo, empresa com algum tipo de restrição em seu
cadastro bloquear a emissão. O usuário poderá definir
mensagens de bloqueio.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:44; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:388; src/app/app-domain/tributacao/pessoas/relatorio/route.ts:16; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.27

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar definir quais tipos de alvarás estará visível
para emissão pelo portal do cidadão.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:44; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17; src/app/app-domain/tributacao/nfse/NfseClient.tsx:212; src/lib/tributacao/s8-service.ts:562
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.28

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir gerenciar e consultar todos os alvarás emitidos
por período, por tipo, por empresa, possibilitando ainda
na mesma consulta reemitir ou reimprimir o documento,
assinar digitalmente e permitir cancelar o documento.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s8-service.ts:531; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:44; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.29

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar consultar todos os processos relacionados
ao mobiliário selecionado, com o recurso de visualizar
detalhes do processo tais como: tramite, assunto, sub-
assunto, anexos do processo, pareceres, etc.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:388; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:26; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:64
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.30

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de alvará de forma individual e/ou
geral em lote.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:149; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:44; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:391
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.31

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Dispor de serviços no portal do cidadão para consulta
de autenticidade de alvarás emitidos.

- **Diagnóstico da faixa:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Gap a conferir:** PARCIAL; fechar serviço canônico interno/portal e todos os estados/ações, layout por tipo e autenticação pública
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:17; src/app/app-domain/tributacao/nfse/NfseClient.tsx:466; src/lib/tributacao/s8-service.ts:562; src/app/app-domain/tributacao/nfse/[id]/documento/route.ts:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.32

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   cadastrar   tipos   de   eventos   como,   por
exemplo: Feiras, shows e comemorações.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Gap a conferir:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:730; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:867; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:70
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.33

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   a   inclusão   de   eventos   com   no   mínimo   as
seguintes informações: Nome, responsável, cadastro
econômico se houver, data inicio, data fim do evento e
endereço.   Possibilitar   ainda   cadastrar   informações
adicionais ao evento que podem ser configuradas a
qualquer momento pelo usuário.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Gap a conferir:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:46; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:22; src/app/app-domain/tributacao/redesim/RedesimClient.tsx:27
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.34

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar no cadastro de evento a emissão do alvará
de evento com layout personalizado.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Gap a conferir:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:168; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:44; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:730; src/app/app-domain/tributacao/layout.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.35

**Fonte:** PDF p.106–106. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastro de veículos permitindo cadastrar
a   marca   do   veículo,   modelo,   prefixo,   placa,
diferenciando   placa   Brasileia   e   do   MERCOSUL,
empresa relacionado ao veículo e condutor. A fim de
poder   registrar   táxis,   veículos   de   transportes   de
pessoas   e/ou   veículos   frigoríficos   que   exigem
inspeções e vistorias sanitárias entre outros fins.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Gap a conferir:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:44; src/app/app-domain/tributacao/vaf/VafClient.tsx:187; src/lib/tributacao/s9-service.ts:369; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:262
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.36

**Fonte:** PDF p.106–107. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir emissão de forma on-line da certidão de baixa
de empresa e do comprovante de inscrição municipal.

- **Diagnóstico da faixa:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Gap a conferir:** NÃO VERIFICADO no ciclo suficiente; localizar registros auxiliares e completar apenas os subcritérios oficiais
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:112; src/lib/tributacao/nfse-danfse.ts:3; src/lib/tributacao/s7-service.ts:16; src/lib/tributacao/s9-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.37

**Fonte:** PDF p.107–107. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar configurar e cadastrar o cálculo de ISS fixo,
ISS Fixo anual, Taxa de licença localização ou outras
taxas que por ventura for necessário ser lançadas a
empresas. Permitir configurar a fórmula de cálculo e
definir valores mínimos para geração do débito e da
parcela.   Como   também   permitir   atribuir   descontos
diferenciados.

- **Diagnóstico da faixa:** PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final
- **Gap a conferir:** PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:6; src/lib/tributacao/s3-service.ts:4; src/lib/tributacao/s4-service.ts:4; src/lib/tributacao/s7-service.ts:28
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.38

**Fonte:** PDF p.107–107. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de notificação e/ou aviso de débitos
em PDF para empresas com débitos no município.
Possibilitando a geração em lote, permitindo filtrar por
um valor mínimo, por empresa, por endereço bairro,
logradouro. E permitir ainda a geração de arquivos para
terceiros em formato txt ou xml. Inserir no PDF da
notificação   o   boleto   com   código   de   barras   para
pagamentos.

- **Diagnóstico da faixa:** PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final
- **Gap a conferir:** PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:238; src/lib/tributacao/s3-service.ts:43; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:320; src/lib/tributacao/nfse-danfse.ts:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.39

**Fonte:** PDF p.107–107. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a emissão de relatório de comparativos de
valores,   dispondo   filtro   de   dois   exercícios,   pelas
receitas, por contribuinte ou empresa. O sistema deverá
listar as empresas e o valor de cada exercício.

- **Diagnóstico da faixa:** PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final
- **Gap a conferir:** PARCIAL no motor; completar receitas anuais, relatórios e modelos; intercâmbio para terceiros ao final
- **Fases:** P5, P7, P9. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s2-service.ts:8; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/guias/[id]/route.ts:17; src/app/app-domain/tributacao/vaf/VafClient.tsx:157
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.40

**Fonte:** PDF p.107–107. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar a importação dos arquivos fornecido pela
receita federal em formato txt das empresas do simples
nacional, gerando um arquivo de saída das empresas
com   débitos   ou   com   pendências   no   município.   O
sistema deverá manter a consulta de todos os arquivos
importados   e   exportado   e   permitir   download   dos
arquivos.

- **Diagnóstico da faixa:** PARCIAL no Simples normalizado; parser/layout oficial, análise e termos completos sem tratar exclusão interna como arquivo oficial
- **Gap a conferir:** PARCIAL no Simples normalizado; parser/layout oficial, análise e termos completos sem tratar exclusão interna como arquivo oficial
- **Fases:** P7, P9. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s5-service.ts:4; src/app/app-domain/tributacao/vaf/VafClient.tsx:60; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:168; src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-13.41

**Fonte:** PDF p.107–107. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   própria   importação   das   empresas   do   simples
nacional, permitir consultar via sistema todas empresas
que constam no arquivo, possibilitando a impressão do
termo   de   deferimento   e   indeferimento   do   simples
nacional.

- **Diagnóstico da faixa:** PARCIAL no Simples normalizado; parser/layout oficial, análise e termos completos sem tratar exclusão interna como arquivo oficial
- **Gap a conferir:** PARCIAL no Simples normalizado; parser/layout oficial, análise e termos completos sem tratar exclusão interna como arquivo oficial
- **Fases:** P7, P9. **Responsável funcional:** Tributação/ISS (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/vaf/VafClient.tsx:120; src/lib/tributacao/s5-service.ts:4; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:20; src/lib/tributacao/__tests__/s5-engine.test.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
