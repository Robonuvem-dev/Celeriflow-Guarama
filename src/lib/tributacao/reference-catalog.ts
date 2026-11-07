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
  "cnae-fiscal": "CNAE-Fiscal e impedimentos",
  "tipo-arquivo": "Tipos de arquivos de importação e exportação",
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
  incidence:z.enum(["","Receita","Valor fixo","Locação"]).default(""),
  annexCode:z.string().trim().max(80).default(""),
  validFrom:z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/).default(""),
  validTo:z.string().regex(/^(|\d{4}-\d{2}-\d{2})$/).default(""),
  withholding:z.boolean().default(false),dueInMunicipality:z.boolean().default(true),
  blocksSimples:z.boolean().default(false),concurrentBlocksSimples:z.boolean().default(false),blocksMei:z.boolean().default(false),
  serviceCodes:z.string().trim().max(2000).default(""),
  ufCode:z.string().trim().max(2).default(""),governmentLevel:z.enum(["","Municipal","Estadual","Federal"]).default(""),
  prefeituraDescription:z.string().trim().max(240).default(""),secretariatName:z.string().trim().max(240).default(""),
  address:z.string().trim().max(500).default(""),responsibleName:z.string().trim().max(240).default(""),
  contactPhone:z.string().trim().max(40).default(""),contactEmail:z.union([z.literal(""),z.email()]).default(""),
  periodicity:z.string().trim().max(120).default(""),packageName:z.string().trim().max(160).default(""),processor:z.string().trim().max(160).default(""),
  reductionLimit:z.string().trim().max(20).default("").refine(value=>!value||(/^\d+(?:[.,]\d{1,4})?$/.test(value)&&Number(value.replace(",","."))<=100),"Redução da base deve estar entre 0 e 100%."),
  legislation:z.string().trim().max(2000).default(""),procedureType:z.string().trim().max(120).default(""),
  eventType:z.string().trim().max(160).default(""),eventNature:z.string().trim().max(160).default(""),applicableSanction:z.string().trim().max(160).default(""),
}).refine(value=>value.kind!=="usuario-municipal"||Boolean(value.userId&&value.position&&value.registration),"Usuário municipal exige usuário cadastrado, cargo/função e matrícula.").refine(value=>value.kind!=="equipamento-credenciado"||Boolean(value.taxpayerId&&value.model&&value.serialNumber),"Equipamento exige credenciado, modelo e número de série.").refine(value=>value.kind!=="painel"||Boolean(value.url&&value.validUntil),"Painel exige link e validade.").refine(value=>!value.validUntil||(Number.isFinite(Date.parse(`${value.validUntil}T12:00:00Z`))&&new Date(`${value.validUntil}T12:00:00Z`).toISOString().slice(0,10)===value.validUntil),"Validade inválida.");
export type TaxReferenceData = z.infer<typeof taxReferenceSchema>;
export type TaxReferenceRow = {id:string; version:number; deleted:boolean; data:TaxReferenceData};
type ReferenceField={name:keyof TaxReferenceData;label:string;type?:"text"|"date"|"checkbox"|"email";options?:readonly string[];filter?:boolean};
const validity:ReferenceField[]=[{name:"validFrom",label:"Vigência inicial",type:"date"},{name:"validTo",label:"Vigência final",type:"date"}];
const incidence:ReferenceField={name:"incidence",label:"Incidência do ISS",options:["","Receita","Valor fixo","Locação"],filter:true};
export const taxReferenceExtraFields:Partial<Record<TaxReferenceKind,ReferenceField[]>>={
 atividade:[incidence,{name:"annexCode",label:"Código do anexo",filter:true},...validity,{name:"withholding",label:"Permite retenção/substituição tributária",type:"checkbox",filter:true},{name:"dueInMunicipality",label:"ISS devido no município",type:"checkbox",filter:true}],
 evento:[{name:"eventType",label:"Tipo de evento",options:["","Opção","Inclusão","Exclusão","Desenquadramento","Notificação","Retificação"],filter:true},{name:"eventNature",label:"Natureza",options:["","Ofício","Opcional","Obrigatória","Administrativa","Judicial"],filter:true},{name:"applicableSanction",label:"Sanção aplicável",filter:true}],
 "evento-mei":[{name:"eventType",label:"Tipo de evento",options:["","Opção","Inclusão","Exclusão","Desenquadramento","Notificação","Retificação"],filter:true},{name:"eventNature",label:"Natureza",options:["","Ofício","Opcional","Obrigatória","Administrativa","Judicial"],filter:true},{name:"applicableSanction",label:"Sanção aplicável",filter:true}],
 "cnae-fiscal":[{name:"blocksSimples",label:"Impeditiva ao Simples Nacional",type:"checkbox"},{name:"concurrentBlocksSimples",label:"Concomitantemente impeditiva ao Simples Nacional",type:"checkbox"},{name:"blocksMei",label:"Impeditiva ao MEI",type:"checkbox"},{name:"serviceCodes",label:"Códigos dos serviços vinculados (separados por vírgula)"}],
 "orgao-municipio":[{name:"ufCode",label:"UF",filter:true}],
 "orgao-configuracao":[{name:"prefeituraDescription",label:"Descrição da prefeitura"},{name:"secretariatName",label:"Secretaria responsável pelo Simples Nacional"},{name:"address",label:"Endereço da prefeitura/secretaria"},{name:"responsibleName",label:"Nome do responsável"},{name:"contactPhone",label:"Telefone da secretaria/setor"},{name:"contactEmail",label:"E-mail da prefeitura",type:"email"}],
 "unidade-administrativa":[{name:"governmentLevel",label:"Esfera administrativa",options:["","Municipal","Estadual","Federal"]}],
 "tipo-arquivo":[{name:"periodicity",label:"Periodicidade"},{name:"packageName",label:"Pacote"},{name:"processor",label:"Processador (identificador)"}],
 "lista-servico":[incidence,{name:"reductionLimit",label:"Limite de redução da base de cálculo (%)"},...validity,{name:"legislation",label:"Legislação pertinente"}],
 "procedimento-fiscal":[{name:"procedureType",label:"Tipo do procedimento"}],
};
export function latestTaxReferences(rows: TaxReferenceRow[]) {
  const latest = new Map<string, TaxReferenceRow>();
  for (const row of rows) if (!latest.has(row.id) || latest.get(row.id)!.version < row.version) latest.set(row.id, row);
  return [...latest.values()];
}
export function searchTaxReferences(rows:TaxReferenceRow[], kind:TaxReferenceKind, query:string) {
  const q=query.trim().toLocaleLowerCase("pt-BR");
  return latestTaxReferences(rows).filter(row=>!row.deleted && row.data.kind===kind && Object.values(row.data).join(" ").toLocaleLowerCase("pt-BR").includes(q));
}

export function renderReferenceConclusion(template:string,code:string,name:string){return template.replace(/\{\{(codigo|nome)\}\}/g,(_,key:string)=>key==="codigo"?code:name);}
