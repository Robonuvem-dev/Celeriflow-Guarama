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
  "autorizacoes-compra": { title: "Autorizações de Compra e Serviços (ACS)", fields: { processoId: "Processo de compra", fornecedorId: "Fornecedor", data: "Data da autorização (AAAA-MM-DD)", valor: "Valor autorizado", fundamento: "Objeto e fundamento" } },
  "cotacoes-itens": { title: "Cotações de preços por item", fields: { pesquisaId: "Pesquisa de preços", fornecedorId: "Fornecedor", itemProcessoId: "Item pesquisado", valorUnitario: "Preço unitário", data: "Data da cotação (AAAA-MM-DD)" } },
  "usuarios-unidades": { title: "Usuários por unidade administrativa", fields: { usuarioId: "Usuário", unidadeAdministrativaId: "Unidade administrativa" } },
  "requisitantes-finais": { title: "Requisitantes finais e acessos", fields: { funcionarioId: "Servidor requisitante", usuarios: "Usuários autorizados" } },
  "pca-requisitantes": { title: "PCA por requisitante", fields: { funcionarioId: "Requisitante", exercicio: "Exercício do PCA", processoId: "Processo de compra anterior", itemProcessoId: "Item da compra anterior", quantidade: "Quantidade planejada", valorUnitario: "Valor unitário previsto" } },
  "cotas-requisitantes": { title: "Distribuição de itens por requisitante do contrato", fields: { contratoId: "Contrato", itemProcessoId: "Item contratado", funcionarioId: "Requisitante", quantidade: "Quantidade atribuída" } },
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
  for (const [key, value] of Object.entries(result.fields)) if (!["fornecedores", "usuarios", "conteudo", "fundamento", "justificativa"].includes(key) && value.length > 200) throw new Error("Campo excede o tamanho permitido.");
  for (const key of Object.keys(allowed)) {
    const raw = result.fields[key] ?? "";
    if (key === "grupoPai") continue;
    if (!raw) throw new Error("Preencha todos os campos do cadastro.");
    if (["dias", "ordem", "quantidadeEmbalagem", "saidaMinima", "quantidade", "valor", "valorUnitario"].includes(key)) {
      const amount = Number(raw.replace(",", "."));
      if (!Number.isFinite(amount) || amount < 0 || (!["dias", "valor", "valorUnitario"].includes(key) && amount === 0 && catalog !== "cotas-requisitantes") || (["dias", "ordem"].includes(key) && !Number.isInteger(amount))) throw new Error("Prazo ou quantidade inválido.");
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
