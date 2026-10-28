# CeleriFlow — relatório geral de capacidades, arquitetura e implantação

**Referência:** 16/10/2026 · **Instância:** Guarama · **Finalidade:** inventário técnico-funcional para posterior confronto com editais.

## Guia de leitura

- [Resumo executivo e números](#1-resumo-executivo)
- [Método e estados de maturidade](#2-método-escopo-e-significado-dos-estados)
- [Contagem e ativação dos módulos](#3-quantos-módulos-temos-e-como-eles-aparecem)
- [Arquitetura e regras transversais](#4-arquitetura-e-regras-transversais)
- [32 áreas: subitens, funcionalidades, regras, dados e rotas](#5-inventário-funcional-de-todas-as-áreas)
- [Integrações externas](#6-integrações-externas--prontidão-real)
- [Conexões e dependências entre módulos](#7-conexões-entre-módulos-dependências-e-cadastros)
- [Dados populados e origem](#8-dados-populados-e-o-significado-de-reais)
- [Pendências e critérios de conclusão](#9-pendências-mapeadas-desenvolvimento-configuração-e-homologação)
- [Modelo de comparação com editais](#10-como-usar-o-relatório-para-comparar-editais)
- [Verificações e fontes](#11-verificações-executadas-e-rastreabilidade)
- [Páginas públicas e transversais](#anexo-a--páginas-transversais-e-públicas)
- [Endpoints HTTP](#anexo-b--endpoints-e-métodos-http)
- [Todas as tabelas, contagens e relações](#anexo-c--dicionário-completo-de-tabelas-população-e-relações)
- [Triggers e funções SQL](#anexo-d--triggers-funções-e-regras-sql-instaladas)
- [Arquivos de serviços e regras por área](#anexo-e--índice-técnico-de-serviços-e-regras-por-área)

## 1. Resumo executivo

O CeleriFlow possui uma base de ERP municipal ampla, com módulos administrativos, fiscais, financeiros, assistenciais e portais. A profundidade é desigual: financeiro, tributação, RH, SST, saúde, planejamento, compras, processos e patrimônio têm serviços de domínio e regras mais extensos; outras áreas combinam manutenção cadastral, consultas e fluxos parciais. O suporte técnico ainda é uma página de planejamento.

**O estado desta implantação não deve ser confundido com o potencial do código.** O Neon está estruturalmente instalado, mas praticamente sem carga operacional; o Blob está vazio. A maior parte das jornadas depende de cadastros, parâmetros municipais e dados de origem que ainda não existem. Há mistura de identidades de Guarama, Ibema e Aurora das Veredas. Integrações oficiais não podem ser declaradas prontas por terem cartão, tabela ou pacote de exportação: existem bloqueios explícitos de produção e adaptadores ainda ausentes.

| Indicador | Resultado |
| --- | --- |
| Commit-base examinado | `48f567a467871abe77a54f4c7cff7891511d833e` |
| Versão em package.json | `1.235.0` |
| Captura do Neon/Blob (UTC) | 2026-10-16T18:39:25.021Z |
| Captura HTTP publicada (UTC) | 2026-10-16T18:47:19.343Z |
| Cartões / módulos cadastrados / áreas deste relatório | 28 / 29 / 32 |
| Arquivos page.tsx | 694: 628 internos e 66 fora de app-domain |
| APIs em src/app/api | 162 route handlers |
| Route handlers em todo src/app | 198; inclui endpoints fora de /api |
| Modelos Prisma / tabelas físicas public | 970 / 994 |
| Tabelas além dos modelos | 24: 22 complementares SQL, 1 associativa e 1 histórico de migration |
| Modelos com / sem registros | 12 / 958 |
| Registros nos 970 modelos, somados | 79; não é contagem de pessoas nem de fatos distintos |
| Migrations / checksum divergente | 151 aplicadas / 0 divergentes |
| Objetos no Blob | 0; 0 bytes |
| Arquivos de teste inventariados | 243; somente 12 arquivos / 53 testes executados nesta análise |


### Principais conclusões

1. **Estrutura instalada:** todos os modelos Prisma possuem tabela e campos escalares; as 151 migrations locais têm execução concluída e checksum correspondente no banco consultado.
2. **Carga incompleta:** apenas 12 modelos têm registros. Os 958 restantes estão vazios; as tabelas complementares de negócio verificadas também estão vazias.
3. **Dados reais:** foi identificada a conta administrativa efetivamente provisionada e referências cadastrais básicas. Não há carga operacional municipal real demonstrada de contribuintes, servidores, pacientes, alunos, bens, contratos ou execução financeira.
4. **Portais implementados:** existem páginas, políticas de identidade e executores para cidadão, servidor, paciente e construção civil. A existência desses canais não significa operação validada com população real.
5. **Integração oficial pendente:** catálogo geral bloqueia `PRODUCAO`; eSocial RH/SST ainda não dispõe de transporte real; SISAB e arquivos SUS examinados usam processamento/layout local; Educacenso é intercâmbio simplificado; banco de rede é sandbox.
6. **Pendências de produto concretas:** suporte técnico sem persistência; botão legislativo sem ligação; fomento cultural aprova/homologa automaticamente; saneamento usa tarifas e cobrança sintética fixas; licença ambiental aponta para validador não inventariado.
7. **Sem percentual global de atendimento:** a cobertura de um edital deve ser medida por requisito e jornada demonstrável, não por número de módulos, páginas ou tabelas.

## 2. Método, escopo e significado dos estados

### 2.1 Fontes examinadas

- Código do repositório local: páginas, componentes, ações, rotas HTTP, bibliotecas de domínio, testes, Prisma e migrations.
- Leitura de todas as declarações de modelos Prisma e inventário automatizado de todos os arquivos TypeScript/TSX em `src`, `tests` e scripts operacionais.
- Consultas somente de leitura ao Neon selecionado por `DATABASE_URL_UNPOOLED`/`DATABASE_URL` do `.env.local`: tabelas, campos, quantidade exata de registros, FKs, constraints, funções, triggers, índices e histórico de migration.
- Listagem paginada do Vercel Blob selecionado pelo token local e busca de referências de Blob em campos de URL/caminho do banco.
- Sondagem HTTP sem autenticação no domínio publicado e leitura dos bundles públicos do login, sem publicar chaves neste documento.
- Execução de 12 arquivos de teste selecionados: **53 testes aprovados, zero falhas e zero ignorados**. Há testes de política e serviços com banco isolado; isso não equivale a ensaio completo de todos os módulos no banco municipal.

**Recorte:** o estado de dados corresponde à conexão local auditada. O `/api/health` publicado prova que o deploy consegue consultar um banco, mas não identifica por si só que é exatamente a mesma conexão. A presença da chave pública local no bundle confirma a configuração compilada do Firebase, não uma nova autenticação ponta a ponta de todos os perfis.

**Não foram executadas cargas, seeds ou mutações de negócio para esta análise.** Contagens não foram obtidas por amostragem. A aplicação e os dados não foram corrigidos durante a elaboração do relatório.

### 2.2 Legenda de maturidade/evidência

| Classificação | Como interpretar |
| --- | --- |
| **Implementado no código** | Há caminho executável e persistência/regra identificada; não é declaração de aceite operacional completo. |
| **Verificado nesta análise** | Houve consulta, teste ou resposta HTTP com resultado registrado. O alcance da evidência é informado. |
| **Preparado para integração** | Há contrato, pacote, API ou adaptador parcial; ainda depende de credencial, layout, provedor, rede e homologação. |
| **Simulado/controlado** | MOCK, SANDBOX, HOMOLOGACAO ou validador local. Não representa protocolo do serviço oficial. |
| **Dependente de implantação** | O código existe, mas faltam cadastros, parâmetros, regras municipais ou população. |
| **Desenvolvimento identificado** | Há ausência explícita, bloqueio de transporte, fluxo simplificado ou controle visual sem ação ligada. |
| **Não comprovado** | A análise não encontrou evidência suficiente para afirmar a funcionalidade específica; não é prova universal de inexistência. |

Contagem de página = arquivo `page.tsx`; páginas dinâmicas, modais, abas e formulários podem representar várias telas. Uma rota `[id]` conta como uma página, não uma por registro. A quantidade de ações apresentada usa declarações `export function`/`export async function` em arquivos cujo nome termina em `action.ts`/`actions.ts`: auxiliares e exportações por outras sintaxes podem ficar fora. Não é contagem certificada de funcionalidades de edital.

### 2.3 Limites da verificação de estrutura

Conferiu-se presença de tabela e campo escalar, checksums de migrations e objetos atuais do catálogo PostgreSQL. Isso não substitui um diff semântico de todos os tipos/defaults/índices e corpos de funções contra um banco de referência recriado do zero. Os 53 testes escolhidos não medem cobertura percentual nem certificam legislação ou layout externo.

## 3. Quantos módulos temos e como eles aparecem

- **28 cartões** declarados em `src/app/app-domain/dashboard/page.tsx`.
- **29 códigos** em `ConfiguracaoModulo` no Neon; **24 ativos e 5 inativos** na captura.
- **32 áreas funcionais** organizadas neste relatório, contando áreas de apoio/portais com rotas próprias. Essa organização não significa 32 módulos comerciais independentes ou todos visíveis no painel.
- `CADASTROS`, `DOCUMENTOS` e `PORTAL_PACIENTE` estão no cadastro de módulos, mas não possuem cartão próprio no painel examinado.
- `ILUMINACAO_PUBLICA` possui cartão e páginas, mas **não tem registro** em `ConfiguracaoModulo` na captura.
- O cartão `PORTAL_CIDADAO` utiliza `accessCode: ATENDIMENTO`, em vez de um módulo cadastrado com aquele código.
- Controle interno usa `ADMINISTRACAO`; planejamento legislativo reutiliza `PLANEJAMENTO` e também verifica `CAMARA`.
- `/processos` é uma entrada alternativa/redirecionamento de protocolo. `dashboard`, `indicadores` e `notificacoes` são áreas transversais, não foram contadas como novos módulos comerciais.

**Inativos no banco:** `CULTURA`, `EDUCACAO`, `MEIO_AMBIENTE`, `SANEAMENTO` e `SEGURANCA`. A implementação existe no repositório, mas o acesso regular depende da ativação. O guard de módulo trata registro ausente diferentemente de registro explicitamente inativo; revisar consistência do catálogo antes do aceite de permissões.

| Código no banco | Nome cadastrado | Ativo | Cartão direto no painel |
| --- | --- | --- | --- |
| `ADMINISTRACAO` | Administração | Sim | Sim |
| `ATENDIMENTO` | Atendimento ao Cidadão | Sim | Sim |
| `AUDITORIA` | Auditoria | Sim | Sim |
| `CADASTROS` | Cadastros | Sim | Não |
| `CAMARA` | Câmara Municipal | Sim | Sim |
| `CEMITERIOS` | Cemitérios | Sim | Sim |
| `COMPRAS` | Compras e Contratos | Sim | Sim |
| `CONFIGURACOES` | Configurações | Sim | Sim |
| `CULTURA` | Cultura e Lazer | Não | Sim |
| `DOCUMENTOS` | Documentos / GED | Sim | Não |
| `EDUCACAO` | Educação | Não | Sim |
| `FINANCEIRO` | Financeiro e Contábil | Sim | Sim |
| `FROTAS` | Frotas | Sim | Sim |
| `MEIO_AMBIENTE` | Meio Ambiente | Não | Sim |
| `OBRAS` | Obras e Serviços Públicos | Sim | Sim |
| `PATRIMONIO` | Almoxarifado e Patrimônio | Sim | Sim |
| `PLANEJAMENTO` | Planejamento e Orçamento | Sim | Sim |
| `PORTAL_PACIENTE` | Portal do Paciente | Sim | Não |
| `PORTAL_SERVIDOR` | Portal do Servidor | Sim | Sim |
| `PROCESSOS` | Processos e Protocolo | Sim | Sim |
| `RH` | RH e Folha | Sim | Sim |
| `SANEAMENTO` | Água e Saneamento | Não | Sim |
| `SAUDE` | Saúde | Sim | Sim |
| `SEGURANCA` | Segurança e Mobilidade | Não | Sim |
| `SOCIAL` | Assistência Social | Sim | Sim |
| `SST` | Segurança e Medicina do Trabalho | Sim | Sim |
| `SUPORTE_TECNICO` | Suporte Técnico | Sim | Sim |
| `TRANSPARENCIA` | Portal Transparência | Sim | Sim |
| `TRIBUTACAO` | Tributário | Sim | Sim |


## 4. Arquitetura e regras transversais

### 4.1 Plataforma

- Next.js App Router, React, componentes de interface e Server Actions; o arquivo `src/proxy.ts` resolve domínio e rotas internas/públicas.
- Prisma 7 com PostgreSQL/Neon; cliente gerado durante instalação/build; deploy de produção executa migrations.
- Firebase Auth no navegador e Firebase Admin no servidor; troca de ID token por cookie de sessão; autorização e vínculo do usuário resolvidos no banco municipal.
- Blob privado para arquivos; namespace esperado `instances/guarama/documents/`; a função de download confere o prefixo da instância.
- Relatórios são produzidos por serviços/catálogos de domínio, com caminhos PDF/CSV/planilhas/documentos conforme área. Um arquivo renderizado não prova aderência integral ao modelo oficial de um órgão.
- Existem scripts de seed/importação com nomes Aurora/POC/Ibema. A presença desses scripts não significa que foram executados na instância atual, e dados fictícios gerados por eles não seriam automaticamente dados reais.

### 4.2 Autorização e identidade

1. Principal Firebase válido → `Usuario` ativo → perfil ativo → permissão do módulo/operação.
2. Perfil administrativo identificado por `SYSTEM_ADMINISTRATOR`; e-mail configurado do administrador permite reparar/provisionar seu vínculo após autenticação Firebase.
3. Perfis operacionais: `GESTAO_GERAL`, `GESTAO_AREA_SECRETARIA` e `SERVIDOR_AREA_SECRETARIA`, com matriz de permissões e recortes de lotação.
4. Unidades gestoras por `UsuarioUnidadeGestora`; saúde possui escopos de unidade; SST possui concessões clínicas por UG/disciplina/profissional; SUAS aplica vínculo/sigilo no filtro da consulta.
5. Portais resolvem titularidade/vínculo; o paciente usa `Patient.usuarioId` ou a cadeia `Usuario→Employee→Person→Patient`; ele ainda depende do usuário e das permissões do ERP, não de um login de paciente independente demonstrado.
6. Há políticas de validação de retorno ao login e caminhos internos. O proxy redireciona falta de sessão, mas as regras de negócio também precisam validar no servidor.

### 4.3 Regras implementadas no banco

Na captura: **2.032 FKs validadas**, **468 CHECKs validados**, **6 CHECKs NOT VALID**, **289 constraints únicas**, **994 chaves primárias**, **255 triggers de usuário sem nenhuma desativada** e **163 funções no schema public**. Não foram identificados índices inválidos/não prontos.

Há guardas para integridade de entidade/UG/exercício, escopos relacionais, origem contábil, documentos, eventos imutáveis e história funcional. Os anexos técnicos listam tabelas e triggers. Constraint existente é evidência estrutural; a regra de negócio completa também envolve os serviços TypeScript e a configuração vigente.

Os seis `CHECK ... NOT VALID` são os cinco de capacidade/identificação/anexo de cemitérios e `planning_transfer_counterparty`. Essa marcação está nas migrations correspondentes; afeta a certificação retroativa de linhas antigas, não significa que novas gravações escapem da condição.

### 4.4 Limites técnicos encontrados

- Limitador de requisições em `src/lib/platform/rate-limit.ts` usa `Map` em memória e janela de dez tentativas por minuto; não é limite distribuído entre instâncias serverless.
- Segregação existe em vários domínios, mas a completude de ACL em cada ação compartilhada precisa ser demonstrada por perfis de aceite. Exemplo concreto: Iluminação reutiliza ações de Obras com códigos de módulo diferentes.
- Assinatura A1 de hash/documento tem implementação, mas não comprova PAdES/A3/Gov.br ou XMLDSig; o próprio contrato SST separa assinatura GED de assinatura de XML fiscal.
- Provedor de transparência tem endpoint fixo de Ibema; identidade padrão do código ainda é Aurora das Veredas/MG. O cadastro PostgreSQL contém Ibema/PR.
- Títulos genéricos de marketing ainda aparecem no HTML do login publicado. A resposta da raiz contém o formulário de login, não foi classificada pelo título como página comercial.

### 4.5 Sondagem do domínio publicado

Domínio: `https://guarama.celeriflow.com.br`. Consulta sem login; captura em 2026-10-16T18:47:19.343Z.

| Caminho | HTTP | Evidência |
| --- | --- | --- |
| `/` | 200 | Formulário administrativo presente |
| `/login` | 200 | Formulário administrativo presente |
| `/dashboard` | 307 | Redireciona a /login?returnTo=%2Fdashboard |
| `/portal` | 200 | Portal Oficial \| Prefeitura Municipal de Aurora das Veredas |
| `/portal-servidor/entrar` | 200 | CeleriFlow \| Plataforma integrada para administração pública municipal |
| `/api/health` | 200 | {"status":"ok","database":"ready"} |

Os 16 bundles públicos do login foram lidos; a chave pública Firebase local está presente no código publicado: **sim**. Não foi inserida a chave neste relatório.
O health check executa apenas SELECT 1. A raiz e /login contêm o formulário administrativo; o título institucional de Aurora no /portal confirma a pendência de identidade.


## 5. Inventário funcional de todas as áreas

Em cada área, “interno” descreve o caminho implementado identificado; “externo” distingue portal público, importação/exportação, adaptador controlado e comunicação oficial. Os caminhos de páginas são padrões de rota, não confirmação de que cada uma foi aberta com todas as permissões. O estado de dados é o da captura do Neon.

### Leitura rápida da maturidade por área

As classificações abaixo são de **implementação**, não de operação municipal homologada. Todas as áreas de negócio ainda dependem da implantação/carga descrita nas respectivas seções. “Núcleo transacional” indica serviços, regras e persistência identificados; não é nota de completude frente a qualquer edital.

| Seção / área | Capacidade interna identificada | Canal externo / limite principal |
| --- | --- | --- |
| 5.1 Administração | Cadastros e ciclo de vida organizacional | ViaCEP; sem interoperabilidade oficial de órgãos demonstrada |
| 5.2 Cadastros | Base canônica, consistência e mesclagem | Links/consultas auxiliares; sem carga municipal |
| 5.3 Processos | Núcleo de tramitação, documentos e workflow | Portal/consulta implementados; destinos judiciais não comprovados |
| 5.4 GED | Versão, hash, assinatura interna e serviço A1 | Blob/validadores; formato oficial de assinatura a homologar |
| 5.5 Atendimento | Fila, responsáveis, estados, resposta e sigilo | Canal cidadão; SMTP/WhatsApp geral em MOCK |
| 5.6 Portal cidadão | Catálogo, solicitações e executores integrados | Canal web implementado, sem população de cidadãos |
| 5.7 Transparência | Consulta, publicação, LAI e evidências | Fonte HTTP de Ibema; identidade/localização pendentes |
| 5.8 Tributação | Motor, cadastros, crédito, guia e cadeias fiscais | APIs/canais preparados; provedores oficiais a comprovar |
| 5.9 Financeiro | Núcleo de execução, contabilidade e custos | Arquivos e banco virtual; bancos/SICONFI/TCE a homologar |
| 5.10 Planejamento | Instrumentos, versões e ponte com execução | Publicação/importação; recepção oficial não comprovada |
| 5.11 Compras | Núcleo de ciclo de compra/contrato/recebimento | Pacotes e fornecedor; PNCP/TCE geral em MOCK |
| 5.12 RH | Motor parametrizado e ciclo funcional/financeiro | Portal; eSocial e layouts oficiais pendentes |
| 5.13 Portal servidor | Autosserviço ligado à origem funcional | Web implementada; exige vínculo e publicação |
| 5.14 SST | Serviços clínicos, técnicos e integração funcional | Contrato eSocial sem transporte REAL instalado |
| 5.15 Patrimônio | Estoque, inventário, aquisição e ciclo de vida | Documentos; coletores externos não comprovados |
| 5.16 Frotas | Operações, manutenção, consumo e vínculos | Canal motorista/API; telemetria oficial não comprovada |
| 5.17 Educação | Operações acadêmicas e de apoio | Portais; Educacenso simplificado/local |
| 5.18 Saúde | Núcleo clínico, assistencial, logístico e produtivo | Portal e intercâmbio controlado; recepção SUS não comprovada |
| 5.19 Portal paciente | Consulta por identidade/titularidade | Usa usuário/permissão do ERP; sem paciente vinculado |
| 5.20 Assistência social | Prontuário, rede e benefício com entrega | CadÚnico local, sem consulta MDS por rede |
| 5.21 Meio ambiente | CRUDs e emissão simplificada de licença | Validador público/host de licença a concluir |
| 5.22 Saneamento | Cadastros, leituras e motor simplificado | Cobrança sintética, sem PSP/banco real nesse motor |
| 5.23 Obras/construção | Serviços/recursos e workflow de construção | Portal/anexos implementados, depende de regras locais |
| 5.24 Iluminação | Reutiliza operação e estoque de Obras | Concessionária/IoT não comprovados |
| 5.25 Cultura/esporte | Cadastros/reserva e fomento simplificado | Avaliação/prestação precisam de desenvolvimento |
| 5.26 Cemitérios | Estrutura, movimentos, concessão e taxas | Comprovantes/anexos; integração civil não comprovada |
| 5.27 Câmara | Cadastros/consultas e planejamento compartilhado | Controles de UI e ciclo legislativo a completar |
| 5.28 Segurança e mobilidade | Registros operacionais e autuação local | DETRAN/SENATRAN e vídeo por rede não comprovados |
| 5.29 Auditoria | Eventos e consultas com escopo | SIEM/WORM externo não comprovado |
| 5.30 Controle interno | Planos, auditorias, agenda e relatórios | Publicação; envio a órgão externo não comprovado |
| 5.31 Suporte técnico | Página informativa; operação não implementada | Nenhum canal de chamados operacional demonstrado |
| 5.32 Configurações | Administração técnica, perfis e conexões | Firebase/Blob; conexão configurada não comprova transporte |

### 5.1. Administração geral

**Entrada:** `/administracao` · **Código de acesso:** `ADMINISTRACAO` · **Cadastro do código no banco:** ativo · **Páginas:** 16 · **Funções exportadas em arquivos de ações da área:** 25.

- **Subitens:** Instituição; secretarias; departamentos; unidades administrativas; cargos; servidores; demandas internas; calendário; indicadores.
- **Funcionalidades internas implementadas:** Há páginas de consulta e ações de criação, edição e ativação/inativação da estrutura organizacional. A instituição dispõe de identificação, endereço, contatos e logomarca. A hierarquia vincula departamento à secretaria e servidor à sua lotação.
- **Predisposição/canais externos:** Consulta de CEP por ViaCEP aparece no formulário institucional. Não equivale a integração oficial de cadastro de servidores ou órgãos.
- **Regras internas:** Validação de CPF/CNPJ/CEP nos componentes e políticas aplicáveis; bloqueio de inativação com filhos/vínculos ativos; auditoria administrativa; autorização por módulo e operação.
- **Conexões e cadastros:** Person, Employee, Secretariat, Department, AdministrativeUnit e Role alimentam RH, SST, processos, compras, estoque e frotas.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Implantar Institution e estrutura real do município; conciliar entidade jurídica, secretaria, UG e unidade administrativa. Todos esses cadastros operacionais estão vazios na captura.
- **Fontes principais:** `src/app/app-domain/administracao/actions.ts`, `src/lib/administration/c3-policy.ts`.

<details>
<summary>Rotas de páginas da área (16) e ações identificadas</summary>

- `/administracao/calendario/novo` — fonte: `src/app/app-domain/administracao/calendario/novo/page.tsx`.
- `/administracao/calendario` — fonte: `src/app/app-domain/administracao/calendario/page.tsx`.
- `/administracao/cargos/novo` — fonte: `src/app/app-domain/administracao/cargos/novo/page.tsx`.
- `/administracao/cargos` — fonte: `src/app/app-domain/administracao/cargos/page.tsx`.
- `/administracao/demandas` — fonte: `src/app/app-domain/administracao/demandas/page.tsx`.
- `/administracao/departamentos/novo` — fonte: `src/app/app-domain/administracao/departamentos/novo/page.tsx`.
- `/administracao/departamentos` — fonte: `src/app/app-domain/administracao/departamentos/page.tsx`.
- `/administracao/indicadores` — fonte: `src/app/app-domain/administracao/indicadores/page.tsx`.
- `/administracao/instituicao` — fonte: `src/app/app-domain/administracao/instituicao/page.tsx`.
- `/administracao` — fonte: `src/app/app-domain/administracao/page.tsx`.
- `/administracao/secretarias/novo` — fonte: `src/app/app-domain/administracao/secretarias/novo/page.tsx`.
- `/administracao/secretarias` — fonte: `src/app/app-domain/administracao/secretarias/page.tsx`.
- `/administracao/servidores/novo` — fonte: `src/app/app-domain/administracao/servidores/novo/page.tsx`.
- `/administracao/servidores` — fonte: `src/app/app-domain/administracao/servidores/page.tsx`.
- `/administracao/unidades/novo` — fonte: `src/app/app-domain/administracao/unidades/novo/page.tsx`.
- `/administracao/unidades` — fonte: `src/app/app-domain/administracao/unidades/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/administracao/actions.ts`: `deactivateSecretariat`, `activateSecretariat`, `updateSecretariat`, `deactivateDepartment`, `activateDepartment`, `updateDepartment`, `deactivateRole`, `activateRole`, `updateRole`, `deactivateEmployee`, `activateEmployee`, `updateEmployee`, `deactivateAdministrativeUnit`, `activateAdministrativeUnit`, `updateAdministrativeUnit`, `updateInternalDemand`, `deleteCalendarEvent`, `updateCalendarEvent`.
- `src/app/app-domain/administracao/calendario/actions.ts`: `createCalendarEvent`.
- `src/app/app-domain/administracao/cargos/actions.ts`: `createRole`.
- `src/app/app-domain/administracao/departamentos/actions.ts`: `createDepartment`.
- `src/app/app-domain/administracao/instituicao/actions.ts`: `saveInstitution`.
- `src/app/app-domain/administracao/secretarias/actions.ts`: `createSecretariat`.
- `src/app/app-domain/administracao/servidores/actions.ts`: `createEmployee`.
- `src/app/app-domain/administracao/unidades/actions.ts`: `createUnit`.

</details>

### 5.2. Cadastros compartilhados

**Entrada:** `/cadastros` · **Código de acesso:** `CADASTROS` · **Cadastro do código no banco:** ativo · **Páginas:** 25 · **Funções exportadas em arquivos de ações da área:** 21.

- **Subitens:** Pessoas físicas e jurídicas; fornecedores; famílias; entidades; endereços; bairros e logradouros; bancos e agências; moedas; textos legais; signatários; materiais; centros de custo; documentos; qualidade e unificação de identidade.
- **Funcionalidades internas implementadas:** Existem ações de manutenção cadastral, verificações de consistência e fluxo de proposição, aprovação, execução e reversão de mesclagem de pessoas. A mesma pessoa/empresa pode ser reutilizada por vários módulos.
- **Predisposição/canais externos:** Há links de consulta de regularidade fiscal/FGTS para fornecedores e uso de identificadores nacionais. Links de consulta não demonstram consulta automática ou certidão obtida por API.
- **Regras internas:** CPF/CNPJ/CEP, vínculos de família, identidade canônica, unicidade e escopo das referências; a mesclagem possui evidência e reversão específicas.
- **Conexões e cadastros:** Núcleo de Person, Company, Family, FamilyMember, Address, GovernmentEntity, LegalText, Bank e Currency. Reutilizado pelo restante do ERP.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Bank: 2; City: 1; Currency: 1; GovernmentEntity: 2; HealthCbo: 2; State: 1; Tax: 3. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Não há pessoas, empresas, fornecedores, famílias ou endereços municipais carregados. Os registros iniciais de cidade e entidades são de Ibema e precisam ser substituídos/conciliados com a implantação correta.
- **Fontes principais:** `src/app/app-domain/cadastros/master-data-actions.ts`, `src/app/app-domain/configuracoes/mesclagem-pf/actions.ts`.

<details>
<summary>Rotas de páginas da área (25) e ações identificadas</summary>

- `/cadastros/assinantes-legais` — fonte: `src/app/app-domain/cadastros/assinantes-legais/page.tsx`.
- `/cadastros/bancos-agencias` — fonte: `src/app/app-domain/cadastros/bancos-agencias/page.tsx`.
- `/cadastros/cbo` — fonte: `src/app/app-domain/cadastros/cbo/page.tsx`.
- `/cadastros/centros-custo` — fonte: `src/app/app-domain/cadastros/centros-custo/page.tsx`.
- `/cadastros/documentos/novo` — fonte: `src/app/app-domain/cadastros/documentos/novo/page.tsx`.
- `/cadastros/documentos` — fonte: `src/app/app-domain/cadastros/documentos/page.tsx`.
- `/cadastros/entidades` — fonte: `src/app/app-domain/cadastros/entidades/page.tsx`.
- `/cadastros/familias` — fonte: `src/app/app-domain/cadastros/familias/page.tsx`.
- `/cadastros/fornecedores/novo` — fonte: `src/app/app-domain/cadastros/fornecedores/novo/page.tsx`.
- `/cadastros/fornecedores` — fonte: `src/app/app-domain/cadastros/fornecedores/page.tsx`.
- `/cadastros/imoveis/atualizacoes-construcao` — fonte: `src/app/app-domain/cadastros/imoveis/atualizacoes-construcao/page.tsx`.
- `/cadastros/imoveis/novo` — fonte: `src/app/app-domain/cadastros/imoveis/novo/page.tsx`.
- `/cadastros/imoveis` — fonte: `src/app/app-domain/cadastros/imoveis/page.tsx`.
- `/cadastros/localidades` — fonte: `src/app/app-domain/cadastros/localidades/page.tsx`.
- `/cadastros/moedas` — fonte: `src/app/app-domain/cadastros/moedas/page.tsx`.
- `/cadastros/organograma` — fonte: `src/app/app-domain/cadastros/organograma/page.tsx`.
- `/cadastros` — fonte: `src/app/app-domain/cadastros/page.tsx`.
- `/cadastros/pessoas-fisicas/novo` — fonte: `src/app/app-domain/cadastros/pessoas-fisicas/novo/page.tsx`.
- `/cadastros/pessoas-fisicas` — fonte: `src/app/app-domain/cadastros/pessoas-fisicas/page.tsx`.
- `/cadastros/pessoas-juridicas/novo` — fonte: `src/app/app-domain/cadastros/pessoas-juridicas/novo/page.tsx`.
- `/cadastros/pessoas-juridicas` — fonte: `src/app/app-domain/cadastros/pessoas-juridicas/page.tsx`.
- `/cadastros/produtos` — fonte: `src/app/app-domain/cadastros/produtos/page.tsx`.
- `/cadastros/qualidade` — fonte: `src/app/app-domain/cadastros/qualidade/page.tsx`.
- `/cadastros/textos-juridicos` — fonte: `src/app/app-domain/cadastros/textos-juridicos/page.tsx`.
- `/cadastros/tributos` — fonte: `src/app/app-domain/cadastros/tributos/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/cadastros/actions.ts`: `createPerson`, `createCompany`, `updatePerson`, `deactivatePerson`, `activatePerson`, `updateCompany`, `deactivateCompany`, `activateCompany`, `updateRealEstate`, `deactivateRealEstate`, `activateRealEstate`, `createSupplier`, `updateSupplier`, `deactivateSupplier`, `activateSupplier`, `updateDocument`, `deleteDocument`.
- `src/app/app-domain/cadastros/master-data-actions.ts`: `mutateMasterDataRecord`, `setMasterDataRecordActive`, `runMasterDataConsistencyCheck`.
- `src/app/app-domain/cadastros/qualidade/identity-actions.ts`: `reconcileIdentityAction`.

</details>

### 5.3. Processos e protocolo

**Entrada:** `/protocolos` · **Código de acesso:** `PROCESSOS` · **Cadastro do código no banco:** ativo · **Páginas:** 19 · **Funções exportadas em arquivos de ações da área:** 26.

- **Subitens:** Abertura e cadastro; acompanhamento; busca; recebimento e tramitação; workflow; documentos e assinaturas; arquivados; ouvidoria; avisos públicos; processos judiciais; consulta e acompanhamento pelo cidadão.
- **Funcionalidades internas implementadas:** Há persistência de processos, eventos, movimentos, anexos, destinatários e etapas; fluxos de recebimento, atualização, vinculação documental e arquivamento. A rota /processos é uma entrada de redirecionamento e não um segundo módulo independente.
- **Predisposição/canais externos:** Portal público /portal-protocolos, consulta por código e acompanhamento por identidade/autorização; avisos e validadores públicos. Integrações judiciais/protesto não ficam comprovadas apenas pelo cadastro de eventos externos.
- **Regras internas:** Transições de estado e destinatário, versão publicada de workflow, permissões por unidade, visibilidade de documento e trilha de auditoria. Documentos exigidos e etapas condicionam o avanço.
- **Conexões e cadastros:** Tipos/assuntos de processo, departamentos, usuários, GED, assinaturas, canais de atendimento e notificações; usado por compras, RH, tributação e construção civil.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Implantar tipos, assuntos, fluxos, responsáveis, prazos e documentos do município. Não há processos carregados nem prova de integração processual externa em produção.
- **Fontes principais:** `src/lib/protocols/generic-workflow-policy.ts`, `src/app/app-domain/protocolos`, `src/app/app-domain/processos/page.tsx`.

<details>
<summary>Rotas de páginas da área (19) e ações identificadas</summary>

- `/protocolos/acompanhamento` — fonte: `src/app/app-domain/protocolos/acompanhamento/page.tsx`.
- `/protocolos/arquivados` — fonte: `src/app/app-domain/protocolos/arquivados/page.tsx`.
- `/protocolos/assinaturas` — fonte: `src/app/app-domain/protocolos/assinaturas/page.tsx`.
- `/protocolos/busca` — fonte: `src/app/app-domain/protocolos/busca/page.tsx`.
- `/protocolos/consultas-construcao-civil` — fonte: `src/app/app-domain/protocolos/consultas-construcao-civil/page.tsx`.
- `/protocolos/notificacoes` — fonte: `src/app/app-domain/protocolos/notificacoes/page.tsx`.
- `/protocolos/ouvidoria/[id]` — fonte: `src/app/app-domain/protocolos/ouvidoria/[id]/page.tsx`.
- `/protocolos/ouvidoria/nova` — fonte: `src/app/app-domain/protocolos/ouvidoria/nova/page.tsx`.
- `/protocolos/ouvidoria` — fonte: `src/app/app-domain/protocolos/ouvidoria/page.tsx`.
- `/protocolos` — fonte: `src/app/app-domain/protocolos/page.tsx`.
- `/protocolos/processos/[id]/judicial` — fonte: `src/app/app-domain/protocolos/processos/[id]/judicial/page.tsx`.
- `/protocolos/processos/[id]` — fonte: `src/app/app-domain/protocolos/processos/[id]/page.tsx`.
- `/protocolos/processos/novo` — fonte: `src/app/app-domain/protocolos/processos/novo/page.tsx`.
- `/protocolos/processos` — fonte: `src/app/app-domain/protocolos/processos/page.tsx`.
- `/protocolos/relatorios` — fonte: `src/app/app-domain/protocolos/relatorios/page.tsx`.
- `/protocolos/servicos/acessos` — fonte: `src/app/app-domain/protocolos/servicos/acessos/page.tsx`.
- `/protocolos/servicos` — fonte: `src/app/app-domain/protocolos/servicos/page.tsx`.
- `/protocolos/servicos/solicitacoes/[id]` — fonte: `src/app/app-domain/protocolos/servicos/solicitacoes/[id]/page.tsx`.
- `/protocolos/servicos/solicitacoes` — fonte: `src/app/app-domain/protocolos/servicos/solicitacoes/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/protocolos/actions.ts`: `createProtocol`, `receiveProcess`, `receiveProcessesBatch`, `forwardProcess`, `cancelProcessForwarding`, `rejectProcessForwarding`, `addProcessDispatch`, `concludeProcess`, `approveGenericProcessWorkflow`, `returnGenericProcessWorkflow`, `rejectGenericProcessWorkflow`, `concludeGenericProcessWorkflow`, `archiveProcess`, `reopenProcess`, `markProtocolNotificationRead`, `requestProcessSignatures`, `signProcessDocumentInternally`, `publishProcessNotice`.
- `src/app/app-domain/protocolos/processos/[id]/citizen-access-actions.ts`: `grantCitizenProcessAccess`, `revokeCitizenProcessAccess`.
- `src/app/app-domain/protocolos/servicos/acessos/actions.ts`: `decideCitizenAccessAction`.
- `src/app/app-domain/protocolos/servicos/actions.ts`: `prepareServiceTemplatesAction`, `saveDigitalServiceAction`, `programServiceRequestsAction`, `finishServiceScheduleAction`, `saveServiceNoticeAction`.

</details>

### 5.4. Documentos, GED e assinaturas

**Entrada:** `/documentos` · **Código de acesso:** `DOCUMENTOS` · **Cadastro do código no banco:** ativo · **Páginas:** 4 · **Funções exportadas em arquivos de ações da área:** 9.

- **Subitens:** GED; pastas; modelos; versões; solicitações de assinatura; assinatura interna; certificado A1; verificação pública; downloads controlados.
- **Funcionalidades internas implementadas:** Há versionamento e hash de documentos, classes documentais, ingestão e ligações com processos. Assinatura interna registra a identidade autenticada; assinatura A1 de hash possui serviço próprio, inventário e evidência de uso.
- **Predisposição/canais externos:** Armazenamento privado Vercel Blob e rotas de validação pública. O serviço A1 exige certificado, cadeia e segredo de chave configurados. Não foi comprovado A3, login/assinatura Gov.br, PAdES embutido ou transmissão XMLDSig por essa assinatura de hash.
- **Regras internas:** Classe determina política de assinatura; versão final desbloqueada e documento válido; certificado ativo/vigente e autorizado para a finalidade; hash, versão e signatário preservados; download exige autorização e namespace da instância.
- **Conexões e cadastros:** Document, DocumentVersion, DocumentClass, DocumentSignature, DigitalCertificate, DocumentIcpEvidence, Process e Blob.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Blob e documentos estão vazios; não há certificado cadastrado. Homologar o formato e a validação de assinatura exigidos por cada edital; A1 detached não prova automaticamente PAdES/A3/Gov.br.
- **Fontes principais:** `src/lib/documents/document-flow-service.ts`, `src/lib/signatures/a1-signature-service.ts`, `src/lib/security/icp-brasil.ts`, `src/lib/platform/blob.ts`.

<details>
<summary>Rotas de páginas da área (4) e ações identificadas</summary>

- `/documentos/assinaturas` — fonte: `src/app/app-domain/documentos/assinaturas/page.tsx`.
- `/documentos/ged` — fonte: `src/app/app-domain/documentos/ged/page.tsx`.
- `/documentos/modelos` — fonte: `src/app/app-domain/documentos/modelos/page.tsx`.
- `/documentos` — fonte: `src/app/app-domain/documentos/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/documentos/assinaturas/actions.ts`: `signDocumentInternally`.
- `src/app/app-domain/documentos/ged/actions.ts`: `createFolder`, `createDocument`, `requestInternalSignatures`, `deleteDocument`, `deleteFolder`.
- `src/app/app-domain/documentos/modelos/actions.ts`: `updateModelo`, `deleteModelo`, `createModelo`.

</details>

### 5.5. Atendimento ao cidadão e ouvidoria

**Entrada:** `/atendimento` · **Código de acesso:** `ATENDIMENTO` · **Cadastro do código no banco:** ativo · **Páginas:** 10 · **Funções exportadas em arquivos de ações da área:** 23.

- **Subitens:** Central de chamados; fila; novo atendimento; detalhes; canais; responsáveis; prazos; ouvidoria; anexos; relatórios.
- **Funcionalidades internas implementadas:** Existem filas e indicadores de aberto, em atendimento, aguardando informação, resolvido e atrasado. Ações persistem atendimento, atualização, encaminhamento e respostas com anexos.
- **Predisposição/canais externos:** Solicitações do portal do cidadão e manifestações públicas entram nos canais municipais; há política de sigilo de ouvidoria. Comunicação via WhatsApp/SMTP do catálogo geral não representa integração real já habilitada.
- **Regras internas:** Acesso por canal, unidade e papel; proteção da identidade conforme tipo de manifestação; prazo e transição de atendimento; anexos submetidos às políticas do GED.
- **Conexões e cadastros:** SupportTicket/SupportChannel, processos, Person, CitizenAccount, departamentos, usuários e documentos.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Cadastrar canais oficiais, lotações e responsáveis; testar uma jornada completa com cidadão e servidor. A instância não tem atendimentos nem canais carregados.
- **Fontes principais:** `src/lib/attendance/access.ts`, `src/app/app-domain/atendimento`, `src/lib/attendance/__tests__/ombudsman-disclosure-policy.test.ts`.

<details>
<summary>Rotas de páginas da área (10) e ações identificadas</summary>

- `/atendimento/central` — fonte: `src/app/app-domain/atendimento/central/page.tsx`.
- `/atendimento/chamados/[id]` — fonte: `src/app/app-domain/atendimento/chamados/[id]/page.tsx`.
- `/atendimento/configuracoes` — fonte: `src/app/app-domain/atendimento/configuracoes/page.tsx`.
- `/atendimento/fila` — fonte: `src/app/app-domain/atendimento/fila/page.tsx`.
- `/atendimento/novo` — fonte: `src/app/app-domain/atendimento/novo/page.tsx`.
- `/atendimento/ouvidoria/[id]` — fonte: `src/app/app-domain/atendimento/ouvidoria/[id]/page.tsx`.
- `/atendimento/ouvidoria/nova` — fonte: `src/app/app-domain/atendimento/ouvidoria/nova/page.tsx`.
- `/atendimento/ouvidoria` — fonte: `src/app/app-domain/atendimento/ouvidoria/page.tsx`.
- `/atendimento` — fonte: `src/app/app-domain/atendimento/page.tsx`.
- `/atendimento/relatorios` — fonte: `src/app/app-domain/atendimento/relatorios/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/atendimento/actions.ts`: `createTicket`, `createOmbudsman`, `assumeTicket`, `assignTicket`, `forwardTicket`, `addTicketInteraction`, `resolveTicket`, `concludeTicket`, `reopenTicket`, `updateTicketStatus`, `updateOmbudsmanStatus`, `createProcessFromTicket`, `forwardOmbudsman`, `startOmbudsmanTriage`, `startOmbudsmanInvestigation`, `addOmbudsmanInteraction`, `respondOmbudsman`, `concludeOmbudsman`, `createProcessFromOmbudsman`, `grantOmbudsmanAccess`, `revokeOmbudsmanAccess`, `saveSupportChannel`, `saveServiceSubject`.

</details>

### 5.6. Portal do cidadão e portal institucional

**Entrada:** `/portal-cidadao` · **Código de acesso:** `ATENDIMENTO` · **Cadastro do código no banco:** ativo · **Páginas:** 1 · **Funções exportadas em arquivos de ações da área:** 0.

- **Subitens:** Notícias, páginas, banners e contatos; cadastro e acesso do cidadão; catálogo e carta de serviços; solicitações e complementações; agendamentos; reserva de espaços; área pessoal; conta tributária; concursos; construção civil.
- **Funcionalidades internas implementadas:** A entrada administrativa organiza o conteúdo e os canais já mantidos em outras áreas, sobretudo transparência. Serviços têm políticas, modelos, documentos exigidos e executores internos; não são apenas links de menu.
- **Predisposição/canais externos:** Rotas /portal, /portal/minha-area, /portal/servicos/[slug], /portal/concursos e /portal/construcao-civil; upload autenticado, geolocalização com OpenStreetMap/Nominatim e comprovantes. Existem canais externos implementados, mas vazios nesta instância.
- **Regras internas:** Identidade do cidadão, representação e titularidade; acesso restrito às próprias solicitações; validação de evidências e documentos obrigatórios; estados e complementações preservam a origem do atendimento.
- **Conexões e cadastros:** ATENDIMENTO é o código de acesso do cartão PORTAL_CIDADAO; depende de conteúdos institucionais, processos, tributação, cultura/espaços, RH/concursos e construção civil conforme o serviço.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoPerfil: 4; DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Carta de serviços, canais, conteúdo e contas de cidadão não populados. Concluir configuração de identidade e testar cada executor; não há prova de integração Gov.br ou aplicativo móvel nativo.
- **Fontes principais:** `src/app/app-domain/dashboard/page.tsx`, `src/lib/portal-cidadao/catalog.ts`, `src/lib/portal-cidadao/requests.ts`, `src/lib/portal-cidadao/tax-executors.ts`.

<details>
<summary>Rotas de páginas da área (1) e ações identificadas</summary>

- `/portal-cidadao` — fonte: `src/app/app-domain/portal-cidadao/page.tsx`.

</details>

### 5.7. Transparência, LAI, e-SIC e PNTP

**Entrada:** `/transparencia` · **Código de acesso:** `TRANSPARENCIA` · **Cadastro do código no banco:** ativo · **Páginas:** 15 · **Funções exportadas em arquivos de ações da área:** 22.

- **Subitens:** Consultas financeiras; pessoal; contratos e licitações; diário oficial; documentos públicos; fontes nativas e externas; notícias, banners e páginas; solicitações e recursos LAI; inventário de acessos; critérios e evidências PNTP.
- **Funcionalidades internas implementadas:** Há consultas nativas vinculadas a entidades/UGs, preservação de publicações/documentos, classificação, metadados, exportações e tratamento de pedido e recurso com prazos. Existe registro de evidência de critério PNTP.
- **Predisposição/canais externos:** Portal /portal/portaldatransparencia e APIs públicas. Provedor HTTP específico da API pública de Ibema está implementado; consulta externa ao portal não copia automaticamente seus dados para o Neon.
- **Regras internas:** Fonte explícita, recorte de entidade/exercício, filtros e preservação de origem; publicação de pessoal depende de política; ausência de informação não deve se passar por dado confirmado. Evidência PNTP cadastrada não é certificação externa.
- **Conexões e cadastros:** Financeiro, RH, compras, planejamento, GED, suporte/canais de e-SIC, ConfiguracaoParametroInstancia e entidades jurídicas.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: GovernmentEntity: 2. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** O fallback usa API_IBEMA, códigos externos 1/2 e identidade Aurora das Veredas do código, enquanto Neon contém Ibema. Configurar fonte/identidade de Guarama e vinculações nativas; não há publicações, evidências PNTP ou pedidos LAI nesta captura.
- **Fontes principais:** `src/lib/transparencia/presentation-settings.ts`, `src/lib/transparencia/ibema-provider.ts`, `src/lib/transparencia/query-contract.ts`, `src/app/app-domain/transparencia`.

<details>
<summary>Rotas de páginas da área (15) e ações identificadas</summary>

- `/transparencia/acessos` — fonte: `src/app/app-domain/transparencia/acessos/page.tsx`.
- `/transparencia/banners` — fonte: `src/app/app-domain/transparencia/banners/page.tsx`.
- `/transparencia/contratos` — fonte: `src/app/app-domain/transparencia/contratos/page.tsx`.
- `/transparencia/diario-oficial/novo` — fonte: `src/app/app-domain/transparencia/diario-oficial/novo/page.tsx`.
- `/transparencia/diario-oficial` — fonte: `src/app/app-domain/transparencia/diario-oficial/page.tsx`.
- `/transparencia/fontes` — fonte: `src/app/app-domain/transparencia/fontes/page.tsx`.
- `/transparencia/licitacoes` — fonte: `src/app/app-domain/transparencia/licitacoes/page.tsx`.
- `/transparencia/noticias/novo` — fonte: `src/app/app-domain/transparencia/noticias/novo/page.tsx`.
- `/transparencia/noticias` — fonte: `src/app/app-domain/transparencia/noticias/page.tsx`.
- `/transparencia` — fonte: `src/app/app-domain/transparencia/page.tsx`.
- `/transparencia/paginas/novo` — fonte: `src/app/app-domain/transparencia/paginas/novo/page.tsx`.
- `/transparencia/paginas` — fonte: `src/app/app-domain/transparencia/paginas/page.tsx`.
- `/transparencia/pntp` — fonte: `src/app/app-domain/transparencia/pntp/page.tsx`.
- `/transparencia/publicacoes` — fonte: `src/app/app-domain/transparencia/publicacoes/page.tsx`.
- `/transparencia/solicitacoes` — fonte: `src/app/app-domain/transparencia/solicitacoes/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/transparencia/diario-oficial/actions.ts`: `createDiary`, `deleteDiary`.
- `src/app/app-domain/transparencia/fontes/actions.ts`: `configureNativeSource`.
- `src/app/app-domain/transparencia/licitacoes/actions.ts`: `uploadBiddingsCsv`.
- `src/app/app-domain/transparencia/noticias/actions.ts`: `createNews`, `deleteNews`.
- `src/app/app-domain/transparencia/paginas/actions.ts`: `createPage`, `deletePage`.
- `src/app/app-domain/transparencia/pntp/actions.ts`: `recordPntpEvidence`.
- `src/app/app-domain/transparencia/publicacoes/actions.ts`: `saveTransparencySettings`, `changePublicationStatus`, `editPublicationMetadata`, `deletePublicationDraft`, `configureDocumentQuery`, `createExternalPublication`, `registerAvailabilityDeclaration`, `clearAvailabilityDeclaration`, `archivePublicConsultationReport`, `classifyPublicDocument`.
- `src/app/app-domain/transparencia/solicitacoes/actions.ts`: `respondCitizenRequest`, `extendCitizenDeadline`, `respondCitizenAppeal`.

</details>

### 5.8. Tributação, arrecadação e dívida ativa

**Entrada:** `/tributacao` · **Código de acesso:** `TRIBUTACAO` · **Cadastro do código no banco:** ativo · **Páginas:** 61 · **Funções exportadas em arquivos de ações da área:** 241.

- **Subitens:** Contribuintes; cadastro econômico e imobiliário/BCI; PGV; atividades CNAE/CBO; contadores; perfis, histórico e alterações em lote; IPTU/ITBI/ISS; motor fiscal; guias, PIX e retornos; cotas e lotes anuais; alvarás; certidões; fiscalização; cobrança e parcelamento; dívida ativa/CDA/protesto/execução; DTE; NFS-e/RPS/DMS; Simples; DES-IF; VAF; BI e relatórios.
- **Funcionalidades internas implementadas:** Há motores fiscais e serviços transacionais para constituição/revisão de crédito, lançamento de guia, baixa e estorno, dívida ativa e ligação contábil. Cadastro configurável, restrição de alterações imobiliárias e memórias/versionamento de cálculo estão implementados. NFS-e e DES-IF possuem rotas de entrada e processamento local.
- **Predisposição/canais externos:** Canais do portal para tributos, ITBI e documentos; APIs /api/tributacao/nfse/rps, /dms e /desif/importacoes; webhook bancário e preparação de cobrança/retorno. REDESIM, protesto, MNI, PSP e NFS-e nacional precisam de adaptador e evidência de protocolo reais; nomes de telas/eventos não provam comunicação oficial.
- **Regras internas:** Vigência de regra e perfil fiscal, titularidade/representação, idempotência, situação do crédito, integridade guia→pagamento→receita/contabilidade; restrições por imóvel e ente; estorno preserva cadeia e eventos.
- **Conexões e cadastros:** Person/Company/Taxpayer, RealEstate, EconomicRegistration, Tax/TaxParameter, Process, Document, FinancialYear, BankAccount, RevenueNature, ResourceSource, regras e planos contábeis.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; HealthCbo: 2; Tax: 3; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Só existem três tributos-base e referências mínimas; não há contribuintes, imóveis, lançamentos, parâmetros fiscais ou vínculos financeiros carregados. Publicar legislação/tabelas locais e implementar/homologar provedores externos específicos antes de afirmar arrecadação bancária nacional ou NFS-e oficial em produção.
- **Fontes principais:** `src/lib/tributacao/fiscal-engine.ts`, `src/lib/tributacao/s2-service.ts`, `src/lib/tributacao/s6-service.ts`, `src/lib/tributacao/s7-service.ts`, `src/lib/tributacao/s8-service.ts`, `src/app/api/tributacao`.

<details>
<summary>Rotas de páginas da área (61) e ações identificadas</summary>

- `/tributacao/alvaras/configurados` — fonte: `src/app/app-domain/tributacao/alvaras/configurados/page.tsx`.
- `/tributacao/alvaras` — fonte: `src/app/app-domain/tributacao/alvaras/page.tsx`.
- `/tributacao/avaliacoes` — fonte: `src/app/app-domain/tributacao/avaliacoes/page.tsx`.
- `/tributacao/avaliacoes/simulacao` — fonte: `src/app/app-domain/tributacao/avaliacoes/simulacao/page.tsx`.
- `/tributacao/base-territorial` — fonte: `src/app/app-domain/tributacao/base-territorial/page.tsx`.
- `/tributacao/bi-tributario` — fonte: `src/app/app-domain/tributacao/bi-tributario/page.tsx`.
- `/tributacao/calendarios` — fonte: `src/app/app-domain/tributacao/calendarios/page.tsx`.
- `/tributacao/cemiterios` — fonte: `src/app/app-domain/tributacao/cemiterios/page.tsx`.
- `/tributacao/certidoes` — fonte: `src/app/app-domain/tributacao/certidoes/page.tsx`.
- `/tributacao/cobranca` — fonte: `src/app/app-domain/tributacao/cobranca/page.tsx`.
- `/tributacao/comparativo-anual` — fonte: `src/app/app-domain/tributacao/comparativo-anual/page.tsx`.
- `/tributacao/configuracoes-cadastrais` — fonte: `src/app/app-domain/tributacao/configuracoes-cadastrais/page.tsx`.
- `/tributacao/configuracoes-cadastrais/pgv-lote` — fonte: `src/app/app-domain/tributacao/configuracoes-cadastrais/pgv-lote/page.tsx`.
- `/tributacao/divida-ativa` — fonte: `src/app/app-domain/tributacao/divida-ativa/page.tsx`.
- `/tributacao/divida` — fonte: `src/app/app-domain/tributacao/divida/page.tsx`.
- `/tributacao/domicilio-tributario` — fonte: `src/app/app-domain/tributacao/domicilio-tributario/page.tsx`.
- `/tributacao/economico/[id]` — fonte: `src/app/app-domain/tributacao/economico/[id]/page.tsx`.
- `/tributacao/economico/[id]/perfil` — fonte: `src/app/app-domain/tributacao/economico/[id]/perfil/page.tsx`.
- `/tributacao/economico/alteracao-geral` — fonte: `src/app/app-domain/tributacao/economico/alteracao-geral/page.tsx`.
- `/tributacao/economico/atividades` — fonte: `src/app/app-domain/tributacao/economico/atividades/page.tsx`.
- `/tributacao/economico/consulta` — fonte: `src/app/app-domain/tributacao/economico/consulta/page.tsx`.
- `/tributacao/economico/contadores` — fonte: `src/app/app-domain/tributacao/economico/contadores/page.tsx`.
- `/tributacao/economico/eventos-veiculos` — fonte: `src/app/app-domain/tributacao/economico/eventos-veiculos/page.tsx`.
- `/tributacao/economico/novo` — fonte: `src/app/app-domain/tributacao/economico/novo/page.tsx`.
- `/tributacao/economico` — fonte: `src/app/app-domain/tributacao/economico/page.tsx`.
- `/tributacao/fiscalizacao` — fonte: `src/app/app-domain/tributacao/fiscalizacao/page.tsx`.
- `/tributacao/fontes-cadastrais` — fonte: `src/app/app-domain/tributacao/fontes-cadastrais/page.tsx`.
- `/tributacao/guias` — fonte: `src/app/app-domain/tributacao/guias/page.tsx`.
- `/tributacao/imoveis/[id]/bloqueio` — fonte: `src/app/app-domain/tributacao/imoveis/[id]/bloqueio/page.tsx`.
- `/tributacao/imoveis/[id]` — fonte: `src/app/app-domain/tributacao/imoveis/[id]/page.tsx`.
- `/tributacao/imoveis/[id]/perfil` — fonte: `src/app/app-domain/tributacao/imoveis/[id]/perfil/page.tsx`.
- `/tributacao/imoveis/alteracao-geral` — fonte: `src/app/app-domain/tributacao/imoveis/alteracao-geral/page.tsx`.
- `/tributacao/imoveis/configuracao` — fonte: `src/app/app-domain/tributacao/imoveis/configuracao/page.tsx`.
- `/tributacao/imoveis/novo` — fonte: `src/app/app-domain/tributacao/imoveis/novo/page.tsx`.
- `/tributacao/imoveis/operacoes/comprovante/[id]` — fonte: `src/app/app-domain/tributacao/imoveis/operacoes/comprovante/[id]/page.tsx`.
- `/tributacao/imoveis/operacoes` — fonte: `src/app/app-domain/tributacao/imoveis/operacoes/page.tsx`.
- `/tributacao/imoveis` — fonte: `src/app/app-domain/tributacao/imoveis/page.tsx`.
- `/tributacao/iss-bancario` — fonte: `src/app/app-domain/tributacao/iss-bancario/page.tsx`.
- `/tributacao/itbi/bloqueios` — fonte: `src/app/app-domain/tributacao/itbi/bloqueios/page.tsx`.
- `/tributacao/itbi/cancelamento-automatico` — fonte: `src/app/app-domain/tributacao/itbi/cancelamento-automatico/page.tsx`.
- `/tributacao/itbi/comunicacao` — fonte: `src/app/app-domain/tributacao/itbi/comunicacao/page.tsx`.
- `/tributacao/itbi/modelos` — fonte: `src/app/app-domain/tributacao/itbi/modelos/page.tsx`.
- `/tributacao/itbi/online` — fonte: `src/app/app-domain/tributacao/itbi/online/page.tsx`.
- `/tributacao/itbi` — fonte: `src/app/app-domain/tributacao/itbi/page.tsx`.
- `/tributacao/itbi/processos` — fonte: `src/app/app-domain/tributacao/itbi/processos/page.tsx`.
- `/tributacao/lotes-anuais` — fonte: `src/app/app-domain/tributacao/lotes-anuais/page.tsx`.
- `/tributacao/motor-fiscal/[id]` — fonte: `src/app/app-domain/tributacao/motor-fiscal/[id]/page.tsx`.
- `/tributacao/motor-fiscal` — fonte: `src/app/app-domain/tributacao/motor-fiscal/page.tsx`.
- `/tributacao/movimentacoes-contabeis` — fonte: `src/app/app-domain/tributacao/movimentacoes-contabeis/page.tsx`.
- `/tributacao/nfse` — fonte: `src/app/app-domain/tributacao/nfse/page.tsx`.
- `/tributacao/notificacoes` — fonte: `src/app/app-domain/tributacao/notificacoes/page.tsx`.
- `/tributacao/operacoes` — fonte: `src/app/app-domain/tributacao/operacoes/page.tsx`.
- `/tributacao` — fonte: `src/app/app-domain/tributacao/page.tsx`.
- `/tributacao/pessoas/[id]` — fonte: `src/app/app-domain/tributacao/pessoas/[id]/page.tsx`.
- `/tributacao/pessoas` — fonte: `src/app/app-domain/tributacao/pessoas/page.tsx`.
- `/tributacao/recadastramento` — fonte: `src/app/app-domain/tributacao/recadastramento/page.tsx`.
- `/tributacao/redesim` — fonte: `src/app/app-domain/tributacao/redesim/page.tsx`.
- `/tributacao/resumo-anual` — fonte: `src/app/app-domain/tributacao/resumo-anual/page.tsx`.
- `/tributacao/simples-nacional/arquivos` — fonte: `src/app/app-domain/tributacao/simples-nacional/arquivos/page.tsx`.
- `/tributacao/simples-nacional` — fonte: `src/app/app-domain/tributacao/simples-nacional/page.tsx`.
- `/tributacao/vaf` — fonte: `src/app/app-domain/tributacao/vaf/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/tributacao/alvaras/actions.ts`: `createLicense`, `updateLicense`, `deactivateLicense`, `activateLicense`.
- `src/app/app-domain/tributacao/alvaras/configurados/actions.ts`: `signConfiguredLicenseAction`, `publishLicensePolicyAction`, `issueConfiguredLicensesAction`, `transitionConfiguredLicenseAction`.
- `src/app/app-domain/tributacao/avaliacoes/actions.ts`: `publishValuationRuleAction`, `saveValuationAction`.
- `src/app/app-domain/tributacao/avaliacoes/simulacao/actions.ts`: `assessPropertySimulationAction`.
- `src/app/app-domain/tributacao/base-territorial/actions.ts`: `saveTerritorialRecord`.
- `src/app/app-domain/tributacao/bi-tributario/actions.ts`: `loadBiAction`.
- `src/app/app-domain/tributacao/cadastros-fiscais/actions.ts`: `saveTaxRegistryEntry`, `reviewTaxRegistryEntry`, `registerRedesimEvent`, `requestRegistrySourceLookup`, `bulkUpdateTaxpayersByFilter`.
- `src/app/app-domain/tributacao/calendarios/actions.ts`: `issueScheduledGuidesAction`.
- `src/app/app-domain/tributacao/cemiterios/actions.ts`: `createCemeteryAction`, `createSectorAction`, `createGraveAction`, `registerEmployeeAction`, `registerFuneralHomeAction`, `registerDeceasedAction`, `registerMovementAction`, `grantConcessionAction`, `issueCemeteryFeeAction`, `enrollCemeteryFeeInDebtAction`.
- `src/app/app-domain/tributacao/certidoes/actions.ts`: `createCertificate`, `cancelCertificate`.
- `src/app/app-domain/tributacao/cobranca/actions.ts`: `createPortfolioAction`, `scheduleCollectionActionAction`, `completeCollectionActionAction`, `grantPortalAccessAction`, `createBenefitRuleAction`, `createPrizeDrawAction`, `issuePrizeCouponAction`, `executePrizeDrawAction`.
- `src/app/app-domain/tributacao/configuracoes-cadastrais/actions.ts`: `publishFiscalCatalogAction`, `saveConfiguredFiscalRecordAction`.
- `src/app/app-domain/tributacao/configuracoes-cadastrais/pgv-lote/actions.ts`: `bulkChangePgvAction`.
- `src/app/app-domain/tributacao/divida/actions.ts`: `createActiveDebt`, `updateActiveDebt`, `cancelActiveDebt`, `reactivateActiveDebt`.
- `src/app/app-domain/tributacao/divida-ativa/actions.ts`: `enrollAssessmentAction`, `enrollManualAction`, `validateDebtAction`, `issueCdaAction`, `annotateCdaAction`, `versionCdaAction`, `signCdaAction`, `createDaPortfolioAction`, `refreshDaPortfolioAction`, `issueDaGuideAction`, `suspendDebtAction`, `resumeDebtAction`, `returnDebtToOriginAction`, `settleDebtByGuideAction`, `writeOffDebtAction`, `runPrescriptionAction`, `createProtestBatchAction`, `registerProtestReturnAction`, `resolveProtestItemAction`, `createExecutionBatchAction`, `openExecutionCaseAction`, `advanceExecutionCaseAction`, `registerMniAction`, `scheduleHearingAction`.
- `src/app/app-domain/tributacao/domicilio-tributario/actions.ts`: `createMailboxAction`, `confirmMailboxAction`, `createAccessGrantAction`, `validateAccessGrantAction`, `revokeAccessGrantAction`, `sendDteAction`, `readDteAction`, `acknowledgeDteAction`, `tacitDteAction`, `deleteDteAction`, `createPowerAction`, `transitionPowerAction`.
- `src/app/app-domain/tributacao/economico/actions.ts`: `createEconomicRegistration`, `updateEconomicRegistration`, `deactivateEconomicRegistration`, `activateEconomicRegistration`.
- `src/app/app-domain/tributacao/economico/alteracao-geral/actions.ts`: `bulkChangeEconomicProfilesAction`.
- `src/app/app-domain/tributacao/economico/atividades/actions.ts`: `publishEconomicActivityAction`, `unifyEconomicActivitiesAction`.
- `src/app/app-domain/tributacao/economico/contadores/actions.ts`: `publishAccountantAction`.
- `src/app/app-domain/tributacao/economico/eventos-veiculos/actions.ts`: `publishEventTypeAction`, `saveEventAction`, `issueEventLicenseAction`, `saveVehicleAction`.
- `src/app/app-domain/tributacao/economico/[id]/perfil/actions.ts`: `saveEconomicProfileAction`, `createEconomicRegistrationWithProfileAction`.
- `src/app/app-domain/tributacao/fiscalizacao/actions.ts`: `createInfraction`, `updateInfraction`, `updateInfractionStatus`.
- `src/app/app-domain/tributacao/fiscalizacao/fiscalizacao-actions.ts`: `runTaxAuditAction`, `issueInfractionNoticeAction`, `getTaxAuditRecordsAction`.
- `src/app/app-domain/tributacao/fiscalizacao/s7-actions.ts`: `createFiscalPlanAction`, `generatePlanOrdersAction`, `createStandaloneOrderAction`, `markOrderReadAction`, `issueTiafAction`, `acknowledgeTiafAction`, `cancelTiafAction`, `receiveDocumentAction`, `returnDocumentAction`, `createAssessmentMapAction`, `finalizeMapAction`, `issueSeizureAction`, `closeOrderAction`, `communicateDocumentAction`, `runMeshesAction`, `createOrderFromMeshAction`, `confirmProductivityAction`, `saveTemplateAction`, `savePenaltyRuleAction`.
- `src/app/app-domain/tributacao/guias/actions.ts`: `payGuide`, `cancelGuide`, `reverseGuidePayment`.
- `src/app/app-domain/tributacao/imoveis/actions.ts`: `createRealEstate`, `updateRealEstate`, `deactivateRealEstate`, `activateRealEstate`.
- `src/app/app-domain/tributacao/imoveis/alteracao-geral/actions.ts`: `previewPropertyBulkAction`, `changePropertiesBulkAction`.
- `src/app/app-domain/tributacao/imoveis/configuracao/actions.ts`: `publishPropertyRegistrationPolicyAction`.
- `src/app/app-domain/tributacao/imoveis/operacoes/actions.ts`: `bulkChangePropertiesAction`, `copyPropertiesAction`, `reorganizePropertiesAction`.
- `src/app/app-domain/tributacao/imoveis/property-actions.ts`: `calculatePropertyPreviewAction`, `calculateTerritorialFractionAction`, `createCondominiumSubunit`, `copyPropertyCharacteristics`.
- `src/app/app-domain/tributacao/imoveis/[id]/bloqueio/actions.ts`: `publishPropertyEditRestrictionAction`, `approvePropertyEditAction`.
- `src/app/app-domain/tributacao/imoveis/[id]/perfil/actions.ts`: `savePropertyProfileAction`, `createPropertyWithProfileAction`.
- `src/app/app-domain/tributacao/iss-bancario/actions.ts`: `createInstitutionAction`, `createAgencyAction`, `validateImportAction`, `processImportAction`, `receiveImportAction`, `issueGuideAction`, `openFiscalCaseAction`, `communicateFiscalCaseAction`.
- `src/app/app-domain/tributacao/itbi/actions.ts`: `transferItbiManuallyAction`, `saveItbiTypeAction`, `createItbiAction`, `transmitItbiAction`, `analyzeItbiAction`, `issueItbiDamAction`, `generateItbiDocumentAction`.
- `src/app/app-domain/tributacao/itbi/bloqueios/actions.ts`: `publishItbiEntryPolicyAction`.
- `src/app/app-domain/tributacao/itbi/cancelamento-automatico/actions.ts`: `publishItbiExpiryPolicyAction`, `executeItbiExpiryAction`.
- `src/app/app-domain/tributacao/itbi/collection-actions.ts`: `createItbiPropertyCollectionAction`.
- `src/app/app-domain/tributacao/itbi/comunicacao/actions.ts`: `rectifyTransferredItbiAction`, `decideItbiFiscalTreatmentAction`, `configureItbiCorrespondenceAction`, `grantItbiAccessAction`, `sendInternalItbiMessageAction`.
- `src/app/app-domain/tributacao/itbi/modelos/actions.ts`: `publishItbiDocumentModelAction`, `issueConfiguredItbiDocumentAction`.
- `src/app/app-domain/tributacao/itbi/online/actions.ts`: `publishOnlineItbiPolicyAction`, `configureItbiNotaryAction`.
- `src/app/app-domain/tributacao/itbi/processos/actions.ts`: `requestItbiContestationAction`, `decideItbiContestationAction`.
- `src/app/app-domain/tributacao/lotes-anuais/actions.ts`: `taxAnnualBatchAction`.
- `src/app/app-domain/tributacao/nfse/actions.ts`: `requestCredentialAction`, `decideCredentialAction`, `emitNfseAction`, `substituteNfseAction`, `cancelNfseAction`, `correctionLetterAction`, `receiveRpsAction`, `updateRpsAction`, `createDmsAction`, `createCreditAction`, `createOccasionalAction`, `approveOccasionalAction`, `releaseOccasionalAction`.
- `src/app/app-domain/tributacao/notificacoes/actions.ts`: `previewDebtNoticesAction`, `issueDebtNoticesAction`, `cancelDebtNoticeAction`.
- `src/app/app-domain/tributacao/operacoes/actions.ts`: `saveTaxDebtAccountingProfileAction`, `saveTaxAccountingProfileAction`, `grantAssessmentBenefitAction`, `reverseCreditMovementAction`, `saveTaxParameter`, `saveTaxServiceRequest`, `saveServiceActivity`, `saveIssDeclaration`, `createAssessmentGuideAction`, `enrollAssessment`, `evaluateCertificate`, `saveFiscalRuleAction`, `simulateFiscalAction`, `launchFiscalAction`, `reviseAssessmentAction`, `registerCreditEventAction`, `issuePartialDamAction`, `issueGroupedDamAction`, `createPixChargeAction`, `processBankReturnAction`, `saveCollectionAgreementAction`, `saveTaxFinancialMappingAction`, `applyTaxCreditAction`, `decideRefundAction`, `executeRefundAction`, `createReconciliationAction`, `resolveReconciliationAction`, `closeReconciliationAction`.
- `src/app/app-domain/tributacao/recadastramento/actions.ts`: `createRecadastramentoCampaign`, `submitRecadastramentoRequest`.
- `src/app/app-domain/tributacao/resumo-anual/actions.ts`: `classifyBenefitReportAction`.
- `src/app/app-domain/tributacao/simples-nacional/actions.ts`: `importSimplesAction`, `processSimplesAction`, `communicateDivergenceAction`, `rectifyDivergenceAction`, `prepareExclusionAction`, `communicateExclusionAction`.
- `src/app/app-domain/tributacao/simples-nacional/arquivos/actions.ts`: `publishSimplesLayoutAction`, `importSimplesOptionFileAction`, `decideSimplesOptionAction`.
- `src/app/app-domain/tributacao/vaf/actions.ts`: `upsertAccountantAction`, `upsertCompanyAction`, `linkAccountantAction`, `upsertRuleAction`, `importMovementsAction`, `processCompetencyAction`, `importRepasseAction`, `importIndicesAction`, `notifyCorrectionAction`, `markNotificationReadAction`, `resolveCrossCheckAction`, `createEstimateAction`.

</details>

### 5.9. Financeiro, contabilidade, tesouraria e custos

**Entrada:** `/financeiro` · **Código de acesso:** `FINANCEIRO` · **Cadastro do código no banco:** ativo · **Páginas:** 27 · **Funções exportadas em arquivos de ações da área:** 124.

- **Subitens:** Cadastros orçamentários; solicitações e reservas; empenhos; liquidações; pagamentos e retenções; receitas; contas e transferências; extratos OFX/OFC/CSV; conciliação e alocações; rendimentos/resgates; disponibilidades por fonte; restos a pagar; lançamentos contábeis; fechamento mensal/anual; MSC; custos; índices fiscais e relatórios.
- **Funcionalidades internas implementadas:** Cadeias de execução orçamentária e contábil, regras de partidas, controle de exercício/UG/fonte, recebimento de origem de compras/RH, reconciliação e reversões têm serviços específicos. Há custo por folha, liquidação e consumo de estoque, com objetos e regras de rateio. Exportador MSC usa memória congelada por linha e catálogos do exercício.
- **Predisposição/canais externos:** Importação de arquivos bancários e APIs/webhooks existem. O cliente de rede bancária aceita apenas o Banco Virtual Robonuvem em SANDBOX. Catálogo de SICONFI, CNAB, PIX e TCE não significa despacho oficial em produção.
- **Regras internas:** Transações equilibradas, Decimal, origem do empenho, disponibilidade e fonte autorizada, período aberto, autorização para fechamento/reabertura, encadeamento de estornos. MSC exige competência fechada e perímetro completo/configurado.
- **Conexões e cadastros:** Planejamento/LOA, FinancialYear, BudgetUnit, GovernmentEntity, AccountingPlan, AccountingPostingRule, BankAccount, compras/recebimentos, tributação, RH, estoque e patrimônio.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Bank: 2; ConfiguracaoModulo: 29; GovernmentEntity: 2; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Sem exercício, UG, dotação, contas bancárias, plano contábil, matriz ou saldos iniciais no banco. A MSC está explicitamente presa a 2026 no exportador examinado; preparar atualização anual e validar layout oficial. Bancos reais e envio SICONFI/TCE exigem desenvolvimento/homologação além da parametrização.
- **Fontes principais:** `src/lib/financeiro/msc-export.ts`, `src/lib/financeiro/bank-integration-client.ts`, `src/lib/financeiro/cost-ledger.ts`, `src/lib/c7`, `src/app/app-domain/financeiro`.

<details>
<summary>Rotas de páginas da área (27) e ações identificadas</summary>

- `/financeiro/automacoes` — fonte: `src/app/app-domain/financeiro/automacoes/page.tsx`.
- `/financeiro/conciliacao-bancaria` — fonte: `src/app/app-domain/financeiro/conciliacao-bancaria/page.tsx`.
- `/financeiro/contabilidade/disponibilidade` — fonte: `src/app/app-domain/financeiro/contabilidade/disponibilidade/page.tsx`.
- `/financeiro/contabilidade/etapas-anuais` — fonte: `src/app/app-domain/financeiro/contabilidade/etapas-anuais/page.tsx`.
- `/financeiro/contabilidade/eventos` — fonte: `src/app/app-domain/financeiro/contabilidade/eventos/page.tsx`.
- `/financeiro/contabilidade/lancamentos` — fonte: `src/app/app-domain/financeiro/contabilidade/lancamentos/page.tsx`.
- `/financeiro/contabilidade/msc` — fonte: `src/app/app-domain/financeiro/contabilidade/msc/page.tsx`.
- `/financeiro/contabilidade` — fonte: `src/app/app-domain/financeiro/contabilidade/page.tsx`.
- `/financeiro/contabilidade/saldos-fontes` — fonte: `src/app/app-domain/financeiro/contabilidade/saldos-fontes/page.tsx`.
- `/financeiro/contas-bancarias` — fonte: `src/app/app-domain/financeiro/contas-bancarias/page.tsx`.
- `/financeiro/custos` — fonte: `src/app/app-domain/financeiro/custos/page.tsx`.
- `/financeiro/download-extratos` — fonte: `src/app/app-domain/financeiro/download-extratos/page.tsx`.
- `/financeiro/empenhos` — fonte: `src/app/app-domain/financeiro/empenhos/page.tsx`.
- `/financeiro/liquidacoes` — fonte: `src/app/app-domain/financeiro/liquidacoes/page.tsx`.
- `/financeiro/orcamento/cadastros` — fonte: `src/app/app-domain/financeiro/orcamento/cadastros/page.tsx`.
- `/financeiro/orcamento` — fonte: `src/app/app-domain/financeiro/orcamento/page.tsx`.
- `/financeiro/orcamento/planejamento` — fonte: `src/app/app-domain/financeiro/orcamento/planejamento/page.tsx`.
- `/financeiro/pagamentos` — fonte: `src/app/app-domain/financeiro/pagamentos/page.tsx`.
- `/financeiro` — fonte: `src/app/app-domain/financeiro/page.tsx`.
- `/financeiro/receitas-constitucionais` — fonte: `src/app/app-domain/financeiro/receitas-constitucionais/page.tsx`.
- `/financeiro/receitas` — fonte: `src/app/app-domain/financeiro/receitas/page.tsx`.
- `/financeiro/relatorios/indices-constitucionais` — fonte: `src/app/app-domain/financeiro/relatorios/indices-constitucionais/page.tsx`.
- `/financeiro/relatorios` — fonte: `src/app/app-domain/financeiro/relatorios/page.tsx`.
- `/financeiro/relatorios/pessoal-fiscal` — fonte: `src/app/app-domain/financeiro/relatorios/pessoal-fiscal/page.tsx`.
- `/financeiro/rendimentos` — fonte: `src/app/app-domain/financeiro/rendimentos/page.tsx`.
- `/financeiro/resgates-aplicacoes` — fonte: `src/app/app-domain/financeiro/resgates-aplicacoes/page.tsx`.
- `/financeiro/restos-a-pagar` — fonte: `src/app/app-domain/financeiro/restos-a-pagar/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/financeiro/conciliacao-bancaria/actions.ts`: `importBankStatementCsvAction`, `matchBankStatementItemAction`, `importBankStatementFileAction`, `openReconciliationSessionAction`, `runAutoReconciliationAction`, `confirmReconciliationSessionAction`, `getActiveReconciliationSessionsAction`, `getReconciliationPositionAction`, `allocateReconciliationAction`, `reverseReconciliationAllocationAction`, `reopenReconciliationSessionAction`.
- `src/app/app-domain/financeiro/contabilidade/actions.ts`: `captureAnnualConsistency`, `executeAnnualRegistration`, `executeEstimativeBalances`, `executeAnnualStage`, `undoAnnualResult`, `undoAnnualBudget`, `publishAnnualRapPostings`, `undoAnnualRapPostings`, `transportAnnualExtraNotes`, `undoAnnualExtraNotes`, `transportAnnualPrograms`, `prepareAnnualPrograms`, `undoAnnualPrograms`, `postManualAccountingTransaction`, `requestMonthClose`, `authorizeMonthClose`, `requestMonthReopen`, `authorizeMonthReopen`, `prepareAnnualClose`, `finalizeAnnualClose`, `savePostingRule`.
- `src/app/app-domain/financeiro/contabilidade/msc/actions.ts`: `importMscReference`, `saveMscMapping`, `saveMscReportingScope`, `lookupMscChoice`.
- `src/app/app-domain/financeiro/contas-bancarias/actions.ts`: `createBankAccount`, `updateBankAccount`, `toggleBankAccountStatus`, `createTreasuryTransferAction`, `saveBankResourceSources`.
- `src/app/app-domain/financeiro/custos/actions.ts`: `configureCostsAction`, `createCostObjectAction`, `deleteCostObjectTreeAction`, `saveCostItemAction`, `adoptCostItemsAction`, `linkCostItemsAction`, `generateCostObjectsAction`, `createCostRuleAction`, `allocateCostAction`, `correctCostAction`, `copyAnnualCostRelationsAction`, `retireCostRuleAction`.
- `src/app/app-domain/financeiro/dashboard-actions.ts`: `getFinanceiroDashboardStats`.
- `src/app/app-domain/financeiro/download-extratos/extratos-actions.ts`: `runAutomatedBankDownloadAction`, `getDownloadHistoryAction`.
- `src/app/app-domain/financeiro/empenhos/actions.ts`: `createCommitment`, `updateCommitment`, `cancelCommitment`.
- `src/app/app-domain/financeiro/liquidacoes/actions.ts`: `createSettlement`, `cancelSettlement`, `updateSettlement`.
- `src/app/app-domain/financeiro/orcamento/actions.ts`: `createMasterData`, `updateMasterData`, `deleteMasterData`, `createBudgetReservationAction`, `createExpenseRequestAction`, `createExpenseRequestFromPurchaseReceiptAction`, `approveExpenseRequestAction`, `cancelBudgetReservationAction`, `setFinancialYearStatusAction`.
- `src/app/app-domain/financeiro/orcamento/planejamento-actions.ts`: `actionCreateMultiYearPlan`, `actionAddProgramPPA`, `actionAddActionPPA`, `actionAddObjectivePPA`, `actionAddIndicatorPPA`, `actionAddGoalPPA`, `actionCreateBudgetGuideline`, `actionCreateAnnualBudgetLaw`, `actionTransitionPlanningLegalWorkflow`, `actionCreatePlanningAmendment`, `actionCreateBudgetAppropriationFromFixation`, `actionSaveMonthlyDisbursementSchedule`, `actionSaveBimonthlyRevenueTarget`, `actionCreateCreditRequest`, `actionSubmitCreditRequest`, `actionApproveCreditRequest`, `actionExecuteCreditRequest`, `actionSanctionCreditRequest`, `actionPublishCreditRequest`.
- `src/app/app-domain/financeiro/pagamentos/actions.ts`: `createPayment`, `submitPaymentToBank`, `cancelPayment`, `updatePaymentStatus`, `reversePaymentAction`, `settleWithholdingPayableAction`.
- `src/app/app-domain/financeiro/receitas/actions.ts`: `launchRevenueAction`, `collectRevenueAction`, `recordRevenueCollectionAction`, `reverseRevenueAction`, `redistributeRevenueResourceSourceAction`.
- `src/app/app-domain/financeiro/receitas-constitucionais/regras-receitas-actions.ts`: `seedConstitutionalRulesAction`, `getConstitutionalRulesAction`, `getExceptionQueueAction`, `createRuleAction`, `resolveExceptionAction`, `processConstitutionalRevenueAction`.
- `src/app/app-domain/financeiro/relatorios/indices-constitucionais/actions.ts`: `defineFiscalIndexAction`.
- `src/app/app-domain/financeiro/relatorios/pessoal-fiscal/actions.ts`: `definePersonnelFiscalAction`.
- `src/app/app-domain/financeiro/rendimentos/rendimentos-actions.ts`: `calculateYieldAction`, `transmitYieldAction`, `getYieldHistoryAction`, `fetchExternalYieldsAction`.
- `src/app/app-domain/financeiro/resgates-aplicacoes/resgates-actions.ts`: `getBankStatementItemsAction`, `classifyItemAction`, `transmitItemAction`.
- `src/app/app-domain/financeiro/restos-a-pagar/actions.ts`: `issueRapPayment`, `transportRap`, `undoRapTransport`, `liquidateRap`, `cancelRapSettlement`, `trackRapPayment`, `cancelRap`, `reregisterRap`.

</details>

### 5.10. Planejamento e orçamento — Executivo e Legislativo

**Entrada:** `/planejamento` · **Código de acesso:** `PLANEJAMENTO` · **Cadastro do código no banco:** ativo · **Páginas:** 8 · **Funções exportadas em arquivos de ações da área:** 3.

- **Subitens:** PPA; LDO; LOA; programas, ações, objetivos, indicadores e metas; catálogos por exercício; fontes e naturezas; entidades/UGs; audiências; importações; emendas; créditos; cronogramas; revisão, publicação e execução.
- **Funcionalidades internas implementadas:** Há instrumentos versionados, fluxo legal, limites/disponibilidade, projeções, importação, publicação, metas e ligação com execução e contabilidade. O Legislativo reutiliza o mesmo núcleo por jurisdição e páginas /camara/planejamento.
- **Predisposição/canais externos:** Publicação documental e consultas públicas internas ao portal; importação de arquivos. Não foi comprovado envio automático de peças a tribunal ou outro sistema oficial.
- **Regras internas:** Recorte por jurisdição/entidade/UG; aprovação legal específica; versões e vigência; ligações consistentes PPA→LDO→LOA, classificação e crédito orçamentário; publicação não implica recebimento por órgão externo.
- **Conexões e cadastros:** GovernmentEntity, PlanningEntityScope/PlanningEntityUnit, BudgetUnit, catálogos por ano, peças e linhas orçamentárias, GED, Câmara, financeiro e audiências.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; DocumentClass: 7; GovernmentEntity: 2; HealthCbo: 2; Tax: 3; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Não há escopos de entidade, catálogos publicados ou instrumentos nesta instância. Carregar plano de contas, fontes, naturezas, funções e peças oficiais com fundamento e evidência de origem.
- **Fontes principais:** `src/lib/planejamento/navigation.ts`, `src/lib/planejamento/access.ts`, `src/lib/planejamento/service.ts`, `src/lib/planejamento/execution-bridge.ts`.

<details>
<summary>Rotas de páginas da área (8) e ações identificadas</summary>

- `/planejamento/[kind]/[id]/gestao/[section]` — fonte: `src/app/app-domain/planejamento/[kind]/[id]/gestao/[section]/page.tsx`.
- `/planejamento/[kind]/[id]` — fonte: `src/app/app-domain/planejamento/[kind]/[id]/page.tsx`.
- `/planejamento/[kind]` — fonte: `src/app/app-domain/planejamento/[kind]/page.tsx`.
- `/planejamento/audiencias` — fonte: `src/app/app-domain/planejamento/audiencias/page.tsx`.
- `/planejamento/cadastros/[catalog]` — fonte: `src/app/app-domain/planejamento/cadastros/[catalog]/page.tsx`.
- `/planejamento/entidades` — fonte: `src/app/app-domain/planejamento/entidades/page.tsx`.
- `/planejamento/importacoes` — fonte: `src/app/app-domain/planejamento/importacoes/page.tsx`.
- `/planejamento` — fonte: `src/app/app-domain/planejamento/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/planejamento/actions.ts`: `searchPlanningOptions`, `previewPlanningImportAction`, `savePlanningRecord`.

</details>

### 5.11. Compras, licitações, contratos e convênios

**Entrada:** `/compras` · **Código de acesso:** `COMPRAS` · **Cadastro do código no banco:** ativo · **Páginas:** 40 · **Funções exportadas em arquivos de ações da área:** 53.

- **Subitens:** Catálogo; planejamento/PCA; solicitações e aprovações; processos de compra; pesquisa de preço e convites; licitações, lotes, participantes, propostas e atos; contratação direta; contratos e aditivos; convênios; medições e parcelas; autorizações; recebimentos; exportações PNCP/TCE.
- **Funcionalidades internas implementadas:** Solicitação→processo→licitação/contratação→contrato→autorização→recebimento possui modelos e serviços de integridade. Há ações de responsáveis, medições, parcelas, aprovação de recebimento e ligação com empenho/liquidação/estoque.
- **Predisposição/canais externos:** Cotação/identidade de fornecedor e pacotes de exportação são previstos no código. PNCP/TCE usam contrato de configuração e execução que permanece em MOCK no catálogo geral; registro manual de resultado não prova protocolo externo.
- **Regras internas:** Origem e saldo por item de solicitação, lotes não vazios, resultado antes da homologação, orçamento/UG, identidade de fornecedor e idempotência. Pacote exige layout/credencial/metadados e operação suportada.
- **Conexões e cadastros:** Supplier, Person/Company, CatalogItem/Material, Employee, BudgetUnit/dotações, Process, Document, Contract, PurchaseReceipt, patrimônio e financeiro.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Nenhum fornecedor, catálogo operacional, solicitação, licitação ou contrato carregado. Implementar/homologar transmissão PNCP e tribunal aplicável; confirmar a jornada de fornecedor e suas telas no escopo do edital.
- **Fontes principais:** `src/lib/compras/procurement-lifecycle.ts`, `src/lib/compras/procurement-finance-bridge.ts`, `src/lib/integrations/procurement-exports.ts`, `src/app/app-domain/compras/licitacoes/actions.ts`.

<details>
<summary>Rotas de páginas da área (40) e ações identificadas</summary>

- `/compras/catalogo` — fonte: `src/app/app-domain/compras/catalogo/page.tsx`.
- `/compras/contratos/[id]/editar` — fonte: `src/app/app-domain/compras/contratos/[id]/editar/page.tsx`.
- `/compras/contratos/[id]` — fonte: `src/app/app-domain/compras/contratos/[id]/page.tsx`.
- `/compras/contratos/[id]/relatorio` — fonte: `src/app/app-domain/compras/contratos/[id]/relatorio/page.tsx`.
- `/compras/contratos/novo` — fonte: `src/app/app-domain/compras/contratos/novo/page.tsx`.
- `/compras/contratos` — fonte: `src/app/app-domain/compras/contratos/page.tsx`.
- `/compras/convenios/[id]/editar` — fonte: `src/app/app-domain/compras/convenios/[id]/editar/page.tsx`.
- `/compras/convenios/[id]` — fonte: `src/app/app-domain/compras/convenios/[id]/page.tsx`.
- `/compras/convenios/[id]/relatorio` — fonte: `src/app/app-domain/compras/convenios/[id]/relatorio/page.tsx`.
- `/compras/convenios/novo` — fonte: `src/app/app-domain/compras/convenios/novo/page.tsx`.
- `/compras/convenios` — fonte: `src/app/app-domain/compras/convenios/page.tsx`.
- `/compras/dispensas/[id]/editar` — fonte: `src/app/app-domain/compras/dispensas/[id]/editar/page.tsx`.
- `/compras/dispensas/[id]` — fonte: `src/app/app-domain/compras/dispensas/[id]/page.tsx`.
- `/compras/dispensas/novo` — fonte: `src/app/app-domain/compras/dispensas/novo/page.tsx`.
- `/compras/exportacoes` — fonte: `src/app/app-domain/compras/exportacoes/page.tsx`.
- `/compras/licitacoes/[id]/editar` — fonte: `src/app/app-domain/compras/licitacoes/[id]/editar/page.tsx`.
- `/compras/licitacoes/[id]` — fonte: `src/app/app-domain/compras/licitacoes/[id]/page.tsx`.
- `/compras/licitacoes/novo` — fonte: `src/app/app-domain/compras/licitacoes/novo/page.tsx`.
- `/compras/licitacoes` — fonte: `src/app/app-domain/compras/licitacoes/page.tsx`.
- `/compras/licitacoes/portal/[participantId]` — fonte: `src/app/app-domain/compras/licitacoes/portal/[participantId]/page.tsx`.
- `/compras/licitacoes/portal` — fonte: `src/app/app-domain/compras/licitacoes/portal/page.tsx`.
- `/compras` — fonte: `src/app/app-domain/compras/page.tsx`.
- `/compras/pesquisas-precos/[id]` — fonte: `src/app/app-domain/compras/pesquisas-precos/[id]/page.tsx`.
- `/compras/pesquisas-precos/nova` — fonte: `src/app/app-domain/compras/pesquisas-precos/nova/page.tsx`.
- `/compras/pesquisas-precos` — fonte: `src/app/app-domain/compras/pesquisas-precos/page.tsx`.
- `/compras/pesquisas-precos/portal/[key]` — fonte: `src/app/app-domain/compras/pesquisas-precos/portal/[key]/page.tsx`.
- `/compras/pesquisas-precos/portal/[key]/relatorio` — fonte: `src/app/app-domain/compras/pesquisas-precos/portal/[key]/relatorio/page.tsx`.
- `/compras/planejamento/[id]/editar` — fonte: `src/app/app-domain/compras/planejamento/[id]/editar/page.tsx`.
- `/compras/planejamento/[id]` — fonte: `src/app/app-domain/compras/planejamento/[id]/page.tsx`.
- `/compras/planejamento/novo` — fonte: `src/app/app-domain/compras/planejamento/novo/page.tsx`.
- `/compras/planejamento` — fonte: `src/app/app-domain/compras/planejamento/page.tsx`.
- `/compras/processos/[id]/editar` — fonte: `src/app/app-domain/compras/processos/[id]/editar/page.tsx`.
- `/compras/processos/[id]` — fonte: `src/app/app-domain/compras/processos/[id]/page.tsx`.
- `/compras/processos/novo` — fonte: `src/app/app-domain/compras/processos/novo/page.tsx`.
- `/compras/processos` — fonte: `src/app/app-domain/compras/processos/page.tsx`.
- `/compras/recebimentos` — fonte: `src/app/app-domain/compras/recebimentos/page.tsx`.
- `/compras/solicitacoes/[id]/editar` — fonte: `src/app/app-domain/compras/solicitacoes/[id]/editar/page.tsx`.
- `/compras/solicitacoes/[id]` — fonte: `src/app/app-domain/compras/solicitacoes/[id]/page.tsx`.
- `/compras/solicitacoes/novo` — fonte: `src/app/app-domain/compras/solicitacoes/novo/page.tsx`.
- `/compras/solicitacoes` — fonte: `src/app/app-domain/compras/solicitacoes/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/compras/catalogo/actions.ts`: `saveCatalogItem`, `toggleCatalogItemStatus`.
- `src/app/app-domain/compras/contratos/actions.ts`: `generateContractProcurementAuthorizations`, `deleteContract`, `saveContract`, `saveContractAmendment`, `updateContractResponsibles`.
- `src/app/app-domain/compras/contratos/instrument-actions.ts`: `saveInstrumentResponsibilityGroup`, `deleteInstrumentResponsibilityGroup`, `saveInstrumentParty`, `deleteInstrumentParty`, `saveInstrumentMeasurement`, `deleteInstrumentMeasurement`, `saveInstrumentMeasurementItem`, `deleteInstrumentMeasurementItem`, `saveInstrumentInstallment`, `deleteInstrumentInstallment`.
- `src/app/app-domain/compras/convenios/actions.ts`: `saveCovenant`, `deleteCovenant`.
- `src/app/app-domain/compras/dispensas/actions.ts`: `deleteDispensa`, `saveDispensa`.
- `src/app/app-domain/compras/exportacoes/actions.ts`: `queueProcurementExportAction`, `recordProcurementExportOutcomeAction`, `notifyPendingPriceResearchInvitationsAction`.
- `src/app/app-domain/compras/licitacoes/actions.ts`: `transitionBiddingStatus`, `inactivateBidding`, `saveBidding`, `initializeBiddingWorkflow`, `createBiddingAppointment`, `assignBiddingAppointment`, `endBiddingAppointmentAssignment`, `createBiddingLot`, `addBiddingParticipant`, `saveSupplierPortalIdentity`, `registerBiddingAct`, `decideBiddingEligibility`, `decideBiddingResult`, `submitBiddingBid`.
- `src/app/app-domain/compras/pesquisas-precos/actions.ts`: `createPriceResearchAction`, `updatePriceResearchDeadlineAction`, `closePriceResearchAction`, `deletePriceResearchAction`, `inviteSupplierToPriceResearchAction`, `getSupplierInvitationLinkAction`, `saveSupplierPriceQuoteDraftAction`, `submitSupplierPriceQuoteAction`.
- `src/app/app-domain/compras/planejamento/actions.ts`: `savePurchasePlanning`.
- `src/app/app-domain/compras/processos/actions.ts`: `deletePurchaseProcess`, `savePurchaseProcess`.
- `src/app/app-domain/compras/recebimentos/actions.ts`: `approvePurchaseReceiptAction`.
- `src/app/app-domain/compras/solicitacoes/actions.ts`: `deletePurchaseRequest`, `savePurchaseRequest`, `approvePurchaseRequest`.

</details>

### 5.12. Recursos humanos e folha

**Entrada:** `/rh` · **Código de acesso:** `RH` · **Cadastro do código no banco:** ativo · **Páginas:** 54 · **Funções exportadas em arquivos de ações da área:** 48.

- **Subitens:** Servidores, contratos e quadro de cargos; regimes e parametrização; rubricas/incidências; folha e demonstrativos; férias, licenças, direitos e ocorrências; ponto/banco de horas; dependentes e pensões; benefícios e consignações; diárias/adiantamentos; atos; concursos; recadastramento; capacitação/carreira; documentos e obrigações.
- **Funcionalidades internas implementadas:** Motor de cálculo, vigências contratuais, rubricas, previdência/IRRF, férias e direitos, médias/provisões, consignações, solicitações e ponte financeira possuem serviços específicos. Publicação funcional e revogação de demonstrativos são separadas do mero cálculo.
- **Predisposição/canais externos:** Portal do servidor e concurso público têm canais próprios. Exportação de obrigações por layout parametrizado existe, mas retorna officialLayout:false. eSocial RH permite preparar conexão; transmissionAvailable:false registra pendência de XML/XSD/XMLDSig/mTLS/worker.
- **Regras internas:** Conjunto legal ativo/vigente e aprovado em produção, regimes e contratos por período, limites de margem/benefício, direitos aquisitivos e histórico compensatório; folha só integra financeiro com origem e escopo válidos.
- **Conexões e cadastros:** Employee/Person, Secretariat/Department/Role, HrEmploymentContract/Regime, HrPayrollRuleSet/Rule/Rubric, políticas previdenciárias, UG, processos, SST e financeiro.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Não há servidores, contratos, rubricas, regimes ou conjuntos legais carregados. Implantar legislação local e tabelas oficiais; concluir transporte eSocial e layouts oficiais efetivamente exigidos; não tratar CSV configurável como DIRF/SEFIP/TCE já homologado.
- **Fontes principais:** `src/lib/rh/workforce-service.ts`, `src/lib/rh/calculation-engine.ts`, `src/lib/rh/external-configuration.ts`, `src/lib/rh/obligation-export.ts`, `src/lib/rh/finance-bridge.ts`.

<details>
<summary>Rotas de páginas da área (54) e ações identificadas</summary>

- `/rh/adiantamentos` — fonte: `src/app/app-domain/rh/adiantamentos/page.tsx`.
- `/rh/atividades-funcionais` — fonte: `src/app/app-domain/rh/atividades-funcionais/page.tsx`.
- `/rh/atos/[id]/editar` — fonte: `src/app/app-domain/rh/atos/[id]/editar/page.tsx`.
- `/rh/atos/novo` — fonte: `src/app/app-domain/rh/atos/novo/page.tsx`.
- `/rh/atos` — fonte: `src/app/app-domain/rh/atos/page.tsx`.
- `/rh/beneficios/[id]/editar` — fonte: `src/app/app-domain/rh/beneficios/[id]/editar/page.tsx`.
- `/rh/beneficios/novo` — fonte: `src/app/app-domain/rh/beneficios/novo/page.tsx`.
- `/rh/beneficios` — fonte: `src/app/app-domain/rh/beneficios/page.tsx`.
- `/rh/concursos` — fonte: `src/app/app-domain/rh/concursos/page.tsx`.
- `/rh/consignacoes` — fonte: `src/app/app-domain/rh/consignacoes/page.tsx`.
- `/rh/dependentes/[id]/editar` — fonte: `src/app/app-domain/rh/dependentes/[id]/editar/page.tsx`.
- `/rh/dependentes/novo` — fonte: `src/app/app-domain/rh/dependentes/novo/page.tsx`.
- `/rh/dependentes` — fonte: `src/app/app-domain/rh/dependentes/page.tsx`.
- `/rh/diarias` — fonte: `src/app/app-domain/rh/diarias/page.tsx`.
- `/rh/emissoes-funcionais` — fonte: `src/app/app-domain/rh/emissoes-funcionais/page.tsx`.
- `/rh/esocial` — fonte: `src/app/app-domain/rh/esocial/page.tsx`.
- `/rh/ferias/[id]/editar` — fonte: `src/app/app-domain/rh/ferias/[id]/editar/page.tsx`.
- `/rh/ferias/novo` — fonte: `src/app/app-domain/rh/ferias/novo/page.tsx`.
- `/rh/ferias` — fonte: `src/app/app-domain/rh/ferias/page.tsx`.
- `/rh/folha/[id]/editar` — fonte: `src/app/app-domain/rh/folha/[id]/editar/page.tsx`.
- `/rh/folha/eventos/[id]/editar` — fonte: `src/app/app-domain/rh/folha/eventos/[id]/editar/page.tsx`.
- `/rh/folha/eventos/novo` — fonte: `src/app/app-domain/rh/folha/eventos/novo/page.tsx`.
- `/rh/folha/eventos` — fonte: `src/app/app-domain/rh/folha/eventos/page.tsx`.
- `/rh/folha/novo` — fonte: `src/app/app-domain/rh/folha/novo/page.tsx`.
- `/rh/folha` — fonte: `src/app/app-domain/rh/folha/page.tsx`.
- `/rh/licencas/[id]/editar` — fonte: `src/app/app-domain/rh/licencas/[id]/editar/page.tsx`.
- `/rh/licencas/novo` — fonte: `src/app/app-domain/rh/licencas/novo/page.tsx`.
- `/rh/licencas` — fonte: `src/app/app-domain/rh/licencas/page.tsx`.
- `/rh/ocorrencias` — fonte: `src/app/app-domain/rh/ocorrencias/page.tsx`.
- `/rh/operacoes/calculos/[id]` — fonte: `src/app/app-domain/rh/operacoes/calculos/[id]/page.tsx`.
- `/rh/operacoes/contratos/[id]` — fonte: `src/app/app-domain/rh/operacoes/contratos/[id]/page.tsx`.
- `/rh/operacoes/demonstrativos/[id]` — fonte: `src/app/app-domain/rh/operacoes/demonstrativos/[id]/page.tsx`.
- `/rh/operacoes/medias` — fonte: `src/app/app-domain/rh/operacoes/medias/page.tsx`.
- `/rh/operacoes` — fonte: `src/app/app-domain/rh/operacoes/page.tsx`.
- `/rh` — fonte: `src/app/app-domain/rh/page.tsx`.
- `/rh/parametrizacoes` — fonte: `src/app/app-domain/rh/parametrizacoes/page.tsx`.
- `/rh/pasta-funcional/[id]` — fonte: `src/app/app-domain/rh/pasta-funcional/[id]/page.tsx`.
- `/rh/pensoes` — fonte: `src/app/app-domain/rh/pensoes/page.tsx`.
- `/rh/poc` — fonte: `src/app/app-domain/rh/poc/page.tsx`.
- `/rh/ponto/[id]/editar` — fonte: `src/app/app-domain/rh/ponto/[id]/editar/page.tsx`.
- `/rh/ponto/novo` — fonte: `src/app/app-domain/rh/ponto/novo/page.tsx`.
- `/rh/ponto` — fonte: `src/app/app-domain/rh/ponto/page.tsx`.
- `/rh/portal-funcional` — fonte: `src/app/app-domain/rh/portal-funcional/page.tsx`.
- `/rh/publicacao-funcional` — fonte: `src/app/app-domain/rh/publicacao-funcional/page.tsx`.
- `/rh/quadro-cargos/historico-legal` — fonte: `src/app/app-domain/rh/quadro-cargos/historico-legal/page.tsx`.
- `/rh/quadro-cargos` — fonte: `src/app/app-domain/rh/quadro-cargos/page.tsx`.
- `/rh/recadastramento/configurar` — fonte: `src/app/app-domain/rh/recadastramento/configurar/page.tsx`.
- `/rh/recadastramento` — fonte: `src/app/app-domain/rh/recadastramento/page.tsx`.
- `/rh/requerimentos-funcionais` — fonte: `src/app/app-domain/rh/requerimentos-funcionais/page.tsx`.
- `/rh/servicos-funcionais` — fonte: `src/app/app-domain/rh/servicos-funcionais/page.tsx`.
- `/rh/servidores/[id]/editar` — fonte: `src/app/app-domain/rh/servidores/[id]/editar/page.tsx`.
- `/rh/servidores/novo` — fonte: `src/app/app-domain/rh/servidores/novo/page.tsx`.
- `/rh/servidores` — fonte: `src/app/app-domain/rh/servidores/page.tsx`.
- `/rh/solicitacoes` — fonte: `src/app/app-domain/rh/solicitacoes/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/rh/atividades-funcionais/actions.ts`: `saveCareerPolicyAction`, `completeFunctionalCourseAction`, `publishFunctionalEvaluationResultAction`.
- `src/app/app-domain/rh/atos/actions.ts`: `saveAtoPessoal`, `deleteAtoPessoal`.
- `src/app/app-domain/rh/beneficios/actions.ts`: `saveBeneficio`, `toggleBeneficioStatus`, `deleteBeneficio`.
- `src/app/app-domain/rh/concursos/actions.ts`: `saveRecruitmentNoticeAction`, `decideRecruitmentApplicationAction`.
- `src/app/app-domain/rh/dependentes/actions.ts`: `saveDependente`, `deleteDependente`.
- `src/app/app-domain/rh/emissoes-funcionais/actions.ts`: `publishFunctionalDocumentAction`, `revokeFunctionalDocumentAction`.
- `src/app/app-domain/rh/esocial/actions.ts`: `prepareRhEsocialConnection`.
- `src/app/app-domain/rh/ferias/actions.ts`: `saveFerias`, `deleteFerias`.
- `src/app/app-domain/rh/folha/actions.ts`: `saveFolha`, `deleteFolha`, `processPayroll`.
- `src/app/app-domain/rh/folha/eventos/actions.ts`: `saveEvent`.
- `src/app/app-domain/rh/licencas/actions.ts`: `saveLicenca`, `deleteLicenca`.
- `src/app/app-domain/rh/operacoes/actions.ts`: `executeWorkforceOperation`.
- `src/app/app-domain/rh/parametrizacoes/actions.ts`: `saveHrPayrollRuleSet`, `saveHrPayrollRule`, `saveHrPayrollRubric`, `saveHrVacationPolicy`, `saveHrSocialSecurityScheme`, `saveHrSocialSecurityBand`, `saveHrCalculationPolicy`, `saveHrEmploymentRegime`.
- `src/app/app-domain/rh/ponto/actions.ts`: `savePonto`, `deletePonto`.
- `src/app/app-domain/rh/portal-funcional/actions.ts`: `manageFunctionalPortal`.
- `src/app/app-domain/rh/publicacao-funcional/actions.ts`: `savePayrollPublicationPolicyAction`, `publishPayrollByFunctionalPolicyAction`, `revokeFunctionalStatementAction`.
- `src/app/app-domain/rh/quadro-cargos/historico-legal/actions.ts`: `recordRoleLegalHistoryAction`.
- `src/app/app-domain/rh/recadastramento/actions.ts`: `requestRecertificationCorrectionAction`, `reconcileRecertificationDependent`.
- `src/app/app-domain/rh/servicos-funcionais/actions.ts`: `saveFunctionalServiceAction`, `decideFunctionalRequestAction`, `requestFunctionalComplementAction`, `completeFunctionalDocumentRequestAction`.
- `src/app/app-domain/rh/servidores/actions.ts`: `saveServidor`, `toggleServidorStatus`, `deleteServidor`.

</details>

### 5.13. Portal do servidor

**Entrada:** `/portal-servidor` · **Código de acesso:** `PORTAL_SERVIDOR` · **Cadastro do código no banco:** ativo · **Páginas:** 34 · **Funções exportadas em arquivos de ações da área:** 15.

- **Subitens:** Login; contracheques/demonstrativos; ficha funcional; documentos; ponto e banco de horas; férias e benefícios; consignações/margem/crédito; solicitações ao RH; recadastramento; concursos/serviços funcionais vinculados; capacitação e avaliação; agenda e documentos SST.
- **Funcionalidades internas implementadas:** Publicação de documentos e demonstrativos, catálogo de serviços, solicitações/complementações, atualização cadastral revisada, controle de ponto e documentos funcionais têm serviços e fontes definidos.
- **Predisposição/canais externos:** Acesso de autosserviço por /portal-servidor e seus subcaminhos, inclusive fora do host administrativo. Rotas verificam usuário/servidor e não aceitam escolher arbitrariamente outro empregado por parâmetro.
- **Regras internas:** Vínculo usuário↔Employee, publicação/visibilidade e revogação, titularidade do documento, vigência e escopo de requisição, origem canônica e recibo verificável.
- **Conexões e cadastros:** RH, folha publicada, Employee, Usuario, GED, SST, benefícios e processos.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Só existe administrador técnico sem população funcional; não há conta de servidor e demonstrativo para validar jornada real. Configurar vínculo, serviços e políticas de publicação antes de abrir o portal ao quadro municipal.
- **Fontes principais:** `src/lib/portal-servidor/access.ts`, `src/lib/portal-servidor/source-manifest.ts`, `src/lib/portal-servidor/functional-requests.ts`, `src/lib/portal-servidor/payroll-publication.ts`.

<details>
<summary>Rotas de páginas da área (34) e ações identificadas</summary>

- `/portal-servidor/aniversariantes` — fonte: `src/app/app-domain/portal-servidor/aniversariantes/page.tsx`.
- `/portal-servidor/avaliacoes` — fonte: `src/app/app-domain/portal-servidor/avaliacoes/page.tsx`.
- `/portal-servidor/banco-horas` — fonte: `src/app/app-domain/portal-servidor/banco-horas/page.tsx`.
- `/portal-servidor/beneficios` — fonte: `src/app/app-domain/portal-servidor/beneficios/page.tsx`.
- `/portal-servidor/capacitacao` — fonte: `src/app/app-domain/portal-servidor/capacitacao/page.tsx`.
- `/portal-servidor/consignacoes` — fonte: `src/app/app-domain/portal-servidor/consignacoes/page.tsx`.
- `/portal-servidor/credito` — fonte: `src/app/app-domain/portal-servidor/credito/page.tsx`.
- `/portal-servidor/demonstrativos` — fonte: `src/app/app-domain/portal-servidor/demonstrativos/page.tsx`.
- `/portal-servidor/documentos-funcionais` — fonte: `src/app/app-domain/portal-servidor/documentos-funcionais/page.tsx`.
- `/portal-servidor/documentos` — fonte: `src/app/app-domain/portal-servidor/documentos/page.tsx`.
- `/portal-servidor/emissoes` — fonte: `src/app/app-domain/portal-servidor/emissoes/page.tsx`.
- `/portal-servidor/entrar` — fonte: `src/app/app-domain/portal-servidor/entrar/page.tsx`.
- `/portal-servidor/ferias` — fonte: `src/app/app-domain/portal-servidor/ferias/page.tsx`.
- `/portal-servidor/ficha-funcional` — fonte: `src/app/app-domain/portal-servidor/ficha-funcional/page.tsx`.
- `/portal-servidor/folha` — fonte: `src/app/app-domain/portal-servidor/folha/page.tsx`.
- `/portal-servidor/licenca-premio` — fonte: `src/app/app-domain/portal-servidor/licenca-premio/page.tsx`.
- `/portal-servidor/margem` — fonte: `src/app/app-domain/portal-servidor/margem/page.tsx`.
- `/portal-servidor` — fonte: `src/app/app-domain/portal-servidor/page.tsx`.
- `/portal-servidor/ponto` — fonte: `src/app/app-domain/portal-servidor/ponto/page.tsx`.
- `/portal-servidor/ponto/registro` — fonte: `src/app/app-domain/portal-servidor/ponto/registro/page.tsx`.
- `/portal-servidor/protocolos/[id]` — fonte: `src/app/app-domain/portal-servidor/protocolos/[id]/page.tsx`.
- `/portal-servidor/protocolos` — fonte: `src/app/app-domain/portal-servidor/protocolos/page.tsx`.
- `/portal-servidor/recadastramento` — fonte: `src/app/app-domain/portal-servidor/recadastramento/page.tsx`.
- `/portal-servidor/recuperar-senha` — fonte: `src/app/app-domain/portal-servidor/recuperar-senha/page.tsx`.
- `/portal-servidor/relatorios` — fonte: `src/app/app-domain/portal-servidor/relatorios/page.tsx`.
- `/portal-servidor/seguranca` — fonte: `src/app/app-domain/portal-servidor/seguranca/page.tsx`.
- `/portal-servidor/servicos` — fonte: `src/app/app-domain/portal-servidor/servicos/page.tsx`.
- `/portal-servidor/solicitacoes-rh` — fonte: `src/app/app-domain/portal-servidor/solicitacoes-rh/page.tsx`.
- `/portal-servidor/sst/agenda` — fonte: `src/app/app-domain/portal-servidor/sst/agenda/page.tsx`.
- `/portal-servidor/sst/cat` — fonte: `src/app/app-domain/portal-servidor/sst/cat/page.tsx`.
- `/portal-servidor/sst/cipa` — fonte: `src/app/app-domain/portal-servidor/sst/cipa/page.tsx`.
- `/portal-servidor/sst/planos/[id]` — fonte: `src/app/app-domain/portal-servidor/sst/planos/[id]/page.tsx`.
- `/portal-servidor/sst/planos` — fonte: `src/app/app-domain/portal-servidor/sst/planos/page.tsx`.
- `/portal-servidor/sst/relatorios` — fonte: `src/app/app-domain/portal-servidor/sst/relatorios/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/portal-servidor/capacitacao/actions.ts`: `enrollMyCourse`, `submitMyEvaluation`, `submitAssignedEvaluation`.
- `src/app/app-domain/portal-servidor/documentos-funcionais/actions.ts`: `issueMyFunctionalDocument`.
- `src/app/app-domain/portal-servidor/ponto/registro/actions.ts`: `registerMyClock`.
- `src/app/app-domain/portal-servidor/recadastramento/actions.ts`: `submitMyRecertification`.
- `src/app/app-domain/portal-servidor/servicos/actions.ts`: `openMyFunctionalRequest`, `complementMyFunctionalRequest`.
- `src/app/app-domain/portal-servidor/solicitacoes-rh/actions.ts`: `submitMyHrRequest`, `submitMyCreditRequest`.
- `src/app/app-domain/portal-servidor/sst/agenda/actions.ts`: `bookMyMedicalAppointment`, `cancelMyMedicalAppointment`.
- `src/app/app-domain/portal-servidor/sst/cat/actions.ts`: `reportOwnAccident`.
- `src/app/app-domain/portal-servidor/sst/cipa/actions.ts`: `selfRegisterCipa`, `selfVoteCipa`.

</details>

### 5.14. Segurança e medicina do trabalho

**Entrada:** `/sst` · **Código de acesso:** `SST` · **Cadastro do código no banco:** ativo · **Páginas:** 55 · **Funções exportadas em arquivos de ações da área:** 62.

- **Subitens:** Atestados/perícias; juntas e agenda; ASO/exames; questionários e anamneses; prontuário por atuação; vacinação ocupacional; GHE, PGR/LTCAT/PCMSO; histórico funcional; OS e responsabilidade técnica; EPI/EPC; CIPA/prevenção; CAT/incidentes; restrições e alertas; planos de saúde; PPP; eSocial S-2210/S-2220/S-2240.
- **Funcionalidades internas implementadas:** Há amplo conjunto de serviços para emissão/revisão de atestado e ASO, exposições e versões técnicas, equipamentos e entregas, eventos CAT, benefícios e origem de afastamento/folha. Parte do domínio usa tabelas SQL sem modelo Prisma, também auditadas neste relatório.
- **Predisposição/canais externos:** Preparação de eventos eSocial e contrato de envio/consulta estão desenhados, mas o provedor REAL não está instalado: a chamada sem adaptador bloqueia a transmissão. Existe provedor HTTP Resend para alertas de restrição, dependente de segredo/configuração.
- **Regras internas:** Acesso clínico por UG, disciplina e profissional; versões vigentes de risco/programa; cobertura temporal e responsabilidade técnica para PPP; idempotência; afastamento liga período funcional e regime; validação do retorno eSocial exige evento/ambiente/protocolo/recibo.
- **Conexões e cadastros:** RH/Employee/contrato/regime, BudgetUnit, profissionais, Person/Company, GED, estoque/material, riscos, certificados e folha.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; GovernmentEntity: 2; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Todas as tabelas clínicas, técnicas e operacionais estão vazias. Concluir transporte eSocial/XMLDSig/XSD/mTLS, implantar responsáveis/regimes/versões de laudos e homologar documentos ocupacionais com a equipe técnica.
- **Fontes principais:** `src/lib/sst/esocial-service.ts`, `src/lib/sst/esocial-contract.ts`, `src/lib/sst/ppp-final-service.ts`, `src/lib/sst/functional-certificate-service.ts`, `src/lib/sst/restriction-email-provider.ts`.

<details>
<summary>Rotas de páginas da área (55) e ações identificadas</summary>

- `/sst/acidentes/[id]/imprimir` — fonte: `src/app/app-domain/sst/acidentes/[id]/imprimir/page.tsx`.
- `/sst/acidentes/[id]` — fonte: `src/app/app-domain/sst/acidentes/[id]/page.tsx`.
- `/sst/acidentes` — fonte: `src/app/app-domain/sst/acidentes/page.tsx`.
- `/sst/agenda/agendamentos/[id]` — fonte: `src/app/app-domain/sst/agenda/agendamentos/[id]/page.tsx`.
- `/sst/agenda/agendamentos` — fonte: `src/app/app-domain/sst/agenda/agendamentos/page.tsx`.
- `/sst/agenda` — fonte: `src/app/app-domain/sst/agenda/page.tsx`.
- `/sst/anamneses/[id]` — fonte: `src/app/app-domain/sst/anamneses/[id]/page.tsx`.
- `/sst/aso/[id]/anamnese` — fonte: `src/app/app-domain/sst/aso/[id]/anamnese/page.tsx`.
- `/sst/aso/[id]/imprimir` — fonte: `src/app/app-domain/sst/aso/[id]/imprimir/page.tsx`.
- `/sst/aso/[id]` — fonte: `src/app/app-domain/sst/aso/[id]/page.tsx`.
- `/sst/aso/branco` — fonte: `src/app/app-domain/sst/aso/branco/page.tsx`.
- `/sst/aso` — fonte: `src/app/app-domain/sst/aso/page.tsx`.
- `/sst/atestados/[id]/comprovante` — fonte: `src/app/app-domain/sst/atestados/[id]/comprovante/page.tsx`.
- `/sst/atestados/[id]` — fonte: `src/app/app-domain/sst/atestados/[id]/page.tsx`.
- `/sst/atestados/novo` — fonte: `src/app/app-domain/sst/atestados/novo/page.tsx`.
- `/sst/atestados` — fonte: `src/app/app-domain/sst/atestados/page.tsx`.
- `/sst/configuracoes/[id]` — fonte: `src/app/app-domain/sst/configuracoes/[id]/page.tsx`.
- `/sst/configuracoes` — fonte: `src/app/app-domain/sst/configuracoes/page.tsx`.
- `/sst/consolidado` — fonte: `src/app/app-domain/sst/consolidado/page.tsx`.
- `/sst/equipamentos/[id]` — fonte: `src/app/app-domain/sst/equipamentos/[id]/page.tsx`.
- `/sst/equipamentos/entregas/[id]/comprovante` — fonte: `src/app/app-domain/sst/equipamentos/entregas/[id]/comprovante/page.tsx`.
- `/sst/equipamentos/entregas/[id]` — fonte: `src/app/app-domain/sst/equipamentos/entregas/[id]/page.tsx`.
- `/sst/equipamentos/entregas` — fonte: `src/app/app-domain/sst/equipamentos/entregas/page.tsx`.
- `/sst/equipamentos/necessidades` — fonte: `src/app/app-domain/sst/equipamentos/necessidades/page.tsx`.
- `/sst/equipamentos` — fonte: `src/app/app-domain/sst/equipamentos/page.tsx`.
- `/sst/equipamentos/relatorios` — fonte: `src/app/app-domain/sst/equipamentos/relatorios/page.tsx`.
- `/sst/ghe` — fonte: `src/app/app-domain/sst/ghe/page.tsx`.
- `/sst/integracoes/[id]` — fonte: `src/app/app-domain/sst/integracoes/[id]/page.tsx`.
- `/sst/integracoes` — fonte: `src/app/app-domain/sst/integracoes/page.tsx`.
- `/sst/jornadas` — fonte: `src/app/app-domain/sst/jornadas/page.tsx`.
- `/sst/juntas` — fonte: `src/app/app-domain/sst/juntas/page.tsx`.
- `/sst/ordens-servico/[id]` — fonte: `src/app/app-domain/sst/ordens-servico/[id]/page.tsx`.
- `/sst/ordens-servico` — fonte: `src/app/app-domain/sst/ordens-servico/page.tsx`.
- `/sst` — fonte: `src/app/app-domain/sst/page.tsx`.
- `/sst/planos/[id]` — fonte: `src/app/app-domain/sst/planos/[id]/page.tsx`.
- `/sst/planos/cadastro` — fonte: `src/app/app-domain/sst/planos/cadastro/page.tsx`.
- `/sst/planos` — fonte: `src/app/app-domain/sst/planos/page.tsx`.
- `/sst/ppp` — fonte: `src/app/app-domain/sst/ppp/page.tsx`.
- `/sst/prevencao/[id]/imprimir` — fonte: `src/app/app-domain/sst/prevencao/[id]/imprimir/page.tsx`.
- `/sst/prevencao/[id]` — fonte: `src/app/app-domain/sst/prevencao/[id]/page.tsx`.
- `/sst/prevencao/calendario` — fonte: `src/app/app-domain/sst/prevencao/calendario/page.tsx`.
- `/sst/prevencao/novo` — fonte: `src/app/app-domain/sst/prevencao/novo/page.tsx`.
- `/sst/prevencao` — fonte: `src/app/app-domain/sst/prevencao/page.tsx`.
- `/sst/profissionais` — fonte: `src/app/app-domain/sst/profissionais/page.tsx`.
- `/sst/programas/[id]` — fonte: `src/app/app-domain/sst/programas/[id]/page.tsx`.
- `/sst/programas` — fonte: `src/app/app-domain/sst/programas/page.tsx`.
- `/sst/prontuarios/[id]` — fonte: `src/app/app-domain/sst/prontuarios/[id]/page.tsx`.
- `/sst/prontuarios` — fonte: `src/app/app-domain/sst/prontuarios/page.tsx`.
- `/sst/questionarios/[id]` — fonte: `src/app/app-domain/sst/questionarios/[id]/page.tsx`.
- `/sst/questionarios` — fonte: `src/app/app-domain/sst/questionarios/page.tsx`.
- `/sst/relatorios` — fonte: `src/app/app-domain/sst/relatorios/page.tsx`.
- `/sst/restricoes/[id]` — fonte: `src/app/app-domain/sst/restricoes/[id]/page.tsx`.
- `/sst/restricoes` — fonte: `src/app/app-domain/sst/restricoes/page.tsx`.
- `/sst/vacinacao` — fonte: `src/app/app-domain/sst/vacinacao/page.tsx`.
- `/sst/vinculos` — fonte: `src/app/app-domain/sst/vinculos/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/sst/acidentes/actions.ts`: `saveAccident`, `saveEvidence`, `saveLedger`.
- `src/app/app-domain/sst/acidentes/layout-actions.ts`: `saveInssCatLayout`.
- `src/app/app-domain/sst/actions.ts`: `createSstCertificate`, `createSstReason`, `assessSstCertificate`, `attachSstCertificateDocument`, `saveSstAccessGrant`.
- `src/app/app-domain/sst/agenda-actions.ts`: `saveSstBoard`, `saveSstAvailability`, `saveSstAppointment`, `saveSstBlock`, `cancelSstAppointment`, `updateSstReason`, `setSstReasonActive`.
- `src/app/app-domain/sst/aso/actions.ts`: `saveSstAso`, `saveSstAsoCorrection`, `saveSstAsoSettings`, `saveSstAsoVacationSource`, `saveSstAsoDocument`.
- `src/app/app-domain/sst/atestados/functional-actions.ts`: `reconcileSstLeavePayroll`, `confirmSstLeave`, `reviseSstDecision`.
- `src/app/app-domain/sst/equipamentos/actions.ts`: `saveEquipment`, `saveEquipmentDelivery`, `saveEquipmentEvent`, `saveEquipmentPolicy`, `saveEquipmentRequirement`.
- `src/app/app-domain/sst/ghe/actions.ts`: `createSstExposureGroup`.
- `src/app/app-domain/sst/integracoes/actions.ts`: `prepareEventAction`, `configureEventAction`, `transmitEventAction`.
- `src/app/app-domain/sst/jornadas/actions.ts`: `saveSstPlannedShift`.
- `src/app/app-domain/sst/ordens-servico/actions.ts`: `saveServiceOrder`, `saveTechnicalResponsibility`, `revokeTechnicalRecord`.
- `src/app/app-domain/sst/planos/actions.ts`: `saveHealthPlan`, `saveBenefitBeneficiary`, `saveBenefitEntry`, `generateMonthly`, `approveBenefitPosting`, `saveBenefitPayrollScope`, `saveBenefitPayrollMapping`, `compensateBenefitCharge`.
- `src/app/app-domain/sst/prevencao/actions.ts`: `savePrevention`, `postponeMeeting`, `closeMeeting`.
- `src/app/app-domain/sst/profissionais/actions.ts`: `saveSstProfessional`, `saveSstDisciplineGrant`, `inactivateSstProfessional`.
- `src/app/app-domain/sst/programas/actions.ts`: `saveSstProgram`.
- `src/app/app-domain/sst/prontuarios/actions.ts`: `saveSstClinicalRecord`, `saveSstVaccination`.
- `src/app/app-domain/sst/questionarios/actions.ts`: `saveSstQuestionnaire`, `saveSstAnamnesis`.
- `src/app/app-domain/sst/restricoes/actions.ts`: `saveRestriction`, `saveRoleAttribute`, `saveFollowup`.
- `src/app/app-domain/sst/vinculos/actions.ts`: `saveFunctionalPeriod`, `saveEntityMapping`, `saveRegimePolicy`.

</details>

### 5.15. Almoxarifado e patrimônio

**Entrada:** `/patrimonio` · **Código de acesso:** `PATRIMONIO` · **Cadastro do código no banco:** ativo · **Páginas:** 25 · **Funções exportadas em arquivos de ações da área:** 33.

- **Subitens:** Almoxarifados; materiais/categorias/subcategorias; lotes e estoques; entradas, saídas, ajustes e devoluções; requisições e aprovações; inventário; centros de custo; recebimento e tombamento; bens e guarda; ciclo de vida, depreciação, valor e baixa.
- **Funcionalidades internas implementadas:** Há serviços de movimento e saldo, entrega parcial/integral de requisição, reversão, inventário com contagem/aprovação e aquisição de bem a partir do recebimento de compra. Guarda de equipamento e valorização do estoque também possuem operações.
- **Predisposição/canais externos:** Documentos comprobatórios no Blob e referências a aquisição/recebimento. Não foi encontrada integração automática de coletor RFID/leitor/órgão patrimonial externo já demonstrada.
- **Regras internas:** Saldo/lote/validade, movimento originado e estorno, escopo de unidade, todos os itens contados antes do fechamento; tombamento não repetido; eventos patrimoniais e contábeis preservam origem.
- **Conexões e cadastros:** Material, MaterialStock, MaterialMovement, Warehouse, Asset, AssetCategory, MaterialRequest, InventorySession, CostCenter, compras e financeiro.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Sem materiais, estoques, bens, almoxarifados, centros ou políticas de depreciação locais. Carregar inventário/saldos conciliados e definir perfis contábeis e vida útil antes de apuração operacional.
- **Fontes principais:** `src/lib/patrimonio/stock-service.ts`, `src/lib/patrimonio/inventory-service.ts`, `src/lib/patrimonio/asset-acquisition-service.ts`, `src/app/app-domain/patrimonio`.

<details>
<summary>Rotas de páginas da área (25) e ações identificadas</summary>

- `/patrimonio/almoxarifados/[id]/editar` — fonte: `src/app/app-domain/patrimonio/almoxarifados/[id]/editar/page.tsx`.
- `/patrimonio/almoxarifados/novo` — fonte: `src/app/app-domain/patrimonio/almoxarifados/novo/page.tsx`.
- `/patrimonio/almoxarifados` — fonte: `src/app/app-domain/patrimonio/almoxarifados/page.tsx`.
- `/patrimonio/bens/[id]/editar` — fonte: `src/app/app-domain/patrimonio/bens/[id]/editar/page.tsx`.
- `/patrimonio/bens/[id]` — fonte: `src/app/app-domain/patrimonio/bens/[id]/page.tsx`.
- `/patrimonio/bens/editar` — fonte: `src/app/app-domain/patrimonio/bens/editar/page.tsx`.
- `/patrimonio/bens/estoque` — fonte: `src/app/app-domain/patrimonio/bens/estoque/page.tsx`.
- `/patrimonio/bens/novo` — fonte: `src/app/app-domain/patrimonio/bens/novo/page.tsx`.
- `/patrimonio/bens` — fonte: `src/app/app-domain/patrimonio/bens/page.tsx`.
- `/patrimonio/centros-custo/[id]/editar` — fonte: `src/app/app-domain/patrimonio/centros-custo/[id]/editar/page.tsx`.
- `/patrimonio/centros-custo/novo` — fonte: `src/app/app-domain/patrimonio/centros-custo/novo/page.tsx`.
- `/patrimonio/centros-custo` — fonte: `src/app/app-domain/patrimonio/centros-custo/page.tsx`.
- `/patrimonio/ciclo-vida` — fonte: `src/app/app-domain/patrimonio/ciclo-vida/page.tsx`.
- `/patrimonio/inventarios/[id]` — fonte: `src/app/app-domain/patrimonio/inventarios/[id]/page.tsx`.
- `/patrimonio/inventarios` — fonte: `src/app/app-domain/patrimonio/inventarios/page.tsx`.
- `/patrimonio/manutencoes/[id]` — fonte: `src/app/app-domain/patrimonio/manutencoes/[id]/page.tsx`.
- `/patrimonio/materiais/movimentos/[id]` — fonte: `src/app/app-domain/patrimonio/materiais/movimentos/[id]/page.tsx`.
- `/patrimonio/materiais/novo` — fonte: `src/app/app-domain/patrimonio/materiais/novo/page.tsx`.
- `/patrimonio/materiais` — fonte: `src/app/app-domain/patrimonio/materiais/page.tsx`.
- `/patrimonio/materiais/subclasses` — fonte: `src/app/app-domain/patrimonio/materiais/subclasses/page.tsx`.
- `/patrimonio` — fonte: `src/app/app-domain/patrimonio/page.tsx`.
- `/patrimonio/requisicoes/[id]` — fonte: `src/app/app-domain/patrimonio/requisicoes/[id]/page.tsx`.
- `/patrimonio/requisicoes/nova` — fonte: `src/app/app-domain/patrimonio/requisicoes/nova/page.tsx`.
- `/patrimonio/requisicoes` — fonte: `src/app/app-domain/patrimonio/requisicoes/page.tsx`.
- `/patrimonio/valorizacao` — fonte: `src/app/app-domain/patrimonio/valorizacao/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/patrimonio/almoxarifados/actions.ts`: `createWarehouseAction`, `updateWarehouseAction`, `setWarehouseActiveAction`, `deleteWarehouseAction`.
- `src/app/app-domain/patrimonio/bens/actions.ts`: `acquireAssetFromReceiptAction`, `updateAssetAction`, `setAssetActiveAction`, `updateEquipmentCustodyAction`.
- `src/app/app-domain/patrimonio/bens/[id]/actions.ts`: `operateAssetAction`.
- `src/app/app-domain/patrimonio/centros-custo/actions.ts`: `createCostCenterAction`, `updateCostCenterAction`, `setCostCenterActiveAction`, `deleteCostCenterAction`.
- `src/app/app-domain/patrimonio/ciclo-vida/actions.ts`: `runMonthlyDepreciation`, `registerAssetDisposal`, `registerAssetValueAdjustment`, `reverseAssetValuationAction`.
- `src/app/app-domain/patrimonio/inventarios/actions.ts`: `createInventorySessionAction`, `recordInventoryCountAction`, `submitInventoryForApprovalAction`, `closeApprovedInventoryAction`.
- `src/app/app-domain/patrimonio/materiais/actions.ts`: `registerMaterialEntryAction`, `registerMaterialExitAction`, `adjustMaterialStockAction`.
- `src/app/app-domain/patrimonio/materiais/catalog-actions.ts`: `updateMaterialAction`, `setMaterialActiveAction`, `deleteMaterialAction`.
- `src/app/app-domain/patrimonio/requisicoes/actions.ts`: `createMaterialRequestAction`, `approveMaterialRequestAction`, `issueMaterialRequestItemAction`, `issueMaterialRequestInFullAction`.
- `src/app/app-domain/patrimonio/valorizacao/actions.ts`: `ingestStockValuationDocumentAction`, `reconcileStockValuationAction`.

</details>

### 5.16. Frotas, veículos e máquinas

**Entrada:** `/frotas` · **Código de acesso:** `FROTAS` · **Cadastro do código no banco:** ativo · **Páginas:** 3 · **Funções exportadas em arquivos de ações da área:** 2.

- **Subitens:** Frota por categoria; utilização; reservas e rotas; planos; OS/manutenções; consumos; gastos; seguros; obrigações; documentos; ocorrências; relatórios; controle de máquinas/checklists. Diversas áreas são abas/query params, não páginas físicas separadas.
- **Funcionalidades internas implementadas:** Contrato de mutações e serviços persistem cadastro, rota, uso, plano, início/conclusão de OS, consumo próprio/terceiro, obrigação, ocorrência e despesa. Há vínculo com patrimônio e opção de baixar ou vincular saída de estoque.
- **Predisposição/canais externos:** Portal de motorista/atendimento de frota, anexos e endpoint /api/frotas/externo; scripts de importação de FIPE e CTB existem. Isso não comprova telemetria/GPS, abastecimento automatizado ou integração SENATRAN em produção.
- **Regras internas:** Placa/RENAVAM, datas e leituras, quantidade positiva, permissão e departamento, idempotência e versão; baixa de estoque com origem. Relatórios declaram uso interno e não completude estatutária.
- **Conexões e cadastros:** FleetUnit/Route/Booking, Employee, Department, Asset, Supplier, MaterialStock/Movement, GED; TFD e transporte escolar usam frota/rotas.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Não há veículos, máquinas, motoristas, reservas, rotas ou manutenção no banco. Importar referências de catálogos, confirmar escopos e executar jornada de uso/consumo/OS com dados municipais.
- **Fontes principais:** `src/lib/frotas/contract.ts`, `src/lib/frotas/service.ts`, `src/lib/frotas/report.ts`, `src/app/api/frotas/externo/route.ts`.

<details>
<summary>Rotas de páginas da área (3) e ações identificadas</summary>

- `/frotas/gestao/anexos` — fonte: `src/app/app-domain/frotas/gestao/anexos/page.tsx`.
- `/frotas/gestao` — fonte: `src/app/app-domain/frotas/gestao/page.tsx`.
- `/frotas` — fonte: `src/app/app-domain/frotas/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/frotas/actions.ts`: `mutateFleetAction`.
- `src/app/app-domain/frotas/gestao/actions.ts`: `fleetControlAction`.

</details>

### 5.17. Educação

**Entrada:** `/educacao` · **Código de acesso:** `EDUCACAO` · **Cadastro do código no banco:** inativo · **Páginas:** 20 · **Funções exportadas em arquivos de ações da área:** 46.

- **Subitens:** Escolas; alunos/responsáveis; períodos/matrizes; turmas, professores e horários; matrícula/movimentação; diário/frequência/notas; documentos acadêmicos; pré-matrícula/classificação; portais professor/responsável e atividades; biblioteca; merenda/cardápio/estoque; financeiro escolar; transporte; Educacenso; apoio pedagógico.
- **Funcionalidades internas implementadas:** Há ações que persistem matrícula, turma, grade, avaliação e diário, emissão documental, fila de pré-matrícula, biblioteca, alimentação, financeiro e transporte. Conflitos de horário e parte das regras acadêmicas possuem testes.
- **Predisposição/canais externos:** Páginas para professor, responsável, interação pedagógica e pré-matrícula. Importação Educacenso aceita intercâmbio simplificado ESCOLA/ESTUDANTE/PROFISSIONAL/TURMA, com atualização efetiva concentrada em escola/estudante; exportação é texto para conferência.
- **Regras internas:** Identidade do aluno, vínculo com responsável, turma/escola/período, horários não sobrepostos, histórico de matrícula, publicação de avaliação, disponibilidade de exemplar e movimentação de estoque/alimentação.
- **Conexões e cadastros:** Person/Family, School/Student/Teacher, matrículas e turmas, Employee, documentos, estoque, contas escolares, frota e rotas.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Módulo desativado no banco e sem população. Layout/importação Educacenso oficial completa e retorno aceito pelo INEP não comprovados; validar todos os registros exigidos. Implantar matriz, calendário, escolas e vínculos de acesso aos portais.
- **Fontes principais:** `src/app/app-domain/educacao/s1-actions.ts`, `src/lib/educacao/s1.ts`, `src/app/app-domain/educacao/s3-actions.ts`, `src/app/app-domain/educacao/s4-actions.ts`, `src/app/app-domain/educacao/s5-actions.ts`.

<details>
<summary>Rotas de páginas da área (20) e ações identificadas</summary>

- `/educacao/academico` — fonte: `src/app/app-domain/educacao/academico/page.tsx`.
- `/educacao/alunos` — fonte: `src/app/app-domain/educacao/alunos/page.tsx`.
- `/educacao/biblioteca` — fonte: `src/app/app-domain/educacao/biblioteca/page.tsx`.
- `/educacao/calendario` — fonte: `src/app/app-domain/educacao/calendario/page.tsx`.
- `/educacao/documentos` — fonte: `src/app/app-domain/educacao/documentos/page.tsx`.
- `/educacao/educacenso` — fonte: `src/app/app-domain/educacao/educacenso/page.tsx`.
- `/educacao/escolas/novo` — fonte: `src/app/app-domain/educacao/escolas/novo/page.tsx`.
- `/educacao/escolas` — fonte: `src/app/app-domain/educacao/escolas/page.tsx`.
- `/educacao/matriculas` — fonte: `src/app/app-domain/educacao/matriculas/page.tsx`.
- `/educacao/merenda/novo` — fonte: `src/app/app-domain/educacao/merenda/novo/page.tsx`.
- `/educacao/merenda` — fonte: `src/app/app-domain/educacao/merenda/page.tsx`.
- `/educacao` — fonte: `src/app/app-domain/educacao/page.tsx`.
- `/educacao/portal-interativo` — fonte: `src/app/app-domain/educacao/portal-interativo/page.tsx`.
- `/educacao/portal-responsavel` — fonte: `src/app/app-domain/educacao/portal-responsavel/page.tsx`.
- `/educacao/pre-matricula` — fonte: `src/app/app-domain/educacao/pre-matricula/page.tsx`.
- `/educacao/professor` — fonte: `src/app/app-domain/educacao/professor/page.tsx`.
- `/educacao/professores` — fonte: `src/app/app-domain/educacao/professores/page.tsx`.
- `/educacao/recursos-escolares` — fonte: `src/app/app-domain/educacao/recursos-escolares/page.tsx`.
- `/educacao/suporte` — fonte: `src/app/app-domain/educacao/suporte/page.tsx`.
- `/educacao/transporte` — fonte: `src/app/app-domain/educacao/transporte/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/educacao/escolas/actions.ts`: `createSchool`.
- `src/app/app-domain/educacao/merenda/actions.ts`: `createSchoolMeal`.
- `src/app/app-domain/educacao/professor/actions.ts`: `saveDiaryAction`, `setDiaryStatusAction`, `createAssessmentAction`, `saveGradesAction`, `publishAssessmentAction`, `createAcademicRecordAction`, `createActivityAction`, `reviewSubmissionAction`.
- `src/app/app-domain/educacao/s1-actions.ts`: `createStudentAction`, `createAcademicPeriodAction`, `createCurriculumMatrixAction`, `createSchoolClassAction`, `assignTeacherSubjectAction`, `createEnrollmentAction`, `moveEnrollmentAction`, `createScheduleEntryAction`, `processEducacensoImportAction`, `generateEducacensoExportAction`.
- `src/app/app-domain/educacao/s3-actions.ts`: `generateAcademicDocumentAction`, `createPreEnrollmentProcessAction`, `submitPreEnrollmentAction`, `classifyPreEnrollmentsAction`, `allocatePreEnrollmentAction`, `submitLearningActivityAction`.
- `src/app/app-domain/educacao/s4-actions.ts`: `createLibraryTitleAction`, `createLibraryCopyAction`, `createLoanAction`, `updateLoanAction`, `reserveTitleAction`, `createSchoolMenuAction`, `createFoodMovementAction`, `createEducationAccountAction`, `createEducationMovementAction`, `createApplicationPlanAction`, `createTransportRouteAction`, `addTransportStopAction`, `addTransportStudentAction`, `createJourneyAction`, `updateJourneyAction`.
- `src/app/app-domain/educacao/s5-actions.ts`: `createCatalogItemAction`, `releaseCatalogItemAction`, `completePedagogicalAttemptAction`, `createSupportRequestAction`, `updateSupportRequestAction`.

</details>

### 5.18. Saúde pública

**Entrada:** `/saude` · **Código de acesso:** `SAUDE` · **Cadastro do código no banco:** ativo · **Páginas:** 66 · **Funções exportadas em arquivos de ações da área:** 290.

- **Subitens:** Administração/CNES-CBO-rede; pacientes/profissionais/equipes; agenda, espera e painel; acolhimento/triagem/PA/leitos; prontuário, diagnóstico, prescrição e procedimentos; linhas de cuidado; APS/território/visitas/famílias; regulação/cotas; laboratório; centro especializado; farmácia, compras/estoque/dispensação, judicialização e kits; vacinação/frascos/carteira/ESAVI; TFD; produção/faturamento/BPA/AIH/APAC/RAAS; SISAB/e-SUS; vigilância; indicadores e relatórios.
- **Funcionalidades internas implementadas:** Há serviços específicos para jornada clínica e administrativa, evolução/revisão, regulação, estoque e dispensação, laboratório, linhas materno-infantil/crônicas/odontologia, TFD com passageiros, fichas APS, competência produtiva e tabelas de preço. A produção conserva origem, preço e contexto; competência fechada bloqueia lançamentos retroativos.
- **Predisposição/canais externos:** Portal do paciente, importações de referências SUS e mensagens de dispositivos estão preparados. SISAB/e-SUS gera lote e aceita/rejeita localmente, sem protocolo oficial do Ministério. Conectores Hórus/SIGAF/RENAME/vacinação/dispositivos ficam em SANDBOX/HOMOLOGACAO no runtime geral.
- **Regras internas:** Escopo por unidade e profissional, identidade e idade, agenda/triagem, vínculo clínico e revisão, lote/validade/estoque, dose/intervalo/indicação, autorização e cota, origem/idempotência de produção; fechamento global exige acesso às unidades abrangidas.
- **Conexões e cadastros:** Person/Family, Patient, HealthUnit/Professional/Team, Material/Stock/Warehouse, Medicine/Vaccine, Supplier, Process/Document, frota/TFD, referências SUS e conexões externas.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; ConfiguracaoPerfil: 4; HealthCbo: 2; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Só há dois CBOs; nenhum paciente, unidade, profissional, material, vacina, referência SIGTAP/CNES ou atendimento. Importar catálogos oficiais e homologar cada formato e conector SUS; aceitação por validador local não é recebimento oficial.
- **Fontes principais:** `src/lib/saude/care-service.ts`, `src/lib/saude/production-service.ts`, `src/lib/saude/sisab-service.ts`, `src/lib/saude/sus-import-service.ts`, `src/lib/saude/vaccination-service.ts`, `src/lib/saude/pharmacy-dispensation-service.ts`.

<details>
<summary>Rotas de páginas da área (66) e ações identificadas</summary>

- `/saude/acolhimento` — fonte: `src/app/app-domain/saude/acolhimento/page.tsx`.
- `/saude/acompanhamento` — fonte: `src/app/app-domain/saude/acompanhamento/page.tsx`.
- `/saude/acompanhamento/receptores/[id]` — fonte: `src/app/app-domain/saude/acompanhamento/receptores/[id]/page.tsx`.
- `/saude/acompanhamento/remessas/[id]` — fonte: `src/app/app-domain/saude/acompanhamento/remessas/[id]/page.tsx`.
- `/saude/administracao/documentos` — fonte: `src/app/app-domain/saude/administracao/documentos/page.tsx`.
- `/saude/administracao/importacoes` — fonte: `src/app/app-domain/saude/administracao/importacoes/page.tsx`.
- `/saude/administracao/laboratorio` — fonte: `src/app/app-domain/saude/administracao/laboratorio/page.tsx`.
- `/saude/administracao` — fonte: `src/app/app-domain/saude/administracao/page.tsx`.
- `/saude/administracao/procedimentos` — fonte: `src/app/app-domain/saude/administracao/procedimentos/page.tsx`.
- `/saude/administracao/rede` — fonte: `src/app/app-domain/saude/administracao/rede/page.tsx`.
- `/saude/administracao/unificacoes` — fonte: `src/app/app-domain/saude/administracao/unificacoes/page.tsx`.
- `/saude/agenda/gestao` — fonte: `src/app/app-domain/saude/agenda/gestao/page.tsx`.
- `/saude/agenda` — fonte: `src/app/app-domain/saude/agenda/page.tsx`.
- `/saude/atendimentos/[id]/complementos` — fonte: `src/app/app-domain/saude/atendimentos/[id]/complementos/page.tsx`.
- `/saude/atendimentos/[id]/linhas-cuidado` — fonte: `src/app/app-domain/saude/atendimentos/[id]/linhas-cuidado/page.tsx`.
- `/saude/atendimentos/[id]` — fonte: `src/app/app-domain/saude/atendimentos/[id]/page.tsx`.
- `/saude/atendimentos` — fonte: `src/app/app-domain/saude/atendimentos/page.tsx`.
- `/saude/centro-especializado` — fonte: `src/app/app-domain/saude/centro-especializado/page.tsx`.
- `/saude/equipes` — fonte: `src/app/app-domain/saude/equipes/page.tsx`.
- `/saude/esus` — fonte: `src/app/app-domain/saude/esus/page.tsx`.
- `/saude/farmacia/catalogo` — fonte: `src/app/app-domain/saude/farmacia/catalogo/page.tsx`.
- `/saude/farmacia/chamadas` — fonte: `src/app/app-domain/saude/farmacia/chamadas/page.tsx`.
- `/saude/farmacia/dispensacoes` — fonte: `src/app/app-domain/saude/farmacia/dispensacoes/page.tsx`.
- `/saude/farmacia/inventario` — fonte: `src/app/app-domain/saude/farmacia/inventario/page.tsx`.
- `/saude/farmacia/judicial` — fonte: `src/app/app-domain/saude/farmacia/judicial/page.tsx`.
- `/saude/farmacia/kits` — fonte: `src/app/app-domain/saude/farmacia/kits/page.tsx`.
- `/saude/farmacia/notas` — fonte: `src/app/app-domain/saude/farmacia/notas/page.tsx`.
- `/saude/farmacia` — fonte: `src/app/app-domain/saude/farmacia/page.tsx`.
- `/saude/farmacia/requisicoes` — fonte: `src/app/app-domain/saude/farmacia/requisicoes/page.tsx`.
- `/saude/gerencial` — fonte: `src/app/app-domain/saude/gerencial/page.tsx`.
- `/saude/indicadores` — fonte: `src/app/app-domain/saude/indicadores/page.tsx`.
- `/saude/integracoes` — fonte: `src/app/app-domain/saude/integracoes/page.tsx`.
- `/saude/laboratorio` — fonte: `src/app/app-domain/saude/laboratorio/page.tsx`.
- `/saude/linhas-cuidado` — fonte: `src/app/app-domain/saude/linhas-cuidado/page.tsx`.
- `/saude/pacientes/[id]` — fonte: `src/app/app-domain/saude/pacientes/[id]/page.tsx`.
- `/saude/pacientes` — fonte: `src/app/app-domain/saude/pacientes/page.tsx`.
- `/saude` — fonte: `src/app/app-domain/saude/page.tsx`.
- `/saude/painel/[id]` — fonte: `src/app/app-domain/saude/painel/[id]/page.tsx`.
- `/saude/prestador` — fonte: `src/app/app-domain/saude/prestador/page.tsx`.
- `/saude/producao/fatos/[id]` — fonte: `src/app/app-domain/saude/producao/fatos/[id]/page.tsx`.
- `/saude/producao/laudos/[id]` — fonte: `src/app/app-domain/saude/producao/laudos/[id]/page.tsx`.
- `/saude/producao/laudos/novo` — fonte: `src/app/app-domain/saude/producao/laudos/novo/page.tsx`.
- `/saude/producao/laudos` — fonte: `src/app/app-domain/saude/producao/laudos/page.tsx`.
- `/saude/producao` — fonte: `src/app/app-domain/saude/producao/page.tsx`.
- `/saude/producao/previas` — fonte: `src/app/app-domain/saude/producao/previas/page.tsx`.
- `/saude/producao/raas` — fonte: `src/app/app-domain/saude/producao/raas/page.tsx`.
- `/saude/producao/tabelas` — fonte: `src/app/app-domain/saude/producao/tabelas/page.tsx`.
- `/saude/profissionais` — fonte: `src/app/app-domain/saude/profissionais/page.tsx`.
- `/saude/pronto-atendimento` — fonte: `src/app/app-domain/saude/pronto-atendimento/page.tsx`.
- `/saude/regulacao` — fonte: `src/app/app-domain/saude/regulacao/page.tsx`.
- `/saude/relatorios` — fonte: `src/app/app-domain/saude/relatorios/page.tsx`.
- `/saude/sisab` — fonte: `src/app/app-domain/saude/sisab/page.tsx`.
- `/saude/territorio/atencao-primaria` — fonte: `src/app/app-domain/saude/territorio/atencao-primaria/page.tsx`.
- `/saude/territorio` — fonte: `src/app/app-domain/saude/territorio/page.tsx`.
- `/saude/tfd/laudos/[id]` — fonte: `src/app/app-domain/saude/tfd/laudos/[id]/page.tsx`.
- `/saude/tfd/laudos` — fonte: `src/app/app-domain/saude/tfd/laudos/page.tsx`.
- `/saude/tfd` — fonte: `src/app/app-domain/saude/tfd/page.tsx`.
- `/saude/tfd/viagens/[id]` — fonte: `src/app/app-domain/saude/tfd/viagens/[id]/page.tsx`.
- `/saude/tfd/viagens` — fonte: `src/app/app-domain/saude/tfd/viagens/page.tsx`.
- `/saude/unidades` — fonte: `src/app/app-domain/saude/unidades/page.tsx`.
- `/saude/vacinacao/carteira/[id]` — fonte: `src/app/app-domain/saude/vacinacao/carteira/[id]/page.tsx`.
- `/saude/vacinacao/carteiras` — fonte: `src/app/app-domain/saude/vacinacao/carteiras/page.tsx`.
- `/saude/vacinacao/esavi` — fonte: `src/app/app-domain/saude/vacinacao/esavi/page.tsx`.
- `/saude/vacinacao/gestao` — fonte: `src/app/app-domain/saude/vacinacao/gestao/page.tsx`.
- `/saude/vacinacao` — fonte: `src/app/app-domain/saude/vacinacao/page.tsx`.
- `/saude/vigilancia` — fonte: `src/app/app-domain/saude/vigilancia/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/saude/acolhimento/actions.ts`: `createSpontaneousCareAction`, `registerHealthTriageAction`, `callHealthAppointmentAction`.
- `src/app/app-domain/saude/acompanhamento/actions.ts`: `configureFollowupAction`, `generateFollowupAction`, `processFollowupAction`.
- `src/app/app-domain/saude/administracao/actions.ts`: `saveHealthCbo`, `saveHealthSpecialty`, `saveHealthService`, `saveHealthSpecialtyGroup`, `saveHealthUnitAdministration`, `changeHealthUnitStatus`, `saveHealthUnitShift`, `saveHealthUnitSpecialty`, `saveHealthServiceAssignment`, `saveHealthHabilitation`, `saveHealthProfessionalAdministration`, `changeHealthProfessionalStatus`, `saveHealthProfessionalAssignment`, `saveHealthSchedulingGroup`, `saveHealthHoliday`, `saveHealthUserAccess`.
- `src/app/app-domain/saude/administracao/documentos/actions.ts`: `saveHealthStandardDocument`, `signHealthStandardDocument`.
- `src/app/app-domain/saude/administracao/importacoes/actions.ts`: `importHealthSusFile`.
- `src/app/app-domain/saude/administracao/laboratorio/actions.ts`: `saveLaboratoryConfiguration`.
- `src/app/app-domain/saude/administracao/rede/actions.ts`: `saveProfessionalContactAction`, `saveWorkingHoursAction`, `saveMaintainerAction`, `saveUnitNetworkAction`, `saveAgreementAction`, `saveCoverageAction`.
- `src/app/app-domain/saude/administracao/unificacoes/actions.ts`: `mergeHealthRecords`.
- `src/app/app-domain/saude/agenda/actions.ts`: `createHealthAppointmentAction`, `transitionHealthAppointmentAction`.
- `src/app/app-domain/saude/agenda/gestao/actions.ts`: `updateBookingIdentityAction`, `saveExtendedScheduleAction`, `saveScheduleBlockAction`, `configureReviewsAction`, `reviewRequestAction`, `bookRegulationAction`, `distributeQuotaAction`, `addProgramWaitlistAction`, `convertWaitlistAction`, `saveCallPanelAction`, `callPatientAction`.
- `src/app/app-domain/saude/agenda/schedule-actions.ts`: `saveScheduleAction`, `transitionScheduleAction`, `addWaitlistAction`, `transitionWaitlistAction`, `remanejarAppointmentAction`.
- `src/app/app-domain/saude/atendimentos/actions.ts`: `startHealthCareAction`, `completeHealthAppointmentAction`.
- `src/app/app-domain/saude/atendimentos/[id]/actions.ts`: `saveNarrativeAction`, `addEvolutionAction`, `addDiagnosisAction`, `addPrescriptionAction`, `addExamAction`, `addProcedureAction`, `addReferralAction`, `concludeCareAction`, `addClinicalDocumentAction`.
- `src/app/app-domain/saude/atendimentos/[id]/complementos/actions.ts`: `saveClinicalConditionAction`, `saveOngoingMedicationAction`, `saveQuestionnaireAction`, `answerQuestionnaireAction`, `administerMedicationAction`, `reviewExamAction`, `counterreferenceAction`, `reviseCareAction`, `configureCareAction`, `internalReferralAction`, `procedureRuleAction`, `saveDocumentTemplateAction`, `issueCareDocumentAction`, `savePrescriptionTemplateAction`, `applyPrescriptionTemplateAction`, `regroupPrescriptionAction`, `prescriptionValidityAction`.
- `src/app/app-domain/saude/atendimentos/[id]/linhas-cuidado/actions.ts`: `openPregnancyAction`, `prenatalVisitAction`, `closePregnancyAction`, `chronicAssessmentAction`, `screeningAction`, `dentalMarkAction`, `scheduleSessionsAction`, `transitionSessionAction`.
- `src/app/app-domain/saude/centro-especializado/actions.ts`: `saveCatalogAction`, `saveScheduleAction`, `createPlanAction`, `addEntryAction`, `saveQuotaAction`, `distributeAction`.
- `src/app/app-domain/saude/equipes/actions.ts`: `createHealthTeam`, `updateHealthTeam`, `toggleHealthTeamStatus`, `deleteHealthTeam`.
- `src/app/app-domain/saude/farmacia/actions.ts`: `saveHealthReceiptAction`, `configureReceiptApprovalAction`, `approveHealthReceiptAction`, `createHealthProductAction`, `createHealthWarehouseAction`, `dispatchPharmacyIntegrationAction`, `saveMedicineInteractionAction`, `saveDosageTemplateAction`, `createPharmacyRequestAction`, `setStockBlockAction`, `toggleControlledBookAction`, `receiveStockAction`, `dispenseAction`, `dispatchTransferAction`, `receiveTransferAction`, `writeOffAction`.
- `src/app/app-domain/saude/farmacia/catalogo/actions.ts`: `saveDcbSubstanceAction`, `savePharmacyCatalogAction`, `saveCatmatMappingAction`.
- `src/app/app-domain/saude/farmacia/chamadas/actions.ts`: `configurePharmacyPanelAction`, `callPharmacyPatientAction`.
- `src/app/app-domain/saude/farmacia/dispensacoes/actions.ts`: `dispenseFromManagerAction`, `dispenseManualAction`, `cancelDispensationAction`, `correctDispensationAction`.
- `src/app/app-domain/saude/farmacia/inventario/actions.ts`: `startPharmacyInventoryAction`, `countPharmacyInventoryAction`, `submitPharmacyInventoryAction`, `closePharmacyInventoryAction`.
- `src/app/app-domain/saude/farmacia/judicial/actions.ts`: `savePharmacyLawyerAction`, `createJudicialCaseAction`, `transitionJudicialCaseAction`, `renewJudicialCaseAction`, `dispenseJudicialCaseAction`, `uploadJudicialDocumentAction`.
- `src/app/app-domain/saude/farmacia/kits/actions.ts`: `saveKitAction`, `generateKitsAction`, `deliverKitAction`, `uncollectedKitAction`, `returnKitAction`, `saveCareProgramAction`, `enrollCareProgramAction`, `closeCareProgramAction`.
- `src/app/app-domain/saude/farmacia/notas/actions.ts`: `previewPharmacyInvoiceAction`, `importPharmacyInvoiceAction`.
- `src/app/app-domain/saude/farmacia/requisicoes/actions.ts`: `createPharmacyRequestManagerAction`, `dispatchRequestedProductsAction`, `receiveRequestedProductsAction`, `fulfillPharmacyDemandAction`, `cancelPharmacyRequestManagerAction`, `cancelPharmacyProductDeliveryAction`.
- `src/app/app-domain/saude/indicadores/actions.ts`: `classifyIndicatorTeamAction`.
- `src/app/app-domain/saude/laboratorio/actions.ts`: `saveExamModelAction`, `saveExamScheduleAction`, `saveProviderQuotaAction`, `saveAssistentialDeviceAction`, `scheduleOrderAction`, `collectSampleAction`, `enterResultAction`, `recollectAction`, `createReportAction`, `reviewReportAction`, `releaseReportAction`.
- `src/app/app-domain/saude/pacientes/actions.ts`: `createPatient`, `updatePatient`, `togglePatientStatus`, `deletePatient`.
- `src/app/app-domain/saude/pacientes/[id]/actions.ts`: `recordPhoneCallAction`, `saveRegistrationDetailsAction`, `savePatientAddressAction`, `saveRegistrationPolicyAction`, `savePatientContactAction`, `recordPatientDeathAction`, `uploadPatientDocumentAction`.
- `src/app/app-domain/saude/prestador/actions.ts`: `executeGuideAction`.
- `src/app/app-domain/saude/producao/actions.ts`: `openCompetenceAction`, `captureFactsAction`, `processCompetenceAction`, `closeCompetenceAction`, `reopenCompetenceAction`, `resolveCriticismAction`, `generateFileAction`, `captureManualFactAction`, `importProductionFileAction`, `saveProductionTargetAction`, `saveUnitCeilingAction`, `processFileAction`.
- `src/app/app-domain/saude/producao/fatos/[id]/actions.ts`: `reviseManualFactAction`.
- `src/app/app-domain/saude/producao/laudos/actions.ts`: `saveTreatmentReportAction`, `createIssuerAction`, `createNumberRangeAction`, `transitionTreatmentReportAction`, `authorizeTreatmentReportsAction`, `configureAihCancellationAction`, `cancelTreatmentAuthorizationAction`, `markAihPaidAction`, `dischargeAihAction`, `renewApacAction`, `recordApacPermanenceAction`.
- `src/app/app-domain/saude/producao/tabelas/actions.ts`: `publishHealthPricesAction`.
- `src/app/app-domain/saude/profissionais/actions.ts`: `createHealthProfessional`, `updateHealthProfessional`, `toggleHealthProfessionalStatus`, `deleteHealthProfessional`.
- `src/app/app-domain/saude/pronto-atendimento/actions.ts`: `createReceptionAction`, `linkReceptionAction`, `transitionReceptionAction`, `saveProtocolAction`, `saveDestinationAction`, `saveRoomAction`, `saveBedAction`, `transitionBedAction`, `admitBedAction`, `dischargeBedAction`, `createObservationAction`, `transitionObservationAction`.
- `src/app/app-domain/saude/regulacao/actions.ts`: `saveRegulationQuotaAction`, `createRegulationRequestAction`, `saveSectorAction`, `reclassifyAction`, `transferAuthorizationAction`, `grantProviderAccessAction`, `addAttachmentAction`, `transitionRegulationAction`.
- `src/app/app-domain/saude/sisab/actions.ts`: `saveFormAction`, `finalizeFormAction`, `createBatchAction`, `processBatchAction`.
- `src/app/app-domain/saude/territorio/actions.ts`: `saveAreaAction`, `saveMicroareaAction`, `saveHouseholdAction`, `saveFamilyAction`, `addFamilyMemberAction`, `createVisitAction`, `addVisitParticipantAction`.
- `src/app/app-domain/saude/territorio/atencao-primaria/actions.ts`: `uploadFamilyDocumentAction`, `saveHouseholdDetailsAction`, `savePrimaryFamilyAction`, `changeFamilyMemberAction`, `moveFamilyAction`, `recordVisitOutcomeAction`, `createHomeCareRequestAction`, `assessHomeCareAction`, `performHomeCareAction`, `recordCollectiveActivityAction`, `recordFoodMarkersAction`.
- `src/app/app-domain/saude/tfd/actions.ts`: `createTfdRequestAction`, `authorizeTfdAction`, `createTripAction`, `addPassengerAction`, `movePassengerAction`, `updateTripStatusAction`, `requestPassengerRemovalAction`, `confirmPassengerRemovalAction`.
- `src/app/app-domain/saude/tfd/laudos/actions.ts`: `saveTfdReportAction`, `supplementTfdReportAction`, `transitionTfdReportAction`, `authorizeTfdReportAction`, `requestTfdBenefitAction`, `transitionTfdBenefitAction`.
- `src/app/app-domain/saude/tfd/viagens/actions.ts`: `createBookedTfdTripAction`, `confirmTfdTripAction`, `boardTfdPassengerAction`, `addAuthorizedTfdPassengerAction`.
- `src/app/app-domain/saude/unidades/actions.ts`: `createHealthUnit`, `updateHealthUnit`, `toggleHealthUnitStatus`, `deleteHealthUnit`.
- `src/app/app-domain/saude/vacinacao/actions.ts`: `recordVaccinationAction`, `recordVaccineLossAction`, `exportVaccinationAction`.
- `src/app/app-domain/saude/vacinacao/gestao/actions.ts`: `manufacturerAction`, `vaccineMappingAction`, `vaccineStockConfigurationAction`, `vaccineCalendarAction`, `vaccineInteractionAction`, `vaccinationCampaignAction`, `receiveVaccineVialsAction`, `vaccineLotAction`, `existingVialAction`, `prepareVialAction`, `reconcileVialAction`, `vaccinationCardEventAction`, `revokeVaccinationCardEventAction`, `vaccineAdverseEventAction`, `vaccineAdverseConductAction`.
- `src/app/app-domain/saude/vigilancia/actions.ts`: `saveEstablishmentAction`, `saveComplaintAction`, `transitionComplaintAction`, `saveInspectionAction`, `transitionInspectionAction`, `issueLicenseAction`, `transitionLicenseAction`.

</details>

### 5.19. Portal do paciente

**Entrada:** `/portal-paciente` · **Código de acesso:** `PORTAL_PACIENTE` · **Cadastro do código no banco:** ativo · **Páginas:** 5 · **Funções exportadas em arquivos de ações da área:** 5.

- **Subitens:** Entrada e identificação; agenda; dados pessoais; histórico de saúde; ouvidoria; carteira/documento de vacinação.
- **Funcionalidades internas implementadas:** Há serviço de acesso ao paciente, linha do tempo e consulta do próprio histórico. O núcleo clínico é o módulo Saúde; não se trata de uma segunda base de prontuário.
- **Predisposição/canais externos:** Entrada /portal-paciente e rotas /portal-paciente/* resolvidas pelo proxy para o workspace de paciente; API de documento de vacinação disponível no código.
- **Regras internas:** Identidade autenticada ligada ao paciente, restrição de titularidade e visibilidade dos registros/documentos; não é consulta livre de prontuário de terceiros.
- **Conexões e cadastros:** Saúde, Patient↔Person, usuário/principal autenticado, agendas, vacinação, documentos e atendimento.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Não há pacientes nem identidades vinculadas. Necessário teste ponta a ponta de acesso e sigilo com usuários de paciente e dados autorizados.
- **Fontes principais:** `src/lib/portal-paciente/access.ts`, `src/lib/saude/patient-portal-service.ts`, `src/lib/saude/patient-timeline-service.ts`, `src/app/app-domain/portal-paciente`.

<details>
<summary>Rotas de páginas da área (5) e ações identificadas</summary>

- `/portal-paciente/agenda` — fonte: `src/app/app-domain/portal-paciente/agenda/page.tsx`.
- `/portal-paciente/dados` — fonte: `src/app/app-domain/portal-paciente/dados/page.tsx`.
- `/portal-paciente/ouvidoria` — fonte: `src/app/app-domain/portal-paciente/ouvidoria/page.tsx`.
- `/portal-paciente` — fonte: `src/app/app-domain/portal-paciente/page.tsx`.
- `/portal-paciente/saude` — fonte: `src/app/app-domain/portal-paciente/saude/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/portal-paciente/actions.ts`: `requestAppointmentAction`, `confirmAppointmentAction`, `cancelAppointmentAction`, `updateContactAction`, `createManifestationAction`.

</details>

### 5.20. Assistência social e SUAS

**Entrada:** `/social` · **Código de acesso:** `SOCIAL` · **Cadastro do código no banco:** ativo · **Páginas:** 16 · **Funções exportadas em arquivos de ações da área:** 33.

- **Subitens:** Unidades CRAS/CREAS; profissionais/vínculos; famílias e indivíduos; prontuário/histórico; atendimentos; visitas; encaminhamento e rede; modelos; catálogos SUAS/salário mínimo; programas/benefícios; estoque/cotas/requisições/avaliação/dispensação; CadÚnico local e RMA.
- **Funcionalidades internas implementadas:** Há persistência de unidade, família canônica, perfil e fatos individuais, vínculo profissional, encaminhamento/retorno e benefício com recebimento, cota, avaliação, entrega e cancelamento. O sigilo e o escopo são aplicados na consulta ao banco.
- **Predisposição/canais externos:** A função chamada queryCadUnicoMds consulta CadUnicoRecord local: não faz chamada ao MDS. Prontuário RMA também é registro interno; não foi demonstrada transmissão federal.
- **Regras internas:** Acesso SUAS por unidade/vínculo/sigilo, unidade e pessoa canônica, vigência e expediente, renda/benefício, quota e estoque. O auxiliar CadÚnico contém limites fixos de elegibilidade (218 e 353), que não devem ser assumidos como legislação vigente configurada.
- **Conexões e cadastros:** Person, Family/FamilyMember, SocialFamily, Employee, SocialUnit, Program/Benefit, estrutura organizacional, dotação, documentos e rede socioassistencial.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Sem famílias, unidades, profissionais, benefícios ou CadÚnico populados. Parametrizar critérios legais vigentes, importar base autorizada e desenvolver integração oficial se o edital a exigir.
- **Fontes principais:** `src/lib/social/social-engine.ts`, `src/lib/social/access-policy.ts`, `src/lib/social/benefit-delivery.ts`, `src/app/app-domain/social/actions.ts`.

<details>
<summary>Rotas de páginas da área (16) e ações identificadas</summary>

- `/social/atendimentos` — fonte: `src/app/app-domain/social/atendimentos/page.tsx`.
- `/social/beneficios` — fonte: `src/app/app-domain/social/beneficios/page.tsx`.
- `/social/configuracoes` — fonte: `src/app/app-domain/social/configuracoes/page.tsx`.
- `/social/encaminhamentos/[id]/comprovante` — fonte: `src/app/app-domain/social/encaminhamentos/[id]/comprovante/page.tsx`.
- `/social/encaminhamentos` — fonte: `src/app/app-domain/social/encaminhamentos/page.tsx`.
- `/social/familias` — fonte: `src/app/app-domain/social/familias/page.tsx`.
- `/social/modelos` — fonte: `src/app/app-domain/social/modelos/page.tsx`.
- `/social` — fonte: `src/app/app-domain/social/page.tsx`.
- `/social/pessoas/[id]` — fonte: `src/app/app-domain/social/pessoas/[id]/page.tsx`.
- `/social/pessoas` — fonte: `src/app/app-domain/social/pessoas/page.tsx`.
- `/social/profissionais` — fonte: `src/app/app-domain/social/profissionais/page.tsx`.
- `/social/prontuario` — fonte: `src/app/app-domain/social/prontuario/page.tsx`.
- `/social/requisicoes/[id]/comprovante` — fonte: `src/app/app-domain/social/requisicoes/[id]/comprovante/page.tsx`.
- `/social/requisicoes` — fonte: `src/app/app-domain/social/requisicoes/page.tsx`.
- `/social/unidades` — fonte: `src/app/app-domain/social/unidades/page.tsx`.
- `/social/visitas` — fonte: `src/app/app-domain/social/visitas/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/social/actions.ts`: `createSocialUnit`, `updateSocialUnit`, `toggleSocialUnitStatus`, `createFamily`, `updateFamily`, `toggleFamilyStatus`, `createAttendance`, `updateAttendance`, `createSocialBenefit`, `createSocialProgram`, `toggleAttendanceStatus`, `createBenefitConcession`.
- `src/app/app-domain/social/configuracoes/actions.ts`: `saveSocialCatalogEntry`, `saveSocialMinimumWage`.
- `src/app/app-domain/social/encaminhamentos/actions.ts`: `saveSocialNetworkOrganization`, `registerSocialReferral`, `returnSocialReferral`.
- `src/app/app-domain/social/pessoas/actions.ts`: `registerSocialFact`, `endSocialFact`, `registerSocialFinancialEntry`, `cancelSocialFinancialEntry`, `saveSocialPersonProfile`.
- `src/app/app-domain/social/profissionais/actions.ts`: `saveSocialProfessionalLink`.
- `src/app/app-domain/social/prontuario/cadunico-actions.ts`: `searchCadUnicoAction`, `saveRmaRecordAction`, `getRmaHistoryAction`.
- `src/app/app-domain/social/requisicoes/actions.ts`: `configureSocialBenefit`, `registerSocialBenefitReceipt`, `registerSocialBenefitQuota`, `registerSocialBenefitRequest`, `assessSocialBenefitItem`, `deliverSocialBenefitItem`, `cancelSocialBenefitRequest`.

</details>

### 5.21. Meio ambiente

**Entrada:** `/meio-ambiente` · **Código de acesso:** `MEIO_AMBIENTE` · **Cadastro do código no banco:** inativo · **Páginas:** 10 · **Funções exportadas em arquivos de ações da área:** 27.

- **Subitens:** Empreendimentos; licenciamento LP/LI/LO; denúncias; fiscalização; áreas verdes; resíduos; educação ambiental; solicitações; documentos e relatórios.
- **Funcionalidades internas implementadas:** Há CRUDs de empreendimentos, licenças, denúncias, vistorias, áreas, resíduos e programas. Um segundo fluxo gera EnvironmentalLicense com número, validade e hash, separado de EnvLicense.
- **Predisposição/canais externos:** URL de validação de licença é construída com host fixo celeriflow.gov.br; não foi identificada página /validar-licenca no inventário. Não há prova de integração com sistema ambiental estadual/federal.
- **Regras internas:** Permissão por operação, situação e validade; validações de entrada. No gerador examinado, numeração usa componente aleatório e a validade tem fallback de 12 meses.
- **Conexões e cadastros:** Empreendimento, proprietário/empresa/pessoa, imóvel, processo, documentos e fiscais.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Módulo desativado e vazio. Conciliar EnvLicense e EnvironmentalLicense, concluir validação pública/host, instituir numeração e fluxo técnico/legal do município e conectar fontes externas quando exigidas.
- **Fontes principais:** `src/app/app-domain/meio-ambiente/actions.ts`, `src/lib/meio-ambiente/licenciamento-engine.ts`, `src/app/app-domain/meio-ambiente/licenciamento/licencas-actions.ts`.

<details>
<summary>Rotas de páginas da área (10) e ações identificadas</summary>

- `/meio-ambiente/areas-verdes` — fonte: `src/app/app-domain/meio-ambiente/areas-verdes/page.tsx`.
- `/meio-ambiente/denuncias` — fonte: `src/app/app-domain/meio-ambiente/denuncias/page.tsx`.
- `/meio-ambiente/documentos` — fonte: `src/app/app-domain/meio-ambiente/documentos/page.tsx`.
- `/meio-ambiente/educacao` — fonte: `src/app/app-domain/meio-ambiente/educacao/page.tsx`.
- `/meio-ambiente/empreendimentos` — fonte: `src/app/app-domain/meio-ambiente/empreendimentos/page.tsx`.
- `/meio-ambiente/fiscalizacao` — fonte: `src/app/app-domain/meio-ambiente/fiscalizacao/page.tsx`.
- `/meio-ambiente/licenciamento` — fonte: `src/app/app-domain/meio-ambiente/licenciamento/page.tsx`.
- `/meio-ambiente` — fonte: `src/app/app-domain/meio-ambiente/page.tsx`.
- `/meio-ambiente/residuos` — fonte: `src/app/app-domain/meio-ambiente/residuos/page.tsx`.
- `/meio-ambiente/solicitacoes` — fonte: `src/app/app-domain/meio-ambiente/solicitacoes/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/meio-ambiente/actions.ts`: `createEnvEnterprise`, `updateEnvEnterprise`, `inactivateEnvEnterprise`, `createEnvLicense`, `updateEnvLicense`, `inactivateEnvLicense`, `deleteEnvLicense`, `createEnvComplaint`, `updateEnvComplaint`, `deleteEnvComplaint`, `createEnvInspection`, `updateEnvInspection`, `deleteEnvInspection`, `createEnvGreenArea`, `updateEnvGreenArea`, `inactivateEnvGreenArea`, `createEnvWaste`, `updateEnvWaste`, `deleteEnvWaste`, `createEnvEduProgram`, `updateEnvEduProgram`, `deleteEnvEduProgram`, `createEnvDocument`, `updateEnvDocument`, `deleteEnvDocument`.
- `src/app/app-domain/meio-ambiente/licenciamento/licencas-actions.ts`: `issueEnvironmentalLicenseAction`, `getIssuedLicensesAction`.

</details>

### 5.22. Água e saneamento

**Entrada:** `/saneamento` · **Código de acesso:** `SANEAMENTO` · **Cadastro do código no banco:** inativo · **Páginas:** 10 · **Funções exportadas em arquivos de ações da área:** 15.

- **Subitens:** Cadastros e unidades consumidoras; hidrômetros/leituras; faturas/faturamento; qualidade da água; serviços/OS; solicitações de portal; relatórios.
- **Funcionalidades internas implementadas:** Há manutenção de unidades, leituras e serviços, consulta de faturas e cálculo progressivo de água/esgoto com gravação em WaterMeterReading. Existem famílias paralelas San* e WaterMeterReading.
- **Predisposição/canais externos:** O motor gera texto de linha digitável/PIX por concatenação, sem emissão em PSP/banco. Não comprova código de barras/PIX homologado, cobrança bancária ou baixa real.
- **Regras internas:** No motor examinado, faixas e multiplicadores são fixos: mínima 32,50 até 10 m³, demais faixas 4,80/7,50/11,20, esgoto 80%, taxa 5,00 e fatores comercial/industrial. Consumo negativo é reduzido a zero; revisar a política de medição.
- **Conexões e cadastros:** ConsumerUnit/WaterMeterReading, pessoa/imóvel/endereço, hidrômetro, serviços, qualidade e eventual arrecadação/financeiro.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Módulo desativado e vazio. Parametrizar tarifas oficiais e vigências, conciliar cadastros San* e motor, validar fatura, substituir cobrança sintética por integração bancária real e ligar a receita contábil.
- **Fontes principais:** `src/lib/saneamento/saneamento-engine.ts`, `src/app/app-domain/saneamento/actions.ts`, `src/app/app-domain/saneamento/leituras/leituras-actions.ts`.

<details>
<summary>Rotas de páginas da área (10) e ações identificadas</summary>

- `/saneamento/cadastros` — fonte: `src/app/app-domain/saneamento/cadastros/page.tsx`.
- `/saneamento/faturamento` — fonte: `src/app/app-domain/saneamento/faturamento/page.tsx`.
- `/saneamento/faturas` — fonte: `src/app/app-domain/saneamento/faturas/page.tsx`.
- `/saneamento/leituras` — fonte: `src/app/app-domain/saneamento/leituras/page.tsx`.
- `/saneamento` — fonte: `src/app/app-domain/saneamento/page.tsx`.
- `/saneamento/portal` — fonte: `src/app/app-domain/saneamento/portal/page.tsx`.
- `/saneamento/qualidade` — fonte: `src/app/app-domain/saneamento/qualidade/page.tsx`.
- `/saneamento/relatorios` — fonte: `src/app/app-domain/saneamento/relatorios/page.tsx`.
- `/saneamento/servicos` — fonte: `src/app/app-domain/saneamento/servicos/page.tsx`.
- `/saneamento/unidades` — fonte: `src/app/app-domain/saneamento/unidades/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/saneamento/actions.ts`: `createConsumerUnit`, `updateConsumerUnit`, `inactivateConsumerUnit`, `createMeterReading`, `updateMeterReading`, `createServiceOrder`, `updateServiceOrder`, `updateWaterQualityAnalysis`, `inactivateWaterQualityAnalysis`, `updatePortalRequest`, `inactivatePortalRequest`, `updateSavedReport`, `inactivateSavedReport`.
- `src/app/app-domain/saneamento/leituras/leituras-actions.ts`: `processMeterReadingAction`, `getWaterReadingsAction`.

</details>

### 5.23. Obras, serviços públicos e construção civil

**Entrada:** `/obras` · **Código de acesso:** `OBRAS` · **Cadastro do código no banco:** ativo · **Páginas:** 30 · **Funções exportadas em arquivos de ações da área:** 56.

- **Subitens:** Obras/medições; serviços e OS; equipes/servidores/equipamentos/materiais/compras; documentos; construção civil: abertura, participantes, profissionais/construtoras, zoneamento/viabilidade, distribuição, análise/reanálise, consultas, taxas, ciclo de vida, fiscalização, projetos/carimbos, emissão e assinatura documental.
- **Funcionalidades internas implementadas:** Obras e serviços persistem execução e vínculos operacionais. Construção civil tem definições e configurações versionadas, workflow, responsáveis, análise, regras, documentos, fiscalização e ponte para taxa/processo.
- **Predisposição/canais externos:** Portal de construção civil permite abertura, termos, anexos, participação e acompanhamento; documentos têm validação/assinatura. Viabilidade automática usa regras e configurações locais; não comprova consulta a cartório, concessionária ou aprovação externa.
- **Regras internas:** Documentos/checklists obrigatórios, versão de regra e zona, habilitação e validade profissional/construtora, distribuição e substituição de analista, prazos, publicação e assinaturas. Baixas de materiais ligam estoque e serviço.
- **Conexões e cadastros:** Process/Document, Person/Company, RealEstate, Employee/Department, Asset/MaterialStock, PurchaseRequest/Process, BudgetAppropriation/Commitment, Tax/TaxGuide e certificado A1.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConstructionCatalogEntry: 26; DocumentClass: 7; Tax: 3; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Existem 26 itens básicos de catálogo de construção, mas não configurações municipais, zoneamento, equipes, obras ou processos. Publicar códigos/leis/regras locais e testar jornada externa, arrecadação e assinatura com dados reais.
- **Fontes principais:** `src/app/app-domain/obras/actions.ts`, `src/lib/obras/construction-lifecycle-policy.ts`, `src/lib/obras/construction-external-policy.ts`, `src/lib/obras/construction-review.ts`, `src/lib/obras/construction-document-storage.ts`.

<details>
<summary>Rotas de páginas da área (30) e ações identificadas</summary>

- `/obras/construcao-civil/[id]/ciclo` — fonte: `src/app/app-domain/obras/construcao-civil/[id]/ciclo/page.tsx`.
- `/obras/construcao-civil/[id]/documentos` — fonte: `src/app/app-domain/obras/construcao-civil/[id]/documentos/page.tsx`.
- `/obras/construcao-civil/[id]` — fonte: `src/app/app-domain/obras/construcao-civil/[id]/page.tsx`.
- `/obras/construcao-civil/[id]/pranchas` — fonte: `src/app/app-domain/obras/construcao-civil/[id]/pranchas/page.tsx`.
- `/obras/construcao-civil/configuracoes` — fonte: `src/app/app-domain/obras/construcao-civil/configuracoes/page.tsx`.
- `/obras/construcao-civil/construtoras` — fonte: `src/app/app-domain/obras/construcao-civil/construtoras/page.tsx`.
- `/obras/construcao-civil/consultas` — fonte: `src/app/app-domain/obras/construcao-civil/consultas/page.tsx`.
- `/obras/construcao-civil/documentos` — fonte: `src/app/app-domain/obras/construcao-civil/documentos/page.tsx`.
- `/obras/construcao-civil/equipe` — fonte: `src/app/app-domain/obras/construcao-civil/equipe/page.tsx`.
- `/obras/construcao-civil/fiscalizacao/[id]/atos/[actId]` — fonte: `src/app/app-domain/obras/construcao-civil/fiscalizacao/[id]/atos/[actId]/page.tsx`.
- `/obras/construcao-civil/fiscalizacao/[id]` — fonte: `src/app/app-domain/obras/construcao-civil/fiscalizacao/[id]/page.tsx`.
- `/obras/construcao-civil/fiscalizacao` — fonte: `src/app/app-domain/obras/construcao-civil/fiscalizacao/page.tsx`.
- `/obras/construcao-civil/integracoes` — fonte: `src/app/app-domain/obras/construcao-civil/integracoes/page.tsx`.
- `/obras/construcao-civil/novo` — fonte: `src/app/app-domain/obras/construcao-civil/novo/page.tsx`.
- `/obras/construcao-civil` — fonte: `src/app/app-domain/obras/construcao-civil/page.tsx`.
- `/obras/construcao-civil/participacao` — fonte: `src/app/app-domain/obras/construcao-civil/participacao/page.tsx`.
- `/obras/construcao-civil/profissionais` — fonte: `src/app/app-domain/obras/construcao-civil/profissionais/page.tsx`.
- `/obras/construcao-civil/regras` — fonte: `src/app/app-domain/obras/construcao-civil/regras/page.tsx`.
- `/obras/construcao-civil/taxas/guias/[id]` — fonte: `src/app/app-domain/obras/construcao-civil/taxas/guias/[id]/page.tsx`.
- `/obras/construcao-civil/taxas` — fonte: `src/app/app-domain/obras/construcao-civil/taxas/page.tsx`.
- `/obras/construcao-civil/vistorias` — fonte: `src/app/app-domain/obras/construcao-civil/vistorias/page.tsx`.
- `/obras/documentos` — fonte: `src/app/app-domain/obras/documentos/page.tsx`.
- `/obras/fiscalizacao-medicoes` — fonte: `src/app/app-domain/obras/fiscalizacao-medicoes/page.tsx`.
- `/obras/iluminacao-energia` — fonte: `src/app/app-domain/obras/iluminacao-energia/page.tsx`.
- `/obras/maquinas-equipes` — fonte: `src/app/app-domain/obras/maquinas-equipes/page.tsx`.
- `/obras/obras-projetos` — fonte: `src/app/app-domain/obras/obras-projetos/page.tsx`.
- `/obras/ordens-servico` — fonte: `src/app/app-domain/obras/ordens-servico/page.tsx`.
- `/obras` — fonte: `src/app/app-domain/obras/page.tsx`.
- `/obras/relatorios` — fonte: `src/app/app-domain/obras/relatorios/page.tsx`.
- `/obras/servicos-urbanos` — fonte: `src/app/app-domain/obras/servicos-urbanos/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/obras/actions.ts`: `createObra`, `updateObra`, `inactivateObra`, `createMedicao`, `updateMedicao`, `inactivateMedicao`, `createServico`, `updateServico`, `inactivateServico`, `configureServicoIntegration`, `assignEmployeeToServico`, `assignTeamToServico`, `assignEquipmentToServico`, `issueMaterialToServico`, `linkPurchaseToServico`, `attachDocumentToServico`.
- `src/app/app-domain/obras/construcao-civil/actions.ts`: `saveConstructionCatalog`, `publishConstructionConfiguration`, `saveConstructionStaff`, `openConstructionCase`.
- `src/app/app-domain/obras/construcao-civil/assignment-actions.ts`: `substituteConstructionAnalyst`.
- `src/app/app-domain/obras/construcao-civil/construtoras/actions.ts`: `saveConstructionCompanyProfile`.
- `src/app/app-domain/obras/construcao-civil/consultas/actions.ts`: `requestConstructionConsultation`, `respondConstructionConsultation`.
- `src/app/app-domain/obras/construcao-civil/document-actions.ts`: `saveConstructionDocumentTemplate`, `emitConstructionDocument`, `publishConstructionDocument`, `requestConstructionDocumentSignatures`, `signConstructionDocumentInternally`, `signConstructionDocumentA1`, `annotateConstructionProject`.
- `src/app/app-domain/obras/construcao-civil/fiscalizacao/actions.ts`: `openEnforcement`, `assignEnforcement`, `recordEnforcementVisit`, `issueEnforcementAct`, `acknowledgeEnforcementAct`.
- `src/app/app-domain/obras/construcao-civil/lifecycle-actions.ts`: `executeConstructionLifecycle`.
- `src/app/app-domain/obras/construcao-civil/message-actions.ts`: `sendConstructionInternalMessage`.
- `src/app/app-domain/obras/construcao-civil/participation-actions.ts`: `saveConstructionPortalIdentity`, `publishConstructionTerm`, `saveConstructionParticipant`.
- `src/app/app-domain/obras/construcao-civil/project-stamp-actions.ts`: `stampAndRequestConstructionProjectSignatures`, `retryConstructionProjectSignatures`, `signConstructionProjectStamp`, `publishConstructionStampedProject`.
- `src/app/app-domain/obras/construcao-civil/review-actions.ts`: `registerConstructionReview`, `resubmitConstructionCase`.
- `src/app/app-domain/obras/construcao-civil/rules-actions.ts`: `saveConstructionProfessional`, `saveConstructionEmployer`, `publishConstructionDefinition`, `publishConstructionDistribution`, `publishConstructionZone`, `linkConstructionPropertyZone`, `evaluateConstructionCase`.
- `src/app/app-domain/obras/construcao-civil/tax-actions.ts`: `publishConstructionTaxRuleAction`, `issueConstructionFeeAction`.

</details>

### 5.24. Iluminação pública — Iluminaflow

**Entrada:** `/iluminacao-publica` · **Código de acesso:** `ILUMINACAO_PUBLICA` · **Cadastro do código no banco:** ausente · **Páginas:** 3 · **Funções exportadas em arquivos de ações da área:** 0.

- **Subitens:** Serviços de iluminação/energia e ordens de serviço; equipe, servidores, equipamentos, materiais e documentos.
- **Funcionalidades internas implementadas:** A área reutiliza ObrasServico e componentes/ações de Obras, filtrando tipo Iluminação. Não é um motor ou banco de iluminação independente.
- **Predisposição/canais externos:** Abertura de ocorrência/cidadão pode ser ligada aos canais municipais, mas não foi comprovada comunicação com concessionária, telegestão ou IoT.
- **Regras internas:** Permissão ILUMINACAO_PUBLICA e vínculos operacionais do serviço/estoque. O cadastro desse código não aparece nos 29 módulos do Neon, embora o cartão exista no painel.
- **Conexões e cadastros:** Obras, Department, Employee, Asset, MaterialStock, compras, documentos e dotação/empenho.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Regularizar cadastro/ativação do módulo e verificar permissões nas ações compartilhadas de Obras; sem serviços carregados. Confirmar cadastro de pontos luminosos, inventário geográfico e telegestão se requeridos pelo edital.
- **Fontes principais:** `src/app/app-domain/iluminacao-publica/iluminacao-energia/page.tsx`, `src/app/app-domain/iluminacao-publica/ordens-servico/page.tsx`, `src/app/app-domain/obras/actions.ts`.

<details>
<summary>Rotas de páginas da área (3) e ações identificadas</summary>

- `/iluminacao-publica/iluminacao-energia` — fonte: `src/app/app-domain/iluminacao-publica/iluminacao-energia/page.tsx`.
- `/iluminacao-publica/ordens-servico` — fonte: `src/app/app-domain/iluminacao-publica/ordens-servico/page.tsx`.
- `/iluminacao-publica` — fonte: `src/app/app-domain/iluminacao-publica/page.tsx`.

</details>

### 5.25. Cultura, esporte e lazer — AcessaFlow

**Entrada:** `/cultura` · **Código de acesso:** `CULTURA` · **Cadastro do código no banco:** inativo · **Páginas:** 8 · **Funções exportadas em arquivos de ações da área:** 10.

- **Subitens:** Agentes; espaços; patrimônio cultural; eventos; reservas; atividades esportivas; editais/projetos e fomento; conselhos/fundos; documentos.
- **Funcionalidades internas implementadas:** Há criação/inativação de agente/espaço/evento e reserva com vínculos a pessoa/empresa, imóvel/patrimônio e servidor. Telas consultam atividades, projetos e outras entidades culturais.
- **Predisposição/canais externos:** O portal possui base de reserva de espaços reutilizável. Não foi comprovada integração PNAB/MinC ou prestação oficial por API.
- **Regras internas:** Cadastro/reserva e permissão por operação; atenção ao fluxo de fomento separado: submitCulturalProjectAction já grava APROVADO e valor aprovado igual ao solicitado; submitAccountabilityAction ignora reciboNota e homologa/conclui automaticamente.
- **Conexões e cadastros:** Person/Company, Asset/RealEstate, Employee, espaços/reservas, CulturaProjeto/Eventos e CulturalIncentiveProject.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Módulo desativado e vazio. Desenvolver avaliação/seleção/decisão documental e prestação com evidências antes de considerar fomento um fluxo completo; confirmar formulários de manutenção de todas as telas de consulta.
- **Fontes principais:** `src/app/app-domain/cultura/actions.ts`, `src/app/app-domain/cultura/fomento-projetos/fomento-actions.ts`, `src/app/app-domain/cultura/esporte-lazer/page.tsx`.

<details>
<summary>Rotas de páginas da área (8) e ações identificadas</summary>

- `/cultura/conselhos-fundos` — fonte: `src/app/app-domain/cultura/conselhos-fundos/page.tsx`.
- `/cultura/documentos` — fonte: `src/app/app-domain/cultura/documentos/page.tsx`.
- `/cultura/espacos-reservas` — fonte: `src/app/app-domain/cultura/espacos-reservas/page.tsx`.
- `/cultura/esporte-lazer` — fonte: `src/app/app-domain/cultura/esporte-lazer/page.tsx`.
- `/cultura/eventos` — fonte: `src/app/app-domain/cultura/eventos/page.tsx`.
- `/cultura/fomento-projetos` — fonte: `src/app/app-domain/cultura/fomento-projetos/page.tsx`.
- `/cultura/gestao-cultural` — fonte: `src/app/app-domain/cultura/gestao-cultural/page.tsx`.
- `/cultura` — fonte: `src/app/app-domain/cultura/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/cultura/actions.ts`: `createAgente`, `inactivateAgente`, `createEspaco`, `inactivateEspaco`, `createEvento`, `cancelEvento`, `createReserva`.
- `src/app/app-domain/cultura/fomento-projetos/fomento-actions.ts`: `submitCulturalProjectAction`, `submitAccountabilityAction`, `getCulturalProjectsAction`.

</details>

### 5.26. Gestão de cemitérios

**Entrada:** `/cemiterios` · **Código de acesso:** `CEMITERIOS` · **Cadastro do código no banco:** ativo · **Páginas:** 13 · **Funções exportadas em arquivos de ações da área:** 29.

- **Subitens:** Estrutura/cemitérios/setores/quadras/lotes/sepulturas/ossuários; identificação; falecidos; funerárias; responsáveis; sepultamento/exumação/transferência; velório/cremação; concessão; anexos; taxas/guias e dívida; consultas e relatórios.
- **Funcionalidades internas implementadas:** Há serviços de estrutura e capacidade, workflows e movimentos, concessões, documentos e integração de taxa cemiterial com crédito tributário/guia/dívida.
- **Predisposição/canais externos:** Anexos privados e documentos/comprovantes; a existência do módulo não prova integração de registro civil/cartório/óbito.
- **Regras internas:** Capacidade e ocupação, alvo de anexo/identificação, movimento permitido, regras de taxa versionadas e idempotência. Cinco CHECKs desta família estão NOT VALID conforme a migration, mas aplicam-se a novas gravações.
- **Conexões e cadastros:** Person, TaxCemetery/TaxGrave e Cemetery*, Taxpayer/TaxAssessment/Guide/ActiveDebt, Process, Document e Blob.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: Tax: 3; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Toda a operação está vazia. Implantar mapa físico, ocupação e concessões históricas conciliadas, tabelas legais e política de validação de dados legados.
- **Fontes principais:** `src/lib/cemeteries`, `src/app/app-domain/cemiterios`, `prisma/migrations-ibema/20261011010000_cemetery_integrity/migration.sql`.

<details>
<summary>Rotas de páginas da área (13) e ações identificadas</summary>

- `/cemiterios/comprovante/[code]` — fonte: `src/app/app-domain/cemiterios/comprovante/[code]/page.tsx`.
- `/cemiterios/consulta` — fonte: `src/app/app-domain/cemiterios/consulta/page.tsx`.
- `/cemiterios/estrutura/[id]` — fonte: `src/app/app-domain/cemiterios/estrutura/[id]/page.tsx`.
- `/cemiterios/estrutura` — fonte: `src/app/app-domain/cemiterios/estrutura/page.tsx`.
- `/cemiterios/ocupacao/[id]` — fonte: `src/app/app-domain/cemiterios/ocupacao/[id]/page.tsx`.
- `/cemiterios/ocupacao` — fonte: `src/app/app-domain/cemiterios/ocupacao/page.tsx`.
- `/cemiterios` — fonte: `src/app/app-domain/cemiterios/page.tsx`.
- `/cemiterios/processos/[id]` — fonte: `src/app/app-domain/cemiterios/processos/[id]/page.tsx`.
- `/cemiterios/processos` — fonte: `src/app/app-domain/cemiterios/processos/page.tsx`.
- `/cemiterios/relatorio` — fonte: `src/app/app-domain/cemiterios/relatorio/page.tsx`.
- `/cemiterios/taxas/guias/[id]` — fonte: `src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx`.
- `/cemiterios/taxas` — fonte: `src/app/app-domain/cemiterios/taxas/page.tsx`.
- `/cemiterios/transferencias` — fonte: `src/app/app-domain/cemiterios/transferencias/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/cemiterios/actions.ts`: `createCemeteryAction`, `createSectorAction`, `createGraveAction`, `registerEmployeeAction`, `registerFuneralHomeAction`, `registerDeceasedAction`, `registerMovementAction`, `grantConcessionAction`, `issueCemeteryFeeAction`, `enrollCemeteryFeeInDebtAction`, `createChapelAction`, `createOssuaryAction`, `createLotAction`, `createIdentificationFieldAction`, `createDeathCauseAction`, `setEntityActiveAction`, `createProcessAction`, `advanceProcessAction`, `attachDocumentAction`, `createFeeRuleAction`.
- `src/app/app-domain/cemiterios/estrutura/actions.ts`: `saveStructureAction`.
- `src/app/app-domain/cemiterios/processos/workflow-actions.ts`: `readWorkflowReference`, `checkWorkflowDebt`, `saveWorkflow`, `advanceWorkflow`, `saveWorkflowTransfer`.
- `src/app/app-domain/cemiterios/taxas/actions.ts`: `publishFeeVersionAction`, `retryFeeEventAction`, `recordAdditionalFeeEventAction`.

</details>

### 5.27. Câmara municipal e legislativo

**Entrada:** `/camara` · **Código de acesso:** `CAMARA` · **Cadastro do código no banco:** ativo · **Páginas:** 17 · **Funções exportadas em arquivos de ações da área:** 7.

- **Subitens:** Legislaturas; vereadores; sessões/pautas/atas; proposições; comissões; leis; audiências; portal; planejamento legislativo PPA/LDO/LOA e cadastros.
- **Funcionalidades internas implementadas:** Há tabelas e consultas legislativas e ações de legislatura, vereador, sessão e proposição. Planejamento da Câmara reutiliza o domínio de planejamento com jurisdição própria.
- **Predisposição/canais externos:** Conteúdo/portal e publicação institucional estão previstos; não foi comprovada integração legislativa externa, painel eletrônico, votação nominal assinada ou streaming.
- **Regras internas:** Permissão CAMARA; planejamento legislativo exige também PLANEJAMENTO e recorte próprio. A entidade jurídica deve permanecer distinta do Executivo.
- **Conexões e cadastros:** GovernmentEntity, CamLegislatura/Vereador/Sessao/Proposicao/Lei/Comissao/Audiencia, planejamento, GED e portal.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Sem dados legislativos. Existem controles visuais não ligados à ação, por exemplo o botão Nova Sessão em SessoesClient.tsx; revisar ligação de formulários e completar votação/atas/comissões conforme cada requisito do edital.
- **Fontes principais:** `src/app/app-domain/camara/actions.ts`, `src/app/app-domain/camara/sessoes/SessoesClient.tsx`, `src/lib/planejamento/access.ts`, `src/app/app-domain/camara/leis/page.tsx`.

<details>
<summary>Rotas de páginas da área (17) e ações identificadas</summary>

- `/camara/audiencias` — fonte: `src/app/app-domain/camara/audiencias/page.tsx`.
- `/camara/comissoes` — fonte: `src/app/app-domain/camara/comissoes/page.tsx`.
- `/camara/legislaturas` — fonte: `src/app/app-domain/camara/legislaturas/page.tsx`.
- `/camara/leis` — fonte: `src/app/app-domain/camara/leis/page.tsx`.
- `/camara` — fonte: `src/app/app-domain/camara/page.tsx`.
- `/camara/planejamento/[kind]/[id]/gestao/[section]` — fonte: `src/app/app-domain/camara/planejamento/[kind]/[id]/gestao/[section]/page.tsx`.
- `/camara/planejamento/[kind]/[id]` — fonte: `src/app/app-domain/camara/planejamento/[kind]/[id]/page.tsx`.
- `/camara/planejamento/[kind]` — fonte: `src/app/app-domain/camara/planejamento/[kind]/page.tsx`.
- `/camara/planejamento/audiencias` — fonte: `src/app/app-domain/camara/planejamento/audiencias/page.tsx`.
- `/camara/planejamento/cadastros/[catalog]` — fonte: `src/app/app-domain/camara/planejamento/cadastros/[catalog]/page.tsx`.
- `/camara/planejamento/entidades` — fonte: `src/app/app-domain/camara/planejamento/entidades/page.tsx`.
- `/camara/planejamento/importacoes` — fonte: `src/app/app-domain/camara/planejamento/importacoes/page.tsx`.
- `/camara/planejamento` — fonte: `src/app/app-domain/camara/planejamento/page.tsx`.
- `/camara/portal` — fonte: `src/app/app-domain/camara/portal/page.tsx`.
- `/camara/proposicoes` — fonte: `src/app/app-domain/camara/proposicoes/page.tsx`.
- `/camara/sessoes` — fonte: `src/app/app-domain/camara/sessoes/page.tsx`.
- `/camara/vereadores` — fonte: `src/app/app-domain/camara/vereadores/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/camara/actions.ts`: `createLegislatura`, `createVereador`, `deleteVereador`, `createSessao`, `deleteSessao`, `createProposicao`, `deleteProposicao`.

</details>

### 5.28. Segurança e mobilidade

**Entrada:** `/seguranca` · **Código de acesso:** `SEGURANCA` · **Cadastro do código no banco:** inativo · **Páginas:** 10 · **Funções exportadas em arquivos de ações da área:** 5.

- **Subitens:** Guardas/agentes/equipes; ocorrências/despachos; rondas/câmeras; defesa civil; trânsito/sinalização; autos; mobilidade/rotas; OS/equipamentos; documentos e relatórios.
- **Funcionalidades internas implementadas:** Há criação, atualização e situação de guardas, ocorrências, infrações e registros por categoria; um fluxo específico grava TrafficInfractionTicket. Parte das áreas usa registro genérico categorizado.
- **Predisposição/canais externos:** Não foi comprovado envio de autuações para DETRAN/SENATRAN, comunicação 190, vídeo ao vivo ou integração de câmeras; cadastro de câmera/ronda não é integração de videomonitoramento.
- **Regras internas:** Permissão por operação, validação de campos e categorias de ocorrência/infração. Examinar competência legal e catálogos de CTB para autuação oficial.
- **Conexões e cadastros:** SegurancaGuarda/Ocorrencia/Infracao/MobilidadeRegistro e TrafficInfractionTicket; pessoa, estrutura, frota e patrimônio conforme vínculo disponível.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Módulo desativado e sem dados. Completar fluxos operacionais/externos de trânsito e vídeo e seus protocolos caso sejam exigidos; confirmar se as telas genéricas atendem granularidade do edital.
- **Fontes principais:** `src/app/app-domain/seguranca/actions.ts`, `src/app/app-domain/seguranca/infracoes/infracoes-actions.ts`, `src/app/app-domain/seguranca`.

<details>
<summary>Rotas de páginas da área (10) e ações identificadas</summary>

- `/seguranca/defesa-civil` — fonte: `src/app/app-domain/seguranca/defesa-civil/page.tsx`.
- `/seguranca/documentos` — fonte: `src/app/app-domain/seguranca/documentos/page.tsx`.
- `/seguranca/guardas` — fonte: `src/app/app-domain/seguranca/guardas/page.tsx`.
- `/seguranca/infracoes` — fonte: `src/app/app-domain/seguranca/infracoes/page.tsx`.
- `/seguranca/mobilidade` — fonte: `src/app/app-domain/seguranca/mobilidade/page.tsx`.
- `/seguranca/ocorrencias` — fonte: `src/app/app-domain/seguranca/ocorrencias/page.tsx`.
- `/seguranca/ordens` — fonte: `src/app/app-domain/seguranca/ordens/page.tsx`.
- `/seguranca` — fonte: `src/app/app-domain/seguranca/page.tsx`.
- `/seguranca/rondas` — fonte: `src/app/app-domain/seguranca/rondas/page.tsx`.
- `/seguranca/transito` — fonte: `src/app/app-domain/seguranca/transito/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/seguranca/actions.ts`: `createSegMobItem`, `updateSegMobItem`, `toggleSegMobItemStatus`.
- `src/app/app-domain/seguranca/infracoes/infracoes-actions.ts`: `issueTrafficTicketAction`, `getTrafficTicketsAction`.

</details>

### 5.29. Auditoria e rastreabilidade

**Entrada:** `/auditoria` · **Código de acesso:** `AUDITORIA` · **Cadastro do código no banco:** ativo · **Páginas:** 1 · **Funções exportadas em arquivos de ações da área:** 0.

- **Subitens:** Consulta de eventos; período/ator/tipo/alvo; paginação; distribuição estatística; sessão, páginas, interação, formulários e mutações; documentos/assinaturas/estoque/processos.
- **Funcionalidades internas implementadas:** Há AuditEvent, serviço de consulta, catálogo de tipos estáveis e rastreador de uso. Regras SQL protegem eventos em famílias críticas. A tela calcula totais e agrupamentos a partir do banco.
- **Predisposição/canais externos:** Não foi demonstrada exportação para SIEM externo ou trilha WORM contratada; logging no Neon não é uma evidência externa independente.
- **Regras internas:** Identificador estável de ator/alvo, escopo e consultas paginadas, bloqueios de mutação em eventos conforme migrations. A cobertura de chamadas deve ser confirmada por fluxo; catálogo de tipos não prova que todas as ações são auditadas.
- **Conexões e cadastros:** Usuario, AuditEvent, FinancialAuditLog, ProcessEvent, eventos de domínio, plataforma e módulos produtores.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** AuditEvent e logs operacionais estão vazios na captura; não há histórico de uso para avaliar cobertura real. Executar jornadas de aceite e confirmar eventos de sucesso, erro, revogação e exportação.
- **Fontes principais:** `src/app/app-domain/auditoria/page.tsx`, `src/lib/platform/audit-evidence.ts`, `src/lib/platform/audit-query-service.ts`, `src/components/platform/UsageAuditTracker.tsx`.

<details>
<summary>Rotas de páginas da área (1) e ações identificadas</summary>

- `/auditoria` — fonte: `src/app/app-domain/auditoria/page.tsx`.

</details>

### 5.30. Controle interno

**Entrada:** `/controle-interno` · **Código de acesso:** `ADMINISTRACAO` · **Cadastro do código no banco:** ativo · **Páginas:** 5 · **Funções exportadas em arquivos de ações da área:** 18.

- **Subitens:** Planos; apontamentos e resolução; parecer; checklists; notificações/respostas/revisão; agenda de obrigações; diagnóstico municipal; auditorias; relatórios circunstanciados; consultas de ouvidoria, RH e processos judiciais.
- **Funcionalidades internas implementadas:** Há workflow de plano/checklist/achado, auditoria agendada e respondida, análise fundamentada, agenda/alertas e relatório final com publicação. Usa ADMINISTRACAO para acesso, sem cartão independente no painel principal.
- **Predisposição/canais externos:** Pode publicar relatórios no portal e acionar alertas internos; não foi comprovada entrega automática desses pareceres a tribunal ou controladoria externa.
- **Regras internas:** UG/ente e usuários autorizados; plano não conclui com apontamento pendente ou checklist incompleto; eventos registram notificações e versões; acesso a respostas restrito aos envolvidos.
- **Conexões e cadastros:** InternalControlPlan/Finding/Event, Usuario/UG, Employee, CostCenter, Document, FinancialYear; consulta finanças, RH, processos e ouvidoria.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; GovernmentEntity: 2; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Sem UGs, planos, checklists, agenda ou achados. Configurar modelos, calendário e responsáveis e validar se o conjunto de diagnósticos cobre o edital específico.
- **Fontes principais:** `src/app/app-domain/controle-interno/page.tsx`, `src/lib/c7/operations-service.ts`, `src/lib/c7/control-audits.ts`, `src/lib/c7/circumstantiated-report.ts`.

<details>
<summary>Rotas de páginas da área (5) e ações identificadas</summary>

- `/controle-interno/consultas/judicial` — fonte: `src/app/app-domain/controle-interno/consultas/judicial/page.tsx`.
- `/controle-interno/consultas/ouvidoria` — fonte: `src/app/app-domain/controle-interno/consultas/ouvidoria/page.tsx`.
- `/controle-interno/consultas/rh` — fonte: `src/app/app-domain/controle-interno/consultas/rh/page.tsx`.
- `/controle-interno` — fonte: `src/app/app-domain/controle-interno/page.tsx`.
- `/controle-interno/relatorios` — fonte: `src/app/app-domain/controle-interno/relatorios/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/controle-interno/actions.ts`: `runMunicipalDiagnosticsAction`, `createControlPlanAction`, `createControlFindingAction`, `resolveControlFindingAction`, `transitionControlPlanAction`, `recordControlOpinionAction`, `publishControlChecklistAction`, `answerControlChecklistAction`, `runControlChecklistDiagnosticsAction`, `sendControlNoticeAction`, `respondControlNoticeAction`, `reviewControlNoticeResponseAction`, `scheduleControlObligationAction`, `completeControlObligationAction`, `runControlAgendaAlertsAction`.
- `src/app/app-domain/controle-interno/audit-actions.ts`: `scheduleControlAuditAction`, `controlAuditCommandAction`.
- `src/app/app-domain/controle-interno/report-actions.ts`: `controlFinalReportAction`.

</details>

### 5.31. Suporte técnico da plataforma

**Entrada:** `/suporte-tecnico` · **Código de acesso:** `SUPORTE_TECNICO` · **Cadastro do código no banco:** ativo · **Páginas:** 1 · **Funções exportadas em arquivos de ações da área:** 0.

- **Subitens:** Página de apresentação; severidades S1–S4; referência de SLA; roadmap de chamados, incidentes, anexos, base de conhecimento e relatórios.
- **Funcionalidades internas implementadas:** Existe página protegida e apresentação das severidades. A própria tela informa que nenhuma capacidade do roadmap está disponível ou persiste dados nesta versão.
- **Predisposição/canais externos:** Nenhum canal contratual, help desk externo, abertura de chamado ou integração de atendimento técnico foi demonstrado.
- **Regras internas:** Acesso ao módulo é verificado; tempos de SLA e responsáveis aguardam configuração contratual. Não há workflow operacional para auditar.
- **Conexões e cadastros:** Somente autenticação/permissão e configuração futura de contrato/canais. Não confundir com ATENDIMENTO, que serve à população municipal.
- **Estado dos dados:** As tabelas diretamente identificadas da área/bibliotecas não têm registros; ou a entrada não consulta modelos diretamente, como no suporte/portais de encaminhamento.
- **Pendências e desenvolvimento:** Desenvolvimento necessário de persistência, triagem, SLA, incidentes, evidências, notificações e relatórios; não é apenas ativar um token de integração.
- **Fontes principais:** `src/app/app-domain/suporte-tecnico/page.tsx`.

<details>
<summary>Rotas de páginas da área (1) e ações identificadas</summary>

- `/suporte-tecnico` — fonte: `src/app/app-domain/suporte-tecnico/page.tsx`.

</details>

### 5.32. Configurações e administração técnica

**Entrada:** `/configuracoes` · **Código de acesso:** `CONFIGURACOES` · **Cadastro do código no banco:** ativo · **Páginas:** 11 · **Funções exportadas em arquivos de ações da área:** 32.

- **Subitens:** Instância; módulos/ativação; perfis e matriz de permissões; usuários e vínculo Firebase; processos/workflows; integrações; certificados A1; relatórios; mesclagem de pessoa física.
- **Funcionalidades internas implementadas:** Há ações de manutenção da instância, perfis/usuários, ativação, definição/publicação de workflow, certificado e integração. Administrador técnico usa código estável SYSTEM_ADMINISTRATOR; autenticação Firebase e autorização municipal são camadas diferentes.
- **Predisposição/canais externos:** Firebase Admin, Client SDK, Blob e catálogo de conectores. Referência de credencial não é a credencial em si; configurar conexão não conclui transporte/homologação.
- **Regras internas:** Gestão de usuário/perfil/módulo restrita ao administrador; proteção do ciclo de vida do administrador; matriz por create/update/delete/issueReports; unidades gestoras e escopos de saúde; configuração e credenciais fora do código versionado.
- **Conexões e cadastros:** ConfiguracaoInstancia/ParametroInstancia/Modulo/Perfil, Usuario/UsuarioModulo/UsuarioUnidadeGestora, Employee, IntegrationConnection/Run, DigitalCertificate, ReportTemplate e Firebase.
- **Estado dos dados:** Entre as tabelas referenciadas, têm dados: ConfiguracaoModulo: 29; ConfiguracaoPerfil: 4; DocumentClass: 7; Usuario: 1. Isso inclui referências compartilhadas, não prova execução de negócio do módulo.
- **Pendências e desenvolvimento:** Existem quatro perfis e um administrador, mas sem instância institucional, usuários funcionais, conexões ou certificados. Reconciliar catálogo: ILUMINACAO_PUBLICA está no painel e ausente no banco; PORTAL_CIDADAO usa ATENDIMENTO; alguns módulos são acessíveis por caminhos secundários.
- **Fontes principais:** `src/app/app-domain/configuracoes`, `src/lib/platform/tenant-context.ts`, `src/lib/administration/c3-policy.ts`, `src/lib/firebase`.

<details>
<summary>Rotas de páginas da área (11) e ações identificadas</summary>

- `/configuracoes/auditoria` — fonte: `src/app/app-domain/configuracoes/auditoria/page.tsx`.
- `/configuracoes/certificados` — fonte: `src/app/app-domain/configuracoes/certificados/page.tsx`.
- `/configuracoes/instancia` — fonte: `src/app/app-domain/configuracoes/instancia/page.tsx`.
- `/configuracoes/integracoes` — fonte: `src/app/app-domain/configuracoes/integracoes/page.tsx`.
- `/configuracoes/mesclagem-pf` — fonte: `src/app/app-domain/configuracoes/mesclagem-pf/page.tsx`.
- `/configuracoes/modulos` — fonte: `src/app/app-domain/configuracoes/modulos/page.tsx`.
- `/configuracoes` — fonte: `src/app/app-domain/configuracoes/page.tsx`.
- `/configuracoes/perfis` — fonte: `src/app/app-domain/configuracoes/perfis/page.tsx`.
- `/configuracoes/processos` — fonte: `src/app/app-domain/configuracoes/processos/page.tsx`.
- `/configuracoes/relatorios` — fonte: `src/app/app-domain/configuracoes/relatorios/page.tsx`.
- `/configuracoes/usuarios` — fonte: `src/app/app-domain/configuracoes/usuarios/page.tsx`.

**Ações exportadas detectadas por arquivo** (existência não equivale a aceite de todos os fluxos):

- `src/app/app-domain/configuracoes/actions.ts`: `updateInstancia`, `createInstancia`, `toggleModulo`, `createModulo`, `ensureDefaultModulos`, `createPerfil`, `togglePerfil`.
- `src/app/app-domain/configuracoes/certificados/actions.ts`: `registerCertificateAction`, `setCertificateStatusAction`, `signVersionWithA1Action`.
- `src/app/app-domain/configuracoes/instancia/actions.ts`: `saveInstanceConfiguration`.
- `src/app/app-domain/configuracoes/integracoes/actions.ts`: `saveIntegrationConnection`, `testIntegrationConnection`.
- `src/app/app-domain/configuracoes/mesclagem-pf/actions.ts`: `reviewPersonMergeCandidates`, `proposePfDuplicateMerge`, `approveAndExecutePfDuplicateMerge`, `reversePfDuplicateMerge`.
- `src/app/app-domain/configuracoes/perfis/actions.ts`: `upsertPerfil`, `togglePerfilStatus`, `deletePerfil`.
- `src/app/app-domain/configuracoes/processos/actions.ts`: `saveProcessType`, `saveSubject`, `saveProcessWorkflowStage`, `deleteProcessWorkflowStage`, `createGenericWorkflowDefinitionAction`, `addGenericWorkflowStageAction`, `deleteGenericWorkflowStageAction`, `publishGenericWorkflowDefinitionAction`.
- `src/app/app-domain/configuracoes/relatorios/actions.ts`: `saveReportTemplate`.
- `src/app/app-domain/configuracoes/usuarios/actions.ts`: `upsertUsuario`, `toggleUsuarioStatus`, `deleteUsuario`.

</details>

## 6. Integrações externas — prontidão real

| Canal/integração | O que existe | Estado demonstrado e pendência |
| --- | --- | --- |
| Firebase Auth | Client SDK, Admin SDK, sessão e provisionamento | Conta administrativa havia sido validada na configuração anterior; nesta análise o bundle publicado contém a chave pública esperada. Não foram exercitados todos os perfis. |
| Neon | Prisma e migrations, consultas SQL e transações | Estrutura e população conferidas; health check publicado passou. |
| Vercel Blob | Upload privado, leitura, exclusão e listagem | Token local permite listar; zero objetos. Upload/download real de evidência municipal não exercitado. |
| ViaCEP | Consulta nos formulários institucional/almoxarifado | Chamada HTTP implementada; não é integração cadastral fiscal nacional. |
| OpenStreetMap/Nominatim | Mapa, seleção e geocodificação reversa | Chamada/tile implementados; disponibilidade e uso operacional não ensaiados. |
| Transparência Ibema | Cliente de API pública paginada e fonte explícita | Consulta externa implementada com endpoint fixo; não é carga nativa de Guarama nem prova de dados municipais próprios. |
| Banco Virtual Robonuvem | Autenticação, extrato, ordens, retorno/webhook e evidências | Cliente aceita somente banco virtual e SANDBOX; bancos reais exigem adaptador/homologação. |
| PNCP e TCE-PB/SAGRES | Pacotes, operações, validação e histórico | Catálogo geral restringe a MOCK; testar pacote não prova recepção oficial. TCE-PB também não cobre automaticamente tribunal de outra UF. |
| SICONFI/MSC | Exportador MSC e composição contábil; catálogo SICONFI | Arquivo preparado não equivale a envio aceito; catálogo geral é MOCK. Exportador examinado referencia 2026. |
| eSocial RH | Configuração de empregador, ambiente, endpoint, layout e referência de XSD | `transmissionAvailable:false`; cliente XML/XSD/XMLDSig/mTLS/worker pendente. |
| eSocial SST | Eventos S-2210/S-2220/S-2240, origem e protocolo/recibo validados por contrato | Sem provedor REAL instalado; emissão/transmissão bloqueadas sem adaptador. |
| DIRF/SEFIP/MANAD/SIOPE/TCE/CADPREV | Gerador parametrizado CSV/largura fixa no RH | Retorna `officialLayout:false`; validar versões efetivamente exigidas e implementar layouts oficiais específicos. |
| SISAB/e-SUS | Fichas, lotes e crítica/aceite local | Sem protocolo oficial do Ministério; o aceite observado em código é do validador interno. |
| BPA/FPO/RAAS/AIH | Captura de fatos, competência e arquivos delimitados por `|` | Formato local de conferência; não comprova layout de transmissão oficial SIA/SIH/DATASUS. |
| Hórus/SIGAF/RENAME/vacinação/dispositivos | HTTP configurável e contrato de operação | Runtime restringe a SANDBOX/HOMOLOGACAO; sem conexões ou execuções populadas. |
| Educacenso | Leitor simplificado e exportador textual de matrículas | Não comprova leiaute oficial completo nem recepção INEP; PROFESSIONAL/TURMA aceitos pelo leitor não recebem a mesma atualização de ESCOLA/ESTUDANTE. |
| CadÚnico/MDS | Busca por NIS/CPF em `CadUnicoRecord` | Consulta local, sem chamada MDS. Base está vazia. |
| NFS-e/REDESIM/DES-IF/Simples/VAF/protesto/MNI | Modelos, rotas, cálculos/importação/eventos internos | Cobertura varia por fluxo; exigir adaptador, layout e evidência de retorno específico antes de declarar interoperabilidade oficial. |
| E-mail SST/Resend | Cliente HTTP e outbox com idempotência | Implementação real disponível; depende de chave, domínio verificado, remetente e cron; sem envio comprovado nesta captura. Aceitação do provedor não é entrega na caixa postal. |
| SMTP/WhatsApp/Diário Oficial/NF-e/CT-e do catálogo geral | Cadastro de conectores e execução simulada | Restritos a MOCK pelo registry; sem rede real por esse caminho. |
| A1 GED | Assinatura/verificação de hash e cadeia configurada | Há serviço criptográfico; zero certificados/evidências no banco. Homologar formato e finalidade. |

**Política central identificada:** `src/lib/integrations/registry.ts` lista **22 conectores**. `assertIntegrationEnvironmentPolicy` bloqueia `PRODUCAO`; `BANCO_API` só aceita `SANDBOX`; seis conectores de saúde aceitam `SANDBOX/HOMOLOGACAO`; os demais ficam em `MOCK`. Isso descreve esse runtime geral, não cancela os clientes HTTP próprios de ViaCEP, transparência, Firebase, Blob ou Resend, que seguem caminhos específicos.

## 7. Conexões entre módulos, dependências e cadastros

### 7.1 Cadeias principais

```text
Configurações/Firebase → Usuario + Perfil + módulos + UGs → autorização de todo o ERP
Cadastros (Person/Company/Family/Address) → cidadão, contribuinte, servidor, paciente, aluno, fornecedor
Administração → secretaria/departamento/unidade/cargo → RH, processo, compras, frota e estoque
Entidade jurídica → escopo de planejamento → UG → exercício → orçamento → execução contábil
Planejamento PPA → LDO → LOA/dotação → reserva → empenho → liquidação → pagamento/retorno
Compras solicitação → processo → licitação/contrato → autorização → recebimento
Recebimento → estoque/patrimônio + solicitação de despesa/liquidação → financeiro
Tributo/ITBI/taxa → lançamento → guia → retorno/pagamento → receita → contabilidade
Dívida ativa → CDA/carteira → guia/suspensão/baixa → eventos e reflexo financeiro
RH contrato + regras → folha → demonstrativo → publicação no portal → financeiro/custos
SST atestado + período funcional → licença/ocorrência → folha; EPI → material/estoque
SST programas/risco + histórico + responsabilidade técnica → PPP e origem eSocial
Saúde agenda → acolhimento/prontuário → prescrição/exame/procedimento → produção/faturamento
Saúde prescrição → farmácia/dispensação → movimento de estoque; TFD → frota/reserva/servidor
Educação matrícula/turma → diário/nota/frequência → documento/portal; transporte → frota
Assistência pessoa/família → prontuário/atendimento → benefício/cota/estoque/entrega
Obras/Iluminação serviço → equipe + equipamento + material + compra + empenho + GED
Construção civil portal → processo → análise/viabilidade → taxa → documento/assinatura
Processos/atendimento → documentos/assinaturas/notificações → consulta do cidadão
Financeiro/RH/compras/planejamento/GED → publicação nativa → transparência
Módulos produtores → AuditEvent/eventos de domínio → auditoria/controle interno
```

As setas representam ligações e serviços encontrados, não a afirmação de que todas essas cadeias já foram executadas nesta instância. Os 2.032 vínculos por FK são detalhados por destinos no dicionário de tabelas ao final.

### 7.2 Ordem de implantação recomendada a partir das dependências

1. Identidade municipal, poderes/entidades, instituição e endereço; reconciliar referências de Guarama/Ibema/Aurora.
2. Secretaria/departamento/unidade/UG, usuários, perfis e vínculos.
3. Cadastros compartilhados canônicos: pessoas, empresas, fornecedores, famílias, imóveis, materiais e bancos.
4. Exercícios, catálogos legais/versionados, plano de contas, dotações, fontes e matrizes de lançamento.
5. Regras municipais de tributação, folha, previdência, taxas, saneamento, construção e parâmetros clínicos/assistenciais.
6. Carga de saldos/histórico/documentos com conciliação e proveniência; não executar seed demonstrativo como se fosse importação municipal real.
7. Jornadas internas integradas e perfis de acesso; depois portais e documentos publicados.
8. Homologação de cada conector oficial com cenário de aceite/rejeição, retorno e reversão.

## 8. Dados populados e o significado de “reais”

| Tabela/modelo com dados | Registros | Classificação de origem/uso |
| --- | ---: | --- |
| `Bank` | 2 | Referência básica COMPE, não conta bancária ou convênio. |
| `City` | 1 | Referência Ibema/PR, IBGE 4109757. |
| `ConfiguracaoModulo` | 29 | Configuração técnica de ativação; cinco módulos inativos. |
| `ConfiguracaoPerfil` | 4 | Quatro perfis técnicos/operacionais; não quadro de usuários. |
| `ConstructionCatalogEntry` | 26 | Catálogo inicial de construção; não zoneamento/lei municipal implantados. |
| `Currency` | 1 | Referência de moeda BRL. |
| `DocumentClass` | 7 | Configuração de classes documentais; sem arquivos/documentos operacionais. |
| `GovernmentEntity` | 2 | Referência municipal inicial de Ibema; não pertence à identidade Guarama implantada. |
| `HealthCbo` | 2 | Amostra/referência mínima de CBO; não catálogo completo ou profissionais. |
| `State` | 1 | Referência territorial do Paraná. |
| `Tax` | 3 | Catálogo básico de tributos; sem parâmetros ou crédito lançado. |
| `Usuario` | 1 | Uma conta administrativa provisionada e ligada ao Firebase; único cadastro de acesso efetivo identificado. |

As outras **958 tabelas de modelos Prisma estão vazias**. Todas as 22 tabelas complementares SQL e a associativa `_SchoolToSchoolBus` têm zero registros. `_prisma_migrations` contém 151 linhas técnicas; não é carga de negócio.

**Blob:** listagem autenticada concluída; 0 arquivos, 0 bytes e 0 objetos no prefixo da instância. Foram localizadas 0 referências de URL Blob nos campos de URL/caminho inspecionados. Isso não é busca arbitrária em todo texto/JSON; o próprio armazenamento está vazio.


### 8.1 O que não pode ser tratado como dado operacional real

- Catálogo de tributos com três códigos não é tabela legal municipal de cálculo.
- Dois CBOs não são carga completa do CBO/SIGTAP/CNES nem equipe de saúde.
- Catálogo básico de construção não é legislação de zoneamento e código de obras implantados.
- Módulo/perfil habilitado não é usuário operacional nem jornada exercitada.
- Nome de cidade/órgão conhecido não prova que o dado pertence à nova instância: os registros de origem são de Ibema.
- Conteúdo ou números do site comercial e arquivos de seed/POC não são evidência de operação real no Neon.
- Uma consulta de API pública de outro município pode exibir dados autênticos da origem, mas não vira carga operacional própria nem comprovante de autenticidade de dados de Guarama.

### 8.2 Origem e configuração de identidade

`CELERIFLOW_INSTANCE_ID` local é `guarama`. No PostgreSQL, `GovernmentEntity` contém Prefeitura e Câmara de Ibema, e `City` contém Ibema/PR, IBGE `4109757`. Em `src/lib/municipality-identity.ts`, o nome padrão é **Aurora das Veredas/MG**. O `/portal` publicado retornou esse nome no título. A transparência tem fallback `API_IBEMA` e endpoint fixo de Ibema. Portanto, não há identidade municipal única e consistente implantada nesta captura.

Nenhum dado de pessoa sensível, CPF, prontuário, senha, token ou chave privada foi incluído no relatório. O fato de o banco estar vazio impede certificar a procedência ou completude de uma migração operacional anterior.

## 9. Pendências mapeadas: desenvolvimento, configuração e homologação

| ID | Prioridade | Natureza | Pendência e evidência | Critério objetivo de conclusão |
| --- | --- | --- | --- | --- |
| CF-001 | Alta | Implantação | Identidade Guarama/Ibema/Aurora inconsistente | Instituição, entidades, cidade, portal, documentos e fontes com identidade municipal aprovada e única. |
| CF-002 | Alta | Implantação/carga | 958 modelos vazios e ausência dos cadastros estruturantes | Carga autorizada com origem, totalizadores e conciliação; jornadas essenciais executadas. |
| CF-003 | Alta | Implantação/catálogo | Divergência painel↔ConfiguracaoModulo, Iluminação ausente, áreas secundárias sem cartão | Catálogo de módulos/perfis/navegação reconciliado e testes de perfil/ativação por área. |
| CF-004 | Alta | Desenvolvimento/homologação | Catálogo geral impede conectores de produção | Adaptadores específicos e política de ambiente revisada com evidência de rede, aceite e rejeição no destino. |
| CF-005 | Alta | Desenvolvimento | eSocial RH sem cliente/worker e SST sem provider REAL | XML oficial validado, XMLDSig/mTLS, envio, consulta e recibo de evento comprovados no ambiente exigido. |
| CF-006 | Alta | Desenvolvimento/homologação | Arquivos de obrigações RH não oficiais; SUS/SISAB e Educacenso simplificados/locais | Layout vigente validado por órgão/sistema de destino e retorno rastreável. |
| CF-007 | Alta | Desenvolvimento | Saneamento com faixas fixas e PIX/linha sintéticos | Tabela legal versionada, medição tratada, cobrança emitida pelo PSP e baixa/estorno conciliados. |
| CF-008 | Alta | Desenvolvimento | Fomento cultural aprova projeto e homologa prestação automaticamente | Inscrição, critérios, avaliação, decisão/recursos, evidências e prestação financeira/documental implementadas. |
| CF-009 | Média/alta | Desenvolvimento | Suporte técnico só exibe roadmap, sem persistência | Chamado/incidente/SLA/base/anexos/relatórios com histórico e responsáveis. |
| CF-010 | Média/alta | Desenvolvimento/ligação de UI | Exemplo legislativo Nova Sessão sem handler/ação ligada na tela | Formulários legislativos conectados a ações e jornadas sessão/ata/votação demonstradas. |
| CF-011 | Média/alta | Desenvolvimento | Licença ambiental aponta a host fixo e validador não encontrado | Validação pública implementada no domínio correto e numeração/validade/assinatura verificadas. |
| CF-012 | Média | Implantação/valid. técnica | Zero documentos/certificados/Blob | Documento real autorizado, versão, assinatura esperada, download controlado e validação pública exercitados. |
| CF-013 | Média | Desenvolvimento anual | Exportador MSC examinado fixa 2026 | Suporte a exercícios e versões futuras com referências e regressões por ano. |
| CF-014 | Média | Implantação/legal | Critérios CadÚnico fixos e ausência de base oficial | Critérios versionados e validados pelo gestor; importação autorizada e eventual API oficial. |
| CF-015 | Média | Desenvolvimento técnico | Rate limit em memória local | Limite distribuído com política e prova de comportamento em múltiplas instâncias. |
| CF-016 | Média | Revisão de integridade | Seis CHECKs NOT VALID conforme migrations | Definir necessidade de validação histórica e executar apenas após reconciliação de eventual legado. |
| CF-017 | Alta para proposta | Aceite/evidência | “Homologado”, “100%”, “PNCP/Pix nativos” e rótulos de interface não têm prova suficiente | Dossiê por requisito com código, cenário, captura, arquivo e protocolo de destino quando aplicável. |

As prioridades servem à prontidão técnica desta instância. Não representam obrigação contratual de um edital ainda não analisado.

## 10. Como usar o relatório para comparar editais

Para cada exigência, preencher uma linha independente; quando o requisito combinar várias capacidades, desmembrá-lo. Não marcar “atende” apenas por haver módulo ou tabela com nome semelhante.

| Item do edital | Capacidade exigida | Área/rota | Evidência interna | Evidência externa | Estado | Falta configuração/dados? | Falta desenvolvimento? | Cenário de aceite |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A preencher | Ex.: publicar contrato no PNCP | Compras/exportações | Pacote e validação existem | Recepção oficial não comprovada; runtime MOCK | Parcial/preparado | Sim | Sim/homologar adaptador | Publicar, receber protocolo e consultar o contrato no destino. |
| A preencher | Ex.: portal de contracheque | Portal do Servidor | Serviços de publicação e titularidade existem | Canal web existe | Implementado, não aceito operacionalmente nesta instância | Sim: servidor/folha/publicação | Avaliar requisito específico | Dois servidores não acessam documentos um do outro; publicação e revogação funcionam. |
| A preencher | Ex.: gerenciar SLA de suporte | Suporte Técnico | Página de referência | Nenhum canal operacional | Não implementado operacionalmente | Sim | Sim | Abrir chamado, atribuir, medir prazo, anexar, resolver e emitir relatório. |

Estados sugeridos na matriz: **atende demonstrado**, **implementado a validar**, **parcial**, **depende de configuração**, **depende de integração/homologação**, **não implementado** e **fora do escopo**. A decisão final exige texto do edital e cenário de demonstração correspondente.

## 11. Verificações executadas e rastreabilidade

### 11.1 Testes desta análise

```powershell
node --conditions=react-server --import tsx --test tests/portal-proxy.test.ts tests/education-s1.test.ts tests/integration-contract.test.ts tests/blob-namespace.test.ts tests/social-access-policy.test.ts tests/health-registration-policy.test.ts tests/health-care-lines-policy.test.ts tests/health-vaccination-calendar.test.ts tests/c3-administration.test.ts tests/sst-integrations.test.ts tests/procurement-export-contract.test.ts src/lib/tributacao/__tests__/fiscal-engine-s2.test.ts
```

Resultado: **53 aprovados / 0 falhas / 0 ignorados**. Abrange namespaces, política de integrações, bloqueio eSocial, escopos, políticas administrativas, cadastro/vacinação/linhas de cuidado, leitor educacional e cálculo fiscal; não abrange todas as 694 páginas com interação de usuário.

O build de produção e dez testes do proxy haviam passado durante a correção de domínio nesta mesma sessão de trabalho, antes da captura-base do relatório. Não foi executado novo build para gerar este documento. A existência de outros arquivos de teste no inventário não significa que todos foram executados nesta análise.

### 11.2 Evidências técnicas estruturantes

- `prisma/schema.prisma` e `prisma/migrations-ibema/`: modelos e SQL implantado; o outro diretório `prisma/migrations/` não foi assumido como histórico ativo. O caminho efetivo é o de `prisma.config.ts`.
- `src/app/app-domain/dashboard/page.tsx`: 28 cartões e códigos de acesso.
- `src/lib/platform/tenant-context.ts`: perfil, módulo, operação, UG e resolução do usuário.
- `src/lib/integrations/registry.ts` e `runtime.ts`: conectores e limites de ambiente.
- `src/lib/rh/external-configuration.ts` e `obligation-export.ts`: prontidão RH e status não oficial do layout.
- `src/lib/sst/esocial-service.ts` e `esocial-contract.ts`: bloqueio de transmissão sem provedor real.
- `src/lib/saude/sisab-service.ts` e `production-service.ts`: processamento e layout local.
- `src/lib/transparencia/presentation-settings.ts`, `ibema-provider.ts` e `src/lib/municipality-identity.ts`: fonte e identidade padrão.
- `src/lib/saneamento/saneamento-engine.ts`, `src/app/app-domain/cultura/fomento-projetos/fomento-actions.ts`, `src/app/app-domain/suporte-tecnico/page.tsx` e `src/app/app-domain/camara/sessoes/SessoesClient.tsx`: exemplos concretos de fluxo simplificado/pendente.

Os anexos seguintes foram montados a partir do inventário real do repositório e do catálogo PostgreSQL, com caminhos e contagens para permitir conferência. Vínculos de tabela por consumidor são referências estáticas diretas, não análise formal de todo o fluxo de dados; relações de banco foram lidas do PostgreSQL.


## Anexo A — Páginas transversais e públicas

Estas páginas completam as listas por módulo até os 694 arquivos de página inventariados. `(grupo)` não integra a URL; `[id]`/`[...segmentos]` são padrões dinâmicos.

| Rota lógica | Arquivo |
| --- | --- |
| `/` | `src/app/(marketing)/page.tsx` |
| `/login` | `src/app/app-domain/(auth)/login/page.tsx` |
| `/dashboard` | `src/app/app-domain/dashboard/page.tsx` |
| `/indicadores` | `src/app/app-domain/indicadores/page.tsx` |
| `/notificacoes` | `src/app/app-domain/notificacoes/page.tsx` |
| `/processos` | `src/app/app-domain/processos/page.tsx` |
| `/portal-paciente` | `src/app/portal-paciente/page.tsx` |
| `/portal-protocolos` | `src/app/portal-protocolos/page.tsx` |
| `/portal-servidor` | `src/app/portal-servidor/page.tsx` |
| `/portal-transparencia` | `src/app/portal-transparencia/page.tsx` |
| `/portal/[slug]` | `src/app/portal/[slug]/page.tsx` |
| `/portal/acessibilidade` | `src/app/portal/acessibilidade/page.tsx` |
| `/portal/acesso-informacao` | `src/app/portal/acesso-informacao/page.tsx` |
| `/portal/busca` | `src/app/portal/busca/page.tsx` |
| `/portal/cadastrar` | `src/app/portal/cadastrar/page.tsx` |
| `/portal/concursos` | `src/app/portal/concursos/page.tsx` |
| `/portal/construcao-civil/[id]/documentos` | `src/app/portal/construcao-civil/[id]/documentos/page.tsx` |
| `/portal/construcao-civil/[id]` | `src/app/portal/construcao-civil/[id]/page.tsx` |
| `/portal/construcao-civil/[id]/viabilidade-automatica` | `src/app/portal/construcao-civil/[id]/viabilidade-automatica/page.tsx` |
| `/portal/construcao-civil/autorizacoes` | `src/app/portal/construcao-civil/autorizacoes/page.tsx` |
| `/portal/construcao-civil/entrar` | `src/app/portal/construcao-civil/entrar/page.tsx` |
| `/portal/construcao-civil/nova` | `src/app/portal/construcao-civil/nova/page.tsx` |
| `/portal/construcao-civil` | `src/app/portal/construcao-civil/page.tsx` |
| `/portal/construcao-civil/pedidos-administrativos` | `src/app/portal/construcao-civil/pedidos-administrativos/page.tsx` |
| `/portal/contato` | `src/app/portal/contato/page.tsx` |
| `/portal/convenentes` | `src/app/portal/convenentes/page.tsx` |
| `/portal/dados-abertos` | `src/app/portal/dados-abertos/page.tsx` |
| `/portal/departamentos/atestados` | `src/app/portal/departamentos/atestados/page.tsx` |
| `/portal/entrar` | `src/app/portal/entrar/page.tsx` |
| `/portal/frota/atendimento` | `src/app/portal/frota/atendimento/page.tsx` |
| `/portal/frota/motorista` | `src/app/portal/frota/motorista/page.tsx` |
| `/portal/historia` | `src/app/portal/historia/page.tsx` |
| `/portal/leis-municipais` | `src/app/portal/leis-municipais/page.tsx` |
| `/portal/licitacoes-e-contratos` | `src/app/portal/licitacoes-e-contratos/page.tsx` |
| `/portal/mapa-do-site` | `src/app/portal/mapa-do-site/page.tsx` |
| `/portal/minha-area` | `src/app/portal/minha-area/page.tsx` |
| `/portal/minha-area/processos/[id]` | `src/app/portal/minha-area/processos/[id]/page.tsx` |
| `/portal/minha-area/processos` | `src/app/portal/minha-area/processos/page.tsx` |
| `/portal/minha-area/servicos/[slug]` | `src/app/portal/minha-area/servicos/[slug]/page.tsx` |
| `/portal/minha-area/servicos` | `src/app/portal/minha-area/servicos/page.tsx` |
| `/portal/minha-area/solicitacoes/[id]` | `src/app/portal/minha-area/solicitacoes/[id]/page.tsx` |
| `/portal/minha-area/solicitacoes` | `src/app/portal/minha-area/solicitacoes/page.tsx` |
| `/portal/nfse/[code]` | `src/app/portal/nfse/[code]/page.tsx` |
| `/portal/nfse` | `src/app/portal/nfse/page.tsx` |
| `/portal/noticias/[slug]` | `src/app/portal/noticias/[slug]/page.tsx` |
| `/portal/noticias` | `src/app/portal/noticias/page.tsx` |
| `/portal/ouvidoria` | `src/app/portal/ouvidoria/page.tsx` |
| `/portal` | `src/app/portal/page.tsx` |
| `/portal/perguntas-frequentes` | `src/app/portal/perguntas-frequentes/page.tsx` |
| `/portal/planejamento` | `src/app/portal/planejamento/page.tsx` |
| `/portal/portaldatransparencia/estatisticas` | `src/app/portal/portaldatransparencia/estatisticas/page.tsx` |
| `/portal/portaldatransparencia/mapa` | `src/app/portal/portaldatransparencia/mapa/page.tsx` |
| `/portal/portaldatransparencia` | `src/app/portal/portaldatransparencia/page.tsx` |
| `/portal/portaldatransparencia/painel` | `src/app/portal/portaldatransparencia/painel/page.tsx` |
| `/portal/portaldatransparencia/pntp` | `src/app/portal/portaldatransparencia/pntp/page.tsx` |
| `/portal/privacidade` | `src/app/portal/privacidade/page.tsx` |
| `/portal/recuperar-senha` | `src/app/portal/recuperar-senha/page.tsx` |
| `/portal/secretarias` | `src/app/portal/secretarias/page.tsx` |
| `/portal/servicos/[slug]` | `src/app/portal/servicos/[slug]/page.tsx` |
| `/portal/servicos` | `src/app/portal/servicos/page.tsx` |
| `/portal/tributario/alvaras` | `src/app/portal/tributario/alvaras/page.tsx` |
| `/portal/tributario/empresas` | `src/app/portal/tributario/empresas/page.tsx` |
| `/portal/tributario/itbi/novo` | `src/app/portal/tributario/itbi/novo/page.tsx` |
| `/portal/tributario/itbi` | `src/app/portal/tributario/itbi/page.tsx` |
| `/portal/tributario` | `src/app/portal/tributario/page.tsx` |
| `/portal/tributario/premios/[slug]` | `src/app/portal/tributario/premios/[slug]/page.tsx` |
| `/validar-alvara/[code]` | `src/app/validar-alvara/[code]/page.tsx` |
| `/validar-aviso/[code]` | `src/app/validar-aviso/[code]/page.tsx` |
| `/validar-documento/[code]` | `src/app/validar-documento/[code]/page.tsx` |
| `/validar-emissao/[code]` | `src/app/validar-emissao/[code]/page.tsx` |
| `/validar-recibo/[code]` | `src/app/validar-recibo/[code]/page.tsx` |

## Anexo B — Endpoints e métodos HTTP

Total: **198 route handlers**, dos quais **162** em `src/app/api`. A existência de endpoint não certifica acesso externo de produção; conferir política/autenticação no arquivo.

| Caminho lógico | Métodos exportados detectados | Arquivo |
| --- | --- | --- |
| `/api/atendimento/upload` | `POST` | `src/app/api/atendimento/upload/route.ts` |
| `/api/audit/interaction` | `POST` | `src/app/api/audit/interaction/route.ts` |
| `/api/auth/construcao-civil/session` | `POST` | `src/app/api/auth/construcao-civil/session/route.ts` |
| `/api/auth/portal-servidor/session` | `POST` | `src/app/api/auth/portal-servidor/session/route.ts` |
| `/api/auth/session/logout` | `POST` | `src/app/api/auth/session/logout/route.ts` |
| `/api/auth/session` | `POST` | `src/app/api/auth/session/route.ts` |
| `/api/cemiterios/anexos/[id]` | `GET` | `src/app/api/cemiterios/anexos/[id]/route.ts` |
| `/api/cemiterios/anexos` | `GET`, `POST` | `src/app/api/cemiterios/anexos/route.ts` |
| `/api/cemiterios/referencias` | `GET` | `src/app/api/cemiterios/referencias/route.ts` |
| `/api/cemiterios/relatorios` | `GET` | `src/app/api/cemiterios/relatorios/route.ts` |
| `/api/construcao-civil/abertura-interna/anexos` | `POST` | `src/app/api/construcao-civil/abertura-interna/anexos/route.ts` |
| `/api/construcao-civil/abertura/anexos` | `POST`, `GET` | `src/app/api/construcao-civil/abertura/anexos/route.ts` |
| `/api/construcao-civil/anexos` | `POST`, `GET` | `src/app/api/construcao-civil/anexos/route.ts` |
| `/api/construcao-civil/documentos/projeto-aprovado` | `GET` | `src/app/api/construcao-civil/documentos/projeto-aprovado/route.ts` |
| `/api/construcao-civil/documentos/projeto` | `GET` | `src/app/api/construcao-civil/documentos/projeto/route.ts` |
| `/api/construcao-civil/documentos` | `GET` | `src/app/api/construcao-civil/documentos/route.ts` |
| `/api/construcao-civil/documentos/validar` | `GET` | `src/app/api/construcao-civil/documentos/validar/route.ts` |
| `/api/construcao-civil/exportacoes/[id]/recibo` | `POST`, `GET` | `src/app/api/construcao-civil/exportacoes/[id]/recibo/route.ts` |
| `/api/construcao-civil/exportacoes/[id]` | `GET` | `src/app/api/construcao-civil/exportacoes/[id]/route.ts` |
| `/api/construcao-civil/exportacoes` | `POST` | `src/app/api/construcao-civil/exportacoes/route.ts` |
| `/api/construcao-civil/pranchas/[id]` | `GET` | `src/app/api/construcao-civil/pranchas/[id]/route.ts` |
| `/api/construcao-civil/pranchas` | `POST` | `src/app/api/construcao-civil/pranchas/route.ts` |
| `/api/controle-interno/agenda/alertas-periodicos` | `GET` | `src/app/api/controle-interno/agenda/alertas-periodicos/route.ts` |
| `/api/controle-interno/agenda` | `GET` | `src/app/api/controle-interno/agenda/route.ts` |
| `/api/controle-interno/estatisticas-rh` | `GET` | `src/app/api/controle-interno/estatisticas-rh/route.ts` |
| `/api/controle-interno/planos/[id]` | `GET` | `src/app/api/controle-interno/planos/[id]/route.ts` |
| `/api/controle-interno/relatorios-finais/[id]` | `GET` | `src/app/api/controle-interno/relatorios-finais/[id]/route.ts` |
| `/api/download` | `GET` | `src/app/api/download/route.ts` |
| `/api/financeiro/banco/interacoes` | `POST` | `src/app/api/financeiro/banco/interacoes/route.ts` |
| `/api/financeiro/conferencia-anual` | `GET` | `src/app/api/financeiro/conferencia-anual/route.ts` |
| `/api/financeiro/custos` | `GET` | `src/app/api/financeiro/custos/route.ts` |
| `/api/financeiro/disponibilidade` | `GET` | `src/app/api/financeiro/disponibilidade/route.ts` |
| `/api/financeiro/extratos-importados/[id]` | `GET` | `src/app/api/financeiro/extratos-importados/[id]/route.ts` |
| `/api/financeiro/extratos/[id]` | `GET` | `src/app/api/financeiro/extratos/[id]/route.ts` |
| `/api/financeiro/msc` | `GET` | `src/app/api/financeiro/msc/route.ts` |
| `/api/financeiro/relatorios/print` | `GET` | `src/app/api/financeiro/relatorios/print/route.ts` |
| `/api/financeiro/relatorios` | `GET` | `src/app/api/financeiro/relatorios/route.ts` |
| `/api/financeiro/webhooks/banco` | `POST` | `src/app/api/financeiro/webhooks/banco/route.ts` |
| `/api/frotas/controle/anexos/[id]` | `GET`, `DELETE` | `src/app/api/frotas/controle/anexos/[id]/route.ts` |
| `/api/frotas/controle/anexos` | `GET`, `POST` | `src/app/api/frotas/controle/anexos/route.ts` |
| `/api/frotas/controle/maquinas/[id]` | `GET` | `src/app/api/frotas/controle/maquinas/[id]/route.ts` |
| `/api/frotas/controle/referencias` | `GET` | `src/app/api/frotas/controle/referencias/route.ts` |
| `/api/frotas/controle/relatorios` | `GET` | `src/app/api/frotas/controle/relatorios/route.ts` |
| `/api/frotas/externo` | `POST` | `src/app/api/frotas/externo/route.ts` |
| `/api/frotas/patrimonio` | `GET` | `src/app/api/frotas/patrimonio/route.ts` |
| `/api/frotas/referencias` | `GET` | `src/app/api/frotas/referencias/route.ts` |
| `/api/frotas/relatorios` | `GET` | `src/app/api/frotas/relatorios/route.ts` |
| `/api/health` | `GET` | `src/app/api/health/route.ts` |
| `/api/leads` | `POST` | `src/app/api/leads/route.ts` |
| `/api/patrimonio/recebimentos` | `GET` | `src/app/api/patrimonio/recebimentos/route.ts` |
| `/api/patrimonio/referencias` | `GET` | `src/app/api/patrimonio/referencias/route.ts` |
| `/api/patrimonio/requisicoes/referencias` | `GET` | `src/app/api/patrimonio/requisicoes/referencias/route.ts` |
| `/api/portal-paciente/vacinacao/documento` | `GET` | `src/app/api/portal-paciente/vacinacao/documento/route.ts` |
| `/api/portal-servidor/anexos` | `POST` | `src/app/api/portal-servidor/anexos/route.ts` |
| `/api/portal-servidor/aniversariantes` | `GET` | `src/app/api/portal-servidor/aniversariantes/route.ts` |
| `/api/portal-servidor/atos/[id]` | `GET` | `src/app/api/portal-servidor/atos/[id]/route.ts` |
| `/api/portal-servidor/avaliacoes/[id]` | `GET` | `src/app/api/portal-servidor/avaliacoes/[id]/route.ts` |
| `/api/portal-servidor/capacitacao/[id]/certificado` | `GET` | `src/app/api/portal-servidor/capacitacao/[id]/certificado/route.ts` |
| `/api/portal-servidor/capacitacao/[id]/comprovante` | `GET` | `src/app/api/portal-servidor/capacitacao/[id]/comprovante/route.ts` |
| `/api/portal-servidor/demonstrativos/[id]` | `GET` | `src/app/api/portal-servidor/demonstrativos/[id]/route.ts` |
| `/api/portal-servidor/documentos-funcionais/[id]` | `GET` | `src/app/api/portal-servidor/documentos-funcionais/[id]/route.ts` |
| `/api/portal-servidor/emissoes/[id]` | `GET` | `src/app/api/portal-servidor/emissoes/[id]/route.ts` |
| `/api/portal-servidor/manutencao/anexos` | `GET` | `src/app/api/portal-servidor/manutencao/anexos/route.ts` |
| `/api/portal-servidor/protocolos/[id]/comprovante` | `GET` | `src/app/api/portal-servidor/protocolos/[id]/comprovante/route.ts` |
| `/api/portal-servidor/protocolos/[id]/documentos/[documentId]` | `GET` | `src/app/api/portal-servidor/protocolos/[id]/documentos/[documentId]/route.ts` |
| `/api/portal-servidor/recadastramento/anexos` | `POST` | `src/app/api/portal-servidor/recadastramento/anexos/route.ts` |
| `/api/portal-servidor/relatorios` | `GET` | `src/app/api/portal-servidor/relatorios/route.ts` |
| `/api/portal-servidor/sst/agenda/[id]` | `GET` | `src/app/api/portal-servidor/sst/agenda/[id]/route.ts` |
| `/api/portal-servidor/sst/cat/[id]` | `GET` | `src/app/api/portal-servidor/sst/cat/[id]/route.ts` |
| `/api/portal/acesso` | `POST` | `src/app/api/portal/acesso/route.ts` |
| `/api/portal/concursos/[id]/edital` | `GET` | `src/app/api/portal/concursos/[id]/edital/route.ts` |
| `/api/portal/concursos/inscricoes/[id]` | `GET` | `src/app/api/portal/concursos/inscricoes/[id]/route.ts` |
| `/api/portal/departamentos/atestados/[id]` | `GET` | `src/app/api/portal/departamentos/atestados/[id]/route.ts` |
| `/api/portal/localizacao` | `GET` | `src/app/api/portal/localizacao/route.ts` |
| `/api/portal/programacoes/[id]/relatorio` | `GET` | `src/app/api/portal/programacoes/[id]/relatorio/route.ts` |
| `/api/portal/servicos/anexos` | `GET`, `POST` | `src/app/api/portal/servicos/anexos/route.ts` |
| `/api/portal/servicos/favoritos` | `POST` | `src/app/api/portal/servicos/favoritos/route.ts` |
| `/api/portal/servicos/relatorio` | `GET` | `src/app/api/portal/servicos/relatorio/route.ts` |
| `/api/portal/solicitacoes/[id]/comprovante` | `GET` | `src/app/api/portal/solicitacoes/[id]/comprovante/route.ts` |
| `/api/portal/solicitacoes/[id]/documentos/[versionId]` | `GET` | `src/app/api/portal/solicitacoes/[id]/documentos/[versionId]/route.ts` |
| `/api/portal/solicitacoes` | `POST` | `src/app/api/portal/solicitacoes/route.ts` |
| `/api/portal/tributario/empresas/documentos/[id]` | `GET` | `src/app/api/portal/tributario/empresas/documentos/[id]/route.ts` |
| `/api/portal/tributario/itbi/[id]/dam` | `GET` | `src/app/api/portal/tributario/itbi/[id]/dam/route.ts` |
| `/api/portal/tributario/itbi/[id]/pdf` | `GET` | `src/app/api/portal/tributario/itbi/[id]/pdf/route.ts` |
| `/api/portal/tributario/itbi/anexos` | `GET`, `POST` | `src/app/api/portal/tributario/itbi/anexos/route.ts` |
| `/api/portal/tributario/itbi/declaracoes/[id]` | `GET` | `src/app/api/portal/tributario/itbi/declaracoes/[id]/route.ts` |
| `/api/portal/tributario/itbi/documentos/[id]` | `GET` | `src/app/api/portal/tributario/itbi/documentos/[id]/route.ts` |
| `/api/portal/tributario/itbi/solicitacao-anexos` | `GET`, `POST` | `src/app/api/portal/tributario/itbi/solicitacao-anexos/route.ts` |
| `/api/portal/tributos/documentos/[id]` | `GET` | `src/app/api/portal/tributos/documentos/[id]/route.ts` |
| `/api/portal/tributos/guias/[id]` | `GET` | `src/app/api/portal/tributos/guias/[id]/route.ts` |
| `/api/protocolos/deadline-notifications` | `GET` | `src/app/api/protocolos/deadline-notifications/route.ts` |
| `/api/protocolos/upload` | `POST` | `src/app/api/protocolos/upload/route.ts` |
| `/api/publico/alvaras/[code]/assinatura` | `GET` | `src/app/api/publico/alvaras/[code]/assinatura/route.ts` |
| `/api/publico/alvaras/[code]/pdf` | `GET` | `src/app/api/publico/alvaras/[code]/pdf/route.ts` |
| `/api/rh/adiantamentos/[id]` | `GET` | `src/app/api/rh/adiantamentos/[id]/route.ts` |
| `/api/rh/demonstrativos/[id]` | `GET` | `src/app/api/rh/demonstrativos/[id]/route.ts` |
| `/api/rh/diarias/[id]` | `GET` | `src/app/api/rh/diarias/[id]/route.ts` |
| `/api/rh/integracoes/[id]` | `GET` | `src/app/api/rh/integracoes/[id]/route.ts` |
| `/api/rh/obrigacoes/arquivos/[id]` | `GET` | `src/app/api/rh/obrigacoes/arquivos/[id]/route.ts` |
| `/api/rh/obrigacoes/exportar` | `POST` | `src/app/api/rh/obrigacoes/exportar/route.ts` |
| `/api/rh/obrigacoes/historico` | `GET` | `src/app/api/rh/obrigacoes/historico/route.ts` |
| `/api/rh/referencias` | `GET` | `src/app/api/rh/referencias/route.ts` |
| `/api/rh/relatorios` | `GET` | `src/app/api/rh/relatorios/route.ts` |
| `/api/saude/acompanhamento/esquemas/[contract]` | `GET` | `src/app/api/saude/acompanhamento/esquemas/[contract]/route.ts` |
| `/api/saude/acompanhamento/receptores/[contract]` | `POST` | `src/app/api/saude/acompanhamento/receptores/[contract]/route.ts` |
| `/api/saude/acompanhamento/remessas/[id]/retorno` | `GET` | `src/app/api/saude/acompanhamento/remessas/[id]/retorno/route.ts` |
| `/api/saude/acompanhamento/remessas/[id]` | `GET` | `src/app/api/saude/acompanhamento/remessas/[id]/route.ts` |
| `/api/saude/agendamentos/[id]/comprovante` | `GET` | `src/app/api/saude/agendamentos/[id]/comprovante/route.ts` |
| `/api/saude/agendas/disponibilidade` | `GET` | `src/app/api/saude/agendas/disponibilidade/route.ts` |
| `/api/saude/atendimentos/[id]/anexo/[documentId]` | `GET` | `src/app/api/saude/atendimentos/[id]/anexo/[documentId]/route.ts` |
| `/api/saude/catalogos` | `GET` | `src/app/api/saude/catalogos/route.ts` |
| `/api/saude/documentos/upload` | `POST` | `src/app/api/saude/documentos/upload/route.ts` |
| `/api/saude/familias/[id]/anexo/[documentId]` | `GET` | `src/app/api/saude/familias/[id]/anexo/[documentId]/route.ts` |
| `/api/saude/farmacia/judicial/[id]/anexo/[documentId]` | `GET` | `src/app/api/saude/farmacia/judicial/[id]/anexo/[documentId]/route.ts` |
| `/api/saude/farmacia/judicial/[id]/extrato` | `GET` | `src/app/api/saude/farmacia/judicial/[id]/extrato/route.ts` |
| `/api/saude/indicadores` | `GET` | `src/app/api/saude/indicadores/route.ts` |
| `/api/saude/pacientes/[id]/anexo/[documentId]` | `GET` | `src/app/api/saude/pacientes/[id]/anexo/[documentId]/route.ts` |
| `/api/saude/pacientes/[id]/documento` | `GET` | `src/app/api/saude/pacientes/[id]/documento/route.ts` |
| `/api/saude/producao/arquivos/[id]` | `GET` | `src/app/api/saude/producao/arquivos/[id]/route.ts` |
| `/api/saude/producao/laudos/[id]/documento` | `GET` | `src/app/api/saude/producao/laudos/[id]/documento/route.ts` |
| `/api/saude/producao/previa` | `GET` | `src/app/api/saude/producao/previa/route.ts` |
| `/api/saude/producao/raas-origens` | `GET` | `src/app/api/saude/producao/raas-origens/route.ts` |
| `/api/saude/relatorios` | `GET` | `src/app/api/saude/relatorios/route.ts` |
| `/api/saude/sisab/lotes/[id]` | `GET` | `src/app/api/saude/sisab/lotes/[id]/route.ts` |
| `/api/saude/tfd/[id]/documento` | `GET` | `src/app/api/saude/tfd/[id]/documento/route.ts` |
| `/api/saude/tfd/relatorio` | `GET` | `src/app/api/saude/tfd/relatorio/route.ts` |
| `/api/saude/tfd/viagens/[id]/documento` | `GET` | `src/app/api/saude/tfd/viagens/[id]/documento/route.ts` |
| `/api/saude/vacinacao/carteira/[id]/documento` | `GET` | `src/app/api/saude/vacinacao/carteira/[id]/documento/route.ts` |
| `/api/sst/integracoes/[id]` | `GET` | `src/app/api/sst/integracoes/[id]/route.ts` |
| `/api/sst/relatorios` | `GET` | `src/app/api/sst/relatorios/route.ts` |
| `/api/sst/restricoes/expiracao` | `GET`, `POST` | `src/app/api/sst/restricoes/expiracao/route.ts` |
| `/api/transparencia/acessos` | `POST` | `src/app/api/transparencia/acessos/route.ts` |
| `/api/transparencia/cidadao` | `POST` | `src/app/api/transparencia/cidadao/route.ts` |
| `/api/transparencia/consultas/[slug]` | `GET` | `src/app/api/transparencia/consultas/[slug]/route.ts` |
| `/api/transparencia/contratos` | `GET` | `src/app/api/transparencia/contratos/route.ts` |
| `/api/transparencia/despesas` | `GET` | `src/app/api/transparencia/despesas/route.ts` |
| `/api/transparencia/exemplos/[slug]/[key]` | `GET` | `src/app/api/transparencia/exemplos/[slug]/[key]/route.ts` |
| `/api/transparencia/fontes/[publicKey]/documento` | `GET` | `src/app/api/transparencia/fontes/[publicKey]/documento/route.ts` |
| `/api/transparencia/gestao/confirmar-upload` | `POST` | `src/app/api/transparencia/gestao/confirmar-upload/route.ts` |
| `/api/transparencia/gestao/publicacoes` | `POST` | `src/app/api/transparencia/gestao/publicacoes/route.ts` |
| `/api/transparencia/gestao/upload` | `POST` | `src/app/api/transparencia/gestao/upload/route.ts` |
| `/api/transparencia/licitacoes` | `GET` | `src/app/api/transparencia/licitacoes/route.ts` |
| `/api/transparencia/planejamento/[publicKey]` | `GET` | `src/app/api/transparencia/planejamento/[publicKey]/route.ts` |
| `/api/transparencia/planejamento` | `GET` | `src/app/api/transparencia/planejamento/route.ts` |
| `/api/transparencia/publicacoes/[publicKey]` | `GET` | `src/app/api/transparencia/publicacoes/[publicKey]/route.ts` |
| `/api/transparencia/receitas` | `GET` | `src/app/api/transparencia/receitas/route.ts` |
| `/api/transparencia/relatorios` | `GET` | `src/app/api/transparencia/relatorios/route.ts` |
| `/api/tributacao/desif/importacoes` | `POST` | `src/app/api/tributacao/desif/importacoes/route.ts` |
| `/api/tributacao/economico/expiracao` | `GET` | `src/app/api/tributacao/economico/expiracao/route.ts` |
| `/api/tributacao/itbi/[id]/dam` | `GET` | `src/app/api/tributacao/itbi/[id]/dam/route.ts` |
| `/api/tributacao/itbi/[id]/pdf` | `GET` | `src/app/api/tributacao/itbi/[id]/pdf/route.ts` |
| `/api/tributacao/itbi/anexos` | `POST` | `src/app/api/tributacao/itbi/anexos/route.ts` |
| `/api/tributacao/itbi/declaracoes/[id]` | `GET` | `src/app/api/tributacao/itbi/declaracoes/[id]/route.ts` |
| `/api/tributacao/itbi/documentos/[id]` | `GET` | `src/app/api/tributacao/itbi/documentos/[id]/route.ts` |
| `/api/tributacao/itbi/expiracao` | `GET` | `src/app/api/tributacao/itbi/expiracao/route.ts` |
| `/api/tributacao/lotes-anuais/processamento` | `GET` | `src/app/api/tributacao/lotes-anuais/processamento/route.ts` |
| `/api/tributacao/nfse/dms` | `POST` | `src/app/api/tributacao/nfse/dms/route.ts` |
| `/api/tributacao/nfse/rps` | `POST` | `src/app/api/tributacao/nfse/rps/route.ts` |
| `/api/tributacao/notificacoes` | `GET` | `src/app/api/tributacao/notificacoes/route.ts` |
| `/api/tributacao/simples/arquivos/[id]` | `GET` | `src/app/api/tributacao/simples/arquivos/[id]/route.ts` |
| `/api/tributacao/simples/termos/[id]` | `GET` | `src/app/api/tributacao/simples/termos/[id]/route.ts` |
| `/api/upload` | `POST` | `src/app/api/upload/route.ts` |
| `/cadastros/fornecedores/relatorio` | `GET` | `src/app/app-domain/cadastros/fornecedores/relatorio/route.ts` |
| `/camara/planejamento/documentos/[id]` | `GET` | `src/app/app-domain/camara/planejamento/documentos/[id]/route.ts` |
| `/camara/planejamento/documentos/enviar` | `POST` | `src/app/app-domain/camara/planejamento/documentos/enviar/route.ts` |
| `/camara/planejamento/relatorios/emitir` | `GET`, `POST` | `src/app/app-domain/camara/planejamento/relatorios/emitir/route.ts` |
| `/compras/exportacoes/[runId]/download` | `GET` | `src/app/app-domain/compras/exportacoes/[runId]/download/route.ts` |
| `/planejamento/documentos/[id]` | `GET` | `src/app/app-domain/planejamento/documentos/[id]/route.ts` |
| `/planejamento/documentos/enviar` | `POST` | `src/app/app-domain/planejamento/documentos/enviar/route.ts` |
| `/planejamento/relatorios/emitir` | `GET`, `POST` | `src/app/app-domain/planejamento/relatorios/emitir/route.ts` |
| `/portal-servidor/sst/relatorios/exportar` | `GET` | `src/app/app-domain/portal-servidor/sst/relatorios/exportar/route.ts` |
| `/sst/acidentes/[id]/imprimir/inss` | `GET` | `src/app/app-domain/sst/acidentes/[id]/imprimir/inss/route.ts` |
| `/sst/consolidado/exportar` | `GET` | `src/app/app-domain/sst/consolidado/exportar/route.ts` |
| `/sst/prevencao/[id]/anexos/[index]` | `GET` | `src/app/app-domain/sst/prevencao/[id]/anexos/[index]/route.ts` |
| `/sst/prevencao/referencias` | `GET` | `src/app/app-domain/sst/prevencao/referencias/route.ts` |
| `/sst/prevencao/registro` | `POST` | `src/app/app-domain/sst/prevencao/registro/route.ts` |
| `/tributacao/cobranca/parcelamentos/[id]/termo` | `GET` | `src/app/app-domain/tributacao/cobranca/parcelamentos/[id]/termo/route.ts` |
| `/tributacao/cobranca/relatorios/beneficios` | `GET` | `src/app/app-domain/tributacao/cobranca/relatorios/beneficios/route.ts` |
| `/tributacao/cobranca/relatorios/parcelamentos` | `GET` | `src/app/app-domain/tributacao/cobranca/relatorios/parcelamentos/route.ts` |
| `/tributacao/comparativo-anual/exportar` | `GET` | `src/app/app-domain/tributacao/comparativo-anual/exportar/route.ts` |
| `/tributacao/divida-ativa/cda/[id]/pdf` | `GET` | `src/app/app-domain/tributacao/divida-ativa/cda/[id]/pdf/route.ts` |
| `/tributacao/economico/relatorio` | `GET` | `src/app/app-domain/tributacao/economico/relatorio/route.ts` |
| `/tributacao/fiscalizacao/documentos/[id]` | `GET` | `src/app/app-domain/tributacao/fiscalizacao/documentos/[id]/route.ts` |
| `/tributacao/fiscalizacao/produtividade/relatorio` | `GET` | `src/app/app-domain/tributacao/fiscalizacao/produtividade/relatorio/route.ts` |
| `/tributacao/guias/[id]` | `GET` | `src/app/app-domain/tributacao/guias/[id]/route.ts` |
| `/tributacao/iss-bancario/fiscalizacoes/[id]/mapa` | `GET` | `src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/mapa/route.ts` |
| `/tributacao/iss-bancario/fiscalizacoes/[id]/tiaf` | `GET` | `src/app/app-domain/tributacao/iss-bancario/fiscalizacoes/[id]/tiaf/route.ts` |
| `/tributacao/iss-bancario/guias/[id]` | `GET` | `src/app/app-domain/tributacao/iss-bancario/guias/[id]/route.ts` |
| `/tributacao/iss-bancario/importacoes/[id]/recibo` | `GET` | `src/app/app-domain/tributacao/iss-bancario/importacoes/[id]/recibo/route.ts` |
| `/tributacao/itbi/[id]/documento` | `GET` | `src/app/app-domain/tributacao/itbi/[id]/documento/route.ts` |
| `/tributacao/nfse/[id]/documento` | `GET` | `src/app/app-domain/tributacao/nfse/[id]/documento/route.ts` |
| `/tributacao/nfse/[id]/pdf` | `GET` | `src/app/app-domain/tributacao/nfse/[id]/pdf/route.ts` |
| `/tributacao/nfse/[id]/xml` | `GET` | `src/app/app-domain/tributacao/nfse/[id]/xml/route.ts` |
| `/tributacao/pessoas/relatorio` | `GET` | `src/app/app-domain/tributacao/pessoas/relatorio/route.ts` |
| `/tributacao/recadastramento/protocolo/[id]` | `GET` | `src/app/app-domain/tributacao/recadastramento/protocolo/[id]/route.ts` |
| `/tributacao/simples-nacional/exclusoes/[id]/arquivo` | `GET` | `src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/arquivo/route.ts` |
| `/tributacao/simples-nacional/exclusoes/[id]/documento` | `GET` | `src/app/app-domain/tributacao/simples-nacional/exclusoes/[id]/documento/route.ts` |
| `/portal/construcao-civil/[id]/viabilidade-automatica/[runId]/download` | `GET` | `src/app/portal/construcao-civil/[id]/viabilidade-automatica/[runId]/download/route.ts` |

## Anexo C — Dicionário completo de tabelas, população e relações

São **994 tabelas físicas** no schema public. O quadro cobre os 970 modelos, a tabela associativa, as tabelas SQL complementares e o histórico de migrations. “Referências de área” são consumidores detectados por acesso a delegates Prisma em páginas/ações e bibliotecas próprias; uma célula vazia não significa tabela sem uso, pois há SQL bruto, imports indiretos e delegates dinâmicos. “Destinos FK” vem do PostgreSQL e deduplica o destino quando há várias FKs para a mesma tabela; não elimina os 2032 vínculos reais contados. Relações de retorno/coleção não são repetidas como se fossem nova FK. Campos: quantidade de campos escalares no modelo ou campos catalogados nas tabelas extras.

| Tabela | Registros | Campos | Destinos FK | Referências de área detectadas |
| --- | ---: | ---: | --- | --- |
| `_prisma_migrations` | 151 | 8 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `_SchoolToSchoolBus` | 0 | 2 | `School`, `SchoolBus` | SQL/associação/técnica ou uso indireto não atribuído |
| `AcademicDocumentIssue` | 0 | 8 | `Student` | educacao |
| `AcademicPeriod` | 0 | 15 | `School` | educacao |
| `AccountingEntry` | 0 | 12 | `AccountingPlan`, `AccountingTransaction`, `Employee` | tributacao, financeiro, rh, patrimonio |
| `AccountingEventCatalog` | 0 | 7 | — | tributacao, financeiro, planejamento, rh, patrimonio |
| `AccountingPlan` | 0 | 6 | — | tributacao, financeiro, planejamento, rh, patrimonio |
| `AccountingPostingComponent` | 0 | 7 | `AccountingPlan`, `AccountingPostingRule` | financeiro |
| `AccountingPostingRule` | 0 | 9 | `AccountingEventCatalog`, `AccountingPlan` | financeiro |
| `AccountingTransaction` | 0 | 18 | `AccountingTransaction`, `BudgetUnit`, `Employee`, `FinancialYear`, `GovernmentEntity`, `Usuario` | tributacao, financeiro, planejamento, rh, patrimonio |
| `ActionPPA` | 0 | 7 | `ProgramPPA` | financeiro, planejamento |
| `ActiveDebt` | 0 | 19 | `BudgetUnit`, `GovernmentEntity`, `TaxAssessment`, `Taxpayer` | portal-cidadao, tributacao, controle-interno |
| `Address` | 0 | 17 | `Address`, `Company`, `Neighborhood`, `Person`, `Street` | cadastros, rh, saude |
| `AdministrativeUnit` | 0 | 9 | `Secretariat` | administracao, cadastros, sst |
| `AnnualAccountingClose` | 0 | 11 | `Employee`, `FinancialYear`, `Usuario` | transparencia, financeiro |
| `AnnualBudgetExpenseFixation` | 0 | 5 | `AnnualBudgetLaw` | financeiro, planejamento |
| `AnnualBudgetLaw` | 0 | 24 | `BudgetGuideline`, `Document`, `FinancialYear`, `Usuario` | financeiro, planejamento |
| `AnnualBudgetRevenueForecast` | 0 | 5 | `AnnualBudgetLaw` | transparencia, financeiro, planejamento |
| `Asset` | 0 | 26 | `AssetCategory`, `BudgetUnit`, `Department`, `Employee`, `MaterialMovement`, `PurchaseReceiptItem`, `RealEstate`, `Supplier` | protocolos, portal-cidadao, transparencia, sst, patrimonio, frotas, obras, cultura |
| `AssetCategory` | 0 | 7 | — | patrimonio |
| `AssetIntegrationPendingConfiguration` | 0 | 7 | `AssetWriteOff` | patrimonio |
| `AssetMaintenance` | 0 | 11 | `Asset`, `Supplier` | patrimonio, frotas |
| `AssetTransfer` | 0 | 11 | `Asset`, `Department`, `Employee` | patrimonio |
| `AssetValueAdjustment` | 0 | 15 | `AccountingTransaction`, `Asset` | patrimonio |
| `AssetValueHistory` | 0 | 12 | `AccountingTransaction`, `Asset` | patrimonio |
| `AssetWriteOff` | 0 | 13 | `AccountingTransaction`, `Asset` | patrimonio |
| `Attendance` | 0 | 8 | `ClassDiary`, `Student` | educacao |
| `AttendanceRecord` | 0 | 12 | `Employee` | rh, portal-servidor |
| `AuditEvent` | 0 | 6 | `Usuario` | saude, auditoria, configuracoes |
| `AutomatedBankDownload` | 0 | 16 | — | financeiro |
| `Bank` | 2 | 8 | — | cadastros, financeiro |
| `BankAccount` | 0 | 18 | `AccountingPlan`, `Bank`, `BankAccount`, `BankBranch`, `BudgetUnit`, `ResourceSource` | cadastros, tributacao, financeiro, planejamento, rh, patrimonio, educacao, controle-interno |
| `BankAccountResourceSource` | 0 | 5 | `BankAccount`, `ResourceSource` | financeiro |
| `BankBranch` | 0 | 9 | `Bank`, `City` | cadastros, financeiro |
| `BankReconciliation` | 0 | 12 | `BankAccount` | financeiro |
| `BankReconciliationAllocation` | 0 | 6 | `BankReconciliationAllocationGroup`, `BankStatementItem`, `TreasuryMovement` | financeiro |
| `BankReconciliationAllocationGroup` | 0 | 12 | `BankAccount`, `BankReconciliationSession` | financeiro |
| `BankReconciliationMatch` | 0 | 9 | — | financeiro |
| `BankReconciliationSession` | 0 | 24 | `BankAccount` | financeiro |
| `BankStatementImport` | 0 | 10 | `BankAccount` | financeiro |
| `BankStatementItem` | 0 | 27 | `BankAccount`, `BankStatementImport`, `TreasuryMovement` | financeiro |
| `BenefitConfig` | 0 | 8 | `Supplier` | rh, sst |
| `Bidding` | 0 | 9 | `PurchaseProcess` | transparencia, compras |
| `BiddingAct` | 0 | 14 | `Bidding`, `BiddingLot`, `BiddingPhase`, `Document`, `PreliminaryTechnicalStudy`, `Usuario` | compras |
| `BiddingAppointment` | 0 | 10 | `Document` | compras |
| `BiddingAppointmentAssignment` | 0 | 10 | `Bidding`, `BiddingAppointment`, `PreliminaryTechnicalStudy` | compras |
| `BiddingAppointmentMember` | 0 | 9 | `BiddingAppointment`, `Employee` | SQL/associação/técnica ou uso indireto não atribuído |
| `BiddingBid` | 0 | 13 | `BiddingLot`, `BiddingParticipant`, `SupplierPortalIdentity` | compras |
| `BiddingEligibility` | 0 | 11 | `BiddingLot`, `BiddingParticipant`, `Document`, `Usuario` | compras |
| `BiddingLot` | 0 | 9 | `Bidding`, `PreliminaryTechnicalStudy` | compras |
| `BiddingLotItem` | 0 | 6 | `BiddingLot`, `PurchaseProcessItem` | compras |
| `BiddingParticipant` | 0 | 10 | `Bidding`, `PreliminaryTechnicalStudy`, `Supplier` | compras |
| `BiddingPhase` | 0 | 13 | `Bidding`, `PreliminaryTechnicalStudy` | compras |
| `BiddingResult` | 0 | 15 | `BiddingAct`, `BiddingBid`, `BiddingLot`, `BiddingParticipant`, `Usuario` | compras |
| `BimonthlyRevenueTarget` | 0 | 4 | `AnnualBudgetLaw` | financeiro |
| `BudgetAppropriation` | 0 | 17 | `ActionPPA`, `AnnualBudgetExpenseFixation`, `BudgetUnit`, `ExpenseNature`, `FinancialYear`, `ProgramPPA`, `ResourceSource` | financeiro, planejamento, compras, rh, educacao, social, obras |
| `BudgetGuideline` | 0 | 20 | `Document`, `FinancialYear`, `MultiYearPlan`, `Usuario` | financeiro, planejamento |
| `BudgetGuidelinePriority` | 0 | 4 | `BudgetGuideline` | planejamento |
| `BudgetGuidelineRisk` | 0 | 5 | `BudgetGuideline` | planejamento |
| `BudgetMovement` | 0 | 12 | `BudgetAppropriation` | financeiro, planejamento |
| `BudgetReservation` | 0 | 11 | `BudgetAppropriation`, `Expense` | financeiro, planejamento, compras |
| `BudgetUnit` | 0 | 6 | `Secretariat` | protocolos, portal-cidadao, tributacao, financeiro, planejamento, compras, rh, portal-servidor, sst, patrimonio, controle-interno |
| `CadUnicoRecord` | 0 | 12 | — | social |
| `CalendarEvent` | 0 | 8 | — | administracao, saude |
| `CamAdvisor` | 0 | 8 | `CamGabinete`, `Employee`, `Person` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamAta` | 0 | 8 | `CamSessao` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamAudiencia` | 0 | 12 | `CamLegislatura`, `CamSessao` | camara |
| `CamComissao` | 0 | 9 | `CamLegislatura` | camara |
| `CamComissaoMembro` | 0 | 6 | `CamComissao`, `CamVereador` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamDocumentoLegislativo` | 0 | 10 | `CamAta`, `CamAudiencia`, `CamLei`, `CamParecer`, `CamProposicao`, `CamSessao`, `Document` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamGabinete` | 0 | 9 | `CamVereador` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamLegislatura` | 0 | 9 | `Secretariat` | camara |
| `CamLei` | 0 | 12 | `CamProposicao`, `LegalText` | planejamento, camara |
| `CamMesaDiretora` | 0 | 7 | `CamLegislatura`, `CamVereador` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamParecer` | 0 | 9 | `CamComissao`, `CamProposicao` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamPauta` | 0 | 8 | `CamProposicao`, `CamSessao` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamPresencaSessao` | 0 | 5 | `CamSessao`, `CamVereador` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamProposicao` | 0 | 12 | `CamSessao`, `CamVereador` | planejamento, camara |
| `CamSessao` | 0 | 10 | `CamLegislatura` | camara |
| `CamVereador` | 0 | 15 | `CamLegislatura`, `Employee`, `Person` | planejamento, camara |
| `CamVotacao` | 0 | 10 | `CamProposicao`, `CamSessao` | SQL/associação/técnica ou uso indireto não atribuído |
| `CamVoto` | 0 | 5 | `CamVereador`, `CamVotacao` | SQL/associação/técnica ou uso indireto não atribuído |
| `CatalogItem` | 0 | 13 | — | cadastros, compras, patrimonio |
| `CemeteryAttachment` | 0 | 6 | `Document` | tributacao, cemiterios |
| `CemeteryChangeHistory` | 0 | 8 | — | tributacao, cemiterios |
| `CemeteryChapel` | 0 | 9 | `TaxCemetery` | tributacao, cemiterios |
| `CemeteryFeeEvent` | 0 | 19 | `CemeteryFeeRuleVersion`, `TaxAssessment`, `TaxCemetery`, `TaxGuide`, `Taxpayer` | tributacao, cemiterios |
| `CemeteryFeeRule` | 0 | 11 | `TaxCemetery` | tributacao, cemiterios |
| `CemeteryFeeRuleVersion` | 0 | 16 | `CemeteryFeeRule`, `Tax`, `TaxCemetery` | SQL/associação/técnica ou uso indireto não atribuído |
| `CemeteryIdentificationField` | 0 | 10 | `TaxCemetery` | tributacao, cemiterios |
| `CemeteryLot` | 0 | 10 | `TaxCemetery` | tributacao, cemiterios |
| `CemeteryOssuary` | 0 | 10 | `TaxCemetery` | tributacao, cemiterios |
| `CemeteryProcess` | 0 | 18 | `CemeteryChapel`, `TaxCemetery`, `TaxDeceased`, `TaxGrave` | tributacao, cemiterios |
| `CertificateUseAudit` | 0 | 10 | `DigitalCertificate`, `DocumentVersion` | documentos, configuracoes |
| `CitizenAccessApplication` | 0 | 12 | `Process` | protocolos, portal-cidadao |
| `CitizenRegistryIdentity` | 0 | 8 | `Company`, `Person`, `Usuario` | portal-cidadao, frotas |
| `City` | 1 | 7 | `State` | cadastros |
| `ClassDiary` | 0 | 14 | `SchoolClass`, `SchoolSubject`, `Teacher` | educacao |
| `ClassificationRule` | 0 | 18 | `BankAccount` | financeiro |
| `ClassScheduleBoard` | 0 | 9 | `AcademicPeriod`, `SchoolClass` | educacao |
| `ClassScheduleEntry` | 0 | 9 | `ClassScheduleBoard`, `SchoolSubject`, `Teacher` | educacao |
| `Commitment` | 0 | 24 | `BudgetAppropriation`, `BudgetReservation`, `Contract`, `Covenant`, `Creditor`, `FundedDebt`, `Process`, `PublicityCampaign`, `PurchaseProcess`, `PurchaseReceipt`, `Supplier` | transparencia, financeiro, planejamento, compras, rh, obras, controle-interno |
| `CommitmentMovement` | 0 | 7 | `Commitment` | financeiro |
| `Company` | 0 | 21 | — | cadastros, protocolos, atendimento, portal-cidadao, compras, sst, saude, obras, cultura |
| `ConfiguracaoInstancia` | 0 | 9 | — | transparencia, rh, portal-servidor, saude, configuracoes |
| `ConfiguracaoModulo` | 29 | 7 | — | tributacao, financeiro, planejamento, portal-servidor, sst, patrimonio, saude, controle-interno, configuracoes |
| `ConfiguracaoParametroInstancia` | 0 | 6 | `ConfiguracaoInstancia` | protocolos, documentos, transparencia, portal-servidor, saude, configuracoes |
| `ConfiguracaoPerfil` | 4 | 8 | — | portal-cidadao, saude, configuracoes |
| `ConstructionAnalystReplacement` | 0 | 10 | `ConstructionCase`, `Department`, `Employee` | obras |
| `ConstructionAutomaticViabilityRun` | 0 | 11 | `ConstructionCase`, `ConstructionPortalIdentity`, `ConstructionViabilityResult`, `Document`, `DocumentVersion` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionCase` | 0 | 24 | `ConstructionConfigVersion`, `Employee`, `Process` | obras |
| `ConstructionCaseProperty` | 0 | 4 | `ConstructionCase`, `RealEstate` | obras |
| `ConstructionCatalogEntry` | 26 | 7 | — | obras |
| `ConstructionCompanyProfile` | 0 | 9 | `Company` | obras |
| `ConstructionCompanyProfileEvent` | 0 | 6 | `ConstructionCompanyProfile` | obras |
| `ConstructionCompletion` | 0 | 15 | `ConstructionCase`, `Document` | obras |
| `ConstructionCompletionSequence` | 0 | 2 | — | obras |
| `ConstructionConfigVersion` | 0 | 10 | — | obras |
| `ConstructionConsultation` | 0 | 9 | `ConstructionCase`, `Department` | protocolos, obras |
| `ConstructionConsultationResponse` | 0 | 6 | `ConstructionConsultation`, `Employee` | obras |
| `ConstructionDefinitionVersion` | 0 | 6 | — | obras |
| `ConstructionDistributionVersion` | 0 | 7 | `Department`, `Employee` | obras |
| `ConstructionDocumentRequest` | 0 | 11 | `ConstructionCase`, `ConstructionIssuedDocument`, `ConstructionPortalIdentity` | obras |
| `ConstructionDocumentTemplateVersion` | 0 | 9 | — | obras |
| `ConstructionEnforcementAcknowledgement` | 0 | 10 | `ConstructionEnforcementAct` | obras |
| `ConstructionEnforcementAct` | 0 | 17 | `ConstructionEnforcementAct`, `ConstructionEnforcementCase`, `ConstructionEnforcementVisit` | obras |
| `ConstructionEnforcementAssignment` | 0 | 11 | `ConstructionEnforcementCase` | obras |
| `ConstructionEnforcementCase` | 0 | 16 | `ConstructionCase`, `Process`, `RealEstate` | obras |
| `ConstructionEnforcementEvidence` | 0 | 8 | `ConstructionEnforcementAcknowledgement`, `ConstructionEnforcementAct`, `ConstructionEnforcementVisit`, `Document` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionEnforcementSequence` | 0 | 3 | — | obras |
| `ConstructionEnforcementVisit` | 0 | 11 | `ConstructionEnforcementCase` | obras |
| `ConstructionExternalApplication` | 0 | 14 | `Company`, `ConstructionCase`, `ConstructionPortalIdentity`, `Person`, `Usuario` | obras |
| `ConstructionExternalDocument` | 0 | 10 | `ConstructionExternalApplication`, `Document`, `DocumentVersion` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionFederalExport` | 0 | 13 | `ConstructionFederalExport` | obras |
| `ConstructionFederalExportItem` | 0 | 3 | `ConstructionCase`, `ConstructionFederalExport` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionFederalExportReceipt` | 0 | 10 | `ConstructionFederalExport` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionFee` | 0 | 15 | `ConstructionCase`, `ConstructionTaxRuleVersion`, `RealEstate`, `TaxAssessment`, `Taxpayer` | obras |
| `ConstructionInspection` | 0 | 20 | `ConstructionCase`, `ConstructionCatalogEntry`, `ConstructionInspection` | obras |
| `ConstructionInspectionDeadlineExtension` | 0 | 9 | `ConstructionCase`, `ConstructionInspection` | obras |
| `ConstructionInspectionPlan` | 0 | 8 | `ConstructionCase`, `ConstructionReview` | obras |
| `ConstructionInternalOpeningDocument` | 0 | 13 | `ConstructionCase`, `Document`, `DocumentVersion`, `Usuario` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionIssuedDocument` | 0 | 24 | `ConstructionCase`, `ConstructionDocumentTemplateVersion`, `ConstructionIssuedDocument`, `Document`, `DocumentVersion`, `Process` | obras |
| `ConstructionLifecycleStart` | 0 | 8 | `ConstructionCase` | obras |
| `ConstructionMessage` | 0 | 9 | `ConstructionCase`, `ConstructionPortalIdentity`, `Document`, `Employee` | obras |
| `ConstructionParticipant` | 0 | 9 | `ConstructionCase`, `ConstructionPortalIdentity` | obras |
| `ConstructionPdfAnnotation` | 0 | 12 | `ConstructionCase`, `Document`, `DocumentVersion` | obras |
| `ConstructionPlanExtraction` | 0 | 15 | `ConstructionCase` | obras |
| `ConstructionPortalIdentity` | 0 | 8 | `ConstructionProfessional` | obras |
| `ConstructionProfessional` | 0 | 10 | `Person` | obras |
| `ConstructionProfessionalEmployer` | 0 | 8 | `Company`, `ConstructionProfessional` | obras |
| `ConstructionProjectStamp` | 0 | 19 | `ConstructionCase`, `ConstructionDocumentTemplateVersion`, `ConstructionReview`, `Document`, `DocumentVersion` | SQL/associação/técnica ou uso indireto não atribuído |
| `ConstructionPropertyUpdate` | 0 | 12 | `ConstructionCompletion`, `Process` | obras |
| `ConstructionPropertyZone` | 0 | 4 | `ConstructionZoneVersion`, `RealEstate` | obras |
| `ConstructionReview` | 0 | 11 | `ConstructionCase` | obras |
| `ConstructionServiceRequest` | 0 | 14 | `ConstructionCase`, `ConstructionPortalIdentity`, `Usuario` | obras |
| `ConstructionStaffRole` | 0 | 9 | `Department`, `Employee` | obras |
| `ConstructionTaxRuleVersion` | 0 | 13 | `Tax` | obras |
| `ConstructionTermAcceptance` | 0 | 5 | `ConstructionCase`, `ConstructionPortalIdentity`, `ConstructionTermVersion` | obras |
| `ConstructionTermVersion` | 0 | 5 | — | obras |
| `ConstructionViabilityResult` | 0 | 7 | `ConstructionCase` | obras |
| `ConstructionZoneVersion` | 0 | 14 | — | obras |
| `Contract` | 0 | 16 | `BudgetUnit`, `Employee`, `PurchaseProcess`, `Secretariat`, `Supplier` | transparencia, financeiro, compras, frotas, controle-interno |
| `ContractAmendment` | 0 | 11 | `Contract` | compras |
| `ControlledMedicineBook` | 0 | 11 | `Warehouse` | saude |
| `CostCenter` | 0 | 12 | `AdministrativeUnit`, `CostCenter`, `Department`, `GovernmentEntity`, `Secretariat` | cadastros, transparencia, financeiro, rh, sst, patrimonio, frotas, controle-interno |
| `Covenant` | 0 | 14 | `BankAccount` | transparencia, financeiro, compras, saude |
| `Creditor` | 0 | 10 | `Company`, `Person`, `Supplier` | cadastros, financeiro |
| `CreditRequest` | 0 | 27 | `Document`, `FinancialYear`, `ResourceSource`, `Usuario` | financeiro, planejamento |
| `CreditRequestItem` | 0 | 5 | `BudgetAppropriation`, `CreditRequest` | planejamento |
| `CulturaAgente` | 0 | 13 | `Company`, `Person` | cultura |
| `CulturaAtividade` | 0 | 13 | `CulturaAgente`, `CulturaEspaco`, `Employee` | cultura |
| `CulturaConselho` | 0 | 8 | — | cultura |
| `CulturaConselhoDocumento` | 0 | 5 | `CulturaConselho`, `Document` | cultura |
| `CulturaEspaco` | 0 | 12 | `Asset`, `Employee`, `RealEstate` | portal-cidadao, cultura |
| `CulturaEvento` | 0 | 15 | `CulturaEspaco`, `CulturaProjeto`, `Employee` | portal-cidadao, cultura |
| `CulturaEventoDocumento` | 0 | 5 | `CulturaEvento`, `Document` | cultura |
| `CulturaFundo` | 0 | 8 | `BudgetAppropriation` | cultura |
| `CulturalIncentiveProject` | 0 | 13 | — | cultura |
| `CulturaPatrimonio` | 0 | 12 | `Asset`, `RealEstate` | cultura |
| `CulturaProjeto` | 0 | 15 | `BudgetAppropriation`, `Commitment`, `Contract`, `CulturaAgente`, `PurchaseProcess` | cultura |
| `CulturaProjetoDocumento` | 0 | 5 | `CulturaProjeto`, `Document` | cultura |
| `CulturaReserva` | 0 | 13 | `Company`, `CulturaEspaco`, `CulturaEvento`, `Person` | portal-cidadao, cultura |
| `CulturaReservaDocumento` | 0 | 5 | `CulturaReserva`, `Document` | cultura |
| `Currency` | 1 | 9 | — | cadastros |
| `CurriculumMatrix` | 0 | 11 | `AcademicPeriod`, `School` | educacao |
| `CurriculumMatrixSubject` | 0 | 10 | `CurriculumMatrix`, `SchoolSubject` | SQL/associação/técnica ou uso indireto não atribuído |
| `DebtInstallment` | 0 | 11 | `ActiveDebt`, `Taxpayer` | portal-cidadao, tributacao |
| `DebtInstallmentSchedule` | 0 | 8 | `DebtInstallment` | SQL/associação/técnica ou uso indireto não atribuído |
| `Department` | 0 | 7 | `Secretariat` | administracao, cadastros, protocolos, atendimento, portal-cidadao, transparencia, financeiro, compras, rh, portal-servidor, sst, patrimonio, frotas, obras, controle-interno, configuracoes |
| `Dependent` | 0 | 11 | `Employee`, `Person` | rh, sst |
| `DesifAgency` | 0 | 12 | `DesifFinancialInstitution` | tributacao |
| `DesifAssessment` | 0 | 19 | `DesifAgency`, `DesifImportBatch`, `DesifSubtitle` | tributacao |
| `DesifCosifAccount` | 0 | 10 | — | tributacao |
| `DesifFinancialInstitution` | 0 | 9 | — | tributacao |
| `DesifFiscalCase` | 0 | 18 | `DesifAgency`, `DesifAssessment`, `DesifFinancialInstitution` | tributacao |
| `DesifFiscalEvent` | 0 | 7 | `DesifFiscalCase` | SQL/associação/técnica ou uso indireto não atribuído |
| `DesifImportBatch` | 0 | 22 | `DesifAgency`, `DesifFinancialInstitution` | tributacao |
| `DesifPackage` | 0 | 9 | `DesifFinancialInstitution` | tributacao |
| `DesifPackageItem` | 0 | 5 | `DesifPackage`, `DesifTariff` | tributacao |
| `DesifPackageMovement` | 0 | 12 | `DesifAgency`, `DesifImportBatch`, `DesifPackage` | tributacao |
| `DesifPgccAccount` | 0 | 10 | `DesifPgccPlan` | tributacao |
| `DesifPgccCosifLink` | 0 | 6 | `DesifCosifAccount`, `DesifPgccAccount` | tributacao |
| `DesifPgccPlan` | 0 | 9 | `DesifFinancialInstitution` | tributacao |
| `DesifSubtitle` | 0 | 11 | `DesifPgccAccount` | tributacao |
| `DesifTariff` | 0 | 10 | `DesifFinancialInstitution` | tributacao |
| `DesifTrialBalance` | 0 | 13 | `DesifAgency`, `DesifImportBatch`, `DesifPgccAccount` | tributacao |
| `DigitalCertificate` | 0 | 19 | — | documentos, tributacao, obras, controle-interno, configuracoes |
| `DirectContracting` | 0 | 9 | `PurchaseProcess`, `Supplier` | compras |
| `Document` | 0 | 15 | `Company`, `DocumentClass`, `Folder`, `Person` | cadastros, documentos, transparencia, tributacao, financeiro, planejamento, compras, rh, portal-servidor, saude, obras, cemiterios, controle-interno |
| `DocumentClass` | 7 | 7 | — | protocolos, documentos, portal-cidadao, planejamento, rh, portal-servidor, patrimonio, obras, configuracoes |
| `DocumentIcpEvidence` | 0 | 19 | `DigitalCertificate`, `DocumentVersion` | documentos |
| `DocumentSignature` | 0 | 25 | `Document`, `DocumentVersion`, `Employee`, `Usuario` | protocolos, documentos, portal-servidor, saude, obras |
| `DocumentVersion` | 0 | 10 | `Document` | protocolos, documentos, portal-cidadao, transparencia, tributacao, financeiro, rh, portal-servidor, sst, patrimonio, frotas, obras, configuracoes |
| `DteAccessGrant` | 0 | 11 | `DteMailbox` | tributacao |
| `DteCategory` | 0 | 8 | — | tributacao |
| `DteMailbox` | 0 | 12 | — | tributacao |
| `DteMessage` | 0 | 23 | `DteCategory`, `DteMailbox` | tributacao |
| `DteMessageEvent` | 0 | 6 | `DteMessage` | SQL/associação/técnica ou uso indireto não atribuído |
| `DtePowerOfAttorney` | 0 | 17 | — | tributacao |
| `DtePowerOfAttorneyEvent` | 0 | 6 | `DtePowerOfAttorney` | SQL/associação/técnica ou uso indireto não atribuído |
| `EconomicRegistration` | 0 | 9 | `Taxpayer` | portal-cidadao, tributacao |
| `EducacensoOperation` | 0 | 16 | — | educacao |
| `EducationalGuardian` | 0 | 9 | `Person`, `Student` | SQL/associação/técnica ou uso indireto não atribuído |
| `EducationApplicationPlan` | 0 | 11 | `EducationFinancialAccount`, `School` | educacao |
| `EducationAssessment` | 0 | 16 | `SchoolClass`, `SchoolSubject`, `Teacher` | educacao |
| `EducationFinancialAccount` | 0 | 7 | `BankAccount`, `School` | educacao |
| `EducationFinancialMovement` | 0 | 8 | `EducationFinancialAccount` | educacao |
| `EducationFoodMovement` | 0 | 10 | `Material`, `School`, `Warehouse` | educacao |
| `EducationLibraryCopy` | 0 | 6 | `EducationLibraryTitle` | educacao |
| `EducationLibraryLoan` | 0 | 10 | `EducationLibraryCopy`, `Student` | educacao |
| `EducationLibraryReservation` | 0 | 7 | `EducationLibraryTitle`, `Student` | educacao |
| `EducationLibraryTitle` | 0 | 9 | `School` | educacao |
| `EducationSchoolMenu` | 0 | 10 | `School` | educacao |
| `EducationSupportRequest` | 0 | 10 | — | educacao |
| `EducationTransportEvent` | 0 | 7 | `EducationTransportJourney` | educacao |
| `EducationTransportJourney` | 0 | 9 | `EducationTransportRoute`, `FleetUnit` | educacao |
| `EducationTransportRoute` | 0 | 9 | `FleetRoute`, `FleetUnit`, `School` | educacao |
| `EducationTransportStop` | 0 | 8 | `EducationTransportRoute` | educacao |
| `EducationTransportStudent` | 0 | 6 | `EducationTransportRoute`, `Student` | educacao |
| `Employee` | 0 | 16 | `AdministrativeUnit`, `Department`, `Person`, `Role`, `Secretariat` | administracao, cadastros, protocolos, atendimento, portal-cidadao, transparencia, tributacao, financeiro, compras, rh, portal-servidor, sst, patrimonio, frotas, educacao, saude, social, obras, cultura, controle-interno, configuracoes |
| `Enrollment` | 0 | 13 | `AcademicPeriod`, `School`, `SchoolClass`, `Student` | educacao |
| `EnrollmentMovement` | 0 | 11 | `Enrollment`, `SchoolClass` | educacao |
| `EnvComplaint` | 0 | 8 | — | meio-ambiente |
| `EnvDocument` | 0 | 7 | `EnvEnterprise` | meio-ambiente |
| `EnvEduProgram` | 0 | 10 | — | meio-ambiente |
| `EnvEnterprise` | 0 | 9 | — | meio-ambiente |
| `EnvGreenArea` | 0 | 9 | — | meio-ambiente |
| `EnvInfraction` | 0 | 8 | `EnvEnterprise` | SQL/associação/técnica ou uso indireto não atribuído |
| `EnvInspection` | 0 | 9 | `EnvEnterprise` | meio-ambiente |
| `EnvironmentalLicense` | 0 | 14 | — | meio-ambiente |
| `EnvLicense` | 0 | 9 | `EnvEnterprise` | meio-ambiente |
| `EnvRequest` | 0 | 8 | — | meio-ambiente |
| `EnvWaste` | 0 | 10 | `EnvEnterprise` | meio-ambiente |
| `EquipmentCustody` | 0 | 12 | `Department`, `Employee`, `Material`, `MaterialMovement` | patrimonio |
| `ExceptionQueueItem` | 0 | 16 | — | financeiro |
| `Expense` | 0 | 22 | `BudgetAppropriation`, `PurchaseReceipt`, `Secretariat`, `SocialBenefit`, `SocialProgram`, `Supplier`, `Usuario` | financeiro, compras, rh, educacao |
| `ExpenseNature` | 0 | 6 | — | financeiro, planejamento |
| `Family` | 0 | 6 | `Person` | cadastros, saude, social |
| `FamilyMember` | 0 | 10 | `Family`, `Person` | cadastros, saude, social |
| `FinancialAuditLog` | 0 | 10 | `Employee`, `Usuario` | cadastros, transparencia, financeiro, planejamento, patrimonio, controle-interno |
| `FinancialDocument` | 0 | 12 | `Commitment`, `Payment`, `Settlement`, `WithholdingPayable` | financeiro |
| `FinancialYear` | 0 | 8 | `GovernmentEntity` | transparencia, tributacao, financeiro, planejamento, rh, patrimonio, controle-interno |
| `FiscalAssessmentMap` | 0 | 20 | `FiscalServiceOrder` | tributacao |
| `FiscalAuditPlan` | 0 | 17 | — | tributacao |
| `FiscalAuditPlanEvent` | 0 | 7 | `FiscalAuditPlan` | SQL/associação/técnica ou uso indireto não atribuído |
| `FiscalAuditPlanInspector` | 0 | 5 | `FiscalAuditPlan` | SQL/associação/técnica ou uso indireto não atribuído |
| `FiscalAuditPlanSelection` | 0 | 7 | `FiscalAuditPlan` | SQL/associação/técnica ou uso indireto não atribuído |
| `FiscalDocumentRequest` | 0 | 12 | `FiscalServiceOrder` | tributacao |
| `FiscalDocumentTemplate` | 0 | 13 | — | tributacao |
| `FiscalInspectionDocument` | 0 | 15 | `FiscalServiceOrder` | tributacao |
| `FiscalMeshFinding` | 0 | 18 | — | tributacao |
| `FiscalMeshOrderLink` | 0 | 4 | `FiscalMeshFinding`, `FiscalServiceOrder` | tributacao |
| `FiscalPenaltyRule` | 0 | 15 | — | tributacao |
| `FiscalProductivityConfig` | 0 | 14 | — | tributacao |
| `FiscalProductivityEntry` | 0 | 12 | `FiscalProductivityTaskRule`, `FiscalServiceOrder` | tributacao |
| `FiscalProductivityLedger` | 0 | 8 | `FiscalProductivityPeriod` | tributacao |
| `FiscalProductivityPeriod` | 0 | 15 | — | tributacao |
| `FiscalProductivityTaskRule` | 0 | 10 | — | tributacao |
| `FiscalServiceOrder` | 0 | 20 | `FiscalAuditPlan` | tributacao |
| `FiscalServiceOrderEvent` | 0 | 8 | `FiscalServiceOrder` | tributacao |
| `FleetAssetEvent` | 0 | 11 | `FleetUnit` | SQL/associação/técnica ou uso indireto não atribuído |
| `FleetAttachment` | 0 | 13 | `Document`, `DocumentVersion`, `FleetUnit`, `Usuario` | frotas |
| `FleetAuthorization` | 0 | 29 | `Contract`, `DocumentVersion`, `FleetConsumption`, `FleetDriver`, `FleetExpense`, `FleetFuelAgreement`, `FleetProvider`, `FleetUnit`, `FleetWorkOrder`, `MaterialStock`, `PurchaseProcess`, `Usuario` | frotas |
| `FleetBooking` | 0 | 13 | `FleetBooking`, `FleetDestination`, `FleetDriver`, `FleetRoute`, `FleetUnit`, `Usuario` | frotas, saude |
| `FleetCatalogEntry` | 0 | 5 | `FleetCatalogVersion` | frotas |
| `FleetCatalogVersion` | 0 | 9 | `Usuario` | frotas |
| `FleetClaim` | 0 | 11 | `FleetDocument`, `FleetOccurrence`, `FleetProvider`, `FleetUnit`, `Usuario` | frotas |
| `FleetComponent` | 0 | 8 | `Usuario` | frotas |
| `FleetComponentInstallation` | 0 | 14 | `FleetComponent`, `FleetExpense`, `FleetUnit`, `FleetWorkOrder`, `MaterialMovement`, `Usuario` | frotas |
| `FleetConsumption` | 0 | 16 | `FleetUnit`, `MaterialMovement` | frotas |
| `FleetControlEvent` | 0 | 10 | `FleetUnit`, `Usuario` | frotas |
| `FleetDestination` | 0 | 7 | `Department` | frotas |
| `FleetDocument` | 0 | 19 | `FleetUnit` | frotas |
| `FleetDriver` | 0 | 15 | `Department`, `Employee`, `Person`, `Usuario` | frotas |
| `FleetExpense` | 0 | 16 | `Contract`, `FleetUnit`, `PurchaseProcess`, `Supplier` | frotas |
| `FleetExternalEvent` | 0 | 6 | `FleetAuthorization`, `FleetProvider` | frotas |
| `FleetExternalThrottle` | 0 | 3 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `FleetFine` | 0 | 15 | `DocumentVersion`, `FleetCatalogEntry`, `FleetDriver`, `FleetUnit`, `Usuario` | frotas |
| `FleetFinePayment` | 0 | 10 | `DocumentVersion`, `FleetExpense`, `FleetFine`, `Payment`, `Usuario` | frotas |
| `FleetFuelAgreement` | 0 | 12 | `Contract`, `DocumentVersion`, `FleetProvider`, `PurchaseProcessItem` | frotas |
| `FleetFuelQuota` | 0 | 4 | `FleetUnit` | frotas |
| `FleetGateEvent` | 0 | 8 | `FleetDriver`, `FleetTrip`, `FleetUnit`, `Usuario` | frotas |
| `FleetMachineType` | 0 | 6 | — | frotas |
| `FleetMutation` | 0 | 6 | — | frotas |
| `FleetOccurrence` | 0 | 11 | `FleetUnit` | frotas |
| `FleetOperation` | 0 | 14 | `Asset` | SQL/associação/técnica ou uso indireto não atribuído |
| `FleetPlan` | 0 | 13 | `FleetUnit` | frotas |
| `FleetProvider` | 0 | 4 | `Supplier` | frotas |
| `FleetRoute` | 0 | 11 | — | frotas, educacao, saude |
| `FleetSequence` | 0 | 4 | — | frotas |
| `FleetTrip` | 0 | 16 | `FleetBooking`, `FleetDriver`, `FleetRoute`, `FleetUnit`, `Usuario` | frotas, saude |
| `FleetUnit` | 0 | 20 | `Asset`, `FleetUnit` | transparencia, frotas, educacao, saude |
| `FleetUnitControl` | 0 | 17 | `CostCenter`, `FleetCatalogEntry`, `FleetMachineType`, `FleetRoute`, `FleetUnit` | frotas |
| `FleetUsage` | 0 | 16 | `FleetDriver`, `FleetRoute`, `FleetTrip`, `FleetUnit` | frotas |
| `FleetWorkOrder` | 0 | 19 | `AssetMaintenance`, `FleetPlan`, `FleetUnit` | frotas |
| `FleetWorkshopReport` | 0 | 9 | `DocumentVersion`, `FleetAuthorization`, `FleetProvider` | frotas |
| `Folder` | 0 | 7 | `Department`, `Folder` | documentos, financeiro |
| `FundedDebt` | 0 | 9 | — | financeiro |
| `GenericProcessWorkflowDefinition` | 0 | 8 | `ProcessType`, `Usuario` | protocolos, portal-cidadao, rh, configuracoes |
| `GenericProcessWorkflowEvent` | 0 | 8 | `GenericProcessWorkflowInstance`, `Usuario` | protocolos |
| `GenericProcessWorkflowInstance` | 0 | 11 | `GenericProcessWorkflowDefinition`, `Process`, `Usuario` | protocolos, portal-cidadao, rh |
| `GenericProcessWorkflowStage` | 0 | 9 | `Department`, `DocumentClass`, `GenericProcessWorkflowDefinition` | protocolos, configuracoes |
| `GoalPPA` | 0 | 5 | `ActionPPA` | financeiro, planejamento |
| `GovernmentEntity` | 2 | 10 | `Company`, `GovernmentEntity` | cadastros, transparencia, financeiro, planejamento, sst, controle-interno |
| `Grade` | 0 | 16 | `EducationAssessment`, `SchoolClass`, `SchoolSubject`, `Student`, `Teacher` | educacao |
| `HealthAdministrativeMerge` | 0 | 8 | `Usuario` | saude |
| `HealthAppointment` | 0 | 30 | `HealthCareSchedule`, `HealthProfessional`, `HealthSchedulingGroup`, `HealthService`, `HealthSpecialty`, `HealthUnit`, `Patient` | saude |
| `HealthAppointmentEvent` | 0 | 8 | `HealthAppointment`, `Usuario` | saude |
| `HealthAssistentialDevice` | 0 | 12 | `HealthUnit` | saude |
| `HealthAuthorizationIssuer` | 0 | 8 | — | saude |
| `HealthAuthorizationNumberRange` | 0 | 11 | `HealthAuthorizationIssuer` | saude |
| `HealthBed` | 0 | 7 | `HealthUnit` | saude |
| `HealthBedOccupancy` | 0 | 6 | `HealthBed`, `Patient` | saude |
| `HealthCallPanel` | 0 | 9 | — | saude |
| `HealthCareAgreement` | 0 | 9 | — | saude |
| `HealthCareCoverage` | 0 | 12 | `HealthCareAgreement`, `HealthSpecialty`, `HealthSusProcedure`, `HealthUnit` | saude |
| `HealthCareProgram` | 0 | 5 | — | saude |
| `HealthCareProgramEnrollment` | 0 | 11 | `HealthCareProgram`, `HealthUnit`, `Patient` | saude |
| `HealthCareRevision` | 0 | 7 | `MedicalRecord` | saude |
| `HealthCareSchedule` | 0 | 30 | `HealthCareAgreement`, `HealthProfessional`, `HealthSchedulingGroup`, `HealthSpecialty`, `HealthUnit`, `Supplier` | saude |
| `HealthCatmatUnitMapping` | 0 | 9 | `HealthMaterialProfile` | saude |
| `HealthCbo` | 2 | 6 | — | cadastros, tributacao, planejamento, saude |
| `HealthChronicAssessment` | 0 | 14 | `Patient` | saude |
| `HealthClinicalDocument` | 0 | 6 | `Document`, `MedicalRecord`, `Usuario` | saude |
| `HealthClinicalDocumentOrder` | 0 | 8 | `MedicalRecord` | saude |
| `HealthClinicalDocumentTemplate` | 0 | 8 | — | saude |
| `HealthClinicalEvolution` | 0 | 5 | `HealthProfessional`, `MedicalRecord` | saude |
| `HealthClinicalExamReview` | 0 | 10 | `MedicalRecord` | saude |
| `HealthClinicalQuestionnaire` | 0 | 10 | — | saude |
| `HealthClinicalQuestionnaireResponse` | 0 | 6 | `HealthClinicalQuestionnaire`, `MedicalRecord` | saude |
| `HealthClinicalScreening` | 0 | 16 | `Patient` | saude |
| `HealthCollectiveActivity` | 0 | 14 | — | saude |
| `HealthCounterreference` | 0 | 6 | `MedicalRecord` | saude |
| `HealthDcbSubstance` | 0 | 9 | — | saude |
| `HealthDentalMark` | 0 | 14 | `Patient` | saude |
| `HealthDestination` | 0 | 4 | — | saude |
| `HealthDeviceMessage` | 0 | 11 | `HealthAssistentialDevice` | saude |
| `HealthDiagnosis` | 0 | 6 | `HealthSusReference`, `MedicalRecord` | saude |
| `HealthDispensationEvent` | 0 | 7 | `MedicineDispensation` | saude |
| `HealthEsusBatch` | 0 | 12 | — | saude |
| `HealthEsusBatchItem` | 0 | 6 | `HealthEsusBatch`, `HealthEsusForm` | saude |
| `HealthEsusForm` | 0 | 18 | `HealthFamily`, `HealthHousehold`, `HealthProfessional`, `HealthTeam`, `HealthUnit`, `MedicalRecord`, `Patient`, `Person` | saude |
| `HealthExamRequest` | 0 | 17 | `HealthProfessional`, `HealthSusProcedure`, `HealthUnit`, `MedicalRecord`, `Patient` | saude |
| `HealthFamily` | 0 | 12 | `Family`, `HealthHousehold`, `Person` | cadastros, saude |
| `HealthFamilyDocument` | 0 | 5 | `Document`, `Family` | saude |
| `HealthFamilyEvent` | 0 | 9 | `HealthFamily` | saude |
| `HealthFamilyMember` | 0 | 5 | `HealthFamily`, `Person` | saude |
| `HealthFollowupBatch` | 0 | 14 | `HealthFollowupBatch`, `HealthFollowupBinding` | saude |
| `HealthFollowupBatchItem` | 0 | 8 | `HealthFollowupBatch` | saude |
| `HealthFollowupBinding` | 0 | 8 | `HealthFollowupReceiver`, `HealthUnit`, `IntegrationConnection` | saude |
| `HealthFollowupProcessedKey` | 0 | 6 | `HealthFollowupReceiver`, `HealthFollowupRecord` | saude |
| `HealthFollowupReceipt` | 0 | 13 | `HealthFollowupBatch`, `HealthFollowupReceiver`, `IntegrationRun` | saude |
| `HealthFollowupReceiver` | 0 | 8 | `HealthUnit` | saude |
| `HealthFollowupRecord` | 0 | 13 | `HealthFollowupBatch`, `HealthFollowupReceiver`, `HealthProfessional`, `HealthUnit`, `Patient` | saude |
| `HealthFollowupResult` | 0 | 7 | `HealthFollowupBatchItem`, `HealthFollowupReceipt`, `HealthFollowupRecord` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthFoodMarker` | 0 | 10 | `Patient` | saude |
| `HealthHabilitation` | 0 | 8 | `HealthProfessional`, `HealthUnit` | saude |
| `HealthHomeCareAssessment` | 0 | 11 | `HealthHomeCareRequest` | saude |
| `HealthHomeCareAttendance` | 0 | 7 | `HealthHomeCareAssessment`, `HealthHomeCareRequest` | saude |
| `HealthHomeCareRequest` | 0 | 8 | `Patient` | saude |
| `HealthHomeVisit` | 0 | 14 | `HealthFamily`, `HealthHousehold`, `HealthMicroarea`, `HealthProfessional`, `HealthTeam`, `HealthTerritoryArea`, `HealthUnit` | saude |
| `HealthHomeVisitParticipant` | 0 | 13 | `HealthHomeVisit`, `Patient`, `Person` | saude |
| `HealthHousehold` | 0 | 8 | `Address`, `HealthMicroarea` | saude |
| `HealthInternalCareReferral` | 0 | 6 | `MedicalRecord` | saude |
| `HealthLabExamMaterial` | 0 | 5 | `HealthLabExamModel`, `Material`, `Warehouse` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthLabExamModel` | 0 | 13 | `HealthLabQuestionnaire`, `HealthSusProcedure` | saude |
| `HealthLaboratoryConfiguration` | 0 | 16 | `HealthUnit`, `Usuario` | saude |
| `HealthLabOrder` | 0 | 22 | `HealthExamRequest`, `HealthLabExamModel`, `HealthProfessional`, `HealthUnit`, `Patient`, `Supplier` | saude |
| `HealthLabOrderEvent` | 0 | 8 | `HealthLabOrder` | saude |
| `HealthLabProviderQuota` | 0 | 9 | `HealthLabExamModel`, `HealthUnit`, `Supplier` | saude |
| `HealthLabQuestionGroup` | 0 | 5 | `HealthLabQuestionnaire` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthLabQuestionItem` | 0 | 12 | `HealthLabQuestionGroup` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthLabQuestionnaire` | 0 | 9 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthLabReport` | 0 | 12 | `Document`, `HealthLabOrder`, `HealthProfessional` | saude |
| `HealthLabResult` | 0 | 10 | `HealthLabOrder` | saude |
| `HealthLabSchedule` | 0 | 9 | `HealthLabExamModel`, `HealthUnit` | saude |
| `HealthMaintainer` | 0 | 9 | `Company` | saude |
| `HealthMaterialProfile` | 0 | 25 | `HealthDcbSubstance`, `Material`, `Supplier` | saude |
| `HealthMedicationAdministration` | 0 | 13 | `MedicalRecord` | saude |
| `HealthMicroarea` | 0 | 6 | `HealthProfessional`, `HealthTerritoryArea` | saude |
| `HealthObservation` | 0 | 13 | `HealthBed`, `HealthUnit`, `MedicalRecord`, `Patient` | saude |
| `HealthOngoingMedication` | 0 | 9 | `Patient` | saude |
| `HealthPanelCall` | 0 | 8 | `HealthCallPanel` | saude |
| `HealthPatientCall` | 0 | 9 | `HealthRegulationRequest`, `Patient` | saude |
| `HealthPatientCondition` | 0 | 13 | `Patient` | saude |
| `HealthPatientConditionRevision` | 0 | 7 | `HealthPatientCondition` | saude |
| `HealthPatientContact` | 0 | 12 | `Patient` | saude |
| `HealthPatientDocument` | 0 | 6 | `Document`, `Patient` | saude |
| `HealthPatientRegistration` | 0 | 15 | `Patient` | saude |
| `HealthPatientRegistrationChange` | 0 | 5 | `Patient` | saude |
| `HealthPerformedProcedure` | 0 | 7 | `HealthProfessional`, `HealthSusProcedure`, `MedicalRecord` | saude |
| `HealthPharmacyJudicialCase` | 0 | 16 | `HealthPharmacyJudicialCase`, `HealthPharmacyLawyer`, `Patient`, `Process`, `PurchaseRequest` | saude |
| `HealthPharmacyJudicialDocument` | 0 | 5 | `Document`, `HealthPharmacyJudicialCase` | saude |
| `HealthPharmacyJudicialEvent` | 0 | 7 | `HealthPharmacyJudicialCase` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthPharmacyJudicialItem` | 0 | 6 | `HealthPharmacyJudicialCase`, `HealthPrescriptionItem`, `Medicine` | saude |
| `HealthPharmacyKit` | 0 | 7 | — | saude |
| `HealthPharmacyKitDelivery` | 0 | 18 | `HealthPharmacyKit`, `Patient`, `Person`, `Warehouse` | saude |
| `HealthPharmacyKitDeliveryItem` | 0 | 8 | `HealthPharmacyKitDelivery`, `HealthPrescriptionItem`, `Material`, `MaterialStock` | saude |
| `HealthPharmacyKitEvent` | 0 | 6 | `HealthPharmacyKitDelivery` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthPharmacyKitItem` | 0 | 4 | `HealthPharmacyKit`, `Material` | saude |
| `HealthPharmacyLawyer` | 0 | 6 | `Person` | saude |
| `HealthPostpartumVisit` | 0 | 12 | `HealthPregnancy` | saude |
| `HealthPregnancy` | 0 | 21 | `Patient` | saude |
| `HealthPregnancyVisit` | 0 | 13 | `HealthPregnancy` | saude |
| `HealthPrescription` | 0 | 13 | `HealthProfessional`, `HealthUnit`, `MedicalRecord`, `Patient` | saude |
| `HealthPrescriptionItem` | 0 | 14 | `HealthPrescription`, `Medicine` | saude |
| `HealthPrescriptionTemplate` | 0 | 6 | — | saude |
| `HealthProcedurePriceItem` | 0 | 4 | `HealthProcedurePriceTable`, `HealthSusProcedure` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthProcedurePriceTable` | 0 | 11 | `HealthCareAgreement`, `HealthUnit` | saude |
| `HealthProductionCompetence` | 0 | 9 | — | saude |
| `HealthProductionCriticism` | 0 | 8 | `HealthProductionFact` | saude |
| `HealthProductionFact` | 0 | 20 | `HealthProductionCompetence`, `HealthProfessional`, `HealthSusProcedure`, `HealthSusReference`, `HealthUnit`, `Patient` | saude |
| `HealthProductionFactRevision` | 0 | 8 | `HealthProductionFact` | saude |
| `HealthProductionTarget` | 0 | 6 | `HealthProductionCompetence`, `HealthSusProcedure` | saude |
| `HealthProfessional` | 0 | 18 | `Employee`, `HealthCbo`, `HealthTeam`, `HealthUnit` | cadastros, saude |
| `HealthProfessionalAssignment` | 0 | 10 | `HealthProfessional`, `HealthSpecialty`, `HealthUnit` | saude |
| `HealthProfessionalShift` | 0 | 8 | `HealthProfessionalAssignment` | saude |
| `HealthProviderAccess` | 0 | 6 | `Supplier`, `Usuario` | saude |
| `HealthReception` | 0 | 18 | `HealthDestination`, `HealthRoom`, `HealthUnit`, `Patient` | saude |
| `HealthReferral` | 0 | 15 | `HealthProfessional`, `HealthService`, `HealthSpecialty`, `HealthUnit`, `MedicalRecord`, `Patient` | saude |
| `HealthRegistrationStatusHistory` | 0 | 6 | `HealthProfessional`, `HealthUnit` | saude |
| `HealthRegulationAttachment` | 0 | 5 | `Document`, `HealthRegulationRequest` | saude |
| `HealthRegulationEvent` | 0 | 8 | `HealthRegulationRequest` | saude |
| `HealthRegulationQuota` | 0 | 15 | `Covenant`, `HealthService`, `HealthSpecialty`, `HealthSusProcedure`, `HealthUnit`, `Supplier` | saude |
| `HealthRegulationQuotaAllocation` | 0 | 8 | `HealthRegulationQuota` | saude |
| `HealthRegulationRequest` | 0 | 36 | `Document`, `HealthAppointment`, `HealthExamRequest`, `HealthProfessional`, `HealthReferral`, `HealthRegulationQuota`, `HealthRegulationSector`, `HealthService`, `HealthSpecialty`, `HealthSusProcedure`, `HealthSusReference`, `HealthUnit`, `Patient` | transparencia, saude |
| `HealthRegulationReview` | 0 | 9 | `HealthRegulationRequest` | saude |
| `HealthRegulationSector` | 0 | 4 | — | transparencia, saude |
| `HealthRiskProtocol` | 0 | 8 | — | saude |
| `HealthRoom` | 0 | 6 | `HealthUnit` | saude |
| `HealthScheduleBlock` | 0 | 7 | `HealthCareSchedule` | saude |
| `HealthSchedulingGroup` | 0 | 7 | `HealthSpecialtyGroup`, `HealthUnit` | saude |
| `HealthService` | 0 | 7 | — | saude |
| `HealthServiceAssignment` | 0 | 7 | `HealthProfessional`, `HealthService`, `HealthUnit` | saude |
| `HealthSpecialty` | 0 | 6 | — | saude |
| `HealthSpecialtyGroup` | 0 | 5 | — | saude |
| `HealthSpecialtyGroupMember` | 0 | 4 | `HealthSpecialty`, `HealthSpecialtyGroup` | saude |
| `HealthSpecialtyGroupService` | 0 | 4 | `HealthService`, `HealthSpecialtyGroup` | saude |
| `HealthSpecialtyProcedureRule` | 0 | 8 | — | saude |
| `HealthStandardDocument` | 0 | 8 | `Document`, `Usuario` | saude |
| `HealthStockPolicy` | 0 | 8 | `Material`, `Warehouse` | saude |
| `HealthStockReceipt` | 0 | 20 | `Document`, `Supplier`, `Warehouse` | saude |
| `HealthStockReceiptItem` | 0 | 13 | `HealthStockReceipt`, `HealthVaccineManufacturer`, `Material`, `MaterialMovement` | saude |
| `HealthStockTransfer` | 0 | 13 | `Warehouse` | saude |
| `HealthStockTransferItem` | 0 | 13 | `HealthStockTransfer`, `Material`, `MaterialMovement`, `PharmacyRequestItem` | patrimonio, saude |
| `HealthSusFile` | 0 | 15 | `HealthProductionCompetence`, `HealthUnit` | saude |
| `HealthSusImportBatch` | 0 | 17 | `Usuario` | saude |
| `HealthSusImportIssue` | 0 | 6 | `HealthSusImportBatch` | saude |
| `HealthSusProcedure` | 0 | 25 | `HealthSusImportBatch` | saude |
| `HealthSusProcedureReference` | 0 | 5 | `HealthSusProcedure`, `HealthSusReference` | saude |
| `HealthSusReference` | 0 | 12 | `HealthSusImportBatch` | sst, saude |
| `HealthTeam` | 0 | 9 | `HealthUnit` | saude |
| `HealthTeamClassificationEvent` | 0 | 7 | `HealthTeam` | saude |
| `HealthTerritoryArea` | 0 | 8 | `HealthTeam`, `HealthUnit` | saude |
| `HealthTfdBenefit` | 0 | 17 | `HealthTfdRequest`, `Person` | saude |
| `HealthTfdClinicalReport` | 0 | 21 | `HealthProfessional`, `HealthSusProcedure`, `HealthTfdRequest`, `MedicalRecord` | saude |
| `HealthTfdPassenger` | 0 | 12 | `HealthTfdRequest`, `HealthTfdTrip`, `Patient` | saude |
| `HealthTfdPassengerRemoval` | 0 | 6 | `HealthTfdPassenger` | saude |
| `HealthTfdReportRevision` | 0 | 7 | `HealthTfdClinicalReport` | saude |
| `HealthTfdReportSupplement` | 0 | 6 | `HealthTfdClinicalReport` | saude |
| `HealthTfdRequest` | 0 | 14 | `HealthRegulationRequest`, `HealthUnit`, `Patient` | saude |
| `HealthTfdRequestEvent` | 0 | 9 | `HealthTfdRequest` | saude |
| `HealthTfdTrip` | 0 | 21 | `Employee`, `FleetBooking`, `FleetUnit`, `HrPortalRequest` | frotas, saude |
| `HealthTfdTripEvent` | 0 | 8 | `HealthTfdTrip` | saude |
| `HealthTherapySession` | 0 | 13 | `SpecializedTherapeuticPlan` | saude |
| `HealthTreatmentAuthorization` | 0 | 14 | `HealthAuthorizationNumberRange`, `HealthTreatmentReport` | saude |
| `HealthTreatmentReport` | 0 | 28 | `HealthProfessional`, `HealthTreatmentReport`, `HealthUnit`, `MedicalRecord`, `Patient` | saude |
| `HealthTreatmentReportEvent` | 0 | 8 | `HealthTreatmentReport` | saude |
| `HealthTreatmentReportProcedure` | 0 | 6 | `HealthProfessional`, `HealthSusProcedure`, `HealthTreatmentReport` | saude |
| `HealthTreatmentReportRevision` | 0 | 7 | `HealthTreatmentReport` | saude |
| `HealthTriage` | 0 | 18 | `HealthAppointment`, `HealthProfessional` | saude |
| `HealthUnit` | 0 | 17 | `Address`, `Employee`, `HealthMaintainer`, `HealthUnit` | saude, portal-paciente |
| `HealthUnitCeiling` | 0 | 7 | `HealthUnit` | saude |
| `HealthUnitShift` | 0 | 8 | `HealthUnit` | saude |
| `HealthUnitSpecialty` | 0 | 6 | `HealthSpecialty`, `HealthUnit` | saude |
| `HealthUserAccessScope` | 0 | 11 | `HealthUnit`, `Usuario` | saude |
| `HealthVaccinationCampaign` | 0 | 7 | — | saude, portal-paciente |
| `HealthVaccinationCardEvent` | 0 | 19 | `HealthProfessional`, `HealthUnit`, `Patient`, `Vaccine` | saude |
| `HealthVaccineAdverseEvent` | 0 | 13 | `HealthUnit`, `Patient`, `VaccinationRecord`, `Vaccine` | saude |
| `HealthVaccineAdverseFollowup` | 0 | 8 | `HealthProfessional`, `HealthVaccineAdverseEvent` | saude |
| `HealthVaccineCalendarRule` | 0 | 18 | `Vaccine` | saude |
| `HealthVaccineCodeMapping` | 0 | 8 | `Vaccine` | saude |
| `HealthVaccineInteraction` | 0 | 7 | `Vaccine` | saude |
| `HealthVaccineLotProfile` | 0 | 6 | `HealthVaccineManufacturer`, `MaterialStock` | saude |
| `HealthVaccineManufacturer` | 0 | 7 | — | saude |
| `HealthVaccineOpenedVial` | 0 | 14 | `MaterialStock`, `Vaccine` | saude |
| `HealthVigilanceComplaint` | 0 | 9 | `HealthVigilanceEstablishment`, `Person` | saude |
| `HealthVigilanceEstablishment` | 0 | 12 | `Address`, `Company`, `Person` | saude |
| `HealthVigilanceInspection` | 0 | 11 | `HealthProfessional`, `HealthVigilanceComplaint`, `HealthVigilanceEstablishment` | saude |
| `HealthVigilanceInspectionItem` | 0 | 5 | `HealthVigilanceInspection` | SQL/associação/técnica ou uso indireto não atribuído |
| `HealthVigilanceLicense` | 0 | 10 | `Document`, `HealthVigilanceEstablishment` | saude |
| `HealthWaitlist` | 0 | 15 | `HealthAppointment`, `HealthCareSchedule`, `HealthRegulationRequest`, `HealthSpecialty`, `Patient` | saude |
| `HealthWaitlistEvent` | 0 | 9 | `HealthAppointment`, `HealthWaitlist` | saude |
| `HrBudgetUnitEntityMapping` | 0 | 6 | `BudgetUnit`, `GovernmentEntity` | sst, rh (SQL complementar) |
| `HrCalculationPolicy` | 0 | 15 | `HrPayrollRuleSet` | rh |
| `HrConsignmentAgreement` | 0 | 11 | `HrEmploymentContract`, `HrPayrollRun`, `Supplier` | rh, portal-servidor |
| `HrConsignmentEntry` | 0 | 9 | `HrConsignmentInstallment`, `HrMovement` | rh, portal-servidor |
| `HrConsignmentInstallment` | 0 | 5 | `HrConsignmentAgreement` | rh, portal-servidor |
| `HrEmployeeFunctionalPeriod` | 0 | 20 | `AdministrativeUnit`, `BudgetUnit`, `CostCenter`, `Department`, `Employee`, `GovernmentEntity`, `HrEmployeeFunctionalPeriod`, `HrEmploymentRegime`, `Role` | sst, rh (SQL complementar) |
| `HrEmploymentContract` | 0 | 20 | `Employee` | transparencia, financeiro, rh, portal-servidor, controle-interno |
| `HrEmploymentRegime` | 0 | 13 | `HrPayrollRuleSet`, `HrSocialSecurityScheme`, `HrVacationPolicy` | transparencia, rh, portal-servidor, sst |
| `HrEmploymentRevision` | 0 | 8 | `HrEmploymentContract` | rh |
| `HrIntegrationEvent` | 0 | 14 | — | financeiro, rh, portal-servidor, sst |
| `HrMovement` | 0 | 11 | `HrEmploymentContract` | rh, portal-servidor |
| `HrPayrollConfigurationChange` | 0 | 9 | `HrPayrollRuleSet`, `Usuario` | rh |
| `HrPayrollItemOrigin` | 0 | 7 | `PayrollItem` | rh |
| `HrPayrollRubric` | 0 | 17 | `HrPayrollRuleSet` | financeiro, rh, sst |
| `HrPayrollRubricIncidence` | 0 | 6 | `HrPayrollRubric` | rh |
| `HrPayrollRule` | 0 | 15 | `HrPayrollRuleSet` | transparencia, rh, portal-servidor, sst |
| `HrPayrollRuleSet` | 0 | 15 | `ConfiguracaoInstancia` | rh, portal-servidor |
| `HrPayrollRun` | 0 | 16 | `Payroll` | financeiro, rh, portal-servidor |
| `HrPayrollStatement` | 0 | 10 | `HrEmploymentContract`, `HrPayrollRun` | transparencia, financeiro, rh, portal-servidor |
| `HrPortalRequest` | 0 | 11 | — | transparencia, financeiro, rh, portal-servidor, saude |
| `HrPortalRequestBinding` | 0 | 7 | `Employee`, `HrPortalRequest`, `HrPortalServiceConfiguration`, `Process`, `Usuario` | portal-servidor |
| `HrPortalServiceConfiguration` | 0 | 10 | `BudgetUnit`, `HrPayrollRule`, `ProcessType`, `PublicService`, `Subject` | portal-servidor |
| `HrRecruitmentApplication` | 0 | 13 | `HrPayrollRule`, `Usuario` | SQL/associação/técnica ou uso indireto não atribuído |
| `HrRightEntry` | 0 | 11 | `HrEmploymentContract` | financeiro, rh, portal-servidor |
| `HrRoleLegalHistory` | 0 | 21 | `Document`, `DocumentVersion`, `GovernmentEntity`, `HrRoleLegalHistory`, `LegalTextVersion`, `Role`, `Usuario` | rh, controle-interno |
| `HrSocialSecurityBand` | 0 | 9 | `HrSocialSecurityScheme` | rh |
| `HrSocialSecurityScheme` | 0 | 14 | `HrPayrollRuleSet` | rh |
| `HrVacationConcessionSource` | 0 | 9 | `BudgetUnit`, `HrEmployeeFunctionalPeriod`, `Vacation` | sst, rh (SQL complementar) |
| `HrVacationPolicy` | 0 | 21 | `HrPayrollRuleSet` | rh |
| `IndicatorPPA` | 0 | 6 | `ObjectivePPA` | financeiro, planejamento |
| `InformationRequest` | 0 | 11 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `Infraction` | 0 | 9 | `Taxpayer` | tributacao |
| `Institution` | 0 | 16 | — | administracao, portal-cidadao, tributacao, financeiro, rh, sst, frotas, saude, social |
| `InstrumentInstallment` | 0 | 14 | `Contract`, `Covenant`, `Payment` | compras |
| `InstrumentMeasurement` | 0 | 15 | `Contract`, `Covenant`, `Document` | financeiro, compras |
| `InstrumentMeasurementItem` | 0 | 11 | `InstrumentMeasurement`, `PurchaseProcessItem`, `PurchaseReceiptItem` | compras |
| `InstrumentParty` | 0 | 15 | `Company`, `Contract`, `Covenant`, `Employee`, `InstrumentResponsibilityGroup`, `Person`, `Supplier` | compras |
| `InstrumentResponsibilityGroup` | 0 | 8 | `Contract`, `Covenant` | compras |
| `IntegrationConnection` | 0 | 16 | — | rh, saude, configuracoes |
| `IntegrationRun` | 0 | 9 | `IntegrationConnection` | financeiro, saude |
| `InternalControlEvent` | 0 | 8 | `InternalControlPlan` | controle-interno |
| `InternalControlFinding` | 0 | 11 | `InternalControlPlan` | controle-interno |
| `InternalControlPlan` | 0 | 9 | `BudgetUnit` | controle-interno |
| `InternalDemand` | 0 | 12 | `Department`, `Employee`, `Secretariat` | administracao |
| `InventorySession` | 0 | 13 | `Usuario`, `Warehouse` | patrimonio, saude |
| `InventorySessionItem` | 0 | 12 | `InventorySession`, `MaterialMovement`, `MaterialStock` | patrimonio, saude |
| `InvestmentAllocation` | 0 | 8 | `BankAccount`, `TreasuryTransfer` | financeiro |
| `Invoice` | 0 | 16 | `Taxpayer` | tributacao |
| `ItbiDeclaration` | 0 | 29 | `ItbiTransactionType` | tributacao |
| `ItbiEvent` | 0 | 7 | `ItbiDeclaration` | tributacao |
| `ItbiParty` | 0 | 8 | `ItbiDeclaration` | tributacao |
| `ItbiTransactionType` | 0 | 11 | — | portal-cidadao, tributacao |
| `Lead` | 0 | 13 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `LearningActivity` | 0 | 13 | `SchoolClass`, `SchoolSubject`, `Teacher` | educacao |
| `LearningQuestion` | 0 | 9 | `LearningActivity` | SQL/associação/técnica ou uso indireto não atribuído |
| `LearningSubmission` | 0 | 12 | `LearningActivity`, `Student` | educacao |
| `Leave` | 0 | 9 | `Employee` | rh, portal-servidor, sst |
| `LegalReportSigner` | 0 | 12 | `Employee`, `GovernmentEntity`, `Person` | cadastros |
| `LegalRepresentative` | 0 | 12 | `Company`, `Person` | SQL/associação/técnica ou uso indireto não atribuído |
| `LegalText` | 0 | 13 | `GovernmentEntity` | cadastros, transparencia |
| `LegalTextRelation` | 0 | 7 | `LegalText` | SQL/associação/técnica ou uso indireto não atribuído |
| `LegalTextVersion` | 0 | 12 | `Document`, `LegalText` | cadastros, rh |
| `License` | 0 | 10 | `EconomicRegistration`, `Taxpayer` | portal-cidadao, tributacao |
| `MasterDataConsistencyIssue` | 0 | 13 | `MasterDataConsistencyRun` | cadastros |
| `MasterDataConsistencyRun` | 0 | 8 | — | cadastros |
| `Material` | 0 | 15 | `CatalogItem`, `MaterialCategory`, `MaterialSubcategory` | cadastros, financeiro, compras, sst, patrimonio, educacao, saude |
| `MaterialCategory` | 0 | 6 | — | financeiro, compras, patrimonio, saude |
| `MaterialMovement` | 0 | 26 | `Department`, `Employee`, `InventorySession`, `Material`, `MaterialMovement`, `MaterialRequestItem`, `MaterialStock`, `ObrasServico`, `Settlement`, `Supplier`, `Usuario`, `Warehouse` | portal-cidadao, transparencia, financeiro, compras, patrimonio, frotas, saude, obras |
| `MaterialRequest` | 0 | 15 | `Department`, `Employee`, `Warehouse` | compras, patrimonio |
| `MaterialRequestItem` | 0 | 8 | `Material`, `MaterialRequest` | compras |
| `MaterialStock` | 0 | 13 | `Material`, `Warehouse` | transparencia, financeiro, compras, sst, patrimonio, frotas, saude, obras |
| `MaterialStockValuation` | 0 | 16 | `AccountingPlan`, `BudgetUnit`, `GovernmentEntity`, `MaterialStock`, `Usuario` | patrimonio |
| `MaterialStockValuationEvent` | 0 | 14 | `MaterialMovement`, `MaterialStockValuation` | financeiro, patrimonio |
| `MaterialSubcategory` | 0 | 7 | `MaterialCategory` | financeiro, patrimonio |
| `MedicalRecord` | 0 | 26 | `HealthAppointment`, `HealthProfessional`, `HealthUnit`, `Patient` | saude |
| `Medicine` | 0 | 12 | `Material` | sst, saude |
| `MedicineBatch` | 0 | 7 | `Medicine` | SQL/associação/técnica ou uso indireto não atribuído |
| `MedicineDispensation` | 0 | 30 | `HealthPharmacyJudicialItem`, `HealthPharmacyKitDeliveryItem`, `HealthPrescriptionItem`, `HealthProfessional`, `HealthUnit`, `MaterialMovement`, `MaterialStock`, `Medicine`, `MedicineBatch`, `Patient`, `Person`, `SpecializedTherapeuticPlan`, `Warehouse` | saude |
| `MedicineDosageTemplate` | 0 | 11 | `Medicine` | saude |
| `MedicineInteraction` | 0 | 9 | `Medicine` | saude |
| `MonthlyAccountingClose` | 0 | 10 | `Employee`, `FinancialYear`, `Usuario` | financeiro, planejamento |
| `MonthlyAccountingCloseEvent` | 0 | 11 | `MonthlyAccountingClose`, `Usuario` | financeiro |
| `MonthlyDisbursementSchedule` | 0 | 5 | `AnnualBudgetLaw` | financeiro |
| `MultiYearPlan` | 0 | 24 | `Document`, `Usuario` | financeiro, planejamento |
| `MunicipalCostAllocation` | 0 | 5 | `MunicipalCostItem`, `MunicipalCostMovement`, `MunicipalCostObject` | financeiro |
| `MunicipalCostItem` | 0 | 9 | `FinancialYear` | financeiro |
| `MunicipalCostMovement` | 0 | 10 | `MunicipalCostMovement`, `MunicipalCostSource` | financeiro |
| `MunicipalCostObject` | 0 | 11 | `BudgetUnit`, `FinancialYear`, `MunicipalCostObject` | financeiro |
| `MunicipalCostObjectItem` | 0 | 5 | `MunicipalCostItem`, `MunicipalCostObject`, `MunicipalCostObjectItem` | financeiro |
| `MunicipalCostPolicy` | 0 | 8 | `GovernmentEntity` | financeiro |
| `MunicipalCostRule` | 0 | 15 | `BudgetUnit`, `FinancialYear` | financeiro |
| `MunicipalCostSource` | 0 | 10 | `BudgetUnit`, `FinancialYear` | financeiro |
| `MunicipalCostSourceReduction` | 0 | 9 | `MunicipalCostSource` | financeiro |
| `MunicipalFiscalIndexDefinition` | 0 | 11 | `FinancialYear` | financeiro |
| `MunicipalPersonnelFiscalDefinition` | 0 | 12 | `FinancialYear`, `Usuario` | financeiro |
| `Neighborhood` | 0 | 11 | `City` | cadastros, tributacao, rh, saude |
| `NfseCorrectionLetter` | 0 | 7 | — | tributacao |
| `NfseCredentialEvent` | 0 | 6 | `NfseCredentialRequest` | SQL/associação/técnica ou uso indireto não atribuído |
| `NfseCredentialRequest` | 0 | 15 | — | tributacao |
| `NfseDeductionConsumption` | 0 | 5 | `NfseDeductionCredit` | tributacao |
| `NfseDeductionCredit` | 0 | 13 | — | tributacao |
| `NfseDmsDeclaration` | 0 | 19 | — | tributacao |
| `NfseEvent` | 0 | 7 | — | tributacao |
| `NfseInvoiceData` | 0 | 22 | — | tributacao |
| `NfseOccasionalRequest` | 0 | 20 | — | tributacao |
| `NfseRpsBatch` | 0 | 15 | — | tributacao |
| `NfseRpsItem` | 0 | 10 | `NfseRpsBatch` | tributacao |
| `ObjectivePPA` | 0 | 5 | `ProgramPPA` | financeiro, planejamento |
| `ObrasEquipe` | 0 | 7 | `Department` | protocolos, portal-cidadao, obras |
| `ObrasEquipeMembro` | 0 | 7 | `Employee`, `ObrasEquipe` | SQL/associação/técnica ou uso indireto não atribuído |
| `ObrasMedicao` | 0 | 9 | `ObrasObra` | obras |
| `ObrasObra` | 0 | 11 | — | transparencia, obras |
| `ObrasServico` | 0 | 16 | `Asset`, `BudgetAppropriation`, `Commitment`, `Department` | portal-cidadao, financeiro, obras, iluminacao-publica |
| `ObrasServicoCompra` | 0 | 6 | `ObrasServico`, `PurchaseProcess`, `PurchaseRequest` | obras |
| `ObrasServicoDocumento` | 0 | 5 | `Document`, `ObrasServico` | obras |
| `ObrasServicoEmployee` | 0 | 6 | `Employee`, `ObrasServico` | portal-cidadao, obras |
| `ObrasServicoEquipamento` | 0 | 6 | `Asset`, `ObrasServico` | portal-cidadao, obras |
| `ObrasServicoEquipe` | 0 | 5 | `ObrasEquipe`, `ObrasServico` | portal-cidadao, obras |
| `ObrasServicoMaterial` | 0 | 9 | `Material`, `MaterialStock`, `ObrasServico` | obras |
| `OfficialDiary` | 0 | 8 | `Employee` | portal-cidadao, transparencia |
| `OfficialPublication` | 0 | 11 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `Ombudsman` | 0 | 20 | `Department`, `Employee`, `Person`, `Process`, `SupportChannel` | protocolos, atendimento, transparencia, saude, controle-interno |
| `OmbudsmanAccess` | 0 | 6 | `Ombudsman`, `Usuario` | atendimento |
| `OmbudsmanAuditLog` | 0 | 7 | `Employee`, `Ombudsman`, `Usuario` | atendimento, saude |
| `OmbudsmanDocument` | 0 | 6 | `Document`, `Employee`, `Ombudsman` | SQL/associação/técnica ou uso indireto não atribuído |
| `OmbudsmanIdentity` | 0 | 4 | `Ombudsman`, `Person` | saude |
| `OmbudsmanInteraction` | 0 | 7 | `Employee`, `Ombudsman` | atendimento |
| `OmbudsmanMovement` | 0 | 7 | `Department`, `Employee`, `Ombudsman` | atendimento |
| `Patient` | 0 | 13 | `HealthTeam`, `HealthUnit`, `Person`, `Usuario` | saude, portal-paciente |
| `PayableCarryForward` | 0 | 14 | `Commitment`, `FinancialYear`, `PayableCarryForward` | transparencia, financeiro |
| `PayableCarryForwardEvent` | 0 | 9 | `PayableCarryForward`, `Payment`, `Settlement`, `Usuario` | financeiro |
| `PayableCarryForwardSettlementLink` | 0 | 9 | `FinancialAuditLog`, `FinancialYear`, `PayableCarryForward`, `Settlement` | financeiro |
| `Payment` | 0 | 30 | `BankAccount`, `Commitment`, `Creditor`, `FinancialYear`, `PayableCarryForward`, `Settlement`, `Supplier` | transparencia, financeiro, planejamento, rh, portal-servidor, frotas |
| `PaymentRetention` | 0 | 10 | `Payment`, `RetentionRule`, `SettlementRetention` | financeiro |
| `Payroll` | 0 | 8 | — | rh, portal-servidor, sst |
| `PayrollBenefit` | 0 | 7 | `BenefitConfig`, `Employee` | rh, portal-servidor, sst |
| `PayrollEvent` | 0 | 8 | — | rh, sst |
| `PayrollItem` | 0 | 9 | `Employee`, `Payroll`, `PayrollEvent` | rh, portal-servidor, sst |
| `PedagogicalAttempt` | 0 | 9 | `PedagogicalRelease`, `Student` | educacao |
| `PedagogicalCatalogItem` | 0 | 12 | `SchoolSubject` | educacao |
| `PedagogicalRelease` | 0 | 8 | `PedagogicalCatalogItem`, `SchoolClass`, `Student`, `Teacher` | educacao |
| `Person` | 0 | 28 | — | cadastros, protocolos, atendimento, portal-cidadao, tributacao, compras, rh, sst, frotas, educacao, saude, portal-paciente, social, obras, cultura, configuracoes |
| `PersonMergeLedger` | 0 | 8 | `Person`, `PersonMergeRequest`, `Usuario` | cadastros |
| `PersonMergeRequest` | 0 | 12 | `Person`, `Usuario` | cadastros, configuracoes |
| `PersonnelAct` | 0 | 8 | `Employee` | rh, portal-servidor |
| `PharmacyRequest` | 0 | 12 | `Patient`, `Warehouse` | saude |
| `PharmacyRequestEvent` | 0 | 6 | `PharmacyRequest` | saude |
| `PharmacyRequestFulfillment` | 0 | 12 | `HealthStockTransferItem`, `MaterialMovement`, `MedicineDispensation`, `Person`, `PharmacyRequestItem` | saude |
| `PharmacyRequestItem` | 0 | 6 | `Material`, `PharmacyRequest` | saude |
| `PlanningAmendment` | 0 | 9 | — | financeiro |
| `PlanningAmendmentItem` | 0 | 5 | `PlanningBudgetLine`, `PlanningLegislativeAmendment` | planejamento |
| `PlanningAnnualProgram` | 0 | 5 | `PlanningInstrument`, `ProgramPPA` | planejamento |
| `PlanningBudgetLine` | 0 | 31 | `ActionPPA`, `BudgetAppropriation`, `BudgetUnit`, `ExpenseNature`, `GovernmentEntity`, `PlanningInstrument`, `ProgramPPA`, `ResourceSource`, `RevenueNature` | transparencia, financeiro, planejamento |
| `PlanningCalculationMemory` | 0 | 13 | `PlanningInstrument` | planejamento |
| `PlanningCatalogEntry` | 0 | 9 | `PlanningCatalogVersion` | financeiro, planejamento |
| `PlanningCatalogVersion` | 0 | 8 | — | tributacao, financeiro, planejamento |
| `PlanningCommunityDemand` | 0 | 11 | `BudgetUnit`, `PlanningHearing` | planejamento |
| `PlanningCreditBatch` | 0 | 11 | `CreditRequest`, `PlanningInstrument` | financeiro, planejamento |
| `PlanningCreditLine` | 0 | 5 | `PlanningBudgetLine`, `PlanningCreditBatch` | planejamento |
| `PlanningDocumentLink` | 0 | 9 | `Document`, `DocumentVersion`, `PlanningHearing`, `PlanningInstrument` | planejamento |
| `PlanningEntityScope` | 0 | 4 | `GovernmentEntity` | planejamento |
| `PlanningEntityUnit` | 0 | 2 | `BudgetUnit`, `GovernmentEntity` | protocolos, transparencia, tributacao, financeiro, planejamento, rh, patrimonio, controle-interno |
| `PlanningFiscalRule` | 0 | 7 | `PlanningInstrument` | planejamento |
| `PlanningHearing` | 0 | 8 | `PlanningInstrument` | planejamento |
| `PlanningImportBatch` | 0 | 14 | `PlanningInstrument` | planejamento |
| `PlanningInstrument` | 0 | 23 | `AnnualBudgetLaw`, `BudgetGuideline`, `GovernmentEntity`, `MultiYearPlan`, `PlanningCatalogVersion`, `PlanningInstrument` | financeiro, planejamento |
| `PlanningInstrumentSource` | 0 | 5 | `PlanningCatalogEntry`, `PlanningInstrument`, `ResourceSource` | planejamento |
| `PlanningIntegrationCommand` | 0 | 7 | — | planejamento |
| `PlanningLegislativeAmendment` | 0 | 18 | `CamVereador`, `PlanningInstrument` | planejamento |
| `PlanningLegislativeLink` | 0 | 7 | `CamLei`, `CamProposicao`, `PlanningInstrument` | planejamento |
| `PlanningLineMovement` | 0 | 10 | `PlanningBudgetLine` | financeiro, planejamento |
| `PlanningPhysicalEvent` | 0 | 9 | `PlanningBudgetLine` | planejamento |
| `PlanningPlannedWork` | 0 | 13 | `PlanningInstrument` | planejamento |
| `PlanningPublicationEvent` | 0 | 6 | `PlanningReportPublication` | planejamento |
| `PlanningQuota` | 0 | 13 | `PlanningBudgetLine` | planejamento |
| `PlanningQuotaEvent` | 0 | 10 | `PlanningQuota`, `PlanningQuotaEvent` | planejamento |
| `PlanningReportPublication` | 0 | 21 | `PlanningReportSnapshot` | planejamento |
| `PlanningReportSnapshot` | 0 | 9 | `PlanningInstrument` | planejamento |
| `PlanningRevenueAllocation` | 0 | 4 | `ResourceSource`, `RevenueNature` | planejamento |
| `PlanningRevenueWaiver` | 0 | 16 | `PlanningInstrument`, `Tax` | planejamento |
| `PlanningVersion` | 0 | 10 | `PlanningInstrument` | planejamento |
| `PortalBanner` | 0 | 11 | — | portal-cidadao, transparencia |
| `PortalMenu` | 0 | 8 | `PortalMenu` | SQL/associação/técnica ou uso indireto não atribuído |
| `PortalNews` | 0 | 12 | `Employee`, `Secretariat` | portal-cidadao, transparencia |
| `PortalPage` | 0 | 8 | `Employee` | portal-cidadao, transparencia |
| `PortalScheduleRequest` | 0 | 3 | `PortalServiceRequest`, `PortalServiceSchedule` | portal-cidadao |
| `PortalServiceConfiguration` | 0 | 14 | `PublicService` | protocolos, portal-cidadao |
| `PortalServiceFavorite` | 0 | 4 | `PublicService` | SQL/associação/técnica ou uso indireto não atribuído |
| `PortalServiceNotice` | 0 | 10 | — | protocolos |
| `PortalServiceRating` | 0 | 8 | `PortalServiceRequest` | portal-cidadao |
| `PortalServiceRequest` | 0 | 18 | `ObrasServico`, `PortalServiceConfiguration`, `Process`, `Usuario` | protocolos, portal-cidadao |
| `PortalServiceRequestEvent` | 0 | 10 | `DocumentVersion`, `PortalServiceRequest` | portal-cidadao |
| `PortalServiceSchedule` | 0 | 16 | `Asset`, `Employee`, `ObrasEquipe` | portal-cidadao |
| `PortalServiceUpload` | 0 | 12 | `Document`, `DocumentVersion`, `PortalServiceRequest` | portal-cidadao |
| `PortalServiceVersion` | 0 | 6 | `PortalServiceConfiguration` | portal-cidadao |
| `PreEnrollment` | 0 | 17 | `PreEnrollmentProcess`, `School`, `Student` | transparencia, educacao |
| `PreEnrollmentProcess` | 0 | 13 | `School` | transparencia, educacao |
| `PreliminaryTechnicalStudy` | 0 | 8 | `PurchaseProcess` | SQL/associação/técnica ou uso indireto não atribuído |
| `PriceQuote` | 0 | 8 | `PriceResearch`, `Supplier` | compras |
| `PriceResearch` | 0 | 7 | `PurchaseProcess` | compras |
| `Process` | 0 | 22 | `Company`, `Department`, `Employee`, `Person`, `ProcessType`, `ProcessWorkflowStage`, `Subject` | protocolos, documentos, portal-cidadao, transparencia, tributacao, financeiro, rh, portal-servidor, sst, saude, obras |
| `ProcessCitizenAccess` | 0 | 8 | `Process`, `Usuario` | protocolos, portal-cidadao, tributacao |
| `ProcessDispatch` | 0 | 8 | `Department`, `Employee`, `Process` | protocolos |
| `ProcessDocument` | 0 | 9 | `Document`, `Employee`, `Process` | protocolos, documentos, portal-cidadao, tributacao, portal-servidor, obras |
| `ProcessEvent` | 0 | 10 | `Department`, `Employee`, `Process` | protocolos, documentos, financeiro, portal-servidor, obras |
| `ProcessJudicialCase` | 0 | 11 | `BudgetUnit`, `GovernmentEntity`, `Process` | protocolos, controle-interno |
| `ProcessJudicialCaseEvent` | 0 | 13 | `DocumentVersion`, `ProcessJudicialCase`, `Usuario` | protocolos |
| `ProcessMovement` | 0 | 13 | `Department`, `Employee`, `Process` | protocolos |
| `ProcessSequence` | 0 | 3 | — | protocolos, portal-cidadao, obras |
| `ProcessType` | 0 | 12 | `Department` | protocolos, atendimento, portal-cidadao, rh, configuracoes |
| `ProcessWorkflowStage` | 0 | 10 | `Department`, `ProcessType`, `Subject` | protocolos, portal-cidadao, obras, configuracoes |
| `ProcurementLifecycleEvent` | 0 | 9 | `Usuario` | financeiro, compras |
| `ProgramPPA` | 0 | 12 | `MultiYearPlan` | financeiro, planejamento |
| `PropertyValuation` | 0 | 10 | `RealEstate` | tributacao |
| `ProtocolNotification` | 0 | 13 | `Process`, `Usuario` | obras |
| `PublicityCampaign` | 0 | 10 | — | financeiro |
| `PublicNotice` | 0 | 8 | `Usuario` | protocolos, transparencia |
| `PublicService` | 0 | 12 | — | portal-cidadao, rh, portal-servidor |
| `PurchasePlanning` | 0 | 12 | `CatalogItem`, `PurchaseRequest` | compras |
| `PurchaseProcess` | 0 | 11 | `PurchaseRequest`, `Secretariat` | transparencia, compras, frotas, obras |
| `PurchaseProcessItem` | 0 | 9 | `CatalogItem`, `Material`, `PurchaseProcess` | compras, frotas |
| `PurchaseProcessItemOrigin` | 0 | 6 | `PurchaseProcessItem`, `PurchaseRequestItem` | compras |
| `PurchaseProcessRequestOrigin` | 0 | 5 | `PurchaseProcess`, `PurchaseRequest` | compras |
| `PurchaseReceipt` | 0 | 14 | `Contract`, `Document`, `Employee`, `PurchaseProcess` | transparencia, financeiro, compras |
| `PurchaseReceiptItem` | 0 | 16 | `Material`, `MaterialMovement`, `PurchaseProcessItem`, `PurchaseReceipt`, `Warehouse` | financeiro, compras, patrimonio |
| `PurchaseRequest` | 0 | 14 | `Department`, `Employee`, `Secretariat` | compras, saude, obras |
| `PurchaseRequestItem` | 0 | 9 | `CatalogItem`, `Material`, `PurchaseRequest` | compras |
| `PurchaseRequestItemBudgetAllocation` | 0 | 7 | `BudgetAppropriation`, `PurchaseRequestItem` | compras |
| `RealEstate` | 0 | 19 | `Neighborhood`, `Street`, `Taxpayer` | cadastros, portal-cidadao, tributacao, educacao, social, obras, cultura |
| `ReportTemplate` | 0 | 10 | — | financeiro, sst, frotas, saude, configuracoes |
| `ResourceSource` | 0 | 10 | — | tributacao, financeiro, planejamento, patrimonio |
| `RetentionRule` | 0 | 16 | `FinancialYear` | financeiro |
| `Revenue` | 0 | 28 | `BankAccount`, `BudgetUnit`, `FinancialYear`, `ResourceSource`, `RevenueNature`, `Secretariat` | transparencia, financeiro, planejamento, rh |
| `RevenueNature` | 0 | 8 | — | tributacao, financeiro, planejamento, patrimonio |
| `RevenueResourceRedistribution` | 0 | 10 | `FinancialYear`, `ResourceSource`, `Revenue` | financeiro, planejamento |
| `RevenueReversal` | 0 | 8 | `FinancialYear`, `Revenue`, `TreasuryMovement` | financeiro |
| `Role` | 0 | 8 | — | administracao, transparencia, rh, sst, controle-interno |
| `SanConsumerUnit` | 0 | 9 | — | saneamento |
| `SanInvoice` | 0 | 9 | `SanConsumerUnit` | saneamento |
| `SanMeterReading` | 0 | 12 | `SanConsumerUnit`, `SanWaterMeter` | saneamento |
| `SanPortalRequest` | 0 | 9 | — | saneamento |
| `SanSavedReport` | 0 | 8 | — | saneamento |
| `SanServiceOrder` | 0 | 10 | `SanConsumerUnit` | saneamento |
| `SanWaterMeter` | 0 | 7 | `SanConsumerUnit` | SQL/associação/técnica ou uso indireto não atribuído |
| `SanWaterQualityAnalysis` | 0 | 10 | — | saneamento |
| `SatisfactionSurvey` | 0 | 5 | `Ticket` | SQL/associação/técnica ou uso indireto não atribuído |
| `School` | 0 | 13 | `Address`, `Employee`, `RealEstate` | educacao |
| `SchoolBus` | 0 | 8 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `SchoolCalendarEvent` | 0 | 9 | `AcademicPeriod` | educacao |
| `SchoolClass` | 0 | 21 | `AcademicPeriod`, `CurriculumMatrix`, `School`, `Teacher` | educacao |
| `SchoolMeal` | 0 | 10 | `School`, `Warehouse` | educacao |
| `SchoolShift` | 0 | 10 | `School` | SQL/associação/técnica ou uso indireto não atribuído |
| `SchoolSubject` | 0 | 7 | — | educacao |
| `Secretariat` | 0 | 7 | — | administracao, cadastros, compras, rh, educacao, social |
| `SegurancaGuarda` | 0 | 10 | `Employee` | seguranca |
| `SegurancaInfracao` | 0 | 11 | — | seguranca |
| `SegurancaMobilidadeRegistro` | 0 | 23 | `Asset`, `Document`, `ObrasServico` | seguranca |
| `SegurancaOcorrencia` | 0 | 12 | `SegurancaGuarda` | seguranca |
| `SequenceCounter` | 0 | 5 | — | compras, patrimonio |
| `ServiceSubject` | 0 | 9 | `Department` | atendimento |
| `Settlement` | 0 | 18 | `Commitment`, `Document`, `Employee`, `FinancialYear`, `PayableCarryForward` | transparencia, financeiro, compras, rh, patrimonio |
| `SettlementRetention` | 0 | 12 | `RetentionRule`, `Settlement` | SQL/associação/técnica ou uso indireto não atribuído |
| `SimplesDivergence` | 0 | 17 | — | tributacao |
| `SimplesExclusionCase` | 0 | 14 | — | tributacao |
| `SimplesFiscalRecord` | 0 | 18 | `SimplesImportBatch` | tributacao |
| `SimplesImportBatch` | 0 | 15 | — | tributacao |
| `SimplesOptionPeriod` | 0 | 9 | — | tributacao |
| `SimplesPaymentAllocation` | 0 | 11 | `SimplesImportBatch` | tributacao |
| `SimplesRegularizationEvent` | 0 | 7 | `SimplesDivergence` | SQL/associação/técnica ou uso indireto não atribuído |
| `SocialAttendance` | 0 | 14 | `Employee`, `Person`, `SocialFamily`, `SocialUnit` | social |
| `SocialBenefit` | 0 | 12 | — | social |
| `SocialBenefitConcession` | 0 | 11 | `Employee`, `Person`, `SocialBenefit`, `SocialFamily` | social |
| `SocialBenefitQuota` | 0 | 8 | `SocialBenefit`, `SocialUnit` | social |
| `SocialBenefitRequest` | 0 | 9 | `SocialFamily`, `SocialUnit` | social |
| `SocialBenefitRequestItem` | 0 | 16 | `SocialBenefit`, `SocialBenefitRequest` | social |
| `SocialBenefitStock` | 0 | 5 | `SocialBenefit`, `SocialUnit` | social |
| `SocialBenefitStockMovement` | 0 | 12 | `SocialBenefit` | social |
| `SocialCatalogEntry` | 0 | 8 | — | social |
| `SocialFamily` | 0 | 12 | `Address`, `Family`, `Person` | cadastros, saude, social |
| `SocialFamilyMember` | 0 | 7 | `Person`, `SocialFamily` | saude |
| `SocialFinancialEntry` | 0 | 14 | `Person`, `SocialCatalogEntry`, `SocialUnit` | social |
| `SocialMinimumWage` | 0 | 5 | — | social |
| `SocialNetworkOrganization` | 0 | 11 | — | social |
| `SocialPersonFact` | 0 | 13 | `Person`, `SocialCatalogEntry`, `SocialUnit` | social |
| `SocialPersonProfile` | 0 | 12 | `Person` | social |
| `SocialProfessionalLink` | 0 | 16 | `Employee`, `SocialUnit` | social |
| `SocialProgram` | 0 | 7 | — | social |
| `SocialProgramParticipation` | 0 | 8 | `SocialFamily`, `SocialProgram` | SQL/associação/técnica ou uso indireto não atribuído |
| `SocialRecord` | 0 | 7 | `SocialFamily`, `SocialUnit` | SQL/associação/técnica ou uso indireto não atribuído |
| `SocialReferral` | 0 | 19 | `Person`, `SocialCatalogEntry`, `SocialFamily`, `SocialNetworkOrganization`, `SocialUnit` | social |
| `SocialUnit` | 0 | 18 | `Address`, `Employee`, `RealEstate` | social |
| `SocialVisit` | 0 | 11 | `Employee`, `SocialFamily`, `SocialUnit` | social |
| `SpecializedCatalogItem` | 0 | 9 | `Material` | saude |
| `SpecializedDistribution` | 0 | 13 | `Material`, `MaterialMovement`, `MaterialStock`, `Patient`, `SpecializedQuota`, `SpecializedTherapeuticPlan`, `Warehouse` | saude |
| `SpecializedPlanEntry` | 0 | 13 | `HealthProfessional`, `HealthService`, `HealthSpecialty`, `MedicalRecord`, `SpecializedTherapeuticPlan` | saude |
| `SpecializedQuota` | 0 | 8 | `Material`, `Patient` | saude |
| `SpecializedTeamSchedule` | 0 | 7 | `HealthTeam`, `HealthUnit` | saude |
| `SpecializedTherapeuticPlan` | 0 | 16 | `HealthTeam`, `HealthUnit`, `MedicalRecord`, `Patient` | saude |
| `SstAccessGrant` | 0 | 8 | `BudgetUnit`, `Usuario` | sst |
| `SstAnamnesis` | 0 | 11 | `SstAso`, `SstQuestionnaireVersion` | sst |
| `SstAppointment` | 0 | 12 | `Employee`, `SstScheduleAvailability` | portal-servidor, sst |
| `SstAso` | 0 | 19 | `BudgetUnit`, `Employee`, `Person`, `SstProgramExposureGroup` | sst |
| `SstAsoCorrection` | 0 | 8 | `SstAso` | sst, rh (SQL complementar) |
| `SstAsoDocument` | 0 | 8 | `Document`, `SstAso`, `SstOccupationalExam` | sst, rh (SQL complementar) |
| `SstAsoFlowSettings` | 0 | 5 | `BudgetUnit` | sst, rh (SQL complementar) |
| `SstAsoFlowSource` | 0 | 4 | `HrEmployeeFunctionalPeriod`, `SstAnamnesis`, `SstAso`, `SstProfessionalRole` | sst, rh (SQL complementar) |
| `SstBenefitBeneficiary` | 0 | 14 | `Dependent`, `PayrollBenefit`, `SstHealthPlan` | sst |
| `SstBenefitCancellation` | 0 | 6 | `SstBenefitEntry` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstBenefitEntry` | 0 | 12 | `SstBenefitBeneficiary`, `SstBenefitEntry` | portal-servidor, sst |
| `SstBenefitPayrollMapping` | 0 | 13 | `HrPayrollRubric`, `PayrollEvent`, `SstHealthPlan` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstBenefitPayrollOrigin` | 0 | 9 | `HrEmployeeFunctionalPeriod`, `HrPayrollRubric`, `PayrollItem`, `SstBenefitEntry`, `SstBenefitPayrollMapping` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstBenefitPayrollScope` | 0 | 6 | `BudgetUnit`, `GovernmentEntity`, `Payroll` | rh, portal-servidor |
| `SstCat` | 0 | 12 | `BudgetUnit`, `Employee`, `Usuario` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstCatEvidence` | 0 | 13 | `Person`, `SstCat`, `SstProfessionalRole`, `Usuario` | sst, rh (SQL complementar) |
| `SstCatLayoutMedical` | 0 | 4 | `SstCatEvidence`, `SstCatLayoutVersion`, `Usuario` | sst, rh (SQL complementar) |
| `SstCatLayoutVersion` | 0 | 14 | `SstCat`, `Usuario` | sst, rh (SQL complementar) |
| `SstCatLedger` | 0 | 10 | `SstCat`, `SstCatLedger`, `Usuario` | sst, rh (SQL complementar) |
| `SstCertificateDecisionRevision` | 0 | 13 | `Leave`, `Person`, `SstMedicalCertificate` | sst, rh (SQL complementar) |
| `SstCertificateDocument` | 0 | 5 | `Document`, `SstMedicalCertificate` | sst |
| `SstCertificateFunctionalSource` | 0 | 4 | `HrEmployeeFunctionalPeriod`, `SstMedicalCertificate`, `SstReasonRegimePolicy` | sst, rh (SQL complementar) |
| `SstCertificateLeaveConfirmation` | 0 | 5 | `SstMedicalCertificate` | sst, rh (SQL complementar) |
| `SstCertificateReason` | 0 | 15 | `BudgetUnit` | sst |
| `SstClinicalRecord` | 0 | 20 | `BudgetUnit`, `Person`, `SstProfessionalRole`, `SstQuestionnaireVersion` | sst |
| `SstClosureEmission` | 0 | 10 | `BudgetUnit`, `Employee` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstDisciplineGrant` | 0 | 7 | `BudgetUnit`, `Usuario` | sst |
| `SstElectionBallot` | 0 | 3 | `SstElectionCandidate`, `SstPreventionRecord` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstElectionCandidate` | 0 | 4 | `Employee`, `SstElectionElector`, `SstPreventionRecord` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstElectionElector` | 0 | 3 | `Employee`, `Person`, `SstPreventionRecord` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstElectionTurnout` | 0 | 2 | `SstElectionElector` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEquipment` | 0 | 13 | `BudgetUnit`, `Material`, `Supplier` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEquipmentDelivery` | 0 | 11 | `BudgetUnit` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEquipmentDeliveryItem` | 0 | 10 | `Employee`, `MaterialMovement`, `SstEquipment`, `SstEquipmentDelivery` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEquipmentEvent` | 0 | 12 | `Person`, `SstEquipmentDeliveryItem` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEquipmentPolicy` | 0 | 4 | `BudgetUnit` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEquipmentRequirement` | 0 | 7 | `SstEquipment`, `SstProgramExposureGroup` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEsocialAttempt` | 0 | 8 | `SstEsocialEvent` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEsocialConfiguration` | 0 | 12 | `BudgetUnit` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEsocialEvent` | 0 | 17 | `BudgetUnit`, `Employee`, `SstEsocialConfiguration` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstEsocialEvidence` | 0 | 20 | `SstEsocialEvent` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstExposureGroup` | 0 | 12 | `BudgetUnit` | sst |
| `SstFoundationalRevocation` | 0 | 6 | `SstServiceOrder`, `SstTechnicalResponsibility` | sst, rh (SQL complementar) |
| `SstHealthPlan` | 0 | 15 | `BenefitConfig`, `BudgetUnit`, `Company`, `HrPayrollRubric`, `PayrollEvent`, `Supplier` | sst |
| `SstLeavePayrollOrigin` | 0 | 23 | `BudgetUnit`, `Employee`, `GovernmentEntity`, `HrEmployeeFunctionalPeriod`, `HrPayrollRubric`, `Leave`, `Payroll`, `PayrollItem`, `SstCertificateDecisionRevision`, `SstLeavePayrollOrigin`, `SstLeavePayrollRuleVersion`, `SstMedicalAssessment`, `SstMedicalCertificate` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstLeavePayrollRuleVersion` | 0 | 7 | `HrPayrollRule`, `HrPayrollRuleSet` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstLeavePayrollScopeEvidence` | 0 | 6 | `SstBenefitPayrollScope`, `SstMedicalCertificate` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstMedicalAssessment` | 0 | 10 | `Person`, `SstMedicalBoard`, `SstMedicalCertificate` | sst |
| `SstMedicalBoard` | 0 | 9 | `BudgetUnit` | sst |
| `SstMedicalBoardMember` | 0 | 4 | `Person`, `SstMedicalBoard` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstMedicalCertificate` | 0 | 22 | `BudgetUnit`, `Dependent`, `Employee`, `Leave`, `Person`, `Process`, `SstCertificateReason` | rh, portal-servidor, sst |
| `SstOccupationalExam` | 0 | 13 | `Company`, `Person`, `SstAso` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstOccupationalProgram` | 0 | 13 | `BudgetUnit`, `Person` | sst |
| `SstPlannedShift` | 0 | 10 | `BudgetUnit`, `Employee` | sst |
| `SstPreventionRecord` | 0 | 9 | `BudgetUnit`, `Usuario` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstPreventionRevision` | 0 | 6 | `SstPreventionRecord`, `Usuario` | SQL/associação/técnica ou uso indireto não atribuído |
| `SstProfessionalRole` | 0 | 11 | `BudgetUnit`, `Person`, `Usuario` | sst |
| `SstProgramExposureGroup` | 0 | 6 | `SstExposureGroup`, `SstOccupationalProgram` | portal-servidor, sst |
| `SstQuestionnaireVersion` | 0 | 11 | `BudgetUnit` | sst |
| `SstReasonRegimePolicy` | 0 | 7 | `SstCertificateReason` | sst, rh (SQL complementar) |
| `SstRestriction` | 0 | 11 | `BudgetUnit`, `Employee`, `SstProfessionalRole`, `Usuario` | sst, rh (SQL complementar) |
| `SstRestrictionEmailOutbox` | 0 | 13 | `SstRestriction` | sst, rh (SQL complementar) |
| `SstRestrictionFollowup` | 0 | 8 | `SstRestriction`, `Usuario` | sst, rh (SQL complementar) |
| `SstRoleAttribute` | 0 | 3 | `Role` | sst, rh (SQL complementar) |
| `SstScheduleAvailability` | 0 | 11 | `BudgetUnit`, `Person` | portal-servidor, sst |
| `SstScheduleBlock` | 0 | 7 | `SstScheduleAvailability` | sst |
| `SstServiceOrder` | 0 | 17 | `BudgetUnit`, `Employee`, `HrEmployeeFunctionalPeriod`, `SstProgramExposureGroup`, `SstTechnicalResponsibility` | sst, rh (SQL complementar) |
| `SstTechnicalResponsibility` | 0 | 13 | `BudgetUnit`, `Person`, `SstExposureGroup` | sst, rh (SQL complementar) |
| `SstVaccination` | 0 | 16 | `BudgetUnit`, `Person`, `SstProfessionalRole`, `Vaccine` | sst |
| `State` | 1 | 7 | — | cadastros |
| `Street` | 0 | 11 | `City`, `Neighborhood` | cadastros, tributacao, saude |
| `Student` | 0 | 9 | `Person` | educacao |
| `SuasProntuarioRma` | 0 | 10 | — | social |
| `Subject` | 0 | 12 | `Department`, `ProcessType` | protocolos, portal-cidadao, tributacao, portal-servidor, obras, configuracoes |
| `Supplier` | 0 | 11 | `Company`, `Person` | cadastros, financeiro, compras, rh, portal-servidor, sst, frotas, saude |
| `SupplierPortalIdentity` | 0 | 6 | `Supplier`, `Usuario` | compras |
| `SupportChannel` | 0 | 7 | — | protocolos, atendimento, transparencia, saude |
| `Tax` | 3 | 12 | — | cadastros, tributacao, planejamento, obras, cemiterios |
| `TaxActiveDebtEvent` | 0 | 7 | — | tributacao |
| `TaxAnnualBatch` | 0 | 20 | `BudgetUnit`, `FinancialYear`, `GovernmentEntity`, `Tax`, `TaxParameter`, `Usuario` | tributacao |
| `TaxAnnualBatchItem` | 0 | 14 | `TaxAnnualBatch`, `TaxAssessment`, `Taxpayer` | tributacao |
| `TaxAssessment` | 0 | 21 | `EconomicRegistration`, `RealEstate`, `Tax`, `Taxpayer` | portal-cidadao, tributacao, planejamento, obras, cemiterios, controle-interno |
| `TaxAuditCrossCheck` | 0 | 11 | — | tributacao |
| `TaxAuditLog` | 0 | 8 | `Employee`, `Usuario` | tributacao, obras, cemiterios |
| `TaxBenefitGrant` | 0 | 15 | `TaxBenefitRule` | transparencia, tributacao, planejamento |
| `TaxBenefitRule` | 0 | 13 | — | transparencia, tributacao |
| `TaxBurialMovement` | 0 | 14 | `CemeteryOssuary`, `TaxDeceased`, `TaxGrave` | tributacao, cemiterios |
| `TaxCaseLink` | 0 | 8 | `Document`, `Process`, `Taxpayer` | tributacao |
| `TaxCdaVersion` | 0 | 10 | — | tributacao |
| `TaxCemetery` | 0 | 10 | — | tributacao, cemiterios |
| `TaxCemeteryEmployee` | 0 | 6 | `TaxCemetery` | tributacao |
| `TaxCemeterySector` | 0 | 6 | `TaxCemetery`, `TaxCemeterySector` | tributacao, cemiterios |
| `TaxCertificate` | 0 | 9 | `Document`, `Taxpayer` | portal-cidadao, tributacao |
| `TaxCertificateEvaluation` | 0 | 8 | `TaxCertificate`, `Taxpayer` | tributacao |
| `TaxCollectionAction` | 0 | 18 | `TaxCollectionPortfolio`, `TaxCollectionPortfolioItem` | tributacao |
| `TaxCollectionActionEvent` | 0 | 7 | `TaxCollectionAction` | SQL/associação/técnica ou uso indireto não atribuído |
| `TaxCollectionPortfolio` | 0 | 9 | `TaxCollectionProfile` | tributacao |
| `TaxCollectionPortfolioItem` | 0 | 11 | `TaxCollectionPortfolio` | tributacao |
| `TaxCollectionProfile` | 0 | 10 | — | tributacao |
| `TaxCollectionRule` | 0 | 12 | — | SQL/associação/técnica ou uso indireto não atribuído |
| `TaxDaPortfolio` | 0 | 7 | — | tributacao |
| `TaxDaPortfolioItem` | 0 | 5 | `TaxDaPortfolio` | tributacao |
| `TaxDeathCause` | 0 | 4 | — | tributacao, cemiterios |
| `TaxDebtSuspension` | 0 | 9 | — | tributacao |
| `TaxDeceased` | 0 | 28 | `TaxCemetery`, `TaxDeathCause`, `TaxFuneralHome`, `TaxGrave` | tributacao, cemiterios |
| `TaxDeclaration` | 0 | 13 | `EconomicRegistration`, `RealEstate`, `TaxServiceActivity`, `Taxpayer` | tributacao |
| `TaxDocumentSequence` | 0 | 5 | — | tributacao |
| `TaxExecutionBatch` | 0 | 8 | — | tributacao |
| `TaxExecutionCase` | 0 | 15 | `TaxExecutionBatch` | tributacao |
| `TaxExecutionEvent` | 0 | 7 | `TaxExecutionCase` | SQL/associação/técnica ou uso indireto não atribuído |
| `TaxFinancialMapping` | 0 | 8 | `BankAccount`, `ResourceSource`, `RevenueNature`, `Tax` | tributacao, planejamento |
| `TaxFuneralHome` | 0 | 7 | — | tributacao, cemiterios |
| `TaxGrave` | 0 | 15 | `CemeteryLot`, `TaxCemetery`, `TaxCemeterySector` | tributacao, cemiterios |
| `TaxGraveConcession` | 0 | 11 | `TaxGrave` | tributacao, cemiterios |
| `TaxGuide` | 0 | 12 | `Document`, `TaxAssessment` | tributacao, planejamento, obras, cemiterios |
| `TaxInstallmentAgreement` | 0 | 24 | `TaxInstallmentRule` | tributacao |
| `TaxInstallmentDebt` | 0 | 8 | `TaxInstallmentAgreement` | tributacao |
| `TaxInstallmentEvent` | 0 | 7 | `TaxInstallmentAgreement` | SQL/associação/técnica ou uso indireto não atribuído |
| `TaxInstallmentPaymentAllocation` | 0 | 8 | `TaxInstallmentAgreement`, `TaxInstallmentQuota` | tributacao |
| `TaxInstallmentQuota` | 0 | 11 | `TaxInstallmentAgreement` | tributacao |
| `TaxInstallmentRule` | 0 | 16 | — | tributacao |
| `TaxIntegrationEvent` | 0 | 16 | — | tributacao |
| `TaxParameter` | 0 | 11 | `Tax` | tributacao |
| `Taxpayer` | 0 | 10 | `Company`, `Person` | cadastros, protocolos, portal-cidadao, transparencia, tributacao, obras, cemiterios, controle-interno |
| `TaxpayerPortalAccess` | 0 | 9 | — | portal-cidadao, tributacao |
| `TaxPayment` | 0 | 17 | `BankAccount`, `Document`, `TaxGuide` | tributacao, controle-interno |
| `TaxPrizeCoupon` | 0 | 9 | `TaxPrizeDraw` | tributacao |
| `TaxPrizeDraw` | 0 | 17 | — | tributacao |
| `TaxPrizeExecution` | 0 | 10 | `TaxPrizeDraw` | tributacao |
| `TaxPrizeWinner` | 0 | 6 | `TaxPrizeCoupon`, `TaxPrizeExecution` | SQL/associação/técnica ou uso indireto não atribuído |
| `TaxProtestBatch` | 0 | 7 | — | tributacao |
| `TaxProtestItem` | 0 | 10 | `TaxProtestBatch` | tributacao |
| `TaxRegistryEntry` | 0 | 18 | — | tributacao, financeiro, planejamento, obras |
| `TaxRevenueIntegrationEvent` | 0 | 6 | `Revenue`, `TaxPayment` | tributacao |
| `TaxServiceActivity` | 0 | 8 | `Tax` | portal-cidadao, tributacao, planejamento |
| `TaxServiceRequest` | 0 | 11 | `Document`, `License`, `Process`, `TaxAssessment`, `Taxpayer` | portal-cidadao, tributacao |
| `Teacher` | 0 | 4 | `Employee` | educacao |
| `TeacherAcademicRecord` | 0 | 15 | `SchoolClass`, `SchoolSubject`, `Teacher` | educacao |
| `TeacherClassAssignment` | 0 | 11 | `SchoolClass`, `SchoolSubject`, `Teacher` | educacao |
| `TermOfReference` | 0 | 9 | `PurchaseProcess` | SQL/associação/técnica ou uso indireto não atribuído |
| `Ticket` | 0 | 22 | `Company`, `Department`, `Employee`, `Person`, `Process`, `ServiceSubject`, `SupportChannel` | atendimento, transparencia |
| `TicketAuditLog` | 0 | 7 | `Employee`, `Ticket`, `Usuario` | atendimento |
| `TicketDocument` | 0 | 6 | `Document`, `Employee`, `Ticket` | SQL/associação/técnica ou uso indireto não atribuído |
| `TicketInteraction` | 0 | 7 | `Employee`, `Ticket` | atendimento |
| `TicketMovement` | 0 | 9 | `Department`, `Employee`, `Ticket` | atendimento |
| `TrafficInfractionTicket` | 0 | 12 | — | seguranca |
| `TransparencyAccess` | 0 | 7 | — | transparencia |
| `TransparencyCitizenAppeal` | 0 | 9 | `TransparencyCitizenRequest` | transparencia |
| `TransparencyCitizenRequest` | 0 | 23 | `Ombudsman`, `Process`, `Ticket` | transparencia |
| `TransparencyCriterion` | 0 | 11 | — | transparencia |
| `TransparencyCriterionEvidence` | 0 | 9 | `TransparencyCriterion` | transparencia |
| `TransparencyNativeBinding` | 0 | 12 | `GovernmentEntity` | transparencia |
| `TransparencyPublication` | 0 | 25 | — | transparencia, controle-interno |
| `TransparencySatisfaction` | 0 | 8 | `TransparencyCitizenRequest` | transparencia |
| `TreasuryMovement` | 0 | 17 | `BankAccount`, `FinancialYear`, `ResourceSource`, `Revenue` | tributacao, financeiro, planejamento, rh |
| `TreasuryTransfer` | 0 | 10 | `BankAccount`, `TreasuryMovement` | financeiro |
| `Usuario` | 1 | 10 | `ConfiguracaoPerfil`, `Employee` | protocolos, documentos, atendimento, portal-cidadao, tributacao, financeiro, planejamento, compras, rh, portal-servidor, sst, patrimonio, frotas, saude, social, obras, cemiterios, controle-interno, configuracoes |
| `UsuarioModulo` | 0 | 5 | `ConfiguracaoModulo`, `Usuario` | saude |
| `UsuarioUnidadeGestora` | 0 | 4 | `BudgetUnit`, `Usuario` | SQL/associação/técnica ou uso indireto não atribuído |
| `Vacation` | 0 | 10 | `Employee` | tributacao, rh, portal-servidor, sst |
| `VaccinationRecord` | 0 | 30 | `HealthAppointment`, `HealthProfessional`, `HealthUnit`, `HealthVaccinationCampaign`, `HealthVaccinationCardEvent`, `HealthVaccineManufacturer`, `HealthVaccineOpenedVial`, `MaterialMovement`, `MaterialStock`, `MedicalRecord`, `Patient`, `Vaccine` | saude |
| `Vaccine` | 0 | 12 | `Material` | sst, saude |
| `VafAccountant` | 0 | 8 | — | tributacao |
| `VafActivity` | 0 | 15 | `VafCompany`, `VafExercise` | tributacao |
| `VafCfopEntry` | 0 | 14 | `VafCompany`, `VafExercise` | tributacao |
| `VafCompany` | 0 | 14 | `VafAccountant` | tributacao |
| `VafCompanyIndex` | 0 | 8 | `VafCompany`, `VafExercise` | tributacao |
| `VafCrossCheck` | 0 | 16 | `VafCompany`, `VafExercise` | tributacao |
| `VafEfdImport` | 0 | 14 | `VafCompany`, `VafEfdImport`, `VafExercise` | tributacao |
| `VafEstimate` | 0 | 11 | `VafCompany`, `VafExercise` | tributacao |
| `VafExercise` | 0 | 6 | — | tributacao |
| `VafGiaImport` | 0 | 14 | `VafCompany`, `VafExercise`, `VafGiaImport` | tributacao |
| `VafMonthlySummary` | 0 | 17 | `VafCompany`, `VafExercise` | tributacao |
| `VafMunicipalIndex` | 0 | 9 | `VafExercise` | tributacao |
| `VafNotification` | 0 | 14 | `VafAccountant`, `VafCompany`, `VafExercise` | tributacao |
| `VafProtocol` | 0 | 11 | `VafAccountant`, `VafCompany`, `VafExercise` | tributacao |
| `VafRepasse` | 0 | 10 | `VafExercise`, `VafRepasse` | tributacao |
| `VafResult` | 0 | 14 | `VafCompany`, `VafExercise` | tributacao |
| `VafRule` | 0 | 14 | `VafExercise` | tributacao |
| `Warehouse` | 0 | 19 | `City`, `CostCenter`, `Employee`, `HealthUnit`, `Neighborhood`, `Street` | cadastros, transparencia, financeiro, compras, sst, patrimonio, educacao, saude |
| `WaterMeterReading` | 0 | 15 | — | saneamento |
| `WithholdingPayable` | 0 | 9 | `Creditor`, `Document`, `PaymentRetention` | financeiro |
| `YieldTransaction` | 0 | 15 | — | financeiro |

### C.1 Tabelas SQL complementares e campos

- **`HrBudgetUnitEntityMapping`** (0 registros): `id`, `budgetUnitId`, `governmentEntityId`, `sourceReference`, `createdById`, `createdAt`.
- **`HrEmployeeFunctionalPeriod`** (0 registros): `id`, `employeeId`, `budgetUnitId`, `governmentEntityId`, `employmentRegimeId`, `roleId`, `functionRoleId`, `departmentId`, `localId`, `costCenterId`, `startsAt`, `endsAt`, `contractReference`, `sourceReference`, `supersedesId`, `voided`, `snapshot`, `requestHash`, `createdById`, `createdAt`.
- **`HrVacationConcessionSource`** (0 registros): `vacationId`, `budgetUnitId`, `functionalPeriodId`, `expiresAt`, `sourceReference`, `acquisitionStart`, `acquisitionEnd`, `createdById`, `createdAt`.
- **`SstAsoCorrection`** (0 registros): `id`, `asoId`, `kind`, `replacementAsoId`, `reason`, `requestHash`, `createdById`, `createdAt`.
- **`SstAsoDocument`** (0 registros): `id`, `asoId`, `examId`, `documentId`, `kind`, `requestHash`, `createdById`, `createdAt`.
- **`SstAsoFlowSettings`** (0 registros): `budgetUnitId`, `suggestedResults`, `vacationWarningDays`, `updatedById`, `updatedAt`.
- **`SstAsoFlowSource`** (0 registros): `asoId`, `anamnesisId`, `physicianRoleId`, `functionalPeriodId`.
- **`SstCatEvidence`** (0 registros): `id`, `catId`, `kind`, `version`, `clinical`, `approved`, `personId`, `professionalRoleId`, `data`, `createdById`, `submissionKey`, `requestHash`, `createdAt`.
- **`SstCatLayoutMedical`** (0 registros): `layoutVersionId`, `medicalEvidenceId`, `fields`, `createdById`.
- **`SstCatLayoutVersion`** (0 registros): `id`, `catId`, `version`, `mode`, `layoutVersion`, `templateSha256`, `provenance`, `fields`, `canonicalSnapshot`, `originalReceipt`, `createdById`, `submissionKey`, `requestHash`, `createdAt`.
- **`SstCatLedger`** (0 registros): `id`, `catId`, `kind`, `amount`, `description`, `expenseId`, `createdById`, `submissionKey`, `requestHash`, `createdAt`.
- **`SstCertificateDecisionRevision`** (0 registros): `id`, `certificateId`, `revision`, `previousStatus`, `decision`, `reason`, `examinerPersonId`, `examinerCouncil`, `previousLeaveId`, `newLeaveId`, `reconciliation`, `createdById`, `createdAt`.
- **`SstCertificateFunctionalSource`** (0 registros): `certificateId`, `functionalPeriodId`, `regimePolicyId`, `snapshot`.
- **`SstCertificateLeaveConfirmation`** (0 registros): `id`, `certificateId`, `confirmed`, `createdById`, `createdAt`.
- **`SstFoundationalRevocation`** (0 registros): `id`, `serviceOrderId`, `responsibilityId`, `reason`, `createdById`, `createdAt`.
- **`SstReasonRegimePolicy`** (0 registros): `id`, `reasonId`, `version`, `restrictedRegimeIds`, `justification`, `createdById`, `createdAt`.
- **`SstRestriction`** (0 registros): `id`, `budgetUnitId`, `employeeId`, `professionalRoleId`, `startsAt`, `endsAt`, `data`, `createdById`, `submissionKey`, `requestHash`, `createdAt`.
- **`SstRestrictionEmailOutbox`** (0 registros): `id`, `restrictionId`, `recipient`, `dueAt`, `status`, `providerReceipt`, `lastError`, `sentAt`, `createdAt`, `claimedAt`, `attempts`, `nextAttemptAt`, `lastAttemptAt`.
- **`SstRestrictionFollowup`** (0 registros): `id`, `restrictionId`, `followedAt`, `data`, `createdById`, `submissionKey`, `requestHash`, `createdAt`.
- **`SstRoleAttribute`** (0 registros): `id`, `roleId`, `description`.
- **`SstServiceOrder`** (0 registros): `id`, `budgetUnitId`, `programGroupId`, `employeeId`, `functionalPeriodId`, `responsibilityId`, `startsAt`, `endsAt`, `prevention`, `standards`, `accidentConduct`, `trainingRequirements`, `equipmentRequirements`, `snapshot`, `requestHash`, `createdById`, `createdAt`.
- **`SstTechnicalResponsibility`** (0 registros): `id`, `budgetUnitId`, `personId`, `kind`, `groupId`, `council`, `sourceReference`, `startsAt`, `endsAt`, `snapshot`, `requestHash`, `createdById`, `createdAt`.

## Anexo D — Triggers, funções e regras SQL instaladas

**255 triggers não internos** no schema public; nenhum marcado como desativado. O modo O indica execução na origem; R replica e A always, se presentes, são modos distintos. O nome é índice de localização para as migrations; o texto da regra deve ser lido na função associada e no serviço de domínio.

| Tabela | Trigger | Modo |
| --- | --- | --- |
| `AccountingEntry` | `account_classification_snapshot_preserved` | `O` |
| `AccountingTransaction` | `AccountingTransaction_scope_guard` | `O` |
| `ActionPPA` | `planning_closed_action` | `O` |
| `Asset` | `fleet_asset_changed` | `O` |
| `Asset` | `fleet_asset_writeoff_guard` | `O` |
| `AssetMaintenance` | `fleet_asset_maintenance_after` | `O` |
| `AssetMaintenance` | `fleet_asset_maintenance_before` | `O` |
| `AuditEvent` | `AuditEvent_append_only` | `O` |
| `CemeteryChangeHistory` | `cemetery_history_append_only` | `O` |
| `CemeteryFeeEvent` | `cemetery_fee_event_immutable` | `O` |
| `CemeteryFeeRuleVersion` | `cemetery_fee_version_immutable` | `O` |
| `CertificateUseAudit` | `CertificateUseAudit_append_only` | `O` |
| `ConstructionAnalystReplacement` | `ConstructionAnalystReplacement_immutable` | `O` |
| `ConstructionAutomaticViabilityRun` | `construction_automatic_viability_immutable` | `O` |
| `ConstructionCompanyProfileEvent` | `ConstructionCompanyProfileEvent_immutable` | `O` |
| `ConstructionConfigVersion` | `ConstructionConfigVersion_immutable` | `O` |
| `ConstructionConsultation` | `ConstructionConsultation_immutable` | `O` |
| `ConstructionConsultationResponse` | `ConstructionConsultationResponse_immutable` | `O` |
| `ConstructionDefinitionVersion` | `ConstructionDefinitionVersion_immutable` | `O` |
| `ConstructionDistributionVersion` | `ConstructionDistributionVersion_immutable` | `O` |
| `ConstructionDocumentTemplateVersion` | `construction_template_immutable` | `O` |
| `ConstructionEnforcementAcknowledgement` | `enforcement_ack_immutable` | `O` |
| `ConstructionEnforcementAct` | `enforcement_act_immutable` | `O` |
| `ConstructionEnforcementAssignment` | `enforcement_assignment_immutable` | `O` |
| `ConstructionEnforcementCase` | `enforcement_case_identity` | `O` |
| `ConstructionEnforcementCase` | `enforcement_case_no_delete` | `O` |
| `ConstructionEnforcementEvidence` | `enforcement_evidence_immutable` | `O` |
| `ConstructionEnforcementVisit` | `enforcement_visit_immutable` | `O` |
| `ConstructionFederalExport` | `construction_export_immutable` | `O` |
| `ConstructionFederalExportItem` | `construction_export_item_immutable` | `O` |
| `ConstructionFederalExportReceipt` | `construction_export_receipt_immutable` | `O` |
| `ConstructionFee` | `construction_fee_immutable` | `O` |
| `ConstructionInspectionDeadlineExtension` | `ConstructionInspectionDeadlineExtension_immutable` | `O` |
| `ConstructionIssuedDocument` | `construction_issued_document_immutable` | `O` |
| `ConstructionMessage` | `ConstructionMessage_immutable` | `O` |
| `ConstructionPdfAnnotation` | `construction_pdf_annotation_immutable` | `O` |
| `ConstructionPlanExtraction` | `construction_extraction_immutable` | `O` |
| `ConstructionProjectStamp` | `construction_project_stamp_immutable` | `O` |
| `ConstructionReview` | `ConstructionReview_immutable` | `O` |
| `ConstructionTaxRuleVersion` | `construction_tax_rule_immutable` | `O` |
| `ConstructionTermAcceptance` | `ConstructionTermAcceptance_immutable` | `O` |
| `ConstructionTermVersion` | `ConstructionTermVersion_immutable` | `O` |
| `ConstructionViabilityResult` | `ConstructionViabilityResult_immutable` | `O` |
| `ConstructionZoneVersion` | `ConstructionZoneVersion_immutable` | `O` |
| `Dependent` | `sst_dependent_identity` | `O` |
| `DocumentIcpEvidence` | `DocumentIcpEvidence_append_only` | `O` |
| `DocumentSignature` | `DocumentSignature_protect_integrity` | `O` |
| `DocumentVersion` | `DocumentVersion_protect_integrity` | `O` |
| `FinancialAuditLog` | `FinancialAuditLog_append_only` | `O` |
| `FleetCatalogEntry` | `FleetCatalogEntry_immutable` | `O` |
| `FleetControlEvent` | `FleetControlEvent_immutable` | `O` |
| `FleetExternalEvent` | `FleetExternalEvent_immutable` | `O` |
| `FleetGateEvent` | `FleetGateEvent_immutable` | `O` |
| `FleetUnit` | `fleet_unit_linked` | `O` |
| `FleetUnit` | `fleet_unit_projection` | `O` |
| `FleetWorkOrder` | `fleet_order_changed` | `O` |
| `GenericProcessWorkflowDefinition` | `GenericProcessWorkflowDefinition_protect_published` | `O` |
| `GenericProcessWorkflowEvent` | `GenericProcessWorkflowEvent_append_only` | `O` |
| `GenericProcessWorkflowStage` | `GenericProcessWorkflowStage_protect_published` | `O` |
| `GoalPPA` | `planning_closed_goal` | `O` |
| `HealthFollowupBatch` | `HealthFollowupBatch_payload_immutable` | `O` |
| `HealthFollowupBatchItem` | `HealthFollowupBatchItem_immutable` | `O` |
| `HealthFollowupProcessedKey` | `HealthFollowupProcessedKey_immutable` | `O` |
| `HealthFollowupReceipt` | `HealthFollowupReceipt_immutable` | `O` |
| `HealthFollowupResult` | `HealthFollowupResult_immutable` | `O` |
| `HealthProcedurePriceItem` | `HealthProcedurePriceItem_immutable` | `O` |
| `HealthProcedurePriceTable` | `HealthProcedurePriceTable_immutable` | `O` |
| `HealthWaitlistEvent` | `HealthWaitlistEvent_immutable` | `O` |
| `HrBudgetUnitEntityMapping` | `HrBudgetUnitEntityMapping_immutable` | `O` |
| `HrConsignmentAgreement` | `hr_consignment_agreement_immutable` | `O` |
| `HrConsignmentEntry` | `hr_consignment_entry_immutable` | `O` |
| `HrConsignmentInstallment` | `hr_consignment_installment_immutable` | `O` |
| `HrEmployeeFunctionalPeriod` | `HrEmployeeFunctionalPeriod_immutable` | `O` |
| `HrEmployeeFunctionalPeriod` | `HrEmployeeFunctionalPeriod_integrity` | `O` |
| `HrEmploymentRevision` | `hr_revision_immutable` | `O` |
| `HrIntegrationEvent` | `hr_event_immutable` | `O` |
| `HrMovement` | `hr_movement_immutable` | `O` |
| `HrPayrollConfigurationChange` | `HrPayrollConfigurationChange_append_only` | `O` |
| `HrPayrollItemOrigin` | `hr_item_origin_immutable` | `O` |
| `HrPayrollRun` | `hr_run_immutable` | `O` |
| `HrPayrollStatement` | `hr_statement_immutable` | `O` |
| `HrPortalRequestBinding` | `HrPortalRequestBinding_guard` | `O` |
| `HrRecruitmentApplication` | `HrRecruitmentApplication_guard` | `O` |
| `HrRightEntry` | `hr_right_immutable` | `O` |
| `HrRoleLegalHistory` | `HrRoleLegalHistory_integrity` | `O` |
| `HrVacationConcessionSource` | `HrVacationConcessionSource_immutable` | `O` |
| `IndicatorPPA` | `planning_closed_indicator` | `O` |
| `InternalControlEvent` | `InternalControlEvent_audit_integrity` | `O` |
| `InternalControlEvent` | `InternalControlEvent_report_integrity` | `O` |
| `ItbiDeclaration` | `ItbiDeclaration_field_history` | `O` |
| `ItbiDeclaration` | `ItbiDeclaration_preserve_history` | `O` |
| `ItbiParty` | `ItbiParty_field_history` | `O` |
| `Leave` | `Leave_sst_history_guard` | `O` |
| `License` | `License_configured_position` | `O` |
| `MaterialMovement` | `municipal_material_cost_memory` | `O` |
| `MaterialMovement` | `valued_stock_movement_immutable` | `O` |
| `MaterialStock` | `stock_valuation_activation` | `O` |
| `MaterialStockValuation` | `stock_valuation_opening_immutable` | `O` |
| `MaterialStockValuationEvent` | `stock_valuation_event_committed` | `O` |
| `MaterialStockValuationEvent` | `stock_valuation_event_immutable` | `O` |
| `MaterialStockValuationEvent` | `stock_valuation_event_valid` | `O` |
| `MunicipalCostAllocation` | `municipal_cost_allocation_immutable` | `O` |
| `MunicipalCostAllocation` | `municipal_cost_allocation_integrity` | `O` |
| `MunicipalCostAllocation` | `municipal_cost_reduced_ceiling` | `O` |
| `MunicipalCostMovement` | `municipal_cost_correction_integrity` | `O` |
| `MunicipalCostMovement` | `municipal_cost_movement_immutable` | `O` |
| `MunicipalCostObject` | `municipal_cost_object_scope` | `O` |
| `MunicipalCostPolicy` | `municipal_cost_policy_immutable` | `O` |
| `MunicipalCostRule` | `municipal_cost_rule_history` | `O` |
| `MunicipalCostRule` | `municipal_cost_rule_scope` | `O` |
| `MunicipalCostSource` | `municipal_cost_source_history` | `O` |
| `MunicipalCostSource` | `municipal_cost_source_no_delete` | `O` |
| `MunicipalCostSource` | `municipal_cost_source_scope` | `O` |
| `MunicipalCostSourceReduction` | `municipal_cost_reduction_immutable` | `O` |
| `MunicipalCostSourceReduction` | `municipal_cost_reduction_integrity` | `O` |
| `MunicipalFiscalIndexDefinition` | `municipal_fiscal_definition_integrity` | `O` |
| `MunicipalPersonnelFiscalDefinition` | `MunicipalPersonnelFiscalDefinition_immutable` | `O` |
| `ObjectivePPA` | `planning_closed_objective` | `O` |
| `PayableCarryForwardSettlementLink` | `carry_forward_settlement_link_preserved` | `O` |
| `Payroll` | `sst_leave_payroll_header_guard` | `O` |
| `Payroll` | `sst_payroll_header_guard` | `O` |
| `PayrollBenefit` | `sst_payroll_benefit_identity` | `O` |
| `PayrollEvent` | `sst_leave_event_guard` | `O` |
| `PayrollEvent` | `sst_payroll_event_origin_guard` | `O` |
| `PayrollItem` | `hr_projected_item_immutable` | `O` |
| `PayrollItem` | `sst_leave_payroll_item_guard` | `O` |
| `PayrollItem` | `sst_payroll_item_guard` | `O` |
| `PersonMergeLedger` | `PersonMergeLedger_append_only` | `O` |
| `PlanningAmendmentItem` | `planning_decided_amendment_item_immutable` | `O` |
| `PlanningBudgetLine` | `planning_classification_preserved` | `O` |
| `PlanningBudgetLine` | `planning_closed_line_immutable` | `O` |
| `PlanningBudgetLine` | `planning_expense_level` | `O` |
| `PlanningBudgetLine` | `planning_line_scope` | `O` |
| `PlanningBudgetLine` | `planning_original_with_history_immutable` | `O` |
| `PlanningCatalogEntry` | `planning_catalog_entry_immutable` | `O` |
| `PlanningCatalogVersion` | `planning_catalog_version_immutable` | `O` |
| `PlanningDocumentLink` | `planning_document_target` | `O` |
| `PlanningInstrument` | `planning_parent_scope` | `O` |
| `PlanningInstrumentSource` | `planning_source_binding` | `O` |
| `PlanningIntegrationCommand` | `planning_accounting_command_integrity` | `O` |
| `PlanningLegislativeAmendment` | `planning_decided_amendment_immutable` | `O` |
| `PlanningLineMovement` | `planning_movement_immutable` | `O` |
| `PlanningPhysicalEvent` | `planning_physical_immutable` | `O` |
| `PlanningPublicationEvent` | `planning_publication_event_immutable` | `O` |
| `PlanningQuotaEvent` | `planning_quota_event_immutable` | `O` |
| `PlanningReportPublication` | `planning_publication_identity` | `O` |
| `PlanningReportSnapshot` | `planning_report_immutable` | `O` |
| `PlanningVersion` | `planning_version_immutable` | `O` |
| `PortalServiceRequest` | `PortalServiceRequest_binding_guard` | `O` |
| `PortalServiceRequestEvent` | `PortalServiceRequestEvent_immutable` | `O` |
| `PortalServiceVersion` | `PortalServiceVersion_immutable` | `O` |
| `ProcessJudicialCase` | `ProcessJudicialCase_event_required` | `O` |
| `ProcessJudicialCase` | `ProcessJudicialCase_integrity` | `O` |
| `ProcessJudicialCaseEvent` | `ProcessJudicialCaseEvent_integrity` | `O` |
| `ProgramPPA` | `planning_closed_program` | `O` |
| `RealEstate` | `RealEstate_cadastral_history` | `O` |
| `RealEstate` | `RealEstate_preserve_history` | `O` |
| `RealEstate` | `RealEstate_required_unit_link` | `O` |
| `RealEstate` | `RealEstate_supervisor_edit_control` | `O` |
| `Revenue` | `Revenue_validate_budget_scope` | `O` |
| `SstAnamnesis` | `SstAnamnesis_immutable` | `O` |
| `SstAnamnesis` | `SstAnamnesis_scope` | `O` |
| `SstAso` | `SstAso_exam_integrity` | `O` |
| `SstAso` | `SstAso_immutable` | `O` |
| `SstAso` | `SstAso_requires_flow` | `O` |
| `SstAsoCorrection` | `SstAsoCorrection_immutable` | `O` |
| `SstAsoCorrection` | `SstAsoCorrection_validate` | `O` |
| `SstAsoDocument` | `SstAsoDocument_immutable` | `O` |
| `SstAsoDocument` | `SstAsoDocument_validate` | `O` |
| `SstAsoFlowSource` | `SstAsoFlowSource_immutable` | `O` |
| `SstAsoFlowSource` | `SstAsoFlowSource_validate` | `O` |
| `SstBenefitBeneficiary` | `sst_beneficiary_immutable` | `O` |
| `SstBenefitBeneficiary` | `sst_beneficiary_validate` | `O` |
| `SstBenefitCancellation` | `sst_benefit_cancellation_immutable` | `O` |
| `SstBenefitCancellation` | `sst_compensation_integrity` | `O` |
| `SstBenefitEntry` | `sst_benefit_entry_validate` | `O` |
| `SstBenefitEntry` | `sst_entry_immutable` | `O` |
| `SstBenefitPayrollMapping` | `sst_payroll_mapping_immutable` | `O` |
| `SstBenefitPayrollMapping` | `sst_payroll_mapping_period` | `O` |
| `SstBenefitPayrollOrigin` | `sst_origin_integrity` | `O` |
| `SstBenefitPayrollOrigin` | `sst_payroll_origin_immutable` | `O` |
| `SstBenefitPayrollScope` | `sst_payroll_scope_immutable` | `O` |
| `SstBenefitPayrollScope` | `sst_payroll_scope_integrity` | `O` |
| `SstCat` | `sst_cat_immutable` | `O` |
| `SstCatEvidence` | `sst_cat_evidence_guard` | `O` |
| `SstCatEvidence` | `sst_cat_evidence_immutable` | `O` |
| `SstCatLayoutMedical` | `sst_cat_layout_binding` | `O` |
| `SstCatLayoutMedical` | `sst_cat_layout_medical_immutable` | `O` |
| `SstCatLayoutVersion` | `sst_cat_layout_complete_guard` | `O` |
| `SstCatLayoutVersion` | `sst_cat_layout_immutable` | `O` |
| `SstCatLedger` | `sst_cat_ledger_guard` | `O` |
| `SstCatLedger` | `sst_cat_ledger_immutable` | `O` |
| `SstCertificateDecisionRevision` | `SstCertificateDecisionRevision_immutable` | `O` |
| `SstCertificateFunctionalSource` | `SstCertificateFunctionalSource_immutable` | `O` |
| `SstCertificateLeaveConfirmation` | `SstCertificateLeaveConfirmation_immutable` | `O` |
| `SstClinicalRecord` | `SstClinicalRecord_immutable` | `O` |
| `SstClinicalRecord` | `SstClinicalRecord_scope` | `O` |
| `SstClosureEmission` | `sst_closure_emission_immutable` | `O` |
| `SstEquipment` | `sst_equipment_catalog_immutable` | `O` |
| `SstEquipmentDelivery` | `sst_equipment_delivery_immutable` | `O` |
| `SstEquipmentDeliveryItem` | `sst_equipment_item_evidence` | `O` |
| `SstEquipmentEvent` | `sst_equipment_event_immutable` | `O` |
| `SstEquipmentRequirement` | `sst_equipment_requirement_immutable` | `O` |
| `SstEsocialAttempt` | `sst_esocial_attempt_immutable` | `O` |
| `SstEsocialConfiguration` | `sst_esocial_config_immutable` | `O` |
| `SstEsocialEvent` | `sst_esocial_config_binding` | `O` |
| `SstEsocialEvent` | `sst_esocial_event_immutable` | `O` |
| `SstEsocialEvidence` | `sst_esocial_binding` | `O` |
| `SstEsocialEvidence` | `sst_esocial_evidence_immutable` | `O` |
| `SstFoundationalRevocation` | `SstFoundationalRevocation_immutable` | `O` |
| `SstHealthPlan` | `sst_health_plan_validate` | `O` |
| `SstHealthPlan` | `sst_plan_immutable` | `O` |
| `SstLeavePayrollOrigin` | `sst_leave_origin_immutable` | `O` |
| `SstLeavePayrollOrigin` | `sst_leave_origin_integrity` | `O` |
| `SstLeavePayrollRuleVersion` | `sst_leave_rule_version_immutable` | `O` |
| `SstLeavePayrollScopeEvidence` | `sst_leave_scope_evidence_immutable` | `O` |
| `SstMedicalAssessment` | `SstMedicalAssessment_foundational_immutable` | `O` |
| `SstMedicalCertificate` | `SstMedicalCertificate_content_immutable` | `O` |
| `SstMedicalCertificate` | `sst_leave_decision_financial_guard` | `O` |
| `SstOccupationalExam` | `SstOccupationalExam_immutable` | `O` |
| `SstOccupationalExam` | `SstOccupationalExam_integrity` | `O` |
| `SstOccupationalProgram` | `SstOccupationalProgram_immutable` | `O` |
| `SstProfessionalRole` | `SstProfessionalRole_preserve` | `O` |
| `SstProgramExposureGroup` | `SstProgramExposureGroup_immutable` | `O` |
| `SstQuestionnaireVersion` | `SstQuestionnaireVersion_immutable` | `O` |
| `SstReasonRegimePolicy` | `SstReasonRegimePolicy_immutable` | `O` |
| `SstRestriction` | `sst_restriction_immutable` | `O` |
| `SstRestrictionFollowup` | `sst_followup_immutable` | `O` |
| `SstRestrictionFollowup` | `sst_restriction_followup_guard` | `O` |
| `SstServiceOrder` | `SstServiceOrder_immutable` | `O` |
| `SstServiceOrder` | `SstServiceOrder_integrity` | `O` |
| `SstTechnicalResponsibility` | `SstTechnicalResponsibility_immutable` | `O` |
| `SstVaccination` | `SstVaccination_immutable` | `O` |
| `SstVaccination` | `SstVaccination_scope` | `O` |
| `Supplier` | `sst_operator_identity` | `O` |
| `TaxAnnualBatch` | `TaxAnnualBatch_integrity` | `O` |
| `TaxAnnualBatchItem` | `TaxAnnualBatchItem_integrity` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_accountant_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_configured_license_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_economic_activity_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_economic_events_vehicles_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_economic_profile_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_fiscal_ownership_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_itbi_field_history_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_itbi_process_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_property_authorization_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_property_cadastral_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_property_profile_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_property_simulation_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_tax_channel_history_immutable` | `O` |
| `TaxRegistryEntry` | `TaxRegistryEntry_typed_fiscal_immutable` | `O` |
| `TaxRegistryEntry` | `municipal_activity_relation_preserved` | `O` |
| `TransparencyPublication` | `TransparencyPublication_control_annex_integrity` | `O` |
| `TransparencyPublication` | `TransparencyPublication_preserve_file` | `O` |
| `TreasuryMovement` | `TreasuryMovement_multisource_origin_guard` | `O` |

### D.1 Funções no schema public

`accounting_transaction_scope_guard`, `cemetery_fee_immutable_event`, `cemetery_fee_immutable_version`, `cemetery_history_append_only`, `construction_automatic_viability_immutable`, `construction_config_immutable`, `construction_document_snapshot_immutable`, `construction_enforcement_append_only`, `construction_enforcement_case_identity`, `construction_export_immutable`, `construction_fee_immutable`, `construction_inspection_deadline_history_immutable`, `construction_issued_document_immutable`, `construction_project_stamp_immutable`, `construction_taxation_immutable`, `enforce_functional_portal_binding`, `enforce_property_edit_restriction`, `fleet_asset_changed`, `fleet_asset_maintenance_after`, `fleet_asset_maintenance_changed`, `fleet_asset_writeoff_guard`, `fleet_control_immutable`, `fleet_import_asset_maintenance`, `fleet_order_changed`, `fleet_unit_linked`, `fleet_unit_projection`, `guard_multisource_treasury_origin`, `hr_functional_period_integrity`, `hr_immutable_entry`, `hr_protect_event`, `hr_protect_projected_item`, `hr_protect_run`, `hr_protect_statement`, `hr_role_legal_history_integrity`, `municipal_control_audit_event_guard`, `municipal_control_report_annex_guard`, `municipal_control_report_guard`, `municipal_cost_allocation_guard`, `municipal_cost_correction_guard`, `municipal_cost_history_guard`, `municipal_cost_reduced_ceiling_guard`, `municipal_cost_reduction_guard`, `municipal_cost_rule_history_guard`, `municipal_cost_scope_guard`, `municipal_cost_source_history_guard`, `municipal_fiscal_definition_guard`, `municipal_material_cost_memory_guard`, `personnel_fiscal_definition_immutable`, `planning_accounting_command_guard`, `planning_catalog_immutable`, `planning_classification_guard`, `planning_closed_line_immutable`, `planning_closed_program_tree`, `planning_decided_amendment_immutable`, `planning_decided_amendment_item_immutable`, `planning_document_target_guard`, `planning_expense_level_guard`, `planning_movement_immutable`, `planning_original_with_history_immutable`, `planning_publication_guard`, `planning_source_binding_guard`, `planning_validate_line_scope`, `planning_validate_parent_scope`, `portal_request_binding_guard`, `portal_service_immutable`, `preserve_account_classification_snapshot`, `preserve_accountant_version`, `preserve_carry_forward_settlement_link`, `preserve_configured_license_memory`, `preserve_economic_activity_definition`, `preserve_economic_events_vehicles`, `preserve_fiscal_ownership`, `preserve_health_followup_batch_payload`, `preserve_health_followup_evidence`, `preserve_health_procedure_price_version`, `preserve_itbi_field_history`, `preserve_itbi_process_evidence`, `preserve_municipal_activity_relation`, `preserve_property_profile`, `preserve_property_simulation_memory`, `preserve_recruitment_application_source`, `preserve_tax_channel_history`, `preserve_transparency_publication_file`, `prevent_audit_event_mutation`, `prevent_certificate_use_audit_mutation`, `prevent_financial_audit_log_mutation`, `prevent_generic_process_workflow_event_mutation`, `prevent_hr_payroll_configuration_change_mutation`, `prevent_icp_evidence_mutation`, `prevent_person_merge_ledger_mutation`, `process_judicial_case_event_required`, `process_judicial_case_integrity`, `property_effective_edit_restriction`, `protect_configured_license_position`, `protect_document_signature_integrity`, `protect_document_version_integrity`, `protect_economic_profile_history`, `protect_generic_process_workflow_definition`, `protect_generic_process_workflow_stage`, `protect_property_edit_authorization`, `protect_real_estate_with_history`, `protect_stock_valuation_activation`, `protect_stock_valuation_history`, `protect_stock_valuation_opening`, `protect_tax_property_cadastral_history`, `protect_typed_fiscal_record`, `protect_valued_stock_movement`, `record_itbi_field_history`, `record_real_estate_cadastral_history`, `sst_accident_immutable`, `sst_anamnesis_scope`, `sst_aso_correction_validate`, `sst_aso_document_validate`, `sst_aso_exam_integrity`, `sst_aso_flow_immutable`, `sst_aso_flow_validate`, `sst_aso_immutable`, `sst_aso_requires_flow`, `sst_beneficiary_validate`, `sst_benefit_entry_validate`, `sst_benefit_identity_guard`, `sst_benefit_immutable`, `sst_cat_evidence_guard`, `sst_cat_layout_binding`, `sst_cat_layout_complete_guard`, `sst_cat_ledger_guard`, `sst_certificate_content_immutable`, `sst_clinical_immutable`, `sst_clinical_scope`, `sst_compensation_integrity`, `sst_equipment_immutable`, `sst_equipment_item_evidence`, `sst_esocial_binding`, `sst_esocial_config_binding`, `sst_esocial_immutable`, `sst_foundational_immutable`, `sst_health_plan_validate`, `sst_historical_leave_guard`, `sst_leave_decision_financial_guard`, `sst_leave_event_guard`, `sst_leave_origin_integrity`, `sst_leave_payroll_header_guard`, `sst_leave_payroll_item_guard`, `sst_operator_identity_guard`, `sst_origin_integrity`, `sst_payroll_event_origin_guard`, `sst_payroll_header_guard`, `sst_payroll_item_guard`, `sst_payroll_mapping_period`, `sst_payroll_scope_integrity`, `sst_post_benefit`, `sst_post_certificate_leave`, `sst_professional_preserve`, `sst_program_version_immutable`, `sst_questionnaire_immutable`, `sst_recalculate_payroll`, `sst_restriction_followup_guard`, `sst_service_order_integrity`, `tax_annual_batch_integrity`, `validate_property_unit_link`, `validate_revenue_budget_scope`, `validate_stock_valuation_committed_balance`, `validate_stock_valuation_event`.

### D.2 CHECKs sem validação retroativa

| Tabela | Constraint | Definição atual |
| --- | --- | --- |
| `TaxGrave` | `TaxGrave_capacity_occupancy_check` | `CHECK (((capacity > 0) AND ("occupantCount" >= 0) AND ("occupantCount" <= capacity))) NOT VALID` |
| `CemeteryLot` | `CemeteryLot_limit_check` | `CHECK (("graveLimit" > 0)) NOT VALID` |
| `CemeteryOssuary` | `CemeteryOssuary_capacity_occupancy_check` | `CHECK (((capacity > 0) AND ("occupantCount" >= 0) AND ("occupantCount" <= capacity))) NOT VALID` |
| `CemeteryIdentificationField` | `CemeteryIdentificationField_kind_check` | `CHECK ((("targetType" = ANY (ARRAY['LOTE'::text, 'SEPULTURA'::text])) AND ("valueType" = ANY (ARRAY['DESCRITIVO'::text, 'NUMERICO'::text])))) NOT VALID` |
| `CemeteryAttachment` | `CemeteryAttachment_target_check` | `CHECK (("targetType" = ANY (ARRAY['LOTE'::text, 'SEPULTURA'::text, 'SEPULTAMENTO'::text, 'VELORIO'::text, 'CREMACAO'::text]))) NOT VALID` |
| `PlanningBudgetLine` | `planning_transfer_counterparty` | `CHECK (((kind <> 'TRANSFER'::"PlanningLineKind") OR (("destinationEntityId" IS NOT NULL) AND ("transferDirection" = ANY (ARRAY['IN'::text, 'OUT'::text]))))) NOT VALID` |

## Anexo E — Índice técnico de serviços e regras por área

Este índice relaciona os arquivos de biblioteca próprios de cada área e suas funções exportadas detectadas. Tipos, classes, funções locais, exportações por variável e reexports não são contados como funções neste índice. Rotas/actions listadas na seção 5 e regras SQL do anexo D completam o mapa.

### E.1. Administração geral

- `src/lib/administration/c3-policy.ts`: `getSystemAdministratorEmail`, `isSystemAdministratorEmail`, `normalizeOptionalInstitutionIdentifiers`, `isSystemAdministratorProfileCode`, `requiresSecretariatScope`, `normalizeRestrictiveProfilePermissions`, `resolveEmployeeHierarchy`, `assertLifecycleCanDeactivate`, `assertAdministratorLifecycleChange`.
- `src/lib/administration/calendar-event.ts`: `calendarDate`.
- `src/lib/administration/employee-lifecycle.ts`: `validateEmployeeRelations`.
- `src/lib/administration/system-administration-page-access.ts`: `getSystemAdministrationPageAccess`.

### E.2. Cadastros compartilhados

- `src/lib/cadastros/identity-integrity.ts`: `readCanonicalIdentityIssues`.
- `src/lib/cadastros/identity-reconciliation.ts`: `reconcileCanonicalIdentity`.
- `src/lib/cadastros/master-data-service.ts`: `normalizeMasterDataCode`, `normalizeEffectivePeriod`, `assertExclusiveCanonicalIdentity`, `assertNoSelfReference`, `selectLegalReportSigners`.
- `src/lib/cadastros/person-merge-policy.ts`: `rankPersonMergeCandidates`, `getPersonMergeEligibilityBlocks`, `assertPersonMergeEligible`, `assertDifferentSystemAdministrators`, `assertMergeReversalAllowed`.
- `src/lib/cadastros/person-merge-service.ts`: `getPersonMergeCandidates`, `proposePersonMerge`, `approveAndExecutePersonMerge`, `reversePersonMerge`.
- `src/lib/identifiers/brazilian-identifiers.ts`: `validateCpf`, `validateCnpj`, `validateCep`, `requireValidCpf`, `requireValidCnpj`, `requireValidCep`.

### E.3. Processos e protocolo

- `src/lib/protocols/access.ts`: `getProtocolContext`, `getProtocolContextForOperation`, `protocolScope`.
- `src/lib/protocols/generic-workflow-definition-service.ts`: `getGenericWorkflowInstanceTimeZone`, `createGenericWorkflowDefinition`, `addGenericWorkflowStage`, `publishGenericWorkflowDefinition`.
- `src/lib/protocols/generic-workflow-policy.ts`: `assertGenericWorkflowDefinitionMutable`, `assertGenericWorkflowDefinitionCanPublish`, `assertGenericWorkflowTransition`, `assertRequiredSignedProcessDocument`, `calculateGenericWorkflowDeadline`.
- `src/lib/protocols/generic-workflow-runtime.ts`: `isGenericWorkflowProcess`, `recordGenericWorkflowReceipt`, `approveGenericWorkflowProcess`, `returnGenericWorkflowProcess`, `rejectGenericWorkflowProcess`, `concludeGenericWorkflowProcess`.
- `src/lib/protocols/judicial-cases.ts`: `recordProcessJudicialCase`, `judicialCaseWhere`.
- `src/lib/protocols/movement-policy.ts`: `assertMovementCanBeCancelled`, `assertMovementCanBeRejected`.
- `src/lib/protocols/notifications.ts`: `notifyProtocolDepartment`, `notifyProtocolUsers`.
- `src/lib/protocols/process-listing-policy.ts`: `parseProcessListFilters`, `resolveProcessListPage`, `processListHref`.
- `src/lib/protocols/service.ts`: `createValidatedProcess`.

### E.4. Documentos, GED e assinaturas

- `src/lib/documents/document-flow-policy.ts`: `assertInternalSigningAllowed`, `hashDocumentContent`, `snapshotRetentionMonths`, `getVersionSignatureStatus`, `createPublicValidationCode`, `toPublicValidationResponse`.
- `src/lib/documents/document-flow-service.ts`: `ingestGedDocument`, `ingestProcessDocument`, `requestInternalDocumentSignatures`, `requestDocumentSignaturesForActor`, `requestProcessDocumentSignatures`, `registerRequestedInternalDocumentSignature`, `findPublicDocumentValidation`.
- `src/lib/signatures/a1-signature-service.ts`: `registerA1Certificate`, `setA1CertificateStatus`, `signDocumentVersionWithA1`, `signDocumentVersionWithA1InTransaction`, `recordA1Failure`.
- `src/lib/signatures/internal-signature.ts`: `registerInternalDocumentSignature`.

### E.5. Atendimento ao cidadão e ouvidoria

- `src/lib/attendance/access.ts`: `getAttendanceContext`, `getOmbudsmanContextForProtocols`, `getOmbudsmanReadContext`, `getAttendanceOperationalContext`, `getAttendanceOperationalContextForOperation`, `getOmbudsmanOperationalContextForOperation`, `ticketScope`, `ombudsmanScope`, `canViewOmbudsmanIdentity`.
- `src/lib/attendance/ombudsman-disclosure-policy.ts`: `assertRedactedOmbudsmanDisclosure`.

### E.6. Portal do cidadão e portal institucional

- `src/lib/portal-cidadao/access.ts`: `getCitizenAccount`, `getCitizenProcessWhere`.
- `src/lib/portal-cidadao/api-access.ts`: `getCitizenApiAccount`, `portalApiError`.
- `src/lib/portal-cidadao/catalog.ts`: `listDigitalServices`, `saveDigitalService`, `readDigitalService`.
- `src/lib/portal-cidadao/citizen-channel-process.ts`: `openCitizenChannelProcess`.
- `src/lib/portal-cidadao/evidence-client.ts`: `uploadPortalEvidence`.
- `src/lib/portal-cidadao/evidence-policy.ts`: `validPortalUploadPath`, `validPortalBlobUrl`.
- `src/lib/portal-cidadao/evidence-storage.ts`: `portalEvidencePrefix`, `resolvePortalEvidence`, `registerPortalEvidence`.
- `src/lib/portal-cidadao/external-opening.ts`: `openExternalServiceProcess`.
- `src/lib/portal-cidadao/policy.ts`: `citizenReturnTo`, `hasCitizenProcessScope`, `citizenProcessWhere`.
- `src/lib/portal-cidadao/registration.ts`: `requestCitizenAccess`, `decideCitizenAccess`.
- `src/lib/portal-cidadao/report.ts`: `serviceReportPdf`.
- `src/lib/portal-cidadao/requests.ts`: `submitPortalService`, `readOwnPortalRequest`, `operatePortalRequest`, `ratePortalRequest`.
- `src/lib/portal-cidadao/scheduling.ts`: `programPortalRequests`, `finishPortalSchedule`, `portalRequestCosts`.
- `src/lib/portal-cidadao/service-templates.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/portal-cidadao/services-policy.ts`: `safeServiceDestination`, `validateServiceValues`, `validateMunicipalLocation`, `pointInMunicipalPolygon`.
- `src/lib/portal-cidadao/space-reservations.ts`: `createScopedSpaceReservation`.
- `src/lib/portal-cidadao/tax-account.ts`: `authorizedTaxpayerIds`, `readTaxpayerAccount`.
- `src/lib/portal-cidadao/tax-executors.ts`: `executePortalTaxOpening`.
- `src/lib/portal-institucional/public-content.ts`: `getInstitutionalPortalHome`, `getInstitutionalContact`, `getPublishedNewsPage`, `getPublishedNewsBySlug`, `getPublishedPortalPageBySlug`, `formatPortalDate`, `contentExcerpt`, `safeExternalUrl`.

### E.7. Transparência, LAI, e-SIC e PNTP

- `src/lib/transparencia/aurora-models.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/transparencia/citizen-service.ts`: `createCitizenRequest`, `consultCitizenRequest`, `appealCitizenRequest`, `rateCitizenService`.
- `src/lib/transparencia/consultation-catalog.ts`: `getTransparencyCollection`.
- `src/lib/transparencia/consultation-export.ts`: `exportTransparencyCsv`.
- `src/lib/transparencia/consultation-service.ts`: `publishedTransparencyCatalog`, `runTransparencyConsultation`.
- `src/lib/transparencia/dashboard.ts`: `monthlyTransparencyTotals`.
- `src/lib/transparencia/display.ts`: `displayPublicCell`.
- `src/lib/transparencia/document-provider.ts`: `publicPublicationValues`, `documentTransparencyDataset`.
- `src/lib/transparencia/example-provider.ts`: `exampleTransparencyDataset`.
- `src/lib/transparencia/export-files.ts`: `renderTransparencyFile`, `byteStream`.
- `src/lib/transparencia/ibema-provider.ts`: `loadIbemaTransparencyDataset`.
- `src/lib/transparencia/native-binding-policy.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/transparencia/native-bindings.ts`: `nativeSourceOptions`, `saveNativeBinding`.
- `src/lib/transparencia/native-domain-provider.ts`: `readNativePublicBinding`.
- `src/lib/transparencia/native-personnel-counts.ts`: `nativePersonnelCounts`.
- `src/lib/transparencia/native-provider.ts`: `nativeTransparencyDataset`.
- `src/lib/transparencia/native-revenue-forecast.ts`: `isRevenueHierarchyParent`, `nativeRevenueForecasts`.
- `src/lib/transparencia/pntp-policy.ts`: `pntpApplicableEntities`.
- `src/lib/transparencia/portal-fiscal.ts`: `parsePublicDataFilter`, `getPublicExpenses`, `getPublicRevenues`, `exportPublicDataCSV`, `exportPublicDataTXT`.
- `src/lib/transparencia/portal-public.ts`: `isPublicFinancialReportType`, `publicFinancialReportDocumentType`, `getPublicFinancialReportSnapshots`, `getPublicFinancialReportSnapshot`, `getPublicContracts`, `getPublicBiddings`, `publishApprovedSnapshot`, `getPublicHelpFaqAndContactInfo`.
- `src/lib/transparencia/presentation-settings.ts`: `defaultTransparencySettings`, `getTransparencySettings`.
- `src/lib/transparencia/public-notice-policy.ts`: `createPublicNoticeValidationCode`, `assertProcessNoticeCanBePublished`, `createRedactedProcessNotice`, `projectPublicNotice`.
- `src/lib/transparencia/public-notices.ts`: `publishProcessPublicNotice`, `getPublicNotices`, `findPublicNoticeValidation`.
- `src/lib/transparencia/publication-policy.ts`: `verifiedPublicationBytes`, `isTransparencyCollectionEnabled`, `isPublicationPublic`.
- `src/lib/transparencia/publication-storage.ts`: `publicationUploadPrefix`, `validatePublicFileBytes`, `registerPublicationUpload`.
- `src/lib/transparencia/query-contract.ts`: `parseTransparencyQuery`, `filterPublicDataset`, `publicQueryHref`.
- `src/lib/transparencia/reconciliation-engine.ts`: `reconcilePublicAndInternalData`.
- `src/lib/transparencia/request-origin.ts`: `isSameOriginRequest`.

### E.8. Tributação, arrecadação e dívida ativa

- `src/lib/tributacao/accountants.ts`: `publishAccountant`.
- `src/lib/tributacao/accounting-movements.ts`: `readTaxAccountingMovements`.
- `src/lib/tributacao/accounting-profile.ts`: `configureTaxAccountingProfile`, `configureTaxDebtAccountingProfile`.
- `src/lib/tributacao/accrual-accounting.ts`: `recognizeTaxAssessmentInTransaction`, `recognizedTaxProfile`, `reclassifyActiveDebtInTransaction`, `returnActiveDebtReceivableInTransaction`, `postTaxAssessmentAdjustment`, `reclassifyRestoredTaxReceivable`, `taxCollectionReceivableAccount`.
- `src/lib/tributacao/annual-batch-cron.ts`: `processTaxAnnualCron`.
- `src/lib/tributacao/annual-batches.ts`: `simulateTaxAnnualPropertyBatch`, `simulateTaxAnnualBatch`, `queueTaxAnnualBatch`, `processTaxAnnualBatch`, `cancelTaxAnnualBatch`.
- `src/lib/tributacao/annual-comparison.ts`: `annualValueChange`, `readAnnualTaxComparison`.
- `src/lib/tributacao/annual-rollover.ts`: `copyTaxAnnualRule`.
- `src/lib/tributacao/annual-tax-summary.ts`: `readAnnualTaxSummary`, `classifyBenefitForAnnualReport`.
- `src/lib/tributacao/cda-pdf.ts`: `renderCdaPdf`.
- `src/lib/tributacao/certificate-subjects.ts`: `readCertificateSubjects`, `readEconomicRegistrationSubjects`, `evaluateCertificateInTransaction`.
- `src/lib/tributacao/conditional-discounts.ts`: `assertPaymentOptionDebtEligibility`, `applyConditionalGuideDiscount`, `reverseConditionalPaymentDiscount`.
- `src/lib/tributacao/configurable-cadastres.ts`: `validateFiscalFields`, `publishFiscalCatalog`, `publishFiscalCatalogInTransaction`, `saveConfiguredFiscalRecord`, `saveConfiguredFiscalRecordInTransaction`.
- `src/lib/tributacao/credit-finance.ts`: `assertTaxCreditScope`, `recordTaxExcessInTransaction`, `executeTaxRefund`, `resolveCreditDestinationScope`.
- `src/lib/tributacao/credit-reversal.ts`: `reverseTaxCreditMovement`.
- `src/lib/tributacao/debt-notice-output.ts`: `renderDebtNoticeOutput`.
- `src/lib/tributacao/debt-notices.ts`: `selectDebtNoticeTargets`, `issueDebtNoticeBatch`, `cancelDebtNotice`.
- `src/lib/tributacao/economic-activity-operations.ts`: `unifyEconomicActivities`.
- `src/lib/tributacao/economic-activity-registry.ts`: `readEconomicActivitiesInTransaction`, `resolveEconomicActivityCode`, `publishEconomicActivity`.
- `src/lib/tributacao/economic-debt-policy.ts`: `assertEconomicTaxpayerDebtFree`, `enforceEconomicProfileDebtPolicy`.
- `src/lib/tributacao/economic-events.ts`: `publishEconomicEventType`, `saveEconomicEvent`, `issueEconomicEventLicense`, `saveEconomicVehicle`.
- `src/lib/tributacao/economic-history.ts`: `createEconomicRegistrationWithHistory`, `createEconomicRegistrationWithHistoryInTransaction`, `updateEconomicRegistrationWithHistory`, `updateEconomicRegistrationWithHistoryInTransaction`.
- `src/lib/tributacao/economic-operations.ts`: `bulkChangeEconomicProfiles`.
- `src/lib/tributacao/economic-profile.ts`: `saveEconomicProfile`, `createEconomicRegistrationWithProfile`, `createEconomicRegistrationWithProfileInTransaction`, `saveEconomicProfileInTransaction`, `expireProvisionalEconomicRegistrations`.
- `src/lib/tributacao/economic-query.ts`: `readEconomicProfiles`, `readEconomicProfilesInTransaction`.
- `src/lib/tributacao/fiscal-catalog-kinds.ts`: `fiscalCatalogEntityType`.
- `src/lib/tributacao/fiscal-engine.ts`: `parseFiscalRuleConfiguration`, `evaluateFiscalRule`, `calculateSimpleAccruals`, `calculateAccountBalance`.
- `src/lib/tributacao/fiscal-payment-option-schema.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/tributacao/index.ts`: `calculateTaxAssessment`, `configureTaxFinancialMapping`, `createTaxAssessment`, `createTaxAssessmentInTransaction`, `generateTaxGuide`, `generateTaxGuideInTransaction`, `confirmTaxPayment`, `confirmTaxPaymentInTransaction`, `cancelTaxGuide`, `configureTaxParameter`, `configureTaxServiceActivity`, `createTaxServiceRequest`, `recordIssDeclaration`, `enrollAssessmentInActiveDebt`, `createDebtInstallmentPlan`, `evaluateTaxCertificateSituation`, `linkTaxCaseRecord`.
- `src/lib/tributacao/inteligencia-tributaria-engine.ts`: `runTaxAuditCrossCheck`, `issueTaxInfractionNotice`.
- `src/lib/tributacao/itbi-additional-forms.ts`: `readItbiAdditionalForms`.
- `src/lib/tributacao/itbi-attachments.ts`: `linkItbiPropertyAttachments`.
- `src/lib/tributacao/itbi-contestation.ts`: `requestItbiContestation`, `requestItbiContestationInTransaction`, `decideItbiContestation`.
- `src/lib/tributacao/itbi-correspondence.ts`: `configureItbiCorrespondence`, `transferItbiProfileInTransaction`, `reverseItbiProfileInTransaction`.
- `src/lib/tributacao/itbi-dam-pdf.ts`: `renderItbiDamPdf`.
- `src/lib/tributacao/itbi-data-adjustment.ts`: `applyItbiDataAdjustment`.
- `src/lib/tributacao/itbi-document-models.ts`: `publishItbiDocumentModel`, `issueConfiguredItbiDocument`, `renderConfiguredItbiDocument`.
- `src/lib/tributacao/itbi-draft-storage.ts`: `itbiDraftUploadPrefix`, `registerOnlineItbiDraftUpload`.
- `src/lib/tributacao/itbi-entry-policy.ts`: `publishItbiEntryPolicy`, `evaluateItbiEntryPolicy`.
- `src/lib/tributacao/itbi-expiry.ts`: `publishItbiExpiryPolicy`, `cancelOverdueItbiProcesses`.
- `src/lib/tributacao/itbi-fiscal-treatment.ts`: `decideItbiFiscalTreatment`.
- `src/lib/tributacao/itbi-history.ts`: `attributeItbiHistory`.
- `src/lib/tributacao/itbi-online.ts`: `publishOnlineItbiPolicy`, `configureItbiNotary`, `readOnlineItbiEntitlements`, `assertOnlineItbiDraftAccess`, `previewOnlineItbiProperty`, `submitOnlineItbi`.
- `src/lib/tributacao/itbi-ownership.ts`: `transferPaidItbiInTransaction`, `transferItbiManually`, `reversePaidItbiInTransaction`.
- `src/lib/tributacao/itbi-parameters.ts`: `saveItbiTransactionType`.
- `src/lib/tributacao/itbi-portal-storage.ts`: `itbiUploadPrefix`, `assertItbiContent`, `registerInternalItbiUpload`, `registerItbiPortalUpload`, `downloadItbiProcessAttachment`.
- `src/lib/tributacao/itbi-process-channel.ts`: `requestPortalItbiContestation`, `assertInternalItbiProcessAccess`, `readInternalItbiChannel`, `readPortalItbiChannel`, `assertPortalItbiAccess`, `grantItbiProcessAccess`, `assertNoPendingItbiAdjustments`, `sendInternalItbiMessage`, `sendPortalItbiMessage`.
- `src/lib/tributacao/itbi-process-pdf.ts`: `renderItbiProcessPdf`.
- `src/lib/tributacao/itbi-property-collection.ts`: `createItbiPropertyCollection`.
- `src/lib/tributacao/itbi-rectification.ts`: `rectifyTransferredItbi`.
- `src/lib/tributacao/license-lifecycle.ts`: `transitionConfiguredLicense`.
- `src/lib/tributacao/license-pdf.ts`: `renderConfiguredLicensePdf`.
- `src/lib/tributacao/license-policy.ts`: `publishLicensePolicy`, `issueConfiguredLicenseInTransaction`, `issueConfiguredLicenses`.
- `src/lib/tributacao/license-signatures.ts`: `signConfiguredLicense`, `readSignedLicenseArtifact`.
- `src/lib/tributacao/nfse-danfse.ts`: `renderPdf`.
- `src/lib/tributacao/payment-reversal.ts`: `reverseTaxPayment`.
- `src/lib/tributacao/pgv-bulk.ts`: `readPgvBulkSelection`, `bulkChangePgvCatalogs`.
- `src/lib/tributacao/portal-economic-documents.ts`: `issuePortalEconomicDocument`, `renderPortalEconomicDocument`.
- `src/lib/tributacao/portal-licenses.ts`: `issuePortalLicense`.
- `src/lib/tributacao/property-access.ts`: `assertPropertyCadastralAccess`.
- `src/lib/tributacao/property-assessment-coverage.ts`: `assertPropertyOutsideAssessedSimulation`.
- `src/lib/tributacao/property-bulk-change.ts`: `readPropertyBulkSelection`, `bulkChangeProperties`.
- `src/lib/tributacao/property-cadastral-engine.ts`: `calculateTerritorialFraction`, `previewPropertyValuation`.
- `src/lib/tributacao/property-edit-restrictions.ts`: `publishPropertyEditRestriction`, `approvePropertyEdit`.
- `src/lib/tributacao/property-group-simulation.ts`: `simulateGroupedPropertyValuation`, `simulatePropertyInTransaction`.
- `src/lib/tributacao/property-history.ts`: `attributePropertyHistory`, `touchPropertyMetadata`, `createPropertyWithHistory`, `updatePropertyWithHistory`.
- `src/lib/tributacao/property-operations.ts`: `propertyFilterWhere`, `bulkChangeProperties`, `copyProperties`, `reorganizeProperties`.
- `src/lib/tributacao/property-profile-schema.ts`: `formatPropertyInscription`, `parsePropertyInscription`.
- `src/lib/tributacao/property-profile.ts`: `publishPropertyRegistrationPolicy`, `savePropertyProfile`, `savePropertyProfileInTransaction`, `createPropertyWithProfile`.
- `src/lib/tributacao/property-simulation-assessment.ts`: `assessPropertySimulation`.
- `src/lib/tributacao/property-structure.ts`: `readPropertyStructure`.
- `src/lib/tributacao/property-valuation.ts`: `evaluateConfiguredPropertyValuation`, `evaluatePropertyValuation`, `publishPropertyValuationRule`, `saveConfiguredPropertyValuation`.
- `src/lib/tributacao/s10-engine.ts`: `calculateVaf`, `participation`, `evaluateFormula`, `mergeEfdGia`, `checkContrapartida`, `detectOmission`, `crossCheck`, `abcCurve`, `estimateAnnual`, `financialReturn`, `protocolNumber`, `academicYearFilter`, `monthlyTrend`.
- `src/lib/tributacao/s10-service.ts`: `upsertAccountant`, `upsertCompany`, `linkCompanyAccountant`, `upsertRule`, `importMovements`, `importRepasse`, `importIndices`, `processCompetency`, `notifyCorrection`, `markNotificationRead`, `resolveCrossCheck`, `createEstimate`, `vafReports`, `listVafOverview`.
- `src/lib/tributacao/s2-service.ts`: `resolveFiscalRule`, `simulateParametrizedAssessment`, `createParametrizedAssessment`, `createParametrizedAssessmentInTransaction`, `reviseTaxAssessment`, `reviseTaxAssessmentInTransaction`, `registerCreditEvent`, `registerCreditEventInTransaction`, `generatePartialTaxGuide`, `generateGroupedTaxGuides`, `createPixCharge`, `processCollectionReturn`, `applyTaxCredit`, `createReconciliation`, `configureCollectionAgreement`, `resolveReconciliation`, `approveRefundRequest`, `closeReconciliation`, `sendAccountingReference`, `getAssessmentAccount`.
- `src/lib/tributacao/s3-engine.ts`: `calculateItbi`, `dteDeadline`, `resolveDteAcknowledgement`, `canDeleteDteMessage`, `nextPowerOfAttorneyStatus`.
- `src/lib/tributacao/s3-service.ts`: `ensureTributarioS3Defaults`, `createItbiDeclaration`, `createItbiDeclarationInTransaction`, `transmitItbiDeclaration`, `analyzeItbiDeclaration`, `analyzeItbiInTransaction`, `issueItbiDam`, `issueItbiDamInTransaction`, `generateItbiDocument`, `generateItbiDocumentInTransaction`, `confirmItbiWithDocuments`, `createDteMailbox`, `confirmDteMailbox`, `createDteAccessGrant`, `validateDteAccessGrant`, `revokeDteAccessGrant`, `sendDteMessages`, `registerDteReading`, `acknowledgeDteMessage`, `applyDteTacitAcknowledgement`, `deleteDteMessage`, `createDtePowerOfAttorney`, `transitionDtePowerOfAttorney`.
- `src/lib/tributacao/s4-engine.ts`: `calculateNfse`, `apportionIss`, `validateCorrectionChanges`.
- `src/lib/tributacao/s4-service.ts`: `requestNfseCredential`, `decideNfseCredential`, `emitNfse`, `substituteNfse`, `cancelNfse`, `createCorrectionLetter`, `receiveRpsBatch`, `updateRpsItem`, `createDmsDeclaration`, `createDeductionCredit`, `createOccasionalRequest`, `createOccasionalRequestInTransaction`, `approveOccasionalRequest`, `releaseOccasionalRequest`.
- `src/lib/tributacao/s5-engine.ts`: `calculateSimplesCrossCheck`, `classifySimplesDivergences`, `buildExclusionExport`.
- `src/lib/tributacao/s5-service.ts`: `importSimplesBatch`, `processSimplesDivergences`, `communicateSimplesDivergence`, `rectifySimplesDivergence`, `prepareSimplesExclusion`, `communicateSimplesExclusion`.
- `src/lib/tributacao/s6-engine.ts`: `calculateDesifAssessment`, `calculateTrialBalance`, `calculatePackageMovement`, `canIssueDesifReceipt`.
- `src/lib/tributacao/s6-service.ts`: `createDesifInstitution`, `createDesifAgency`, `createDesifCatalog`, `receiveDesifImport`, `validateDesifImport`, `processDesifImport`, `issueDesifGuide`, `openDesifFiscalCase`, `communicateDesifFiscalCase`, `assertDesifReceipt`.
- `src/lib/tributacao/s7-engine.ts`: `calculateFiscalAssessment`, `pointsForValue`, `calculateFiscalProductivity`, `classifyFiscalFinding`.
- `src/lib/tributacao/s7-service.ts`: `createFiscalPlan`, `generatePlanOrders`, `createStandaloneFiscalOrder`, `markFiscalOrderRead`, `issueTiaf`, `acknowledgeTiaf`, `cancelTiaf`, `receiveFiscalDocument`, `returnFiscalDocument`, `createFiscalAssessmentMap`, `finalizeFiscalMapAndIssueAuto`, `issueSeizureTerm`, `closeFiscalOrder`, `communicateFiscalDocumentDte`, `runFiscalMeshes`, `createOrderFromMesh`, `saveFiscalTemplate`, `saveFiscalPenaltyRule`, `configureProductivityDemo`, `createProductivityScenario`, `confirmProductivityPeriod`.
- `src/lib/tributacao/s8-engine.ts`: `splitInstallmentAmount`, `allocateInstallmentPayment`, `calculateBenefit`, `executeDeterministicDraw`, `collectionRanking`.
- `src/lib/tributacao/s8-service.ts`: `createCollectionPortfolio`, `scheduleCollectionAction`, `completeCollectionAction`, `collectionDashboard`, `simulateInstallment`, `createInstallmentAgreement`, `applyInstallmentPayment`, `reviseInstallmentOrigin`, `reparcelInstallment`, `changeInstallmentStatus`, `grantPortalAccess`, `createBenefitRule`, `grantBenefit`, `createPrizeDraw`, `issuePrizeCoupon`, `executePrizeDraw`.
- `src/lib/tributacao/s9-engine.ts`: `validateEnrollmentEligibility`, `formatCdaNumber`, `nextCdaVersion`, `protestNext`, `executionNext`, `internalProtocol`, `graveHasVacancy`, `occupancyStats`, `assertLotCanReceiveGrave`, `assertCemeteryTransferAllowed`, `cemeteryFeeAmount`, `concessionSituation`, `sumBy`, `trendByMonth`, `collectionRate`.
- `src/lib/tributacao/s9-service.ts`: `ensureS9Defaults`, `listEnrollmentCandidates`, `enrollAssessmentDebt`, `enrollManualDebt`, `validateDebt`, `issueCda`, `annotateCda`, `createCdaVersion`, `signCdaInternal`, `createDaPortfolio`, `refreshDaPortfolio`, `issueDaGuide`, `suspendDebt`, `resumeDebt`, `returnDebtToOrigin`, `settleDebtByGuide`, `writeOffDebt`, `runPrescription`, `daBook`, `selectProtestCandidates`, `createProtestBatch`, `registerProtestReturn`, `resolveProtestItem`, `createExecutionBatch`, `openExecutionCase`, `advanceExecutionCase`, `registerMni`, `scheduleHearing`, `createCemetery`, `createSector`, `createGrave`, `registerEmployee`, `registerFuneralHome`, `createDeathCause`, `createCemeteryChapel`, `createCemeteryOssuary`, `createCemeteryIdentificationField`, `createCemeteryLot`, `setCemeteryEntityActive`, `declarantDebtSnapshot`, `registerDeceased`, `registerMovement`, `createCemeteryProcess`, `advanceCemeteryProcess`, `attachCemeteryDocument`, `createCemeteryFeeRule`, `grantConcession`, `issueCemeteryFee`, `enrollCemeteryFeeInDebt`, `cemeteryOccupancy`, `concessionCurrentSituation`, `tributarioBi`.
- `src/lib/tributacao/scheduled-guides.ts`: `issueScheduledAssessmentGuides`.
- `src/lib/tributacao/scope.ts`: `taxScopeSnapshot`, `taxAssessmentCompensatedValue`, `taxAssessmentAccessFilter`, `activeDebtAccessFilter`, `synchronizeAssessmentDebt`, `resolveTaxAssessmentScope`, `resolveTaxFinancialYear`.
- `src/lib/tributacao/simples-option-files.ts`: `publishSimplesOptionLayout`, `importSimplesOptionFile`, `decideSimplesOptionCompany`.
- `src/lib/tributacao/tax-worker-actor.ts`: `resolveTaxWorkerActor`.

### E.9. Financeiro, contabilidade, tesouraria e custos

- `src/lib/financeiro/account-catalog.ts`: `resolveAccountClassificationSnapshots`, `assertPublishedAccountClassification`.
- `src/lib/financeiro/accounting-monthly-sources.ts`: `readAccountingMonthlySources`.
- `src/lib/financeiro/accounting-source-dimensions.ts`: `resolveAccountingSourceDimensions`, `resolveAccountingLineSourceDimensions`, `resolveAccountingReversalLineDimensions`.
- `src/lib/financeiro/allowance-expense-refunds.ts`: `assertCurrentRefundPaymentMutationAllowed`, `settledCurrentRefundCorrections`, `receiveCurrentYearAdvanceRefund`, `receiveCurrentYearTravelRefund`, `reverseCurrentYearAdvanceRefund`, `reverseCurrentYearTravelRefund`.
- `src/lib/financeiro/annual-balance-stages.ts`: `executeAnnualBalanceStage`, `undoAnnualResultStage`, `undoAnnualBudgetStage`, `undoAnnualRapPostingStage`.
- `src/lib/financeiro/annual-consistency.ts`: `inspectAnnualConsistency`, `captureAnnualConsistencyReport`.
- `src/lib/financeiro/annual-estimative-balances.ts`: `executeAnnualEstimativeBalances`.
- `src/lib/financeiro/annual-extra-note-transport.ts`: `executeAnnualExtraNoteTransport`, `undoAnnualExtraNoteTransport`.
- `src/lib/financeiro/annual-payable-registration.ts`: `reconcileAnnualPayableRegistrations`, `assertAnnualPayableRegistrations`, `executeAnnualPayableRegistration`.
- `src/lib/financeiro/annual-payment-program-transport.ts`: `preparedAnnualPaymentProgramIds`, `prepareAnnualPaymentPrograms`, `lockPaymentBankCorrelation`, `transportAnnualPaymentPrograms`, `undoAnnualPaymentPrograms`.
- `src/lib/financeiro/annual-posting-origin.ts`: `resolveAnnualPostingOrigins`, `isAnnualResultReversal`, `assertAnnualResultCleared`, `assertAnnualBudgetCleared`.
- `src/lib/financeiro/annual-rap-postings.ts`: `assertNoActiveAnnualRapPosting`, `assertAnnualRapPostings`, `executeAnnualRapPostings`.
- `src/lib/financeiro/bank-integration-client.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/financeiro/bank-resource-sources.ts`: `assertBankResourceSource`, `getBankResourceSourceBalance`, `getBankResourceSourceSpendableBalance`, `configureBankResourceSources`.
- `src/lib/financeiro/carry-forward-transport.ts`: `getInheritedCarryForwardSettlement`, `transportCarryForward`, `undoCarryForwardTransport`.
- `src/lib/financeiro/classification-engine.ts`: `classifyBankMovement`, `sendMovementToMunicipalSystem`.
- `src/lib/financeiro/cost-accounting-bridge.ts`: `recordAccountingMunicipalCosts`.
- `src/lib/financeiro/cost-catalog.ts`: `createMunicipalCostObject`, `deleteMunicipalCostObjectTree`, `saveMunicipalCostItem`, `adoptStandardMunicipalCostItems`, `linkMunicipalCostItems`, `createMunicipalCostRule`, `generateMunicipalCostObjectsFromLoa`, `copyAnnualMunicipalCostRelations`, `retireMunicipalCostRule`.
- `src/lib/financeiro/cost-ledger.ts`: `assertCostScope`, `lockCostYear`, `resolveCostRecognitionYear`, `configureMunicipalCosts`, `validateCostPairs`, `distributeCostPercentages`, `municipalCostPosition`, `municipalCostSourceCeiling`, `reduceMunicipalCostSource`, `allocateMunicipalCost`, `correctMunicipalCost`, `recordMunicipalCostSource`, `cancelMunicipalCostSource`.
- `src/lib/financeiro/cost-overview.ts`: `readMunicipalCosts`.
- `src/lib/financeiro/cost-payroll-bridge.ts`: `recordPayrollSettlementCosts`.
- `src/lib/financeiro/cost-payroll-options.ts`: `readPayrollCostOptions`.
- `src/lib/financeiro/cost-payroll-slices.ts`: `splitPayrollProvisionCosts`, `splitPayrollCostStatements`, `deductPayrollCostReleases`.
- `src/lib/financeiro/cost-query.ts`: `municipalCostFilters`.
- `src/lib/financeiro/cost-report.ts`: `buildMunicipalCostReport`, `renderMunicipalCostReport`.
- `src/lib/financeiro/cost-settlement-bridge.ts`: `recordSettlementMunicipalCosts`, `cancelSettlementMunicipalCosts`.
- `src/lib/financeiro/cost-stock-bridge.ts`: `recordStockMunicipalCosts`, `reduceStockMunicipalCosts`.
- `src/lib/financeiro/cost-stock-options.ts`: `readStockCostOptions`.
- `src/lib/financeiro/cost-types.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/financeiro/fiscal-indices.ts`: `defineMunicipalFiscalIndex`, `readMunicipalFiscalIndex`.
- `src/lib/financeiro/ged.ts`: `ensureFinancialGedFolder`, `saveFinancialFileToGed`.
- `src/lib/financeiro/index.ts`: `assertFinancialYearOpen`, `getBudgetAvailability`, `synchronizeCommittedBudgetMirror`, `createExpenseRequest`, `createExpenseRequestInTransaction`, `createExpenseRequestFromApprovedPurchaseReceipt`, `approveExpenseRequest`, `approveExpenseRequestInTransaction`, `createBudgetMovementInTransaction`, `createBudgetMovement`, `createBudgetReservation`, `createBudgetReservationInTransaction`, `cancelBudgetReservation`, `createCommitment`, `createCommitmentInTransaction`, `cancelCommitment`, `cancelCommitmentInTransaction`, `createCommitmentMovement`, `createCommitmentMovementInTransaction`, `createSettlement`, `createSettlementInTransaction`, `cancelSettlement`, `cancelSettlementInTransaction`, `createPayment`, `createPaymentInTransaction`, `reversePayment`, `settleWithholdingPayable`, `updatePaymentStatus`, `updatePaymentStatusInTransaction`, `setFinancialYearStatus`, `getBankAccountBalance`, `getBankAccountBalances`, `getBankAccountLedgerBalance`, `createBankAccountWithOpeningBalance`, `updateBankAccountDetails`, `createTreasuryTransferInTransaction`, `createTreasuryTransfer`, `recordConfirmedRevenue`, `createRevenue`, `launchRevenue`, `collectLaunchedRevenue`, `reverseRevenue`, `reverseRevenueInTransaction`, `redistributeRevenueResourceSource`, `dailyTreasuryBulletin`, `basicCashflow`, `importBankStatementCsv`, `matchBankStatementItemToTreasuryMovement`, `assertAccountingPeriodOpen`, `postAccountingTransaction`, `postAccountingTransactionInTransaction`, `postAccountingEvent`, `postAccountingEventInTransaction`, `configureAccountingPostingRule`, `accountingTrialBalance`, `accountingPendingChecks`, `closeAccountingMonth`, `requestAccountingMonthClose`, `authorizeAccountingMonthClose`, `requestAccountingMonthReopen`, `authorizeAccountingMonthReopen`, `prepareAnnualAccountingClose`, `trackPayableCarryForwardPayment`, `cancelPayableCarryForward`, `reregisterPayableCarryForward`, `finalizeAnnualAccountingClose`, `closeDailyTreasuryByAccountAndSource`, `generateTreasuryBankStatement`, `generateBankReconciliationReport`.
- `src/lib/financeiro/msc-configuration.ts`: `captureMscReference2026`, `configureMscMapping`, `configureMscReportingScope`.
- `src/lib/financeiro/msc-export.ts`: `generateMunicipalMscArchive`.
- `src/lib/financeiro/msc-line-dimensions.ts`: `composeMscLineDimensions`.
- `src/lib/financeiro/ofc-parser.ts`: `parseOfcStatement`.
- `src/lib/financeiro/ofx-import.ts`: `importBankStatementOfx`, `importBankStatementOfc`.
- `src/lib/financeiro/ofx-parser.ts`: `parseOfxStatement`.
- `src/lib/financeiro/payment-bank-return.ts`: `applyPaymentBankReturn`.
- `src/lib/financeiro/personnel-fiscal.ts`: `definePersonnelFiscalComposition`, `readPersonnelFiscalPosition`.
- `src/lib/financeiro/planejamento.ts`: `createPlanningAmendment`, `getAnnualBudgetScheduleCompletion`, `createMultiYearPlan`, `addProgramPPA`, `addActionPPA`, `addObjectivePPA`, `addIndicatorPPA`, `addGoalPPA`, `createBudgetGuideline`, `createAnnualBudgetLaw`, `transitionPlanningLegalWorkflow`, `submitMultiYearPlan`, `approveMultiYearPlan`, `sanctionMultiYearPlan`, `publishMultiYearPlan`, `submitBudgetGuideline`, `approveBudgetGuideline`, `sanctionBudgetGuideline`, `publishBudgetGuideline`, `submitAnnualBudgetLaw`, `approveAnnualBudgetLaw`, `sanctionAnnualBudgetLaw`, `publishAnnualBudgetLaw`, `createBudgetAppropriationFromFixation`, `saveMonthlyDisbursementSchedule`, `saveBimonthlyRevenueTarget`, `createCreditRequest`, `approveCreditRequest`, `submitCreditRequest`, `sanctionCreditRequest`, `publishCreditRequest`, `executeCreditRequest`, `generateBudgetChangesComparison`, `generateCmdMbaExecutionReport`.
- `src/lib/financeiro/reconciliation-allocations.ts`: `reconciliationDirection`, `reconciliationAccount`, `readReconciliationPosition`, `openMunicipalReconciliation`, `allocateBankReconciliation`, `reverseBankReconciliationAllocation`, `confirmMunicipalReconciliation`, `reopenMunicipalReconciliation`.
- `src/lib/financeiro/reconciliation-engine.ts`: `runAutoReconciliation`.
- `src/lib/financeiro/relatorios-legais.ts`: `generateDiarioContabil`, `generateRazaoContabil`, `generateBalanceteContabil`, `generateRREO`, `generateRGF`, `generateBalancoOrcamentario`, `generateBalancoPatrimonial`, `generateBalancoFinanceiro`, `generateDVP`, `generateDemonstracaoFluxosCaixa`, `generatePCA`.
- `src/lib/financeiro/report-access.ts`: `canIssueFinancialReports`.
- `src/lib/financeiro/report-definition.ts`: `createFinanceReportDataset`.
- `src/lib/financeiro/report-delivery.ts`: `isFinancialReportType`, `isReportFormat`, `isReportMonth`, `reportRequiresMonth`, `financialReportFilename`, `generateInternalReportDataset`, `reportDatasetCsv`, `generateFinancialReportCsv`, `savePublicFinancialReportSnapshot`.
- `src/lib/financeiro/report-export.ts`: `generateReportPdf`.
- `src/lib/financeiro/report-print.ts`: `generateCommitmentPrintHtml`, `generateSettlementPrintHtml`, `generatePaymentPrintHtml`, `generateRetentionPrintHtml`, `generatePcaPrintHtml`, `generateBalancoFinanceiroPrintHtml`, `generateBudgetComparisonPrintHtml`, `generateBankStatementPrintHtml`.
- `src/lib/financeiro/report-scope.ts`: `resolveFinancialReportScope`, `financialUnitFilter`.
- `src/lib/financeiro/resource-availability.ts`: `readResourceAvailability`.
- `src/lib/financeiro/retencoes.ts`: `calculateRetentions`, `getActiveRetentionRules`, `calculateRetentionDueDate`.
- `src/lib/financeiro/statement-print.ts`: `renderBankStatementPdf`.
- `src/lib/financeiro/yield-engine.ts`: `calculateInvestmentYield`, `transmitYieldToMunicipalSystem`.

### E.10. Planejamento e orçamento — Executivo e Legislativo

- `src/lib/planejamento/access.ts`: `getPlanningContext`, `assertPlanningOperation`, `canDecidePlanningLegally`, `assertPlanningLegalAuthority`, `planningEntityWhere`, `planningInstrumentWhere`, `planningUnitWhere`, `planningLineWhere`.
- `src/lib/planejamento/accounting-bridge.ts`: `configurePlanningInternalAccounting`, `deliverPlanningAccountingCommand`, `synchronizePlanningAccounting`, `configurePlanningInternalExecution`.
- `src/lib/planejamento/activity-relations.ts`: `configureMunicipalActivityRelation`, `readMunicipalServiceRelationships`.
- `src/lib/planejamento/amendments.ts`: `parsePlanningItems`, `setPlanningAmendmentBlock`, `createLegislativePlanningAmendment`, `decideLegislativePlanningAmendment`.
- `src/lib/planejamento/budget-availability.ts`: `getImplantedPlanningBudget`.
- `src/lib/planejamento/catalog-adoption.ts`: `importSharedReferenceCatalog`, `createCanonicalActivityReference`, `adoptMunicipalCatalog`.
- `src/lib/planejamento/catalog-presentation.ts`: `currentPresentationEntries`, `supersededPresentationVersionIds`.
- `src/lib/planejamento/catalog.ts`: `createPlanningCatalog`, `saveRevenueAllocation`.
- `src/lib/planejamento/classification.ts`: `parsePlanningCatalogCsv`, `importPlanningCatalogVersion`, `publishPlanningCatalogVersion`, `planningLineClassification`, `automaticPlanningReducedCode`.
- `src/lib/planejamento/credits.ts`: `createPlanningCreditPreview`, `transitionPlanningCredit`.
- `src/lib/planejamento/document-response.ts`: `planningDocumentResponse`.
- `src/lib/planejamento/document-upload-response.ts`: `planningDocumentUploadResponse`.
- `src/lib/planejamento/documents.ts`: `linkPlanningDocument`, `ingestPlanningDocument`, `requestPlanningDocumentSignatures`, `readPlanningDocument`.
- `src/lib/planejamento/execution-bridge.ts`: `lockPlanningBudgetForAppropriation`, `getPlanningBudgetRestrictions`, `assertPlanningReservationYear`, `assertPlanningPeriodAvailability`, `recordPlanningFinanceExecution`, `readPlanningFinancialExecution`.
- `src/lib/planejamento/fiscal-execution.ts`: `readPlanningRclExecution`, `readPlanningWaiverRealization`, `synchronizePlanningWaiver`.
- `src/lib/planejamento/hearings.ts`: `registerPlanningHearing`, `registerCommunityDemand`, `decideCommunityDemand`.
- `src/lib/planejamento/imports.ts`: `importPlanningLines`, `previewPlanningImport`, `importPlanningStructure`.
- `src/lib/planejamento/legacy-reconciliation.ts`: `reconcilePlanningLegacyAppropriation`.
- `src/lib/planejamento/legislative-bridge.ts`: `linkPlanningLegislativeProcedure`, `advancePlanningLegislativeProcedure`.
- `src/lib/planejamento/lookups.ts`: `planningLookup`.
- `src/lib/planejamento/maintenance.ts`: `maintainPlanningRecord`.
- `src/lib/planejamento/monthly-execution.ts`: `readPlanningMonthlyExecution`.
- `src/lib/planejamento/municipal-data.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/planejamento/navigation.ts`: `planningNavigation`.
- `src/lib/planejamento/operations-core.ts`: `lockLegalInstrument`, `planningAppropriationCode`, `planningProgramCatalog`, `assertWholePiece`, `planningAudit`, `snapshotVersion`, `linePosition`, `applyLineDelta`, `finalizeLegalRevision`.
- `src/lib/planejamento/policy.ts`: `planningLineData`, `planningBasePath`, `projectedValue`, `allocateRevenue`.
- `src/lib/planejamento/projections.ts`: `projectPlanningAnnualMemory`.
- `src/lib/planejamento/publication-response.ts`: `publicPlanningPublicationResponse`.
- `src/lib/planejamento/publication.ts`: `renderPlanningPublication`, `publishPlanningReport`, `withdrawPlanningPublication`, `readPlanningPublishedFile`, `readPlanningArchivedFile`, `listPlanningPublications`, `listPlanningPublicationManagement`.
- `src/lib/planejamento/reduced-codes.ts`: `setPlanningReducedCode`, `reorderPlanningExpenseCodes`.
- `src/lib/planejamento/report-catalog.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/planejamento/report-layouts.ts`: `configurePlanningReportLayout`.
- `src/lib/planejamento/report-presentation.ts`: `planningPdfDataset`.
- `src/lib/planejamento/report-response.ts`: `planningReportResponse`, `planningReportSnapshotResponse`.
- `src/lib/planejamento/reports.ts`: `generatePlanningReport`, `persistPlanningReport`, `readPreservedPlanningReport`, `configurePlanningFiscalReport`, `addPlanningWork`.
- `src/lib/planejamento/revenue-execution-bridge.ts`: `lockPlanningRevenueBudget`, `recordPlanningRevenueCollection`, `recordPlanningRevenueReversal`, `recordPlanningRevenueRedistribution`.
- `src/lib/planejamento/revisions.ts`: `registerPlanningMovement`, `getPlanningMovementHistory`.
- `src/lib/planejamento/scheduling.ts`: `distributePlanningMonths`, `generatePlanningSchedule`, `planningQuotaEvent`, `contingencyPlanningBudget`, `redistributePlanningQuotas`.
- `src/lib/planejamento/service.ts`: `lockPlanningInstrument`, `createPlanningInstrument`, `addPlanningProgram`, `addPlanningAction`, `addPlanningLine`, `addPlanningTransfer`, `addApprovedPlanningLine`, `addAllocatedPlanningRevenue`, `addPlanningMemory`, `addPlanningWaiver`, `configurePlanningEntity`, `listPlanningInstruments`, `getPlanningInstrument`.
- `src/lib/planejamento/versions.ts`: `inspectPlanningPiece`, `planningConsistency`, `transitionPlanningPiece`, `planningCompatibility`, `applyPlanningCompatibility`, `propagatePlanningCompatibility`, `updatePlanningPhysical`, `readPlanningVersion`.
- `src/lib/planejamento/year-rollover.ts`: `copyPlanningYearConfiguration`.

### E.11. Compras, licitações, contratos e convênios

- `src/lib/compras/bidding-number-integrity.ts`: `biddingNumberDuplicateError`.
- `src/lib/compras/bidding-workflow.ts`: `isBiddingModality`, `biddingModalityPrefix`, `biddingSequenceKey`, `normalizeBiddingStatus`, `biddingStatusLabel`, `getAllowedBiddingStatusTransitions`, `assertBiddingStatusTransition`, `canEditBiddingDetails`, `isTerminalBiddingStatus`, `getBiddingPhaseProgress`, `getBiddingPhaseCodeForStatus`, `getBiddingPhasePlan`, `canConfigureBiddingLots`, `canRegisterBiddingParticipant`, `canDecideBiddingEligibility`, `canDecideBiddingResult`, `biddingLotStatusForBiddingStatus`, `isBiddingLotOpen`, `isBiddingParticipantEligible`, `isBiddingBidSubmissionOpen`.
- `src/lib/compras/contract-lifecycle.ts`: `contractBudgetUnitIdsForMutation`, `calculateInclusiveContractTermDays`, `parseContractDate`, `isContractAmendmentType`, `resolveContractAmendmentEffect`, `isInstrumentKind`, `isInstrumentResponsibilityGroupStatus`, `isInstrumentPartyStatus`, `isInstrumentMeasurementStatus`, `isInstrumentInstallmentStatus`, `requiredLifecycleText`, `optionalLifecycleText`, `parseOptionalLifecycleDate`, `assertLifecycleDateRange`, `assertDateWithinInstrumentValidity`, `assertInstrumentAggregateTotalWithinCurrentValue`, `assertPositiveSequence`, `assertOptionalQuantityAndUnit`, `assertEditableMeasurementStatus`, `assertMeasurementStatusTransition`, `assertMeasurementCanBeAttested`, `parseInstrumentPartyReference`.
- `src/lib/compras/price-research.ts`: `createSupplierInvitationAccessKey`, `verifySupplierInvitationAccessKey`, `isSupplierActiveForPriceResearch`, `isSubmittedPriceQuote`, `priceQuoteStatusLabel`, `calculatePriceComparison`, `isPriceResearchResponseOpen`, `createPriceResearch`, `updatePriceResearchDeadline`, `closePriceResearch`, `deletePriceResearch`, `inviteSupplierToPriceResearch`, `saveSupplierPriceQuoteDraft`, `submitSupplierPriceQuote`, `getSupplierPriceResearchPortalAccess`, `getSupplierPriceQuoteReportAccess`.
- `src/lib/compras/procurement-finance-bridge.ts`: `buildProcurementFinanceIdempotencyKey`, `isContractSupplyAuthorizationEligible`, `isPurchaseReceiptLiquidationAuthorizationEligible`, `isInstrumentMeasurementLiquidationAuthorizationEligible`, `buildExpenseAuthorizationPlan`, `deriveExpenseAuthorizationsForContract`, `recordSupplyAuthorizationForContract`, `recordPurchaseReceiptLiquidationAuthorization`, `recordInstrumentMeasurementLiquidationAuthorization`, `createCommitmentFromExpenseAuthorization`, `createSettlementFromPurchaseReceiptAuthorization`, `createSettlementFromInstrumentMeasurementAuthorization`, `cancelSupplyAuthorizationForContract`, `cancelPurchaseReceiptLiquidationAuthorization`, `cancelInstrumentMeasurementLiquidationAuthorization`, `cancelCommitmentForCancelledContract`, `cancelSettlementAfterPurchaseReceiptCancellation`, `cancelSettlementAfterInstrumentMeasurementCancellation`.
- `src/lib/compras/procurement-lifecycle.ts`: `createMaterialRequest`, `approvePurchaseRequest`, `createPurchaseProcessFromApprovedRequests`, `createPurchaseProcessFromApprovedRequest`, `approvePurchaseReceipt`, `approveMaterialRequest`, `issueMaterialRequestItem`, `issueMaterialRequestInFull`.
- `src/lib/compras/purchase-planning.ts`: `isPurchasePlanningStatus`, `normalizePurchasePlanningInput`.
- `src/lib/compras/purchase-process-origins.ts`: `aggregatePurchaseRequestItems`.
- `src/lib/compras/purchase-request-budget.ts`: `normalizePurchaseRequestItemBudgetAllocations`, `assertPurchaseRequestItemBudgetAllocations`, `totalPurchaseRequestBudgetAllocations`.
- `src/lib/compras/purchase-request-policy.ts`: `canSelectAnyPurchaseRequestOrigin`, `purchaseRequestOriginScope`, `assertPurchaseRequestOrigin`, `canManagePurchaseRequest`.
- `src/lib/compras/shared-catalog.ts`: `syncMaterialCatalog`, `saveSharedCatalogItem`.

### E.12. Recursos humanos e folha

- `src/lib/rh/absence-conflicts.ts`: `assertRhAbsenceDoesNotOverlap`.
- `src/lib/rh/advance-document.ts`: `buildMunicipalAdvanceDocument`.
- `src/lib/rh/attendance-payroll.ts`: `generateAttendanceOvertime`.
- `src/lib/rh/attendance-reconciliation.ts`: `attendancePostingKey`, `reconcileAttendanceSources`.
- `src/lib/rh/benefit-calculation.ts`: `calculateDailyBenefit`, `generateBenefitMovement`.
- `src/lib/rh/calculation-engine.ts`: `evaluatePayrollFormula`, `calculateContribution`, `allocatePayrollAmount`, `calculateContractRubrics`, `payrollPeriod`.
- `src/lib/rh/civil-service-calendar.ts`: `civilAnniversary`, `completedCivilServiceYears`.
- `src/lib/rh/consignment-margin.ts`: `calculateConsignmentMargin`.
- `src/lib/rh/consignment-service.ts`: `assertConsignmentSchedulePosted`, `reserveConsignmentAgreement`, `reserveConsignmentAgreementInTransaction`, `postConsignmentInstallment`, `cancelConsignmentInstallment`.
- `src/lib/rh/contract-custom-fields.ts`: `contractCustomFieldsPolicyHash`, `validateContractCustomFields`.
- `src/lib/rh/contract-timeline.ts`: `resolveContractRevision`.
- `src/lib/rh/credit-requests.ts`: `submitEmployeeCreditRequest`, `decideEmployeeCreditRequest`.
- `src/lib/rh/dependent-eligibility.ts`: `evaluateDependentEligibility`, `assessPayrollDependents`.
- `src/lib/rh/dependent-service.ts`: `saveCanonicalDependent`.
- `src/lib/rh/employee-person.ts`: `resolveEmployeePerson`.
- `src/lib/rh/employment-lifecycle.ts`: `applyPocEmploymentLifecycle`.
- `src/lib/rh/external-configuration.ts`: `saveHrExternalConfiguration`, `describeHrExternalReadiness`.
- `src/lib/rh/finance-bridge.ts`: `planPayrollExpenses`, `dispatchPayrollExpenseRequests`, `commitPayrollExpenseRequests`, `settlePayrollCommitments`, `payPayrollSettlements`, `concludePayrollFinanceCycle`, `reversePayrollCommitments`.
- `src/lib/rh/functional-occurrences.ts`: `assertPersonnelActNotIntegrated`, `registerFunctionalOccurrence`, `cancelFunctionalOccurrence`.
- `src/lib/rh/income-tax.ts`: `calculateIncomeTax`.
- `src/lib/rh/list-pagination.ts`: `rhPagination`, `rhPageHref`.
- `src/lib/rh/monthly-proration.ts`: `resolveMonthlyContractSegments`, `calculateProratedMonthlyRubrics`.
- `src/lib/rh/movement-import.ts`: `parsePayrollMovementImport`, `importPayrollMovements`.
- `src/lib/rh/municipal-advances.ts`: `receivePriorYearAdvanceRefund`, `receivePriorYearTravelRefund`, `assertAdvanceRefundReversalAllowed`, `recordAdvanceRefundReversal`, `requestMunicipalAdvance`, `recordAdvanceConcession`, `submitAdvanceReport`, `reviewAdvanceReport`, `reverseAdvancePaymentControl`, `reverseAdvanceCommitmentControl`, `reopenAdvanceReport`.
- `src/lib/rh/obligation-export.ts`: `renderObligationExport`, `generateObligationExport`, `readObligationExport`.
- `src/lib/rh/obligation-history.ts`: `buildObligationHistory`.
- `src/lib/rh/partner-discounts.ts`: `listOwnPartnerDiscountGrants`, `reservePartnerDiscount`, `listOwnPartnerDiscounts`, `postPartnerDiscount`.
- `src/lib/rh/payroll-access.ts`: `accessiblePayrollWhere`, `assertPayrollBudgetScope`.
- `src/lib/rh/payroll-configuration.ts`: `parseRuleValue`, `serializeHrConfigurationSnapshot`, `getOrCreateHrConfigurationInstance`, `ensureHrPayrollDemoRuleSet`, `toDecimal`, `arePortalPayrollStatementsEnabled`.
- `src/lib/rh/payroll-labels.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/rh/payroll-payment-allocation.ts`: `allocateConfirmedPayrollPayment`.
- `src/lib/rh/payroll-pensions.ts`: `calculatePayrollPensions`.
- `src/lib/rh/payroll-provisions.ts`: `calculatePayrollProvisions`, `postPayrollProvisions`, `reversePayrollProvision`.
- `src/lib/rh/pension-configuration.ts`: `configurePayrollPensions`.
- `src/lib/rh/poc-bootstrap.ts`: `installDocumentaryPocParameters`, `prepareDocumentaryPocDataset`.
- `src/lib/rh/poc-payment.ts`: `registerPocPayment`, `buildPocAnnualIncomeReport`.
- `src/lib/rh/poc-special-payroll.ts`: `countThirteenthAvos`, `preparePocSpecialRubrics`.
- `src/lib/rh/portal-requests.ts`: `submitEmployeeHrRequest`, `decideEmployeeHrRequest`.
- `src/lib/rh/position-plan.ts`: `positionContractSegments`, `assessPositionPlan`, `assertPositionPlanForContract`, `inspectPositionPlan`.
- `src/lib/rh/prorated-statement-locations.ts`: `allocateProratedStatementLocations`.
- `src/lib/rh/provision-accounting.ts`: `reverseProvisionAccrualAccounting`, `accountPayrollProvision`, `releasePayrollProvisionsAtSettlement`, `reversePayrollProvisionSettlement`, `recordPayrollProvisionPayment`, `reversePayrollProvisionPayment`.
- `src/lib/rh/provision-commitment.ts`: `consumeProvisionsAtCommitment`, `reverseProvisionCommitmentConsumption`.
- `src/lib/rh/receipt-messages.ts`: `selectReceiptMessages`.
- `src/lib/rh/recertification-canonicalization.ts`: `reconcileProposedDependentPerson`.
- `src/lib/rh/recertification-details.ts`: `validateRecertificationSections`, `captureRecertificationDetails`, `applyRecertificationDetails`.
- `src/lib/rh/recertification.ts`: `listMyRecertificationCampaigns`, `assertRecertificationReviewScope`, `requestRecertificationCorrection`, `listRecertificationProgress`, `submitRecertificationProposal`, `decideRecertificationProposal`.
- `src/lib/rh/recruitment-service.ts`: `listPublicRecruitmentNotices`, `saveRecruitmentNotice`, `submitRecruitmentApplication`, `readOwnRecruitmentApplications`, `listRecruitmentApplicationsForReview`, `decideRecruitmentApplication`.
- `src/lib/rh/remuneration-average.ts`: `selectRemunerationAverage`, `calculateRemunerationAverage`.
- `src/lib/rh/report-service.ts`: `buildHrReport`, `renderHrReport`.
- `src/lib/rh/role-legal-history.ts`: `recordRoleLegalHistory`.
- `src/lib/rh/service-right-query.ts`: `listServiceRightLedger`.
- `src/lib/rh/service-rights.ts`: `calculateServiceAcquisitions`, `acquireServiceRights`, `reserveServiceRight`, `cancelServiceReservation`.
- `src/lib/rh/service-time-allowance.ts`: `calculateServiceTimeAllowance`, `registerServiceTimeCredit`, `reverseServiceTimeCredit`, `postServiceTimeAllowance`, `reverseServiceTimeAllowance`, `assertServiceTimeAllowanceCurrent`.
- `src/lib/rh/special-payroll-finality.ts`: `recognizeSpecialPayrollFinality`.
- `src/lib/rh/special-payroll-history.ts`: `loadSpecialPayrollHistory`.
- `src/lib/rh/special-simulation.ts`: `simulateSpecialPayroll`.
- `src/lib/rh/statement-service.ts`: `getPayrollStatement`, `renderPayrollStatementPdf`.
- `src/lib/rh/time-bank-expiration.ts`: `calculateTimeBankLots`, `expireTimeBankLots`.
- `src/lib/rh/time-bank-payment.ts`: `convertTimeBankToPayroll`, `reverseTimeBankPayment`.
- `src/lib/rh/time-bank-transfer.ts`: `transferTimeBank`, `reverseTimeBankTransfer`.
- `src/lib/rh/time-bank.ts`: `validateTimeBankBalances`, `generateAttendanceTimeBank`, `reverseAttendanceTimeBank`.
- `src/lib/rh/travel-allowance.ts`: `assertTravelAllowanceAccess`, `assertTravelReportOperationDate`, `calculateTravelAllowance`, `requestTravelAllowance`, `decideTravelAllowance`, `accountForTravelAllowance`, `reopenTravelAllowanceReport`, `buildTravelAllowanceDocument`.
- `src/lib/rh/travel-finance.ts`: `dispatchTravelAllowanceExpense`.
- `src/lib/rh/travel-process.ts`: `openTravelAllowanceProcess`, `completeTravelAllowanceProcess`, `rejectTravelAllowanceProcess`.
- `src/lib/rh/vacation-entitlement.ts`: `vacationDaysForAbsences`.
- `src/lib/rh/vacation-multiple-periods.ts`: `reserveMultipleVacationPeriods`, `cancelMultipleVacationPeriods`.
- `src/lib/rh/vacation-payroll-link.ts`: `loadVacationPayrollReservations`.
- `src/lib/rh/vacation-rights.ts`: `acquireVacationRights`, `reserveVacationRight`, `reserveVacationRightInTransaction`, `cancelVacationReservation`.
- `src/lib/rh/workforce-service.ts`: `saveEmploymentContract`, `saveEmploymentContractInTransaction`, `adjustContractSalaries`, `changeContractsCollectively`, `savePayrollMovement`, `enqueueHrIntegration`, `calculatePayrollRun`, `closePayrollRun`, `cancelPayrollRun`, `publishPayrollStatements`, `recordHrRightEntry`.

### E.13. Portal do servidor

- `src/lib/portal-servidor/access.ts`: `getEmployeePortalAccess`.
- `src/lib/portal-servidor/attendance-totals.ts`: `configuredAttendanceTotals`.
- `src/lib/portal-servidor/birthday-service.ts`: `listFunctionalBirthdays`.
- `src/lib/portal-servidor/career-service.ts`: `listOwnCareerActivities`, `enrollOwnCourse`, `completeFunctionalCourse`, `submitOwnFunctionalEvaluation`, `submitCommissionEvaluation`, `saveCareerPolicy`.
- `src/lib/portal-servidor/clock-service.ts`: `getOwnClockPolicy`, `recordOwnClock`.
- `src/lib/portal-servidor/department-certificates.ts`: `registerDepartmentCertificate`, `readDepartmentCertificateReceipt`.
- `src/lib/portal-servidor/document-policy.ts`: `renderFunctionalTemplate`.
- `src/lib/portal-servidor/document-publication.ts`: `publishFunctionalDocument`, `revokeFunctionalDocument`, `listOwnPublishedDocuments`.
- `src/lib/portal-servidor/document-sources.ts`: `recognizedServiceDays`, `buildFunctionalDocumentSource`.
- `src/lib/portal-servidor/evaluation-results.ts`: `publishFunctionalEvaluationResult`, `listOwnPublishedEvaluationResults`, `evaluationResultRows`.
- `src/lib/portal-servidor/functional-requests.ts`: `submitFunctionalRequest`, `readOwnFunctionalRequest`, `requestFunctionalComplement`, `submitFunctionalComplement`, `decideFunctionalRequest`, `completeFunctionalDocumentRequest`.
- `src/lib/portal-servidor/generated-documents.ts`: `functionalSourceHash`, `listOwnDocumentModels`, `issueOwnFunctionalDocument`, `readOwnGeneratedDocument`, `manageGeneratedDocument`, `verifyGeneratedDocument`.
- `src/lib/portal-servidor/login-policy.ts`: `assertEmployeePortalLogin`.
- `src/lib/portal-servidor/management.ts`: `saveManagedPortalPolicy`, `saveUploadRetention`.
- `src/lib/portal-servidor/medical-agenda.ts`: `listOwnMedicalAgenda`, `bookOwnMedicalAppointment`, `cancelOwnMedicalAppointment`, `readOwnMedicalAppointment`.
- `src/lib/portal-servidor/own-accident.ts`: `readOwnAccident`, `ownAccidentStates`.
- `src/lib/portal-servidor/payroll-publication.ts`: `payrollSnapshotHash`, `personalStatementPublicationAllowed`, `ownReleasedStatementIds`, `publishPayrollByFunctionalPolicy`, `savePayrollPublicationPolicy`, `revokeFunctionalStatement`.
- `src/lib/portal-servidor/personal-reports.ts`: `buildOwnPersonalReport`.
- `src/lib/portal-servidor/publication-contract.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/portal-servidor/receipt-verification.ts`: `readOwnVerifiedReceipt`, `verifyPublicReceipt`.
- `src/lib/portal-servidor/routes.ts`: `isEmployeePublicRoute`, `employeePortalDestination`.
- `src/lib/portal-servidor/service-catalog.ts`: `listFunctionalServices`, `saveFunctionalService`, `validateFunctionalValues`.
- `src/lib/portal-servidor/source-manifest.ts`: `makeFunctionalSourceManifest`, `functionalSourceManifestIsCurrent`.
- `src/lib/portal-servidor/upload-maintenance.ts`: `cleanUnusedFunctionalUploads`.

### E.14. Segurança e medicina do trabalho

- `src/lib/sst/access.ts`: `sstUnitWhere`, `assertSstClinicalAccess`.
- `src/lib/sst/accident-errors.ts`: `accidentActionError`.
- `src/lib/sst/accident-layout-pdf.ts`: `loadOfficialCatTemplate`, `renderOfficialCatPdf`.
- `src/lib/sst/accident-layout-policy.ts`: `validateCatLayoutFields`.
- `src/lib/sst/accident-layout-service.ts`: `readLatestCatLayout`, `catLayoutCanonicalDefaults`, `saveCatLayout`, `readCatLayoutForEsocial`, `readCatLayoutRegistration`.
- `src/lib/sst/accident-policy.ts`: `exactDecimal`, `assertHomologation`, `assertRetry`.
- `src/lib/sst/accident-service.ts`: `assertAccidentOperation`, `readCat`, `registerAccident`, `listAccidents`, `readAccidentEvidence`, `readAccidentState`, `listAccidentEvidence`, `assertAccidentPhysician`, `addAccidentEvidence`, `addAccidentLedger`, `readAccidentLedger`, `readCatForEsocial`.
- `src/lib/sst/agenda-policy.ts`: `availableSlots`.
- `src/lib/sst/agenda-service.ts`: `createMedicalBoard`, `createAvailability`, `bookAppointment`, `blockAvailability`, `cancelAppointment`.
- `src/lib/sst/aso-flow-access.ts`: `asoDocumentOwners`.
- `src/lib/sst/aso-flow-document.ts`: `archiveAsoDocument`.
- `src/lib/sst/aso-flow-policy.ts`: `assertAsoProfessional`, `secondVacationWarning`, `asoCorrectionVersion`.
- `src/lib/sst/aso-flow-registration.ts`: `prepareAsoFlow`.
- `src/lib/sst/aso-flow-service.ts`: `saveAsoFlowSettings`, `registerVacationConcessionSource`, `readAsoFollowUp`, `correctAso`.
- `src/lib/sst/aso-policy.ts`: `asoOccasion`, `assertAsoProgram`, `formatSstCivilDate`.
- `src/lib/sst/aso-service.ts`: `registerAso`.
- `src/lib/sst/benefit-fiscal.ts`: `benefitFiscalReadiness`.
- `src/lib/sst/benefit-integration.ts`: `buildBenefitCandidate`, `reconcileBenefitAmounts`.
- `src/lib/sst/benefit-policy.ts`: `competenceInterval`, `benefitCoversCompetence`, `summarizeBenefitLedger`.
- `src/lib/sst/benefit-posting.ts`: `postBenefitEntry`, `postBenefitPayrollBatch`, `registerBenefitPayrollScope`, `registerBenefitPayrollMapping`, `cancelBenefitCharge`.
- `src/lib/sst/benefit-query.ts`: `listBenefitBeneficiaries`, `readBenefitStatement`, `readBenefitReconciliation`.
- `src/lib/sst/benefit-service.ts`: `registerHealthPlan`, `registerBenefitBeneficiary`, `registerBenefitEntry`, `generateBenefitMonthly`.
- `src/lib/sst/certificate-policy.ts`: `assertCertificateReason`, `absenceMinutes`.
- `src/lib/sst/certificate-service.ts`: `registerCertificate`, `registerCertificateReason`, `assessCertificate`, `updateCertificateReason`.
- `src/lib/sst/clinical-access.ts`: `assertDisciplineAccess`, `disciplineUnitWhere`.
- `src/lib/sst/clinical-policy.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/sst/clinical-service.ts`: `listClinicalRecords`, `listOccupationalVaccinations`, `clinicalRecordDocument`, `registerDisciplineGrant`, `registerProfessionalRole`, `registerClinicalRecord`, `registerOccupationalVaccination`.
- `src/lib/sst/closure-document.ts`: `emitClosureDocument`.
- `src/lib/sst/closure-policy.ts`: `missingPeriods`, `closurePage`.
- `src/lib/sst/closure-service.ts`: `pppReport`, `portalPppReport`, `functionalSstReport`.
- `src/lib/sst/equipment-policy.ts`: `equipmentDueDate`, `equipmentUsageDays`, `weightedEquipmentAverage`.
- `src/lib/sst/equipment-queries.ts`: `equipmentPageNumber`, `equipmentScope`, `listEquipment`, `listEquipmentDeliveries`, `getEquipmentDelivery`, `equipmentUsageReport`, `equipmentRequirementsReport`.
- `src/lib/sst/equipment-service.ts`: `registerEquipment`, `setEquipmentStockPolicy`, `registerEquipmentDelivery`, `registerEquipmentEvent`, `mapEquipmentRequirement`.
- `src/lib/sst/errors.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/sst/esocial-contract.ts`: `hashSource`, `exchangeVerified`, `buildValidatedXml`, `verifyExchangeResponse`.
- `src/lib/sst/esocial-service.ts`: `integrationUnits`, `configureEsocial`, `prepareEsocial`, `readEsocialEvent`, `listEsocialEvents`, `transmitEsocial`.
- `src/lib/sst/esocial-source.ts`: `loadEsocialSource`.
- `src/lib/sst/exposure-policy.ts`: `exposureMemberWhere`.
- `src/lib/sst/functional-certificate-list.ts`: `listCertificatesWithFunctionalFilters`.
- `src/lib/sst/functional-certificate-service.ts`: `appendReasonRegimePolicy`, `saveReasonRegimePolicy`, `certificateFunctionalSource`, `confirmCertificateLeave`, `assertCertificateHistoricalSource`, `assertCertificatePayrollReconciliation`, `reviseCertificateDecision`.
- `src/lib/sst/functional-leave-policy.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/sst/functional-leave-posting.ts`: `reconcileCertificateLeavePayroll`.
- `src/lib/sst/functional-payroll-origin.ts`: `getAuthorizedCertificateLeaveOrigin`.
- `src/lib/sst/functional-policy.ts`: `matchesHistoricalExposure`, `historicalIntersection`.
- `src/lib/sst/functional-report-export.ts`: `exportCertificateReport`.
- `src/lib/sst/functional-service.ts`: `functionalAuthorizedScope`, `registerVerifiedEntityMapping`, `registerFunctionalPeriod`, `listFunctionalPeriods`, `getAuthorizedHistoricalExposure`.
- `src/lib/sst/ppp-final-service.ts`: `approvePppTechnicalData`, `buildOwnFinalPppSource`.
- `src/lib/sst/prevention-fields.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/sst/prevention-policy.ts`: `participationPercent`.
- `src/lib/sst/prevention-service.ts`: `createPrevention`, `getPrevention`, `preventionLinks`, `extinguisherValidity`, `listPrevention`, `updateMeeting`, `cipaCalendar`, `registerCipaCandidate`, `voteCipa`, `electionResults`, `portalElections`.
- `src/lib/sst/program-policy.ts`: `occupationalRiskScore`.
- `src/lib/sst/program-service.ts`: `registerOccupationalProgram`.
- `src/lib/sst/questionnaire-policy.ts`: `validateQuestionnaireAnswers`, `formatQuestionnaireAnswer`.
- `src/lib/sst/questionnaire-service.ts`: `registerQuestionnaireVersion`, `registerAnamnesis`.
- `src/lib/sst/report-service.ts`: `reportCivilRange`, `certificateReport`.
- `src/lib/sst/restriction-cron-service.ts`: `restrictionCronScope`, `runRestrictionExpiryCron`.
- `src/lib/sst/restriction-email-provider.ts`: `restrictionCronAuthorized`, `configuredRestrictionEmailSender`.
- `src/lib/sst/restriction-policy.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/sst/restriction-service.ts`: `readRestriction`, `registerRoleAttribute`, `registerRestriction`, `addRestrictionFollowup`, `listRestrictions`, `readRestrictionFollowups`, `listRestrictionFollowups`, `dispatchRestrictionEmails`.
- `src/lib/sst/service-order-policy.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/sst/service-order-service.ts`: `registerTechnicalResponsibility`, `registerServiceOrder`, `revokeFoundationalRecord`, `listServiceOrders`, `getServiceOrder`.

### E.15. Almoxarifado e patrimônio

- `src/lib/patrimonio/asset-acquisition-service.ts`: `normalizeAssetAcquisitionInput`, `acquireAssetFromPurchaseReceipt`.
- `src/lib/patrimonio/asset-lifecycle.ts`: `normalizeReferenceMonth`, `calculateStraightLineDepreciation`, `calculateAssetDisposal`, `calculateAssetValueAdjustment`, `depreciateAssetsForMonth`, `recordAssetValueAdjustment`, `recordAssetDisposal`.
- `src/lib/patrimonio/asset-operations.ts`: `assetOperationWhere`, `operateAsset`.
- `src/lib/patrimonio/equipment-custody.ts`: `recordEquipmentCustody`.
- `src/lib/patrimonio/identifiers.ts`: `isCatalogMaterialType`, `materialTypeLabel`, `nextMaterialCode`, `nextEquipmentCode`, `nextAssetPatrimonyNumber`, `previewNextAssetPatrimonyNumber`.
- `src/lib/patrimonio/inventory-service.ts`: `createInventorySession`, `recordInventoryCount`, `submitInventoryForApproval`, `closeApprovedInventory`.
- `src/lib/patrimonio/material-units.ts`: `normalizeMaterialUnit`.
- `src/lib/patrimonio/stock-consumption-accounting.ts`: `postStockConsumptionAccounting`.
- `src/lib/patrimonio/stock-service.ts`: `normalizeStockMovement`, `applyStockMovement`, `recordStockMovement`, `returnStockMovement`, `reverseStockMovement`, `reverseStockMovementInTransaction`.
- `src/lib/patrimonio/stock-valuation.ts`: `lockStockValuation`, `reconcileStockValuation`, `prepareStockValuation`, `commitStockValuation`.
- `src/lib/patrimonio/valuation-accounting.ts`: `resolveAssetValuationScope`, `assertAssetValuationOrigin`, `postAssetValuation`.
- `src/lib/patrimonio/valuation-reversal.ts`: `reverseAssetValuation`.

### E.16. Frotas, veículos e máquinas

- `src/lib/frotas/contract.ts`: `fleetMutationOperation`, `dateOnly`, `todayInBrazil`, `nextOccurrence`.
- `src/lib/frotas/control-access.ts`: `lockFleetResources`, `scopedFleetUnit`, `scopedFleetDriver`, `eligibleFleetDriver`, `fleetControlReading`, `scopedFleetEvidence`, `nextFleetCode`, `assertFleetVersion`.
- `src/lib/frotas/control-attachments.ts`: `fleetAttachmentPrefix`, `validateFleetAttachmentName`, `authorizeFleetAttachment`, `registerFleetAttachment`, `downloadFleetAttachment`, `withdrawFleetAttachment`, `fleetAttachmentCallbackContext`.
- `src/lib/frotas/control-catalog.ts`: `saveFleetUnitControl`, `saveFleetDriver`, `importFleetCatalog`.
- `src/lib/frotas/control-driver-portal.ts`: `getFleetDriverPortal`, `operateFleetDriverPortal`.
- `src/lib/frotas/control-external.ts`: `throttleFleetExternal`, `submitFleetExternal`.
- `src/lib/frotas/control-fuel.ts`: `fleetProvider`, `saveFleetProvider`, `saveFleetFuelAgreement`, `saveFleetQuota`, `issueFleetFuel`, `cancelFleetAuthorization`, `renewFleetCredential`, `confirmFleetFuel`.
- `src/lib/frotas/control-incidents.ts`: `registerFleetFine`, `changeFleetFineStatus`, `recordFleetFinePayment`, `reverseFleetFinePayment`, `registerFleetOccurrence`, `openFleetClaim`, `changeFleetClaim`.
- `src/lib/frotas/control-maintenance.ts`: `issueFleetService`, `reviewFleetWorkshop`, `executeFleetService`, `saveFleetComponent`, `installFleetComponent`, `removeFleetComponent`.
- `src/lib/frotas/control-motion.ts`: `createFleetBooking`, `cancelFleetBooking`, `departFleetTrip`, `arriveFleetTrip`, `validateFleetHistoricalUsage`.
- `src/lib/frotas/control-policy.ts`: `readingError`, `consumptionAverage`, `consumptionClassification`, `newFleetCapability`, `fleetCapabilityHash`, `validFleetCapability`, `stableFleetHash`, `validateMachineValues`.
- `src/lib/frotas/control-queries.ts`: `fleetControlUnitWhere`, `queryFleetControl`, `fleetControlReferences`.
- `src/lib/frotas/control-report.ts`: `buildFleetControlReport`.
- `src/lib/frotas/control-service.ts`: `fleetControlPermission`, `mutateFleetControl`.
- `src/lib/frotas/indicators.ts`: `getFleetExpenseIndicators`.
- `src/lib/frotas/page-errors.ts`: `fleetPageIssue`.
- `src/lib/frotas/queries.ts`: `queryFleet`, `fleetReferences`.
- `src/lib/frotas/report.ts`: `createFleetReportDataset`, `renderFleetPdf`, `issueFleetReport`.
- `src/lib/frotas/service.ts`: `fleetScope`, `departmentWhere`, `mutateFleet`.

### E.17. Educação

- `src/lib/educacao/s1.ts`: `normalizeDigits`, `parseEducacensoFile`, `validateEducacensoRows`, `intervalsOverlap`, `validateScheduleInterval`, `makeSupportCode`.

### E.18. Saúde pública

- `src/lib/saude/admin-contract.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/saude/appointment-documents.ts`: `appointmentReceipt`.
- `src/lib/saude/appointment-policy.ts`: `parseHealthAppointmentStatus`, `assertHealthAppointmentTransition`, `assertHealthAppointmentCanBeCompleted`, `assertHealthAppointmentCanBeCompletedAt`, `isBlockingHealthAppointmentStatus`, `parseBrazilDateTime`.
- `src/lib/saude/appointment-service.ts`: `runHealthTransaction`, `createHealthAppointment`, `createHealthAppointmentInTransaction`, `transitionHealthAppointment`, `createSpontaneousCare`, `registerHealthTriage`, `callHealthAppointment`, `completeHealthAppointment`.
- `src/lib/saude/billing-document-service.ts`: `healthBillingDocument`.
- `src/lib/saude/billing-price-service.ts`: `publishHealthProcedurePrices`, `resolveHealthProcedurePrice`.
- `src/lib/saude/billing-report-service.ts`: `healthBillingPreview`, `healthPatientConsumptionCost`.
- `src/lib/saude/care-contract.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/saude/care-lines-policy.ts`: `pregnancyDating`, `assertDentalTarget`.
- `src/lib/saude/care-lines-service.ts`: `openPregnancy`, `recordPrenatalVisit`, `closePregnancy`, `recordChronicAssessment`, `saveClinicalScreening`, `recordDentalMark`, `scheduleTherapySessions`, `transitionTherapySession`.
- `src/lib/saude/care-network-service.ts`: `saveHealthProfessionalContact`, `saveProfessionalWorkingHours`, `saveHealthMaintainer`, `configureHealthUnitNetwork`, `saveHealthCareAgreement`, `saveHealthCareCoverage`.
- `src/lib/saude/care-program-service.ts`: `saveHealthCareProgram`, `enrollInHealthCareProgram`, `closeHealthCareProgramEnrollment`.
- `src/lib/saude/care-service.ts`: `startHealthCare`, `saveMedicalRecordNarrative`, `addClinicalEvolution`, `addHealthDiagnosis`, `addHealthPrescription`, `addHealthExamRequest`, `addPerformedProcedure`, `addHealthReferral`, `concludeHealthCare`, `addHealthClinicalDocument`.
- `src/lib/saude/clinical-document-service.ts`: `saveClinicalDocumentTemplate`, `issueClinicalDocument`.
- `src/lib/saude/clinical-extension-service.ts`: `clinicalRecordForActor`, `savePatientClinicalCondition`, `saveOngoingMedication`, `saveClinicalQuestionnaire`, `answerClinicalQuestionnaire`, `administerClinicalMedication`, `reviewClinicalExam`, `recordCounterreference`, `reviseCompletedCare`, `configureCareRevisionWindow`, `assertRequiredClinicalQuestionnaires`, `saveSpecialtyProcedureRule`, `configureClinicalBiometry`, `internallyReferCare`.
- `src/lib/saude/clinical-questionnaire-policy.ts`: `clinicalConditionQuestionnaireKeys`.
- `src/lib/saude/contract.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/saude/followup-contract.ts`: `canonicalFollowupJson`, `followupHash`, `followupRecordVersion`, `followupRecordKey`, `followupJsonSchema`.
- `src/lib/saude/followup-exchange-service.ts`: `followupBindingForActor`, `assertFollowupConnection`, `configureHealthFollowup`, `followupBatchForActor`, `generateHealthFollowupBatches`.
- `src/lib/saude/followup-presentation.ts`: `followupPresentation`, `followupCsvCell`.
- `src/lib/saude/followup-receiver-service.ts`: `processHealthFollowupBatch`.
- `src/lib/saude/followup-source-service.ts`: `collectFollowupSources`.
- `src/lib/saude/health-access-policy.ts`: `isHealthAccessScopeValid`, `getHealthAccessAt`, `getCurrentHealthUnitIds`, `isStrongHealthPassword`.
- `src/lib/saude/health-indicator-document.ts`: `healthIndicatorDocument`.
- `src/lib/saude/health-indicator-service.ts`: `indicatorPeriod`, `indicatorPercentage`, `healthCareIndicators`, `healthAnnualSeries`.
- `src/lib/saude/health-merge-policy.ts`: `normalizeMergeText`, `assertPatientMergeCriteria`, `assertProfessionalMergeCriteria`, `assertAddressMergeCriteria`.
- `src/lib/saude/health-merge-service.ts`: `executeHealthAdministrativeMerge`.
- `src/lib/saude/health-report-catalog.ts`: `isHealthAdministrativeReportType`, `getHealthReportOption`.
- `src/lib/saude/health-report-extra.ts`: `createExtendedRows`.
- `src/lib/saude/health-report-policy.ts`: `calculateMunicipalityPercentages`.
- `src/lib/saude/health-report-service.ts`: `healthReportFilename`.
- `src/lib/saude/health-stock-service.ts`: `postHealthStockReceipt`, `configureHealthReceiptApproval`, `approveHealthStockReceipt`, `dispatchHealthStockTransfer`, `receiveHealthStockTransfer`, `dispensePrescriptionItem`, `importHealthProducts`, `reconcileStockBalance`, `saveStockPolicy`, `writeOffHealthStock`.
- `src/lib/saude/indicator-context.ts`: `captureCareIndicatorContext`, `classifyHealthTeam`, `consultationKind`.
- `src/lib/saude/laboratory-service.ts`: `scheduleLabOrder`, `collectLabSample`, `requestLabRecollection`, `enterLabResult`, `createLabReport`, `reviewLabReport`, `releaseLabReport`, `recordDeviceMessage`.
- `src/lib/saude/patient-address-service.ts`: `savePatientAddress`.
- `src/lib/saude/patient-portal-service.ts`: `portalAppointments`, `portalRequestAppointment`, `portalOpenSchedules`, `portalTransitionAppointment`, `portalVaccinations`, `portalDispensations`, `portalLabReports`, `portalReferralsRegulation`, `portalDocuments`, `portalUpdateContact`, `portalCreateManifestation`, `portalManifestations`.
- `src/lib/saude/patient-registration-policy.ts`: `ageOn`, `cpfRequired`, `registrationValidity`.
- `src/lib/saude/patient-registration-service.ts`: `getPatientRegistrationPolicy`, `configurePatientRegistration`, `validateRegistrationIdentity`, `assertPatientRegistrationCurrent`, `scopedPatient`, `savePatientRegistrationDetails`, `recordPatientDeath`, `recordPatientDeathInTransaction`, `savePatientContact`, `recordPatientPhoneCall`.
- `src/lib/saude/patient-timeline-service.ts`: `listPatientTimeline`.
- `src/lib/saude/pharmacy-catalog-service.ts`: `saveDcbSubstance`, `savePharmacyProductCatalog`, `saveCatmatUnitMapping`, `pharmacyQuantityInOfficialUnits`.
- `src/lib/saude/pharmacy-dispensation-service.ts`: `pharmacyDispensationAccess`, `prescriptionDispensationTx`, `dispenseElectronicPrescription`, `manualDispensationTx`, `dispenseManualMedicine`, `cancelMedicineDispensation`, `cancelKitDispensationInTransaction`, `correctMedicineDispensation`.
- `src/lib/saude/pharmacy-inventory-service.ts`: `startPharmacyInventory`, `countPharmacyInventory`, `submitPharmacyInventory`, `closePharmacyInventory`.
- `src/lib/saude/pharmacy-invoice-service.ts`: `importPharmacyInvoice`.
- `src/lib/saude/pharmacy-invoice.ts`: `parsePharmacyInvoice`.
- `src/lib/saude/pharmacy-judicial-document.ts`: `pharmacyJudicialStatement`.
- `src/lib/saude/pharmacy-judicial-service.ts`: `savePharmacyLawyer`, `createPharmacyJudicialCase`, `transitionPharmacyJudicialCase`, `renewPharmacyJudicialCase`, `assertJudicialDispensation`.
- `src/lib/saude/pharmacy-kit-service.ts`: `savePharmacyKit`, `generatePharmacyKits`, `deliverPharmacyKit`, `recordUncollectedPharmacyKit`, `returnPharmacyKit`.
- `src/lib/saude/pharmacy-request-policy.ts`: `lockPharmacyRequestItem`, `updateFulfilledQuantity`, `assertPatientPharmacyRequest`, `recordPharmacyRequestFulfillment`, `lockDispensationPharmacyRequest`, `cancelDispensationPharmacyRequest`, `assertPharmacyRequestTransfer`.
- `src/lib/saude/pharmacy-request-service.ts`: `createPharmacyStockRequest`, `fulfillPatientPharmacyRequest`, `cancelPharmacyProductFulfillment`, `cancelPharmacyStockRequest`.
- `src/lib/saude/prescription-service.ts`: `prescribeClinicalLineTx`, `savePrescriptionTemplate`, `applyPrescriptionTemplate`, `regroupPrescriptionItem`, `setClinicalPrescriptionValidity`.
- `src/lib/saude/primary-care-contract.ts`: `validateFoodMarkers`.
- `src/lib/saude/primary-care-service.ts`: `savePrimaryHousehold`, `savePrimaryFamily`, `changePrimaryFamilyMember`, `movePrimaryFamily`, `recordVisitOutcome`, `createHomeCareRequest`, `assessHomeCare`, `performHomeCare`, `recordCollectiveActivity`, `recordFoodMarkers`.
- `src/lib/saude/production-service.ts`: `registerProductionFactTx`, `ensureCompetence`, `captureFacts`, `captureManualFact`, `reviseManualProductionFact`, `saveProductionTarget`, `saveUnitCeiling`, `processCompetence`, `closeCompetence`, `reopenCompetence`, `resolveCriticism`, `generateSusFile`, `importProductionFile`, `processSusFile`.
- `src/lib/saude/professional-booking-service.ts`: `professionalBookingWindows`, `professionalAcceptsTime`.
- `src/lib/saude/provider-service.ts`: `resolveProviderSupplier`, `providerGuides`, `providerExecuteGuide`, `providerHistory`.
- `src/lib/saude/raas-source-service.ts`: `getHealthRaasSources`.
- `src/lib/saude/reception-service.ts`: `ensureRiskProtocols`, `saveRiskProtocol`, `saveDestination`, `saveRoom`, `createReception`, `linkReceptionPatient`, `transitionReception`, `saveBed`, `transitionBed`, `admitBed`, `dischargeBed`, `createObservation`, `transitionObservation`.
- `src/lib/saude/regulation-agenda-service.ts`: `syncRegulationAppointment`.
- `src/lib/saude/regulation-management-service.ts`: `updateBookingPatientIdentity`, `distributeRegulationQuota`, `configureRegulationReviews`, `reviewRegulationRequest`, `saveSchedulePeriodBlock`, `saveHealthCallPanel`, `callHealthPanelPatient`.
- `src/lib/saude/regulation-service.ts`: `saveRegulationQuota`, `createRegulationRequest`, `transitionRegulationRequest`, `saveSector`, `reclassifyRequest`, `transferAuthorization`, `adjustRegulationAppointmentQuota`, `grantProviderAccess`, `addRequestAttachment`, `validateGuideCode`, `createFromReferralTx`.
- `src/lib/saude/schedule-service.ts`: `saveSchedule`, `transitionSchedule`, `scheduleAvailability`, `assertSlotAvailable`, `assertBookingRules`, `remanejarAppointment`, `addWaitlist`, `transitionWaitlist`.
- `src/lib/saude/schedule-slots-service.ts`: `listHealthScheduleSlots`.
- `src/lib/saude/sisab-form-config.ts`: `validateEsusFields`.
- `src/lib/saude/sisab-service.ts`: `createBatch`, `processBatch`.
- `src/lib/saude/specialized-care-service.ts`: `saveSpecializedCatalogItem`, `saveSpecializedSchedule`, `saveSpecializedQuota`, `createSpecializedPlan`, `addSpecializedPlanEntry`, `distributeSpecializedMaterial`.
- `src/lib/saude/sus-import-contract.ts`: `parseHealthSusImport`, `healthSusRecordValue`, `healthSusRecordHas`, `normalizeHealthSusEntity`.
- `src/lib/saude/sus-import-service.ts`: `processHealthSusRecords`.
- `src/lib/saude/territory-service.ts`: `saveArea`, `saveMicroarea`, `saveHousehold`, `saveFamily`, `addFamilyMember`, `createVisit`, `addVisitParticipant`, `saveForm`, `finalizeForm`.
- `src/lib/saude/tfd-clinical-service.ts`: `lockTfdRequest`, `tfdRequestForActor`, `saveTfdClinicalReport`, `addTfdReportSupplement`, `transitionTfdClinicalRequest`, `requestTfdBenefit`, `transitionTfdBenefit`.
- `src/lib/saude/tfd-document-service.ts`: `tfdPatientDocument`.
- `src/lib/saude/tfd-report-service.ts`: `tfdProcessReport`.
- `src/lib/saude/tfd-service.ts`: `tfdTripAccessWhere`, `createTfdRequest`, `authorizeTfdRequest`, `createTfdTrip`, `addPassenger`, `movePassenger`, `requestPassengerRemoval`, `confirmPassengerRemoval`, `updateTripStatus`.
- `src/lib/saude/tfd-transport-policy.ts`: `assertTfdBoardingReady`.
- `src/lib/saude/tfd-transport-service.ts`: `healthTransportFleetScope`, `createTfdTripFromBooking`, `confirmTfdTrip`, `recordTfdPassengerBoarding`.
- `src/lib/saude/tfd-trip-document.ts`: `tfdTripDocument`.
- `src/lib/saude/treatment-authorization-service.ts`: `treatmentReportForActor`, `createAuthorizationIssuer`, `createAuthorizationNumberRange`, `authorizationRangePosition`, `saveTreatmentReport`, `transitionTreatmentReport`, `authorizeTreatmentReports`, `configureAihCancellation`, `cancelTreatmentAuthorization`, `renewApacReport`, `recordApacPermanence`, `markAihPaid`, `dischargeAihPatient`.
- `src/lib/saude/treatment-document-service.ts`: `treatmentPatientDocument`.
- `src/lib/saude/vaccination-active-search.ts`: `vaccinationActiveSearch`.
- `src/lib/saude/vaccination-card-policy.ts`: `vaccineStrategy`, `vaccineDay`, `vaccineLotExpiresAt`, `vaccineAddMonths`, `vaccineCalendarAge`, `vaccineDoseStatus`.
- `src/lib/saude/vaccination-document-service.ts`: `vaccinationPatientDocument`.
- `src/lib/saude/vaccination-form-options.ts`: `vaccinationFormOptions`.
- `src/lib/saude/vaccination-registry-service.ts`: `vaccinePatientForAccess`, `vaccinationProfessional`, `saveVaccineManufacturer`, `saveVaccineCodeMapping`, `configureVaccineStock`, `saveVaccineCalendarRule`, `saveVaccineInteraction`, `saveVaccinationCampaign`, `recordVaccinationCardEvent`, `revokeVaccinationCardEvent`, `getVaccinationCard`, `recordVaccineAdverseEvent`, `addVaccineAdverseConduct`.
- `src/lib/saude/vaccination-service.ts`: `recordVaccination`.
- `src/lib/saude/vaccination-stock-service.ts`: `receiveVaccineVials`, `openVaccineVialInTransaction`, `prepareVaccineVial`, `configureVaccineLot`, `registerExistingOpenedVaccineVial`, `recordVaccineDoseLoss`, `reconcileOpenedVaccineVial`.
- `src/lib/saude/vigilance-service.ts`: `saveEstablishment`, `saveComplaint`, `transitionComplaint`, `saveInspection`, `transitionInspection`, `issueLicense`, `transitionLicense`.
- `src/lib/saude/waitlist-events.ts`: `updateWaitlistWithEvent`.

### E.19. Portal do paciente

- `src/lib/portal-paciente/access.ts`: `getPatientPortalAccess`.

### E.20. Assistência social e SUAS

- `src/lib/social/access-policy.ts`: `resolveSocialAccess`, `socialHistoryWhere`, `socialAttendanceWhere`, `assertSocialUnitAccess`.
- `src/lib/social/benefit-delivery.ts`: `deliverBenefitInTransaction`.
- `src/lib/social/catalog-policy.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/social/document-templates.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/social/history-input.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/social/money.ts`: `socialAmountCents`, `socialCentsDisplay`.
- `src/lib/social/professional-input.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/social/social-engine.ts`: `queryCadUnicoMds`, `createSuasRmaRecord`.
- `src/lib/social/unit-input.ts`: `parseSocialUnitInput`.

### E.21. Meio ambiente

- `src/lib/meio-ambiente/licenciamento-engine.ts`: `generateEnvironmentalLicense`.

### E.22. Água e saneamento

- `src/lib/saneamento/saneamento-engine.ts`: `calculateWaterBilling`, `processWaterReadingAndBill`.

### E.23. Obras, serviços públicos e construção civil

- `src/lib/obras/construction-access.ts`: `resolveConstructionAccess`.
- `src/lib/obras/construction-assignment.ts`: `replaceConstructionAnalyst`.
- `src/lib/obras/construction-automatic-viability-policy.ts`: `evaluateAutomaticConstructionViability`, `generateAutomaticViabilityDraft`.
- `src/lib/obras/construction-automatic-viability.ts`: `runConstructionAutomaticViability`, `listConstructionAutomaticViability`, `downloadConstructionAutomaticViability`.
- `src/lib/obras/construction-conversation.ts`: `appendConstructionMessage`.
- `src/lib/obras/construction-distribution.ts`: `assignConstructionCase`.
- `src/lib/obras/construction-document-downloads.ts`: `resolveConstructionComplementArtifact`.
- `src/lib/obras/construction-document-labels.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/obras/construction-document-requests.ts`: `requestConstructionArtifactChange`.
- `src/lib/obras/construction-document-storage.ts`: `backupConstructionPdf`, `storeConstructionPdf`, `readConstructionPdf`.
- `src/lib/obras/construction-documents-policy.ts`: `renderConstructionTemplate`, `constructionFileHash`, `assertConstructionArtifactSigned`, `generateConstructionPdf`, `annotateConstructionPdf`, `stampApprovedConstructionProject`.
- `src/lib/obras/construction-documents-service.ts`: `assertConstructionGedSignature`, `publishConstructionDocumentTemplate`, `issueConstructionDocument`, `publishConstructionArtifact`, `createConstructionPdfRevision`.
- `src/lib/obras/construction-enforcement-policy.ts`: `enforcementCaseWhere`, `enforcementNextStatus`.
- `src/lib/obras/construction-enforcement-service.ts`: `openConstructionEnforcement`, `assignConstructionEnforcement`, `recordConstructionEnforcementVisit`, `issueConstructionEnforcementAct`, `acknowledgeConstructionEnforcementAct`.
- `src/lib/obras/construction-export-service.ts`: `constructionExportRecords`, `persistConstructionExport`.
- `src/lib/obras/construction-export.ts`: `selectConstructionExportPermit`, `validateExportRecords`, `createExportSnapshot`, `verifyExportHash`.
- `src/lib/obras/construction-external-company.ts`: `assertConstructionExternalCompany`.
- `src/lib/obras/construction-external-opening.ts`: `openConstructionExternalApplication`.
- `src/lib/obras/construction-external-policy.ts`: `assertExternalApplicationScope`, `validateExternalOpeningEvidence`.
- `src/lib/obras/construction-external-process.ts`: `createConstructionExternalProcess`.
- `src/lib/obras/construction-extraction.ts`: `extractionConfig`, `extractPdfPages`, `demoMeasurements`, `validateGroundedMeasurements`, `extractConstructionPlan`, `comparePlanZoning`.
- `src/lib/obras/construction-internal-documents.ts`: `assertConstructionInternalOpeningActor`, `stageConstructionInternalDocument`, `validateConstructionInternalOpeningDocuments`, `linkConstructionInternalOpeningDocuments`.
- `src/lib/obras/construction-internal-opening.ts`: `openConstructionInternalCase`.
- `src/lib/obras/construction-lifecycle-deadline-policy.ts`: `inspectionDeadlineEnd`, `calculateInspectionCorrectionDeadline`, `assertInspectionCorrectionOpen`.
- `src/lib/obras/construction-lifecycle-deadlines.ts`: `getConstructionInspectionCorrections`, `assertConstructionInspectionRequestDeadline`, `extendConstructionInspectionDeadline`.
- `src/lib/obras/construction-lifecycle-list.ts`: `lifecyclePage`, `lifecycleListHref`, `lifecycleFilter`, `lifecycleSearch`, `listConstructionPropertyUpdates`.
- `src/lib/obras/construction-lifecycle-policy.ts`: `constructionCurrentPublishedArtifactWhere`, `calculateCompletionBalance`, `validateLifecycleEvidence`, `assertMandatoryInspections`.
- `src/lib/obras/construction-lifecycle-review.ts`: `saveConstructionReviewWithInspectionPlan`.
- `src/lib/obras/construction-lifecycle.ts`: `setConstructionInspectionPlan`, `startConstructionLifecycle`, `requestConstructionInspection`, `recordConstructionInspection`, `completeConstructionLifecycle`, `assertConstructionCompletionReady`, `linkConstructionOccupancyDocument`, `openConstructionPropertyUpdate`, `applyConstructionPropertyUpdate`.
- `src/lib/obras/construction-message-notifications.ts`: `notifyConstructionMessageDepartment`.
- `src/lib/obras/construction-policy.ts`: `calculateConstructionArea`, `constructionCaseWhere`.
- `src/lib/obras/construction-portal-access.ts`: `getConstructionPortalIdentity`.
- `src/lib/obras/construction-portal-policy.ts`: `constructionPortalCaseWhere`.
- `src/lib/obras/construction-project-stamp.ts`: `getConstructionProjectStamp`, `listConstructionProjectStamps`, `findConstructionProjectStampByFile`, `stampConstructionApprovedProject`, `assertConstructionProjectStampDownload`, `publishConstructionProjectStamp`.
- `src/lib/obras/construction-request-policy.ts`: `assertConstructionRequestState`.
- `src/lib/obras/construction-request-resolution.ts`: `resolveConstructionServiceRequest`.
- `src/lib/obras/construction-request-service.ts`: `submitConstructionServiceRequest`.
- `src/lib/obras/construction-review.ts`: `reviewConstructionProject`, `resubmitConstructionProject`.
- `src/lib/obras/construction-rules.ts`: `validateConstructionFields`, `evaluateConstructionViability`.
- `src/lib/obras/construction-tax-engine.ts`: `calculateConstructionFee`, `confirmedConstructionBalance`, `demonstrationConstructionBarcode`.
- `src/lib/obras/construction-taxation.ts`: `getConstructionDocumentFeeCycle`, `publishConstructionTaxRule`, `issueConstructionFee`, `getConstructionPropertyDebts`, `assertConstructionFeesSatisfied`, `assertConstructionDocumentChangeFeesSatisfied`.

### E.26. Gestão de cemitérios

- `src/lib/cemeteries/attachments.ts`: `assertCemeteryAttachmentTarget`, `ingestCemeteryAttachment`, `listCemeteryAttachments`.
- `src/lib/cemeteries/fees-engine.ts`: `calculateCemeteryEventFee`, `cemeteryEventDueDate`, `cemeteryFeeEventKey`.
- `src/lib/cemeteries/fees-service.ts`: `publishCemeteryFeeRule`, `recordCemeteryFeeEvent`, `chargeCemeteryFeeEvent`, `listCemeteryFeeRules`, `listCemeteryFeeEvents`.
- `src/lib/cemeteries/lookups.ts`: `cemeteryLookup`.
- `src/lib/cemeteries/queries.ts`: `listCemeteryProcesses`, `cemeteryBurialReport`.
- `src/lib/cemeteries/query-policy.ts`: `cemeteryEventDayStart`, `cemeteryProcessWhere`, `cemeteryQueryHref`.
- `src/lib/cemeteries/report-pdf.ts`: `generateCemeteryBurialPdf`.
- `src/lib/cemeteries/structure-config.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/cemeteries/structure-service.ts`: `listStructure`, `getStructure`, `saveStructure`.
- `src/lib/cemeteries/workflow-labels.ts` — contratos/tipos/classes/constantes ou auxiliares internos.
- `src/lib/cemeteries/workflow.ts`: `workflowPage`, `lockWorkflowRows`, `workflowRequest`, `validateWorkflowDate`, `validateBurialIdentity`, `validateTransferPair`.

### E.30. Controle interno

- `src/lib/c7/checklist-catalog.ts`: `checklistDraftLines`.
- `src/lib/c7/circumstantiated-report.ts`: `readControlFinalReport`, `saveControlFinalReport`, `circumstantiatedReportRows`, `finalizeControlFinalReport`, `publishControlFinalReport`, `readFrozenControlReportBytes`, `signControlFinalReport`.
- `src/lib/c7/control-agenda-cron.ts`: `controlAgendaCronScope`, `processControlAgendaCron`.
- `src/lib/c7/control-agenda.ts`: `readControlObligation`, `scheduleControlObligation`, `completeControlObligation`, `runControlAgendaAlerts`, `readControlAgenda`.
- `src/lib/c7/control-audits.ts`: `readControlAudit`, `controlAuditPosition`, `scheduleControlAudit`, `sendControlAudit`, `respondControlAudit`, `reviewControlAudit`, `transitionControlAudit`.
- `src/lib/c7/control-checklists.ts`: `publishControlChecklist`, `readControlChecklist`, `answerControlChecklist`, `runControlChecklistDiagnostics`.
- `src/lib/c7/control-notifications.ts`: `readControlNotice`, `sendControlNotice`, `respondControlNotice`, `reviewControlNoticeResponse`.
- `src/lib/c7/control-report.ts`: `buildControlReport`, `renderControlReport`.
- `src/lib/c7/municipal-diagnostics.ts`: `runMunicipalControlDiagnostics`.
- `src/lib/c7/operations-service.ts`: `createInternalControlPlan`, `createInternalControlFinding`, `resolveInternalControlFinding`, `transitionInternalControlPlan`, `recordInternalControlOpinion`.
- `src/lib/c7/workforce-statistics.ts`: `readControlWorkforceStatistics`, `controlWorkforceStatisticsReport`.

## Encerramento

O retrato desta data é de **produto com base funcional ampla e implantação ainda inicial**. O relatório separa capacidade de código, funcionamento verificado, dados existentes, prontidão externa e lacunas concretas. Para um edital, converter cada requisito em uma jornada e exigir a evidência correspondente; atualizar contagens e ambiente após cargas e novas versões.
