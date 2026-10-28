import { z } from "zod";
import { eq } from "drizzle-orm";
import type { HealthManagementContext as AppContext } from "@/lib/contracts/health-management-operations";
import type { DatabaseTransaction } from "@/db/transaction";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { managementVigilanceEstablishments as establishments, managementVigilanceComplaints as complaints, managementVigilanceInspections as inspections, managementVigilanceInspectionItems as inspectionItems, managementVigilanceLicenses as licenses } from "@/db/schema/health-management-operations";
import { runManagementTransaction } from "@/db/repositories/health-management-operations/transaction";
import { managementRequired } from "@/db/repositories/health-management-operations/common";

export class VigilanceError extends Error {}

const establishmentSchema = z.object({
  name: z.string().trim().min(2).max(200),
  document: z.string().trim().max(30).nullable().optional(),
  companyId: z.string().min(1).nullable().optional(),
  personId: z.string().min(1).nullable().optional(),
  cnae: z.string().trim().max(20).nullable().optional(),
  activity: z.string().trim().max(500).nullable().optional(),
  riskLevel: z.string().trim().max(60).nullable().optional(),
}).strict();

export async function saveEstablishment(context: AppContext, raw: unknown, transaction?: DatabaseTransaction) {
  const input = establishmentSchema.parse(raw);
  return runManagementTransaction(context, transaction, async tx => {
    if (input.companyId && !(await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, input.companyId)).limit(1))[0]) throw new VigilanceError("Empresa não encontrada.");
    if (input.personId && !(await tx.select({ id: people.id }).from(people).where(eq(people.id, input.personId)).limit(1))[0]) throw new VigilanceError("Pessoa não encontrada.");
    const [existing] = input.document ? await tx.select({ id: establishments.id }).from(establishments).where(eq(establishments.document, input.document)).limit(1) : [];
    const data = { name: input.name, companyId: input.companyId || null, personId: input.personId || null, cnae: input.cnae || null, activity: input.activity || null, riskLevel: input.riskLevel || null };
    if (existing) return managementRequired((await tx.update(establishments).set({ ...data, status: "Ativo" }).where(eq(establishments.id, existing.id)).returning({ id: establishments.id }))[0]);
    return managementRequired((await tx.insert(establishments).values({ ...data, document: input.document || null }).returning({ id: establishments.id }))[0]);
  });
}

const complaintSchema = z.object({
  establishmentId: z.string().min(1).nullable().optional(),
  place: z.string().trim().max(300).nullable().optional(),
  description: z.string().trim().min(10).max(4000),
  isAnonymous: z.boolean().default(true),
  reporterPersonId: z.string().min(1).nullable().optional(),
}).strict();

export async function saveComplaint(context: AppContext, raw: unknown, transaction?: DatabaseTransaction) {
  const input = complaintSchema.parse(raw);
  if (!input.establishmentId && !input.place?.trim()) throw new VigilanceError("Informe o estabelecimento ou o local da denúncia.");
  return runManagementTransaction(context, transaction, async tx => {
    if (input.establishmentId && !(await tx.select({ id: establishments.id }).from(establishments).where(eq(establishments.id, input.establishmentId)).limit(1))[0]) throw new VigilanceError("Estabelecimento não encontrado.");
    if (input.isAnonymous && input.reporterPersonId) throw new VigilanceError("Denúncia anônima não identifica o denunciante.");
    if (!input.isAnonymous && !input.reporterPersonId) throw new VigilanceError("Denúncia identificada exige o denunciante.");
    return managementRequired((await tx.insert(complaints).values({ establishmentId: input.establishmentId || null, place: input.place?.trim() || null, description: input.description, isAnonymous: input.isAnonymous, reporterPersonId: input.isAnonymous ? null : input.reporterPersonId }).returning({ id: complaints.id }))[0]);
  });
}

export async function transitionComplaint(context: AppContext, complaintId: string, status: string, transaction?: DatabaseTransaction) {
  const target = status.trim();
  if (!["Recebida", "Em apuração", "Encerrada"].includes(target)) throw new VigilanceError("Situação inválida.");
  return runManagementTransaction(context, transaction, async tx => {
    const [complaint] = await tx.update(complaints).set({ status: target }).where(eq(complaints.id, complaintId)).returning({ id: complaints.id });
    if (!complaint) throw new VigilanceError("Denúncia não encontrada.");
    return complaint;
  });
}

const inspectionSchema = z.object({
  establishmentId: z.string().min(1),
  complaintId: z.string().min(1).nullable().optional(),
  professionalId: z.string().min(1).nullable().optional(),
  inspectedAt: z.coerce.date(),
  reason: z.string().trim().max(2000).nullable().optional(),
  findings: z.string().trim().max(4000).nullable().optional(),
  items: z.array(z.object({ description: z.string().trim().min(2).max(500), result: z.enum(["Conforme", "Não conforme", "Não avaliado"]).default("Não avaliado"), notes: z.string().trim().max(1000).nullable().optional() })).max(100).default([]),
}).strict();

export async function saveInspection(context: AppContext, raw: unknown, transaction?: DatabaseTransaction) {
  const input = inspectionSchema.parse(raw);
  return runManagementTransaction(context, transaction, async tx => {
    if (!(await tx.select({ id: establishments.id }).from(establishments).where(eq(establishments.id, input.establishmentId)).limit(1))[0]) throw new VigilanceError("Estabelecimento não encontrado.");
    // Nova inspeção registra constatação própria; nunca herda conclusão anterior.
    const inspection = managementRequired((await tx.insert(inspections).values({
      establishmentId: input.establishmentId, complaintId: input.complaintId || null, professionalId: input.professionalId || null,
      inspectedAt: input.inspectedAt, reason: input.reason || null, findings: input.findings || null, status: "Realizada",
      createdByUsuarioId: context.user.id,
    }).returning({ id: inspections.id }))[0]);
    if (input.items.length) await tx.insert(inspectionItems).values(input.items.map(item => ({ inspectionId: inspection.id, description: item.description, result: item.result, notes: item.notes || null })));
    return inspection;
  });
}

export async function transitionInspection(context: AppContext, inspectionId: string, status: string, transaction?: DatabaseTransaction) {
  const target = status.trim();
  if (!["Agendada", "Realizada", "Com pendências", "Encerrada"].includes(target)) throw new VigilanceError("Situação inválida.");
  return runManagementTransaction(context, transaction, async tx => {
    const [inspection] = await tx.update(inspections).set({ status: target }).where(eq(inspections.id, inspectionId)).returning({ id: inspections.id });
    if (!inspection) throw new VigilanceError("Inspeção não encontrada.");
    return inspection;
  });
}

const licenseSchema = z.object({
  establishmentId: z.string().min(1),
  licenseNumber: z.string().trim().min(2).max(60),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

// Alvará é ato explícito de emissão. Atualizar o cadastro do
// estabelecimento nunca gera alvará automaticamente.
export async function issueLicense(context: AppContext, raw: unknown, transaction?: DatabaseTransaction) {
  const input = licenseSchema.parse(raw);
  if (input.validUntil < input.validFrom) throw new VigilanceError("Vigência final anterior à inicial.");
  return runManagementTransaction(context, transaction, async tx => {
    if (!(await tx.select({ id: establishments.id }).from(establishments).where(eq(establishments.id, input.establishmentId)).limit(1))[0]) throw new VigilanceError("Estabelecimento não encontrado.");
    const number = input.licenseNumber.trim().toUpperCase();
    const [existing] = await tx.select({ id: licenses.id }).from(licenses).where(eq(licenses.licenseNumber, number)).limit(1);
    if (existing) throw new VigilanceError("Número de alvará já utilizado.");
    return managementRequired((await tx.insert(licenses).values({ establishmentId: input.establishmentId, licenseNumber: number, validFrom: new Date(`${input.validFrom}T12:00:00Z`), validUntil: new Date(`${input.validUntil}T12:00:00Z`), status: "Válido", issuedByUsuarioId: context.user.id }).returning({ id: licenses.id }))[0]);
  });
}

export async function transitionLicense(context: AppContext, licenseId: string, status: string, transaction?: DatabaseTransaction) {
  const target = status.trim();
  if (!["Válido", "Vencido", "Suspenso", "Cancelado"].includes(target)) throw new VigilanceError("Situação inválida.");
  return runManagementTransaction(context, transaction, async tx => {
    const [license] = await tx.update(licenses).set({ status: target }).where(eq(licenses.id, licenseId)).returning({ id: licenses.id });
    if (!license) throw new VigilanceError("Alvará não encontrado.");
    return license;
  });
}
