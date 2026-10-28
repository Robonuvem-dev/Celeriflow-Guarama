# CeleriFlow — inventário de módulos, funcionalidades e integrações para comparação de POCs

**Data-base:** 27/10/2026  
**Versão da aplicação:** `1.235.0`  
**Origem do código:** [Robonuvem-dev/Celeriflow-Guarama](https://github.com/Robonuvem-dev/Celeriflow-Guarama), branch `main`  
**Referência Git verificada:** [`2ae0c70bd217b30e2ed0c3aca08ade5f359e4c19`](https://github.com/Robonuvem-dev/Celeriflow-Guarama/tree/2ae0c70bd217b30e2ed0c3aca08ade5f359e4c19) — `Correção de Módulos`, de 21/10/2026  
**Sincronização:** `git fetch origin --prune` e `git pull --ff-only origin main`, executados em 27/10/2026; `HEAD` e `origin/main` coincidentes na revisão.  
**Finalidade:** apoiar o cruzamento com requisitos de provas de conceito, identificando capacidade implementada, limites e evidência necessária para aceite.

## 1. Conclusão executiva

O projeto possui uma base funcional extensa, com processos/GED, administração, planejamento, financeiro, compras, tributação, RH, SST, saúde, patrimônio e portais conectados por serviços internos. Há também módulos setoriais com profundidade menor e funcionalidades explicitamente demonstrativas.

**O ambiente apontado pelo `.env` local precisava de preparação na consulta da primeira rodada:** a consulta de leitura encontrou **29 módulos habilitados**, **zero conexões em `IntegrationConnection`**, **zero execuções em `IntegrationRun`** e **zero registros nas 42 tabelas de negócio amostradas**, incluindo instituição, pessoas, servidores, processos, documentos, exercício financeiro, pagamentos, escolas e pacientes. Esses dados de ambiente são históricos desta análise, não foram reconsultados após o pull e não descrevem o deploy do GitHub. A habilitação do menu não representa parametrização ou demonstração concluída.

**Integrações externas exigem avaliação individual:** os conectores do catálogo geral, em sua maioria, só executam MOCK; o banco aceita o Banco Virtual Robonuvem em SANDBOX; seis conectores de saúde aceitam SANDBOX/HOMOLOGAÇÃO. Existem outros caminhos específicos, como a API pública de transparência de Ibema, Firebase, Blob, Resend e extração de pranchas por IA/OCR, que não dependem necessariamente do cadastro geral de conectores.

**Não é possível calcular percentual de aderência sem o checklist da POC.** Este documento fornece IDs estáveis para relacionar cada requisito às capacidades e registrar o resultado da demonstração.

**Escopo das matrizes:** 252 capacidades funcionais (**198 prontas, 38 parciais e 16 pendentes**), 33 integrações internas, 40 integrações externas e 16 roteiros de demonstração. As contagens representam recortes inventariados, não requisitos aceitos nem percentual de aderência.

### 1.1 Como interpretar os status

| Status | Significado neste inventário | Uso no comparativo |
|---|---|---|
| **Pronta** | Há implementação identificável para o recorte descrito, com interface/API e regra/persistência correspondentes, quando aplicáveis. | Candidata a demonstração, após preparar dados e permissões. Não significa aceite já realizado. |
| **Parcial** | Existe parte utilizável, mas há limitação de escopo, implementação demonstrativa, integração incompleta ou dependência técnica relevante. | Comparar o texto exato do requisito e registrar o que falta. |
| **Pendente** | Não foi encontrada capacidade operacional para o recorte, ou o próprio código a declara indisponível/planejada. | Exige entrega ou evidência adicional antes do aceite. |

**Há duas avaliações diferentes:**

1. **Status de implementação:** usado nas matrizes funcionais e de integrações, com o alcance delimitado em cada linha.
2. **Preparação do ambiente:** apresentada na seção 2. Uma função pode estar implementada e continuar pendente de configuração/dados no banco examinado.

“Pronta” é uma conclusão de inspeção técnica, não certificação legal, homologação de terceiro ou teste ponta a ponta executado nesta análise. “Não localizado” indica ausência de evidência no escopo pesquisado, e não prova absoluta de inexistência em serviços externos ao repositório.

### 1.2 Método e abrangência

- Inventário de rotas, bibliotecas de domínio, APIs, schema/migrações, scripts, testes e configuração de implantação; leitura dirigida de regras, actions e pontos de integração.
- Código-base sincronizado com a `main` do GitHub. Foram revisadas as alterações dos **21 arquivos** dos commits `1dfa7f9` e `2ae0c70` em relação à primeira análise (`e155f9d`), incluindo os consumidores das novas rotinas e o conteúdo/estrutura do catálogo FIPE. Os demais arquivos versionados não mudaram nesse intervalo; suas evidências anteriores foram reaproveitadas.
- Consulta **somente de leitura**, na primeira rodada, ao PostgreSQL indicado pelo `.env`: módulos, conectores, execuções, migrações e contagens de tabelas selecionadas. A revisão do GitHub não repetiu essas consultas.
- Conferência, na primeira rodada, apenas da **presença** das variáveis de ambiente relevantes, sem registrar valores de credenciais. Arquivos locais não versionados e alterações locais não integram a avaliação do código publicado no GitHub.
- Dimensão recontada nos arquivos versionados da referência atual: **630 arquivos `page.tsx` internos**, **697 no total**, **164 endpoints `route.ts` sob `src/app/api`**, **973 modelos Prisma**, **209 arquivos de testes em `tests/`** e **36 em `src/`**. Rotas dinâmicas, aliases e páginas de edição fazem parte dessas contagens; elas não medem requisitos atendidos. Essas contagens substituem as da primeira rodada.
- Esta é uma análise geral por capacidades, não revisão linha a linha de todos os arquivos. Não foram executadas jornadas autenticadas, transmissões externas, seeds, build ou a suíte de testes nesta rodada. A existência de teste é evidência de cobertura prevista, sem afirmação de aprovação atual.
- O banco localmente configurado foi acessível, mas sua equivalência com o deploy público/produção **não foi confirmada**. As conclusões de configuração se limitam a esse banco e ao `.env` examinado, sem presumir variáveis da Vercel ou outros ambientes.

### 1.3 Revisão da versão efetivamente publicada no GitHub

| Mudança na `main` | Conclusão revisada | Evidências principais |
|---|---|---|
| FIPE ampliada | Há catálogo versionado com **7.386 modelos de carros de 108 marcas**, referência 2026-10, 109 fontes com hashes e `complete: true`. A completude declarada é de modelos de carros retornados na consulta; não há preços nem anos/modelo individualizados nesse arquivo. | E32; FRO-07/10; EXT-33. |
| Débitos da frota | Cadastro de obrigações, parâmetros de vencimento por repartição, parcelas, estorno e gasto operacional foram implementados. O caminho de pagamento pela interface possui incompatibilidade de nome do comprovante, descrita em FRO-09/GAP-15. | E20; `control-debts.ts`, `control-policy.ts` e `gestao/forms.ts`. |
| Integração patrimonial da frota | A ficha passou a exibir código/tombamento e link para o bem de origem; vínculo não equivale a criação automática de bem. | E20; FRO-01; INT-17. |
| Audiências do planejamento | A tela agora lista documentos vinculados e permite ingresso de arquivo/ata pelo GED, condicionado a permissões e classe documental ativa. | E12; PLA-04. |
| Transparência de pessoal e diárias | Colunas públicas foram ampliadas, incluindo horário, término/motivo do vínculo, aposentadoria/cessão, retorno e finalidade da diária. Preenchimento depende da fonte e dos complementos autorizados. | E11; TRA-02. |
| Legislação e consultas públicas | Consulta municipal de `LegalText` com busca/categoria; limitação de consultas/exportações por IP no processo, com HTTP 429. | E11; TRA-12/13. |
| Libras | Foi acrescentado atalho para o site público VLibras. Não foi identificado widget de tradução integrado à página nesse incremento. | TRA-14; EXT-40. |
| Documento LEG-04 | A nova autoavaliação registra 58 itens como “Atende” e relata 22 testes aprovados. Esses são registros do repositório, não aceite da POC nem testes reexecutados nesta revisão. | [LEG-04_VALIDACAO.md](LEG-04_VALIDACAO.md). |

A nova migração `20261021160000_complete_fleet_debt_control` acrescenta `FleetDebtPayment` e `FleetDebtSettings`. Sua aplicação no ambiente consultado anteriormente ou em produção não foi confirmada nesta revisão. A presença desses modelos no GitHub não comprova implantação.

## 2. Fotografia da configuração encontrada na primeira rodada

**Escopo temporal e de origem:** esta seção preserva a consulta do banco/`.env` feita antes da sincronização. Ela é contexto de preparação da instância localmente indicada, e não evidência da configuração atual do GitHub, da Vercel ou da produção. Não houve nova consulta de ambiente após o pull.

| ID | Item conferido | Situação observada | Avaliação para demonstração |
|---|---|---|---|
| AMB-01 | Conectividade PostgreSQL/Neon | Consultas SELECT executadas com sucesso; URLs de banco presentes no `.env`. | **Pronta** para leitura técnica; falta base de negócio. |
| AMB-02 | Migrações registradas | Na consulta anterior: 152 finalizadas e não revertidas; última por nome: `20261019010000_transparency_page_feedback`. A `main` agora inclui `20261021160000_complete_fleet_debt_control`. | **Parcial**: confirmar aplicação da nova migração; não foi feita comparação integral de drift/migrações nem nova consulta após o pull. |
| AMB-03 | Módulos | 29 registros em `ConfiguracaoModulo`, todos com `ativo=true`. | **Pronta** a habilitação registrada; parametrização funcional continua necessária. |
| AMB-04 | Identidade institucional | `Institution=0` e `ConfiguracaoInstancia=0`. | **Pendente** cadastrar instituição/instância e conferir identidade pública. |
| AMB-05 | Cadastros e operação | Zero nas 42 tabelas listadas abaixo. | **Pendente** preparar massa consistente e vínculos intermodulares. |
| AMB-06 | Conectores cadastrados | `IntegrationConnection=0`; `IntegrationRun=0`. | **Pendente** configurar e executar os conectores exigidos pela POC. |
| AMB-07 | Firebase cliente/Admin | As chaves e credenciais principais verificadas estão presentes. | **Parcial**: login, projeto remoto, recuperação e vínculo local não foram exercitados. |
| AMB-08 | Vercel Blob | `BLOB_READ_WRITE_TOKEN` presente. | **Parcial**: upload/download e autorização não foram exercitados. |
| AMB-09 | Domínio institucional | `CELERIFLOW_INSTANCE_ID` presente; `CELERIFLOW_PUBLIC_BASE_URL` e `NEXT_PUBLIC_PORTAL_URL` ausentes. | **Parcial**: há fallbacks no código; conferir URLs finais, canonical e validações. |
| AMB-10 | Rotinas agendadas | Seis crons declarados em `vercel.json`; `CRON_SECRET` e `PROTOCOLS_CRON_SECRET` ausentes no `.env`. | **Pendente** configuração/autenticação e comprovação de execução neste ambiente. |
| AMB-11 | WebServices tributários | `NFSE_WEBSERVICE_TOKEN` e `DESIF_WEBSERVICE_TOKEN` ausentes. | **Pendente** habilitação dos endpoints de recebimento protegidos. |
| AMB-12 | Banco sandbox | Variáveis `BANK_SANDBOX_*`, `BANK_SYNC_SECRET` e `SIMULADOR_WEBHOOK_SECRET` verificadas estão ausentes; há URL padrão do banco virtual no código. | **Parcial** o cliente; **pendente** conexão cadastrada, autenticação e retorno. |
| AMB-13 | Certificados A1 | `DigitalCertificate=0`; nenhuma variável com sufixo `_PRIVATE_KEY_PEM` encontrada no `.env`. | **Pendente** disponibilizar certificado/cadeia e segredo para o fluxo A1. |
| AMB-14 | E-mail de restrições SST | Ausentes `SST_RESTRICTION_EMAIL_PROVIDER`, `RESEND_API_KEY` e `SST_RESTRICTION_EMAIL_FROM`. | **Pendente** configurar o provedor Resend e comprovar aceitação. |
| AMB-15 | IA/OCR de pranchas | Ausentes as seis variáveis verificadas `CONSTRUCTION_AI_*`/`CONSTRUCTION_OCR_*`; default do código é `DEMO_RULES`. | **Parcial** extração determinística; **pendente** configuração de IA/OCR externos. |
| AMB-16 | Serviços digitais e transparência | Zero em `PortalServiceConfiguration`, `TransparencyPublication`, `TransparencyNativeBinding`, `TransparencyCriterion` e `TransparencyCriterionEvidence`. | **Pendente** configurar/publicar serviços, fontes, documentos e critérios. |

**Tabelas amostradas em AMB-05, todas com contagem zero:** `Institution`, `ConfiguracaoInstancia`, `Person`, `Company`, `Employee`, `Process`, `Document`, `DocumentVersion`, `DigitalCertificate`, `Ticket`, `Ombudsman`, `FinancialYear`, `PlanningInstrument`, `BudgetAppropriation`, `Commitment`, `Settlement`, `Payment`, `Revenue`, `BankAccount`, `PurchaseRequest`, `PurchaseProcess`, `Bidding`, `Contract`, `Payroll`, `Asset`, `Material`, `School`, `Student`, `Patient`, `HealthUnit`, `SocialFamily`, `SstEsocialConfiguration`, `EnvironmentalLicense`, `EnvLicense`, `SanConsumerUnit`, `CulturaAgente`, `CamLegislatura`, `TransparencyPublication`, `TransparencyNativeBinding`, `TransparencyCriterion`, `TransparencyCriterionEvidence`, `PortalServiceConfiguration`.

Essa amostra não afirma que todas as tabelas estejam vazias; a referência atual possui 973 modelos Prisma. Há, por exemplo, registros de ativação de módulos na consulta anterior.

## 3. Visão consolidada dos módulos

**Habilitado** abaixo significa registro ativo encontrado no banco. O status resume a implementação do conjunto, preservando o detalhamento da seção 4. A base de demonstração permanece pendente conforme AMB-04/05/16.

| Código/módulo | Habilitado | Status do conjunto | Capacidade principal e limite para POC |
|---|---|---|---|
| ADMINISTRACAO | Sim | **Pronta** | Estrutura institucional, servidores básicos, cargos, calendário e demandas. |
| CADASTROS | Sim | **Pronta** | Cadastros mestres, identificação, vínculos e unificação controlada de pessoas. |
| CONFIGURACOES | Sim | **Pronta** | Usuários, perfis, módulos, instância, workflows, relatórios e inventário de certificados. |
| AUDITORIA | Sim | **Pronta** | Consulta de evidências e filtros; cobertura não deve ser presumida para toda operação legada. |
| PROCESSOS / Protocolos | Sim | **Pronta** | Abertura, tramitação, workflow versionado, documentos, assinaturas e acompanhamento. |
| DOCUMENTOS / GED | Sim | **Parcial** | GED e assinatura interna implementados; A1 depende de provisionamento e A3 não foi localizado. |
| ATENDIMENTO | Sim | **Pronta** | Chamados municipais, fila, encaminhamento, Ouvidoria e relatórios. |
| TRANSPARENCIA / portal institucional | Sim | **Parcial** | Consultas, CMS, fontes, publicações e e-SIC; conteúdo/configuração e aderência PNTP dependem de validação. |
| PLANEJAMENTO | Sim | **Parcial** | PPA/LDO/LOA, execução e publicação; conferir leiautes e regras do ente. |
| FINANCEIRO | Sim | **Parcial** | Cadeia orçamentária/contábil extensa; banco real e remessas oficiais têm limites próprios. |
| COMPRAS | Sim | **Parcial** | Planejamento, compras, licitação, contratos e recebimentos; remessa oficial PNCP/TCE não demonstrada. |
| RH | Sim | **Parcial** | Vínculos, folha, direitos, ponto, diárias e integrações internas; transmissão real eSocial pendente. |
| PORTAL_SERVIDOR | Sim | **Pronta** | Autosserviço funcional, documentos e requerimentos sobre fontes autorizadas/publicadas. |
| SST | Sim | **Parcial** | Saúde ocupacional e prevenção extensas; envio eSocial sem provedor real instalado. |
| PATRIMONIO | Sim | **Pronta** | Almoxarifado, patrimônio, inventário, custódia, valoração e pontes contábeis. |
| FROTAS | Sim | **Parcial** | Gestão operacional, portal de prestador e catálogo amplo de modelos FIPE; pagamento de débito pela interface exige correção e telemetria externa não foi comprovada. |
| EDUCACAO | Sim | **Parcial** | Gestão acadêmica, portais e recursos escolares; Educacenso é preparação simplificada. |
| SAUDE | Sim | **Parcial** | Jornada clínica, farmácia, laboratório, regulação, vacinação e produção; aceite nacional não comprovado. |
| PORTAL_PACIENTE | Sim | **Pronta** | Agenda, dados próprios, documentos liberados e acompanhamento de saúde. |
| SOCIAL | Sim | **Parcial** | Atendimento e prontuário municipal; integração oficial CadÚnico/SUAS não localizada. |
| TRIBUTACAO | Sim | **Parcial** | Cadastro, motor fiscal, ITBI, ISS/NFS-e, dívida, fiscalização e inteligência; serviços oficiais externos limitados. |
| CEMITERIOS | Sim | **Pronta** | Estrutura, ocupação, processos, transferências e taxas integradas. |
| OBRAS | Sim | **Parcial** | Obras públicas e construção civil; viabilidade automática e exportação têm escopo demonstrativo. |
| MEIO_AMBIENTE | Sim | **Parcial** | Cadastros, fiscalização e licenças; validação pública da licença gerada precisa ser concluída. |
| SANEAMENTO | Sim | **Parcial** | Unidades, leituras, OS e qualidade; faturamento possui modelos distintos e cobrança demonstrativa. |
| CULTURA | Sim | **Parcial** | Agentes, espaços, eventos, reservas e registros de fomento/esporte; não equivale a plataforma nacional integrada. |
| CAMARA | Sim | **Parcial** | Cadastros legislativos e planejamento; plenário/votação eletrônica completa não comprovados. |
| SEGURANCA | Sim | **Parcial** | Registros de guarda, ocorrências, trânsito e mobilidade; integrações oficiais não localizadas. |
| SUPORTE_TECNICO | Sim | **Pendente** | Tela informativa/roadmap, sem central operacional persistente. |
| Controle Interno (`/controle-interno`) | Sem registro próprio na consulta | **Pronta** | Funcionalidade implementada em `src/lib/c7` e rotas próprias; conferir concessão de acesso na implantação. |
| Iluminação Pública (`ILUMINACAO_PUBLICA`) | Registro não encontrado | **Parcial** | Rotas próprias reutilizam Obras; conferir ativação e permissões específicas. |
| Portal do Cidadão / serviços digitais | Sem registro próprio na consulta | **Pronta** | Catálogo, solicitações e executores internos; nenhum serviço configurado na base consultada. |
| Indicadores / Notificações | Transversais | **Pronta** | Painéis e notificações internas; não equivalem a BI genérico ou mensageria externa. |

## 4. Matriz funcional detalhada

Cada linha descreve um **recorte comparável**. As referências `E01` a `E33` apontam para caminhos reais na seção 9. O campo “Conferir na POC” é o critério de demonstração que deve ser relacionado ao requisito do edital/checklist.

### 4.1 Administração, cadastros, configuração e auditoria

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| ADM-01 | Instituição, secretarias, departamentos e unidades | Pronta | E01/E02: cadastros e relacionamentos organizacionais. | Cadastrar hierarquia e reutilizá-la em outro módulo. |
| ADM-02 | Cargos e servidores básicos | Pronta | E02: cargo, matrícula, lotação e ciclo de ativação. | Refletir vínculo no RH e impedir uso indevido de inativos. |
| ADM-03 | Demandas internas e calendário | Pronta | E02: responsáveis, prazos, situação e eventos institucionais. | Abrir demanda, atribuir e concluir; aplicar calendário. |
| CAD-01 | Pessoas físicas/jurídicas, contatos e endereços | Pronta | E03: modelos centrais e regras de identificação. | Evitar duplicidade e reutilizar a mesma pessoa em setores distintos. |
| CAD-02 | Fornecedores, contribuintes, credores e representantes | Pronta | E01/E03: vínculos PF/PJ e papéis setoriais. | Reaproveitar cadastro em compra, despesa e tributo. |
| CAD-03 | Entidades, famílias, produtos, localidades e centros de custo | Pronta | E03 e rotas `/cadastros/*`. | Manter relações canônicas e pesquisar pelo identificador correto. |
| CAD-04 | Qualidade, reconciliação e mesclagem de PF | Pronta | E03: política, solicitação, ledger e reversão de unificação. | Unificar duplicidade e demonstrar impacto/reversão dos vínculos. |
| CFG-01 | Autenticação Firebase e sessão municipal | Pronta | E04: SDK cliente/Admin, troca de token e sessão. | Login, logout, expiração e bloqueio de usuário sem vínculo. |
| CFG-02 | Perfis e permissões granulares | Pronta | E04: visualizar, criar, alterar, excluir e emitir relatórios; escopos de UG e saúde. | Demonstrar perfis distintos e negativas de acesso no servidor. |
| CFG-03 | Habilitação de módulos e parâmetros da instância | Pronta | E04: ativação, SLA, fuso, retenção e prioridade. | Habilitar/desabilitar e verificar menus e operação. |
| CFG-04 | Configuração de tipos e workflows | Pronta | E05: definições, etapas, publicação e versões. | Publicar nova versão sem alterar o histórico de processos existentes. |
| CFG-05 | Cadastro e execução de conectores | Parcial | E07: configuração, ambientes, histórico, sanitização e políticas de despacho. | Diferenciar cadastro, MOCK, teste de conexão e operação real. |
| AUD-01 | Evidências e consulta de auditoria | Pronta | E04 e `/auditoria`: filtros, paginação e distribuição de eventos. | Localizar ator, evento, objeto e data de uma operação executada. |
| AUD-02 | Auditoria universal com módulo/resultado em todo evento | Parcial | A tela informa que módulo e resultado não são campos das evidências atuais; há trilhas específicas por domínio. | Exigir amostra de cada operação obrigatória, sem extrapolar cobertura. |

### 4.2 Processos, protocolos, GED e assinaturas

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| PRO-01 | Abertura e numeração de processos | Pronta | E05: tipo, assunto, interessado, setor inicial e eventos. `/processos` é alias de `/protocolos`. | Abrir processo e manter numeração e vínculo do interessado. |
| PRO-02 | Tramitação, recebimento, despacho e responsáveis | Pronta | E05: regras de movimentação e histórico. | Tramitar entre setores e comprovar autoria e recebimento. |
| PRO-03 | Workflow genérico versionado com exigências | Pronta | E05: execução por etapa, SLA e documento/assinatura exigidos. | Bloquear avanço sem a documentação obrigatória. |
| PRO-04 | Busca, arquivo, relatórios e acompanhamento externo | Pronta | E05/E08: listagem, acesso cidadão e rotas de consulta. | Pesquisar protocolo e restringir dados de terceiros. |
| PRO-05 | Prazos e alertas de processos | Parcial | E05; endpoint `/api/protocolos/deadline-notifications`; cron não consta dos seis agendamentos de `vercel.json`. | Provar execução periódica, destino e tratamento do alerta. |
| PRO-06 | Cadastro/acompanhamento de processos judiciais | Pronta | E05: `judicial-cases.ts`, página judicial e consulta do Controle Interno. | Vincular dados judiciais ao protocolo e consultar no recorte autorizado. |
| GED-01 | Documentos, pastas, classes e modelos | Pronta | E06: fluxo documental e telas GED/modelos. | Incluir arquivo, classificar e vincular a processo. |
| GED-02 | Versionamento, hash, finalização e bloqueio | Pronta | E06: versões documentais e políticas de ciclo. | Criar nova versão sem substituir a evidência assinada anterior. |
| GED-03 | Assinatura interna e verificação pública | Pronta | E06: reautenticação/evidência interna e `/validar-documento/[code]`. | Assinar versão correta, validar e detectar alteração/cancelamento. |
| GED-04 | Assinatura A1 com certificado e cadeia | Parcial | E06: inventário, validação e assinatura criptográfica de hash; nenhum certificado provisionado no banco. | Provisionar A1 e conferir formato exigido, cadeia, validade e verificação. |
| GED-05 | A3, PAdES embutido e carimbo do tempo, se exigidos | Pendente | Não foi localizada implementação operacional desses recortes; assinatura A1 de hash não comprova tais formatos. | Apresentar artefato e verificador específicos do requisito. |
| GED-06 | Armazenamento e download controlado | Pronta | E04/E06: Vercel Blob e endpoints de arquivos por domínio. | Upload, autorização de download e integridade do arquivo. |

### 4.3 Atendimento, Ouvidoria, portal institucional e serviços ao cidadão

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| ATE-01 | Central de chamados municipais e fila | Pronta | E08: cadastro, setores, responsáveis, interações e estados. | Abrir, encaminhar, responder e concluir chamado. |
| ATE-02 | Ouvidoria, anonimato e divulgação controlada | Pronta | E08: identidade e política de exposição separadas. | Registrar manifestação anônima/identificada e testar perfis. |
| ATE-03 | Anexos e relatórios de atendimento | Pronta | E08 e `/api/atendimento/upload`. | Juntar evidência e emitir relatório do recorte. |
| POR-01 | Notícias, páginas, banners, secretarias, leis e Diário Oficial | Pronta | E09: gestão editorial e páginas públicas. | Publicar/retirar conteúdo e conferir navegação pública. |
| POR-02 | Cadastro/login/recuperação da conta cidadã | Pronta | E04/E10: registro e vínculo de acesso. | Criar conta, recuperar acesso e conferir identidade autorizada. |
| POR-03 | Catálogo digital, busca, favoritos e públicos | Pronta | E10: serviços versionados e publicados; templates começam não publicados. | Configurar serviço e demonstrar descoberta sem usar lista estática. |
| POR-04 | Solicitação, anexos, complementação e resposta | Pronta | E10: processo canônico e documentos vinculados. | Executar pedido inteiro e acompanhar na área autenticada. |
| POR-05 | Executores de guia, NFS-e avulsa e ITBI | Pronta | E10/E15: roteamento para operações tributárias de origem. | Comprovar efeito no cadastro fiscal, sem duplicar crédito ou pagamento. |
| POR-06 | Reserva de espaços e agendamento presencial | Pronta | E10/E27: vagas, recurso, espaço e reserva transacional. | Impedir choque de horários e repetir envio sem duplicar reserva. |
| POR-07 | Solicitação de manutenção e localização | Pronta | E10: pedidos de manutenção; geocodificação reversa externa. | Registrar ocorrência e acompanhar execução no setor. |
| POR-08 | Direitos do titular/LGPD e consentimento | Parcial | E10 e componentes LGPD: canal de pedido, política e consentimento. | Conferir o fluxo municipal de resposta e cada requisito específico de privacidade. |

### 4.4 Transparência e e-SIC

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| TRA-01 | Hub temático, busca, atalhos e apresentação configurável | Pronta | E11: descoberta, sinônimos, seções, destinos e configuração editorial. | Alterar navegação e localizar assunto no portal público. |
| TRA-02 | Consultas financeiras, pessoal, compras e domínios setoriais | Pronta | E11: catálogo de consultas, filtros, detalhes e proveniência; colunas de pessoal e diárias ampliadas na `main`, dependentes da fonte/complementos publicados. | Conferir campos preenchidos e totais de cada consulta exigida, incluindo horário, vínculo, finalidade e retorno de diária. |
| TRA-03 | Fontes nativa, API Ibema, documental e exemplo | Pronta | E11: provedores separados e mensagem explícita de indisponibilidade. | Identificar a origem e provar que dados demonstrativos não substituem a fonte real. |
| TRA-04 | Publicações, anexos, retirada e acesso público validado | Pronta | E11: versões, estados e endpoint que revalida publicação no download. | Rascunho não aparece; arquivo retirado deixa de ser acessível publicamente. |
| TRA-05 | Exportações e conjunto filtrado | Pronta | E11: exportação tabular/documental; limites dependem da fonte e formato. | Comparar arquivo com total filtrado e não apenas página visível. |
| TRA-06 | e-SIC, recursos, prorrogação e satisfação | Pronta | E11/E08: solicitação e vínculo a atendimento/processo. | Abrir pedido, responder, recorrer e registrar avaliação. |
| TRA-07 | Medicamentos, fila da saúde e fila de creches | Pronta | E11: consultas setoriais com agregação/códigos anônimos. | Publicar fonte autorizada sem expor paciente ou criança. |
| TRA-08 | Avaliação de páginas e estatísticas | Pronta | E11: endpoint, agregados, retenção e manutenção. | Enviar avaliação e verificar persistência e estatística pública. |
| TRA-09 | Busca no conteúdo integral de PDF/OCR no portal | Pendente | A operação documentada busca metadados; não extrai/pesquisa o texto integral dos PDFs. | Exigir busca por termo interno ao arquivo caso o checklist a solicite. |
| TRA-10 | Matriz PNTP e registro de evidências | Parcial | E11: critérios/evidências e tela de gestão; tabelas vazias na base examinada. | Carregar matriz aplicável e validar requisito por requisito. |
| TRA-11 | Certificação PNTP/acessibilidade integral | Pendente | Há documentação de verificações anteriores, sem equivalência a certificação integral. | Relacionar critérios do ciclo e evidências de avaliação pertinentes. |
| TRA-12 | Consulta de legislação municipal por categoria e busca | Pronta | E11 e `/portal/leis-municipais`: consulta `LegalText` municipal por tipo, número, ementa e órgão, limitada aos primeiros 100 resultados. | Preparar atos e conferir filtro, ordenação e eventual requisito de paginação/texto integral. |
| TRA-13 | Limitação de consultas e exportações públicas por IP | Pronta | E11: API de consultas usa `checkRateLimit`, janela de 60 s e 10 chamadas por chave/IP; responde 429 e `Retry-After`. Contador em memória por processo. | Demonstrar bloqueio/retomada e, se exigido, controle distribuído entre instâncias; não equivale a CAPTCHA ou proteção global persistente. |
| TRA-14 | Apoio em Libras no portal | Parcial | `PortalShell.tsx` e `/portal/acessibilidade`: atalho abre o site do VLibras em nova aba; não traduz o conteúdo da página dentro do portal. | Conferir se o requisito aceita atalho ou exige tradução/widget integrado. |

### 4.5 Planejamento e orçamento, Executivo e Legislativo

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| PLA-01 | PPA, LDO e LOA por entidade/exercício | Pronta | E12: instrumentos encadeados, linhas, programas e ações. | Construir cadeia e conferir classificação e valores. |
| PLA-02 | Catálogos, fontes, naturezas e códigos reduzidos | Pronta | E12: adoção, validação e versões de referência. | Adotar catálogo e preservar classificação histórica. |
| PLA-03 | Projeções, memórias, renúncia e regras fiscais | Pronta | E12: cálculos e parâmetros com referência normativa. | Reproduzir cálculo com dados e fórmula conferíveis. |
| PLA-04 | Audiências e demandas comunitárias | Pronta | E12: eventos, atas, documentos, demanda e parecer; tela de audiências lista arquivos e oferece upload GED com audiência preenchida, conforme permissões e classe ativa. | Registrar demanda/destinação e anexar/baixar ata da audiência correta, preservando versão e hash GED. |
| PLA-05 | Emendas legislativas e ciclo legal | Pronta | E12: emendas, decisões, bloqueios, versões e atos. | Aplicar emenda e verificar reflexo no instrumento. |
| PLA-06 | Créditos, cotas e programação financeira | Pronta | E12/E13: integração à dotação e controle de disponibilidade. | Liberar crédito e consumir cota no empenho. |
| PLA-07 | Execução física/financeira, importação e virada anual | Pronta | E12: movimentos, execução, versões e transporte. | Reconciliar realizado com origem e transportar sem duplicação. |
| PLA-08 | Relatórios e publicação | Parcial | E12: snapshots, arquivos, publicação e avisos de leiaute não homologado. | Comparar cada anexo/leiaute exigido com o arquivo emitido. |
| PLA-09 | Planejamento da Câmara | Pronta | E12 e `/camara/planejamento/*`: reutilização do domínio com jurisdição legislativa. | Separar Executivo e Legislativo e conferir vínculos da entidade. |

### 4.6 Financeiro, tesouraria, contabilidade e custos

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| FIN-01 | Exercício, dotação, reserva e solicitação de despesa | Pronta | E13: cadastros, disponibilidade e autorização. | Bloquear execução acima do saldo e respeitar UG/exercício. |
| FIN-02 | Empenho, liquidação e pagamento | Pronta | E13: estágios separados, documentos e trilhas de origem. | Executar cadeia completa e conferir saldos bruto/líquido. |
| FIN-03 | Retenções e recolhimentos | Pronta | E13: regras, obrigações e quitação de retenções. | Conferir deduções sem tratá-las como pagamento ao fornecedor. |
| FIN-04 | Receita, arrecadação, estorno e redistribuição por fonte | Pronta | E13: estágios, fontes e movimentos contábeis. | Confirmar arrecadação e estornar com rastreabilidade. |
| FIN-05 | Contas bancárias, fontes e transferências | Pronta | E13: saldo/abertura e múltiplas fontes por conta. | Transferir e conferir disponibilidade por fonte. |
| FIN-06 | Importação de extrato e conciliação | Pronta | E13: OFX/OFC/CSV, alocações, estorno e reabertura. | Conciliar valores parciais/múltiplos sem dupla apropriação. |
| FIN-07 | Download, ordens e retorno do banco virtual | Parcial | E13/E07: cliente SANDBOX, webhook e interações; nenhuma conexão cadastrada. | Demonstrar ida/retorno e baixa apenas após confirmação. |
| FIN-08 | Rendimentos, aplicações e receitas constitucionais | Pronta | E13: motores de cálculo/classificação e transmissão interna. | Conciliar FPM/FUNDEB/ICMS e rendimento à origem bancária. |
| FIN-09 | Lançamentos contábeis e eventos compostos | Pronta | E13: débitos/créditos, classificações congeladas e regras. | Conferir partidas, contrapartidas e origem do lançamento. |
| FIN-10 | Fechamento/reabertura mensal | Pronta | E13: solicitação, autorização e bloqueio de período. | Impedir alteração em competência fechada e reabrir formalmente. |
| FIN-11 | Encerramento/abertura anual e transporte | Pronta | E13: etapas anuais, resultado, orçamento, notas e programações. | Fechar, transportar e desfazer etapas preservando consistência. |
| FIN-12 | Restos a pagar processados/não processados | Pronta | E13: inscrição, liquidação, pagamento, cancelamento e transporte. | Preservar exercício de origem e não duplicar saldo no destino. |
| FIN-13 | Contabilidade de custos | Pronta | E13: objetos, itens, regras, rateio, correção e origens de folha/estoque/liquidação. | Rastrear custo à origem e distinguir custo de simples gasto pago. |
| FIN-14 | Índices constitucionais e posição fiscal de pessoal | Pronta | E13: definições, memória e relatórios específicos. | Reproduzir denominador, numerador e exclusões do índice. |
| FIN-15 | Relatórios legais, balanços e exportações | Parcial | E13: definição e renderização; aderência de cada anexo depende do leiaute requerido. | Conferir estrutura, totais, período e regras do demonstrativo. |
| FIN-16 | MSC em arquivo ZIP/CSV | Parcial | E13: exportador implementado para **2026**, períodos 01–13 e agregação sem eliminação recíproca; registra `NOT_TRANSMITTED`. | Validar arquivo, perímetro, fechamento e eventuais exigências de outros exercícios/consolidação. |
| FIN-17 | Transmissão oficial SICONFI/TCE e bancos comerciais | Pendente | Catálogo geral restrito a MOCK; cliente bancário aceita somente o banco virtual. | Comprovar autenticação, protocolo e aceite no destino correto. |

### 4.7 Compras, licitações, contratos e convênios

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| COM-01 | Catálogo compartilhado e planejamento de contratação | Pronta | E14: materiais/equipamentos/serviços e planejamento de compras. | Reutilizar item canônico sem recadastro inconsistente. |
| COM-02 | Solicitações, aprovação e orçamento | Pronta | E14: política de origem, dotação e aprovação. | Solicitar por setor, aprovar e manter vínculo orçamentário. |
| COM-03 | Pesquisa de preços e resposta de fornecedor | Pronta | E14: cotações, portal por chave e notificações internas. | Receber proposta e apurar a pesquisa; conferir segredo do canal quando aplicável. |
| COM-04 | Processo de compra e contratação direta | Pronta | E14: origem, documentos, modalidade e ciclo. | Demonstrar processo a partir de requisição/planejamento. |
| COM-05 | Licitação, participantes, lotes e resultados | Pronta | E14: integridade de numeração e workflow licitatório. | Registrar fases, decisões e resultado por lote. |
| COM-06 | Pregão eletrônico público em tempo real | Pendente | Os registros/portal licitatório encontrados não comprovam disputa de lances ao vivo. | Exigir sessão real, lances, ranking e tratamento de concorrência se previstos. |
| COM-07 | Contratos, fiscais, gestores e aditivos | Pronta | E14: ciclo contratual e regras de vigência/alteração. | Aditar e comprovar valor atualizado e histórico. |
| COM-08 | Convênios, termos e prestação de contas interna | Pronta | E01/E14: instrumentos, partes e relatórios. | Registrar execução e prestação sem confundir com aceite em plataforma federal. |
| COM-09 | Recebimento, ateste e integração financeira/patrimonial | Pronta | E14/E17: recebimento e pontes com despesa, estoque e bens. | Receber uma vez e comprovar todos os efeitos autorizados. |
| COM-10 | Pacotes e fila de exportação PNCP/TCE | Parcial | E07/E14: snapshots, validações e histórico de preparação. | Conferir se o pacote atende ao leiaute e distinguir registro do operador de recibo externo. |

### 4.8 RH e folha

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| RH-01 | Servidores, contratos e evolução do vínculo | Pronta | E16: histórico contratual, admissão, movimentações e encerramento. | Demonstrar múltiplos vínculos e vigências. |
| RH-02 | Quadro de cargos, plano e histórico legal | Pronta | E16: vagas, atos e evidência documental versionada. | Reconciliar vagas criadas/ocupadas e documento legal. |
| RH-03 | Concursos e recrutamento | Pronta | E16: cadastro, inscrição e decisões. | Publicar edital, inscrever e processar decisão no recorte exigido. |
| RH-04 | Folha e motor de cálculo | Pronta | E16: rubricas, configurações, processamento, demonstrativos e fechamento. | Reproduzir memória com proventos, descontos e base. |
| RH-05 | IR, previdência, pensões, dependentes e benefícios | Pronta | E16: cálculo e configuração de elegibilidade. | Conferir tabelas/vigências e casos limites do checklist. |
| RH-06 | Folhas especiais, médias e proporcionalidade | Pronta | E16: simulação, finalidade, médias e rateio por período. | Validar cenários de férias/13º/rescisão conforme regra municipal. |
| RH-07 | Férias, licenças, direitos e tempo de serviço | Pronta | E16: aquisições, múltiplos períodos, conflitos e concessões. | Calcular direito e impedir concessão incompatível. |
| RH-08 | Ponto, banco de horas e reflexos na folha | Pronta | E16: reconciliação, expiração, transferência e pagamento de saldo. | Demonstrar apuração e vínculo à folha, sem pagamento duplicado. |
| RH-09 | Consignações, margem e convenentes | Pronta | E16/E18: acordos, parcelas, autorizações e margem. | Reservar margem e lançar parcela autorizada. |
| RH-10 | Diárias, adiantamentos e prestação/restituição | Pronta | E16/E13: autorização, processo, financeiro e devolução. | Demonstrar pagamento e devolução, inclusive de exercício anterior. |
| RH-11 | Atos, pasta funcional e emissões | Pronta | E16: documentos e relatórios funcionais. | Emitir a partir de fonte oficial e manter rastreabilidade. |
| RH-12 | Recadastramento e requerimentos | Pronta | E16/E18: validação e atualização controlada. | Propor alteração no portal e aplicar após conferência. |
| RH-13 | Integração folha → financeiro/contabilidade/custos | Pronta | E16/E13: pontes, provisões e alocação de pagamento. | Conciliar folha fechada com despesa e origem de custo. |
| RH-14 | Preparação de obrigações externas | Parcial | E16: configuração/exportação/histórico; não há transmissão disponível no resolvedor de prontidão RH. | Comparar leiaute, XML/XSD e dados antes de considerar obrigação entregue. |
| RH-15 | eSocial RH real | Pendente | `external-configuration.ts`: `transmissionAvailable: false`; cliente XML/XSD/XMLDSig/mTLS/worker pendentes. | Exigir envio, consulta e recibo oficial. |

### 4.9 Portal do Servidor

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| SER-01 | Login próprio e isolamento por vínculo funcional | Pronta | E18/E04: sessão, vínculo, retorno e autorização no servidor. | Acessar como servidor sem conceder acesso administrativo amplo. |
| SER-02 | Folha, demonstrativos e documentos publicados | Pronta | E18: publicação explícita e manifesto de fontes. | Mostrar apenas documento próprio e fonte ainda vigente. |
| SER-03 | Ficha funcional, férias, licença-prêmio e ponto | Pronta | E18: consulta às fontes RH e totais. | Comparar com a origem e registrar solicitação/registro permitido. |
| SER-04 | Protocolos, serviços e solicitações de RH | Pronta | E18/E05: requerimentos funcionais, anexos e acompanhamento. | Protocolar e concluir no setor, com retorno ao servidor. |
| SER-05 | Benefícios, margem, consignações e crédito | Pronta | E18/E16: fontes e serviços autorizados. | Conferir dados próprios e condições da solicitação. |
| SER-06 | Capacitação, avaliações, recadastramento e emissões | Pronta | E18: páginas e serviços correspondentes. | Emitir comprovante/resultado e conferir a fonte publicada. |
| SER-07 | Autosserviço SST | Pronta | E18/E19: agenda, CAT própria, CIPA e planos. | Demonstrar limites de acesso do servidor ao próprio dado. |

### 4.10 SST — segurança e medicina do trabalho

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| SST-01 | Profissionais, vínculos e acesso clínico por disciplina/UG | Pronta | E19: permissões clínicas, medicina e responsabilidades técnicas. | Separar gestor administrativo e profissional clínico. |
| SST-02 | Agenda, jornadas, juntas e agendamentos | Pronta | E19: disponibilidade, programação e registros. | Marcar, atender e verificar choque de agenda. |
| SST-03 | Prontuário, anamnese, exames e ASO | Pronta | E19: fluxo, documentos, assinatura e histórico. | Emitir ASO com base nos exames e restringir prontuário. |
| SST-04 | Atestados, perícias, restrições e afastamentos | Pronta | E19: serviços funcionais, efeito em licença/folha e restrições. | Aplicar o efeito funcional com origem clínica preservada. |
| SST-05 | Programas, GHE, exposição e PPP | Pronta | E19: revisões, snapshots e fechamento. | Reproduzir exposição por período e gerar documento correto. |
| SST-06 | Acidentes e CAT | Pronta | E19: registro, evidência, leiaute documental e impressão. | Registrar acidente e conferir documento; transmissão é outro requisito. |
| SST-07 | EPI/equipamentos, necessidades e entregas | Pronta | E19: custódia/entrega e comprovante. | Entregar, comprovar recebimento e consultar histórico. |
| SST-08 | Prevenção, CIPA, eleição e questionários | Pronta | E19: programas preventivos, eleitores, candidaturas e votos. | Demonstrar elegibilidade, voto e apuração conforme regra exigida. |
| SST-09 | Planos/benefícios e integração funcional/fiscal | Pronta | E19/E16: benefícios e lançamentos com origem controlada. | Conferir efeito em folha e relatório. |
| SST-10 | Expiração de restrição e alerta por e-mail | Parcial | E19: cron e provedor real Resend; variáveis locais ausentes. | Expirar restrição e obter recibo de aceitação do provedor. |
| SST-11 | Preparação de eventos eSocial SST | Pronta | E19: eventos de origem, versão/hash, pendências e configuração por UG. | Preparar evento com fonte íntegra e identificar dados faltantes. |
| SST-12 | Transmissão real eSocial SST | Pendente | `esocial-service.ts`: não há provedor REAL instalado; envio bloqueado sem adaptador XMLDSig/XSD/mTLS. | Transmitir/consultar e comprovar recibo oficial do evento. |

### 4.11 Almoxarifado e patrimônio

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| PAT-01 | Materiais, unidades, subclasses e almoxarifados | Pronta | E17: catálogos e regras de unidade/valoração. | Cadastrar material e reutilizar em compra e estoque. |
| PAT-02 | Entrada, saída, transferência, devolução e estorno | Pronta | E17: serviço de estoque e rastreabilidade. | Conferir saldo e valor após movimentos e reversão. |
| PAT-03 | Requisição, aprovação e entrega | Pronta | E17: workflow por setor/requisitante. | Separar aprovação e entrega e impedir excesso de saldo. |
| PAT-04 | Bens, tombamento, aquisição e responsáveis | Pronta | E17: aquisição por recebimento e vínculo de origem. | Transformar recebimento em bem sem duplicar aquisição. |
| PAT-05 | Inventário, transferência, custódia e manutenção | Pronta | E17: serviços e páginas de ciclo de vida. | Apurar inventário e formalizar mudança de responsável. |
| PAT-06 | Valoração, depreciação/reavaliação e contabilidade | Pronta | E17/E13: valoração e reversão contábil. | Conciliar movimento patrimonial, lançamento e custo. |

### 4.12 Frotas e transporte

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| FRO-01 | Veículos/equipamentos, documentos e vínculos patrimoniais | Pronta | E20: cadastro, controle e acesso por setor; ficha exibe código/tombamento e acesso ao bem de origem. | Vincular veículo ao bem, abrir o registro patrimonial e restringir operação por unidade. |
| FRO-02 | Uso, deslocamentos, motoristas e leituras | Pronta | E20: movimento, portal do motorista e políticas. | Abrir/encerrar uso e preservar odômetro/horímetro. |
| FRO-03 | Abastecimento, autorização e prestador externo | Pronta | E20: token, CNPJ, limites, confirmação e idempotência. | Prestador confirmar uma única execução autorizada. |
| FRO-04 | Manutenção, oficina, peças e ocorrências | Pronta | E20: autorização, relatório da oficina e conferência. | Aprovar serviço, receber execução e conferir custos. |
| FRO-05 | Multas/infrações e catálogo CTB | Pronta | E20/E32: registros e importação de referências com fonte/hash. | Conferir enquadramento e vigência do catálogo usado. |
| FRO-06 | Indicadores e relatórios de gastos | Pronta | E20: valores conhecidos, faltantes e completude declarada. | Distinguir gasto operacional de custo contábil apropriado. |
| FRO-07 | FIPE com anos/preços e avaliação de toda a frota | Parcial | E32: catálogo atual abrange 7.386 modelos de carros/108 marcas, mas não armazena anos/modelo específicos nem preços de avaliação; motos/caminhões não são cobertos pelo coletor `/carros`. | Provar anos, valores por competência e categorias exigidas; catálogo de modelos não basta para avaliação monetária. |
| FRO-08 | Rastreamento GPS/telemetria de fornecedor | Pendente | Eventos/localização não comprovam conexão com equipamento ou plataforma de rastreamento. | Mostrar sinal recebido de dispositivo e histórico real, se exigido. |
| FRO-09 | Débitos da frota, alertas de vencimento, parcelas e estorno | Parcial | E20: cadastro, configuração por repartição e serviço de pagamento/estorno com `FleetExpense` existem. Porém `payDebt` no formulário envia `evidenceVersionId`; o schema estrito aceita `proofVersionId`, bloqueando a submissão desse formulário. | Corrigir o contrato do comprovante e demonstrar parcela, saldo, limite de valor, evidência GED e estorno; alerta atual é classificação na consulta, sem envio externo comprovado. |
| FRO-10 | Catálogo versionado de marcas/modelos de carros FIPE | Pronta | E20/E32: coleta por marca, JSON com fontes/hashes, importador administrativo e vínculo validado à ficha da unidade. Snapshot contém 7.386 códigos únicos e declara `complete: true`. | Importar a versão ampla e pesquisar/vincular modelos de várias marcas; conferir a fonte efetivamente publicada no banco. |

### 4.13 Educação

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| EDU-01 | Escolas, estudantes, professores e períodos | Pronta | E21: cadastros e vínculos acadêmicos. | Criar escola/turma/aluno com identidade central. |
| EDU-02 | Matrícula, movimentação, matriz e horários | Pronta | E21: currículo, turma, vínculo docente e validação de intervalo. | Matricular, transferir e validar compatibilidade de horários. |
| EDU-03 | Diário, presença, avaliação, notas e publicação | Pronta | E21: actions do professor e situação acadêmica. | Publicar resultado e conferir visibilidade no responsável. |
| EDU-04 | Declaração, boletim e histórico | Pronta | E21: geração PDF com fontes acadêmicas e registro de emissão. | Conferir período, notas e faltas do aluno. |
| EDU-05 | Pré-matrícula, classificação e lista de espera | Parcial | E21: ranking e alocação implementados; alocação declara matrícula definitiva pendente de confirmação. | Executar a confirmação final exigida pelo requisito. |
| EDU-06 | Portal do responsável e atividades | Pronta | E21: vínculo acadêmico por usuário, notas publicadas e entrega. | Acessar somente alunos autorizados e devolver atividade. |
| EDU-07 | Biblioteca, empréstimos e reservas | Pronta | E21: títulos, exemplares, retirada, renovação e devolução. | Controlar disponibilidade do exemplar no fluxo completo. |
| EDU-08 | Merenda, recursos escolares e plano de aplicação | Parcial | E21: registros próprios e referências a material/conta bancária; efeito no estoque/financeiro canônico não deve ser presumido. | Demonstrar baixa contábil/estoque se exigida como integração automática. |
| EDU-09 | Transporte escolar, rotas, paradas e viagens | Pronta | E21: vínculo a frota, passageiros e eventos. | Conferir aluno/rota/veículo e execução de viagem. |
| EDU-10 | Catálogo pedagógico interativo e suporte educacional | Pronta | E21: liberação de atividade, tentativa, pontuação e pedido de suporte. | Liberar por turma/aluno e registrar resultado. |
| EDU-11 | Importação/exportação Educacenso oficial | Parcial | E21: formato simplificado; atualiza escolas/estudantes; profissionais/turmas geram críticas de vínculo; exporta texto para conferência. | Validar arquivo no leiaute oficial do ciclo; não há envio INEP comprovado. |

### 4.14 Saúde e Portal do Paciente

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| SAU-01 | Unidades, profissionais, especialidades e rede | Pronta | E22: administração, mantenedora, serviços, vínculos e cobertura. | Configurar rede e recorte de acesso por unidade. |
| SAU-02 | Paciente, identidade, endereço, unificação e histórico | Pronta | E22: cadastro canônico e timeline clínica. | Reconciliar duplicidade e preservar os atendimentos. |
| SAU-03 | Agenda, vagas, bloqueios e lista de espera | Pronta | E22: slots, remanejamento, grupos e agenda regulada. | Marcar sem exceder vaga e converter espera. |
| SAU-04 | Acolhimento, triagem e painel de chamada | Pronta | E22: recepção, espontâneo, risco e chamada. | Executar chegada → triagem → chamada → atendimento. |
| SAU-05 | Prontuário, atendimento e documentos clínicos | Pronta | E22: registro clínico, complementos e documento GED. | Finalizar atendimento e conferir documento/assinatura. |
| SAU-06 | Prescrição, linhas de cuidado e acompanhamento | Pronta | E22: programas, planos, registros e evolução. | Acompanhar paciente entre etapas e revisar prescrição. |
| SAU-07 | Regulação, cotas, guias e prestadores | Pronta | E22: solicitações, prioridades, autorização e execução. | Encaminhar, autorizar e receber execução do prestador. |
| SAU-08 | Urgência, observação, salas e leitos | Pronta | E22: pronto atendimento e movimentação de leito. | Admitir, evoluir e dar alta sem dupla ocupação. |
| SAU-09 | Laboratório: pedido, amostra, resultado e laudo | Pronta | E22: coleta, recoleta, revisão, liberação e publicação. | Impedir acesso a laudo ainda não liberado. |
| SAU-10 | Dispositivo assistencial A15/HL7/ZPL | Parcial | E07/E22: mensagens e despacho HTTP controlado; sem conexão cadastrada. | Interoperar com equipamento/destino real exigido. |
| SAU-11 | Farmácia: catálogo, lote, validade e movimentação | Pronta | E22/E17: catálogo, saldo, bloqueios e transferências. | Rastrear lote desde entrada até saída. |
| SAU-12 | NF-e de entrada farmacêutica | Pronta | E22: leitura/importação de conteúdo XML e conferência. | Importar XML real e conferir itens; captura SEFAZ é requisito separado. |
| SAU-13 | Dispensação, recebedor e correção/cancelamento | Pronta | E22: origem da receita, baixa e histórico. | Dispensar e estornar sem saldo ou atendimento duplicado. |
| SAU-14 | Inventário, requisições e kits | Pronta | E22: contagem, fechamento, entrega e devolução. | Conciliar inventário e entrega ao destinatário. |
| SAU-15 | Farmácia judicial | Pronta | E22: advogado, processo, renovação, dispensação e extrato. | Controlar vigência e documento de concessão. |
| SAU-16 | Vacinação, frascos, calendário e carteira | Pronta | E22: doses, lotes, perdas, campanhas, busca ativa e documento. | Conciliar doses com frasco/estoque e emitir carteira. |
| SAU-17 | ESAVI e condutas | Pronta | E22: registro e acompanhamento de evento adverso. | Relacionar evento à vacinação e registrar providência. |
| SAU-18 | Território, famílias, visitas e atenção primária | Pronta | E22: área/microárea, domicílio, mudanças, visita e cuidado domiciliar. | Reutilizar pessoa/família e manter histórico territorial. |
| SAU-19 | Vigilância e licenciamento sanitário | Pronta | E22: estabelecimento, denúncia, inspeção e licença. | Encerrar inspeção e emitir licença vinculada. |
| SAU-20 | TFD: pedido, laudo, benefício, viagem e passageiro | Pronta | E22: autorização, transporte, embarque e documento de viagem. | Executar TFD com vaga e veículo/benefício autorizados. |
| SAU-21 | Produção, competência, preços e críticas | Pronta | E22: captura de fatos, prévia, fechamento e correção. | Reconciliar produção com atendimento e tabela vigente. |
| SAU-22 | AIH/APAC/RAAS e arquivos de faturamento | Parcial | E22: laudos, autorização, geração e processamento local; aceite de sistema nacional não comprovado. | Validar no aplicativo oficial e obter retorno pertinente. |
| SAU-23 | Fichas e-SUS/SISAB e lotes | Parcial | E22: geração/validação local; `ACEITO` do serviço é resultado local, não protocolo do Ministério. | Distinguir crítica interna de recebimento nacional. |
| SAU-24 | Remessas de acompanhamento/receptores internos | Pronta | E22: contrato versionado, IN_PROCESS, correlação, recibos e reprocessamento. | Configurar receptor e conferir aceite/rejeição por origem. |
| SAU-25 | Indicadores e relatórios administrativos/assistenciais | Pronta | E22: catálogos, memória, documentos e relatórios específicos. | Comparar cada indicador com sua população/base. |
| PAC-01 | Agenda própria e confirmação/cancelamento | Pronta | E23: paciente resolvido a partir da sessão. | Operar agenda sem aceitar identidade de terceiro enviada pelo cliente. |
| PAC-02 | Vacinas, dispensações, documentos e laudos liberados | Pronta | E23: consulta às fontes clínicas e publicação de resultados. | Conferir visibilidade própria e autorização do download. |
| PAC-03 | Dados de contato e manifestação do paciente | Pronta | E23 e rotas do portal: alteração restrita e atendimento. | Atualizar contato sem alterar identidade clínica indevidamente. |

### 4.15 Assistência Social

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| SOC-01 | Pessoas, famílias, unidades e profissionais | Pronta | E24: catálogo, perfil social, vínculos e acesso. | Usar a mesma pessoa/família central e restringir unidade. |
| SOC-02 | Atendimento, visita e prontuário | Pronta | E24: histórico de fatos e registros do atendimento. | Consultar evolução e autoria sem duplicar pessoa. |
| SOC-03 | Benefícios, concessão, requisição e entrega | Pronta | E24: controle de entrega e comprovantes. | Comprovar a entrega, além da aprovação/concessão. |
| SOC-04 | Encaminhamentos e modelos documentais | Pronta | E24: encaminhamento, impressão e templates. | Emitir documento e vincular ao prontuário. |
| SOC-05 | Integração oficial CadÚnico/SUAS | Pendente | Cadastro municipal e modelos de referência não demonstram conexão oficial. | Exigir acesso autorizado, intercâmbio e retorno do sistema externo. |

### 4.16 Tributação, arrecadação e inteligência fiscal

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| TRI-01 | Contribuintes, imóveis e cadastro econômico | Pronta | E15/E03: vínculos PF/PJ, perfis e dados cadastrais. | Reutilizar identidade e manter inscrição/UG corretas. |
| TRI-02 | Base territorial, PGV e avaliação imobiliária | Pronta | E15: estrutura, valoração, simulação e cobertura cadastral. | Reproduzir valor venal e lançamento com memória. |
| TRI-03 | Histórico, bloqueios e alteração individual/em lote | Pronta | E15: restrições, motivos e trilha de alterações. | Bloquear edição protegida e auditar mudança em lote. |
| TRI-04 | Atividades econômicas, contadores e eventos/veículos | Pronta | E15: registro, consultas e evolução do cadastro. | Registrar alteração e conferir relações e vigência. |
| TRI-05 | Regras fiscais, calendário e benefícios | Pronta | E15: motor fiscal, parâmetros, descontos condicionais e vigência. | Calcular IPTU/taxa/ISS a partir de regra publicada. |
| TRI-06 | Simulação, lote anual e efetivação | Pronta | E15: simular, enfileirar, processar e cancelar; cron declarado. | Simulação não constitui crédito; efetivação não pode duplicá-lo. |
| TRI-07 | Lançamento, revisão, suspensão e extinção | Pronta | E15: eventos de crédito e contabilização por competência. | Demonstrar saldo e origem antes/depois de cada evento. |
| TRI-08 | DAM parcial/agrupado e opções de parcelamento | Pronta | E15: guias e calendário sem baixa antecipada do débito. | Emitir guia sem marcar pagamento automaticamente. |
| TRI-09 | Retorno, conciliação e ponte de receita/tesouraria | Pronta | E15/E13: pagamento confirmado e mapeamento fiscal-financeiro. | Confirmar retorno e reconciliar crédito, receita e conta. |
| TRI-10 | PIX/boleto bancário em produção | Pendente | Catálogo PIX_BOLETO é MOCK; cobrança demonstrativa não prova emissão no PSP/banco. | Validar cobrança e webhook autenticado no provedor contratado. |
| TRI-11 | Compensação, transferência e restituição de crédito | Pronta | E15: decisão, pagamento de restituição e reversão com comprovante. | Conciliar efeito fiscal e desembolso financeiro. |
| TRI-12 | ITBI interno e canal online | Pronta | E15: declaração, múltiplos adquirentes, cálculo, análise, DAM e processo. | Declarar, analisar, pagar e emitir documento de origem. |
| TRI-13 | ITBI: contestação, expiração, comunicação e titularidade | Pronta | E15: políticas, anexos, decisão, retificação e atualização após pagamento. | Demonstrar cancelamento/contestação sem mudança indevida de titular. |
| TRI-14 | Alvarás configurados, ciclo e assinatura | Pronta | E15: política, PDF, vigência, assinatura e validação pública. | Emitir alvará e conferir requisitos fiscais/documentais. |
| TRI-15 | ISS e NFS-e municipais internos | Pronta | E15: credenciamento, cálculo, emissão, substituição, cancelamento, correção, RPS e DMS. | Conferir ISS, deduções e documento municipal gerado. |
| TRI-16 | WebServices municipais RPS/DMS/DES-IF | Parcial | E15 e APIs tributárias: endpoints JSON protegidos por token; tokens locais ausentes. | Contratar formato/autenticação; não presumir SOAP/ABRASF/nacional. |
| TRI-17 | Simples Nacional e malha municipal | Pronta | E15: importações, divergências, autorregularização e DTE. | Cruzar declaração/NFS-e/pagamento com bases conferidas. |
| TRI-18 | Exclusão efetiva no Simples Nacional/RFB | Pendente | `s5-service.ts` gera preparação municipal e declara não efetivar exclusão na Receita. | Exigir ato/retorno da RFB se fizer parte do requisito. |
| TRI-19 | ISS bancário/DES-IF | Parcial | E15: instituição, agência, PGCC/COSIF, apuração e validação local; assinatura/leiaute externo dependem de comprovação. | Validar arquivo oficial e aceite, além do cálculo interno. |
| TRI-20 | Domicílio tributário eletrônico | Pronta | E15: caixa, mensagem, eventos, leitura e prazos. | Provar ciência no canal e distinguir aviso externo de leitura efetiva. |
| TRI-21 | Fiscalização, plano, auto e produtividade | Pronta | E15: seleção, responsável, achado, cálculo e registros fiscais. | Vincular ação fiscal ao lançamento/documento. |
| TRI-22 | Dívida ativa, CDA, cobrança e parcelamento | Pronta | E15: elegibilidade, inscrição, versões, cobrança e pagamentos. | Reclassificar crédito e impedir inscrição duplicada. |
| TRI-23 | Protesto/execução fiscal por intercâmbio oficial | Parcial | E15: registros e cadeia interna; integração operacional com cartório/tribunal não localizada. | Comprovar remessa, retorno e baixa no destinatário. |
| TRI-24 | Certidões fiscais | Pronta | E15: sujeito, avaliação de situação fiscal e emissão. | Emitir certidão compatível com débitos suspensos/exigíveis. |
| TRI-25 | VAF e inteligência tributária | Pronta | E15: movimentos, fórmulas, cruzamentos, estimativa e relatórios. | Reproduzir cálculo e identificar origem de cada valor. |
| TRI-26 | REDESIM e fontes cadastrais externas | Parcial | E15: telas/eventos e tratamento cadastral; cliente externo oficial não localizado. | Demonstrar comunicação autenticada e retorno do integrador estadual/federal. |
| TRI-27 | BI tributário, comparativo e resumo anual | Pronta | E15: consultas, benefícios e movimentos contábeis. | Conferir totais com lançamentos e classificação anual. |

### 4.17 Cemitérios

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| CEM-01 | Cemitério, setor, lote, sepultura e campos configuráveis | Pronta | E25: estrutura, parâmetros e busca. | Criar estrutura e validar capacidade e identificação. |
| CEM-02 | Ocupação, sepultamento e processos | Pronta | E25/E15: workflow, identidade e situação de ocupação. | Registrar sepultamento sem exceder capacidade. |
| CEM-03 | Transferência, exumação e histórico | Pronta | E25: regras de pares, datas, disponibilidade e eventos. | Manter origem/destino e situação física coerentes. |
| CEM-04 | Taxas e DAM integrados ao tributário | Pronta | E25/E15: evento de taxa, fórmula e constituição da cobrança. | Cobrar evento uma vez e consultar guia/saldo fiscal. |
| CEM-05 | Consulta, anexos, comprovantes e relatórios | Pronta | E25: consultas e endpoints de evidência. | Reimprimir e verificar escopo de acesso ao anexo. |

### 4.18 Obras públicas, construção civil e iluminação

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| OBR-01 | Obras/projetos, medições e fiscalização | Pronta | E26: páginas e actions de obras públicas. | Relacionar execução física, documentos e contrato. |
| OBR-02 | Serviços urbanos, máquinas, equipes e OS | Pronta | E26: responsáveis, materiais, compras e documentos associados. | Programar, executar e comprovar efeitos nos módulos vinculados. |
| OBR-03 | Construção civil: abertura, imóvel e participantes | Pronta | E26: abertura interna/externa autorizada e cadastro profissional. | Protocolar sem conceder acesso a imóvel não autorizado. |
| OBR-04 | Análise, parecer, regras, vistoria e exigências | Pronta | E26: revisões, distribuição e workflow de análise. | Exigir complementação e conservar versão do parecer. |
| OBR-05 | Ciclo de alvará/habite-se e documentos | Pronta | E26: ciclo, documentos, assinaturas e publicação. | Diferenciar aprovação, emissão, assinatura e publicação. |
| OBR-06 | Fiscalização, atos e taxas da construção | Pronta | E26/E15: fiscalização e eventos tributários. | Relacionar ato, processo, cobrança e eventual reversão. |
| OBR-07 | Área profissional, conversa e complementação | Pronta | E26: identidade, participação e solicitações externas. | Profissional ver apenas processos autorizados e enviar complemento. |
| OBR-08 | Leitura textual de prancha/PDF | Pronta | E26: extração de texto e valores explicitamente rotulados, com página e evidência. | Usar PDF real dentro dos limites e mostrar trecho-fonte. |
| OBR-09 | Extração por IA/OCR externos | Parcial | E26: adaptadores HTTP implementados; variáveis ausentes; default determinístico não é IA. | Configurar provedor/modelo e testar PDF digitalizado e evidência. |
| OBR-10 | Viabilidade automática completa | Parcial | E26: consulta limitada/demonstrativa, encaminhamento manual e documento com aviso explícito. | Comparar todos os parâmetros urbanísticos exigidos; não presumir aprovação automática integral. |
| OBR-11 | Remessa federal de construção | Parcial | E26: exportação `MUNICIPAL_DEMO_JSON_V1`, sem homologação federal nem comprovação de envio. | Validar leiaute oficial e obter recibo do destinatário. |
| ILU-01 | Iluminação e ordens de serviço | Parcial | E26: rotas próprias reutilizam operações de Obras; `ILUMINACAO_PUBLICA` não apareceu no cadastro de módulos. | Conferir permissões, pontos atendidos, materiais e encerramento da OS. |

### 4.19 Meio ambiente, saneamento, cultura, Câmara e segurança

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| MAM-01 | Empreendimentos, denúncias, fiscalização e documentos | Pronta | E28: cadastros, inspeções e anexos. | Registrar denúncia e concluir fiscalização vinculada. |
| MAM-02 | Áreas verdes, resíduos e educação ambiental | Pronta | E28: páginas e registros setoriais. | Demonstrar os campos e movimentos requeridos em cada subárea. |
| MAM-03 | Licença ambiental com validação pública funcional | Parcial | E28: emissão/hash presentes; URL gerada aponta para `celeriflow.gov.br/validar-licenca`, rota não localizada no app. Há modelos `EnvLicense` e `EnvironmentalLicense`. | Validar licença emitida por URL real e conciliar os dois fluxos de dados. |
| SAN-01 | Unidades consumidoras e leituras | Pronta | E29: cadastros, consumo e validação de leitura crescente. | Registrar leitura e comparar consumo ao período anterior. |
| SAN-02 | OS, qualidade da água e solicitações | Pronta | E29: operações e gestão interna do chamado “Portal do Consumidor”. | Executar OS e avaliar análise de qualidade. |
| SAN-03 | Faturamento integrado a leitura e tarifa municipal | Parcial | E29: UI de faturas lê `SanInvoice`; motor de leitura/fatura grava `WaterMeterReading` com tarifas fixas. | Provar que a leitura cria a fatura canônica e usa a tabela legal configurada. |
| SAN-04 | PIX/linha digitável e recebimento bancário | Parcial | E29: motor compõe strings demonstrativas; não há comprovação de cobrança aceita no banco. | Pagar em provedor autorizado e conciliar retorno. |
| SAN-05 | Autosserviço público do consumidor de água | Parcial | `/saneamento/portal` exige contexto interno SANEAMENTO e gerencia solicitações; não comprova portal externo completo de faturas. | Acessar como consumidor e limitar consulta à própria unidade/fatura. |
| CUL-01 | Agentes, espaços, patrimônio e responsáveis | Pronta | E27: PF/PJ canônica, imóvel/bem e servidor responsável. | Criar agente/espaço e conferir vínculos. |
| CUL-02 | Eventos, reservas e esporte/lazer | Pronta | E27/E10: agenda e reserva compartilhada. | Evitar conflito de reserva e ligar evento/atividade ao espaço. |
| CUL-03 | Fomento, projetos, conselhos, fundos e documentos | Parcial | E27: gestão municipal e registros; seleção/prestação financeira integral depende do requisito. | Demonstrar etapas exigidas e efeito financeiro, se solicitado. |
| CAM-01 | Legislaturas, vereadores, comissões e sessões | Pronta | E30: cadastros e páginas legislativas. | Registrar estrutura da legislatura e sessão. |
| CAM-02 | Proposições, leis e portal | Pronta | E30: registros, autoria e vínculo a sessão/publicação. | Tramitar no recorte implementado e publicar documento. |
| CAM-03 | Plenário, votação eletrônica, quórum e transmissão | Pendente | Não foi localizado fluxo completo desses recortes nas actions examinadas. | Demonstrar votação e evidências específicas se exigidas. |
| SEG-01 | Guardas, ocorrências e infrações administrativas | Pronta | E31: CRUD, numeração e estados persistidos. | Registrar ocorrência/auto e consultar histórico disponível. |
| SEG-02 | Rondas, Defesa Civil, trânsito, mobilidade e ordens | Parcial | E31: parte do conjunto utiliza registro operacional genérico. | Comparar workflow especializado exigido com os campos efetivos. |
| SEG-03 | DETRAN/RENAINF, câmeras e despacho operacional externo | Pendente | Não foi localizado conector operacional para esses destinos. | Exigir ida/retorno e identificação do sistema externo. |

### 4.20 Controle Interno, indicadores, notificações e suporte técnico

| ID | Funcionalidade | Status | Evidência / alcance encontrado | Conferir na POC |
|---|---|---|---|---|
| CTI-01 | Plano, apontamento, parecer e providência | Pronta | E33: operações de controle e acompanhamento. | Abrir achado, responder e comprovar saneamento. |
| CTI-02 | Checklists, auditoria e relatórios circunstanciados | Pronta | E33: grupos, respostas, diagnóstico e relatório final. | Avaliar item, gerar irregularidade e emitir relatório. |
| CTI-03 | Agenda de obrigações e alertas | Parcial | E33: agenda e cron declarados; segredo local ausente. | Executar alerta periódico e registrar baixa da obrigação. |
| CTI-04 | Consultas integradas de RH, judicial e Ouvidoria | Pronta | E33: leitura de origens e agregados com recorte. | Conferir o dado canônico e a proteção de identidade/narrativa. |
| IND-01 | Indicadores municipais e custos | Pronta | `/indicadores`, E13/E20: indicadores operacionais e custos separados. | Reproduzir agregado a partir das fontes autorizadas. |
| IND-02 | BI genérico, ETL externo e criação livre de dashboards | Pendente | Os painéis encontrados são específicos; não foi localizada ferramenta genérica com esse alcance. | Exigir construção e atualização de painel pelo usuário, se previsto. |
| NOT-01 | Notificação interna e leitura | Pronta | E04/E05: geração, destinatário, evento e leitura. | Disparar evento real e marcar leitura no usuário correto. |
| NOT-02 | Comunicação externa por SMTP/WhatsApp/SMS | Parcial | E07: catálogo MOCK; Resend SST é fluxo específico, não mensageria geral. | Comprovar entrega/aceitação no canal exigido. |
| SUP-01 | Central técnica: chamado, incidente, anexo e conhecimento | Pendente | `/suporte-tecnico` declara roadmap indisponível e sem persistência dessas capacidades. | Implementar fluxo operacional ou apresentar sistema contratado que o cumpra. |
| SUP-02 | SLA contratual técnico e escalonamento | Pendente | Página informa contrato/canais/tempos ainda não configurados. | Exibir contrato, tempos, relógio de SLA e registro de atendimento. |

## 5. Integrações internas — mapa de fluxo e pontos de prova

Os status abaixo avaliam a **ponte implementada**, não sua execução já comprovada na base examinada. Uma relação no schema ou um ID livre não basta para considerar uma transação integrada.

| ID | Origem → destino | Status | Integração encontrada / condição de aceite |
|---|---|---|---|
| INT-01 | Cadastros → RH, saúde, social, tributário e compras | Pronta | Pessoa/empresa e papéis canônicos. Demonstrar o mesmo identificador e histórico entre módulos. E01/E03. |
| INT-02 | Estrutura administrativa → responsáveis e escopos | Pronta | Servidor, setor, secretaria, UG e unidade de saúde usados em autorização e operação. E02/E04. |
| INT-03 | Protocolo ↔ GED ↔ assinatura | Pronta | Documentos versionados, exigências e bloqueios de workflow. Provar vínculo à versão exata. E05/E06. |
| INT-04 | Portal cidadão → protocolo → executor setorial | Pronta | Solicitação gera processo e roteia manutenção/cadastro/tributário/reserva. E10. |
| INT-05 | e-SIC/Ouvidoria → atendimento/protocolo | Pronta | Registros nativos associados e acesso com tratamento próprio de identidade. E08/E11. |
| INT-06 | Planejamento → dotação → execução financeira | Pronta | LOA, crédito, cota e disponibilidade. Provar consumo/liberação do saldo. E12/E13. |
| INT-07 | Legislativo ↔ planejamento | Pronta | Jurisdição, emenda, ato e instrumento vinculados. E12/E30. |
| INT-08 | Compras → despesa/reserva/empenho/liquidação | Pronta | Bridge específico, vínculos de origem e proteção contra duplicação. E14/E13. |
| INT-09 | Recebimento de compra → estoque/bem | Pronta | Entrada/aquisição por recebimento. Verificar item, quantidade e valor na origem. E14/E17. |
| INT-10 | Tributo/pagamento → receita/tesouraria/contabilidade | Pronta | Mapeamento, evento e retorno confirmado. Conferir bruto, dedução, fonte e UG. E15/E13. |
| INT-11 | Tributo → reconhecimento por competência/dívida ativa | Pronta | Perfil contábil, ajuste e reclassificação de recebível. E15/E13. |
| INT-12 | ITBI pago → titularidade fiscal do imóvel | Pronta | Modo configurado, integralidade do pagamento e histórico/retificação. Não equivale a registro cartorial. E15. |
| INT-13 | RH/folha → despesa/provisão/contabilidade/custos | Pronta | Pontes próprias e fontes fechadas/oficiais. Demonstrar processamento e reversão coerente. E16/E13. |
| INT-14 | Ponto/férias/atestados/SST → licença/folha | Pronta | Regras funcionais e eventos de origem. Provar que o efeito ocorre uma única vez. E16/E19. |
| INT-15 | RH/SST → Portal do Servidor | Pronta | Publicação e manifesto de fontes; fonte revogada/desatualizada restringe documento. E18. |
| INT-16 | Estoque/valoração patrimonial → contabilidade/custos | Pronta | Pontes de consumo/valoração e reversão. Não tratar mera compra como consumo. E17/E13. |
| INT-17 | Frotas → patrimônio/estoque/indicadores | Pronta | Vínculos operacionais e permissões de patrimônio/saída de estoque. Conferir quais operações geram efeito, além do vínculo. E20. |
| INT-18 | Educação → frota/material/conta bancária | Parcial | Há referências e registros educacionais próprios; nem todo vínculo implica movimento no ledger canônico. E21. |
| INT-19 | Saúde/farmácia → materiais e estoques | Pronta | Movimentação, recebimento, dispensação e inventário integrados às origens. E22/E17. |
| INT-20 | Atendimento clínico → laboratório/regulação/produção | Pronta | Ordem, guia, fato de produção e laudo mantêm origem clínica. E22. |
| INT-21 | TFD → frota/viagem/documentos | Pronta | Transporte autorizado, passageiros e documentos da viagem. E22/E20. |
| INT-22 | Saúde → Portal do Paciente | Pronta | Agenda própria, dispensações e laudos liberados, por identidade de sessão. E23. |
| INT-23 | Saúde → receptores de acompanhamento | Pronta | Contrato versionado IN_PROCESS, lote, retorno por item e reprocessamento. O rótulo PRODUCAO desse fluxo é interno. E22. |
| INT-24 | Cemitérios → tributário → DAM | Pronta | Evento de taxa e cobrança com chave de origem. E25/E15. |
| INT-25 | Construção → protocolo/GED/imóvel/tributário | Pronta | Processo, regra, documento, evento tributário e atualização cadastral controlada. E26/E15. |
| INT-26 | Obras/iluminação → equipe/material/compra/documento | Parcial | Existem operações/vínculos; provar efeito automático de cada etapa e permissões entre módulos. E26. |
| INT-27 | Cultura/espaço → serviço de reserva do cidadão | Pronta | Reserva usa fonte canônica compartilhada e proteção de conflito. E27/E10. |
| INT-28 | Domínios municipais → Transparência | Pronta | Provedores nativos e bindings com publicação/autorização explícitas. Nenhum binding cadastrado na base examinada. E11. |
| INT-29 | RH/Ouvidoria/judicial → Controle Interno | Pronta | Consultas às origens e agregação protegida. E33. |
| INT-30 | Saneamento: leitura → fatura → financeiro | Parcial | Modelos de leitura/fatura distintos e ausência de prova da cadeia canônica completa. E29. |
| INT-31 | Meio ambiente: cadastro de licença → emissão → validação | Parcial | Dois modelos de licença e URL de validação não encontrada nas rotas. E28. |
| INT-32 | Eventos dos módulos → notificação/auditoria | Pronta | Serviços transversais implementados; demonstrar cobertura por evento exigido. E04/E05. |
| INT-33 | Débito da frota → gasto operacional / referência financeira | Parcial | E20: serviço cria gasto `DEBITO_VEICULO`, valida alocação opcional a pagamento `Pago` e gera gasto negativo no estorno. Não emite ordem financeira nem paga o banco; formulário de pagamento possui a incompatibilidade de FRO-09. |

## 6. Integrações externas — implementação, configuração e homologação

### 6.1 Regra de ambiente do catálogo central

Fonte: [`src/lib/integrations/registry.ts`](../src/lib/integrations/registry.ts) e [`runtime.ts`](../src/lib/integrations/runtime.ts).

- `BANCO_API`: somente **SANDBOX**.
- `MS_RENAME`, `HORUS`, `SIGAF`, `TRANSPARENCIA_SAUDE`, `ESUS_VACINACAO` e `DISPOSITIVO_ASSISTENCIAL`: **SANDBOX ou HOMOLOGACAO**, com despacho HTTP controlado.
- Demais códigos do catálogo: somente **MOCK**, sem conexão de rede nesse caminho.
- Despachos **PRODUCAO** pelo runtime genérico são bloqueados.
- Essa política não descreve todas as integrações do projeto: Firebase/Blob/API Ibema/IA/Resend e os serviços específicos possuem caminhos próprios. O acompanhamento interno de saúde também tem implementação própria e não representa transmissão nacional.

**Configuração observada:** nenhuma linha cadastrada no catálogo de conexões e nenhuma execução registrada. As exceções configuradas fora dele estão identificadas abaixo.

### 6.2 Matriz de conectores

| ID | Sistema/integração | Status de implementação | Configuração local observada | Alcance e pendência para aceite |
|---|---|---|---|---|
| EXT-01 | PostgreSQL/Neon + Prisma | Pronta | URLs presentes; SELECTs concluídos. | Persistência acessível; massa/parametrização pendentes. E01/E04. |
| EXT-02 | Firebase Authentication | Pronta | Variáveis cliente/Admin presentes. | Autenticação implementada; login remoto e vínculo não testados nesta análise. E04. |
| EXT-03 | Vercel Blob | Pronta | Token presente. | Upload/download implementados; operação e permissões não exercitadas. E04/E06. |
| EXT-04 | API pública Ibema/Elotech | Parcial | URL definida no provedor; default de apresentação usa API_IBEMA. | Consulta externa implementada para coleções com `apiPath`; depende de disponibilidade/código de entidade. Não foi chamada nesta rodada. E11. |
| EXT-05 | Banco Virtual Robonuvem | Parcial | URL fallback; sem conexão cadastrada e sem variáveis bancárias verificadas. | Extrato, rendimentos, receitas, ordens e retorno em SANDBOX. Não é banco comercial em produção. E13. |
| EXT-06 | OFX/OFC/CSV por arquivo | Pronta | Não depende de conexão cadastrada; faltam conta/exercício na base. | Importação/validação/conciliacão internas. Aceite requer amostra do arquivo do banco esperado. E13. |
| EXT-07 | CNAB bancário oficial | Parcial | Código BANCO_CNAB não cadastrado; catálogo restrito a MOCK. | Estruturas/formatos referenciados não comprovam remessa/retorno homologados para cada banco. E07/E13. |
| EXT-08 | PIX/boleto/PSP | Parcial | Sem conexão PIX_BOLETO. | Catálogo MOCK e fluxos demonstrativos; falta emissão/baixa real autenticada. E07/E15/E29. |
| EXT-09 | TCE-PB/SAGRES | Parcial | Sem conexão. | Preparação/pacotes e MOCK. Não comprova transmissão, nem atendimento ao TCE de outro estado. E07. |
| EXT-10 | SICONFI/STN | Parcial | Sem conexão. | MSC 2026 exportável sob regras; conector geral MOCK. Envio/aceite oficial pendentes. E07/E13. |
| EXT-11 | PNCP | Parcial | Sem conexão. | Pacotes, fila e validações; catálogo MOCK. Publicação oficial e protocolo pendentes. E07. |
| EXT-12 | eSocial RH | Parcial | Nenhuma conexão específica encontrada. | Preparação/configuração existentes; transmissão declaradamente indisponível. E16. |
| EXT-13 | eSocial SST | Parcial | `SstEsocialConfiguration=0`. | Origem/preparação e contrato de transporte; provedor REAL não instalado. E19. |
| EXT-14 | EFD-Reinf | Parcial | Sem conexão. | Cadastro geral MOCK; envio/consulta oficiais não comprovados. E07. |
| EXT-15 | DIRF/SEFIP e obrigações correlatas | Parcial | Sem conexão. | Há preparação/relatórios de RH/SST e catálogo MOCK. Comparar obrigação, exercício e leiaute efetivamente exigidos. E07/E16/E19. |
| EXT-16 | NF-e/CT-e — SEFAZ | Parcial | Sem conexão NFE_CTE. | Importação de XML farmacêutico existe; captura/consulta automática SEFAZ não comprovada. E07/E22. |
| EXT-17 | NFS-e nacional/provedor externo | Parcial | Sem conexão NFSE. | Emissão municipal interna e receptor JSON próprios não comprovam DPS/ADN/padrão nacional ou provedor homologado. E07/E15. |
| EXT-18 | WebServices municipais RPS/DMS/DES-IF | Parcial | Tokens específicos ausentes. | Endpoints de entrada implementados; exige habilitação e contrato de payload. E15. |
| EXT-19 | SMTP institucional / WhatsApp | Parcial | Sem conexões EMAIL_SMTP/WHATSAPP. | MOCK no catálogo geral. Mensageria de produção não demonstrada. E07. |
| EXT-20 | Resend — alertas SST | Parcial | Três variáveis específicas ausentes. | HTTP real e recibo implementados, sem configuração local; recibo significa aceitação pelo provedor. E19. |
| EXT-21 | ICP-Brasil A1 | Parcial | Sem certificado/variável privada correspondente encontrada. | Implementação específica de cadeia e assinatura de hash; catálogo ICP_BRASIL continua MOCK. A3/PAdES/TSA são requisitos separados. E06/E07. |
| EXT-22 | Diário Oficial externo | Parcial | Sem conexão DIARIO_OFICIAL. | Publicação interna existe; conector de canal externo somente MOCK. E07/E09. |
| EXT-23 | RENAME | Parcial | Sem conexão MS_RENAME. | Importação versionada/despacho controlado em sandbox/homologação; falta destino configurado e teste. E07/E22. |
| EXT-24 | Hórus/SIGAF | Parcial | Sem conexões. | Adaptador HTTP controlado e histórico previstos; não prova interoperabilidade homologada com o serviço oficial. E07/E22. |
| EXT-25 | Transparência de estoque de medicamentos | Parcial | Sem conexão TRANSPARENCIA_SAUDE. | Consulta nativa pública é independente; despacho externo exige endpoint/configuração. E07/E11/E22. |
| EXT-26 | e-SUS Vacinação | Parcial | Sem conexão ESUS_VACINACAO. | Remessa versionada/despacho controlado; falta confirmar leiaute e aceite do destino nacional. E07/E22. |
| EXT-27 | SISAB/e-SUS APS | Parcial | Sem comprovação de recepção nacional. | Geração e validação locais de fichas/lotes, sem protocolo oficial produzido pelo serviço examinado. E22. |
| EXT-28 | Dispositivo laboratorial A15/HL7/ZPL | Parcial | Sem conexão DISPOSITIVO_ASSISTENCIAL. | Mensagem/correlação e HTTP implementados; validar equipamento, protocolo e retorno reais. E07/E22. |
| EXT-29 | INEP/Educacenso | Parcial | Sem conexão oficial comprovada. | Importação/exportação simplificadas; leiaute/validação e envio oficiais pendentes. E21. |
| EXT-30 | REDESIM/Receita/Junta Comercial | Parcial | Sem conector externo operacional identificado. | Eventos e registros internos não comprovam troca oficial. E15. |
| EXT-31 | Simples Nacional/PGDAS/DAF607/PGFN | Parcial | Importação municipal disponível; sem cliente oficial comprovado. | Cruzamento interno e preparação de exclusão não substituem operações na RFB. E15. |
| EXT-32 | VAF/EFD/GIA/índices estaduais | Parcial | Rotinas de importação e cálculo no domínio. | Demonstrar origem do arquivo e aceite no sistema estadual se necessário. E15. |
| EXT-33 | FIPE/Parallelum | Parcial | Coletor por marca e `data/frotas/fipe-carros.json` no GitHub; importação administrativa, sem comprovação de carga no banco. | Catálogo de 7.386 modelos de carros/108 marcas, 2026-10, com fontes/hashes. Não contém preços/anos específicos nem motos/caminhões; seed POC ainda referencia `fipe-hb20s.json`. E20/E32. |
| EXT-34 | CTB/MBFT/CONTRAN | Pronta | Scripts de coleta de referências públicas presentes. | Importação de catálogo com fonte/hash; conferir atualização e completude do arquivo usado. Não é integração DETRAN. E32. |
| EXT-35 | OpenStreetMap/Nominatim | Pronta | Endpoint de geocodificação reversa e URLs de tiles definidos no código, sem cadastro no catálogo geral. | Geocodificação reversa e exibição de mapas implementadas; disponibilidade externa não testada. E10; [seletor geográfico](../src/components/app-ui/GeographicPointPicker.tsx) e [localização de ocorrência](../src/components/portal-institucional/OccurrenceLocation.tsx). |
| EXT-36 | IA compatível com OpenAI — construção | Parcial | Variáveis ausentes; default DEMO_RULES. | Adaptador HTTP, modelo e validação da evidência implementados; configurar e demonstrar uso real. E26. |
| EXT-37 | OCR de pranchas | Parcial | Endpoint/chave ausentes. | Adaptador opcional para páginas sem texto; falta provedor configurado. E26. |
| EXT-38 | CadÚnico/SUAS, DETRAN/RENAINF e cartórios/tribunais | Pendente | Nenhuma integração operacional correspondente localizada. | São destinos distintos: exigir evidência separada por requisito. E24/E31/E15. |
| EXT-39 | ViaCEP | Pronta | URL pública definida nos formulários, sem credencial ou cadastro no catálogo geral. | Consulta de CEP e preenchimento de endereço com tratamento de falha na [instituição](../src/app/app-domain/administracao/instituicao/InstitutionForm.tsx) e nos [almoxarifados](../src/app/app-domain/patrimonio/almoxarifados/WarehouseForm.tsx). Operação externa não testada nesta rodada. |
| EXT-40 | VLibras — atalho externo | Parcial | Link fixo para `gov.br/governodigital/pt-br/vlibras` na barra do portal. | Navegação para ferramenta externa; não há integração de widget/tradução da página nesse caminho. [Barra do portal](../src/components/portal-institucional/PortalShell.tsx). |

**Atenção à jurisdição:** existe código de conector denominado **TCE-PB/SAGRES**, enquanto a fonte pública de transparência referencia **Ibema/PR** e há referências de demonstração a outros municípios. O comparativo deve exigir o ente, tribunal, exercício e leiaute do checklist; não se deve considerar uma integração estadual como substituta automática de outra.

## 7. Lacunas prioritárias para preparar e executar a POC

| ID | Prioridade | Lacuna concreta | Itens relacionados | Critério de encerramento |
|---|---|---|---|---|
| GAP-01 | Alta | Base examinada sem instituição e massa operacional nas tabelas amostradas. | AMB-04/05 | Instituição, perfis operacionais, cadastros e cenários interligados disponíveis e conferidos. |
| GAP-02 | Alta | Nenhum conector cadastrado ou execução registrada. | AMB-06, EXT-* | Cada integração exigida configurada, executada e com evidência do ambiente efetivo. |
| GAP-03 | Alta | Transmissões oficiais não concluídas/comprovadas nos conectores gerais. | FIN-17, RH-15, SST-12, COM-10 | Protocolo/retorno real do destino; separar preparação, MOCK e homologação. |
| GAP-04 | Alta | Certificado A1 e segredos de crons/WebServices ausentes no ambiente local. | AMB-10/11/13 | Credenciais específicas provisionadas e uma operação válida/negativa demonstrada. |
| GAP-05 | Alta | Suporte técnico é roadmap, apesar de módulo habilitado. | SUP-01/02 | Central operacional e SLA configurados conforme exigência. |
| GAP-06 | Alta se cobrado | Educacenso/SISAB/faturamento SUS sem aceite oficial demonstrado. | EDU-11, SAU-22/23 | Artefato compatível com leiaute do ciclo e validação no receptor oficial. |
| GAP-07 | Alta se cobrado | Faturamento saneamento não comprovado na cadeia de dados canônica. | SAN-03/04, INT-30 | Leitura cria fatura visível, com tarifa legal, cobrança e retorno conciliado. |
| GAP-08 | Média | Licença ambiental com validação apontando para URL sem rota local encontrada. | MAM-03, INT-31 | Documento emitido validável em URL publicada e dados conciliados. |
| GAP-09 | Média | Viabilidade/extração de construção e remessa federal possuem recortes demonstrativos. | OBR-09/10/11 | Configurar IA/OCR se exigidos; demonstrar regra urbanística e leiaute oficial correspondentes. |
| GAP-10 | Média | Fonte institucional/jurisdição precisa ser uniformizada para o cenário da POC. | EXT-09, seção 6 | Nome, domínio, brasão, tribunal, município e exercício corretos em telas/relatórios. |
| GAP-11 | Média | Iluminação sem registro próprio de ativação na consulta e acesso de Controle Interno a conferir. | ILU-01, CTI-* | Perfis operacionais conseguem executar somente as capacidades autorizadas. |
| GAP-12 | Conforme checklist | Preços/anos e categorias FIPE além de carros, plenário eletrônico, disputa ao vivo, telemetria e conectores específicos não comprovados. | FRO-07/08, CAM-03, COM-06, EXT-38 | Demonstrar o requisito exato; o catálogo amplo de modelos de carros já está no GitHub, mas não resolve avaliação monetária. |
| GAP-13 | Conforme checklist | Exportações legais e MSC têm limites de exercício/leiaute/consolidação. | PLA-08, FIN-15/16 | Conferência por demonstrativo, período e versão oficial do leiaute. |
| GAP-14 | Média | Transparência sem publicações/bindings/critérios e catálogo cidadão sem serviços na base consultada. | AMB-16, TRA-*, POR-* | Fontes e serviços publicados, navegáveis e com dados verificáveis. |
| GAP-15 | Alta para Frotas | Formulário `payDebt` envia campo de comprovante incompatível com o schema; seed ainda carrega FIPE amostral; aplicação da nova migração não foi confirmada. | FRO-09/10, INT-33, AMB-02 | Alinhar `proofVersionId` entre formulário e schema, confirmar migração e demonstrar pagamento/estorno com catálogo amplo importado. |

## 8. Roteiros comparáveis e modelo de cruzamento

### 8.1 Cenários integrados sugeridos

Os passos abaixo são roteiros para coleta de evidência futura, não testes já executados.

| Cenário | Jornada a demonstrar | IDs de referência | Evidência mínima de comparação |
|---|---|---|---|
| POC-01 | Pessoa → usuário/servidor → perfil → operação permitida/negada | CAD-01, CFG-01/02, INT-01/02 | Identificadores, permissões e registro de negativa. |
| POC-02 | Pedido cidadão → protocolo → análise → documento assinado → resposta | POR-03/04, PRO-01/03, GED-02/03 | Protocolo, versão, assinatura, retorno e auditoria. |
| POC-03 | LOA → reserva → compra → recebimento → liquidação → pagamento → conciliação | PLA-01/06, COM-02/09, FIN-01/02/06 | Saldos antes/depois e rastreio de todos os estágios. |
| POC-04 | Compra de material → entrada → requisição → consumo → custo | PAT-02/03, FIN-13, INT-09/16 | Quantidade, valor, origem de custo e estorno. |
| POC-05 | Folha fechada → despesa/provisão → pagamento → portal do servidor | RH-04/13, SER-02 | Memória da folha, origem financeira e documento próprio publicado. |
| POC-06 | Atendimento SST → ASO/atestado → efeito funcional → preparação eSocial | SST-03/04/11/12 | Origem clínica, efeito RH e identificação clara do estágio externo. |
| POC-07 | Avaliação IPTU/ITBI → crédito → DAM → retorno → receita/contabilidade | TRI-02/07/09/12/13 | Cálculo, UG, saldo, pagamento confirmado e lançamento. |
| POC-08 | Dívida elegível → inscrição → CDA → acordo → pagamento | TRI-22/23 | Reclassificação, versões, parcelas e saldo. |
| POC-09 | Agenda saúde → atendimento → prescrição → dispensação → paciente | SAU-03/05/13, PAC-01/02 | Vaga, registro clínico, lote/saldo e isolamento do paciente. |
| POC-10 | Produção de saúde → crítica → arquivo → receptor | SAU-21/22/23/24 | Separar retorno local, receptor interno e aceite nacional. |
| POC-11 | Matrícula → diário/notas → responsável → fila/publicação autorizada | EDU-02/03/06, TRA-07 | Vínculo acadêmico, nota publicada e anonimização da fila. |
| POC-12 | Construção → análise → exigência → assinatura/publicação → taxa | OBR-03/04/05/06/09/10 | Fonte da extração, parecer, versão publicada e cobrança. |
| POC-13 | Publicação de despesa/contrato → consulta → filtro → exportação → e-SIC | TRA-02/04/05/06 | Fonte do total, arquivo completo e protocolo do cidadão. |
| POC-14 | Abastecimento/oficina → confirmação externa → conferência → indicador | FRO-03/04/06 | Autorização, token consumido, execução única e gasto conhecido. |
| POC-15 | Leitura água → faturamento → pagamento → conciliação | SAN-01/03/04 | Prova da cadeia entre os modelos, tarifa e retorno bancário. |
| POC-16 | Catálogo FIPE amplo → veículo/bem → débito → parcela → estorno | FRO-01/09/10, INT-33 | Versão/modelo vinculado, obrigação, comprovante correto, saldos antes/depois e gastos de pagamento/estorno; executar após resolver GAP-15. |

### 8.2 Planilha de comparação a preencher

Copie uma linha por requisito do checklist. Se um requisito combina várias capacidades, registre todos os IDs e avalie o conjunto; não marque atendimento integral por apenas uma tela semelhante.

| Requisito da POC | Descrição literal | IDs deste inventário | Status de implementação | Ambiente pronto? | Resultado demonstrado | Evidência/arquivo/URL | Lacuna e responsável |
|---|---|---|---|---|---|---|---|
| A preencher | A preencher | Ex.: FIN-02, INT-08 | Pronta / Parcial / Pendente | Sim / Não / Parcial | Atende / Atende parcialmente / Não atende / Não demonstrado | A preencher | A preencher |

**Regras para consolidar aderência:**

1. Preservar a redação e a numeração do checklist original.
2. Registrar se a exigência é cadastro, cálculo, workflow, integração automática, arquivo homologado ou transmissão com recibo.
3. Comparar no mesmo município/jurisdição, exercício, leiaute e ambiente solicitado.
4. Exigir efeito na origem/destino para integrações internas; a presença de um campo de vínculo não comprova a cadeia inteira.
5. Registrar separadamente status de implementação, configuração do ambiente e resultado observado.
6. Calcular percentual somente após vincular todos os itens e aplicar os pesos/regras de aceite da POC. Funcionalidades adicionais não compensam requisito obrigatório ausente, salvo previsão expressa do checklist.

## 9. Índice de evidências no repositório

As referências de diretório permitem localizar a implementação e seus consumidores. Os testes citados são exemplos de cobertura existente, **não resultados executados nesta rodada**.

| Referência | Caminhos principais | Testes/documentos de apoio |
|---|---|---|
| E01 | [Schema Prisma](../prisma/schema.prisma), [migrações](../prisma/migrations), [configuração Prisma](../prisma.config.ts) | Modelos e relações de todos os domínios. |
| E02 | [Administração](../src/app/app-domain/administracao), [regras administrativas](../src/lib/administration) | `tests/c3-administration.test.ts`, `tests/hr-role-legal-history.test.ts`. |
| E03 | [Cadastros](../src/app/app-domain/cadastros), [serviços mestres](../src/lib/cadastros), [identificadores](../src/lib/identifiers) | `tests/c2-pf-duplicate-merge.test.ts`, `tests/identity-integrity-postgres.test.ts`. |
| E04 | [Plataforma](../src/lib/platform), [Firebase](../src/lib/firebase), [configurações](../src/app/app-domain/configuracoes), [proxy](../src/proxy.ts), [notificações](../src/lib/notifications) | `tests/instance-configuration.test.ts`, `tests/internal-notifications.test.ts`, `tests/audit-evidence.test.ts`. |
| E05 | [Protocolos](../src/app/app-domain/protocolos), [serviços de processos](../src/lib/protocols) | `tests/citizen-process-tracking.test.ts`, `tests/process-judicial-cases.test.ts`. |
| E06 | [GED](../src/app/app-domain/documentos), [fluxo documental](../src/lib/documents), [assinaturas](../src/lib/signatures), [ICP-Brasil](../src/lib/security/icp-brasil.ts) | `tests/document-flow.test.ts`, `tests/tax-a1-signature.test.ts`. |
| E07 | [Catálogo/runtime de integrações](../src/lib/integrations), [tela de conexões](../src/app/app-domain/configuracoes/integracoes) | `tests/integration-contract.test.ts`, `tests/procurement-exports.test.ts`. |
| E08 | [Atendimento](../src/app/app-domain/atendimento), [políticas](../src/lib/attendance) | `tests/transparency-citizen-workflow.test.ts`. |
| E09 | [CMS/transparência](../src/app/app-domain/transparencia), [portal público](../src/app/portal), [conteúdo institucional](../src/lib/portal-institucional) | `tests/c4-public-notice-policy.test.ts`. |
| E10 | [Serviços ao cidadão](../src/lib/portal-cidadao), [área cidadã](../src/app/portal/minha-area), [localização](../src/app/api/portal/localizacao/route.ts) | `tests/integrated-portal-services.test.ts`, `tests/tax-channel-financial-integrity.test.ts`. |
| E11 | [Domínio transparência](../src/lib/transparencia), [portal transparência](../src/app/portal/portaldatransparencia), [APIs](../src/app/api/transparencia), [leis municipais](../src/app/portal/leis-municipais/page.tsx) | [Operação do portal](PORTAL_TRANSPARENCIA_OPERACAO.md), [autoavaliação LEG-04](LEG-04_VALIDACAO.md), `tests/transparency-discovery.test.ts`, `tests/transparency-native.test.ts`. |
| E12 | [Planejamento](../src/lib/planejamento), [telas](../src/app/app-domain/planejamento), [componentes](../src/components/app-ui/planejamento) | `tests/planning-domain.test.ts`, `tests/planning-execution.test.ts`, `tests/planning-publication.test.ts`. |
| E13 | [Financeiro](../src/lib/financeiro), [telas](../src/app/app-domain/financeiro), [MSC](../src/lib/financeiro/msc-export.ts), [cliente bancário](../src/lib/financeiro/bank-integration-client.ts) | `tests/public-finance.test.ts`, `tests/msc-accounting.test.ts`, `tests/annual-budget-close.test.ts`, `tests/municipal-cost-ledger.test.ts`. |
| E14 | [Compras](../src/lib/compras), [telas](../src/app/app-domain/compras), [exportações](../src/lib/integrations/procurement-exports.ts) | `tests/bidding-workflow.test.ts`, `tests/contract-lifecycle.test.ts`, `tests/procurement-financial-atomicity.test.ts`. |
| E15 | [Tributário](../src/lib/tributacao), [telas](../src/app/app-domain/tributacao), [APIs](../src/app/api/tributacao) | `tests/tax-financial-chain.test.ts`, `tests/active-debt-collection-chain.test.ts`, `tests/itbi-process-completion.test.ts`, `src/lib/tributacao/__tests__/`. |
| E16 | [RH](../src/lib/rh), [telas](../src/app/app-domain/rh), [prontidão externa](../src/lib/rh/external-configuration.ts) | `tests/hr-calculation.test.ts`, `tests/payroll-financial-cycle.test.ts`, `tests/hr-service-rights.test.ts`. |
| E17 | [Patrimônio/estoque](../src/lib/patrimonio), [telas](../src/app/app-domain/patrimonio) | `tests/warehouse-request-workflow.test.ts`, `tests/stock-valuation.test.ts`, `tests/asset-valuation-accounting.test.ts`. |
| E18 | [Portal servidor](../src/lib/portal-servidor), [telas](../src/app/app-domain/portal-servidor), [manifesto de fontes](../src/lib/portal-servidor/source-manifest.ts) | `tests/employee-portal-final-services.test.ts`, `tests/functional-portal-closure.test.ts`. |
| E19 | [SST](../src/lib/sst), [telas](../src/app/app-domain/sst), [envio eSocial](../src/lib/sst/esocial-service.ts), [e-mail](../src/lib/sst/restriction-email-provider.ts) | `tests/sst-aso-flow.test.ts`, `tests/sst-integrations-closure.test.ts`, `tests/sst-functional-payroll-origin.test.ts`. |
| E20 | [Frotas](../src/lib/frotas), [telas](../src/app/app-domain/frotas), [confirmação externa](../src/lib/frotas/control-external.ts), [débitos](../src/lib/frotas/control-debts.ts), [formulários](../src/app/app-domain/frotas/gestao/forms.ts), [schemas](../src/lib/frotas/control-policy.ts) | `tests/fleet-control-checklist.test.ts`, `tests/frotas.integration.test.ts`, `tests/fleet-indicators.test.ts`. |
| E21 | [Educação](../src/app/app-domain/educacao), [rotinas acadêmicas/Educacenso](../src/app/app-domain/educacao/s1-actions.ts), [parser](../src/lib/educacao/s1.ts) | `tests/education-s1.test.ts`; actions `s3-actions.ts`, `s4-actions.ts`, `s5-actions.ts` no diretório do módulo. |
| E22 | [Saúde](../src/lib/saude), [telas](../src/app/app-domain/saude), [SISAB](../src/lib/saude/sisab-service.ts), [acompanhamento](../src/lib/saude/followup-exchange-service.ts) | `tests/health-checklist-internal-flows.test.ts`, `tests/saude-s2-care-journey.test.ts`, `tests/health-pharmacy-invoice.test.ts`. |
| E23 | [Portal paciente](../src/app/app-domain/portal-paciente), [acesso](../src/lib/portal-paciente), [serviços](../src/lib/saude/patient-portal-service.ts) | `tests/saude-s3-assistential-services.test.ts`. |
| E24 | [Social](../src/lib/social), [telas](../src/app/app-domain/social) | `tests/social-benefit-delivery.test.ts`, `tests/social-access-policy.test.ts`. |
| E25 | [Cemitérios](../src/lib/cemeteries), [telas](../src/app/app-domain/cemiterios), [operações tributárias relacionadas](../src/lib/tributacao/s9-service.ts) | `tests/cemetery-workflow-service.test.ts`, `tests/cemetery-fees-service.test.ts`. |
| E26 | [Obras/construção](../src/lib/obras), [telas](../src/app/app-domain/obras), [iluminação](../src/app/app-domain/iluminacao-publica), [extração IA/OCR](../src/lib/obras/construction-extraction.ts), [exportação](../src/lib/obras/construction-export.ts) | `tests/construction-integrations.test.ts`, `tests/construction-automatic-viability.test.ts`, `tests/construction-lifecycle.test.ts`. |
| E27 | [Cultura](../src/app/app-domain/cultura), [reserva compartilhada](../src/lib/portal-cidadao/space-reservations.ts) | Vínculos e regras em `actions.ts` e páginas do módulo. |
| E28 | [Meio ambiente](../src/app/app-domain/meio-ambiente), [motor de licenciamento](../src/lib/meio-ambiente/licenciamento-engine.ts) | Actions gerais e `licenciamento/licencas-actions.ts`. |
| E29 | [Saneamento](../src/app/app-domain/saneamento), [motor de faturamento](../src/lib/saneamento/saneamento-engine.ts) | `actions.ts`, `leituras/leituras-actions.ts` e leitura de `SanInvoice` em `faturas/page.tsx`. |
| E30 | [Câmara](../src/app/app-domain/camara) | Actions, páginas de sessão/proposição e planejamento legislativo. |
| E31 | [Segurança](../src/app/app-domain/seguranca) | `actions.ts`, modelos e páginas dos submódulos. |
| E32 | [Coleta FIPE](../scripts/fetch-fleet-fipe.mjs), [catálogo amplo FIPE](../data/frotas/fipe-carros.json), [coleta CTB](../scripts/fetch-fleet-ctb.mjs), [configuração POC](../src/lib/poc/poc-config.ts) | [Documentação dos catálogos](../data/frotas/README.md); [seed POC](../scripts/seed-fleet-poc.ts) ainda lê a amostra HB20S. |
| E33 | [Controle Interno](../src/lib/c7), [telas](../src/app/app-domain/controle-interno), [suporte técnico](../src/app/app-domain/suporte-tecnico/page.tsx) | Serviços de agenda, checklist, auditoria e relatório; suporte declara indisponibilidade operacional. |

### 9.1 Verificação e implantação existentes

- [Scripts disponíveis](../package.json): build, typecheck, testes gerais/frotas/educação e verificações setoriais.
- [CI](../.github/workflows/ci.yml): declara validação Prisma, testes, build e auditoria de dependências, além de job isolado de Frotas. O resultado atual dos jobs não foi consultado nesta análise.
- [Agendamentos](../vercel.json): expiração de restrições SST, manutenção de anexos do servidor, alertas do Controle Interno, lotes anuais tributários, expiração econômica e manutenção da transparência.
- [Exemplo de ambiente](../.env.example): referência inicial de variáveis; alguns adaptadores específicos, como IA/OCR/Resend, utilizam variáveis adicionais identificadas no código.
- [Healthcheck](../src/app/api/health/route.ts): verifica conectividade com banco; não comprova prontidão dos módulos ou conectores.

## 10. Síntese para apresentação

**Capacidade implementada:** conjunto amplo de gestão municipal, com maior evidência de fluxos transacionais e pontes internas nos domínios financeiro, compras, tributário, RH/SST, patrimônio, processos e saúde.

**Preparação da instância examinada na primeira rodada:** pendente de identidade institucional, massa de negócio, publicação de serviços/fontes, conectores e credenciais específicas naquela consulta. Os 29 módulos ativos indicam habilitação, não operação demonstrada. Essa fotografia não foi reconsultada após o pull e não comprova a configuração da produção.

**Pontos com entrega parcial mais relevantes:** integrações externas oficiais, leiautes de exportação específicos, Educacenso/SISAB, cobrança e cadeia do saneamento, validação de licença ambiental, viabilidade/extração de construção, avaliação monetária FIPE e contrato do comprovante no pagamento de débito da frota.

**Evolução confirmada no GitHub:** catálogo amplo de modelos FIPE, controle de débitos da frota, acesso ao bem patrimonial, anexos de audiência via GED, colunas públicas ampliadas, consulta de legislação, limitação de consultas por IP e atalho VLibras. A autoavaliação LEG-04 é evidência documental complementar, sem substituir demonstração dos requisitos.

**Pontos explicitamente pendentes:** central operacional de suporte e seu SLA; transmissão real eSocial RH/SST; integrações oficiais não localizadas; funcionalidades especializadas como votação plenária, pregão em tempo real e telemetria, quando exigidas pelo checklist.

**Próximo artefato de comparação:** preencher a matriz da seção 8.2 com o checklist original, usando os IDs deste documento e a evidência de cada cenário, para produzir aderência item a item sem confundir implementação, configuração e aceite.
