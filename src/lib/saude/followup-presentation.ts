import { z } from "zod";
const peekSchema = z.object({ patientId: z.string(), professionalId: z.string().nullable().optional(), snapshotAt: z.string().nullable().optional(), sourceUpdatedAt: z.string().nullable().optional(), patient: z.object({ name: z.string(), cns: z.string().nullable().optional() }).nullable().optional(), professional: z.object({ name: z.string() }).nullable().optional(), data: z.record(z.string(), z.unknown()).optional() });
export const followupStatusNames: Record<string, string> = { GERADA: "Remessa gerada", PROCESSADA: "Processamento concluído", PARCIAL: "Processamento com rejeições", REJEITADA: "Remessa rejeitada", VALIDADO: "Registro validado", JA_RECEBIDO: "Registro recebido anteriormente", REJEITADO: "Registro rejeitado", VERSAO_ANTERIOR: "Versão anterior à recebida" };

export function followupPresentation(originType: string, value: unknown) {
  const parsed = peekSchema.safeParse(value);
  if (!parsed.success) return { patientId: null, patientName: null, patientCns: null, professionalName: null, snapshotAt: null, sourceUpdatedAt: null, sourceHref: null, sourceLabel: "Origem", summary: "Dados da origem a completar" };
  const data = parsed.data.data || {}, clinicalRecordId = originType === "HEALTH_PREGNANCY" ? data.openedMedicalRecordId : originType === "CHRONIC_PATIENT" ? data.originMedicalRecordId : null;
  const sourceHref = typeof clinicalRecordId === "string" ? `/saude/atendimentos/${encodeURIComponent(clinicalRecordId)}/linhas-cuidado` : originType === "WAITLIST_ENTRY" ? "/saude/agenda/gestao" : `/saude/regulacao${parsed.data.patient?.name ? `?q=${encodeURIComponent(parsed.data.patient.name)}` : ""}`;
  const sourceLabel = typeof clinicalRecordId === "string" ? "Abrir atendimento de origem" : originType === "WAITLIST_ENTRY" ? "Abrir gestor da espera" : "Abrir gestor de regulação";
  const summary = typeof data.status === "string" ? data.status : Array.isArray(data.assessments) ? `${data.assessments.length} avaliação(ões) registrada(s) na origem` : "Acompanhamento de origem";
  return { patientId: parsed.data.patientId, patientName: parsed.data.patient?.name || null, patientCns: parsed.data.patient?.cns || null, professionalName: parsed.data.professional?.name || null, snapshotAt: parsed.data.snapshotAt || null, sourceUpdatedAt: parsed.data.sourceUpdatedAt || null, sourceHref, sourceLabel, summary };
}
export function followupCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "Não informado" : String(value);
  return `"${(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}
