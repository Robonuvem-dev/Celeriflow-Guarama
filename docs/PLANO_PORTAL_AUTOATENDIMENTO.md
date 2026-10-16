# Portal de Autoatendimento — análise e plano de desenvolvimento

## 1. Objetivo confirmado

Construir o canal externo unificado de Aurora das Veredas, acessível pelo Portal Institucional, para cidadão/contribuinte, empresa/contador/representante, fornecedor/credor e funcionário. O Portal do Servidor permanece como área especializada e fonte dos serviços funcionais existentes.

**Requisito central confirmado pelo responsável:** serviços solicitados pelo Autoatendimento geram protocolos e serviços internos, acompanháveis pela Prefeitura no card **Processos e Protocolos**. O cidadão acompanha o mesmo pedido, com suas pendências, respostas e documentos autorizados.

Este documento é planejamento, não declaração de implementação. Complementa os planos integrados de Compras/Processos/Serviços e o fechamento do Portal do Servidor/Transparência.

Execução posterior: [SERVICOS_INTEGRADOS_EXECUCAO_20261013.md](SERVICOS_INTEGRADOS_EXECUCAO_20261013.md). O inventário e as rotas propostas abaixo são o diagnóstico inicial; as rotas efetivas e o desenvolvimento entregue estão registrados nesse documento, sem declarar fechamento integral dos blocos PA/PD/SP.

## 2. Fontes e contagem

- Checklist real POC MÓDULOS EXECUTIVO e CAMARA: bloco Executivo, **p.151–163, 119 itens**.
- Especificações Funcionais dos Módulos Executivo: **p.99–107, 1.1255–1.1374**, 120 números.
- Diferença conferida: `1.1359` numera o enunciado geral da avaliação de serviços; no checklist p.162 ele aparece sem número, seguido dos quesitos PA-105–108. Não há um 120º item independente no checklist.
- PA-001–104 correspondem a `1.(1254 + PA)`; PA-105–119 a `1.(1255 + PA)`. O enunciado `1.1359` é requisito transversal da avaliação.
- Matriz individual: [MATRIZ_PORTAL_AUTOATENDIMENTO.md](MATRIZ_PORTAL_AUTOATENDIMENTO.md).

## 3. O que já existe

| Base | Código/fonte | Estado e reaproveitamento |
|---|---|---|
| B01 — Identidade/sessão | `src/lib/platform/session.ts`, `tenant-context.ts`, `/api/auth/session`, `PortalLoginCard` | Firebase com e-mail verificado, cookie HttpOnly, conta municipal autorizada. Não existe jornada geral de solicitação/aprovação de acesso externo. Login não deve conceder permissões ERP ao cidadão. |
| B02 — Área do cidadão | `/portal/entrar`, `/portal/minha-area` | Entrada usa destino fixo `/portal/minha-area`; área confirma sessão e informa que serviços pessoais ainda não estão disponíveis. Falta retorno à rota solicitada e painel operacional. |
| B03 — Cadastro comum | Prisma `Person`, `Company`, `Taxpayer`, `RealEstate`, `EconomicRegistration` | Pessoas, empresas, contribuintes, imóveis e estabelecimentos existentes; identidade externa deve vinculá-los por conferência, sem duplicar cadastro ou dar acesso apenas porque alguém informou CPF/CNPJ. |
| B04 — Acesso tributário externo | `TaxpayerPortalAccess`, `s8-service.ts:grantPortalAccess`; `/portal/tributario` | Concessão por usuário/contribuinte e `scopes` JSON já existem. A página filtra status ATIVO, mas exige módulo interno TRIBUTACAO e não aplica os escopos individualmente. Não é portal concluído; sem sessão, retornou 500. A concessão atual usa o usuário do ator, não é uma solicitação autônoma do cidadão. |
| B05 — Motores tributários | `src/lib/tributacao/index.ts`, `s2-service.ts`, `scope.ts`, arrecadação/dívida/parcelamento | Lançamento, memória, guias, juros/correção, crédito, arrecadação e dívida. Reutilizar regras e Decimal; criar adapters externos com titularidade/representação e contrato transacional, sem chamar actions de servidor interno indiscriminadamente. |
| B06 — ITBI/DTE/procurações | `s3-service.ts`, `DteMailbox`, `DtePowerOfAttorney`, `DteAccessGrant` | Declaração/partes/imóvel, DAM/documento, mensagens, ciência e poderes existem internamente. Procuração DTE não é automaticamente poder geral para imóvel/ITBI/certidão. Validar vigência, revogação, CNPJ e escopo em cada operação. |
| B07 — NFS-e | `s4-service.ts`, `/portal/nfse/[code]`, APIs fiscais | Credenciamento, emissão, avulsa, RPS, deduções, cancelamento/substituição e consulta de autenticidade. `/portal/nfse` não existe. Emissão externa e homologação municipal/ADN são trabalhos distintos. |
| B08 — Protocolos | Prisma `ProcessType`, `Subject`, `ProcessSequence`, `Process`, movimentos/documentos/eventos; `protocols/service.ts` | Sequência central e roteiro por tipo/assunto, setor/prazo/notificações. `createValidatedProcess` exige Employee e abertura INTERNA: não deve ser usado como se cidadão fosse funcionário. |
| B09 — Gestão interna | `/protocolos`, acompanhamento/processos; `protocols/access.ts`; `attendance/access.ts` | Card e filas por setor já existem, com recebimento/tramitação, prazos e Ouvidoria. Integrar origem externa e vínculo ao executor, preservando o acesso interno por setor e sigilo. |
| B10 — Atendimento/e-SIC atuais | `transparencia/citizen-service.ts`, `/portal/acesso-informacao`, `/portal/ouvidoria`, `Ticket`, `Ombudsman` | Protocolo próprio/chave, resposta, prazos/recursos/satisfação; integração opcional a Ticket/Ombudsman. Ainda NÃO cria Process central obrigatoriamente. Reaproveitar os pedidos e chaves sem fabricar vínculos históricos. |
| B11 — Construção Civil externa | `/portal/construcao-civil`, `obras/construction-external-opening.ts`, `construction-external-process.ts`, identidades/autorizações | Já cria Process central e ConstructionCase com sequência/roteiro e autoria externa, sem Employee fictício. Usa identidade profissional específica e bloqueia fluxo genérico que exige ator interno. É referência para generalização, não substituto de todo Autoatendimento. |
| B12 — Portal do Servidor | `portal-servidor/access.ts`, `service-catalog.ts`, `functional-requests.ts`, relatórios/RH/SST | Serviços funcionais e catálogo versionado; pedido→Process com binding persistente, complemento e comprovante. Reusar adapters e fontes; candidato, departamento e convenente têm autorizações próprias. Não reimplementar folha/férias/ponto no portal geral. |
| B13 — Compras/fornecedor | `compras/price-research.ts`, workflows, `SupplierPortalIdentity`, páginas de cotação | Convites/token, digitação de preços, proposta/participação, contratos e ponte financeira. Falta comprovar área única externa com todos os itens PA-011–022, criptografia/senha de proposta, MIS/prestação e consulta financeira restrita. |
| B14 — Documentos/assinaturas | GED/Blob, versões, `documents/document-flow-service.ts`, validações e reports | Arquivos privados, hash, versões, comprovantes e assinaturas têm base. Caixa do cidadão e liberação por pedido precisam autorização própria. Hash, assinatura interna e ICP-Brasil não são equivalentes. |
| B15 — Institucional/Transparência | PortalShell, PublicService, serviços, busca/leis/Diário, Transparência | Shell, contato, acessibilidade e biblioteca disponíveis. `/portal/servicos` é lista fixa; não consome todos os PublicService como catálogo operacional com requisitos/login/destino. Transparência é consulta pública, não área financeira pessoal. |
| B16 — Notificações/avaliação | `protocols/notifications.ts`, filas da plataforma, SatisfactionSurvey/TransparencySatisfaction | Notificações internas e nota/comentário já têm bases. PA exige três quesitos, serviço/pedido, resultados por serviço, preferências/canal e evidência da entrega externa. |

Status de backend existente não comprova jornada externa. As funções de domínio devem ser analisadas com consumidores antes de ampliar parâmetros/retornos ou mudar padrões de erro.

## 4. Arquitetura de acesso

### Rotas propostas

- `/portal/autoatendimento`: entrada/catálogo público, destaques, carta, busca e serviços que não exigem login.
- `/portal/autoatendimento/entrar`, `/cadastro`, `/recuperar-acesso`: identidade, solicitação/liberação e credenciais.
- `/portal/autoatendimento/minha-area`: painel por perfil e vínculos autorizados.
- `/portal/autoatendimento/servicos/[slug]`: requisitos, documentos, formulário e custos/prazos.
- `/portal/autoatendimento/solicitacoes` e `/[publicKey]`: Meus pedidos/detalhe/complemento/documentos.
- `/portal/autoatendimento/contribuinte`, `/empresa`, `/representacoes`, `/fornecedor`, `/documentos`, `/notificacoes`.
- `/portal/tributario`: entrada/compatibilidade com a área tributária do Autoatendimento.
- `/portal/nfse`: entrada fiscal com autenticidade pública e emissão/consulta privadas pelos vínculos corretos.
- `/portal-servidor`: área especializada, acessível pelo catálogo quando existir vínculo funcional.
- `/protocolos`: administração dos serviços, filas, recebimento, análise, execução e acompanhamento interno.

Os caminhos são proposta a implementar. A entrada institucional deve usar links públicos estáveis e retornar ao serviço correto após login. Não usar `/app-domain` no link externo nem abrir páginas ERP para o cidadão.

### Perfis e autorização

- Cidadão pessoa física; titular de empresa/contribuinte; contador/procurador; fornecedor/credor; servidor; candidato; parceiro/convenente; estabelecimento/profissional sanitário.
- Sessão autenticada é identificação, não autorização para qualquer CPF/CNPJ, imóvel ou empresa.
- Acesso derivado de vínculos e poderes vigentes, escopos por operação e entidade. Revogação/expiração devem ser aplicadas em API/action/download, não apenas esconder botão.
- CPF/CNPJ informado pode localizar cadastro para conferência; não revela extrato, endereço, débito, documento ou tramitação sem comprovação de vínculo ou chave privada adequada.
- Representação permite agir pelo representado no escopo, sem assumir identidade do titular. Registrar solicitante, representado e legitimidade vigente.

## 5. Fluxo obrigatório: portal → protocolo → executor → portal

```text
Cidadão escolhe entidade/perfil/serviço
  → consulta requisitos e versão do formulário
  → preenche, anexa e aceita termos quando aplicáveis
  → backend valida identidade/representação, dados, anexos e idempotência
  → cria/reutiliza solicitação externa + Process central + distribuição inicial
  → vincula operação do módulo executor (TaxServiceRequest, ConstructionCase,
      Ticket/Ombudsman, HrPortalRequest, ocorrência/manutenção, Vigilância...)
  → retorna PROC-ANO-NÚMERO, chave pública privada e comprovante
  → Prefeitura recebe no card Processos e Protocolos
  → triagem/análise/exigência/taxa/execução/decisão no setor e módulo responsáveis
  → movimentos/respostas/documentos autorizados aparecem no mesmo pedido externo
  → cidadão complementa, recebe resultado, avalia ou recorre quando cabível
```

### Regras do protocolo único

1. **Toda submissão de serviço solicitável cria Process central**, inclusive acesso cadastral, alteração de cadastro, e-SIC, Ouvidoria, ITBI, alvará, reserva/manutenção e direitos do titular. Consulta, pesquisa, validação e reimpressão não criam novo processo por clique. Emissões instantâneas solicitadas podem protocolar e concluir automaticamente com o documento/resultados vinculados, sem análise manual artificial.
2. Número sequencial emitido pelo núcleo `ProcessSequence`. Número fiscal, número de obra, Ticket ou código externo são referências do executor; não substituem o protocolo central.
3. Reaproveitar Process já criado por Construção Civil/RH; registrar o binding externo, sem criar segundo processo para o mesmo pedido.
4. e-SIC/Ouvidoria atuais precisam ponte obrigatória a Process para novos pedidos. Registros antigos e seus códigos continuam válidos; reconciliar/backfill somente quando houver referência existente verificável, sem inventar tramitação histórica.
5. Tipo/assunto/setor/SLA/roteiro são definidos pelo serviço configurado, não pelo cliente. Roteiro genérico externo depende de adaptar o modelo de ator; não representar cidadão/anonimato como Employee ou administrador técnico.
6. Formulário, requisitos, aceite e publicação precisam versão/snapshot. Uma alteração de catálogo não muda retroativamente documentos exigidos no pedido já enviado.
7. Mesmo requestKey/inputHash retorna solicitação/protocolo existentes; alteração de conteúdo com a mesma chave é recusada. Para módulos com operações fora da transação local, usar fila/outbox vinculada, retries e marcos PENDENTE/EXECUTADO sem devolver sucesso fictício.
8. O protocolo controla tramitação; o executor mantém cálculo/situação fiscal, reserva de vaga/agenda, documentos e decisão própria. Andamento não é prova de pagamento ou de licença emitida.
9. Eventos públicos autorizados são derivados dos movimentos e resultado. Notas internas, parecer clínico, identidade de denúncia e anexos restritos não são disponibilizados por consequência da criação do Process.
10. Encaminhamento/apensamento não perde vínculo ao pedido externo. Transferência de setor não cria solicitação órfã nem invalida a chave do titular.

### Experiência interna no card Processos e Protocolos

- Filtro origem **AUTOATENDIMENTO**, entidade, serviço, tipo/assunto, número, status, setor, responsável e prazo.
- Pendências para receber/analisar, complementação, taxa/pagamento, execução setorial e assinatura.
- Detalhe: dados autorizados do requerente/representação, formulário enviado, documentos/versionamento, linha do tempo e link ao executor.
- Ações: receber, distribuir, solicitar complemento, responder, encaminhar ao executor, registrar/liberar documento, concluir, arquivar/reabrir conforme regras.
- Ouvidoria anônima/sigilosa aparece somente a atores autorizados; consolidação do card não libera identidade a todos os setores.
- A decisão operacional é executada pelo provedor de domínio com suas permissões; a fila geral não ganha poderes de RH/fiscal/SST automaticamente.

## 6. Contratos e persistência propostos

Modelos abaixo são desenho, não tabelas já criadas:

- `PortalServiceDefinition`: referência a PublicService, entidade, público, grupo/slug, provider/operation fixos, requiresLogin, permite anonimato, tipo/assunto/setor/roteiro, SLA, taxa, destaque e estado.
- `PortalServiceVersion`: campos/checks/requisitos/documentos/aceite por versão; schema conhecido, sem SQL/actions arbitrárias do editor.
- `ExternalServiceRequest`: publicKey, ator externo/tipo, entidade, serviço/versão, interessado/representado, estado externo, requestKey/hash, timestamps e payload validado.
- `ExternalRequestProcessBinding`: ligação verificável 1:1 ao Process central; origens antigas reconciliadas; índices/unique/FKs para preservar identidade e origem.
- `ExternalRequestDomainBinding`: executor real e identidade do registro (tipos permitidos), eventos de resultado e despacho idempotente. Cada adapter valida o vínculo, não há leitura arbitrária de tabela por nome.
- `ExternalRequestParticipant`/representação: titularidade, papel/poder, vigência/revogação, recurso permitido e evidência.
- `ExternalRequestDocument`/mensagem/evento: documento GED/versão/hash, finalidade, autor e visibilidade; upload provisório só é consumido pelo dono/serviço/versão.
- `ExternalAccessRequest`/revisão cadastral: solicitação, conferência, decisão motivada e vínculo resultante; sem autoatribuir cadastro pelo CPF.
- `PortalFavorite`, aviso/box/destaque, avaliação por três quesitos e notificações/outbox.

Antes da migration, conferir consumidores de Person/Usuario/Process/Subject/PublicService e as relações existentes de RH, Construção Civil e Tributação. Migrations em `prisma/migrations-ibema`, aditivas; não substituir tabelas/códigos históricos.

## 7. Providers e responsabilidades

| Família | Portal oferece | Fonte/executor |
|---|---|---|
| Cadastro/acesso/representação | Pedido, anexos, conferência e vínculos | Cadastro comum e administração; protocolo central de solicitação |
| Contribuinte/imóvel/empresa | Dashboard pessoal, extratos, documentos e revisão | Tributação/Cadastro; autorizar por vínculo e escopo do recurso |
| Guia/pagamento | Atualizar/emitir guia e acompanhar | Motor Tributário, convênio bancário/PIX/cartão e retorno confirmado; portal não confirma pagamento pelo browser |
| ITBI/certidão/alvará/ISS/NFS-e | Formulário, documento e consulta própria | Serviços S2/S3/S4 e fontes fiscais, com memória/versionamento e protocolo da solicitação |
| Fornecedor/OSC | Cotações, propostas, instrumentos, MIS/prestação e créditos próprios | Compras/Contratos/Financeiro, publicação e sigilo de proposta preservados |
| Funcionário/departamento/convenente/candidato | Catálogo/entrada e acompanhamento | Portal do Servidor/RH/SST/concursos existentes, com autorização própria de cada ator |
| Construção/habite-se | Solicitar/corrigir/acompanhar | Construção Civil externo existente; preservar seu Process e habilitação profissional |
| Manutenção/reserva/guichê | Local/disponibilidade, solicitação e calendário | Atendimento/Obras/agenda/espaços; reserva concorrente e vínculo ao processo |
| Sanitário/Vigilância | Solicitações por estabelecimento e documentos | Serviços sanitários/setoriais; carteira/receita/assunção são campos protegidos e documentos após assinatura |
| LGPD/comunicações/assinatura | Pedido do titular, consulta e assinatura solicitada | Controlador/registros de tratamento/GED/assinaturas, sem exportar dados de terceiros |
| Legislação/obras/Diário/Transparência | Consulta de informações já publicadas | Catálogos/projeções públicas; consulta não abre protocolo novo |

## 8. Fases propostas

| Fase | Trabalho | Dependência e aceite verificável |
|---|---|---|
| A00 — Contratos e reconciliação | Matriz PA, inventário de fontes, consumidor/assinaturas, escopos, regra de protocolo único e estratégia para pedidos antigos | Sem mudar funções existentes antes de conferir todos os consumidores; definição de schema/roteiro de serviço mínimo |
| A01 — Identidade e entrada | Entrada pública, cadastro/solicitação de acesso, login/recuperação/retorno, vínculos de titular/empresa/representante | Visitante acessa catálogo sem 500; usuário não vê cadastro alheio; revogação efetiva; cliente não ganha TRIBUTACAO/PROCESSOS por usar portal |
| A02 — Serviço + protocolo central | PublicService operacional/versionado, formulário/documentos, external-opening, binding, sequência, fila inicial e comprovante | **Primeira entrega vertical:** solicitar atualização cadastral → PROC → recebimento no card → pendência/complemento → resposta no mesmo pedido; retry/rollback/isolamento comprovados |
| A03 — Meus pedidos e gestão interna | Histórico autorizado, filtros, mensagens/anexos, status/prazo, caixa documental e filtros AUTOATENDIMENTO no card | Prefeitura e titular veem os marcos permitidos; notas/sigilo não vazam; encaminhar não perde acompanhamento |
| A04 — Contribuinte básico | Extratos/debitos/imóveis/empresas, guias, certidões/alvarás próprios e pedidos de revisão | Totais reais, scoped access por operação, atualização monetária; guia/documento vinculado; dados bancários e obrigações não inventados |
| A05 — Representantes + serviços fiscais | Poderes do contador, ITBI, ISS/retido, avulsa NFS-e, DTE/ciência e documentos | Representação expirou/revogou → operação/download recusados; processo fiscal único; regras legais/motor mantidos no executor |
| A06 — e-SIC/Ouvidoria + serviços municipais | Ponte dos pedidos atuais a Process, chamados/manutenção/cronograma/reservas/guichês | Pedido gera protocolo central e atualiza serviço/agenda; anonimato e sigilo mantidos; chave antiga preservada sem história fabricada |
| A07 — Fornecedor/OSC | Convites/propostas/CRC/agenda, retenções/saldos/empenhos próprios, MIS/prestação de contas | Vencedor readequa no total; proposta sigilosa não se torna pública; entidade/fornecedor A não vê B |
| A08 — Áreas existentes + Vigilância/LGPD | Navegação/adapters RH/SST/Construção, sanitário, assinatura, tratamentos/direitos | Reusar protocolos e fontes; candidato sem Employee; documentos após assinatura/liberação; sem duplicar regras dos módulos |
| A09 — Experiência e comunicação | Carta, busca/login/requisitos, favoritos/boxes/avisos, três quesitos de avaliação, resultados por serviço, acessibilidade e desafio nos envios públicos | Campo/hint/destino corretos; avaliação vinculada ao serviço/pedido; notificações têm confirmação de entrega, não só fila criada |
| A10 — Integrações e aceite | Token de terceiros, banco/PIX/cartão, assinatura/ADN quando aplicável, jornada por perfil, testes/lint/build/deploy | Homologação externa por operação/retorno e diagnóstico explícito de indisponibilidade; 119 itens com evidências, não cobertura inferida pelo menu |

Prioridade recomendada: **A00 → A01 → A02 → A03 → A04**, entregando primeiro o ciclo contribuinte/cidadão e o protocolo central. Demais providers seguem em ondas, preservando os módulos já existentes.

## 9. Critérios de aceite essenciais

1. Submissão aceita retorna um Process verificável, visível no card Processos e Protocolos ao setor correto.
2. Request retry não duplica protocolo, pedido fiscal, guia, reserva, documento ou execução.
3. Fail antes de completar protocolo/binding deixa rollback íntegro; fail no executor posterior deixa despacho pendente rastreável e retry idempotente.
4. Ator cidadão permanece cidadão. Employee, fornecedor, procurador e profissional são vínculos, não credenciais intercambiáveis.
5. Formulário/documentos/termos são os da versão enviada; complemento conserva as versões anteriores.
6. Portal e card exibem o mesmo protocolo/status permitido; resultado depende da fonte e da liberação documental real.
7. Dados alheios, sigilo de denúncia, notas internas e anexos privados não aparecem em consultas, exports ou download direto.
8. Busca pública por CPF/CNPJ sozinha não vira credencial para extratos ou processos.
9. Pagamento, assinatura oficial, aprovação, reserva e conclusão são eventos próprios do domínio, com retorno verificável.
10. Consulta/reimpressão/validação não gera processo repetido; solicitação instantânea protocolada pode concluir automaticamente quando o executor permitir.
11. Acessos existentes `/portal/tributario` e `/portal/nfse` são absorvidos com destino funcional e retorno correto após login.

## 10. Verificação futura

- Testes de acesso por titular/representante e ator setorial; scopes, revogação, período e entidade.
- Concorrência/idempotência: duas submissões, vagas/reservas, emissão documental e guia.
- Teste de migração sobre baseline, antigos processos/pedidos preservados, FKs e índices únicos.
- Ciclo HTTP/UI: catálogo → login → solicitação → comprovante → card interno → análise/complemento → execução/documento → acompanhamento externo.
- Isolamento de mensagens/arquivos em APIs e downloads; CGI da sessão não substitui autorização de recurso.
- Datas/Decimal/totais por guia, crédito, pagamento e estorno; não confirmar PIX/cartão sem retorno do provedor.
- Verificação visual, mobile, teclado, fonte/contraste, links/âncoras e catálogo.
- `npm run build` antes de commit/push quando a implementação for solicitada.

## 11. Pontos a configurar durante a implementação

- Tipo/assunto/setor/entidade/roteiro e permissões por serviço, documentos/aceite/taxa, atores externos e finalidade.
- Serviços liberados na primeira onda e limites legais de execução automática.
- Contas reais para teste, poderes dos representantes/contadores e credenciais de fornecedores/profissionais.
- Provedores/contratos de PIX, cartão, comunicação, assinatura e Gov.br/terceiros. O app mobile deve consumir os mesmos contratos; sua publicação não é presumida por uma página responsiva.

Essas parametrizações não impedem iniciar A00–A03. O plano usa Aurora como identidade atual; exemplos de outros municípios não criam regras legais ou dados pessoais de produção.
