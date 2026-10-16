# P0 — EXE-12: Gestão de IPTU

**Revisão de 15/10/2026:** os 30 itens têm referências individuais de código, regressão e pendências em [REVISAO_IPTU_ISS_ITBI_2026_10_15.md](REVISAO_IPTU_ISS_ITBI_2026_10_15.md#exe-12--iptu--cadastro-imobiliário-30-itens), incluindo vínculos urbanísticos tipados, valores próprios da PGV e total edificado das unidades. Aceites não promovidos.

**Quinta continuação:** inclusão nativa/perfil/titularidade em transação única e simulação individual/englobada com áreas alternativas e efetivação fiscal sem alteração do cadastro, detalhadas na seção «Quinta continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Aceites permanecem não executados.

**Sexta continuação:** alteração geral da PGV por bairro/logradouro, com prévia, versões, editor de campos e rollback validado; detalhes e limites na seção «Sexta continuação» do mesmo documento.

**Terceira continuação:** perfil imobiliário, composição de inscrição, titularidade versionada, protocolo/bloqueio coletivo, cópia do perfil, consumo de PGV/testadas e simulação de englobamento detalhados na seção «Terceira continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Os limites são registrados por subcritério; aceites permanecem não executados.

**Segunda continuação:** catálogos territoriais e PGV/testadas, formulários/vistorias, histórico imobiliário transversal, bloqueios com autorização, cópias, alteração geral e desmembramento/remembramento detalhados na seção «Segunda continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). A cobertura de cada subcritério e seus limites estão registrados; os aceites abaixo permanecem não executados.

**Continuação de desenvolvimento:** avaliação anual configurada integrada ao lote e comparativo de exercícios documentados em [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md), relacionados a .25/.26/.29/.30. O registro explicita cobertura parcial e não altera os aceites abaixo.

Ente: **PREFEITURA**. 30 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-12.1

**Fonte:** PDF p.98–98. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastramento de edifícios, condomínios,
loteamento, localidades, estes devem ser possível de
relacionar com o cadastro imobiliário.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/recadastramento/actions.ts:11; src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts:11; src/app/app-domain/tributacao/recadastramento/RecadastramentoClient.tsx:7; src/app/app-domain/tributacao/base-territorial/actions.ts:21
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.2

**Fonte:** PDF p.98–98. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastramento de zoneamentos conforme
plano   diretor   municipal,   sobre   estes   cadastros   de
zoneamento permitir configurar informações adicionais
sem   intervenção   técnica,   permitindo,   por   exemplo,
cadastrar e atribuir índices urbanísticos como: número
de pavimentos, afastamentos frontais e laterais como
também possibilitar relacionar as atividades permitidas,
permissíveis e proibidas.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:267; src/app/app-domain/tributacao/vaf/VafClient.tsx:71; src/app/app-domain/tributacao/economico/[id]/page.tsx:6; src/app/app-domain/tributacao/economico/EconomicoClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.3

**Fonte:** PDF p.98–98. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir desativar zoneamentos e permitir relacionar
estes zoneamentos ao cadastro imobiliário, podendo
um imóvel estar relacionado a vários zoneamentos.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts:11; src/app/app-domain/tributacao/recadastramento/RecadastramentoClient.tsx:17; src/lib/tributacao/index.ts:108; src/lib/tributacao/s2-service.ts:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.4

**Fonte:** PDF p.98–98. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastramento de novas situações cadastral
além do padrão de: ativo, baixado e suspenso. Através
desta rotina é possível o usuário criar novas situações
cadastrais a qualquer momento para relacionar aos
imóveis,   como   por   exemplo:   Embargado,   em
construção etc.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:45; src/app/app-domain/tributacao/recadastramento/actions.ts:11; src/app/app-domain/tributacao/imoveis/property-actions.ts:6; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.5

**Fonte:** PDF p.98–98. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir realizar e gerenciar as vistorias dos imóveis,
permitindo cadastrar tipos de vistorias e possibilitar
cadastrar formulários específicos nas vistorias. Permitir
anexar arquivos nas vistorias realizadas.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:45; src/app/app-domain/tributacao/economico/[id]/page.tsx:18; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:360; src/app/app-domain/tributacao/guias/GuiasClient.tsx:66
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.6

**Fonte:** PDF p.98–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   cadastro   de   planta   genérica   de   valores,
relacionado a um bairro e logradouro. Neste cadastro
dever   ser   possível   o   usuário   configurar   qualquer
informação adicional como por exemplo: valor do m2,
tipo de pavimentação, se possui coleta de lixo etc.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s4-service.ts:23; src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:25; src/lib/tributacao/index.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.7

**Fonte:** PDF p.99–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   relacionar   a   planta   genérica   de   valores   a
terrenos urbanos, possibilitando em um único terreno
conter   mais   de   uma   planta   de   valores,   conforme
testadas do imóvel.

- **Diagnóstico da faixa:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Gap a conferir:** PARCIAL na base territorial e subunidade. Concluir editores/relacionamentos, índices urbanísticos, múltiplas plantas/testadas e regras sem intervenção técnica
- **Fases:** P1, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:330; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:30; src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:61
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.8

**Fonte:** PDF p.99–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir rotina que controle e gerencia todo o cadastro
imobiliário municipal, seja ele urbano ou rural. Nesta
rotina deverá ser possível cadastramento de terrenos,
unidades, imóveis rurais e permitir a manutenção dos
registros.

- **Diagnóstico da faixa:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Gap a conferir:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Fases:** P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:45; src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:22; src/app/app-domain/tributacao/imoveis/property-actions.ts:28; src/app/app-domain/tributacao/layout.tsx:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.9

**Fonte:** PDF p.99–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em todo o cadastro imobiliário deverá possui o código
do cadastro, a inscrição imobiliária e o tipo: terreno,
unidade ou rural. Em toda a unidade seja ela autônoma
ou englobada deve estar relacionado a um código de
cadastro de terreno.

- **Diagnóstico da faixa:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Gap a conferir:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Fases:** P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:61; src/lib/tributacao/index.ts:66; src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.10

**Fonte:** PDF p.99–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cadastramento de informações adicionais no
boletim do cadastro imobiliário, sem intervenção técnica
de empresa especializada. O usuário poderá incluir
informações   e   formulários   no   imóvel   a   qualquer
momento,   podendo   cadastrar   informações   diversas
isoladas para terrenos, unidades ou imóveis rurais.

- **Diagnóstico da faixa:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Gap a conferir:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Fases:** P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:388; src/app/app-domain/tributacao/recadastramento/actions.ts:11; src/lib/tributacao/s8-service.ts:12; src/app/app-domain/tributacao/economico/[id]/page.tsx:18
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.11

**Fonte:** PDF p.99–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O   cadastro   do   imóvel   deve   conter   no   mínimo   as
seguintes informações: Número do cadastro imobiliário,
inscrição imobiliária, área do terreno, área construída e
total   construída   em   m2,   matricula   do   imóvel,
proprietários   e   demais   proprietários,   endereço   do
imóvel e endereço de correspondência, coordenadas
geográficas do imóvel através de ferramenta de mapas,
zoneamento,   testadas,   número   de   pavimentos,
afastamentos, tipo de utilização.

- **Diagnóstico da faixa:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Gap a conferir:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Fases:** P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:25; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10; src/app/app-domain/tributacao/imoveis/property-actions.ts:18; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:111
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.12

**Fonte:** PDF p.99–99. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   que   os campos   que   compõem   a   inscrição
imobiliária   sejam   configuráveis,   podendo   alterar   a
ordem, tamanho e a descrição dos campos.

- **Diagnóstico da faixa:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Gap a conferir:** PARCIAL; conferir todos os campos e persistência, vínculo pai/coproprietários e editor de composição/ordem/tamanho da inscrição
- **Fases:** P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:20; src/lib/tributacao/s7-service.ts:28; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:221; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:270
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.13

**Fonte:** PDF p.99–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir consultar o histórico de alteração de cada
cadastro imobiliário, permitindo consultar os históricos
em uma data especifica, o sistema deverá informar o
usuário exatamente os dados do   cadastro   na data
informada.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:12; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:22
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.14

**Fonte:** PDF p.100–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir emitir o espelho do cadastro imobiliário através
de uma data definida pelo usuário.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/base-territorial/actions.ts:17; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:93; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/cobranca/page.tsx:81
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.15

**Fonte:** PDF p.100–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na própria rotina de cadastro de imóveis, selecionando
um imóvel em especifico, o sistema deverá dar a opção
para detalhar dados de: Isenções, Alvarás, Vistorias,
Entregas/Devoluções   de   documentos,   Processo   de
ITBI,   e   Protocolos   diversos   relacionados ao   imóvel
(listar todos os protocolos que o imóvel obteve durante
todos os exercícios) e permitir acessar o extrato de
débitos do imóvel.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/lib/tributacao/s8-service.ts:574; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:210
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.16

**Fonte:** PDF p.100–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir anexar arquivos nos cadastros imobiliários.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/economico/[id]/page.tsx:6; src/app/app-domain/tributacao/economico/EconomicoClient.tsx:158; src/app/app-domain/tributacao/fontes-cadastrais/RegistrySourcesClient.tsx:7; src/app/app-domain/tributacao/imoveis/[id]/page.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.17

**Fonte:** PDF p.100–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir   um   demonstrativo   da   linha   do   tempo   do
cadastro imobiliário, que demonstre ao usuário desde a
data início do cadastro e o histórico de alterações nos
demais períodos.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:70; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:11; src/lib/tributacao/s3-service.ts:34
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.18

**Fonte:** PDF p.100–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em   toda   alteração   de   qualquer   imóvel,   o   sistema
deverá   gravar   automaticamente   o   histórico   de
alteração,   gravando   a   data   de   alteração,   campo
alterado,   informação   anterior,   informação   nova   e   o
usuário que realizou a alteração. Permitir ainda inserir
histórico manual no cadastro imobiliário.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s3-service.ts:39; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33; src/lib/tributacao/s7-service.ts:11; src/lib/tributacao/s9-service.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.19

**Fonte:** PDF p.100–100. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o usuário configurar bloqueios de alteração em
determinado cadastro imobiliário, e somente mediante
autorização do usuário supervisor a alteração deve ser
liberada. Por exemplo, cadastro número x não pode ser
alterado pelo motivo y. Ou todos os cadastros que estão
em área de risco ou APP não podem ser alterados sem
autorização do supervisor.

- **Diagnóstico da faixa:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Gap a conferir:** PARCIAL nas referências/registro auxiliar; completar reconstrução temporal e guardas no servidor, inclusive alterações fora da tela imobiliária
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s4-service.ts:23; src/lib/tributacao/s9-service.ts:9; src/lib/tributacao/index.ts:29; src/lib/tributacao/s3-service.ts:84
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.20

**Fonte:** PDF p.100–101. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar copiar cadastro imobiliário e permitir definir
a quantidade de cadastro para a cópia. Ao final, o
sistema deve perguntar ao usuário se deseja alterar
cada cadastro copiado.

- **Diagnóstico da faixa:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Gap a conferir:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Fases:** P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10; src/app/app-domain/tributacao/imoveis/property-actions.ts:6; src/lib/tributacao/s8-service.ts:12; src/lib/tributacao/s9-service.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.21

**Fonte:** PDF p.101–101. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir alteração   geral de   qualquer informação   do
cadastro imobiliário, podendo o usuário definir os filtros
de alteração. Por exemplo: Caso o usuário precisa
alterar todos os imóveis localizados na rua x ou no
bairro y para construído, o sistema deverá dar essa
opção. Ou então permitir alterar a situação cadastral
“baixar”, “ativar”, “desativar”, “suspender” para todos
imóveis   que   possuem   determinada   características,
entre outras informações relacionadas ao imóvel.

- **Diagnóstico da faixa:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Gap a conferir:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Fases:** P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:175; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.22

**Fonte:** PDF p.101–101. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar a alteração geral de qualquer informação
cadastral da planta genérica de valores, podendo filtrar
por bairro ou logradouro;

- **Diagnóstico da faixa:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Gap a conferir:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Fases:** P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:320; src/app/app-domain/tributacao/base-territorial/TerritorialBaseClient.tsx:19; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.23

**Fonte:** PDF p.101–101. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar configurar para que uma alteração cadastral
do imóvel seja relacionada a um número de protocolo.

- **Diagnóstico da faixa:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Gap a conferir:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Fases:** P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts:8; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:31; src/app/app-domain/tributacao/imoveis/[id]/page.tsx:8; src/app/app-domain/tributacao/imoveis/property-actions.ts:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.24

**Fonte:** PDF p.101–101. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir desmembrar e unificar imóveis. Em todo o
processo de desmembramento ou unificação devem
ser   gerados   novos   cadastros   imobiliários,   e   alterar
automaticamente o status dos antigos imóveis para
desmembrado   ou   remembrado.   Permitir   imprimir   o
comprovante de desmembramento/remembramento.

- **Diagnóstico da faixa:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Gap a conferir:** Cópia de características disponível, demais comportamentos NÃO VERIFICADOS. Completar prévia e lote auditável; preservar imóveis antigos e relações históricas
- **Fases:** P5, P7. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:45; src/app/app-domain/tributacao/pessoas/[id]/page.tsx:6; src/lib/tributacao/index.ts:36; src/app/app-domain/tributacao/economico/[id]/page.tsx:6
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.25

**Fonte:** PDF p.101–101. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a simulação de IPTU de forma individual de um
determinado imóvel, possibilitando alterações de dados
cadastrais do imóvel sem afetar a base cadastral atual
do   imóvel,   apenas   para   simulação.   Por   exemplo,
permitir simular o IPTU do Imóvel x no ano de 2026 com
área construída e área territorial de X m², o sistema
deve apresentar os valores venais, imposto e permitir a
efetivação do lançamento se o usuário assim desejar.
Na efetivação não poderá alterar os dados cadastrais
atuais do imóvel. Nesta mesma rotina se o imóvel
possuir englobamentos, deverá dispor de opção para o
usuário alterar dados de unidades englobadas para fins
de simulação.

- **Diagnóstico da faixa:** PARCIAL; prévia atual não cobre todas as opções nem persistência do lote simulado. Reutilizar motor com snapshot/ID e política anual conferida
- **Gap a conferir:** PARCIAL; prévia atual não cobre todas as opções nem persistência do lote simulado. Reutilizar motor com snapshot/ID e política anual conferida
- **Fases:** P2, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:6; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:207; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.26

**Fonte:** PDF p.101–102. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir cadastrar e configurar a receita de cálculo do
IPTU, definindo valores mínimos dos débitos e das
parcelas,   atribuir   descontos diferenciados,   validar   a
existências de débitos para concessão dos descontos,
podendo ainda definir qual tipo de débito a ser válido,
se   exercício,   divida   ativa,   parcelamento   ou   todos.
Permitir   definir   mais   de   uma   opção   de   data   de
pagamento, e controlar de forma anual os parâmetros
de cálculo de cada tributo e valores venais, com suas
respectivas fórmulas de cálculos.

- **Diagnóstico da faixa:** PARCIAL; prévia atual não cobre todas as opções nem persistência do lote simulado. Reutilizar motor com snapshot/ID e política anual conferida
- **Gap a conferir:** PARCIAL; prévia atual não cobre todas as opções nem persistência do lote simulado. Reutilizar motor com snapshot/ID e política anual conferida
- **Fases:** P2, P5. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/lib/tributacao/index.ts:12; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/lib/tributacao/s2-service.ts:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.27

**Fonte:** PDF p.102–102. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a geração de notificação e/ou aviso de débitos
em   PDF   para   imóveis   com   débitos   no   município.
Possibilitando a geração em lote permitindo filtrar por
um valor mínimo, por endereço bairro, logradouro. E
permitir ainda a geração de arquivos para terceiros em
formato txt ou xml. Permitir inserir no PDF da notificação
o boleto com código de barras para pagamentos.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Gap a conferir:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Fases:** P7, P9. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:320; src/lib/tributacao/s3-service.ts:43; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:238; src/lib/tributacao/s7-service.ts:16
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.28

**Fonte:** PDF p.102–102. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir a consulta de todas as notificações e aviso
emitidas   por   imóvel,   permitindo   filtrar   por   data   de
geração,   tipo   de   notificação,   contribuinte,   imóvel   e
permitir a remissão ou cancelamento do documento.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Gap a conferir:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Fases:** P7, P9. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/index.ts:29; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:12; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:33
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.29

**Fonte:** PDF p.102–102. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir relatório comparativo de valores do IPTU, no
qual deve ser possível filtrar por percentual ou valores,
a   maior   ou   a   menor   dos   tributos   ou   valor   venal
comparando   com   o   exercício   anterior.   Neste
comparativo deve permitir comparar os valores de no
mínimo dois exercícios, sendo possível alterar o filtro do
exercício.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Gap a conferir:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Fases:** P7, P9. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/lib/tributacao/index.ts:12; src/lib/tributacao/s2-service.ts:8; src/lib/tributacao/fiscal-engine.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-12.30

**Fonte:** PDF p.102–102. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possuir um relatório resumido dos valores de IPTU,
possibilitando filtrar por exercício. Em um único relatório
deve   conter   os   valores   lançados,   valores   líquidos,
descontos,   isenções e   imunidades   de   cada   tributo.
Neste mesmo relatório deve detalhar a quantidade de
lançamentos e de guias emitidas por cota única e por
parcelas. Demonstrar valores pagos até o momento e o
índice de inadimplência.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Gap a conferir:** NÃO VERIFICADO na integralidade das saídas. Emitir sobre os fatos canônicos, com todos os filtros/contagens/isenções/cotas/parcelas; arquivo terceiro ao final
- **Fases:** P7, P9. **Responsável funcional:** Tributação/IPTU (pessoa a designar).
- **Fontes municipais:** 108, 113, 115, 140, 141.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/bi-tributario/BiTributarioClient.tsx:31; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/lib/tributacao/s8-service.ts:228
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
