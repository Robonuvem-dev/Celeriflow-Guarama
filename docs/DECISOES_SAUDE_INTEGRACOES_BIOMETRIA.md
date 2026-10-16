# Decisões para o planejamento operacional da Saúde

Data: 12/10/2026.

Fonte normativa: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, páginas 222–255.

Este registro complementa o planejamento dos seis blocos de Saúde. As decisões abaixo foram confirmadas pelo usuário e definem os fluxos operacionais, os contratos de intercâmbio e a configuração de equipamentos na implantação. São diretrizes de implementação; a conclusão de cada entrega depende das evidências do fluxo correspondente.

## Diretriz de apresentação e funcionamento

O sistema deve executar integralmente os fluxos entregues, com persistência, regras de negócio, consultas, análises, documentos e histórico coerentes. Os dados cadastrados serão tratados como registros operacionais, independentemente de sua origem, e os indicadores serão calculados a partir desses registros.

Utilizar linguagem operacional na interface, nos relatórios, nos documentos e no plano geral. Não adicionar qualificadores de demonstração, simulação, teste ou caráter temporário aos nomes de funcionalidades, contratos ou resultados. Exemplos de termos: **Acompanhamento gestacional**, **Hipertensão e diabetes**, **Regulação**, **Remessa gerada**, **Processamento concluído**, **Registro validado**, **Biometria habilitada** e **Trocar profissional**.

Os estados devem corresponder às operações executadas e à sua origem: validação interna, processamento no receptor configurado, resposta de serviço externo e autenticação são eventos distintos. A apresentação operacional não altera o significado desses eventos nem a autoria dos registros.

## 1. SISPRENATAL, HIPERDIA e RIRA

### Decisão

Criar soluções próprias e profissionais que executem as ações exigidas, com modelos, versões, formatos e destinos bem estabelecidos. Os fluxos internos e o processamento nos receptores próprios devem funcionar de ponta a ponta. Implementar a comunicação com os serviços oficiais nas fases posteriores de integrações externas.

Requisitos relacionados:

- Assistência à Saúde 70: adequação das informações ao SISPRENATAL.
- Assistência à Saúde 71: adequação das informações ao HIPERDIA.
- Gestão do Faturamento 19: integração RIRA para requisições e listas de espera de consultas e procedimentos.

### Contratos de intercâmbio propostos

Os identificadores abaixo são propostas de implementação. São contratos próprios de intercâmbio municipal; sua correspondência com os formatos oficiais será definida nos adaptadores de integração.

| Contrato | Versão inicial | Formato próprio | Destino | Origem dos dados |
|---|---|---|---|---|
| `CELERIFLOW_SISPRENATAL` | `1.0.0` | JSON UTF-8 com esquema versionado; exportação CSV de conferência | Receptor de acompanhamento gestacional | Gestação, consultas, exames e desfechos registrados na Saúde |
| `CELERIFLOW_HIPERDIA` | `1.0.0` | JSON UTF-8 com esquema versionado; exportação CSV de conferência | Receptor de acompanhamento de hipertensão e diabetes | Condições de saúde, avaliações clínicas e acompanhamentos registrados na Saúde |
| `CELERIFLOW_RIRA` | `1.0.0` | JSON UTF-8 com esquema versionado; exportação CSV de conferência | Receptor de regulação | Requisições, decisões regulatórias e eventos da lista de espera |

Cada contrato deve definir:

1. Identificador e versão do esquema, configuração da conexão, tipo de operação e destino lógico.
2. Campos e tipos, obrigatoriedade, identificadores dos registros de origem e regras de validação correspondentes às ações do checklist.
3. Unidade e profissional de origem, datas e referência ao paciente, sem inventar informações clínicas ausentes.
4. Identificador da remessa e chave para impedir repetição do mesmo envio.
5. Retorno por registro, com resultado da validação e motivo de rejeição quando houver.
6. Histórico de geração, processamento, conteúdo e resultado acessível pela tela correspondente.

O destino deve ter identificação e contrato documentados. Sua localização técnica será definida na implementação, reutilizando a estrutura de integrações quando pertinente. A configuração da conexão e os metadados dos arquivos devem identificar o receptor e a versão do formato utilizado.

O processamento deve gerar um **protocolo de processamento**, associado ao receptor que o emitiu. Reutilizar os dados dos fluxos internos no caminho origem → remessa → processamento → resultado. Registrar aceite de serviço nacional somente quando recebido desse serviço.

### Integração com serviços oficiais

Nas últimas fases, confirmar com os serviços oficiais as versões vigentes, os formatos, os endereços, as credenciais e as operações disponíveis. Implementar adaptadores entre os dados internos e os contratos oficiais confirmados, preservando a rastreabilidade da origem. Vincular cada retorno à conexão e ao receptor responsáveis pelo processamento.

A decisão de utilizar contratos próprios é específica a estes três destinos. O planejamento dos demais requisitos de integração deve manter suas exigências e dependências próprias.

## 2. Biometria no atendimento multiprofissional

### Decisão

Preparar o fluxo para conexão ao leitor biométrico, a ser configurado durante a implantação.

Oferecer troca de profissional ou login e configuração de habilitação da biometria. A configuração pode ser habilitada antes da conexão do equipamento; captura e validação dependem do leitor conectado.

Requisito relacionado: Assistência à Saúde 9, página 237.

### Comportamento operacional

- Disponibilizar a opção **Habilitar biometria**.
- Exibir **Biometria habilitada** como estado da configuração. Manter o estado de conexão do equipamento nas configurações do dispositivo.
- Disponibilizar **Trocar profissional** e **Alterar login**, utilizando o mecanismo existente de autenticação e seleção de profissionais autorizados.
- Registrar o método de autenticação efetivamente utilizado em cada troca. A habilitação da configuração não gera evento de captura ou autenticação biométrica.
- Manter a autoria dos registros vinculada ao profissional e ao usuário efetivamente autorizados. A seleção visual de outro profissional não concede suas permissões nem equivale a autenticação.
- Permitir desabilitar a biometria e utilizar o fluxo de login existente.

### Preparação para implantação

Definir uma interface de integração para o leitor, separando a apresentação do fluxo dos eventos de conexão, captura e validação. Na implantação, configurar o equipamento e seu software de integração, associar a identidade verificada ao profissional autorizado e verificar a troca com o leitor conectado.

A indicação de habilitação representa a configuração do recurso. A identificação biométrica exige o resultado de captura e validação do equipamento.

## 3. Digitação por voz

A resposta do usuário definiu o tratamento da biometria. Não houve escolha de serviço ou definição adicional para reconhecimento de voz.

Manter Assistência à Saúde 34, páginas 239–240, no planejamento: digitação por voz nos campos de texto do atendimento multiprofissional. A decisão sobre o leitor biométrico não adia nem substitui esse requisito. A solução técnica de voz deve ser definida durante o detalhamento dessa entrega.

## 4. Ordem das entregas

1. Completar os cadastros e fluxos internos que fornecem os dados exigidos.
2. Implementar os contratos próprios SISPRENATAL, HIPERDIA e RIRA, seus receptores e o fluxo de troca de profissional/login com configuração de biometria.
3. Nas fases finais de integrações externas, implementar os contratos e destinos oficiais confirmados.
4. Na implantação, configurar e verificar o leitor biométrico.

O plano geral deve adotar esta diretriz de apresentação e descrever entregas operacionais completas, com origem dos dados, regras, persistência, documentos, resultados e critérios de conclusão. Identificar tecnicamente os contratos próprios e oficiais e suas dependências, mantendo a linguagem operacional em todo o fluxo.
