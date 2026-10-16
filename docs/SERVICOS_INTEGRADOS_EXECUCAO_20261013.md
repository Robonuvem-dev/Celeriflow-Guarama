# Serviços integrados — execução de 13/10/2026

## Estado da entrega

O núcleo integrado de solicitação, protocolo, tratamento e execução foi implementado. Este registro **não declara encerrados os 119 itens PA, os 83 PD ou os 30 SP**: os provedores setoriais e o aceite de cada operação têm rastreabilidade própria.

## Código entregue

### Catálogo e identidade

- `PublicService` continua sendo a fonte descritiva comum. `PortalServiceConfiguration` e `PortalServiceVersion` adicionam executor, público, publicação, destaque, formulário, documentos, aceite, roteiro, recurso/vagas e snapshots imutáveis.
- Carta pública, busca por nome/descrição/público, descrição/requisitos/etapas/prazo/custo/login, favoritos e avaliação por serviço.
- Serviços funcionais existentes aparecem no catálogo comum e encaminham ao Portal do Servidor, preservando sua autorização, execução e `HrPortalRequestBinding`.
- Solicitação de acesso por identidade Firebase com e-mail verificado; protocolo central e conferência administrativa. Aprovação cria perfil externo sem permissões ERP, com vínculos canônicos e escopos fiscais explicitamente escolhidos.
- Recuperação de senha pelo Firebase. Google e e-mail/senha existentes; gov.br cinzento e bloqueado.

### Pedido → processo → executor → resposta

- Abertura externa com ator real, sequência `ProcessSequence`, setor/roteiro/SLA configurados, auditoria e notificação interna. Não cria `Employee` para o cidadão.
- Fluxo genérico publicado pode identificar o cidadão por sua conta `Usuario`, sem conceder permissões internas. Suas decisões e conclusão continuam sob o motor do roteiro.
- `PortalServiceRequest` preserva ator, interessado autorizado, versão, payload/hash, chave idempotente, processo único e referências dos executores.
- Repetição idêntica retorna o mesmo protocolo; chave com outro conteúdo é rejeitada. Falha de validação/anexo/executor faz rollback do pedido e do processo.
- Fila interna por escopo de Protocolos; recebimento no processo antes do tratamento; exigência textual/documental, complemento, resposta, nota interna, resultado documental, conclusão e reabertura delimitadas.
- Acompanhamento pessoal, comprovante PDF, arquivos privados GED/Blob, hash, versões e download autorizado. Notas internas não entram na projeção externa.
- Upload direto Blob de PDF/JPG/PNG até 10 MB, token limitado ao armazenamento do titular, callback/confirmação idempotentes e vínculo ao GED; bytes não atravessam o limite de corpo da função Vercel.

### Serviços Públicos e áreas existentes

- Manutenção cria `ObrasServico` na mesma transação do processo. Execução utiliza as equipes, pessoas, equipamentos, materiais e movimentos de estoque existentes.
- Programação múltipla, executor/equipe/equipamento, bloqueio de sobreposição, reprogramação com preservação do histórico, início/conclusão/cancelamento da programação e cronograma do requerente.
- Custos em Decimal: mão de obra informada na programação, rateio explícito de programação conjunta e materiais realizados pela movimentação canônica, incluindo entradas de retorno/estorno. Valores sem fonte conciliada são identificados.
- Reserva de espaços usa `CulturaEspaco`/`CulturaReserva`, com o mesmo bloqueio transacional da abertura interna. Exige interessado conferido, disponibilidade e vagas publicadas. Reprogramação/execução exige autorização da origem Cultura/Esporte.
- Agendamento de guichê/recurso usa vagas explicitamente publicadas e reserva concorrente.
- e-SIC/Ouvidoria passam a criar `Process` central, preservando protocolo/chave do canal e integração a Ticket/Ombudsman. Sem setor configurado ficam **Aguardando Distribuição**, sem inventar destino. Identidade e narrativa ficam no canal restrito. A consulta genérica por vínculo não libera esses processos.
- Notas de avaliação e-SIC/Ouvidoria agora aceitam os três quesitos; avaliações antigas de nota única são preservadas com os novos quesitos nulos.
- Área tributária deixa de exigir módulo ERP TRIBUTACAO: lê somente vínculos/escopos ativos do titular, com extratos, imóveis, inscrições, licenças, certidões, dívida e parcelamentos autorizados.
- Entrada `/portal/nfse` implementada para notas próprias por escopo NFSE; autenticidade continua na rota existente.
- Executores transacionais adicionais: guia na origem tributária, solicitação NFS-e avulsa e declaração ITBI. Reutilizam cálculo, roteamento fiscal e controles existentes. Não há pagamento/assinatura/aprovação fictícios.
- Dez modelos de catálogo disponíveis como **rascunhos**, incluindo manutenção, contatos PF/PJ, guia, avulsa, ITBI, reserva, guichê, administrativo e pedido LGPD. A publicação valida parâmetros reais.

## Entradas operacionais

| Finalidade | Rota |
|---|---|
| Carta/catálogo público | `/portal/servicos`, `/portal/servicos/[slug]` |
| Acesso/cadastro/recuperação | `/portal/entrar`, `/portal/cadastrar`, `/portal/recuperar-senha` |
| Solicitação | `/portal/minha-area/servicos/[slug]` |
| Pedidos, mensagens e documentos | `/portal/minha-area/solicitacoes`, `/portal/minha-area/solicitacoes/[id]` |
| Acompanhamento já entregue | `/portal/minha-area/processos` |
| Catálogo administrativo | `/protocolos/servicos` |
| Conferência de acesso | `/protocolos/servicos/acessos` |
| Fila/tratamento/programação | `/protocolos/servicos/solicitacoes`, `/protocolos/servicos/solicitacoes/[id]` |
| Origem funcional | `/portal-servidor/servicos`, `/portal-servidor/protocolos` |
| Origem tributária externa | `/portal/tributario`, `/portal/nfse` |

## Verificações

- `npm run build`: aprovado após as correções, incluindo Prisma generate, Next typegen, TypeScript e Next build.
- ESLint direcionado: aprovado.
- Testes integrados reais Prisma/PostgreSQL/PGlite: protocolo único, autoria externa, isolamento, versão imutável, rollback, notas restritas, complemento/anexos obrigatórios, consumo único, concorrência de vaga, execução/custos, chave do canal sigiloso e aprovação sem módulos ERP.
- **22 testes aprovados, zero falhas**, na execução conjunta final de `integrated-portal-services.test.ts`, `citizen-process-tracking.test.ts`, `transparency-citizen-workflow.test.ts` e `transparency-consultations.test.ts`.
- 6 testes de `tax-document-integration.test.ts` aprovados. Fixture passou a fornecer aceite e autor exigidos pelo modelo de credenciamento atual; assinaturas públicas das rotinas fiscais existentes foram preservadas.
- Smoke Playwright do build: quatro entradas públicas 200; seis entradas pessoais exigindo login; quatro APIs sem sessão retornando 401; catálogo comum com Portal do Servidor, gov.br desabilitado, sem transbordamento móvel e sem erros de página.
- Migração `20261013110000_integrated_portal_services` aplicada ao banco configurado. Migrações paralelas já existentes foram preservadas.
- Não houve commit/push/deploy desta execução.

## Parametrização necessária para operação

O administrador prepara os modelos e define tipo/assunto/roteiro/setor, campos, documentos/classes GED, aceite, prazo, custo e publicação. Executores fiscais exigem unidade gestora e atividade/tipo de transmissão; reservas exigem espaço e vagas reais; manutenção geográfica exige limites/perímetro municipal real. Esses parâmetros não foram arbitrariamente escolhidos a partir de um nome ou de dados de outro município.

## Requisitos ainda abertos

1. **PA-011–022:** área unificada de fornecedor/credor/OSC, proposta cifrada e abertura, CRC, MIS, prestação de contas e projeção financeira própria completa ainda precisam de adapters e evidência específicos. Os módulos internos existentes não foram reclassificados como entrega externa por este lote.
2. **PA-077 e demais representações:** os novos adapters fiscais são de titular. Procuração geral por operação/recurso, vigência e revogação precisa de implementação própria; procuração DTE não foi ampliada automaticamente.
3. **PA-110–119:** pedidos sanitários completos por estabelecimento/profissional, carteira, veículo/evento/temporário, notificação de receita e responsabilidade técnica continuam a exigir providers e jornadas sanitárias específicos. Um serviço administrativo configurável não encerra esses itens.
4. **PA-084 e PA-088–089:** inventário/relatório real de tratamentos e caixa geral de comunicações/assinaturas ainda precisam de ligação às fontes específicas.
5. **PD:** a abertura externa e o envelope integrado não encerram os requisitos restantes de paralelismo, operações em lote, apensamentos, documentos/modelos e indicadores do checklist de 83 itens.
6. **SP:** programação/custos/documentos/cronograma entregues precisam do aceite municipal por item; o relatório integral sintetiza os pedidos, mas não substitui todos os relatórios detalhados exigidos.
7. **Operação/canais externos:** bancos/PIX/cartão, assinatura oficial quando exigida, Gov.br, terceiros, App/push/LDAP e homologação com contas/dados reais continuam com configuração e aceite próprios. Aviso interno/registro em fila não representa entrega externa confirmada.

As pendências de implementação são distintas de parametrização e homologação. A matriz permanece parcial nesses grupos; não existe declaração de 100% do checklist.
