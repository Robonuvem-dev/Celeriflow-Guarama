"use server";

import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxActionContext } from "@/db/repositories/tax-actions/context";
import { insertActionCertificate, revokeActionCertificate } from "@/db/repositories/tax-actions/records";
import { insertActionAudit } from "@/db/repositories/tax-actions/registry";
import { withDatabaseTransaction } from "@/db/transaction";
import { evaluateCertificateInTransaction } from "@/lib/tributacao/certificate-subjects";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

export async function createCertificate(data: {
  certificateType: string;
  taxpayerId: string;
  validUntil: string;
}) {
  try {
  const { connection, user } = await taxActionContext("create");
  const validUntil = new Date(`${data.validUntil}T23:59:59.999Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.validUntil) || !Number.isFinite(validUntil.valueOf()) || validUntil.toISOString().slice(0,10) !== data.validUntil || validUntil < new Date()) throw new Error("Informe uma validade futura válida.");
  const result = await withDatabaseTransaction(connection, async tx => {
    const evaluation = await evaluateCertificateInTransaction(tx, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, data.taxpayerId);
    if (data.certificateType === "Negativa" && evaluation.pendingCount > 0) throw new Error("Empresa ou sócios configurados possuem pendências que impedem a certidão negativa.");
    const certificate = await insertActionCertificate(tx, {
      certificateType: data.certificateType,
      taxpayerId: data.taxpayerId,
      validUntil,
      authCode: `INTERNO-${randomUUID()}`,
      status: "Rascunho Interno"
    });
    await insertActionAudit(tx, { action: "CREATE_CERTIFICATE_DRAFT", entityType: "TaxCertificate", entityId: certificate.id, authorUsuarioId: user.id, authorEmployeeId: user.employeeId, payload: { evaluationId: evaluation.id, subjects: evaluation.details } });
    return certificate;
  }, { isolationLevel: "serializable", timeoutMs: 5000 });

  revalidatePath("/tributacao/certidoes");
  return { data: result };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a certidão." }; }
}

export async function cancelCertificate(id: string) {
  const { database } = await taxActionContext("update");
  const result = await revokeActionCertificate(database, id);

  revalidatePath("/tributacao/certidoes");
  return result;
}
