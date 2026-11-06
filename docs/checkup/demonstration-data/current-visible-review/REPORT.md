# Revisão reconciliada dos dados visíveis

Concluída em 2026-11-06T17:45:29.410Z. Origem: http://localhost:3100.

459 caminhos de menu. 3 ocorrências técnicas revisadas; 0 ocorrências de marcador sem revisão. 0 erros de aplicação/navegação e 0 bloqueios de tabela.

Há 116 telas com ao menos uma tabela visível sem linhas de dados e 145 telas com mensagem de vazio. São medidas distintas; não somar. Filtros, ausência de pendências, permissões, vínculos e fluxos precisam de revisão individual antes de criar operações.

As três páginas de Planejamento consultadas antes da carga foram substituídas pelas observações do reteste concluído. As coletas originais foram preservadas.

## Marcadores técnicos preservados

| Caminho | Motivo |
| --- | --- |
| `/controle-interno/consultas/rh` | ID técnico exposto na coluna explícita ID do cargo; nome exibido como Coordenador de TI. Preservar o ID e a rastreabilidade dos vínculos. |
| `/obras/construcao-civil/integracoes` | Aviso da condição técnica da integração. A mensagem precisa continuar distinguindo o snapshot municipal da transmissão oficial homologada. |
| `/saude/gerencial` | Tipo de evento na distribuição de auditoria, proveniente de AuditEvent.eventType. Não é nome de paciente, atendimento ou profissional. |

## Mensagens de vazio e tabelas sem linhas no recorte observado

| Caminho | Tabela sem linhas | Mensagem |
| --- | --- | --- |
| `/cadastros/fornecedores` | Não | Nenhum documento da identidade vinculada foi encontrado. |
| `/cadastros/assinantes-legais` | Sim | Nenhum registro encontrado. |
| `/cadastros/qualidade` | Sim | Nenhuma inconsistência encontrada. |
| `/planejamento/regionalizacao` | Não | Nenhuma ação regionalizada no filtro. |
| `/planejamento/cadastros/revenue` | Sim | Nenhum registro encontrado. |
| `/planejamento/cadastros/versions` | Sim | Nenhum registro encontrado. |
| `/planejamento/importacoes` | Sim | Sem mensagem textual identificada pelo coletor |
| `/camara/planejamento/ppa` | Sim | Nenhuma peça encontrada. |
| `/camara/planejamento/loa` | Sim | Nenhuma peça encontrada. |
| `/camara/planejamento/ldo` | Sim | Nenhuma peça encontrada. |
| `/camara/planejamento/cadastros/revenue` | Sim | Nenhum registro encontrado. |
| `/camara/planejamento/cadastros/versions` | Sim | Nenhum registro encontrado. |
| `/camara/planejamento/audiencias` | Sim | Nenhum registro encontrado. |
| `/camara/planejamento/entidades` | Não | Nenhuma unidade vinculada |
| `/camara/planejamento/importacoes` | Sim | Sem mensagem textual identificada pelo coletor |
| `/cemiterios/processos` | Sim | Nenhum processo encontrado. |
| `/cemiterios/taxas` | Sim | Nenhum evento no filtro. |
| `/cemiterios/transferencias` | Não | Nenhuma movimentação encontrada para os filtros selecionados. |
| `/cemiterios/relatorio` | Sim | Nenhum sepultamento concluído no período. |
| `/cemiterios/consulta` | Sim | Nenhum processo encontrado. |
| `/compras` | Não | Nenhum histórico recente encontrado. |
| `/compras/recebimentos` | Não | Nenhum recebimento registrado. |
| `/configuracoes/processos` | Não | Nenhum novo tipo foi marcado para o fluxo genérico. / Nenhuma versão genérica criada. |
| `/atendimento/relatorios` | Não | Sem dados no período e escopo selecionados. |
| `/cemiterios/complementos` | Sim | Sem mensagem textual identificada pelo coletor |
| `/cultura/conselhos-fundos` | Não | Nenhum documento vinculado. |
| `/cultura/eventos` | Não | Nenhum documento vinculado |
| `/cultura/documentos` | Não | Nenhum documento encontrado. |
| `/seguranca/infracoes` | Sim | Nenhum registro encontrado. |
| `/seguranca/documentos` | Sim | Nenhum registro encontrado. |
| `/assinatura-digital/origens?module=PROCESSOS` | Sim | Nenhum registro encontrado. |
| `/protocolos/notificacoes` | Não | Nenhuma notificação no momento. |
| `/protocolos/assinaturas` | Sim | Sem mensagem textual identificada pelo coletor |
| `/protocolos/arquivados` | Sim | Nenhum processo arquivado encontrado. |
| `/transparencia/publicacoes` | Sim | Nenhum documento enviado para estes filtros. |
| `/transparencia/banners` | Sim | Nenhum banner encontrado. |
| `/transparencia/acessos` | Sim | Nenhuma visualização registrada. |
| `/transparencia/diario-oficial` | Sim | Nenhuma edição encontrada. |
| `/financeiro` | Não | Nenhuma movimentação encontrada. |
| `/financeiro/liquidacoes` | Sim | Nenhum registro encontrado. |
| `/financeiro/empenhos` | Sim | Nenhum empenho encontrado. |
| `/financeiro/pagamentos` | Sim | Nenhum pagamento encontrado. |
| `/assinatura-digital/origens?module=FINANCEIRO` | Sim | Nenhum registro encontrado. |
| `/financeiro/restos-a-pagar` | Não | Nenhum resto a pagar para os filtros selecionados. |
| `/financeiro/receitas` | Sim | Nenhum registro encontrado. |
| `/financeiro/receitas-constitucionais` | Sim | Nenhum registro encontrado. |
| `/financeiro/automacoes` | Sim | Nenhum registro encontrado. |
| `/financeiro/download-extratos` | Sim | Nenhum registro encontrado. |
| `/financeiro/rendimentos` | Sim | Nenhum registro encontrado. |
| `/financeiro/resgates-aplicacoes` | Não | Nenhum lançamento corresponde aos filtros. Baixe o extrato da conta desejada na funcionalidade de Extratos Bancários. |
| `/financeiro/contabilidade` | Sim | Nenhum registro encontrado. |
| `/controle-interno` | Não | Nenhum plano de controle registrado. / Nenhuma obrigação visível neste filtro. |
| `/controle-interno/consultas/judicial` | Sim | Sem mensagem textual identificada pelo coletor |
| `/patrimonio/requisicoes` | Sim | Nenhuma requisição encontrada para os filtros informados. |
| `/patrimonio/inventario-bens` | Sim | Nenhum registro encontrado. |
| `/patrimonio/cadastros` | Sim | Nenhum registro encontrado. |
| `/obras/fiscalizacao-medicoes` | Sim | Nenhuma medição encontrada. |
| `/obras/maquinas-equipes` | Não | Nenhum equipamento encontrado para os filtros selecionados. |
| `/assinatura-digital/origens?module=OBRAS` | Sim | Nenhum registro encontrado. |
| `/obras/documentos` | Não | Nenhum documento encontrado. |
| `/obras/construcao-civil` | Sim | Nenhuma solicitação disponível no seu setor. Confirme seu vínculo urbanístico vigente. |
| `/obras/construcao-civil/profissionais` | Sim | Nenhum registro encontrado. |
| `/obras/construcao-civil/participacao` | Sim | Nenhum registro encontrado. |
| `/obras/construcao-civil/construtoras` | Sim | Nenhum registro encontrado. |
| `/portal/construcao-civil/pedidos-administrativos` | Não | Nenhum pedido pendente nos casos do seu escopo. |
| `/obras/construcao-civil/vistorias` | Não | Nenhuma vistoria encontrada. / Nenhuma atualização encontrada. |
| `/obras/construcao-civil/fiscalizacao` | Sim | Nenhum processo fiscal disponível no seu setor para os filtros. |
| `/obras/construcao-civil/integracoes` | Não | Nenhum processo corresponde aos filtros. / Nenhum lote corresponde aos filtros. |
| `/obras/construcao-civil/regras` | Sim | Nenhuma versão publicada. |
| `/frotas?area=utilizacao` | Sim | Nenhum registro encontrado. Ajuste os filtros ou registre a primeira operação. |
| `/frotas/movimentos` | Sim | Nenhum registro encontrado. |
| `/frotas/cadastros` | Sim | Nenhum registro encontrado. |
| `/rh` | Não | Nenhum evento recente encontrado. |
| `/rh/arquivos-bancarios` | Sim | Nenhum registro encontrado. |
| `/rh/beneficios` | Sim | Nenhum benefício master cadastrado. |
| `/rh/licencas` | Sim | Nenhuma licença registrada. |
| `/assinatura-digital/origens?module=RH` | Sim | Nenhum registro encontrado. |
| `/rh/portal-funcional` | Não | Nenhuma configuração gerenciada no seu escopo. |
| `/rh/concursos` | Não | Nenhum edital no seu escopo. |
| `/sst/atestados` | Sim | Nenhum atestado encontrado. |
| `/sst/aso` | Sim | Nenhum ASO encontrado. |
| `/sst/relatorios` | Sim | Nenhum registro. Informe UG e período para consultar. |
| `/sst/questionarios` | Sim | Nenhum questionário encontrado nas UGs clínicas autorizadas. |
| `/sst/profissionais` | Sim | Nenhuma habilitação encontrada. |
| `/sst/prontuarios` | Sim | Nenhum atendimento encontrado. |
| `/sst/vacinacao` | Sim | Nenhum registro nas UGs autorizadas. |
| `/sst/programas` | Sim | Nenhum programa encontrado. |
| `/sst/vinculos` | Sim | Nenhum período encontrado. |
| `/sst/equipamentos` | Sim | Nenhum equipamento encontrado. |
| `/sst/restricoes` | Sim | Nenhuma restrição nas UGs clínicas autorizadas. |
| `/sst/acidentes` | Sim | Nenhuma ocorrência no escopo selecionado. |
| `/sst/planos` | Não | Nenhuma adesão encontrada neste escopo. |
| `/sst/integracoes` | Sim | Nenhuma preparação encontrada. |
| `/saneamento/leituras` | Sim | Nenhuma leitura encontrada. |
| `/saude/relatorios` | Sim | Sem mensagem textual identificada pelo coletor |
| `/saude/gerencial` | Não | Sem dados no recorte. |
| `/saude/territorio` | Sim | Nenhum registro encontrado. |
| `/saude/regulacao` | Sim | Nenhum registro encontrado. |
| `/saude/pronto-atendimento` | Sim | Nenhum registro encontrado. |
| `/saude/acolhimento` | Sim | Nenhum registro encontrado. |
| `/saude/atendimentos` | Sim | Nenhum registro encontrado. |
| `/saude/vacinacao` | Sim | Nenhum registro encontrado. |
| `/saude/centro-especializado` | Sim | Nenhum registro encontrado. |
| `/saude/laboratorio` | Sim | Nenhum registro encontrado. |
| `/saude/tfd` | Sim | Nenhum registro encontrado. |
| `/saude/sisab` | Sim | Nenhum registro encontrado. |
| `/saude/producao` | Sim | Nenhum registro encontrado. |
| `/saude/vigilancia` | Sim | Nenhum registro encontrado. |
| `/saude/integracoes` | Não | Nenhum arquivo. / Nenhum lote. |
| `/portal-servidor/emissoes` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/documentos` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/beneficios` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/banco-horas` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/licenca-premio` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/consignacoes` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/protocolos` | Sim | Nenhum registro disponível neste filtro. |
| `/portal-servidor/recadastramento` | Não | Nenhuma campanha atribuída ao seu cadastro. |
| `/portal-servidor/credito` | Não | Nenhuma folha mensal publicada com política de consignação disponível. |
| `/portal-servidor/avaliacoes` | Não | Nenhum resultado disponibilizado pelo RH. |
| `/portal-servidor/sst/cat` | Não | Nenhuma comunicação registrada. |
| `/portal-servidor/sst/cipa` | Não | Nenhuma eleição aberta para seu vínculo. |
| `/portal-servidor/sst/planos` | Não | Nenhuma cobertura registrada. |
| `/social/gestao/anexos` | Sim | Nenhum registro encontrado no seu escopo de acesso. |
| `/social/gestao/documentos` | Sim | Nenhum registro encontrado no seu escopo de acesso. |
| `/tributacao` | Não | Nenhuma guia recente encontrada. |
| `/tributacao/economico` | Sim | Nenhum cadastro econômico encontrado. |
| `/tributacao/economico/contadores` | Sim | Nenhum registro encontrado. |
| `/tributacao/itbi/cancelamento-automatico` | Sim | Nenhum registro encontrado. |
| `/tributacao/economico/consulta` | Sim | Nenhum registro encontrado. |
| `/tributacao/avaliacoes` | Sim | Nenhum registro encontrado. |
| `/tributacao/base-territorial` | Sim | Nenhum registro territorial. |
| `/tributacao/fontes-cadastrais` | Sim | Nenhuma consulta registrada. |
| `/tributacao/redesim` | Sim | Nenhum evento encontrado. |
| `/tributacao/itbi` | Sim | Nenhum registro encontrado. |
| `/tributacao/motor-fiscal` | Sim | Nenhum registro encontrado. |
| `/tributacao/alvaras` | Sim | Nenhum alvará emitido. |
| `/tributacao/domicilio-tributario` | Sim | Nenhum registro encontrado. |
| `/tributacao/simples-nacional` | Sim | Nenhum registro encontrado. |
| `/tributacao/nfse` | Sim | Nenhum registro encontrado. |
| `/tributacao/simples-nacional/consulta` | Não | Nenhum período de opção registrado. / Nenhuma declaração ou registro importado para o ano-calendário selecionado. / Nenhum registro persistido para a seleção. |
| `/tributacao/iss-bancario` | Sim | Nenhum registro encontrado. |
| `/tributacao/iss-bancario/gestao` | Sim | Sem mensagem textual identificada pelo coletor |
| `/tributacao/guias` | Sim | Nenhuma guia de arrecadação encontrada. |
| `/tributacao/calendarios` | Sim | Nenhum registro encontrado. |
| `/tributacao/divida` | Sim | Nenhum registro de dívida ativa encontrado. |
| `/tributacao/vaf` | Não | Nenhum exercício de VAF foi configurado. |
| `/tributacao/comparativo-anual` | Sim | Nenhum registro encontrado. |
| `/tributacao/certidoes` | Sim | Nenhum registro de certidão encontrado. |
| `/tributacao/fiscalizacao/gestao` | Sim | Sem mensagem textual identificada pelo coletor |
| `/assinatura-digital/origens` | Sim | Nenhum registro encontrado. |
| `/assinatura-digital/tarefas` | Sim | Nenhum registro encontrado neste escopo. |
| `/assinatura-digital/assine-agora` | Não | Nenhum assinador vinculado à sua conta. Solicite o vínculo no Cadastro de Usuários. |
| `/assinatura-digital/pendentes` | Sim | Nenhum documento pendente de assinatura para esta busca. |
