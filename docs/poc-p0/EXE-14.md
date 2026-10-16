# P0 — EXE-14: Gestão de ITBI

**Revisão de 15/10/2026:** os 26 itens têm referências individuais de código, regressão e pendências em [REVISAO_IPTU_ISS_ITBI_2026_10_15.md](REVISAO_IPTU_ISS_ITBI_2026_10_15.md#exe-14--itbi-26-itens), incluindo canal on-line, anexos, impugnação inicial, retificação e histórico nativo de campos com cadeia de 14 migrations. Aceites não promovidos.

**Quinta continuação:** conjunto de imóveis/unidades com valores individuais no mesmo processo e ciclo interno de impugnação/readequação do crédito e documentos, detalhados na seção «Quinta continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Canal externo e demais limites são explícitos; aceites permanecem não executados.

**Sexta continuação:** compartilhamento transacional dos anexos da impugnação/formulários com a ficha imobiliária e protocolo; cadeia de onze migrations validada com impugnação, decisão, pagamento, transferência e estorno.

**Terceira continuação:** formulário tipado na inclusão da declaração e múltiplos transmitentes, com transferência parcial conservando coproprietários, detalhados na seção «Terceira continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Os limites são registrados por subcritério; aceites permanecem não executados.

**Segunda continuação:** confirmação interna com lançamento/DAM/comprovante GED em uma transação, formulário tipado, anexos compartilhados com o imóvel e restrição de UG na rota do documento detalhados na seção «Segunda continuação» de [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md). Fluxo on-line e demais subcritérios continuam explicitados como pendentes; os aceites abaixo permanecem não executados.

**Continuação de desenvolvimento:** avaliação própria, modalidades editáveis, coleção de adquirentes, devedor/vencimento e transferência manual com estorno documentados em [IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md](IMPLEMENTACAO_IPTU_ISS_ITBI_2026_10_14.md), relacionados a .1/.3/.4/.5/.12/.14/.19/.20. O registro explicita cobertura parcial e não altera os aceites abaixo.

Ente: **PREFEITURA**. 26 itens; **nenhum aceite executado nesta fase**. Revisão: f94b8be7d99a5f5a4ef0f4e12b104ad755f383cc.

Texto extraído do PDF local; conferir o original para layouts, listas e paginação. Busca estática indica onde investigar, não comprova atendimento. A matriz individual editável, com fontes, modelos, consumidores, testes e roteiro, está em [CONTROLE_REQUISITOS.json](CONTROLE_REQUISITOS.json). Diagnósticos e gaps abaixo são herdados da faixa do plano; validar cada subcritério antes de abrir desenvolvimento.

## EXE-14.1

**Fonte:** PDF p.107–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir controlar e gerenciar todos os processos de
transferências de imóveis urbanos e rural diferenciando
os processos internos dos on-line. Na inclusão do ITBI
a informação principal é o cadastro imobiliário, a fim de
facilitar a avaliação do imóvel, no ato de informar o
cadastro   imobiliário   o   sistema   deve   demonstrar   ao
usuário os dados principais do imóvel sendo: Área do
terreno,   área   edificada,   endereço   e   mapa   de
localização.

- **Diagnóstico da faixa:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Gap a conferir:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Fases:** P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:18; src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:25; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:29; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.2

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Em   um   único   processo   de   transferência   deve   ser
possível relacionar todas as unidades pertencentes ao
terreno, como também atribuir o valor venal de cada
imóvel.

- **Diagnóstico da faixa:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Gap a conferir:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Fases:** P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:22; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:46; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:25; src/app/app-domain/tributacao/imoveis/[id]/PropertyCadastralTools.tsx:10
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.3

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O sistema deverá dispor de configuração para permitir
definir a fórmula de cálculo dos valores venais, no qual
poderá ser diferente da base de cálculo do IPTU.

- **Diagnóstico da faixa:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Gap a conferir:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Fases:** P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s4-service.ts:66; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:15; src/lib/tributacao/fiscal-engine.ts:3; src/lib/tributacao/s3-service.ts:90
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.4

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o cadastramento de diferentes alíquotas cada
um   com   seu   percentual   como:   compra,   venda,
financiamento etc. Permitir diferenciar as alíquotas que
poderão ser inclusas para o ITBI on-line.

- **Diagnóstico da faixa:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Gap a conferir:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Fases:** P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:38; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:126; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.5

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na inclusão de um ITBI sendo ele interno ou on-line, no
transmitente   permitir   transferir   parcialmente   a
propriedade através de um percentual, permitir informar
vários adquirentes cada um com seu percentual de
compra.   O   sistema   deve   consistir   se   o   percentual
adquirido ou transmitido for diferente de 100%.

- **Diagnóstico da faixa:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Gap a conferir:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Fases:** P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s2-service.ts:10; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:38; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:26
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.6

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o usuário definir se atualiza o endereço de
correspondência do imóvel para o novo comprador.

- **Diagnóstico da faixa:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Gap a conferir:** PARCIAL; declaração atual tem um imóvel e fórmula simples. Concluir coleção de unidades, modalidades e seleção de endereço sem reduzir adquirentes ao primeiro
- **Fases:** P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:29; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:289; src/app/app-domain/tributacao/imoveis/ImoveisClient.tsx:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.7

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir inserir informações adicionais na inclusão do
ITBI, possibilitando incluir campos do tipo: data, lista,
numérico, alfanumérico, booleano.

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:12; src/lib/tributacao/index.ts:29; src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s9-service.ts:26
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.8

**Fonte:** PDF p.108–108. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir inserir anexos ao processo de ITBI interno e no
on-line.

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:126; src/app/app-domain/tributacao/divida-ativa/DividaAtivaClient.tsx:8
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.9

**Fonte:** PDF p.108–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Controlar   o   histórico   de   cada   processo   de   ITBI
registrando   a   data,   campo   alterado,   informação
anterior, informação nova e usuário nome.

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:21; src/lib/tributacao/index.ts:29; src/lib/tributacao/s3-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.10

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o cadastramento de tabelionatos e usuário
tabelionatos com finalidade de inclusão do ITBI on-line.

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:38; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:126; src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:11
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.11

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir incluir ITBI de forma on-line pelos tabelionatos.
O   sistema   deverá   dispor   de   configuração   para   a
municipalidade definir o critério de liberação do ITBI on-
line, podendo definir se a liberação irá ocorrer sem
análise prévia da prefeitura ou através de análise do
município. Caso optem por liberar automático, se o
valor venal informado pelo usuário foi a menor do que o
calculado, o sistema deverá dar a opção para o usuário
solicitar a impugnação do ITBI, inserindo a justificativo
e   anexo,   este   processo   de   impugnação   ficará   em
analise para os fiscais deferir ou indeferir.

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/nfse/NfseClient.tsx:63; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:13; src/lib/tributacao/s3-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.12

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na   inclusão   do   ITBI   permitir   selecionar   no   ato   da
inclusão se o débito será gerado para o comprador ou
para o vendedor;

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:279; src/app/app-domain/tributacao/iss-bancario/IssBancarioClient.tsx:240; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:9; src/lib/tributacao/s3-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.13

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

O usuário tabelionato poderá consultar os processos de
ITBIs apenas dos processos em que está relacionado,
com   possibilidade   de   impressão   dos   processos
incluídos;

- **Diagnóstico da faixa:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Gap a conferir:** PARCIAL nos eventos/protocolo; portal de tabelionatos e ciclo de impugnação NÃO VERIFICADOS. Completar autorização por processo, regras e devedor configurável
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:9; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:2; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:2; src/lib/tributacao/s2-service.ts:19
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.14

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Na confirmação de inclusão de um processo de ITBI, o
sistema   deve   gerar   o   cálculo   tributário   e   emitir   o
comprovante de lançamento junto com a guia para
pagamento.

- **Diagnóstico da faixa:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Gap a conferir:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/index.ts:66; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:207; src/lib/tributacao/s8-service.ts:9; src/lib/tributacao/s9-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.15

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   incluir   o   ITBI   do   tipo:   isento,   imunidade,
lançamento normal, prévia e integralização de capital.

- **Diagnóstico da faixa:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Gap a conferir:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:91; src/app/app-domain/tributacao/cadastros-fiscais/actions.ts:65; src/app/app-domain/tributacao/operacoes/OperacoesTributariasClient.tsx:12; src/lib/tributacao/index.ts:105
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.16

**Fonte:** PDF p.109–109. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir no ITBI on-line liberar ação de mensagens que
podem ser trocadas entre o usuário externo e o fiscal
do município, podendo o usuário externo tirar duvida e
esclarecer detalhes do processo. O sistema deverá
salvar histórico das mensagens em cada processo de
ITBI.

- **Diagnóstico da faixa:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Gap a conferir:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:11; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:6; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:126; src/lib/tributacao/s3-service.ts:3
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.17

**Fonte:** PDF p.109–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir o fiscal solicitar readequação de um processo
de   ITBI   efetuado   de   forma   on-line.   Por   exemplo:
solicitar uma nova matrícula atualizado do imóvel, neste
exemplo   o   fiscal   pode   solicitar   a   readequação   do
processo, solicitando documentos e o usuário externo
readequar diretamente pelo sistema.

- **Diagnóstico da faixa:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Gap a conferir:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s7-service.ts:4; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:126; src/lib/tributacao/index.ts:29
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.18

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Todos os documentos anexados no ITBI interno e on-
line, além de ficarem salvo no processo de ITBI, devem
estar   automaticamente   salvos   nos   anexos   dos
cadastros imobiliários.

- **Diagnóstico da faixa:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Gap a conferir:** PARCIAL; tornar emissão coordenada, modalidades e GED compartilhado, com acesso interno/externo e referência preservada
- **Fases:** P2, P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/lib/tributacao/s3-service.ts:3; src/lib/tributacao/s7-service.ts:16; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:126
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.19

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   configurar   se   irá   ocorrer   transferência
automática do imóvel no pagamento do ITBI.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Gap a conferir:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:390; src/lib/tributacao/s8-service.ts:96; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:495; src/app/app-domain/tributacao/motor-fiscal/MotorFiscalClient.tsx:72
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.20

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir realizar a transferência manual do imóvel no
próprio processo de ITBI.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Gap a conferir:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:32; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:390; src/app/app-domain/tributacao/itbi/ItbiClient.tsx:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.21

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir retificar um ITBI com situação transferido, na
retificação o sistema deverá gerar um novo Identificador
de ITBI e alterar o anterior para retificado.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Gap a conferir:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s9-service.ts:196; src/app/app-domain/tributacao/simples-nacional/SimplesNacionalClient.tsx:185; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:28; src/app/app-domain/tributacao/fiscalizacao/FiscalizacaoClient.tsx:289
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.22

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir a emissão da guia retificadora.

- **Diagnóstico da faixa:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Gap a conferir:** NÃO ATENDE integralmente ao gatilho 19 no fluxo examinado; demais PARCIAIS/NÃO VERIFICADOS. Corrigir GAP-08 e encadear versões/titularidades/guias
- **Fases:** P2, P5. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/index.ts:149; src/lib/tributacao/s7-service.ts:282; src/lib/tributacao/s9-service.ts:168; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:152
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.23

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Permitir   emitir   Declaração   de   quitação   de   ITBI   e
possibilitar configurar declarações diversas, conforme
necessidade da municipalidade.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Gap a conferir:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/itbi/ItbiClient.tsx:9; src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:390; src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.24

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar   configurar   para   cancelar   de   forma
automática os processos de ITBI vencido a mais de x
dias.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Gap a conferir:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:309; src/lib/tributacao/s8-service.ts:96; src/lib/tributacao/s9-service.ts:3; src/app/app-domain/tributacao/alvaras/AlvarasClient.tsx:39
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.25

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar o usuário interno (fiscal) controlar a fila de
processos de ITBI em análise, ordenando por data de
entrada dos processos.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Gap a conferir:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/cadastros-fiscais/FiscalRecordWorkspace.tsx:6; src/lib/tributacao/s8-service.ts:12; src/lib/tributacao/s9-service.ts:9
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.

## EXE-14.26

**Fonte:** PDF p.110–110. **Status:** NÃO VERIFICADO. **Aceite:** NÃO_EXECUTADO.

Possibilitar configurar bloqueios e aviso, para que, ao
incluir o ITBI o sistema não permita a gravação ou alerte
o usuário.

- **Diagnóstico da faixa:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Gap a conferir:** NÃO VERIFICADO na integralidade; implementar/reusar configurações e jobs com estados coerentes, sem supor prazo legal
- **Fases:** P5, P7. **Responsável funcional:** Tributação/ITBI (pessoa a designar).
- **Fontes municipais:** 108, 115.
- **Base candidata:** src/app/app-domain/tributacao/cobranca/CobrancaClient.tsx:238; src/lib/tributacao/s3-service.ts:3; src/app/app-domain/tributacao/domicilio-tributario/DteClient.tsx:25; src/app/app-domain/tributacao/itbi/actions.ts:5
- **Reuso:** Novo controle individual; diagnóstico consolidado preservado.
- **Aceite esperado:** Executar cada oração/ação/filtro do texto integral; registrar persistência, documentos e resultado por subcritério.
