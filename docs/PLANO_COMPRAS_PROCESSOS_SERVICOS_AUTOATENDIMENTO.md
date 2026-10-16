# Plano integrado — Compras, Processos, Serviços Públicos e Autoatendimento

Data: 12/10/2026. Objetivo: completar os quatro blocos do checklist e preparar solicitação e acompanhamento de serviços pelo portal institucional.

## 1. Escopo e referência normativa

Fonte: `docs/Termo de Referencia/Checklist real POC MÓDULOS EXECUTIVO e CAMARA.pdf`, seção dos módulos do Executivo. A numeração abaixo é a do arquivo PDF, não a paginação dos documentos municipais.

| Bloco | Prefixo | Páginas | Itens |
|---|---|---|---:|
| Gestão de Compras e Licitações | CL | 44–58 | 124 |
| Protocolo e Processo Digital | PD | 131–139 | 83 |
| Gestão de Serviços Públicos | SP | 139–141 | 30 |
| Portal de Autoatendimento | PA | 151–163 | 119 |
| **Total** | | | **356** |

**Matriz de execução:** [MATRIZ_COMPRAS_PROCESSOS_SERVICOS_AUTOATENDIMENTO.md](MATRIZ_COMPRAS_PROCESSOS_SERVICOS_AUTOATENDIMENTO.md). Plano e matriz devem ser utilizados juntos.

Módulos centrais analisados: **Compras e Contratos**, **Processos e Protocolos**, **Atendimento ao Cidadão — Ouvidoria e Chamados**; portal institucional, autenticação e referências aos serviços executores. Obras/Serviços Urbanos foi consultado porque contém execução operacional de manutenção, equipes, materiais e equipamentos. Os demais módulos entram como provedores dos serviços explicitamente exigidos pelo Autoatendimento.

A análise é estática, baseada em telas, actions, serviços, políticas e schema. Não comprova execução no banco, funcionamento em ambiente publicado ou conformidade de integração externa. A matriz identifica bases encontradas e o trabalho necessário sem atribuir percentual de atendimento já alcançado.

### Diretrizes

- Linguagem operacional nas telas, funcionalidades, documentos e estados. Dados cadastrados alimentam os fluxos e indicadores normalmente.
- Reutilizar os módulos existentes; a solicitação do cidadão não se torna solicitação interna de compra automaticamente.
- Preparar agora identidade, catálogo, contratos de operação, abertura, acompanhamento, documentos e ações externas. O trabalho seguinte no portal deve consumir essas bases e rotas, sem recriar regras de negócio.
- Publicação de informações institucionais, acompanhamento pessoal e acesso de fornecedor têm autorizações distintas.
- Manter capacidades existentes e analisar módulos conexos somente nos pontos que interagem com estes requisitos.
- Novos conectores externos ficam nas últimas fases; preparar seus campos/vínculos antes.
- Identificadores antigos do código, como `CLC-038`, não equivalem automaticamente ao checklist real. Usar CL/PD/SP/PA como rastreabilidade deste plano.

## 2. Inventário de evidências

Todos os modelos desta tabela existem em `prisma/schema.prisma`. B01–B12 são referências utilizadas nas linhas da matriz. As rotas internas têm arquivos em `src/app/app-domain/`; os caminhos exibidos ao usuário dependem das regras de roteamento da instalação.

| Base | Telas/arquivos principais | Serviços/políticas | Modelos e evidência encontrada |
|---|---|---|---|
| B01 — catálogo/solicitações | `compras/catalogo`, `compras/solicitacoes`, respectivas `actions.ts` | `purchase-request-policy.ts`, `purchase-request-budget.ts`, `procurement-lifecycle.ts` | `CatalogItem`, `Material`, `PurchaseRequest`, itens e dotações. Catálogo tem descrição/unidade/categoria; action não expõe todos os atributos exigidos. Aprovação registra aprovador e não permite aprovação pelo solicitante. |
| B02 — planejamento/origens/preços | `compras/planejamento`, `compras/processos`, `compras/pesquisas-precos`, `pesquisas-precos/portal/[key]` | `purchase-planning.ts`, `purchase-process-origins.ts`, `price-research.ts` | `PurchasePlanning`, `PurchaseProcess`, itens/origens, ETP/TR, `PriceResearch`, `PriceQuote`. Há agregação rastreável de solicitações. Pesquisa usa valor global e média aritmética; não fecha cotação detalhada por item/métodos máximo/mínimo. |
| B03 — licitação | `compras/licitacoes/[id]`, `actions.ts`, portal de participações | `bidding-workflow.ts`, `bidding-number-integrity.ts` | `Bidding`, fases, atos, comissões/designações, participantes, lotes/itens, lances, habilitação e resultados. Há transições e envio de lances por identidade do fornecedor. Criptografia de proposta comercial e sessão presencial completa não foram comprovadas. |
| B04 — contratos/execução | `compras/contratos`, `instrument-actions.ts`, `compras/recebimentos`, `compras/convenios` | `contract-lifecycle.ts`, `procurement-finance-bridge.ts`, `procurement-lifecycle.ts` | `Contract`, aditivos, `InstrumentResponsibilityGroup`, partes, medições/itens/parcelas, recebimentos, autorizações financeiras e `ProcurementLifecycleEvent`. Ponte financeira usa origens/chaves e valores decimais; contrato simples não equivale a ata de registro de preços. |
| B05 — identidade de fornecedor/publicação/exportação | `compras/licitacoes/portal`, `compras/exportacoes`; `portal/licitacoes-e-contratos` | `SupplierPortalIdentity`; `src/lib/integrations/procurement-exports.ts`, `procurement-export-contract.ts`; `src/lib/transparencia/portal-public.ts` | Identidade usuário-fornecedor ativa, pacotes/execuções e consulta de licitações/contratos publicáveis. Pacote TCE está associado a `TCE_PB_SAGRES`, não SIM-AM. Retorno pode ser registrado por operador; isso não comprova despacho/aceite automático. |
| B06 — processo/fluxo | `protocolos/processos`, `protocolos/acompanhamento`, `busca`, `arquivados`, `actions.ts`; `processos/page.tsx` | `src/lib/protocols/service.ts`, `movement-policy.ts`, `generic-workflow-runtime.ts`, definição/política de workflow | `ProcessType`, `Subject`, `Process`, movimentos, despachos, eventos, sequência anual e workflow versionado. `/processos` redireciona a `/protocolos`. Abertura compartilhada exige servidor interno e permite apenas um interessado pessoa/empresa. |
| B07 — documentos/assinaturas/notificações | `protocolos/assinaturas`, `notificacoes`, relatórios; APIs `protocolos/upload`, `deadline-notifications` | `protocols/notifications.ts`; GED, assinaturas, relatórios da plataforma | `ProcessDocument`, `Document`, versões/assinaturas, `ProtocolNotification`. Há notificações internas por setor; não são envio de e-mail/push ao cidadão. Documentos assinados podem ser exigidos por etapa do workflow. |
| B08 — atendimento/ouvidoria | `atendimento/chamados`, `ouvidoria`, `fila`, `central`, `configuracoes`, `actions.ts`; rotas equivalentes de Ouvidoria em Protocolos | `src/lib/attendance/access.ts`, `ombudsman-disclosure-policy.ts` | `SupportChannel`, `ServiceSubject`, `Ticket`, interações/movimentos/documentos/auditoria, `Ombudsman`, identidade separada/acessos/retorno. Actions atuais são internas; chamado e manifestação podem gerar `Process` uma vez. |
| B09 — portal/conta/catálogo | `portal/servicos`, `entrar`, `minha-area`, `ouvidoria`, `acesso-informacao`, `contato`; `portal-protocolos` | `PortalLoginCard.tsx`, `src/lib/platform/session.ts`, API `auth/session`, `portal-institucional/public-content.ts` | Login e-mail/Google com conta local autorizada; sessão não contém `Person`/representação empresarial. `PublicService` existe no schema, mas consumo não foi localizado em `src`. Catálogo do portal é lista fixa. Área pessoal ainda não lista serviços/pedidos. |
| B10 — execução de serviço público | `obras/servicos-urbanos`, `ordens-servico`, `maquinas-equipes`, `relatorios`, `obras/actions.ts` | Alocação de servidor/equipe/equipamento, baixa material, vínculos de compras/GED | `ObrasServico`, equipes/membros, servidor/equipe/equipamento/material/documento/compra. Há custo previsto, agenda simples e consumo; não há ponte encontrada a `Ticket`/`Process` nem programação múltipla completa. |
| B11 — provedores setoriais | `portal/construcao-civil` e `src/lib/obras/construction-external-opening.ts`; `app-domain/portal-servidor`; `portal/tributario`; módulos de Saúde/Patrimônio/Vigilância | Autorização/formulário/documentos de abertura urbanística; `portal-servidor/access.ts`; serviços setoriais existentes | Construção Civil já tem abertura externa e anexos ligados ao processo, com contrato próprio. Portal do Servidor resolve `Employee` pela sessão. As operações adicionais PA precisam de adapters específicos e verificação com cada provedor. |
| B12 — base institucional/cadastro | Cadastro único, instituição/departamentos, portal, documentos e financeiro/tributário relacionados | Contexto da instituição, `Person`/`Company`, representantes, autenticação da plataforma | Reutilizar cidadão, empresa, servidor, fornecedor, setores, assinatura, guia/pagamento, patrimônio e transparência; não criar bases paralelas por portal. |

## 3. Achados prioritários

1. **Portal de protocolos não é acompanhamento pessoal.** `portal-protocolos/page.tsx` consulta somente `PublicNotice` com `sourceModule=PROCESSOS`. Não consulta tramitação nem documentos do interessado.
2. **Acompanhamento interno já existe.** `protocolos/acompanhamento/page.tsx` possui filtros, prazos e situação, usando `protocolScope`. Reutilizar apresentação e conceitos, criando consulta própria do titular; não expor a consulta interna ao cidadão.
3. **Ouvidoria/e-SIC/Contato não formam entrada digital.** As páginas públicas encaminham entre contato/ouvidoria/e-SIC; `contato` mostra telefone/e-mail, sem formulário de abertura. Entregar abertura e número de acompanhamento efetivos.
4. **Identidade externa deve preceder “Meus pedidos”.** `SessionPrincipal` tem UID/e-mail/nome, mas não pessoa, empresa representada ou autorização sobre uma solicitação. Vincular explicitamente a identidade aos cadastros comuns.
5. **Abertura atual exige servidor.** `createValidatedProcess` usa `OperationalEmployee`, `allowsInternalOpening` e eventos com servidor. Não atribuir a solicitação externa a um servidor fictício; evoluir contrato de ator verificando todos os consumidores, ou extrair núcleo compatível preservando a assinatura interna.
6. **Catálogos têm papéis diferentes.** `PublicService` é descritivo; `ServiceSubject` distribui chamados; `Subject` distribui processos; `CatalogItem` define aquisição. Relacionar esses registros por serviço, sem fundi-los em uma tabela genérica de texto.
7. **Pedido, chamado e processo precisam de vínculo estável.** Ticket e Ombudsman têm ligação 1:1 com processo, mas não há envelope geral de solicitação externa. Evitar gerar três demandas independentes a cada clique ou copiar anexos.
8. **Serviços Públicos tem executor em Obras.** `ObrasServico` já vincula equipe/equipamento/material/GED/compras. Complementar a ocorrência do cidadão e sua programação; não refazer essas capacidades em Atendimento.
9. **Compra não é processo administrativo.** `PurchaseProcess` é entidade de Compras; não possui relação direta encontrada com `Process`. CL-049/050 exigem criação/vínculo do protocolo e anexos compartilhados.
10. **Multientidade não se resolve agrupando solicitações.** O agrupador de Compras exige mesma secretaria (`procurement-lifecycle.ts:202`). Modelar participantes e contratos/ordens por entidade sem retirar indiscriminadamente a regra existente.
11. **PCA não é apenas necessidade futura.** `PurchasePlanning` registra item/quantidade/período/valor, mas não plano anual completo, intenção compartilhada, adesões e quantitativo por secretaria.
12. **Fornecedor externo tem acesso específico, porém pelo contexto atual.** Portal de lances verifica `SupplierPortalIdentity`; torná-lo alcançável pela entrada institucional com retorno de login e identidade preservados, sem dar permissões gerais de Compras ao fornecedor.
13. **Lance não equivale a proposta sigilosa.** `submitBiddingBid` grava valores em `BiddingBid`; uma chave HMAC de convite de pesquisa valida acesso, não criptografa conteúdo da proposta comercial. Separar essas operações.
14. **Contrato/aditivo não comprova todos os controles legais.** Tipos atuais de aditivo são Prazo/Valor/Ambos/Suspensão/Rescisão. Completar categorias, base de cálculo de acréscimo/supressão, reajuste/equilíbrio/apostila e limites do checklist.
15. **TCE correto e origem do retorno.** Adaptar SIM-AM/TCE-PR e PNCP; pacotes próprios e retorno manual atual não fecham integração automática. Não alterar conectores de outras instituições em massa.
16. **PA abrange mais que os dois módulos.** Folha, tributos, concursos, assinatura, Vigilância, Saúde e outros serviços precisam de provedor autorizado. Preparar contratos agora e vincular às entregas existentes, sem contar link informativo como operação concluída.

## 4. Fluxo integrado do cidadão

```text
Portal institucional → Catálogo / Carta de Serviços
  → Identificação ou modalidade anônima permitida
  → Formulário do serviço + documentos + aceite quando exigido
  → Solicitação gravada + comprovante + número de acompanhamento
  → Distribuição ao órgão / chamado / processo / provedor setorial
  → Recebimento → análise → programação ou pedido de complementação
  → Resposta / execução / documento → conclusão
  → Meus pedidos + detalhes + mensagens + anexos + avaliação
```

O titular vê um pedido estável desde a abertura, mesmo se internamente ele evoluir de chamado a processo ou ordem de serviço. Números internos permanecem ligados e consultáveis conforme autorização; a numeração externa não deve ser trocada a cada etapa.

### Destino por natureza

| Natureza | Registro operacional | Comportamento |
|---|---|---|
| Solicitação administrativa | `Process` | Assunto/roteiro, setor, prazo, documentos e complementos externos |
| Demanda de atendimento/manutenção | `Ticket`, ligado a execução quando necessário | Triagem/distribuição; criação automática de processo se configurada; `ObrasServico` para execução urbana |
| Manifestação | `Ombudsman` | Modalidade anônima/identificada/confidencial, equipe de Ouvidoria, resposta e acompanhamento |
| Acesso à informação | `InformationRequest` ou perfil específico de processo vinculado | Definir fonte de verdade antes de implementar; pedido, resposta, prazo e acompanhamento; não usar apenas contato por e-mail |
| Serviço setorial | Entidade do provedor e vínculo a pedido | Ex.: alvará/licença/guia/RH. Mostrar resultado pelo envelope externo, sem duplicar o processo do provedor |
| Serviço informativo | `PublicService` e conteúdo | Requisitos/etapas/prazos/custo/acesso; sem abrir demanda quando não existe solicitação |
| Serviço de terceiro | Adapter de acesso por token | Destino permitido e contexto de identidade, conforme PA-004; sem encaminhar credencial de login municipal |

### Estados e efeitos propostos

**Recebido → Em análise → Aguardando complementação → Em execução/Programado → Respondido → Concluído**, além de cancelamento e reabertura quando previstos no serviço. O catálogo determina quais estados e ações são aplicáveis. Guardar mapeamento explícito para os estados existentes em Ticket/Process/Ombudsman/Obras; não exigir a substituição global dos vocabulários atuais.

- Completar informação grava evento e documento, devolve ao setor/etapa e mantém prazos conforme a regra do serviço.
- Programação de manutenção informa data, equipe e situação ao cidadão sem publicar dados internos dos servidores.
- Resposta externa distingue mensagem enviada ao cidadão de nota interna.
- Conclusão do provedor atualiza a visão do pedido; conclusão de chamado não deve encerrar processo ativo silenciosamente.
- Avaliação guarda serviço/pedido e os três quesitos do checklist, além de descrição; relatório público utiliza resultados agregados autorizados.

## 5. Base a preparar para os portais

As estruturas abaixo são **propostas a criar/adaptar**; não são modelos comprovados no schema atual.

| Estrutura | Campos/regras essenciais | Reaproveitamento |
|---|---|---|
| Identidade externa | UID/usuário, pessoa, estado de acesso, revisão cadastral; empresas/representações com vigência e permissões | Autenticação existente, `Person`, `Company`, representantes, identidade de fornecedor/servidor |
| Pedido de acesso | Dados declarados, vínculo à pessoa/empresa, análise/deferimento/indeferimento, autoria/data | Cadastro comum; não autorizar perfil administrativo ao aprovar cidadão |
| Serviço digital | Código/slug imutável, público-alvo, requisitos/etapas/prazos/custo, login/modalidade, assunto/setor/provedor/rota, visibilidade/destaque | Estender `PublicService`; ligar `ServiceSubject`/`Subject` e catálogo institucional |
| Versão de formulário/aceite | Campos e documentos obrigatórios/opcionais, regras e versão do termo aceita na abertura | Formulários/GED/termos da plataforma e experiência urbanística, sem copiar schemas setoriais para todo serviço |
| Solicitação externa | Número/ano, serviço+versão, titular/representante ou modalidade anônima, canal, vínculos de destino, estado, prazo e origem | Referências aos registros internos; núcleo não duplica descrição/arquivo quando a origem é compartilhável |
| Eventos/mensagens/documentos | Data/hora, ator externo/interno, visibilidade, documento+versão, estado de leitura | Eventos e GED existentes; acesso ao arquivo passa pelo mesmo escopo do pedido |
| Ocorrência/programação | Origem/tipo, endereço/coordenadas, responsável, várias ocorrências por programação, equipe/equipamento, reagendamento/motivo, custos previstos/realizados | `Ticket` e `ObrasServico` como entrada/execução, estoque/compras/GED existentes |
| Consulta de acompanhamento | Projeção externa por titular/representação ou número+código; links de documentos e ações permitidas | `ProcessEvent`, movimentos, retorno dos provedores; sem listagem administrativa pública |
| Catálogo de providers | Operações disponíveis, requisitos de identidade, schemas, rotas/retorno, fonte de verdade e disponibilidade | Módulos setoriais existentes, sem criar cópias de RH/tributação/Saúde |
| Preferências e apresentação | Favoritos, boxes, destaques, avisos, texto de serviço, grupos, acessibilidade, pesquisas | Portal institucional e administração existentes |

### Rotas operacionais propostas

Todas abaixo são **a implementar ou consolidar**; a lista fixa links para que o portal seguinte não precise conhecer IDs internos.

| Finalidade | Rota proposta |
|---|---|
| Catálogo/Carta de Serviços | `/portal/servicos` e `/portal/servicos/[slug]` |
| Solicitar serviço | `/portal/servicos/[slug]/solicitar` |
| Pedidos do titular | `/portal/minha-area/solicitacoes` |
| Detalhe/acompanhamento | `/portal/minha-area/solicitacoes/[numero]` |
| Consulta por número e código | `/portal/acompanhar` |
| Manifestação | `/portal/ouvidoria/nova` |
| Pedido de informação | `/portal/acesso-informacao/solicitar` |
| Área do fornecedor | `/portal/fornecedor` com ligações às participações/cotações/contratos próprios |
| Conta/acesso/revisão cadastral | `/portal/entrar`, `/portal/cadastrar`, `/portal/minha-area/cadastro` |

Manter rotas existentes de Construção Civil e demais provedores quando já operacionais; cadastrar seu destino no serviço e fornecer retorno para acompanhamento. As rotas propostas precisam ser compatibilizadas com rewrites/proxy da instalação antes da implementação.

### Contratos da base externa

- **Catálogo:** código/slug, título, público-alvo, exige login, condições, endpoint operacional e situação de disponibilidade.
- **Abertura:** serviço/versão, valores do formulário, documentos pertencentes ao requerente, aceite/versionamento e chave de repetição. Titular/representação vêm da sessão, não de um ID livre enviado pelo navegador.
- **Resultado:** número de acompanhamento, data/hora, situação, prazo e link do detalhe; o cidadão pode salvar/emitir comprovante.
- **Listagem:** somente pedidos autorizados, filtros por número/serviço/período/situação, paginação e ações pendentes.
- **Detalhe:** linha do tempo externa, setor institucional atual, prazo, respostas, documentos liberados e ações permitidas.
- **Complementação:** versão da pendência, mensagem/anexo, autoria externa e novo estado; envio não cria pedido duplicado.
- **Providers:** leitura/abertura/ação/emissão/validação por módulo com autorização própria; o portal não executa actions internas usando um servidor genérico.

Consulta sem login com CPF/CNPJ, quando prevista no checklist, deve comprovar a titularidade ou exigir código/credencial de acompanhamento antes de revelar dados pessoais. Busca pública de informação publicada e validação de documento têm projeções próprias. Sigilo/anônimo continuam respeitados mesmo com sessão ativa, conforme os fluxos existentes de Ouvidoria.

## 6. Provedores do Autoatendimento

| Grupo de itens PA | Provedor / base | Preparação e entrega necessária |
|---|---|---|
| 001–010, 030, 072 | Identidade/cadastro e Protocolos/Atendimento | Solicitação de acesso, revisão cadastral, abertura/consulta, token de terceiros e credenciais |
| 011–022 | Compras/Contratos/Convênios e Financeiro | CRC, propostas/readequação/cotações, publicação configurável, MIS/prestação de contas e dados do fornecedor |
| 023–066 | RH/Portal do Servidor/SST | Relatórios pessoais, férias/ponto/licenças/cursos/concursos/avaliação, descontos conveniados e atestados; preparar adapters sem abrir permissão RH ao servidor |
| 067–081 | Tributação/Cadastro/Construção Civil | Guias, extratos, informações, doações, alterações, certidões, notas, poderes do contador/tabelionato, ITBI/alvará/habite-se |
| 082 | Reserva de espaços | Serviço específico com processo e disponibilidade/cancelamento conforme regra do executor |
| 083–084 | Administração/cadastro/documentos | Solicitação de direitos do titular e relatório de tratamentos com origem/controlador |
| 085–089 | Legislação/publicação/Protocolos/GED/assinaturas | Busca de atos, Diário Oficial, acompanhamento e comunicações digitais, assinatura solicitada |
| 090–092 | Atendimento/Obras e guichês | Manutenção/cronograma, agendamento presencial e guichês |
| 093–109 | Catálogo institucional | Recados/boxes/destaques/favoritos/busca/acessibilidade/CAPTCHA/carta/avaliação e resultados |
| 110–119 | Vigilância/Tributação/GED/Protocolos | Alvarás/licenças/carteira de saúde/denúncia/acompanhamento/documento assinado/notificações de receita/responsabilidade técnica |

A interface de ligação não encerra o item PA: cada operação precisa retornar dados ou executar a ação no módulo responsável. Os providers setoriais não foram integralmente auditados neste estudo; a matriz os marca como dependência e a fase F09 exige verificar o consumidor específico antes de declarar entrega concluída.

## 7. Fases de desenvolvimento

### F01 — Identidade, catálogo de serviços e contratos compartilhados

Base B09/B12; pré-requisito das ações externas.

1. Definir identidade do cidadão, empresa representada, fornecedor e servidor, sem duplicar cadastros; solicitação/liberação de acesso, recuperação/alteração de senha e revisão cadastral.
2. Ativar consumo de `PublicService`, ligar assuntos/setores/provedores, grupos/destaques e acesso informativo ou operacional. Substituir lista fixa por catálogo configurável quando a base estiver disponível.
3. Publicar versões de formulário, documentos e aceite; preparar o contrato de abertura/acompanhamento e o contexto institucional por host/tenant.
4. Definir as rotas operacionais e retorno após login; o link solicitado deve ser preservado ao autenticar.

**Conclusão:** cidadão autorizado reconhecido como titular; serviço tem destino e contrato; catálogo revela requisitos corretos e não depende de regra codificada em cada botão.

### F02 — Processo digital e documentos completos

Depende de F01 nos contratos externos; reutiliza B06/B07.

1. Completar responsáveis, finalidade, anonimato permitido/contatos, interessados adicionais, cadastro obrigatório, subassuntos, termos/documentos e informações adicionais.
2. Ampliar fluxos com retorno ao requerente, atividades externas, pareceres, paralisação, apensamento e sincronização dos movimentos conforme o vínculo.
3. Recebimento/tramitação/encerramento/arquivo/reabertura em lote com resultado por item, controle de gestores/setores e sigilo por envolvidos.
4. Documentos GED persistentes, formatos exigidos, modelos/editoração, pacote de anexos, visualização agrupada e impressão cronológica do processo/movimentos, etiquetas e comprovantes.
5. Taxas do assunto/guia, reimpressão e bloqueios/cancelamento parametrizados, usando o provedor tributário/financeiro existente.

**Conclusão:** fluxo interno completo e fonte de verdade documental preparados para ações externas, preservando numeração, autoria, permissões e histórico.

### F03 — Abertura externa e acompanhamento do cidadão

Depende de F01/F02; reutiliza B08/B09/B11.

1. Implementar os contratos de abertura externa para processo, chamado, Ouvidoria e e-SIC, com geração de número/comprovante e distribuição configurada.
2. Persistir vínculo do pedido ao destino interno; geração de processo a partir do chamado/manifestação mantém o mesmo acompanhamento externo.
3. Entregar **Meus pedidos** e detalhe com filtros, prazo, linha do tempo, pendências, respostas, mensagens/anexos externos e documentos liberados.
4. Consulta por número/código e identificação autorizada; anexos e dados seguem as mesmas regras de titularidade do detalhe.
5. Compartilhar conta e sessão de acesso com o portal institucional; separar ator cidadão de servidor na gravação e auditoria.

**Conclusão:** solicitar → receber número → acompanhar → complementar → receber resposta/documento funciona antes de montar os botões definitivos do portal.

### F04 — Ocorrências e execução de Serviços Públicos

Depende de F02/F03; reutiliza B08/B10/B12.

1. Configurar origem/tipo, campos/documentos, abertura automática de processo e local georreferenciado; endereço por mapa e bloqueio municipal configurável.
2. Ligar ocorrência ao solicitante/Ticket e à execução `ObrasServico`; manter histórico e consulta do usuário.
3. Programação e reprogramação com motivo, tipo vistoria/execução/fiscalização, responsáveis, equipe/equipamento, várias ocorrências por programação e agenda do executor.
4. Materiais e mão de obra previstos/realizados com custo calculado, consumo de estoque e vínculo a compras quando necessário.
5. Ordem de serviço, relatório de ocorrência/serviços executados e cronograma consultável pelo cidadão.

**Conclusão:** ocorrência do portal chega ao órgão, é programada/executada, gera documentos/custos e atualiza acompanhamento sem criar ordem desconectada.

### F05 — Catálogo de aquisição, fornecedores e PCA

Pode avançar após contratos compartilhados F01; bases B01/B02/B05/B12.

1. Materiais: grupo/classe/subclasse, múltiplas unidades, classificações/categorias, campos configuráveis, CATMAT, marcas/imagens, elementos de despesa, histórico e rol de itens.
2. Solicitação de novo produto com aprovação/notificação ao setor e retorno do código/motivo.
3. Fornecedor: CRC sequencial/validação, documentos/validade, impedimentos, sócios/responsável, índices contábeis e capacidade técnica.
4. PCA anual/intenção/adesões/quantitativo por secretaria, compartilhamento e importação de rol; reutilizar necessidade futura sem reservá-la como compra automaticamente.
5. Solicitação/requisição de compra por centro de custo, autorização, estados e reserva no momento parametrizado; integrar ao processo digital F02.

**Conclusão:** catálogo/fornecedor e planejamento alimentam aquisição com origem e cobertura orçamentária, sem duplicidade de itens ou bases.

### F06 — Pesquisa, certame e modalidades

Depende de F05/F02; bases B02/B03.

1. Cotação por item, média/máximo/mínimo, fornecedor e unidade; geração de processo/ordem pelo critério selecionado.
2. Processo com numeração/modalidade/fundamento legal e escolha posterior da modalidade; duplicação controlada com novas origens.
3. Workflow com ajuda, cores/etapas e decisões; documentos da preparação à conclusão, anexos/minuta, pareceres, recursos/impugnação/julgamento.
4. Pregão presencial por item/lote com rodadas, lance mínimo, cronômetro, desistência/declínio/negociação, remanescente por inabilitação e regras LC 123/2006.
5. Publicidade por Lei 12.232/2010, técnica/preço por pontuação, credenciamento/chamamento e cotas.
6. Resultados parciais/totais, estados exigidos e multientidade com entidade principal/participantes e contratos/ordens por entidade.
7. Compartilhar anexos do certame e processo administrativo por vínculo GED; não anexar cópia independente.

**Conclusão:** aquisição percorre decisões/documentos exigidos e mantém vencedores/quantidades/preços/origem para contratos e ordens.

### F07 — Contratos, atas, ordens e recebimento

Depende de F06; bases B04/B12.

1. Registro de preços com ata/vigência/fiscais/gestores/saldos de item, preço e fornecedor; publicação e alerta de vencimento.
2. Contrato/aditivo/reajuste/equilíbrio/apostila/rescisão, alteração unilateral/bilateral, limites com base legal e distinção de atualização monetária.
3. Ordem ordinária/global/estimativa, parcelas/subempenhos, finalidade/entrega/condições/retenção/desconto/consumo imediato; impedir alteração depois do empenho e compra por ata vencida.
4. Integração de reserva/liberação/empenho/estorno e recebimento por item/quantidade/valor, usando ponte financeira/estoque existentes.
5. Concessão de imóveis ligada aos bens; convênios/parcerias Lei 13.019, MIS e prestação de contas ligadas à origem.
6. Gerar atas/contratos de vários vencedores em um lote de operação; planilha com item/lote/quantidade/unidade/preço/total/marca/modelo e exportação Word.

**Conclusão:** saldo contratado/ordenado/recebido e reserva financeira reconciliam; documentos e histórico representam os atos efetivos.

### F08 — Área operacional do fornecedor e publicação municipal

Depende de F01/F05/F06/F07; bases B05/B09/B12.

1. Acesso às próprias cotações/propostas/participações/contratos/aditivos/retenções/saldos/empenhos, pela identidade autorizada.
2. Proposta comercial sigilosa criptografada e abertura por senha/ato autorizado; preservar fases e separar de lance aberto.
3. Readequação do vencedor por subitem do lote com reconciliação ao valor vencedor; sem importação/redigitação desnecessária.
4. Consultas públicas com dados/documentos selecionáveis, agenda de licitações e validação de CRC; parcerias publicadas em consulta própria.
5. MIS e prestação de contas de organizações da sociedade civil pela área correspondente, mantendo fonte de verdade do convênio.

**Conclusão:** fornecedor executa operações próprias e cidadão consulta publicações/agenda a partir das rotas institucionais; visibilidade pública é configurada por dado/documento.

### F09 — Provedores de autoatendimento e fechamento funcional dos portais

Depende de F01–F04/F08 e das entregas dos módulos provedores.

1. Implementar/verificar adapters dos grupos PA da seção 6, com sessão, representação, schemas, ações, consulta de resultado e rota estável.
2. Entregar serviços pessoais RH/servidor, contribuinte/contador/empresa, Vigilância, assinaturas, espaços públicos, leis/Diário e comunicações; reutilizar provedores operacionais existentes.
3. Guichês e agendamento presencial, senha/horário/vaga; manutenção e cronograma já utilizam F04.
4. Carta de Serviços e avaliação: satisfação, qualidade, prazo/compromisso e descrição; resultados por serviço.
5. Boxes/avisos/recados com ou sem login, favoritos/destaques, pesquisa, dados institucionais/acessibilidade e CAPTCHA nos serviços sem login.
6. Portais seguem identidade comum e links do catálogo; frontend definitivo consome contratos e rotas preparados, sem executar regras paralelas.

**Conclusão:** cada item PA retorna dado/resultado do provedor. Link para página de contato não substitui emissão, solicitação ou acompanhamento.

### F10 — Relatórios, indicadores e comunicação operacional

Depende das origens das fases anteriores; bases B07/B08/B10/B12.

1. Relatórios de licitação da abertura à conclusão, relação mensal de compras/TCU, fornecedor/vencimentos e extratos de ordem/contrato.
2. Relatórios processuais/etiquetas/gráficos com filtros e autoria; indicadores PD-075–083 com quantidade/percentual, comparativos anuais/mensais, pendência/conclusão e atrasos por setor/usuário.
3. Relatórios de e-SIC e Serviços Públicos; painel de acompanhamento da entrega dos serviços do portal.
4. Notificações ao cidadão/requerente e aos setores, preferências por serviço/assunto, fila de envio e resultado; e-mail/push utilizam a infraestrutura de comunicação configurada, sem confundir lembrete interno com entrega externa.
5. Pacotes documentais, comprovantes/relatórios nos formatos exigidos e assinantes configurados.

**Conclusão:** filtros/indicadores refletem os registros operacionais; mensagens e documentos têm origem/autoria e resultado de entrega consultável.

### F11 — Integrações externas e leiautes oficiais

Depende de F06/F07/F08/F10.

1. TCE-PR/SIM-AM para licitações/contratos com versões/leiautes atualizados e competência; manter conectores de outras instituições conforme seus contextos.
2. PNCP: processo/resultado/contrato, arquivo/transmissão/publicação/consulta na própria tela, retorno e reenvio idempotente.
3. Plataformas eletrônicas privadas por adapter configurável: participantes/lances/documentos/atas, vencedores/fornecedor/itens/preços; exportação/importação vinculada à origem.
4. Terceiros por token, comunicação e publicação oficial necessárias aos serviços; nenhum retorno externo deve ser atribuído a uma operação apenas gerada internamente.

**Conclusão:** executar a operação no destino configurado, consultar protocolo/retorno e reconciliar resultados com o processo/contrato/serviço de origem.

## 8. Dependências e ordem recomendada

```text
F01 Identidade/catálogo/contratos
 ├─ F02 Processo/documentos → F03 Solicitação/acompanhamento → F04 Serviços Públicos
 └─ F05 Aquisição/fornecedores/PCA → F06 Certame → F07 Contrato/ordem → F08 Fornecedor/publicação
F03 + F04 + F08 + providers setoriais → F09 Autoatendimento/portais
Origens operacionais → F10 Relatórios/comunicação → F11 Integrações externas
```

Documentos e notificações essenciais de cada fluxo são entregues na sua fase; F10 consolida os formatos/canais/indicadores, não adia a existência do comprovante de abertura ou da resposta do cidadão. A UI final do portal pode ser construída em seguida a F03/F04/F08 usando as rotas operacionais, enquanto providers adicionais são fechados por serviço.

Os dados de convênios, cobertura por entidade, identidade externa, documentos e campos de integração precisam ser preparados antes dos consumidores. O layout institucional não é dependência para persistir e consultar uma solicitação por seu titular.

## 9. Referências municipais

Fontes em `docs/Novos docs/Novos docs/`, IDs de `docs/CATALOGO_NOVOS_DOCUMENTOS_IBEMA.md`.

| Referência | Uso | Limites |
|---|---|---|
| 026 — `Decreto Nº 2082-2023 GOVERNO DIGITAL.pdf` | Art. 5º: solicitação/acompanhamento, desempenho e portal único; art. 6º: carta/avaliação/notificação/assinatura; art. 9º: protocolo. Apoia F01–F04/F09/F10. | Documento de 2023; manter referência/versionamento e verificar alterações na configuração institucional. Não amplia a matriz com serviços não exigidos. |
| 024 — `Dados Prefeitura- Fale Conosco 2026 atualizado.pdf` | Órgãos, contatos e horários do catálogo/distribuição e apresentação institucional. | Contato institucional não comprova serviço digital de abertura/acompanhamento. |
| 030 — `Decreto Nº2840-2026.pdf` | Comissão intersetorial do PCA; contexto do planejamento por secretaria. | Designação da comissão não representa PCA aprovado. |
| 015/016 — `Compras - Agosto.pdf`, `Compras - Julho.pdf` | Campos de compras por competência/secretaria/credor/item/preço/quantidade; relatórios de F07/F10. | Não classificar todos os itens como materiais de estoque; há serviços/diárias. |
| 017/018 — `Compras com Documentos Fiscais - Agosto.pdf`, `Compras com Documentos Fiscais - Julho.pdf` | Rastreabilidade de item/documento fiscal/recebimento. | Não duplicar os itens de 015/016 nem somar total repetido por documento. |
| 021 — `cONTRATOS EMITIDOS AT´PE AGOSTO.pdf` | Consulta por número/data/contratado/modalidade/licitação/valor/objeto. | Relação não substitui contrato/aditivos integrais. |
| 023 — `Dados Essenciais Termos de Colaboração 2022-2026.pdf` | Ano/termo/fiscal/entidade/objeto/situação e íntegra das parcerias. | Valor zero pode ter obrigações; não eliminar instrumento por ausência de valor financeiro. |
| 012 — `CARTEIRA DE SERVIÇOS.pdf` | Exemplo setorial para requisitos/horários/unidades no catálogo geral. | Oferta declarada não constitui solicitação/produção já realizada. |

O Decreto 2082/2023 foi aberto e conferido neste estudo; as demais fontes são referências localizadas no catálogo municipal e deverão ser conferidas integralmente ao configurar cada entrega.

## 10. Critérios de conclusão e continuidade

Cada linha da matriz deve ganhar evidência de tela/ação, serviço, modelo, documento/resultado e origem. Um item com provedor setorial ou integração externa só termina após sua operação correspondente funcionar; estrutura de contrato ou link não basta.

Para preparar os portais, o entregável mínimo é: catálogo configurável + identidade do titular + abertura efetiva + número/comprovante + listagem/detalhe + pendência/complementação/resposta + vínculo ao executor + rotas estáveis. O próximo trabalho visual do portal utiliza essa base.

Na implementação, verificar todos os consumidores antes de mudar assinaturas exportadas; preservar retorno de erro de actions chamadas por client e `void` das usadas diretamente em formulário. Conferir guias do Next.js em `node_modules/next/dist/docs/` antes das alterações e executar build antes de commit/push conforme regras do projeto.

Não houve alterações de aplicação ou banco neste estudo. A matriz conserva todos os 356 requisitos, inclusive os dependentes de serviços fora dos dois módulos centrais, evitando que a preparação institucional deixe lacunas ocultas.
