# Portal do Servidor — backlog de execução F02–F09

Data: 12/10/2026. Referência: [plano e matriz dos checklists](PLANO_PORTAL_SERVIDOR_CHECKLIST.md).

## 1. Decisões que orientam a execução

- Acesso atual por e-mail institucional cadastrado e senha, com conta vinculada ao titular. LDAP será providenciado posteriormente.
- Servidor ativo acessa inclusive em férias, afastamentos e fora do expediente. Inativo/desligado solicita documentos ao RH.
- Escopo: PA-023–065 e correspondências APP-023–036, incluindo dependências transversais identificadas na matriz. A emissão pelo Portal não comprova entrega pelo App.
- RH/Folha/SST são as fontes das regras, cadastros, cálculos e resultados. O Portal não cria uma segunda folha ou um livro paralelo de direitos.
- Regras municipais são parametrizadas na origem. Acesso ao Portal não equivale a habilitação para marcar ponto, elegibilidade para curso, direito a férias ou autorização de crédito.
- Layout ERP profissional, com navegação funcional, filtros, listagens compactas, paginação, detalhes e comprovantes.

**Estado deste documento:** desenvolvimento F02–F08 concluído e verificado localmente. Consulte [o fechamento final e as evidências atuais](PORTAL_SERVIDOR_FECHAMENTO_F02_F08.md) para entregas, testes, configurações e fontes municipais exigidas. Os checkboxes originais abaixo continuam sendo a referência de aceite operacional completo, incluindo os cenários com contas/dados reais e os canais externos; não equivalem ao estado do código. F09 permanece posterior. As evidências da F01 permanecem no plano principal.

### Registro do lote em implementação — 12/10/2026

Por solicitação do usuário, a consolidação de Prisma/schema/migrations e a execução de testes, lint, typecheck e build ficam para o fechamento do conjunto. Não atribuir os resultados aprovados da F01 às alterações deste lote.

| Frente | Código local em implementação | Verificação e complementos ainda necessários |
|---|---|---|
| F02 | Catálogo funcional ligado a `PublicService`, configuração RH, abertura interna idempotente, anexos próprios, acompanhamento, complemento e fila RH | Relações tipadas, finalidade/origem estruturais, diagnóstico dos registros antigos, ciclo de uploads órfãos, concorrência e isolamento real |
| F03 | Política de disponibilização por tipo/regime/escopo, liberação antecipada explícita, revogação, PDF com código e consulta pública mínima | Fontes/layouts de IRRF anual, recibo específico de férias, configuração municipal, concorrência e integridade/revogação ponta a ponta |
| F04/F05 | Relatórios pessoais integrais em PDF/CSV/XLSX, direitos, ponto, consignações, ficha de registro e atos; marcação habilitada e ajuste após análise | Conciliação histórica e de totalizadores; declarações de tempo/magistério/vínculo, margem FP-084, atos com documentos, gozo efetivo e histórico ATS |
| F06 | Deferimento funcional de férias chama reserva canônica; recadastramento aceita nome social, RG/emissor, filiação, naturalidade/nacionalidade, gênero/raça e e-mail secundário além dos campos anteriores | Endereços, dependentes, empregos anteriores, comprovação, correção de pendências e conferência administrativa completa |
| F07 | Inscrição em cursos, conclusão reconhecida pelo RH, certificado próprio, ciclos de autoavaliação/comissão, administração de atividades; aniversariantes configurados com projeção mínima | Publicação autorizada do resultado final, evolução das etapas, configuração municipal, comprovante de inscrição e verificação dos controles CIPA |
| F08 | Agenda SST própria com reserva/cancelamento/comprovante; publicação de versões GED, incluindo PPP assinado, e relatório dos planos | Completar documentos/fontes SST, comprovante e retorno CAT, superfície departamental de atestados, convenentes, editais e inscrições de candidatos |

Entradas adicionadas neste lote:

- `/portal-servidor/relatorios` e `/api/portal-servidor/relatorios`: relatório integral do filtro, com titular resolvido da sessão e contrato próprio quando suportado pela fonte. Ponto, afastamentos, atos e planos rejeitam filtro contratual, pois seus registros canônicos são pessoais. A ficha de registro informa cadastro atual e revisões até o fim do filtro.
- `/rh/atividades-funcionais`: configurar cursos/ciclos e reconhecer conclusão com presença e referência da evidência. Certificado exige curso encerrado e critérios atendidos. Eventos internos de certificado/comissão ficam em `PROCESSADO`.
- `/rh/publicacao-funcional`: configurar políticas, disponibilizar cálculos oficiais e revogar demonstrativos. Publicações por política conferem hash da versão também depois do fechamento; a consulta `/folha` reutiliza a autorização dos demonstrativos completos.
- `/portal-servidor/aniversariantes` e `/api/portal-servidor/aniversariantes`: exigem regra PORTAL `ANIVERSARIANTES_FUNCIONAIS` vigente com `viewerEmployeeIds`, `publishedEmployeeIds` e `legalReference`. Sem regra aplicável, a relação permanece indisponível. A projeção contém apenas nome e dia/mês, sem ano de nascimento ou identificadores funcionais.

Essas entradas não comprovam operação no App, entrega push, transmissão externa nem publicação em produção. F02–F08 continuam abertas até completar os complementos e executar as verificações de aceite.

## 2. Sequência e dependências

| Entrega | Dependência | Resultado verificável |
|---|---|---|
| Fechamento F01 | Cadastro de identidade/perfil e fluxo FP-103 | Conta e vínculo corretos; processamento de solicitação de acesso rastreável |
| F02 | Identidade funcional F01 e configurações de Protocolos | Catálogo, abertura interna transacional e acompanhamento pessoal |
| F03 | Fontes Folha e política de publicação; F02 para catálogo | Documentos financeiros pessoais e autenticidade pública |
| F04 | Fontes Jornada/Direitos; F02 para requerimentos | Consultas/emissões de jornada e ajuste auditado |
| F05 | Histórico funcional e financeiro; publicação F03 quando aplicável | Documentos funcionais, licença-prêmio e consignações |
| F06 | F02; programação e saldos de F04/F05 | Decisão RH vinculada à execução efetiva e recadastramento completo |
| F07 | Cadastros de capacitação/avaliação e SST; F02 quando houver análise | Inscrições, certificados, avaliações e serviços coletivos delimitados |
| F08 | Fontes SST e autorização dos demais atores; F02 quando houver análise | Agenda, CAT, PPP, planos e superfícies específicas |
| F09 | Serviços concluídos e contrato de integração de cada destino | Consumo pelos canais externos e entrega confirmada de integrações |

F03/F04/F05 podem ter trabalhos de consulta/documentação independentes após a identidade. A programação de férias na F06 exige os saldos e validadores de origem, mesmo que o formulário tenha sido entregue antes. F09 encerra integrações novas; identificadores, versões e eventos devem ser preparados nas fases produtoras.

## 3. F02 — arquitetura do catálogo e dos protocolos

### 3.1 Base confirmada e extensões propostas

| Base existente | Uso planejado | Complemento necessário |
|---|---|---|
| `PublicService` | Cadastro descritivo comum de serviço: nome, descrição, público, requisitos, etapas, prazo, custo, link e situação | Complementar publicação por canal/grupo e ligar a configuração funcional; não confundir texto de prazo com prazo processual calculável |
| `ProcessType` / `Subject` | Tipo, assunto, destino inicial, prioridade, SLA e permissão de abertura interna | Mapear serviço funcional expressamente; não oferecer todos os assuntos administrativos ao titular |
| `ProcessWorkflowStage` / fluxo genérico publicado | Roteiro e prazos administrativos | Fixar versão de origem e conferir permissão de complementação pelo requerente |
| `HrPortalRequest` | Pedido, titular, chave idempotente, conteúdo e decisão | Relações com servidor/serviço/processo, versão do formulário, histórico de pendências e referência à execução |
| `Process` / `ProcessEvent` / documentos | Número único, movimentações, documentos e histórico | Identificação persistida da origem funcional e finalidade interna, além da projeção de acompanhamento pessoal |
| `Usuario.employeeId` / `Employee.personId` | Identidade funcional e interessado do processo | Validar o interessado canônico e a propriedade do contrato antes de abrir |

Propor uma extensão funcional 1:1 do cadastro comum de serviços, por exemplo `HrPortalServiceConfiguration`, contendo código funcional, referência ao serviço comum, tipo/assunto, operação de destino, versão do formulário, documentos/aceite e critérios de público. Esse nome é uma proposta técnica, não uma tabela já existente. Publicação, ordenação e canais devem usar o cadastro comum; evitar um catálogo exclusivo e incompatível para o App.

`createValidatedProcess` já valida tipo/assunto ativos, abertura interna, destino, sequência anual, roteiro e auditoria. Entretanto, o `Process` examinado não possui campo explícito de finalidade e o serviço de abertura não persiste uma finalidade como parâmetro. Planejar a representação persistente de **Interno da Entidade** e origem **Portal do Servidor**, verificando os consumidores antes de alterar a abertura compartilhada.

### 3.2 Contrato de abertura

1. Receber somente serviço, contrato próprio quando necessário, dados do formulário, anexos autorizados, aceite e chave idempotente.
2. Resolver usuário, servidor ativo e interessado a partir da sessão/banco. O navegador não escolhe titular, interessado, setor responsável ou permissões.
3. Carregar configuração publicada do serviço e validar contrato, público, formulário, documentos e aceite da versão vigente.
4. Na mesma transação, bloquear a chave, conferir repetição, criar pedido e processo e registrar vínculos/histórico. Repetição idêntica retorna o mesmo comprovante; titular ou conteúdo divergente rejeita a chave.
5. Numerar pelo mecanismo anual existente. Não usar o ID de `HrPortalRequest` como número de protocolo e não abrir um segundo processo para cada etapa.
6. Guardar snapshot da versão do serviço/formulário/aceite e das referências de origem necessárias à interpretação do pedido.
7. Confirmar gravação antes de retornar comprovante e atualizar a tela. Notificação externa usa mecanismo de entrega com retorno próprio.

Upload de arquivo para storage e transação de banco não formam uma transação única. Planejar upload privado com referência de titular, validação antes do vínculo, preservação dos arquivos aceitos e tratamento de uploads sem pedido concluído. Um anexo de outra conta não pode ser associado por alteração de ID.

### 3.3 Decisão e execução

Separar três dimensões: **tramitação do processo**, **decisão administrativa** e **execução funcional**. Um pedido pode estar deferido e ainda ter execução pendente; uma falha de execução não deve aparecer como serviço concluído.

- Decisão administrativa exige equipe/UG competente e operação autorizada; o solicitante não adquire permissões administrativas de Protocolos/RH.
- Serviço com efeito interno chama a rotina de origem, valida novamente as condições atuais e grava referência ao resultado junto à decisão/execução na transação apropriada.
- Retry não duplica programação, reserva, atualização cadastral ou documento. Preservar antes/depois e motivo de recusa quando houver conflito.
- Operação externa permanece com estado de entrega separado até resposta do destino. Registrar evento interno não comprova envio.
- Publicar ao titular somente histórico e documentos autorizados. Não expor automaticamente despachos clínicos, notas internas ou dados de outros interessados.

### 3.4 Migração e compatibilidade

- [ ] **F02-01** — Inventariar `PublicService`, assuntos/tipos/roteiros e consumidores de abertura/decisão. Definir o cadastro comum e sua extensão funcional.
- [ ] **F02-02** — Elaborar migração aditiva de relações/índices. Novas referências processuais serão opcionais para pedidos anteriores; não fabricar protocolos históricos.
- [ ] **F02-03** — Diagnosticar pedidos cujo `employeeId`, `actorId` ou `decidedBy` não resolvam na origem antes de criar FKs; apresentar inconsistências para conciliação, preservando os registros.
- [ ] **F02-04** — Implementar administração do catálogo e mapeamentos, validando publicação, destino e operação disponível. Mudança posterior não reinterpreta pedidos já enviados.
- [ ] **F02-05** — Implementar abertura idempotente, anexos/aceite e comprovante. Conferir titular também em chamadas diretas.
- [ ] **F02-06** — Entregar “Meus protocolos”, detalhe, histórico, documentos e resposta a pendências autorizadas, com paginação e filtros.
- [ ] **F02-07** — Integrar a fila administrativa e registrar decisão/execução sem substituir os fluxos próprios de crédito e recadastramento.
- [ ] **F02-08** — Validar upgrade de pedidos anteriores, abertura concorrente, rollback, tentativa de associar anexo alheio e isolamento entre duas contas.

**Aceite F02:** abertura gera exatamente um pedido e um processo interno, vinculados ao titular, com destino e roteiro configurados; requerente acompanha somente seus registros e a equipe competente recebe a demanda.

## 4. Backlog dos serviços F03–F09

### F03 — Pagamentos, previdência e autenticidade

- [ ] **F03-01** — Reconciliar `/folha`, demonstrativos por contrato e origens dos itens. Aplicar uma política de publicação em consulta, download e emissão, por tipo/regime/data/versão/escopo.
- [ ] **F03-02** — Planejar e implementar liberação FP-108 antes do encerramento completo quando configurada, preservando valores/versionamento; alteração do cálculo invalida ou substitui o documento anterior de forma rastreável.
- [ ] **F03-03** — Entregar contracheque, ficha financeira por intervalo, comprovante IRRF anual, contribuições anuais e salários de contribuição de outras previdências, com totais conciliados com a origem.
- [ ] **F03-04** — Completar recibo de férias e layouts municipais; gerar chave de autenticidade própria e consulta pública mínima com revogação, sem abrir o PDF pessoal.
- [ ] **F03-05** — Registrar disponibilização para avisos ao titular; preparar evento para APP-027, com entrega push comprovada na fase de integração.

**Aceite:** recorte completo do titular, publicação e versão corretas, valores reconciliados, revogação efetiva também por URL direta e autenticidade sem divulgação de remuneração.

### F04 — Jornada e direitos consultáveis

- [ ] **F04-01** — Conciliar jornada contratual, ponto, afastamentos e livro de direitos; selecionar apenas contratos próprios e respeitar o período histórico.
- [ ] **F04-02** — Entregar relatórios de aquisitivos/saldos de férias, espelho de ponto por intervalo/totalizadores, afastamentos/faltas e compensação/banco de horas.
- [ ] **F04-03** — Implementar marcação para servidores individualmente habilitados: horário de origem no servidor, identidade própria, duplicidade, auditoria e regras de jornada configuradas.
- [ ] **F04-04** — Implementar pedido estruturado de ajuste/abono/justificativa, referência ao registro original e integração F02. Análise deve preservar o original e tratar reflexos em folha já fechada.

**Aceite:** consulta não mistura vínculos; registro de ponto exige habilitação específica; pedido de ajuste não altera o ponto antes da decisão e execução autorizadas.

### F05 — Vida funcional e consignações

- [ ] **F05-01** — Entregar ficha de registro integral, declarações de vínculo, tempo de serviço e exercício no magistério, usando contratos/revisões/averbações e modelos de origem.
- [ ] **F05-02** — Completar licença-prêmio, gozos efetivos, atos legais com documentos e histórico do adicional por tempo de serviço, distinguindo reserva e utilização.
- [ ] **F05-03** — Emitir relatório integral dos empréstimos/parcelas e margem por banco conveniado; aplicar validade/bloqueio/liberação RH previstos na configuração FP-084.
- [ ] **F05-04** — Integrar termo de rescisão ao cálculo/contrato correspondente. Ativo com outro vínculo pode consultar documento próprio autorizado; titular cujo cadastro esteja inativo recebe atendimento pelo RH.

**Aceite:** documentos reproduzem os dados do período; não recalculam o passado pelo cadastro atual e não equiparam reserva a desconto ou pagamento bancário.

### F06 — Execução RH e recadastramento

- [ ] **F06-01** — Solicitar férias com contrato/aquisitivo/datas/gozo/pecúnia quando aplicável; validar saldo, conflitos e regras RH sem reservar direito imediatamente na abertura.
- [ ] **F06-02** — Vincular deferimento à programação/reserva RH, com revalidação de saldo e idempotência; integrar cálculo/recibo quando cabível e informar o resultado ao titular.
- [ ] **F06-03** — Ampliar atualização cadastral e recadastramento FP-110: campos pessoais/documentais, endereço/contatos, empregos anteriores e dependentes conforme o serviço; manter comprovação e proposta separadas do cadastro canônico.
- [ ] **F06-04** — Entregar conferência administrativa de diferenças, conflitos, correção de pendências e aplicação dos campos aprovados. Campos de contato alterados não trocam automaticamente a identidade de login ou o vínculo do usuário.

**Aceite:** deferimento produz resultado funcional vinculado e único; indeferimento preserva a origem; alterações concorrentes não são sobrescritas silenciosamente.

### F07 — Capacitação, avaliações e serviços coletivos

- [ ] **F07-01** — Integrar catálogo de cursos/treinamentos, elegibilidade, vagas e inscrição concorrente; permitir acompanhamento e comprovante próprios.
- [ ] **F07-02** — Emitir certificado somente pela participação/conclusão reconhecida na origem; preservar versão, responsáveis e documentos.
- [ ] **F07-03** — Entregar desempenho e estágio probatório por ciclo/instrumento: autoavaliação própria, designações de comissão, etapas, prazos e resultado autorizado.
- [ ] **F07-04** — Emitir aniversariantes com projeção mínima e conferir candidatura/votação CIPA existentes; preservar janela, eleitorado, unicidade e sigilo da cédula.

**Aceite:** certificado não decorre apenas da inscrição; comissão vê avaliações atribuídas; serviços coletivos não revelam ficha pessoal, endereço, salário ou prontuário.

### F08 — SST e atores específicos

- [ ] **F08-01** — Integrar agenda própria SST às vagas/restrições administrativas, com confirmação e comprovante; validar concorrência para a mesma vaga.
- [ ] **F08-02** — Completar CAT própria e retorno de tratamento/comprovante, PPP a partir do histórico ambiental e responsáveis, e relatórios dos planos com titular/dependentes/despesas/devoluções.
- [ ] **F08-03** — Entregar lançamento de atestados por departamento com escopo autorizado e protocolo; restringir informações clínicas conforme permissões de SST.
- [ ] **F08-04** — Entregar descontos conveniados/departamentais, editais e inscrição em concursos/PSS em superfícies próprias, aplicando regras de cada ator. Candidato não precisa possuir vínculo `Employee`.

**Aceite:** dados e documentos pertencem ao titular/público autorizado; CAT comunicada não é homologação; PPP completo exige dados e assinatura de origem; convenente não recebe consulta salarial coletiva.

### F09 — Integrações e cobertura dos canais

- [ ] **F09-01** — Definir contratos de APIs compartilhadas com o App: identidade, perfil, catálogo, paginação, erros, idempotência e download pessoal. Não compartilhar banco diretamente com o dispositivo.
- [ ] **F09-02** — Integrar destinatários/dispositivos e entrega push de avisos RH, liberação de recibo e movimentações de protocolos; guardar confirmação/falha/retry sem divulgar conteúdo pessoal na notificação.
- [ ] **F09-03** — Completar conectores exigidos de bancos/convenentes/eSocial/PPP, com ambiente, versão, autenticação, arquivos/respostas e conciliação de retornos efetivos.
- [ ] **F09-04** — Executar a jornada no Portal e no App por requisito, incluindo CPF/senha do APP-003 e unicidade de credenciais APP-005/006. E-mail funcional do Portal não encerra automaticamente o requisito de login do App.
- [ ] **F09-05** — Encerrar a matriz somente após evidência de consulta/operação, decisão, resultado/documento e isolamento. Registrar a divergência de acesso ao termo para inativos decorrente da decisão municipal, sem declarar cobertura irrestrita PA-045/APP-030.

**Aceite:** canal utiliza o mesmo serviço autorizado; transmissão/entrega possuem retorno externo verificável; requisito do App exige percurso no App, não somente responsividade da página web.

LDAP terá entrega posterior própria: configuração de diretório, TLS, atributos, vínculo local, testes de autenticação e regra de falha. Sua indisponibilidade não bloqueia o planejamento dos serviços atuais por e-mail.

## 5. Telas e padrão ERP

| Superfície | Composição planejada |
|---|---|
| Painel pessoal | Identificação/vínculos próprios, consultas, catálogo, protocolos/pendências e avisos destinados ao titular |
| Catálogo de serviços | Pesquisa, grupo/subgrupo, requisitos/etapas/prazo configurados, canal, indicação de serviço novo conforme publicação e ação disponível |
| Assistente de requerimento | Serviço → vínculo próprio/dados → documentos → aceite/revisão → comprovante; preservar chave no retry |
| Meus protocolos | Número/ano, serviço, abertura, situação, etapa/setor, prazo e pendências; filtros e paginação |
| Detalhe do protocolo | Resumo, histórico autorizado, documentos, pendências, decisão e execução; ações conforme estado |
| Consultas e emissões | Contrato/período, tabela compacta, totais integrais, paginação em tela e emissão do conjunto filtrado |
| Fila administrativa RH/SST | Público competente, filtros por serviço/UG/setor/situação, diferenças, decisão e execução auditada |

Reutilizar `ModuleShell`, `ErpPageTitle`, `ErpListFrame` e `ErpPagination`. Layout funcional não dá acesso ao dashboard administrativo. Projeções clínicas ou de comissão dependem de autorização específica em cada leitura/ação/download.

## 6. Registro de parâmetros e evidências

Para cada serviço, preencher antes da publicação: código, requisito PA/APP, público/canal, fonte, formulário/versão, documentos/aceite, operação, tipo/assunto/roteiro/destino quando houver processo, prazo/calendário, autoridade responsável, documento de saída e regra de comunicação. Consulta imediata pode não ter prazo de análise; serviço administrativo não recebe prazo numérico inventado.

As fontes municipais já catalogadas no dossiê RH e em `docs/ANALISE_DOCUMENTAL_RH_FOLHA_IBEMA_2026.md` devem ser reconciliadas com regras vigentes/configuradas pela frente RH. Não tratar uma lei histórica ou uma referência de outro município como regra atual automaticamente.

Evidência por tarefa: requisito, caminho da tela/API/ação, configuração utilizada, titular/vínculo/período, origem e resultado, cenário positivo, recusa/isolamento e execução real do canal aplicável. Testes com mocks não substituem o percurso autenticado.

**Primeiro lote de implementação:** F02-01–04 (modelo, migração e catálogo), depois F02-05–08 (abertura/acompanhamento/fila/validação). Em seguida F03 para unificar os documentos financeiros já disponíveis e completar os relatórios pessoais.
