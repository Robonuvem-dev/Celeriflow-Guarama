# Plano de desenvolvimento — Ação Social (web)

> **Execução:** etapas internas implementadas e verificadas; encerramento externo depende das entradas listadas em [ENTREGA_ACAO_SOCIAL_POC.md](ENTREGA_ACAO_SOCIAL_POC.md). Esse documento registra os resultados, a matriz atualizada e os limites da homologação.

**Data:** 01/11/2026. **Escopo:** 35 requisitos da POC.
**Diagnóstico de origem:** [ANALISE_ACAO_SOCIAL_POC.md](ANALISE_ACAO_SOCIAL_POC.md).

## 1. Objetivo e ordem aprovada

Completar as operações internas, relatórios, padronização e população sintética para demonstrar os 35 requisitos em uma jornada coerente.

Conforme orientação do solicitante:

1. Desenvolver primeiro o que pode ser realizado com os recursos internos do projeto.
2. Concentrar integrações externas e tudo que depende de informações, arquivos, acessos ou decisões adicionais do solicitante na **última etapa**.
3. Concentrar criação de testes complementares e execução da bateria de testes no **final**, após a implementação. Antecipar apenas uma verificação estritamente necessária para seguir com segurança técnica.

A última etapa é dividida em preparação externa, conclusão das integrações e **validação final de todo o sistema alterado**. Assim, integrações e dependências do solicitante ficam no encerramento e os testes são executados depois delas.

Este documento é um plano; as etapas abaixo ainda precisam ser executadas. Os seis itens considerados funcionais no diagnóstico serão reaproveitados e incluídos na validação final.

## 2. Diretrizes de implementação

- Reutilizar Cadastros, Administração/RH, famílias canônicas, Frotas, GED, notificações, componentes operacionais e renderizadores de relatório existentes.
- Persistir via Drizzle e usar o fluxo de migração oficial do repositório, preservando dados e histórico. Não gerar sincronização automática de schema.
- Verificar todos os consumidores antes de alterar assinatura de função exportada e conservar o contrato de erro de cada Server Action.
- Aplicar o padrão oficial de tabelas durante a implementação de cada tela, evitando uma conversão geral posterior. A homologação visual fica no final.
- Separar pessoa, família, solicitante, usufrutuário, profissional do atendimento e usuário que registrou a operação.
- Diferenciar data do fato e data/hora de registro, mantendo autoria e histórico de alterações relevantes.
- Usar precisão monetária adequada nos novos cálculos e reconciliar os valores existentes afetados pelo escopo.
- Construir interfaces de integração e modos de demonstração locais antes dos conectores externos. Identificar explicitamente simulação, envio pendente, rejeição e confirmação externa.
- Registrar pendências externas ao encontrá-las e continuar as partes independentes. Usar parâmetros configuráveis e dados sintéticos no desenvolvimento interno; regras municipais e layouts ainda não fornecidos permanecem provisórios até a etapa final.
- Não tratar parâmetro provisório, arquivo sintético ou modelo demonstrativo como homologação oficial SUAS/CadÚnico/RMA.

## 3. Etapas de desenvolvimento interno

### Etapa 1 — Fundação dos dados e contratos internos

**Finalidade:** estabelecer as relações usadas pelos demais fluxos.

**Trabalhos:**

1. Definir a matriz de campos dos 35 requisitos e seus vínculos com estruturas existentes.
2. Preparar migrações incrementais para os campos ausentes, catálogos, históricos e estados operacionais.
3. Definir a reconciliação entre `SocialFamily`, `Family`, membros, responsável e endereço. Preservar as pessoas e relações já existentes.
4. Definir parentesco e identificadores, mantendo distinção entre código familiar municipal e identificador de origem governamental.
5. Definir vínculo profissional, escopo de acesso, registro profissional e uso do catálogo de cargos/funções existente.
6. Estabelecer contratos comuns de filtros: período, unidade, profissional, pessoa/família, programa, benefício e situação.
7. Preparar a estratégia de população idempotente, com identificação dos dados sintéticos e conciliação de registros anteriores.

**Entrega:** fundação implementada para suportar os cadastros e fluxos seguintes; lista de decisões externas registrada para a etapa 8.

### Etapa 2 — Cadastros completos e prontuário socioassistencial

**Requisitos principais:** 3, 4, 5, 6, 7, 8, 9, 11 e 16.

**Trabalhos:**

1. Completar unidade: CNPJ, razão social, inscrição estadual ou situação de isenção, tipo, número, responsável, telefone e endereço.
2. Completar profissional: pessoa física, contatos, endereço, documentos, função, registro profissional e vínculo vigente com unidade de acesso.
3. Completar beneficiário: CPF, nascimento, naturalidade, nacionalidade, raça/cor, estado civil, filiação, sexo, religião, contato, endereço, RG, NIS e certidão.
4. Disponibilizar composição familiar com os mesmos dados individuais e parentesco, integrando o cadastro central.
5. Implementar participação em programas: data de cadastro, inclusão, desligamento, valor e número do benefício, com histórico.
6. Incluir esfera federal/estadual/municipal no cadastro de benefício, sem confundi-la com a esfera do programa.
7. Conectar catálogos de renda/despesa e históricos ao prontuário, com totais e renda per capita calculados a partir da composição válida.
8. Organizar o prontuário em seções estruturadas de identificação, composição, condições socioeconômicas, atendimentos, acompanhamento e evolução. Complementos do modelo oficial fornecido no encerramento serão incorporados na etapa 8.
9. Disponibilizar cadastro e revisão dos catálogos locais necessários às operações.

**Entrega:** cadastros completos utilizáveis na POC e prontuário persistente integrado à família/pessoa.

### Etapa 3 — Ciclo completo de benefícios eventuais

**Requisitos principais:** 9, 11, 12, 13 e 14.

**Trabalhos:**

1. Completar a solicitação para família ou indivíduo, com unidade, profissional do atendimento, data, solicitante, usufrutuário, justificativa, itens, quantidades e modalidade de entrega.
2. Reaproveitar e completar deferimento, indeferimento e cancelamento, com dados da solicitação, parecer, autorizador e histórico.
3. Registrar entrega com data efetiva informada, responsável, recebedor e comprovante; permitir consulta por pessoa e família.
4. Manter autorização, saldo, estoque, movimentos e cotas consistentes, sem duplicar entrega ou baixa.
5. Tratar correções e eventuais estornos formalmente, preservando a trilha da operação.
6. Conectar o registro de despesas necessário à jornada Social ao financeiro existente, distinguindo solicitação, concessão, entrega e pagamento. Não representar o lançamento legado como liquidação/pagamento efetivos.
7. Atualizar o prontuário e as notificações internas a partir dos eventos persistidos.

**Entrega:** solicitação → análise → decisão → entrega → histórico/comprovante, para família e indivíduo.

### Etapa 4 — Encaminhamentos, acompanhamento, visitas, condicionalidades e formulários

**Requisitos principais:** 10, 16, 17, 18, 20, 21, 22, 23 e 32.

**Trabalhos:**

1. Completar encaminhamento: profissional de origem, unidades/órgãos de destino, tipo, data, situação, motivo, beneficiário e profissional de destino.
2. Reaproveitar referência/contrarreferência e destino CadÚnico como fluxo municipal, com histórico de retorno.
3. Implementar acompanhamento familiar/individual com início, profissional responsável, objetivos, ações, revisões, evolução e encerramento. Essa estrutura alimentará o relatório de famílias acompanhadas.
4. Conectar o botão de agendamento à operação persistente de visita, com data/hora, profissional, endereço e objetivo.
5. Implementar realização, reagendamento, cancelamento e conclusão da visita com data efetiva, relatório e anexos pertinentes.
6. Registrar condicionalidades e descumprimentos do Bolsa Família, incluindo tipo, data, efeito, suspensão e histórico. Permitir operação manual com dados sintéticos antes de eventual sincronização externa.
7. Implementar formulários versionados com texto curto/longo, checkbox, escolha única e múltipla, obrigatoriedade e respostas persistentes vinculadas ao contexto Social.
8. Preparar a parte interna do SMS: público por programa, telefones, calendário/prazos, modelos de mensagem, fila, histórico e contrato de retorno. O envio real será conectado na etapa 8.

**Entrega:** jornadas internas completas de encaminhamento e visita; acompanhamento e formulários persistidos; condicionalidades e comunicações preparadas para integração.

### Etapa 5 — SCFV completo

**Requisitos principais:** 24, 25, 26, 27 e 28; fornece dados para 1, 2 e 33.

**Trabalhos:**

1. Cadastrar serviço/grupo SCFV com profissional, unidade de cadastro/realização, nome, tipo, faixa etária, período, técnico de referência, orientador, facilitador, dias e horários.
2. Implementar matrícula individual com unidade, SCFV, data e beneficiário; preservar alterações e desligamentos.
3. Implementar planejamento e calendário de eventos/encontros.
4. Disponibilizar lista de presença vinculada às matrículas, distinguindo não registrado, presença e ausência.
5. Registrar execução, relatório, fotos e anexos, reaproveitando GED e armazenamento compartilhado.
6. Definir as consultas de matriculados e frequência com data de referência e filtros por período. As emissões serão finalizadas na etapa 7.

**Entrega:** SCFV → matrícula → encontro planejado → execução → presença → relatório/anexos.

### Etapa 6 — Frota da Assistência Social

**Requisitos principais:** 29, 30 e 31.

**Trabalhos:**

1. Completar ficha do veículo com RNTRC e anos de fabricação/modelo separados, mantendo placa, RENAVAM, combustível, licenciamento, cor, categoria, marca, modelo e descrição.
2. Completar motorista com data da primeira habilitação e integrar identidade, número, categorias e validade da CNH.
3. Vincular veículos e motoristas ao contexto da Secretaria/departamento, sem criar um cadastro paralelo de frota Social.
4. Reutilizar a agenda de reservas com veículo, data/hora, profissional/motorista e finalidade, preservando bloqueio de conflitos e reprogramação.
5. Disponibilizar o acesso da operação Social à rotina compartilhada com as permissões adequadas.
6. Adequar as listagens de motoristas, agenda e fichas complementares ao componente oficial.

**Entrega:** veículo e motorista completos e reserva utilizável na jornada da Secretaria.

### Etapa 7 — Dashboard, relatórios, importação interna e população da POC

**Requisitos principais:** 1, 2, 15, 19, 20, 27, 28, 33, 34 e 35; preparação transversal dos demais.

**Trabalhos:**

1. Implementar dashboard com período selecionável, atendimentos, eventos SCFV, encaminhamentos e benefícios, com acesso aos registros de origem.
2. Emitir relatório do dashboard usando os mesmos filtros e regras de contagem.
3. Entregar relatórios de profissionais/famílias/benefícios por período, encaminhamentos por período/unidade/tipo, famílias acompanhadas, matriculados SCFV, frequência e beneficiários por faixa etária.
4. Implementar a estrutura de agregação e emissão dos blocos CRAS/CREAS, parametrizada conforme as referências disponíveis. A correspondência definitiva ao modelo exigido pela Secretaria fica na etapa 8.
5. Preparar o importador CadÚnico: upload, lote, estágio de leitura, validação, prévia, conciliação, rejeições, aplicação transacional e reprocessamento sem duplicação. Usar contrato local versionado e arquivo sintético; o parser do arquivo federal efetivamente fornecido será concluído na etapa 8.
6. Concluir a padronização das listas de benefícios/programas e revisar as novas listagens, filtros e ações no padrão oficial.
7. Implementar e aplicar a população sintética idempotente no ambiente de POC identificado: famílias reconciliadas, pessoas completas, equipe vigente, produção em vários períodos, benefícios em diferentes situações, estoque, encaminhamentos, visitas, SCFV, motorista e reservas.
8. Criar roteiro de demonstração numerado de 1 a 35, com rota, perfil, dados de entrada e resultado esperado. Os cenários externos permanecem identificados como pendentes até o encerramento.

**Entrega:** funcionalidades internas e dados preparados para a última etapa. Não declarar conformidade oficial do importador ou prestação de contas enquanto faltar o layout definitivo.

## 4. Etapa 8 — Encerramento: dependências do solicitante, integrações externas e todos os testes

### 8.1 Consolidar em uma única rodada o que será necessário do solicitante

| Informação, decisão ou acesso | Aplicação |
|---|---|
| Identificação do ambiente que será usado na POC e confirmação da base conectada | Evitar preparar e homologar dados em ambiente diferente do apresentado. |
| Dados institucionais e relação final de unidades, profissionais, benefícios e programas | Ajustar identidade, catálogo e cenário de apresentação. Pode ser mantido cenário sintético se essa for a escolha. |
| Regras municipais de concessão, autorizadores, cotas e modalidades de entrega | Substituir parâmetros provisórios pelas regras aceitas pela Secretaria. |
| Modelo de prontuário, parentesco e documentos efetivamente exigidos | Revisar correspondência dos cadastros e seções SUAS. |
| Modelo de prestação de contas CRAS/CREAS e regras de contagem aceitas | Fechar os blocos e o relatório do item 33; distinguir prestação de contas de RMA quando forem entregas diferentes. |
| Arquivo CadÚnico de exemplo e seu dicionário/layout, com versão | Implementar o parser definitivo e validar os resultados esperados do item 35. Usar amostra sintética compatível ou arquivo autorizado para homologação. |
| Provedor de SMS escolhido, credenciais de homologação, remetente e telefones autorizados | Conectar envio e retorno de entrega do item 23. |
| Origem dos prazos e efeitos das condicionalidades | Parametrizar saúde, educação, recadastramento e suspensão conforme a referência adotada. |
| Se for exigida sincronização automática: documentação e acesso aos serviços governamentais ou de terceiros | Desenvolver o conector específico somente quando essa exigência e o canal estiverem definidos. |
| Acesso ao ambiente de aplicação e aos serviços compartilhados de autenticação/armazenamento, se ainda indisponíveis | Executar a homologação por navegador e anexos com os perfis reais de demonstração. |
| Definição de quem valida a POC e do conjunto final de evidências | Fechar aceite e roteiro de apresentação. |

Essas solicitações serão feitas no encerramento, reunidas em uma lista única. Caso alguma entrada não esteja disponível, concluir os demais cenários e registrar o requisito dependente como pendente, sem bloquear a verificação das partes independentes.

### 8.2 Concluir integrações e adequações dependentes dessas entradas

1. Conectar SMS ao provedor escolhido: autenticação, envio, tratamento de falha, tentativas controladas e retorno de entrega.
2. Concluir o parser do arquivo CadÚnico oficial informado, conciliando pessoas, famílias, membros e identificadores sem duplicar cadastros.
3. Adequar prontuário, prestação de contas, benefícios e condicionalidades às referências definitivas recebidas.
4. Conectar eventuais serviços externos explicitamente exigidos para consulta/sincronização. Não criar dependência de API ao vivo para operações que podem ser demonstradas por arquivo ou cadastro municipal.
5. Confirmar o armazenamento compartilhado de fotos/anexos e a autenticação no ambiente da apresentação.
6. Finalizar dados e roteiro dos cenários que dependiam de entradas externas.

### 8.3 Criar os testes complementares necessários e executar toda a validação

Executar após a implementação interna e as integrações disponíveis estarem concluídas:

- **Banco e migrações:** aplicação incremental, preservação dos dados, chaves, constraints, reconciliação e precisão monetária.
- **Cadastros e prontuário:** campos exigidos, composição familiar, histórico, documentos, programas, parentesco e renda per capita.
- **Acesso:** administrador, gestor, técnico de CRAS/CREAS, escopo por unidade, sigilo e profissional sem vínculo.
- **Benefícios:** família/indivíduo, solicitante/usufrutuário, deferimento/indeferimento/cancelamento, entrega com data efetiva, estoque, cota, concorrência, rollback e comprovantes.
- **Acompanhamento e visitas:** agenda, execução, reagendamento, cancelamento, evolução e histórico familiar.
- **Encaminhamentos:** origem/destino, tipo, profissional, retorno e relatórios filtrados.
- **SCFV:** cadastro, matrícula, eventos, presença, frequência, anexos e relatórios.
- **Formulários:** tipos de resposta, obrigatoriedade, versões e preservação das respostas anteriores.
- **Frotas:** ficha completa, CNH, reserva, sobreposição de horários, escopo e reprogramação.
- **Relatórios:** reconciliação dos totais com os registros de origem, período inclusivo, filtros, faixas etárias e emissão além da primeira página.
- **CadÚnico:** arquivo válido/inválido, layout/versão, duplicidade, divergência de composição, rejeições, repetição de lote e atomicidade.
- **SMS:** destinatários, calendário, falhas, tentativas, idempotência e recebimento/retorno real quando houver provedor habilitado.
- **Interface:** tabela com 20+1 registros, busca, filtros, última página, colunas, conteúdo integral, foco, zoom e resoluções previstas no padrão oficial.
- **Regressão:** rotinas compartilhadas afetadas em Cadastros, Administração/RH, Financeiro, Frotas, GED e autenticação.
- **Checks finais:** tipos, lint do escopo, verificações oficiais de migração pertinentes e `npm run build`; executar suítes adequadas ao alcance efetivo das alterações.
- **POC ponta a ponta:** percorrer os 35 itens por navegador, registrar evidências e classificar cada um como funcional ou pendente com motivo específico.

Corrigir falhas e reexecutar os cenários afetados e suas dependências. Repetir a bateria completa quando o alcance da correção justificar. Depois de qualquer mudança final de aplicação, atualizar os checks e confirmar o build correspondente.

### 8.4 Entrega final

Entregar matriz atualizada dos 35 requisitos, evidências, resultado dos testes, roteiro de demonstração, população preparada e pendências externas eventualmente remanescentes. A publicação depende de solicitação específica; a conclusão técnica exige build aprovado.

## 5. Exceção à regra de testes somente no final

Não rodar baterias por etapa nem interromper cada cadastro para testes isolados rotineiros. Inspeção dos consumidores e revisão do código continuam fazendo parte da implementação.

Antecipar uma verificação mínima somente se houver, por exemplo:

- Migração ou reconciliação que possa perder dados ou impedir todas as etapas seguintes.
- Incerteza sobre transação/constraint fundamental que torne inviável continuar um fluxo dependente.
- Mudança de contrato compartilhado que impeça compilar ou executar o próximo módulo.

Nesses casos, registrar a razão, executar apenas a verificação direcionada e continuar. A verificação antecipada não substitui a bateria final. Build completo e testes amplos permanecem no encerramento; se houver solicitação de commit antes disso, o build obrigatório do projeto deverá ser respeitado.

## 6. Cobertura dos 35 requisitos e dependências

| Requisitos | Etapa principal | Complemento/fechamento |
|---|---|---|
| 1, 2 | 7 — dashboard e emissão | Dados do SCFV/benefícios/encaminhamentos; testes na 8. |
| 3, 4, 5, 6, 7, 8 | 2 — cadastros | Fundação na 1; referências definitivas e validação na 8. |
| 9 | 2/3 — despesas e benefício | Integração financeira interna e validação na 8. |
| 10 | 4 — encaminhamento CadÚnico | Preparação de catálogo e validação na 8. |
| 11, 12, 13, 14 | 3 — benefícios | Cadastros da 2 e regras definitivas/validação na 8. |
| 15 | 7 — relatório periódico | Dados das etapas anteriores e validação na 8. |
| 16 | 2/4 — prontuário e acompanhamento | Correspondência oficial e validação na 8. |
| 17 | 4 — condicionalidades | Referências definitivas e eventual fonte externa na 8. |
| 18 | 4 — encaminhamento completo | Relatório na 7 e validação na 8. |
| 19, 20 | 7 — relatórios | Fluxos estruturados na 4 e validação na 8. |
| 21, 22 | 4 — visitas | População na 7 e validação na 8. |
| 23 | 4 — preparação interna | Provedor, envio e testes na 8. |
| 24, 25, 26 | 5 — SCFV | Dados na 7 e validação na 8. |
| 27, 28 | 5/7 — consultas e emissões SCFV | Validação na 8. |
| 29, 30, 31 | 6 — Frotas | População na 7 e validação na 8. |
| 32 | 4 — formulários | População na 7 e validação na 8. |
| 33 | 7 — estrutura da prestação de contas | Layout definitivo e validação na 8. |
| 34 | 7 — relatório etário | Base de beneficiários da 2 e validação na 8. |
| 35 | 7 — estrutura interna de importação | Arquivo/dicionário oficial, parser definitivo e testes na 8. |

**Sequência de execução:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → **8.1 entradas do solicitante → 8.2 integrações/conclusões → 8.3 todos os testes → 8.4 entrega**.
