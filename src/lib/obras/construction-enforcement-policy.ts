import type { ConstructionDepartmentFilter } from "@/lib/contracts/construction-scopes";
import { z } from "zod";
import type { ConstructionAccess } from "./construction-policy";

export const enforcementActLabels = { PRELIMINARY_NOTICE: "Notificação preliminar", FISCAL_NOTICE: "Notificação fiscal", INFRACTION: "Auto de infração", EMBARGO: "Embargo", LIFT_EMBARGO: "Levantamento de embargo" } as const;
export const enforcementServiceLabels = { PERSONAL: "Pessoal", POSTAL: "Postal", ELECTRONIC: "Eletrônica", PUBLICATION: "Publicação", REFUSAL: "Recusa certificada" } as const;
const id = z.string().trim().min(1);
const optionalId = z.string().trim().default("");
const reason = z.string().trim().min(10, "Descreva o motivo com pelo menos dez caracteres.").max(10000);
const instant = z.iso.datetime({ offset: true });
const evidence = z.array(z.object({ documentId: id, kind: z.enum(["PHOTO", "DOCUMENT", "SERVICE_PROOF"]) })).max(30).refine((items) => new Set(items.map((item) => item.documentId)).size === items.length, "Não repita documentos GED.");
const operation = z.object({ caseId: id, requestKey: z.uuid(), revision: z.number().int().nonnegative() });
export const enforcementOpeningSchema = z.object({ requestKey: z.uuid(), realEstateId: id, permitCaseId: optionalId, permitStatus: z.enum(["WITHOUT_PERMIT", "REPORTED_PERMIT", "UNKNOWN"]), locationType: z.enum(["URBAN", "RURAL"]), processTypeId: id, subjectId: id, personId: optionalId, companyId: optionalId, reason }).refine((data) => !(data.personId && data.companyId), "Selecione apenas um interessado.").refine((data) => data.permitStatus !== "WITHOUT_PERMIT" || !data.permitCaseId, "Uma obra sem alvará não deve indicar processo de alvará.");
export const enforcementAssignmentSchema = operation.extend({ employeeId: id, reason });
export const enforcementVisitSchema = operation.extend({ visitedAt: instant, findings: reason, evidence });
export const enforcementActSchema = operation.extend({ kind: z.enum(["PRELIMINARY_NOTICE", "FISCAL_NOTICE", "INFRACTION", "EMBARGO", "LIFT_EMBARGO"]), visitId: optionalId, relatedActId: optionalId, reason, legalBasis: reason, issuedAt: instant, deadlineAt: z.union([z.literal(""), instant]), evidence }).refine((data) => !data.deadlineAt || new Date(data.deadlineAt) >= new Date(data.issuedAt), "Prazo anterior à emissão.").refine((data) => !["PRELIMINARY_NOTICE", "FISCAL_NOTICE"].includes(data.kind) || Boolean(data.deadlineAt), "Notificações exigem prazo explícito.").refine((data) => data.kind !== "LIFT_EMBARGO" || Boolean(data.relatedActId), "Selecione o embargo a levantar.");
export const enforcementAcknowledgementSchema = operation.extend({ actId: id, acknowledgedAt: instant, method: z.enum(["PERSONAL", "POSTAL", "ELECTRONIC", "PUBLICATION", "REFUSAL"]), recipient: z.string().trim().min(3).max(300), notes: reason, evidence: evidence.refine((items) => items.length > 0 && items.every((item) => item.kind === "SERVICE_PROOF"), "Ciência exige comprovante GED.") });

export function enforcementCaseWhere(access: ConstructionAccess): ConstructionDepartmentFilter {
  if (access.administrator) return {};
  if (!access.departmentId || !access.roles.some((role) => ["INSPECTOR", "MANAGER"].includes(role))) return { id: { in: [] } };
  return { process: { currentDepartmentId: access.departmentId } };
}

export function enforcementNextStatus(status: string, kind: string): "OPEN" | "EMBARGOED" {
  if (kind === "EMBARGO" && status === "EMBARGOED") throw new Error("Já existe embargo vigente neste processo.");
  if (kind === "LIFT_EMBARGO" && status !== "EMBARGOED") throw new Error("Não existe embargo vigente para levantar.");
  return kind === "EMBARGO" ? "EMBARGOED" : kind === "LIFT_EMBARGO" ? "OPEN" : status === "EMBARGOED" ? "EMBARGOED" : "OPEN";
}
