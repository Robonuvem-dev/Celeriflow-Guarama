import { createHash } from "node:crypto";
import { and, asc, eq, getTableColumns } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { diagnosticEsusBatches, diagnosticEsusBatchItems } from "@/db/schema/health-diagnostics";
import { healthEsusForms } from "@/db/schema/health-territory";
import { requiredDiagnosticRecord } from "@/db/repositories/health-diagnostics/records";
import type { HealthDiagnosticsContext as AppContext } from "@/lib/contracts/health-diagnostics";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { validateEsusFields } from "./sisab-form-config";

export class SisabError extends Error {}

// Adaptador controlado SISAB/e-SUS: gera lote real a partir das fichas
// finalizadas, valida cada registro e devolve aceites/rejeições.
// Não inventa protocolo oficial do Ministério nem confirmação nacional:
// o retorno é o do validador local configurado, com histórico rastreável.
export async function createBatch(context: AppContext, competence: string, connection: DatabaseConnection = databaseConnection) {
  if (!/^\d{4}-\d{2}$/.test(competence)) throw new SisabError("Informe a competência no formato AAAA-MM.");
  return withDatabaseTransaction(connection, async tx => {
    const forms = await tx.select({ id: healthEsusForms.id, kind: healthEsusForms.kind, unitId: healthEsusForms.unitId, professionalId: healthEsusForms.professionalId, personId: healthEsusForms.personId, patientId: healthEsusForms.patientId, householdId: healthEsusForms.householdId, familyId: healthEsusForms.familyId, teamId: healthEsusForms.teamId }).from(healthEsusForms)
      .where(and(eq(healthEsusForms.period, competence), eq(healthEsusForms.status, "FINALIZADA"))).orderBy(asc(healthEsusForms.createdAt)).limit(2000).for("share");
    if (forms.length === 0) throw new SisabError("Não há fichas finalizadas para a competência.");
    for (const f of forms) {
      if (f.unitId) assertHealthUnitAccess(context.user, f.unitId);
    }
    const lines = forms.map(f => ["ESUS", competence.replace("-", ""), f.kind, f.unitId || "", f.professionalId || "", f.patientId || f.personId || f.familyId || f.householdId || "", f.id].join("|"));
    const content = [`#SISAB|COMPETENCIA:${competence}|FICHAS:${forms.length}|GERADO_EM:${new Date().toISOString()}`, ...lines].join("\n");
    const hash = createHash("sha256").update(content).digest("hex");
    const batch = requiredDiagnosticRecord((await tx.insert(diagnosticEsusBatches).values({ competence, fileContent: content, hash, total: forms.length, createdByUsuarioId: context.user.id }).returning({ id: diagnosticEsusBatches.id }))[0]);
    for (const f of forms) {
      await tx.insert(diagnosticEsusBatchItems).values({ batchId: batch.id, formId: f.id }).onConflictDoNothing({ target: [diagnosticEsusBatchItems.batchId, diagnosticEsusBatchItems.formId] });
    }
    return batch;
  });
}

function validateForm(form: { kind: string; unitId: string | null; professionalId: string | null; personId: string | null; patientId: string | null; householdId: string | null; familyId: string | null; teamId: string | null; payload: unknown }): string | null {
  if (!form.unitId) return "Unidade ausente.";
  if (!form.professionalId) return "Profissional ausente.";
  if (form.kind === "DOMICILIAR" && !form.householdId && !form.familyId) return "Ficha domiciliar sem domicílio/família.";
  if (form.kind === "ATIVIDADE_COLETIVA" && !form.teamId) return "Atividade coletiva sem equipe.";
  if (["INDIVIDUAL","VISITA","ATENDIMENTO_INDIVIDUAL","ODONTO","PROCEDIMENTOS","CONSUMO_ALIMENTAR","ATENDIMENTO_DOMICILIAR"].includes(form.kind) && !form.personId && !form.patientId) return "Ficha sem cidadão vinculado.";
  return validateEsusFields(form.kind, (form.payload || {}) as Record<string, unknown>);
}

export async function processBatch(context: AppContext, batchId: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    const [batch] = await tx.select({ id: diagnosticEsusBatches.id, competence: diagnosticEsusBatches.competence, status: diagnosticEsusBatches.status }).from(diagnosticEsusBatches).where(eq(diagnosticEsusBatches.id, batchId)).limit(1).for("update");
    if (!batch) throw new SisabError("Lote não encontrado.");
    const rows = await tx.select({ item: getTableColumns(diagnosticEsusBatchItems), form: getTableColumns(healthEsusForms) }).from(diagnosticEsusBatchItems).innerJoin(healthEsusForms, eq(healthEsusForms.id, diagnosticEsusBatchItems.formId))
      .where(eq(diagnosticEsusBatchItems.batchId, batchId)).orderBy(asc(diagnosticEsusBatchItems.createdAt), asc(diagnosticEsusBatchItems.id)).for("share", { of: healthEsusForms });
    const items = rows.map(({ item, form }) => ({ ...item, form }));
    for (const item of items) if (item.form.unitId) assertHealthUnitAccess(context.user, item.form.unitId);
    await tx.update(diagnosticEsusBatches).set({ status: "PROCESSANDO" }).where(eq(diagnosticEsusBatches.id, batchId));
    const errors: Array<{ formId: string; reason: string }> = [];
    let accepted = 0;
    for (const item of items) {
      const reason = validateForm(item.form);
      if (reason) {
        errors.push({ formId: item.formId, reason });
        await tx.update(diagnosticEsusBatchItems).set({ status: "REJEITADO", message: reason }).where(eq(diagnosticEsusBatchItems.id, item.id));
      } else {
        accepted += 1;
        await tx.update(diagnosticEsusBatchItems).set({ status: "ACEITO", message: null }).where(eq(diagnosticEsusBatchItems.id, item.id));
      }
    }
    const rejected = errors.length;
    const status = rejected === 0 ? "ACEITO" : accepted === 0 ? "REJEITADO" : "PARCIAL";
    return requiredDiagnosticRecord((await tx.update(diagnosticEsusBatches).set({ status, accepted, rejected, errors, processedAt: new Date() }).where(eq(diagnosticEsusBatches.id, batchId)).returning({ id: diagnosticEsusBatches.id, status: diagnosticEsusBatches.status, accepted: diagnosticEsusBatches.accepted, rejected: diagnosticEsusBatches.rejected }))[0]);
  });
}
