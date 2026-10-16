import { z } from "zod";
import { SstValidationError } from "./errors";

export const catLayoutProvenance = {
  version: "INSS-copy_of_CAT-461c38c6-v1",
  sourceUrl: "https://www.gov.br/inss/pt-br/centrais-de-conteudo/formularios/copy_of_CAT.pdf",
  indexUrl: "https://www.gov.br/inss/pt-br/centrais-de-conteudo/formularios/formularios",
  sha256: "461c38c63fcb2286e9f092468b2a914417ae62aed47cfe71b5f6899a0367dd43",
  verifiedAt: "2026-10-11", pages: 1, fieldCount: 64,
} as const;
type Kind = "text" | "date" | "time" | "yn" | "uf" | "money" | "cnae" | "cbo" | "nit" | "cep" | "sex" | "area" | "signature";
export type CatLayoutField = { key: string; pdf: string; section: string; kind: Kind; required: boolean; clinical: boolean };
const group = (section: string, clinical: boolean, rows: [string, string, Kind, boolean][]): CatLayoutField[] => rows.map(([key,pdf,kind,required]) => ({ key,pdf,kind,required,section,clinical }));
/** Exact AcroForm names extracted from the official PDF, including the two signature boxes. */
export const catLayoutFields: CatLayoutField[] = [
  ...group("Emitente", false, [
    ["issuer","Emitente","text",true],["issuedOn","Data Emissão","date",true],["catType","Tipo de CAT","text",true],["deathCommunication","Comunicação Óbito","yn",true],["affiliation","Filiação","text",true],["issuerEmail","Email","text",false],
  ]),
  ...group("Empregador", false, [
    ["employerName","Razão SocialNome","text",true],["employerDocument","TipoNum Doc","text",true],["cnae","CNAE","cnae",true],["employerPostalCode","CEP","cep",true],["employerPhone","Telefone","text",true],["employerNeighborhood","Bairro","text",true],["employerState","Estado","uf",true],["employerAddress","Endereço","text",true],["employerCity","Município","text",true],
  ]),
  ...group("Acidentado", false, [
    ["employeeName","Nome","text",true],["motherName","Nome da Mãe","text",true],["birthDate","Data de Nascimento","date",true],["sex","Sexo","sex",true],["education","Grau de Instrução","text",true],["maritalStatus","Estado Civil","text",true],["remuneration","Remuneração","money",true],["ctps","CTPS","text",false],["identity","Identidade","text",true],["nit","PISPASEPNIT","nit",true],["employeePostalCode","CEP_2","cep",true],["employeeAddress","Endereço_2","text",true],["employeeNeighborhood","Bairro_2","text",true],["employeeState","Estado_2","uf",true],["employeeCity","Município_2","text",true],["employeePhone","Telefone_2","text",true],["cbo","CBO","cbo",true],["retired","Aposentadoria","yn",true],["area","Área","area",true],
  ]),
  ...group("Acidente", false, [
    ["accidentDate","Data do Acidente","date",true],["accidentTime","Hora do Acidente","time",true],["hoursWorked","Horas Trabalhadas","time",true],["accidentType","Tipo","text",true],["workAbsence","Houve Afastamento","yn",true],["policeReport","Reg Policial","yn",true],["accidentLocation","Local do Acidente","text",true],["locationSpecification","Esp Local","text",true],["serviceProviderDocument","CNPJ  CGC ou CEI da Prestadora","text",false],["accidentState","UF do Acidente","uf",true],["accidentCity","Município do Acidente","text",true],["lastWorkOrDeath","Último dia Trab Dt Óbito","date",false],["bodyParts","Parte do Corpo","text",true],["agent","Agente Causador","text",true],["generatingSituation","Sit Geradora","text",true],["death","Morte","yn",true],["deathDate","Data Óbito","date",false],["issuerPlaceDate","Local e Data","text",true],["issuerSignature","Assinatura e carimbo do emitente","signature",false],
  ]),
  ...group("Atestado médico", true, [
    ["medicalUnit","Unidade","text",true],["attendanceDate","Data Atendimento","date",true],["attendanceTime","Hora Atendimento","time",true],["hospitalized","Houve Internação","yn",true],["willBeAway","Será afastado","yn",true],["injury","Nat Lesão","text",true],["cidCodes","CID  10","text",true],["medicalObservations","Observações","text",false],["crm","CRM","text",true],["medicalPlaceDate","Local e Data_2","text",true],["medicalSignature","Assinatura  e carimbo legível do médico com CRMUF","signature",false],
  ]),
];
export const catLayoutCodeOptions: Record<string, readonly string[]> = {
  issuer: ["EMPREGADOR","SINDICATO","MEDICO","SEGURADO","DEPENDENTE","AUTORIDADE_PUBLICA"],
  catType: ["INITIAL","REOPENING","DEATH"], affiliation: ["EMPREGADO","AVULSO","SEGURADO_ESPECIAL","MEDICO_RESIDENTE"],
  accidentType: ["TYPICAL","COMMUTE","DISEASE"], sex: ["M","F"], area: ["URBANA","RURAL"],
};
const ufs = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
export function validateCatLayoutFields(raw: unknown, clinical: boolean, complete = false): Record<string,string> {
  const values = z.record(z.string(), z.string().trim().max(3000)).parse(raw);
  const definitions = catLayoutFields.filter(f => f.clinical === clinical && f.kind !== "signature");
  if (Object.keys(values).some(key => !definitions.some(f => f.key === key))) throw new SstValidationError("Campo desconhecido ou clínico no formulário administrativo.");
  const result: Record<string,string> = {};
  for (const field of definitions) {
    const value = values[field.key] || "";
    if (complete && field.required && !value) throw new SstValidationError(`Preencha ${field.pdf}.`);
    if (value) {
      const options = catLayoutCodeOptions[field.key];
      const invalid = options ? !options.includes(value) : field.kind === "yn" ? !["S","N"].includes(value) : field.kind === "uf" ? !ufs.includes(value) : field.kind === "date" ? !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(new Date(`${value}T00:00:00Z`).getTime()) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) !== value : field.kind === "time" ? !/^([01]\d|2[0-3]):[0-5]\d$/.test(value) : field.kind === "money" ? !/^(0|[1-9]\d{0,11})\.\d{2}$/.test(value) : field.kind === "cnae" ? !/^\d{7}$/.test(value) : field.kind === "cbo" ? !/^\d{6}$/.test(value) : field.kind === "nit" ? !/^\d{11}$/.test(value) : field.kind === "cep" ? !/^\d{8}$/.test(value) : false;
      if (invalid) throw new SstValidationError(`Valor/código inválido: ${field.pdf}.`);
      if (field.key === "issuerEmail" && !z.email().safeParse(value).success) throw new SstValidationError("E-mail do emitente inválido.");
      if (field.key === "employerDocument" && !/^(CNPJ \d{14}|CPF \d{11}|CEI \d{12}|CAEPF \d{14})$/.test(value)) throw new SstValidationError("Tipo/documento do empregador: CNPJ, CPF, CEI ou CAEPF seguido do número sem pontuação.");
    }
    result[field.key] = value;
  }
  if (!clinical && ((result.death === "S" || result.catType === "DEATH") && !result.deathDate)) throw new SstValidationError("Óbito exige data comprovada.");
  if (!clinical && result.death === "N" && result.deathDate) throw new SstValidationError("Data de óbito incompatível com ausência de morte.");
  if (!clinical && result.deathDate && result.accidentDate && result.deathDate < result.accidentDate) throw new SstValidationError("Óbito não pode anteceder o acidente.");
  if (!clinical && result.birthDate && result.accidentDate && result.birthDate > result.accidentDate) throw new SstValidationError("Nascimento posterior ao acidente.");
  if (!clinical && complete && result.issuedOn < result.accidentDate) throw new SstValidationError("Emissão não pode anteceder a ocorrência.");
  if (!clinical && complete && result.catType === "DEATH" && result.death !== "S") throw new SstValidationError("Comunicação de óbito exige confirmação de morte.");
  return result;
}
export const catLayoutInput = z.object({ catId: z.string().min(1), submissionKey: z.uuid(), expectedVersion: z.coerce.number().int().min(0), mode: z.enum(["DRAFT","COMPLETE"]), fields: z.unknown(), medicalEvidenceId: z.string().default(""), medicalFields: z.record(z.string(),z.string()).default({}), originalReceipt: z.string().trim().max(100).default("") });
