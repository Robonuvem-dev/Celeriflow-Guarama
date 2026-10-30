import { z } from "zod";

type Field = { key: string; label: string; type?: "text" | "number" | "date"; required?: boolean };
type Catalog = { title: string; module: "PATRIMONIO" | "FROTAS"; fields: Field[] };
const field = (key: string, label: string, type: Field["type"] = "text", required = true): Field => ({ key, label, type, required });
export const assetCatalogs: Record<string, Catalog> = {
  especies: { title: "Espécies patrimoniais", module: "PATRIMONIO", fields: [field("description", "Descrição", "text", false)] },
  naturezas: { title: "Naturezas de bens", module: "PATRIMONIO", fields: [field("classification", "Classificação patrimonial")] },
  depreciacao: { title: "Categorias de depreciação", module: "PATRIMONIO", fields: [field("months", "Vida útil em meses", "number"), field("residualPercent", "Valor residual (%)", "number"), field("legalBasis", "Fundamento legal", "text")] },
  responsaveis: { title: "Responsáveis patrimoniais", module: "PATRIMONIO", fields: [field("employeeId", "Identificador do servidor"), field("role", "Responsabilidade")] },
  comissao: { title: "Comissão patrimonial", module: "PATRIMONIO", fields: [field("employeeId", "Identificador do servidor"), field("role", "Função na comissão"), field("designation", "Portaria de designação")] },
  baixas: { title: "Motivos de baixa", module: "PATRIMONIO", fields: [field("justification", "Fundamento e justificativa")] },
  contas: { title: "Contas patrimoniais", module: "PATRIMONIO", fields: [field("account", "Código da conta PCASP"), field("classification", "Classificação do bem"), field("assetId", "Identificador do bem vinculado", "text", false)] },
  seguros: { title: "Apólices dos bens", module: "PATRIMONIO", fields: [field("assetId", "Identificador do bem"), field("insurer", "Seguradora"), field("policy", "Número da apólice"), field("startsAt", "Vigência inicial", "date"), field("endsAt", "Vigência final", "date")] },
  imoveis: { title: "Imóveis patrimoniais — cadastro independente", module: "PATRIMONIO", fields: [field("address", "Endereço completo"), field("bic", "BIC / inscrição imobiliária")] },
  naoContabeis: { title: "Bens não contábeis", module: "PATRIMONIO", fields: [field("species", "Espécie"), field("nature", "Natureza"), field("location", "Localização"), field("responsible", "Responsável"), field("condition", "Estado de conservação")] },
  embalagens: { title: "Embalagens e saída mínima", module: "PATRIMONIO", fields: [field("unit", "Unidade de embalagem"), field("conversion", "Unidades por embalagem", "number"), field("minimumIssue", "Saída mínima", "number")] },
  niveis: { title: "Níveis de estoque por material", module: "PATRIMONIO", fields: [field("materialId", "Identificador do material"), field("minimum", "Estoque mínimo", "number"), field("average", "Estoque médio", "number"), field("maximum", "Estoque máximo", "number")] },
  comissaoAlmoxarifado: { title: "Comissão do almoxarifado", module: "PATRIMONIO", fields: [field("employeeId", "Identificador do servidor"), field("role", "Função"), field("designation", "Portaria de designação")] },
  requisitantes: { title: "Requisitantes por exercício", module: "PATRIMONIO", fields: [field("employeeId", "Identificador do servidor"), field("authorization", "Autorização para requisitar")] },
  parametros: { title: "Parâmetros do almoxarifado", module: "PATRIMONIO", fields: [field("value", "Valor"), field("description", "Finalidade")] },
  assinaturas: { title: "Assinaturas em relatórios de almoxarifado", module: "PATRIMONIO", fields: [field("report", "Identificador do relatório"), field("signer", "Nome do signatário"), field("role", "Cargo"), field("position", "Ordem da assinatura", "number")] },
  marcas: { title: "Marcas de veículos", module: "FROTAS", fields: [] },
  roteiros: { title: "Roteiros e distâncias", module: "FROTAS", fields: [field("line", "Descrição da linha"), field("origin", "Origem"), field("destination", "Destino"), field("distanceKm", "Distância da rota (km)", "number")] },
  modelos: { title: "Modelos de veículos", module: "FROTAS", fields: [field("brand", "Marca")] },
  atividades: { title: "Atividades dos veículos", module: "FROTAS", fields: [field("description", "Descrição da atividade")] },
  tiposOcorrencia: { title: "Tipos de ocorrência de frota", module: "FROTAS", fields: [field("description", "Descrição")] },
  tiposMulta: { title: "Tipos de multa", module: "FROTAS", fields: [field("legalBasis", "Fundamento normativo"), field("points", "Pontuação", "number")] },
  responsaveisFrota: { title: "Responsáveis de frota", module: "FROTAS", fields: [field("employeeId", "Identificador do servidor"), field("role", "Responsabilidade")] },
  instituicoes: { title: "Instituições da frota", module: "FROTAS", fields: [field("document", "Documento da instituição"), field("address", "Endereço")] },
  solicitacoes: { title: "Solicitações da comunidade", module: "FROTAS", fields: [field("requester", "Solicitante"), field("contact", "Contato"), field("description", "Solicitação"), field("status", "Situação")] },
};
export function catalogDefinition(kind: string) {
  if (!Object.hasOwn(assetCatalogs, kind)) throw new Error("Cadastro desconhecido.");
  return assetCatalogs[kind];
}
export const catalogRecordInput = z.object({
  id: z.string().max(100).default(""), kind: z.string(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(250),
  year: z.coerce.number().int().min(1900).max(2200), departmentId: z.string().min(1).max(100),
  version: z.string().default(""), details: z.record(z.string(), z.string().trim().max(4000)),
});
export function validateCatalogDetails(kind: string, details: Record<string, string>) {
  const definition = catalogDefinition(kind);
  for (const f of definition.fields) {
    const value = details[f.key] || "";
    if (f.required && !value) throw new Error(`Informe ${f.label}.`);
    if (value && f.type === "number" && (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) throw new Error(`${f.label}: número não negativo obrigatório.`);
    if (value && f.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error(`${f.label}: data inválida.`);
  }
  if (kind === "niveis" && !(Number(details.minimum) <= Number(details.average) && Number(details.average) <= Number(details.maximum))) throw new Error("Estoque mínimo deve ser ≤ médio ≤ máximo.");
  if (kind === "depreciacao" && (!Number.isInteger(Number(details.months)) || Number(details.months) < 1 || Number(details.residualPercent) > 100)) throw new Error("Vida útil deve ser inteira positiva; percentual residual entre 0 e 100.");
  if (kind === "embalagens" && (Number(details.conversion) <= 0 || Number(details.minimumIssue) <= 0)) throw new Error("Conversão e saída mínima devem ser positivas.");
  if (kind === "seguros" && details.endsAt < details.startsAt) throw new Error("Vigência final anterior à inicial.");
  return Object.fromEntries(definition.fields.map(f => [f.key, details[f.key] || ""]));
}
