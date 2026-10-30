import { z } from "zod";

/** Explicit auxiliary fiscal tables. These records do not apply tax calculations. */
export const taxReferenceCatalogs = {
  "usuario-municipal":"Usuários do município",
  "equipamento-credenciado":"Equipamentos dos credenciados",
  atividade: "Atividades do Simples Nacional",
  evento: "Eventos do Simples Nacional",
  "evento-mei": "Eventos do MEI",
  "instituicao-financeira": "Instituições financeiras",
  "situacao-parcelamento": "Situações dos parcelamentos",
  receita: "Receitas",
  tributo: "Tributos",
  "sistema-origem": "Sistemas de origem",
  "unidade-administrativa": "Unidades administrativas",
  "orgao-municipio": "Órgãos e municípios (TOM)",
  cosif: "COSIF",
  "titulo-desif": "Títulos DES-IF",
  "tarifa-bancaria": "Tarifas bancárias",
  "lista-servico": "Lista de serviços",
  "tipo-dependencia": "Tipos de dependência",
  "produto-servico": "Identificação de outros produtos e serviços",
  "codigo-tributacao-desif": "Códigos de tributação DES-IF",
  "codigo-tributacao-municipal": "Códigos de tributação municipal",
  "evento-contabil": "Eventos contábeis em conta de resultado",
  pais: "Países", uf: "Unidades federativas", municipio: "Municípios",
  "horario-especial": "Horários especiais",
  "ato-cartorario": "Atos cartorários",
  "procedimento-fiscal": "Procedimentos fiscais",
  painel: "Painéis e links com validade",
  "orgao-configuracao": "Texto, brasão e conclusão do órgão municipal",
  "titulo-setor": "Títulos padrão do setor responsável",
} as const;
export type TaxReferenceKind = keyof typeof taxReferenceCatalogs;
const kinds = Object.keys(taxReferenceCatalogs) as [TaxReferenceKind, ...TaxReferenceKind[]];
export const taxReferenceSchema = z.object({
  kind: z.enum(kinds), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(240),
  details: z.string().trim().max(4000).default(""), budgetUnitId: z.string().min(1), governmentEntityId: z.string().min(1),
  userId:z.string().max(200).default(""),
  position:z.string().trim().max(160).default(""),
  registration:z.string().trim().max(80).default(""),
  taxpayerId:z.string().max(200).default(""),
  model:z.string().trim().max(120).default(""),
  serialNumber:z.string().trim().max(120).default(""),
  equipmentStatus:z.enum(["ATIVO","INATIVO"]).default("ATIVO"),
  url: z.union([z.literal(""),z.url().refine(value=>/^https?:\/\//.test(value),"Use uma URL HTTP ou HTTPS.")]).default(""),
  validUntil:z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/).default(""),
  coatUrl:z.union([z.literal(""),z.url().refine(value=>value.startsWith("https://"),"O brasão deve usar HTTPS.")]).default(""),
  conclusionTemplate:z.string().max(4000).default(""),
  relatedCode: z.string().trim().max(80).default(""), ignoreRevenue: z.boolean().default(false),
}).refine(value=>value.kind!=="usuario-municipal"||Boolean(value.userId&&value.position&&value.registration),"Usuário municipal exige usuário cadastrado, cargo/função e matrícula.").refine(value=>value.kind!=="equipamento-credenciado"||Boolean(value.taxpayerId&&value.model&&value.serialNumber),"Equipamento exige credenciado, modelo e número de série.").refine(value=>value.kind!=="painel"||Boolean(value.url&&value.validUntil),"Painel exige link e validade.").refine(value=>!value.validUntil||(Number.isFinite(Date.parse(`${value.validUntil}T12:00:00Z`))&&new Date(`${value.validUntil}T12:00:00Z`).toISOString().slice(0,10)===value.validUntil),"Validade inválida.");
export type TaxReferenceData = z.infer<typeof taxReferenceSchema>;
export type TaxReferenceRow = {id:string; version:number; deleted:boolean; data:TaxReferenceData};
export function latestTaxReferences(rows: TaxReferenceRow[]) {
  const latest = new Map<string, TaxReferenceRow>();
  for (const row of rows) if (!latest.has(row.id) || latest.get(row.id)!.version < row.version) latest.set(row.id, row);
  return [...latest.values()];
}
export function searchTaxReferences(rows:TaxReferenceRow[], kind:TaxReferenceKind, query:string) {
  const q=query.trim().toLocaleLowerCase("pt-BR");
  return latestTaxReferences(rows).filter(row=>!row.deleted && row.data.kind===kind && `${row.data.code} ${row.data.name} ${row.data.details} ${row.data.relatedCode}`.toLocaleLowerCase("pt-BR").includes(q));
}

export function renderReferenceConclusion(template:string,code:string,name:string){return template.replace(/\{\{(codigo|nome)\}\}/g,(_,key:string)=>key==="codigo"?code:name);}
