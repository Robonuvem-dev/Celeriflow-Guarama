import { z } from "zod";

export const procurementAuxiliaryCatalogs = {
  "condicoes-pagamento": { title: "Condições de pagamento", fields: { dias: "Prazo em dias" } },
  "documentos-sicom": { title: "Tipos de documentos publicados", fields: { codigoSicom: "Código SICOM" } },
  "classes-itens": { title: "Classes de itens", fields: {} },
  "ramos-atividade": { title: "Ramos de atividade", fields: {} },
  "naturezas-bens": { title: "Naturezas dos bens", fields: {} },
  "contas-patrimoniais": { title: "Contas patrimoniais", fields: { codigoContabil: "Código contábil" } },
  "criterios-julgamento": { title: "Critérios de julgamento", fields: {} },
  "grupos-itens": { title: "Grupos e subgrupos de itens", fields: { grupoPai: "Código do grupo pai (apenas para subgrupos)" } },
  "embalagens-unidades": { title: "Embalagens e unidades de medida", fields: { unidade: "Unidade de medida", quantidadeEmbalagem: "Quantidade por embalagem", saidaMinima: "Unidade mínima de saída" } },
  "cidades-sicom": { title: "Vínculo SICOM das cidades", fields: { cidadeId: "Identificador da cidade cadastrada", codigoSicom: "Código SICOM" } },
  "assinaturas-relatorios": { title: "Assinaturas de relatórios", fields: { relatorio: "Relatório", tipoPessoa: "Tipo de pessoa (PF ou PJ)", ordem: "Ordem no relatório", funcionarioId: "Identificador do funcionário", cargo: "Cargo" } },
  "crc": { title: "Certificados de Registro Cadastral", fields: { fornecedorId: "Identificador do fornecedor", cadastro: "Data do cadastro (AAAA-MM-DD)", validade: "Data de validade (AAAA-MM-DD)" } },
  "apostilamentos": { title: "Apostilamentos contratuais", fields: { contratoId: "Identificador do contrato", data: "Data do ato (AAAA-MM-DD)", fundamento: "Fundamento do apostilamento" } },
  "impactos-aditamentos": { title: "Solicitações de impacto financeiro de aditamentos", fields: { contratoId: "Identificador do contrato", valor: "Impacto financeiro solicitado", justificativa: "Justificativa" } },
  "planilha-obras-contratos": { title: "Planilha de itens de obras por contrato", fields: { contratoId: "Identificador do contrato", unidade: "Unidade", quantidade: "Quantidade", valorUnitario: "Valor unitário" } },
  "planilha-obras-aditivos": { title: "Planilha de itens de obras por aditivo", fields: { contratoId: "Identificador do contrato", aditivoId: "Identificador do aditivo", unidade: "Unidade", quantidade: "Quantidade", valorUnitario: "Valor unitário" } },
  "alienacoes": { title: "Processos de receita por alienação", fields: { modalidade: "Modalidade (LEILAO ou CONCORRENCIA)", data: "Data (AAAA-MM-DD)", fundamento: "Fundamento legal" } },
  "alienacoes-produtos": { title: "Planilha de produtos de alienação", fields: { processoAlienacaoId: "Identificador do processo de alienação", unidade: "Unidade", quantidade: "Quantidade", valorUnitario: "Valor de avaliação unitário" } },
  "alienacoes-atas": { title: "Atas de alienação", fields: { processoAlienacaoId: "Identificador do processo de alienação", data: "Data (AAAA-MM-DD)", conteudo: "Conteúdo da ata" } },
  "atas-desconto": { title: "Atas de desconto em tabela", fields: { processoId: "Identificador do processo de compra", fornecedores: "Identificadores dos fornecedores participantes, separados por vírgula", tabela: "Tabela de referência", percentualDesconto: "Percentual de desconto" } },
  "autorizacoes-compra": { title: "Autorizações de Compra e Serviços (ACS)", fields: { processoId: "Processo de compra", solicitacaoDespesaId: "Número da SD vinculada", fornecedorId: "Fornecedor", data: "Data da autorização (AAAA-MM-DD)", vencimento: "Data de vencimento (AAAA-MM-DD)", valor: "Valor autorizado", tipoEmpenho: "Tipo de empenho (ORDINARIO, ESTIMATIVO ou GLOBAL)", parcelada: "Parcelada (SIM ou NAO)", saldoAnterior: "Saldo anterior da dotação", saldoAtual: "Saldo atual da dotação", fonteRecurso: "Fonte de recurso", preEmpenho: "Número do pré-empenho gerado", status: "Situação (ATIVA ou CANCELADA)", fundamento: "Histórico, objeto e fundamento" } },
  "suspensoes-fornecedores": { title: "Suspensões e impedimentos de fornecedores (12.12)", fields: { fornecedorId: "Identificador do fornecedor", cnpjCpf: "CNPJ ou CPF do fornecedor", dataInicio: "Data de início da suspensão (AAAA-MM-DD)", dataTermino: "Data de término da suspensão (AAAA-MM-DD)", motivo: "Motivo e fundamentação legal da suspensão" } },
  "pedidos-processos": { title: "Pedidos de processos licitatórios (padrão, SRP, adesão)", fields: { processoId: "Processo licitatório vinculado", fornecedorId: "Fornecedor contratado", solicitacaoDespesaId: "SD de origem vinculada", tipoPedido: "Tipo de pedido (PADRAO, SRP ou ADESAO)", dataPedido: "Data do pedido (AAAA-MM-DD)", prazoEntrega: "Prazo de entrega em dias", valorTotal: "Valor total do pedido", status: "Situação (ATIVO ou CANCELADO)", motivoCancelamento: "Motivo em caso de cancelamento" } },
  "pesquisas-agrupamentos": { title: "Pesquisas de preços por agrupamento de SD (12.25/12.27)", fields: { agrupamentoId: "Código do agrupamento de SDs", fornecedorId: "Fornecedor cotado", dataCotacao: "Data da cotação (AAAA-MM-DD)", contato: "Contato do fornecedor", telefone: "Telefone do contato", validade: "Validade da proposta (dias)", prazoEntrega: "Prazo de entrega (dias)" } },
  "cotacoes-itens": { title: "Cotações de preços por item", fields: { pesquisaId: "Pesquisa de preços", fornecedorId: "Fornecedor", itemProcessoId: "Item pesquisado", valorUnitario: "Preço unitário", data: "Data da cotação (AAAA-MM-DD)" } },
  "usuarios-unidades": { title: "Usuários por unidade administrativa", fields: { usuarioId: "Usuário", unidadeAdministrativaId: "Unidade administrativa" } },
  "requisitantes-finais": { title: "Requisitantes finais e acessos", fields: { funcionarioId: "Servidor requisitante", usuarios: "Usuários autorizados" } },
  "pca-requisitantes": { title: "PCA por requisitante", fields: { funcionarioId: "Requisitante", exercicio: "Exercício do PCA", processoId: "Processo de compra anterior", itemProcessoId: "Item da compra anterior", quantidade: "Quantidade planejada", valorUnitario: "Valor unitário previsto" } },
  "cotas-requisitantes": { title: "Distribuição de itens por requisitante do contrato", fields: { contratoId: "Contrato", itemProcessoId: "Item contratado", funcionarioId: "Requisitante", quantidade: "Quantidade atribuída" } },
  "decretos-regulamentadores": { title: "Decretos regulamentadores (pregão, SRP, LC 123)", fields: { tipo: "Tipo de regulamentação (PREGAO, SRP ou LC123)", numero: "Número do decreto", ano: "Ano do decreto", dataPublicacao: "Data de publicação (AAAA-MM-DD)", responsavelId: "Responsável vinculado" } },
  "limites-licitacao": { title: "Tabela de limites de licitação por mês/ano", fields: { mes: "Mês de referência (1-12)", ano: "Ano de referência (AAAA)", lei: "Legislação (8.666/93 ou 14.133/21)", limiteConvite: "Limite convite/dispensa pequena", limiteTomadaPrecos: "Limite tomada de preços/dispensa geral", limiteConcorrencia: "Limite concorrência" } },
  "modalidades-personalizadas": { title: "Descrições personalizadas de modalidades", fields: { modalidadeBase: "Modalidade base", descricaoPersonalizada: "Descrição personalizada" } },
  "crjf": { title: "Certificados de Regularidade Jurídico-Fiscal (CRJF)", fields: { fornecedorId: "Identificador do fornecedor", anoNumero: "Ano e número do CRJF", inscricaoEstadual: "Inscrição estadual", dataEmissao: "Data de emissão (AAAA-MM-DD)", validade: "Data de validade (AAAA-MM-DD)", certidoesNegativas: "Certidões negativas e representantes" } },
  "consorcios-empresas": { title: "Consórcios de empresas", fields: { exercicio: "Exercício (ano)", numeroConsorcio: "Número do consórcio", anoNumero: "Ano e número do consórcio", cnpj: "CNPJ do consórcio", dataCadastro: "Data do cadastro (AAAA-MM-DD)", dataEncerramento: "Data de encerramento (AAAA-MM-DD)", registroOrgao: "Órgão competente e número de registro", dataRegistro: "Data de registro (AAAA-MM-DD)", designacao: "Designação e endereço", emailTelefone: "E-mail e telefone", ramoAtividade: "Ramo de atividade", ramo: "Ramo de atuação", liderConsorcioId: "ID do fornecedor líder do consórcio", fornecedores: "Fornecedores consorciados (IDs separados por vírgula)", percentualLider: "Percentual de participação da líder (%)" } },
  "comissoes-licitacao": { title: "Comissões de licitação", fields: { tipoComissao: "Tipo (PERMANENTE, ESPECIAL ou AGENTE_CONTRATACAO)", atoDesignacao: "Número/ano do ato de designação", dataDesignacao: "Data da designação (AAAA-MM-DD)", presidenteId: "Presidente/Agente responsável", membrosIds: "Membros da equipe (IDs separados por vírgula)" } },
  "clonagem-requisitantes": { title: "Clonagem de requisitantes de exercício anterior", fields: { exercicioOrigem: "Exercício de origem (AAAA)", exercicioDestino: "Exercício de destino (AAAA)", requisitantesClonados: "Quantidade ou lista de requisitantes clonados" } },
  "reajustes-srp": { title: "Reajustes de valor e quantidade (SRP)", fields: { processoId: "Processo licitatório SRP", itemProcessoId: "Item do processo", tipoReajuste: "Tipo (VALOR ou QUANTIDADE)", percentual: "Percentual de reajuste", justificativa: "Motivação e índice legal" } },
  "transferencias-requisitantes": { title: "Transferência de itens entre requisitantes (Nova SD)", fields: { processoId: "Processo de compra", itemProcessoId: "Item transferido", requisitanteOrigemId: "Requisitante de origem", requisitanteDestinoId: "Requisitante de destino (Nova SD)", quantidade: "Quantidade transferida" } },
  "transferencias-exercicios": { title: "Transferência de processos entre exercícios", fields: { processoId: "Processo licitatório homologado", exercicioAnterior: "Exercício anterior (AAAA)", exercicioAtual: "Exercício atual (AAAA)", novaUnidadeContabil: "Nova unidade orçamentária/contábil" } },
  "transferencias-administracoes": { title: "Transferência de processo para outra administração", fields: { processoId: "Processo licitatório", administracaoDestino: "Órgão/Administração de destino", motivo: "Motivo e termo de transferência", data: "Data da transferência (AAAA-MM-DD)" } },
  "atas-processo": { title: "Cadastro da ata do processo licitatório", fields: { processoId: "Processo licitatório", anoAta: "Ano da ata", numeroComissao: "Número da comissão licitatória", conteudoAta: "Resumo da ata da sessão" } },
  "bloqueios-fornecedores": { title: "Bloqueio e desbloqueio de processo por fornecedor", fields: { processoId: "Processo licitatório", fornecedorId: "Fornecedor", statusBloqueio: "Situação (BLOQUEADO ou LIBERADO)", motivo: "Motivo/Justificativa" } },
  "integracoes-plataformas": { title: "Importação e exportação de propostas (Licitanet/AMM/SICOM)", fields: { processoId: "Processo licitatório", plataforma: "Plataforma (LICITANET, AMM, SICOM, PORTAL_TRANSPARENCIA)", tipoOperacao: "Operação (EXPORTAR_PROPOSTAS, IMPORTAR_COTACAO, SINCRONIZAR_TRANSPARENCIA)", detalhes: "Status ou identificador da integração" } },
  "distribuicao-homologada": { title: "Distribuição de quantidades homologadas parcialmente (ACS)", fields: { processoId: "Processo licitatório", itemProcessoId: "Item homologado", fornecedorId: "Fornecedor vencedor", quantidadeHomologada: "Quantidade distribuída para ACS", solicitacaoDespesaId: "Número da SD gerada" } },
  "alteracao-tipo-sd": { title: "Alteração de tipo de Solicitação de Despesa (SD)", fields: { solicitacaoDespesaId: "Identificador da SD", tipoOriginal: "Tipo original", tipoCorreto: "Tipo corrigido (1 - Compras/Serviços, 2 - Obras/Engenharia, 3 - Registro de Preços)", justificativa: "Justificativa da alteração" } },
  "clonagem-sd-deserta": { title: "Clonagem de SDs de processos desertos", fields: { processoOrigemId: "Processo deserto", solicitacaoDespesaOrigemId: "SD de origem", processoDestinoId: "Novo processo ou reabertura", justificativa: "Motivo da clonagem" } },
  "reemissao-documentos": { title: "Reemissão de relatórios (ACS, AE e SDs)", fields: { tipoDocumento: "Documento (ACS, AUTORIZACAO_EMPENHO, SD, MAPA_COTACAO)", numero: "Número do documento", ano: "Ano de referência (AAAA)", processoId: "Processo licitatório vinculado" } },
  "consultas-processos": { title: "Consulta de processos, situação e saldo de itens", fields: { processoId: "Processo ou SD", tipoConsulta: "Tipo (ABERTURA, SITUACAO_PROCESSO, SITUACAO_SD, SALDO_ITENS, PEDIDOS_COMPRAS)", dadosConsulta: "Dados consolidados da consulta" } },
  "remanejamentos": { title: "Apostilamentos de remanejamento", fields: { contratoId: "Contrato", cotaOrigemId: "Distribuição de origem", cotaDestinoId: "Distribuição de destino", quantidade: "Quantidade remanejada", data: "Data do ato (AAAA-MM-DD)", fundamento: "Fundamento do apostilamento" } },
} as const;
export type ProcurementAuxiliaryCatalog = keyof typeof procurementAuxiliaryCatalogs;
export function isProcurementAuxiliaryCatalog(value: string): value is ProcurementAuxiliaryCatalog {
  return Object.hasOwn(procurementAuxiliaryCatalogs, value);
}
export const auxiliaryRecordSchema = z.object({
  code: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(200),
  fields: z.record(z.string(), z.string().trim().max(4000)),
});
export type ProcurementAuxiliaryRecord = z.infer<typeof auxiliaryRecordSchema> & { id: string };
export function parseProcurementAuxiliaryRecord(catalog: ProcurementAuxiliaryCatalog, value: unknown) {
  const result = auxiliaryRecordSchema.parse(value);
  const allowed = procurementAuxiliaryCatalogs[catalog].fields;
  for (const key of Object.keys(result.fields)) if (!Object.hasOwn(allowed, key)) throw new Error("Campo de cadastro inválido.");
  for (const [key, value] of Object.entries(result.fields)) if (!["fornecedores", "usuarios", "conteudo", "fundamento", "justificativa", "membrosIds", "certidoesNegativas", "conteudoAta", "motivo", "dadosConsulta", "detalhes", "motivoCancelamento"].includes(key) && value.length > 200) throw new Error("Campo excede o tamanho permitido.");
  for (const key of Object.keys(allowed)) {
    const raw = result.fields[key] ?? "";
    if (["grupoPai", "solicitacaoDespesaId", "requisitantesClonados", "membrosIds", "motivoCancelamento", "preEmpenho", "saldoAnterior", "saldoAtual", "fonteRecurso", "tipoEmpenho", "parcelada", "vencimento", "status"].includes(key)) continue;
    if (!raw) throw new Error("Preencha todos os campos do cadastro.");
    if (["dias", "ordem", "quantidadeEmbalagem", "saidaMinima", "quantidade", "valor", "valorTotal", "prazoEntrega", "validade", "valorUnitario", "quantidadeHomologada", "limiteConvite", "limiteTomadaPrecos", "limiteConcorrencia"].includes(key)) {
      const amount = Number(raw.replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0 || (!["dias", "valor", "valorTotal", "prazoEntrega", "validade", "valorUnitario", "limiteConvite", "limiteTomadaPrecos", "limiteConcorrencia"].includes(key) && amount === 0 && catalog !== "cotas-requisitantes") || (["dias", "ordem", "prazoEntrega", "validade"].includes(key) && !Number.isInteger(amount))) throw new Error("Prazo ou quantidade inválido.");
    }
  }
  if (catalog === "assinaturas-relatorios" && !["PF", "PJ"].includes(result.fields.tipoPessoa)) throw new Error("Tipo de pessoa deve ser PF ou PJ.");
  if (catalog === "crc") {
    for (const key of ["cadastro", "validade"]) {
      const date = result.fields[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Data inválida.");
    }
    if (result.fields.validade < result.fields.cadastro) throw new Error("A validade deve ser posterior ou igual ao cadastro.");
  }
  if (catalog === "apostilamentos" && (!/^\d{4}-\d{2}-\d{2}$/.test(result.fields.data) || !Number.isFinite(Date.parse(result.fields.data)) || new Date(result.fields.data).toISOString().slice(0, 10) !== result.fields.data)) throw new Error("Data do apostilamento inválida.");
  if (["alienacoes", "alienacoes-atas", "autorizacoes-compra", "cotacoes-itens", "remanejamentos"].includes(catalog) && (!/^\d{4}-\d{2}-\d{2}$/.test(result.fields.data) || !Number.isFinite(Date.parse(result.fields.data)) || new Date(result.fields.data).toISOString().slice(0, 10) !== result.fields.data)) throw new Error("Data do registro inválida.");
  if (catalog === "suspensoes-fornecedores") {
    for (const key of ["dataInicio", "dataTermino"]) {
      const date = result.fields[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error("Data da suspensão inválida.");
    }
    if (result.fields.dataTermino < result.fields.dataInicio) throw new Error("A data de término deve ser posterior ou igual à de início.");
  }
  if (catalog === "pedidos-processos" && (!/^\d{4}-\d{2}-\d{2}$/.test(result.fields.dataPedido) || !Number.isFinite(Date.parse(result.fields.dataPedido)) || new Date(result.fields.dataPedido).toISOString().slice(0, 10) !== result.fields.dataPedido)) throw new Error("Data do pedido inválida.");
  if (catalog === "pesquisas-agrupamentos" && (!/^\d{4}-\d{2}-\d{2}$/.test(result.fields.dataCotacao) || !Number.isFinite(Date.parse(result.fields.dataCotacao)) || new Date(result.fields.dataCotacao).toISOString().slice(0, 10) !== result.fields.dataCotacao)) throw new Error("Data da cotação inválida.");
  if (catalog === "pca-requisitantes" && (!/^\d{4}$/.test(result.fields.exercicio) || Number(result.fields.exercicio) < 2000 || Number(result.fields.exercicio) > 2100)) throw new Error("Exercício inválido.");
  if (catalog === "alienacoes" && !["LEILAO", "CONCORRENCIA"].includes(result.fields.modalidade)) throw new Error("Selecione LEILAO ou CONCORRENCIA.");
  if (catalog === "atas-desconto") {
    const value = Number(result.fields.percentualDesconto.replace(",", "."));
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Desconto deve estar entre 0 e 100%.");
  }
  return result;
}
export function procurementAuxiliaryKey(catalog: ProcurementAuxiliaryCatalog, id: string) {
  return `COMPRAS_CADASTRO:${catalog}:${id}`;
}
export function canAccessFinalRequester(userId: string, administrator: boolean, fields: Record<string, string>) {
  return administrator || (fields.usuarios || "").split(",").map(value => value.trim()).includes(userId);
}
