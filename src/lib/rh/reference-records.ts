import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrReferenceRecords } from "@/db/schema/personnel-reference-records";
import { budgetAppropriations } from "@/db/schema/finance-budget";
import { employees } from "@/db/schema/administration";
import { Decimal } from "@/db/decimal";
import { supplementaryDefinitions, supplementaryKinds, parseSupplementaryDetails, type SupplementaryKind } from "./supplementary-records";
const text = z.string().trim().min(1).max(500);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const referenceKindSchema = z.enum(["FERIADO", "EQUIPE", "FAIXA", "ESCALA", "PLANO_SAUDE", "AMBIENTE_RISCO", "PROCESSO", "LICENCA_EDUCACAO", "PREVIDENCIA_OPTATIVA", "MODELO_DOCUMENTO", "LOTACAO_ORCAMENTARIA", ...supplementaryKinds]);
export type ReferenceKind = z.infer<typeof referenceKindSchema>;
export const referenceDefinitions: Record<ReferenceKind, { title: string; fields: { name: string; label: string; type?: "date" | "time" | "textarea"; options?: string[] }[] }> = {
  ...supplementaryDefinitions,
  LOTACAO_ORCAMENTARIA: { title: "Vínculos de servidores por dotação", fields: [{ name: "employeeId", label: "Funcionário" }, { name: "appropriationId", label: "Dotação orçamentária" }] },
  MODELO_DOCUMENTO: { title: "Modelos de contratos e decretos", fields: [{ name: "documentType", label: "Tipo", options: ["Contrato", "Decreto"] }, { name: "body", label: "Texto com palavras-chave {{nome}}, {{cpf}}, {{matricula}}, {{data}}", type: "textarea" }] },
  PREVIDENCIA_OPTATIVA: { title: "Previdência optativa individual", fields: [{ name: "employeeId", label: "Funcionário" }, { name: "rubricCode", label: "Código da verba optativa" }, { name: "rate", label: "Alíquota percentual" }, { name: "basis", label: "Base de incidência" }, { name: "choice", label: "Opção do servidor", options: ["Recolher", "Não recolher"] }, { name: "legalReference", label: "Lei própria / fundamento" }, { name: "effectiveFrom", label: "Vigência", type: "date" }] },
  LICENCA_EDUCACAO: { title: "Licenças e férias escolares", fields: [{ name: "maximumDays", label: "Limite de dias de afastamento" }, { name: "legalReference", label: "Fundamento / regulamento" }] },
  FERIADO: { title: "Feriados", fields: [{ name: "date", label: "Data", type: "date" }, { name: "scope", label: "Abrangência", options: ["Nacional", "Estadual", "Municipal"] }] },
  EQUIPE: { title: "Equipes de trabalho", fields: [{ name: "description", label: "Descrição / setor" }] },
  FAIXA: { title: "Faixas de horário por equipe", fields: [{ name: "teamId", label: "Equipe" }, { name: "start", label: "Entrada", type: "time" }, { name: "end", label: "Saída", type: "time" }, { name: "breakMinutes", label: "Intervalo não remunerado (minutos)" }] },
  ESCALA: { title: "Escalas por funcionário", fields: [{ name: "employeeId", label: "Funcionário" }, { name: "rangeId", label: "Faixa de horário" }, { name: "weekdays", label: "Dias da semana (1=segunda a 7=domingo; separados por vírgula)" }, { name: "from", label: "Início da vigência", type: "date" }, { name: "until", label: "Fim da vigência", type: "date" }] },
  PLANO_SAUDE: { title: "Administradoras de planos de saúde", fields: [{ name: "registration", label: "Registro ANS / identificação" }, { name: "contact", label: "Contato" }] },
  AMBIENTE_RISCO: { title: "Ambientes de trabalho e fatores de risco", fields: [{ name: "location", label: "Local de trabalho" }, { name: "riskFactor", label: "Fator de risco" }, { name: "protection", label: "Medidas de proteção" }] },
  PROCESSO: { title: "Processos administrativos e judiciais", fields: [{ name: "type", label: "Tipo", options: ["Administrativo", "Judicial"] }, { name: "employeeId", label: "Funcionário" }, { name: "court", label: "Órgão / juízo" }, { name: "subject", label: "Objeto" }] },
};
const detailSchemas = {
  LOTACAO_ORCAMENTARIA: z.object({ employeeId: text, appropriationId: text }).strict(),
  MODELO_DOCUMENTO: z.object({ documentType: z.enum(["Contrato", "Decreto"]), body: z.string().trim().min(1).max(20000) }).strict(),
  PREVIDENCIA_OPTATIVA: z.object({ employeeId: text, rubricCode: text, rate: z.string().regex(/^(?:100(?:\.0{1,4})?|[0-9]{1,2}(?:\.[0-9]{1,4})?)$/), basis: text, choice: z.enum(["Recolher", "Não recolher"]), legalReference: text, effectiveFrom: z.iso.date() }).strict(),
  LICENCA_EDUCACAO: z.object({ maximumDays: z.string().regex(/^[1-9]\d{0,3}$/, "Informe entre 1 e 9999 dias."), legalReference: text }).strict(),
  FERIADO: z.object({ date: z.iso.date(), scope: z.enum(["Nacional", "Estadual", "Municipal"]) }).strict(),
  EQUIPE: z.object({ description: text }).strict(),
  FAIXA: z.object({ teamId: text, start: time, end: time, breakMinutes: z.string().regex(/^\d{1,4}$/).optional() }).strict().superRefine((d, ctx) => {
    const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const elapsed = (minutes(d.end) - minutes(d.start) + 1440) % 1440;
    if (!elapsed || d.breakMinutes !== undefined && Number(d.breakMinutes) >= elapsed) ctx.addIssue({ code: "custom", message: "Entrada e saída devem ser distintas e o intervalo deve ser menor que o turno." });
  }),
  ESCALA: z.object({ employeeId: text, rangeId: text, weekdays: z.string().regex(/^[1-7](,[1-7])*$/).refine(v => new Set(v.split(",")).size === v.split(",").length, "Dias repetidos."), from: z.iso.date(), until: z.iso.date() }).strict().refine(d => d.from <= d.until, "Fim anterior ao início."),
  PLANO_SAUDE: z.object({ registration: text, contact: text }).strict(),
  AMBIENTE_RISCO: z.object({ location: text, riskFactor: text, protection: text }).strict(),
  PROCESSO: z.object({ type: z.enum(["Administrativo", "Judicial"]), employeeId: text, court: text, subject: text }).strict(),
};
export function parseReferenceRecord(raw: { kind: unknown; code: unknown; name: unknown; details: unknown }) {
  const kind = referenceKindSchema.parse(raw.kind);
  const details = (supplementaryKinds as readonly string[]).includes(kind) ? parseSupplementaryDetails(kind as SupplementaryKind, raw.details) : detailSchemas[kind as keyof typeof detailSchemas].parse(raw.details) as Record<string, string>;
  return { kind, code: text.parse(raw.code), name: text.parse(raw.name), details };
}
export async function listReferenceRecords(db: DatabaseExecutor, kind: ReferenceKind) {
  return db.select().from(hrReferenceRecords).where(eq(hrReferenceRecords.kind, kind)).orderBy(asc(hrReferenceRecords.name));
}
export async function saveReferenceRecord(db: DatabaseExecutor, id: string | undefined, raw: Parameters<typeof parseReferenceRecord>[0]) {
  const data = parseReferenceRecord(raw);
  const { kind } = data;
  if (data.details.appropriationId) {
    const [appropriation] = await db.select({id:budgetAppropriations.id}).from(budgetAppropriations).where(eq(budgetAppropriations.id,data.details.appropriationId)).limit(1);
    if (!appropriation) throw new Error("Dotação orçamentária não encontrada.");
  }
  if (data.details.employeeId) {
    const [employee] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, data.details.employeeId)).limit(1);
    if (!employee) throw new Error("Funcionário não encontrado.");
  }
  for (const [key, kind] of [["teamId", "EQUIPE"], ["rangeId", "FAIXA"]] as const) if (data.details[key]) {
    const [record] = await db.select({ id: hrReferenceRecords.id }).from(hrReferenceRecords).where(and(eq(hrReferenceRecords.id, data.details[key]), eq(hrReferenceRecords.kind, kind))).limit(1);
    if (!record) throw new Error("Equipe ou faixa de horário não encontrada.");
  }
  for (const [key, kind] of [["courseId", "GRADUACAO_CURSO"], ["conventionId", "CONVENIO_BANCARIO"]] as const) if (data.details[key]) {
    const [record] = await db.select().from(hrReferenceRecords).where(and(eq(hrReferenceRecords.id, data.details[key]), eq(hrReferenceRecords.kind, kind))).limit(1);
    if (!record) throw new Error("Curso ou convênio não encontrado.");
    if (kind === "CONVENIO_BANCARIO" && (data.details.from < record.details.from || data.details.until > record.details.until)) throw new Error("Conta deve estar dentro da vigência do convênio.");
  }
  const sources: Array<[string, string]> = [["contractId", "HrEmploymentContract"], ["bankId", "Bank"], ["currencyId", "Currency"], ["beneficiaryPersonId", "Person"], ["roleId", "Role"], ["departmentId", "Department"]];
  for (const [key, table] of sources) if (data.details[key]) {
    const result = await db.execute(sql`SELECT id FROM ${sql.identifier(table)} WHERE id=${data.details[key]}`);
    if (!result.rows.length) throw new Error(`Referência não encontrada: ${key}.`);
  }
  if (["RATEIO_FOLHA", "TEMPO_CONTRIBUICAO", "VT_ITINERARIO", "DEMANDA_PESSOAL"].includes(kind)) {
    const siblings = await db.select().from(hrReferenceRecords).where(eq(hrReferenceRecords.kind, kind));
    const overlap = siblings.filter(row => row.id !== id && row.details.from <= data.details.until && row.details.until >= data.details.from);
    if (kind === "RATEIO_FOLHA") {
      const same = overlap.filter(row => row.details.contractId === data.details.contractId && row.details.component === data.details.component);
      // A rateio group has a single validity window; this avoids unvalidated partial overlaps.
      if (same.some(row => row.details.from !== data.details.from || row.details.until !== data.details.until || row.details.appropriationId === data.details.appropriationId)) throw new Error("Rateio sobreposto ou dotação repetida; use a mesma janela de vigência com dotações distintas.");
      if (same.reduce((sum, row) => sum.plus(row.details.percentage), new Decimal(data.details.percentage)).gt(100)) throw new Error("Rateios excedem 100% no componente.");
    } else {
      const keys = kind === "DEMANDA_PESSOAL" ? ["departmentId", "roleId"] : ["employeeId"];
      if (overlap.some(row => keys.every(key => row.details[key] === data.details[key]) && row.details.status !== "Revogado" && data.details.status !== "Revogado")) throw new Error("Há período sobreposto para este servidor ou demanda.");
    }
  }
  if (id) {
    const [saved] = await db.update(hrReferenceRecords).set({ ...data, updatedAt: new Date() }).where(and(eq(hrReferenceRecords.id, id), eq(hrReferenceRecords.kind, data.kind))).returning();
    if (!saved) throw new Error("Cadastro não encontrado.");
    return saved;
  }
  const [saved] = await db.insert(hrReferenceRecords).values(data).returning();
  return saved;
}
export async function deleteReferenceRecord(db: DatabaseExecutor, id: string, kind: ReferenceKind) {
  const [used] = await db.select({ id: hrReferenceRecords.id }).from(hrReferenceRecords).where(sql`${hrReferenceRecords.details}->>'teamId' = ${id} OR ${hrReferenceRecords.details}->>'rangeId' = ${id} OR ${hrReferenceRecords.details}->>'courseId' = ${id} OR ${hrReferenceRecords.details}->>'conventionId' = ${id}`).limit(1);
  if (used) throw new Error("Cadastro utilizado por outra referência; remova os vínculos antes de excluir.");
  const [deleted] = await db.delete(hrReferenceRecords).where(and(eq(hrReferenceRecords.id, id), eq(hrReferenceRecords.kind, kind))).returning();
  if (!deleted) throw new Error("Cadastro não encontrado.");
}
