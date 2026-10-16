# Portal do Servidor — análise e plano de implantação conforme checklist

Data: 12/10/2026.

## Decisões e andamento da implantação

- **Acesso somente ativo:** servidor inativo/desligado não terá acesso documental histórico pelo Portal. Solicitações de informações e documentos serão atendidas pelo RH, inclusive termo de rescisão. Ativo com outros vínculos pode consultar documentos próprios autorizados de contrato encerrado.
- **Sem restrição por jornada:** servidor ativo pode acessar durante férias, afastamentos e fora do horário de trabalho. A condição funcional é `Employee.isActive`; permanecem a autenticação e as autorizações de conta/módulo existentes.
- **Identificação:** acesso por e-mail institucional previamente cadastrado na conta vinculada ao servidor. O cadastro da conta e o vínculo continuam sendo administrados internamente; o domínio do e-mail, por si só, não autoriza nem provisiona um titular.
- **LDAP adiado expressamente:** o responsável informou que o diretório ainda será providenciado. Nesta etapa, a tela funcional oferece e-mail/senha; integração LDAP e seus parâmetros serão tratados quando o diretório estiver disponível.
- **Escopo dos serviços confirmado:** implantar os serviços de funcionários/servidores dos checklists de Autoatendimento e App, compartilhando as fontes e operações RH/Folha/SST/Processos. O cruzamento explícito APP-023–036 está na seção 4.1.
- **Contato no login:** em recusa de acesso, exibir orientação para `rh@emailprefeitura.com`, com link de e-mail.
- **Regras das operações:** acesso e escopo estão confirmados. Para prazos/fluxos de férias, habilitação e ajuste de ponto, liberação de folha, capacitação e comissões, reutilizar as configurações dos módulos de origem; o checklist exige parametrização, mas não define os valores municipais. Parâmetros ausentes precisam de definição operacional. LDAP será providenciado posteriormente, conforme decisão específica.
- **Apresentação:** utilizar os componentes ERP profissionais existentes, com navegação funcional própria, filtros, tabelas compactas, paginação e tratamento de estados.
- **F01 em implementação:** login funcional separado visualmente do administrativo, API específica que exige módulo autorizado e servidor ativo, retorno local após login, recuperação/alteração de senha, logout funcional, tratamento de acesso indisponível e atalhos das funcionalidades existentes. O layout revalida o cadastro ativo mesmo para sessão emitida antes da inativação e encaminha ao login com orientação RH. A política funcional FP-096 está definida; processamento de convites FP-103 continua pendente.
- **F02–F08:** desenvolvimento concluído e verificado localmente, incluindo complementos/comprovantes, modelos e documentos de origem, conciliação de pagamentos e ponto, campanhas assistidas e PPP com fonte técnica e assinatura obrigatória. **34 testes e build completo aprovados.** A matriz abaixo preserva o levantamento inicial; a cobertura atual, as telas e os parâmetros/fontes municipais exigidos estão no [fechamento final F02–F08](PORTAL_SERVIDOR_FECHAMENTO_F02_F08.md). Homologação operacional em produção é distinta da validação local. **F09** permanece posterior.
- **Planejamento detalhado:** [backlog de execução F02–F09](PORTAL_SERVIDOR_BACKLOG_EXECUCAO.md), com arquitetura do catálogo/processos, migração aditiva, tarefas, dependências, telas ERP e critérios de conclusão. Detalhamento documental não altera o estado de implementação das fases.

### Validação dos ajustes F01 — 12/10/2026

- `node --env-file=.env.local --conditions=react-server --import tsx --test tests/employee-portal-routes.test.ts tests/employee-portal-login.test.ts tests/portal-proxy.test.ts`: **11 testes aprovados**. Cobrem política de login funcional, recusa de cadastro inativo/sem vínculo, retorno local permitido, rotas públicas, encaminhamento funcional e sobrescrita do cabeçalho de rota enviado pelo navegador.
- ESLint direcionado aos arquivos F01, incluindo os últimos ajustes em `ModuleShell`, `EmployeePortalShell` e `PasswordChangeForm`: **sem erros**.
- `npm run build`: **concluído com sucesso**, incluindo geração Prisma, tipos de rotas, verificação TypeScript, compilação Next.js, geração das 59 páginas estáticas e otimização final.
- O menu funcional retorna ao portal institucional. A alteração de senha confere a resposta do encerramento da sessão local antes de encaminhar ao login.
- Esses resultados validam os ajustes de código; login Firebase real, isolamento com duas contas reais e publicação no domínio continuam sem comprovação operacional nesta etapa. F01 permanece parcial.
- Após as definições de e-mail institucional, acesso sem restrição de jornada e adiamento LDAP: os **11 testes foram executados novamente e aprovados**, ESLint dos quatro arquivos ajustados sem erros e **novo build completo aprovado**. A tela funcional oferece apenas o método atual de e-mail/senha; a revalidação de status no layout usa a mesma política do endpoint de sessão.

### Definições necessárias para concluir F01 e iniciar F02

1. **Provisionamento:** convite automático após cadastro do contrato ou liberação pelo RH; perfil funcional a atribuir; origem do e-mail e tratamento de conta já existente.
2. **Política FP-096 confirmada:** acesso para ativos independentemente de férias, afastamentos e horário; inativos/desligados recusados. Não aguarda nova decisão.
3. **Catálogo RH confirmado:** serviços previstos nos dois checklists, conforme seções 4 e 4.1. Setor/UG responsável, tipo/assunto/roteiro processual, prazos e documentos devem vir das configurações dos módulos administrativos de origem.
4. **Fontes das fases seguintes:** estatuto e normas de férias/ponto; regras de publicação da folha por tipo/regime; instrumentos de avaliação/capacitação; bancos/convenentes e especificações de integrações. Não estabelecer parâmetros numéricos ou direitos sem essas definições.

## 1. Objetivo e conclusão

Implantar a jornada **portal institucional público → login do servidor → painel de consultas pessoais e serviços → protocolo interno → análise pelo responsável → execução em RH/Folha/SST → acompanhamento e conclusão**.

**Conclusão:** existe uma base funcional integrada ao banco municipal e a RH/Folha/SST, com consultas filtradas pelo servidor autenticado, demonstrativos pessoais em PDF e algumas solicitações efetivas. O Portal ainda não fecha todos os requisitos: faltam diversas emissões pessoais, ajuste/registro de ponto, serviços de cursos/avaliações e a ligação das solicitações comuns ao processo digital. O painel e o menu também não oferecem acesso direto a todas as funcionalidades já existentes.

A identidade é obtida da sessão e do vínculo `Usuario.employeeId`, e não de um servidor escolhido pelo navegador. Nos caminhos examinados, foram localizados filtros de titularidade nas consultas, downloads e ações pessoais. Isso é uma base correta, mas não constitui comprovação integral de isolamento em produção: ainda é necessário validar com contas reais distintas, inclusive sessão expirada, usuário sem vínculo, servidor inativo e tentativas de acesso direto a registros alheios.

Este documento reúne o inventário inicial, o planejamento e o andamento da implantação. As seções de inventário descrevem a base anterior aos ajustes F01; a seção “Decisões e andamento” registra as alterações e validações posteriores. Reaproveitar as rotinas existentes e completar os serviços do checklist sem recriar RH/Folha/SST ou duplicar a revisão geral desses módulos.

## 2. Fontes e interpretação do escopo

Fonte principal: [Checklist dos módulos Executivo e Câmara](Termo%20de%20Referencia/Checklist%20real%20POC%20M%C3%93DULOS%20EXECUTIVO%20e%20CAMARA.pdf). As páginas abaixo são as páginas físicas do PDF.

| Bloco | Referências aplicáveis |
|---|---|
| Portal de Autoatendimento | **PA-023 a PA-065**, 43 itens, p. 154–158: serviços funcionais e serviços relacionados de outros atores |
| Serviços transversais do Autoatendimento | PA-003/007/008/009/010, p. 152; PA-080, p. 159; PA-087/089/093, p. 160; PA-094–104, p. 161 |
| Gestão de Folha de Pagamento — Executivo | FP-001/003–005/011/019/023/026/027/030–032/037/078/080/083/084/096/103/108–110, p. 70–85, como dependências dos serviços pessoais |
| Segurança e Medicina do Trabalho | SST-012/013/020/047/055/065–068, p. 87–95: agendamento, CIPA, CAT, PPP e planos de saúde |
| Protocolo e Processo Digital | PD-001/006/009–015/021/025–030/047/048/056–058/064/065/068, p. 131–137: abertura, finalidade interna, roteiro, documentos e acompanhamento |
| Aplicativo Mobile | APP-003/005–007, p. 142; APP-023–036, p. 145–146: identidade e consumo futuro dos mesmos serviços; aplicativo não foi auditado integralmente neste estudo |
| Folha — Legislativo | Mesmos itens funcionais de dependência, p. 324–339; considerar entidade e vínculos da Câmara sem tratar funcionários da Prefeitura como titulares desses registros |

Os prefixos PA/FP/SST/PD/APP servem para rastrear a numeração original de cada bloco. As linhas PA-035/036/037/040 têm atores diferentes do servidor em autosserviço. Devem ser atendidas em superfícies próprias, conforme a matriz, sem conceder acesso coletivo ao servidor comum.

**Dados pessoais permanecem exclusivos do titular.** Eleições da CIPA e relatório de aniversariantes possuem informação coletiva exigida pelo checklist: limitar a projeção aos dados indispensáveis ao serviço. Nomes de candidatos de uma eleição autorizada não dão acesso à ficha, salário, prontuário ou outros dados particulares dos candidatos. Aniversariantes não devem expor CPF, endereço, ano de nascimento, idade ou dados funcionais privados.

## 3. Inventário técnico da base existente

Nos caminhos de páginas abaixo, `PS` significa `src/app/app-domain/portal-servidor`.

| Base | Evidência no código | Situação atual |
|---|---|---|
| B01 — entrada e login | `src/proxy.ts:35–54`; `PS/entrar/page.tsx`; `src/components/auth/PortalLoginCard.tsx`; `src/app/api/auth/session/route.ts` | Entrada `/portal/portaldoservidor` redireciona a `/portal-servidor`; sem cookie vai ao login próprio. Login por e-mail/senha Firebase e troca por sessão local. Microsoft/LDAP aparecem desabilitados. |
| B02 — identidade e acesso | `src/lib/portal-servidor/access.ts:29–50`; `src/lib/platform/session.ts:17–32`; `tenant-context.ts:195–326,341–359` | Verifica sessão, usuário/perfil ativo, acesso ao módulo e `Employee.isActive`; identidade funcional vem do banco. |
| B03 — painel e apresentação | `PS/page.tsx:31–108`; `PS/navigation.ts`; `PS/layout.tsx`; `src/app/app-domain/ClientLayout.tsx` | Painel pessoal e menu de consultas. Layout ainda compartilha cabeçalho administrativo. Menu não reúne demonstrativos completos, pedidos RH, recadastramento, banco de horas, licença-prêmio, margem e consignações. |
| B04 — cadastro e consultas básicas | `PS/ficha-funcional/page.tsx:47–83`; `ferias/page.tsx:185–222`; `ponto/page.tsx:75–108`; `beneficios/page.tsx:58–98`; `documentos/page.tsx:76–114` | Ficha resumida/atos, férias e afastamentos, ponto, benefícios e solicitações de assinatura. São consultas pessoais; não representam todas as emissões e operações previstas. |
| B05 — folha e PDFs | `PS/folha/page.tsx:92–150`; `demonstrativos/page.tsx:10–28`; `src/app/api/portal-servidor/demonstrativos/[id]/route.ts`; `src/lib/rh/statement-service.ts:23–46` | Consulta legada por `PayrollItem` e demonstrativos por contrato em `HrPayrollStatement`; PDF completo com conferência de proprietário, data de liberação, revogação e fechamento. |
| B06 — consignações e direitos | `PS/margem/page.tsx`; `consignacoes/page.tsx`; `credito/page.tsx`; `banco-horas/page.tsx`; `licenca-premio/page.tsx`; `src/lib/rh/service-right-query.ts` | Margem histórica, contratos/parcelas, pedido de crédito, banco de horas e licença-prêmio. Emissão bancária de margem e relatórios pessoais completos ainda precisam ser completados. |
| B07 — pedidos ao RH | `PS/solicitacoes-rh/{page.tsx,RequestForm.tsx,actions.ts}`; `src/lib/rh/portal-requests.ts`; `src/app/app-domain/rh/solicitacoes/page.tsx`; `rh/operacoes/actions.ts` | Grava/lista `HrPortalRequest` e permite decisão administrativa. Assuntos fixos: correção cadastral, férias, documento e benefício. Sem criação de `Process` no fluxo comum examinado. |
| B08 — recadastramento | `PS/recadastramento/{page.tsx,actions.ts,ProposalForm.tsx}`; `src/lib/rh/recertification.ts` | Campanha por público/período, proposta, conferência de valores anteriores e atualização transacional de `Person` após deferimento. Campos limitados. |
| B09 — crédito e providência funcional | `src/lib/rh/credit-requests.ts:13–74`; `src/lib/rh/consignment-service.ts` | Valida contrato próprio, referência publicada e consignatária/política; deferimento reserva parcelas transacionalmente. Reserva não representa liberação bancária. |
| B10 — SST no Portal | `PS/sst/{cat,cipa,planos,relatorios}`; `src/lib/sst/{accident-service,prevention-service,benefit-query,closure-service,closure-document}.ts` | Comunicação de CAT, candidatura/voto CIPA, planos e despesas do titular/dependentes, histórico PPP com PDF protegido. Agendamento pelo próprio servidor não localizado no Portal. |
| B11 — processo digital reutilizável | `src/lib/protocols/service.ts:22–110`; `src/lib/protocols/access.ts`; `notifications.ts`; `generic-workflow-*`; modelos `ProcessType`, `Subject`, `Process` | Abertura validada, sequência anual, roteiro, distribuição, notificações e auditoria. Requer adapter de autosserviço funcional e acesso por titular ao acompanhamento. |
| B12 — configuração/relatórios RH | `src/lib/rh/payroll-configuration.ts:542–579`; `workforce-service.ts:129,613–621`; `report-service.ts` | Habilitação geral de demonstrativos, liberação futura e registro de convite. Relatórios administrativos não têm automaticamente o escopo pessoal necessário para serem expostos ao Portal. |

### 3.1 Login primeiro, serviços depois

A separação básica existe, mas precisa de acabamento funcional:

1. Botão público do portal institucional não exige login administrativo.
2. Sem sessão, a entrada funcional leva a `/portal-servidor/entrar`.
3. O login usa a identidade central e a mesma API de sessão; a superfície visual é própria, a infraestrutura de identidade é compartilhada.
4. `proxy.ts` verifica **presença** de cookie; validade e autorização são verificadas posteriormente no servidor. Cookie expirado/adulterado não deve resultar em tela de erro técnico: a página deve retornar ao login, e APIs/actions devem tratar a falta de sessão de forma apropriada.
5. O login atual tem destino fixo `/portal-servidor`; o parâmetro `returnTo` produzido pelo Proxy não é consumido pela tela de login. Completar retorno somente para rotas funcionais locais permitidas.
6. `PS/layout.tsx` evita o menu funcional no login, mas `ClientLayout.tsx` exclui do cabeçalho administrativo somente `/login` e `/`. Criar apresentação funcional independente, com retorno ao portal institucional e saída para o login funcional.
7. O painel deve listar explicitamente **Consultas**, **Solicitar serviços**, **Meus protocolos** e **Avisos do RH**, de acordo com os serviços efetivamente habilitados.

## 4. Matriz dos 43 requisitos funcionais relacionados

Legenda: **I** = caminho efetivo localizado, sujeito à validação operacional; **P** = parcial; **N** = serviço não localizado no Portal examinado. A situação se refere à entrega pelo Portal, não à inexistência de tabelas ou rotinas administrativas no sistema. Fases estão descritas na seção 8.

| Requisito / página PDF | Consulta ou serviço | Situação e base | Melhoria necessária / fase |
|---|---|---|---|
| PA-023 / 154 | Emissão pessoal da folha com layout definido pela entidade | P · B05/B12 | PDF existe; completar layout configurável, recibo e política única de disponibilização. F03 |
| PA-024 / 154 | Relatório dos aquisitivos e saldos de férias | P · B04 | Tela lê `Vacation`, sem relatório integral de direitos/perdas/prorrogações/pecúnia. Integrar aquisitivos RH e emissão. F04 |
| PA-025 / 154 | Ficha financeira por período | P · B05 | Lançamentos e PDFs por competência não equivalem à ficha financeira do intervalo. Emissão integral e totais por vínculo/período. F03 |
| PA-026 / 154 | Espelho de ponto por período e totalizadores configuráveis | P · B04 | Consulta mensal existe; completar intervalo, totalizadores e emissão integral. F04 |
| PA-027 / 154 | Comprovante anual de IRRF | N · B12 | Existe base administrativa de relatórios/IRRF; criar serviço anual do titular, com pagamentos e deduções conciliados. F03 |
| PA-028 / 154 | Relatório de tempo de serviço com layout definido | N · B06/B12 | Reutilizar histórico/averbações RH, apurar períodos e emitir documento pessoal. F05 |
| PA-029 / 154 | Declaração do período de trabalho no magistério | N · B12 | Classificar períodos de efetivo exercício no magistério e emitir declaração do titular. F05 |
| PA-030 / 154–155 | Solicitar atualização de dados pessoais/dependentes/endereço | P · B07/B08 | Pedido livre e campanha limitada existem; formulário estruturado, comprovação e aplicação controlada de todos os dados previstos. F06 |
| PA-031 / 155 | Relatório de empréstimos bancários | P · B06 | Consulta de consignações/parcelas existe; completar relatório integral e distinguir reservas, descontos e pagamentos. F05 |
| PA-032 / 155 | Solicitações ao RH por assuntos definidos pelo RH | P · B07/B11 | Quatro assuntos fixos e pedido persistido; catálogo configurável, documentos, protocolo interno e execução vinculada. F02/F06 |
| PA-033 / 155 | Solicitar abono, justificativa ou correção de registro de ponto | N · B04/B07 | Criar serviço específico, análise, protocolo e alteração auditável do ponto após decisão. F04/F06 |
| PA-034 / 155 | Autenticidade do recibo por chave, aberta a qualquer pessoa/entidade | N · B05 | PDF usa identificador, mas não foi localizado serviço público específico de validação do recibo. Emitir chave e resposta mínima sem abrir download pessoal. F03 |
| PA-035 / 155 | Lançamentos de descontos por convenente/departamento | N · B09/B12 | Serviço de outro ator. Criar acesso conveniado/departamental específico, contratos autorizados e integração às rubricas, sem acesso coletivo pelo servidor comum. F08/F09 |
| PA-036 / 155 | Publicar editais de concurso/processo seletivo | N · B12 | Serviço público/administrativo relacionado ao RH; publicar editais reais, requisitos e calendário. F08 |
| PA-037 / 155 | Inscrição de candidato em concurso/processo seletivo | N · B12 | Candidato pode não ser servidor. Superfície própria integrada ao RH, com inscrição e comprovante; não exigir `Employee` para candidato. F08 |
| PA-038 / 155 | Autoavaliação e avaliação de desempenho pela comissão | N · B12 | Ciclos, instrumento, autoavaliação própria, designações e resultado; comissão com acesso explícito apenas às avaliações atribuídas. F07 |
| PA-039 / 155 | Autoavaliação e avaliação do estágio probatório | N · B12 | Reutilizar cadastro/contrato, configurar etapas e comissão, registrar avaliação e resultado. F07 |
| PA-040 / 156 | Lançar atestados dos funcionários pelo departamento | P · B10 | Rotina SST administrativa existe, mas superfície departamental do Autoatendimento não foi localizada. Acesso específico por UG/setor e regras SST, separado do autosserviço pessoal. F08 |
| PA-041 / 156 | Relatório anual de contribuições previdenciárias | N · B12 | Bases administrativas existem; criar relatório anual restrito ao titular, por vínculo/previdência. F03 |
| PA-042 / 156 | Emissão da margem com seleção de banco conveniado | P · B06/B09 | Margem histórica/pedido de crédito existem; completar documento por banco, validade e bloqueio de nova emissão conforme FP-084. F05 |
| PA-043 / 156 | Solicitação específica de férias, análise e programação a partir do pedido | P · B07 | Texto livre não contém contrato/aquisitivo/datas; deferimento genérico não programa férias. Vincular decisão à programação transacional RH. F06 |
| PA-044 / 156 | Emissão de relatório de períodos de licença-prêmio | P · B06 | Consulta do livro de direitos existe; emissão pessoal integral por aquisitivo, incluindo perdas/gozos/saldo. F05 |
| PA-045 / 156 | Emissão do termo de rescisão | N · B12 | Criar emissão vinculada ao cálculo/contrato rescindido para titular ainda ativo; inativo/desligado obtém pelo RH conforme decisão. Registrar essa limitação no aceite. F05 |
| PA-046 / 156 | Emissão da ficha de registro de funcionário | P · B04 | Ficha atual é resumo de `Employee`/atos. Completar dados canônicos, contratos e documento integral próprio. F05 |
| PA-047 / 156 | Registro de ponto pelo Portal para funcionários autorizados | N · B04 | Página atual é somente consulta; habilitação individual/regras, horário de servidor e registro próprio auditado. F04 |
| PA-048 / 156 | Emissão do relatório de aniversariantes | N · B12 | Projeção coletiva mínima e configurada conforme regra de privacidade da seção 2; não utilizar consulta administrativa completa. F07 |
| PA-049 / 156 | Emissão de certificados de cursos/treinamentos | N · B12 | Integrar participação/presença/conclusão e emissão do certificado do próprio participante. F07 |
| PA-050 / 156 | Inscrição em cursos/treinamentos da entidade | N · B07/B12 | Catálogo, elegibilidade, vagas, inscrição e comprovante; protocolo quando houver análise administrativa. F07 |
| PA-051 / 157 | Relatório de afastamentos e faltas | P · B04 | Afastamentos e ponto separados; completar causas/períodos/faltas e emissão consolidada pessoal. F04 |
| PA-052 / 157 | Relatório de horas de compensação e banco | P · B06 | Créditos/débitos/saldo existem; completar intervalo, compensações, vínculo e relatório integral. F04 |
| PA-053 / 157 | Declaração de vínculo empregatício | N · B04/B12 | Emitir declaração baseada no contrato e sua vigência, sem confundir ficha resumida com declaração. F05 |
| PA-054 / 157 | Consulta de licenças-prêmio gozadas | P · B06 | Livro mostra operações/reservas; completar consulta direta dos gozos efetivos e distinguir reserva de utilização. F05 |
| PA-055 / 157 | Inscrição em eleição CIPA | I · B10 | Serviço efetivo com eleitorado próprio, janela de inscrição e impedimento da comissão; verificar configuração municipal. F07 |
| PA-056 / 157 | Votação CIPA | I · B10 | Voto efetivo, janela, elegibilidade, candidato da eleição, participação única e cédula sem identidade do eleitor. Preservar esses controles. F07 |
| PA-057 / 157 | Consulta de atos legais do servidor | P · B04 | Número/tipo/data dos próprios atos existem; completar texto/documentos e consulta contextual ao vínculo. F05 |
| PA-058 / 157 | Emissão do PPP | P · B10 | Histórico por titular/UG/período e PDF existem; serviço declara conteúdo histórico incompleto, sem assinatura. Completar documento exigido sem presumir lacuna como ausência de risco. F08/F09 |
| PA-059 / 157 | CAT pelo próprio funcionário | I · B10 | Formulário/action gravam `SstCat`, com titular imposto no servidor. Conferir tratamento, comprovante e retorno operacional; comunicação não é homologação nem envio eSocial. F08 |
| PA-060 / 157 | Relatório de salários de contribuição de outras previdências | N · B12 | Emissão própria por regime/vínculo/período, com bases e contribuições de origem. F03 |
| PA-061 / 157 | Emissão do recibo de férias | P · B05 | PDF de folha especial pode servir de base; falta entrada própria e recibo com gozo/aquisitivo/cálculo/versão correspondente. F03/F06 |
| PA-062 / 157 | Relatório de mensalidades e despesas dos planos | P · B10 | Consulta pessoal de titular/dependentes e lançamentos existe; completar emissão integral por período. F08 |
| PA-063 / 157 | Relatório histórico do adicional de tempo de serviço | N · B06/B12 | Há apuração/livro de direitos RH; falta emissão pessoal dos períodos/percentuais/averbações e reflexos. F05 |
| PA-064 / 158 | Agendamento em Segurança e Medicina do Trabalho | N · B10 | Agenda SST administrativa existe; habilitar escolha de vaga própria, regras, confirmação e comprovante no Portal. F08 |
| PA-065 / 158 | Participar de campanha de recadastramento gerenciada pelo RH | P · B08 | Campanhas/propostas/decisões existem. Ampliar campos FP-110, documentos, correções e comunicação de pendências/conclusão. F06 |

### 4.1 Cruzamento dos serviços do App com Autoatendimento

Conferência direta no PDF: APP-023–029, p. 145; APP-030–036, p. 146. O mesmo serviço deve manter titularidade, fonte de dados e política de publicação nos dois canais. As correspondências abaixo definem escopo de implantação e não certificam a entrega do App.

| App | Serviço exigido | Autoatendimento relacionado | Fase / entrega compartilhada |
|---|---|---|---|
| APP-023 | Consulta dos protocolos em nome do usuário, histórico e andamento | PA-007/087 e PA-032 para os pedidos RH | F02 · acompanhamento dos processos do titular |
| APP-024 | Push das movimentações, complementos, encerramento e arquivamento | PA-007/087; PD-047 | F02/F09 · eventos e entrega de notificações ao titular |
| APP-025 | Abertura de processo digital por assistente em etapas | PA-003/032; PD-010–013 | F02 · abertura interna funcional com formulário, documentos e comprovante |
| APP-026 | Consulta/emissão e download do recibo de pagamento próprio | PA-023 | F03 · demonstrativo publicado do titular |
| APP-027 | RH notifica por push a disponibilização do recibo | PA-023/093; FP-108 | F03/F09 · notificação após liberação efetiva; evento interno não comprova push |
| APP-028 | Dados de rendimentos para declaração de IRRF | PA-027 | F03 · comprovante anual e fonte reconciliada |
| APP-029 | Emissão da ficha de registro do funcionário | PA-046 | F05 · documento funcional integral do titular |
| APP-030 | Emissão do termo de rescisão | PA-045 | F05 · documento do contrato rescindido; titular inativo obtém pelo RH conforme decisão |
| APP-031 | Relatório de licença-prêmio com aquisitivos, gozos e perdas | PA-044/054 | F05 · livro de direitos e emissão integral |
| APP-032 | Extrato anual de contribuição previdenciária | PA-041 | F03 · valores anuais por vínculo/previdência |
| APP-033 | Emissão do recibo de férias | PA-061 | F03/F06 · recibo relacionado ao cálculo e programação de origem |
| APP-034 | Emissão do espelho de ponto | PA-026 | F04 · recorte pessoal, totalizadores e emissão |
| APP-035 | Solicitação de ajuste de ponto, incluindo abono | PA-033 | F04/F06 · pedido, análise e aplicação auditável após decisão |
| APP-036 | Autenticidade do recibo por código único | PA-034 | F03 · consulta pública mínima, sem download dos dados pessoais |

Dependências transversais aplicáveis: APP-001 (serviço único integrado), APP-005/006 (alteração/recuperação de senha), APP-007 (perfil funcional), APP-008/009/014 (publicação, agrupamento e pesquisa dos serviços), APP-011–013 (avisos e notificações) e APP-019–021 (documentos, assinaturas e repositório central de certificados). Serviços próprios do Portal que não são enumerados novamente no App permanecem no escopo PA-023–065. Indicadores gerenciais APP-058–073 exigem permissões de gestão e não são consultas pessoais do servidor comum.

## 5. Integração com módulos e tabelas

### 5.1 Cadeia de identidade e dados

```text
Firebase UID verificado
  → Usuario ativo + ConfiguracaoPerfil + permissões do módulo
  → Usuario.employeeId (vínculo único)
  → Employee (cadastro funcional)
  → Employee.personId → Person (Cadastro Único)
  → HrEmploymentContract (um ou mais vínculos do mesmo servidor)
  → HrEmploymentRevision / HrEmployeeFunctionalPeriod (histórico)
  → Payroll / HrPayrollRun / HrPayrollStatement (cálculo e versão publicada)
  → HrRightEntry / Vacation / Leave / AttendanceRecord / PayrollBenefit
  → HrPortalRequest (pedido) → RH decide e executa
```

Referências schema: `Employee`, linhas 267–368; `Usuario`, 14003–14022; `HrEmploymentContract`, 7253–7280; `HrPayrollRun`/`HrPayrollStatement`, 7314–7351; `HrRightEntry`, 7354–7367; `HrPortalRequest`, 7436–7448. São linhas de código, não páginas do checklist.

**Integração localizada:** páginas consultam as mesmas tabelas do RH/Folha, usando `context.prisma`; não existe banco separado do Portal. Ficha, férias/ponto/benefícios usam estruturas básicas; demonstrativos/consignações/direitos usam a camada contratual do RH. Recadastramento deferido atualiza `Person` e as projeções de contato em `Employee`.

**Integração a completar:** reconciliar as duas camadas para que nome, matrícula, cargo, lotação, jornada, aquisitivos e saldos sejam apresentados conforme o vínculo/período correto. Seleção de contrato deve listar somente contratos do titular. Não recalcular documentos históricos com o cadastro atual; reutilizar snapshots e revisões. Não inferir pagamento bancário a partir de cálculo fechado ou reserva.

### 5.2 Publicação da folha

- `/folha` filtra `PayrollItem.employeeId` e competências fechadas/pagas, mas não aplica a mesma condição `releaseAt/revokedAt` do demonstrativo completo.
- `/demonstrativos` e sua API exigem contrato próprio, versão oficial fechada, `releaseAt <= agora` e `revokedAt = null`.
- A flag geral `PORTAL_DEMONSTRATIVOS_HABILITADOS` é consumida. Sem configuração explícita, o comportamento atual preserva o acesso.
- `publishPayrollStatements` permite data futura, mas exige cálculo fechado e publica por execução, não fecha a configuração por tipo de folha/regime e liberação antes do fechamento exigida em FP-108.
- `mode = OFICIAL` não significa automaticamente ambiente operacional: existem escopos distintos nas regras/execuções. Definir no servidor o conjunto publicável; não deixar o funcionário selecionar livremente escopos internos de cálculo nos serviços pessoais.
- O cadastro de um novo contrato gera registro `ACESSO_PORTAL`, mas esse registro é excluído da fila comum e não cria por si só usuário Firebase, autorização local ou vínculo. Completar o processamento configurável de FP-103.

### 5.3 Protocolos internos e execução dos serviços

O fluxo comum atual **não abre protocolo digital**:

```text
Formulário fixo → HrPortalRequest (ID interno)
  → fila RH → decisão em texto → evento de integração interno
```

`HrPortalRequest` não possui relação com `Process`, `Subject` ou número de protocolo. `submitEmployeeHrRequest` somente cria o pedido. `decideEmployeeHrRequest` registra decisão e evento com `appliedToFunctionalRecord: false`. Dessa forma, **pedido deferido não significa serviço executado**.

O fluxo de recadastramento é uma exceção efetiva: o deferimento próprio aplica os campos aprovados ao Cadastro Único. O crédito consignado também possui execução própria: decisão e reserva de parcelas. Ambos ainda precisam da referência processual e do acompanhamento integrado, quando o serviço exigir tramitação.

### Modelo proposto

1. Estender `HrPortalRequest` com relação ao cadastro funcional e, para requerimentos com tramitação, ligação única ao `Process`; preservar IDs/pedidos já existentes.
2. Configurar assunto/tipo/roteiro/setor responsável por serviço, finalidade **Interno da Entidade**, prazos, formulário e documentos. Catálogo administrado pelo RH, sem alterar o código para cada assunto.
3. Adapter de abertura com ator e `Employee` da sessão, interessado `Person` do titular, contrato validado e destino definido pela configuração. Reaproveitar `createValidatedProcess`, sem dar permissão de gestão de Protocolos ao servidor solicitante.
4. Criar pedido e processo na mesma transação, com chave idempotente e comprovante de número/ano. Registrar versão do formulário/aceite quando configurado.
5. Vincular anexos ao pedido/processo e disponibilizar downloads somente após autorização de titularidade. Não usar URL pública genérica para dados funcionais ou clínicos.
6. Disponibilizar “Meus protocolos”: número, serviço, abertura, situação, etapa/setor, prazo, pendência, decisão e providência funcional; permitir complementação no fluxo autorizado.
7. Deferimento de férias deve chamar programação/reserva RH apropriada, validando contrato próprio, aquisitivo, saldo, datas e conflitos. Indeferimento não cria programação. Conclusão fica vinculada à programação emitida.
8. Ajuste de ponto deve aplicar correção/abono no registro de origem, preservando antes/depois, decisão, autoria e os reflexos de folha cabíveis. Pedido não altera imediatamente a jornada.
9. Notificar responsáveis e titular com estados decorrentes de operações reais. Evento registrado em `HrIntegrationEvent` não é prova de entrega de e-mail/push.
10. Consulta/emissão de documento já disponível não precisa criar processo por acesso. Inscrição/voto CIPA, registro diário de ponto e agendamento possuem registros próprios; criar processo somente quando o serviço estiver configurado para análise/tramitação.

## 6. Verificação de segurança e melhorias prioritárias

### 6.1 Controles localizados

| Superfície | Controle encontrado | Limite da conclusão |
|---|---|---|
| Login/sessão | Firebase verifica identidade; sessão verifica expiração/revogação e e-mail verificado; usuário e perfil ativos são conferidos no banco | Compartilha sessão com aplicação; não foi exercitado login real no navegador neste estudo |
| Identidade funcional | `getEmployeePortalAccess` usa `context.user.employeeId` e exige cadastro ativo | Comentário antigo de acesso para todo perfil não substitui RBAC efetivo de `canViewModule` |
| Ficha, ponto, férias, afastamentos, benefícios, atos | `employeeId = servidor da sessão` em filtros e contagens | Não há seletor de outro servidor nesses caminhos; validar respostas com duas contas reais |
| PDF de folha | `getPayrollStatement(db,id,employeeId)` exige contrato do titular e versão liberada/não revogada | Parâmetro pessoal é opcional no serviço compartilhado; toda futura chamada externa deve obrigatoriamente fornecê-lo |
| Banco de horas/licença-prêmio | `contract.employeeId` continua obrigatório mesmo quando navegador informa `contractId` | Escopo de dados a publicar e apresentação precisam de definição operacional |
| Pedidos comuns | Actions derivam funcionário e ator da sessão; schema estrito; chave reutilizada com outro titular/dados é rejeitada | Faltam vínculo processual, histórico de acompanhamento e comprovante |
| Recadastramento | Público/período/campos autorizados, titular ativo, controle de idempotência e conflitos na aprovação | Campos previstos em FP-110 ainda não completos |
| Crédito | Contrato próprio, folha publicada do titular, consignatária e regra vigentes; deferimento transacional | Não constitui autorização de acesso aos dados de outros servidores pelo convenente |
| Planos de saúde | Detalhe e listagem exigem `payrollBenefit.employeeId` do titular; dependentes relacionados | Relatório pessoal inclui dados dos próprios dependentes; não de qualquer dependente informado pelo navegador |
| CAT | Action impõe `employeeId`; serviço compara com sessão; listagem própria restringe titular | UG é derivada da secretaria atual com exigência de única UG; completar seleção histórica conforme local/data do acidente |
| PPP e exportação | Titular imposto no servidor e histórico canônico validado por UG/período; PDF `private, no-store`; sem projeção clínica completa | Emissão atual declara incompletude e não fecha o documento normativo |
| CIPA | Eleitorado, cadastro ativo, período, candidato da eleição e voto único; identidade não gravada na cédula | Dados mínimos de candidatos são compartilhados dentro da eleição autorizada, conforme seção 2 |
| Fila administrativa RH | Página exige acesso RH; decisão exige operação RH apropriada | Fila comum lê pedidos de toda a instância sem filtro departamental/UG. Limitar a equipe competente; servidor comum não pode receber acesso RH para usar autosserviço |

### 6.2 Melhorias a priorizar

1. **F01:** sessão válida antes do painel, recuperação/alteração de senha PA-008, retorno funcional seguro, logout próprio e perfil de autosserviço sem permissões RH/Folha/Protocolos administrativos.
2. **F01:** tratar 401/403/423 de modo consistente em páginas/actions/APIs. Hoje parte das chamadas de acesso fica fora dos blocos de tratamento; cookie inválido pode gerar erro técnico em vez do fluxo de login.
3. **F02/F06:** autorização por `request.employeeId` e `process` vinculado ao pedido em toda leitura, complementação e download. Não usar a caixa de processos do setor como substituta de “Meus protocolos”.
4. **F03:** política de disponibilização única entre consulta legada, PDFs e futuras fichas/relatórios; revogação/data futura devem valer também no acesso direto.
5. **F01/F05:** aplicar a decisão funcional FP-096: ativos acessam também em férias/afastamentos e fora do expediente; inativos/desligados procuram o RH, inclusive para o termo de rescisão. Esta decisão do Portal não altera as permissões administrativas de outros módulos.
6. **F01/F08:** ampliar auditoria de acesso/emissão/mutação pessoais usando mecanismos já existentes; manter sigilo da cédula CIPA, sem registrar a escolha junto ao eleitor.
7. **F08:** manter departamentos, comissões e convenentes em permissões próprias. Não ampliar escopo do servidor comum para atender requisitos de outros atores.
8. A infraestrutura atual usa **uma base municipal por instância**; nome `tenant-context` não comprova segregação de múltiplos municípios em um banco compartilhado. Se a hospedagem atender diferentes instâncias, conferir resolução do domínio/base/configuração sem confiar em filtros enviados pelo navegador.

## 7. Organização sugerida da tela após login

| Grupo | Consultas/ações |
|---|---|
| Minha identificação | Nome do servidor, matrícula(s), vínculo(s), cargo/lotação vigentes e indicação de dados pendentes |
| Pagamentos e previdência | Contracheque, ficha financeira, comprovante IRRF, contribuições anuais/outras previdências e recibo de férias |
| Vida funcional | Ficha de registro, atos legais, declarações de vínculo/tempo/magistério, adicional de tempo e termo de rescisão |
| Jornada e direitos | Espelho de ponto, registro de ponto quando habilitado, férias/aquisitivos/saldos, licença-prêmio e compensação/banco de horas |
| Consignações | Empréstimos/parcelas, emissão da margem por banco e pedido de crédito existente |
| Solicitar serviços | Férias, ajuste de ponto, correção cadastral, recadastramento, documento, benefício e outros assuntos configurados pelo RH |
| Capacitação e avaliações | Inscrições, certificados próprios, autoavaliação e etapas atribuídas de desempenho/probatório |
| Saúde e segurança | CAT, agenda SST, PPP, planos/despesas próprias, candidatura e votação CIPA |
| Meus protocolos e avisos | Acompanhamento dos pedidos, pendências de complementação, respostas, documentos liberados e avisos do RH |

Nenhum indicador deve agregar salários/pedidos pessoais de outros funcionários no painel comum. Seletores de matrícula/contrato exibem somente vínculos do titular, inclusive para usuário com função administrativa. A área administrativa conserva suas próprias permissões e telas.

## 8. Fases propostas de implantação

### F01 — Login funcional e identidade pessoal

- Completar tratamento de sessão, recuperação/alteração de senha, retorno seguro e logout.
- Separar apresentação do login/painel do cabeçalho administrativo; oferecer acesso público ao login pelo portal institucional.
- Configurar perfil de autosserviço, processamento de convites FP-103 e vínculo único. Aplicar a política FP-096 já decidida: cadastro ativo sem restrição de férias/afastamento/horário; documentos de inativos/desligados atendidos pelo RH.
- Critério de conclusão: visitante chega ao login sem credencial administrativa; conta autorizada entra no painel próprio; sem vínculo/fora da política não recebe dados pessoais; sessão inválida retorna ao login.

### F02 — Catálogo funcional e protocolos internos

- Depende de F01. Reutilizar tipos, assuntos, roteiro, sequência e notificações de Protocolos.
- Configurar serviços por público/vínculo/assunto, documentos, destino e prazos; estender `HrPortalRequest` com relação processual e titularidade consistente.
- Criar abertura idempotente/transacional, comprovante e “Meus protocolos”, com histórico, complementação e downloads autorizados.
- Critério: pedido de serviço com tramitação gera um único processo interno, aparece para equipe competente e somente para seu titular no Portal.

### F03 — Folha, recibos e relatórios financeiros pessoais

- Depende de F01 e fontes RH/Folha conciliadas; catálogo de F02 para publicação dos serviços.
- Unificar autorização/liberação, completar FP-108 e layouts; entregar PA-023/025/027/034/041/060 e base de PA-061.
- Relatórios integrais do recorte, sem totalizar apenas página visível; autenticidade pública com projeção mínima.
- Critério: cada emissão corresponde ao titular/vínculo/período, respeita publicação/revogação e é reconciliável com sua fonte RH/Folha.

### F04 — Ponto, férias consultáveis e banco de horas

- Depende de F01/F02; reutilizar fontes e regras RH.
- Entregar PA-024/026/033/047/051/052: direitos de férias, ponto por intervalo, totalizadores, ajustes, marcação habilitada e emissões.
- Critério: servidor consulta seu histórico; ajuste aguarda decisão e só então modifica a origem; marcação não admite outro titular nem horário arbitrário.

### F05 — Documentos funcionais, licença-prêmio e consignações

- Depende de F01/F03 e histórico contratual canônico.
- Entregar PA-028/029/031/042/044–046/053/054/057/063, usando revisões, direitos, averbações e parcelas existentes.
- Completar documento de margem/banco e regra FP-084, com reserva/emissão distintas. Termo de contrato encerrado somente para titular ainda ativo; inativo/desligado recebe o documento pelo RH.
- Critério: documento reproduz vínculo/período correto; contrato de outro titular não produz dados; uso/reserva/pagamento são situações distintas.

### F06 — Requerimentos RH com execução e recadastramento completo

- Depende de F02/F04/F05.
- Entregar PA-030/032/043/065 e PA-061 com programação/cálculo correspondente.
- Férias com formulário próprio e programação a partir da decisão; ampliar recadastramento para todos os campos FP-110, dependentes/endereço/documentos e retorno de pendências.
- Critério: deferir grava decisão e providência vinculadas sem duplicidade; indeferir não altera cadastro/direitos; histórico e documentos permanecem acessíveis somente ao titular/equipe competente.

### F07 — Capacitação, avaliações e serviços coletivos delimitados

- Depende de F01/F02 e configuração dos provedores RH/SST.
- Entregar PA-038/039/048–050; conservar/validar PA-055/056 já existentes.
- Critério: participante acessa suas inscrições/certificados/autoavaliações; comissão acessa somente designações; candidatos/aniversariantes têm projeção mínima; voto permanece secreto e único.

### F08 — SST e superfícies de outros atores

- Depende de F01/F02 e provedores correspondentes.
- Completar PA-058/059/062/064, incluindo documentação, agenda própria e comprovação dos serviços.
- Entregar superfícies específicas PA-035/036/037/040 para convenentes, candidatos e departamentos, sem convertê-las em consulta coletiva do servidor comum.
- Critério: CAT/agendamento/plano/PPP têm titular, fonte e resultado rastreáveis; áreas de outros atores aplicam autorização própria.

### F09 — Integrações externas e encerramento da cobertura

- Depende das entregas funcionais anteriores; integrações externas novas ficam nesta fase.
- Completar conectores de convenentes/bancos/eSocial/PPP e compartilhamento futuro com APP quando exigidos, após preparar identificadores/versões/eventos nas fases anteriores.
- Validar credenciais e entregas externas com respostas efetivas; não tratar geração interna como transmissão/aceite.
- Encerrar os itens da matriz com evidências de login, operação própria, decisão, execução, documento e isolamento.

## 9. Verificação realizada e critérios para implantação

### Evidência desta análise

- Leitura da fonte normativa, páginas/telas, actions/APIs, serviços de RH/SST/Protocolos e modelos Prisma referenciados.
- Executado: `node --env-file=.env.local --conditions=react-server --import tsx --test tests/portal-proxy.test.ts tests/sst-benefits-service.test.ts tests/sst-prevention.test.ts`.
- **15 verificações passaram:** navegação/entrada/login do Portal; filtro pessoal de planos; permissões de escrita e UG nos serviços exercitados; elegibilidade, duplicidade, transação e sigilo da votação CIPA.
- São verificações automatizadas locais, incluindo mocks e banco em memória. Não abrangem toda a folha, todos os documentos, login Firebase real nem todas as rotas de produção.
- `tests/hr-workforce-service.test.ts` contém cenários existentes de pedidos, demonstrativos, contrato alheio, recadastramento e crédito. Foi consultado como evidência adicional; não foi executado nesta análise.

### Evidências exigidas para concluir as entregas

1. Duas contas funcionais distintas: A visualiza e emite A; B visualiza e emite B; trocar ID de demonstrativo/contrato/pedido/beneficiário/UG não revela dados alheios.
2. Visitante, cidadão sem vínculo e servidor inativo: sem dados funcionais; sessão expirada/revogada tratada no login e nas requisições diretas.
3. Mesma conta com mais de um contrato: seleção exclusivamente de seus vínculos, relatórios corretos por período e consolidação sem duplicidade.
4. Folha futura/revogada/cancelada ou fora da política: indisponível em tela, URL direta e exportação; versão liberada reproduz os valores de origem.
5. Férias: pedido → protocolo interno → equipe RH → decisão → programação/reserva → cálculo/recibo quando cabível → resposta ao titular.
6. Ajuste de ponto: pedido → análise → alteração auditada da origem → reflexo aplicável, sem marcação ou abono indevido em folha fechada.
7. Recadastramento: proposta completa → conferência de diferenças/conflitos → deferimento → atualização canônica; indeferimento preserva a origem.
8. Relatórios emitidos incluem o conjunto autorizado do filtro, e não apenas a página atual; arquivo, layout, versão e origem ficam rastreáveis.
9. CIPA: candidato de outra eleição, fora de janela ou segundo voto são recusados; os registros não relacionam cédula e eleitor.
10. PA-035/040 e avaliações por comissão: servidor comum não recebe escopo coletivo; convenente/departamento/comissão vê somente a operação e o público expressamente autorizados.

## 10. Ordem recomendada e decisões para implantação

Começar por **F01 → F02 → F03**, aproveitando imediatamente os demonstrativos e serviços existentes, mas oferecendo painel/menus completos e identidade pessoal consistente. Prosseguir com jornada/direitos e execução dos pedidos, depois documentos/capacitação/SST. As integrações externas novas encerram o plano.

Definir com o RH antes da implementação das respectivas fases:

- A política funcional de acesso já está definida: ativos acessam independentemente de férias/afastamentos/horário; inativos/desligados procuram o RH, inclusive para termo de rescisão. LDAP foi adiado.
- Assuntos/roteiros, equipes responsáveis, prazos, documentação e atos legais de férias/ajustes/benefícios.
- Layouts dos recibos/declarações e política de liberação por folha/regime/data.
- Público e campos mínimos do relatório de aniversariantes e designações de comissões.
- Bancos/convenentes, limites/validade da margem e identificadores dos conectores futuros.

As definições podem ser parametrizadas; não impedem iniciar a identidade, o catálogo, a ligação processual e a organização do painel. Este estudo detalha a entrega funcional do servidor que estava marcada como dependência setorial na [matriz integrada](MATRIZ_COMPRAS_PROCESSOS_SERVICOS_AUTOATENDIMENTO.md), complementando o [plano de Compras, Processos, Serviços Públicos e Autoatendimento](PLANO_COMPRAS_PROCESSOS_SERVICOS_AUTOATENDIMENTO.md).
