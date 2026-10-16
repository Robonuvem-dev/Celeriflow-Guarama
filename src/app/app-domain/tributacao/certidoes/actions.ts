"use server";

import { getTenantContextForModuleOperation, isSystemAdministrator, type ModuleOperation } from "@/lib/platform/tenant-context";
import { Prisma } from "@prisma/client";
import { evaluateCertificateInTransaction } from "@/lib/tributacao/certificate-subjects";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

async function getTenantPrisma(operation: ModuleOperation) {
  return (await getTenantContextForModuleOperation("TRIBUTACAO", operation)).prisma;
}

export async function createCertificate(data: {
  certificateType: string;
  taxpayerId: string;
  validUntil: string;
}) {
  try {
  const { prisma, user } = await getTenantContextForModuleOperation("TRIBUTACAO", "create");
  const validUntil = new Date(`${data.validUntil}T23:59:59.999Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.validUntil) || !Number.isFinite(validUntil.valueOf()) || validUntil.toISOString().slice(0,10) !== data.validUntil || validUntil < new Date()) throw new Error("Informe uma validade futura válida.");
  const result = await prisma.$transaction(async tx => {
    const evaluation = await evaluateCertificateInTransaction(tx, { usuarioId: user.id, employeeId: user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(user) ? undefined : user.allowedBudgetUnitIds }, data.taxpayerId);
    if (data.certificateType === "Negativa" && evaluation.pendingCount > 0) throw new Error("Empresa ou sócios configurados possuem pendências que impedem a certidão negativa.");
    const certificate = await tx.taxCertificate.create({
    data: {
      certificateType: data.certificateType,
      taxpayerId: data.taxpayerId,
      validUntil,
      authCode: `INTERNO-${randomUUID()}`,
      status: "Rascunho Interno"
    }
    });
    await tx.taxAuditLog.create({ data: { action: "CREATE_CERTIFICATE_DRAFT", entityType: "TaxCertificate", entityId: certificate.id, authorUsuarioId: user.id, authorEmployeeId: user.employeeId, payload: { evaluationId: evaluation.id, subjects: evaluation.details } } });
    return certificate;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  revalidatePath("/tributacao/certidoes");
  return { data: result };
  } catch (error) { return { error: error instanceof Error ? error.message : "Não foi possível registrar a certidão." }; }
}

export async function cancelCertificate(id: string) {
  const prisma = await getTenantPrisma("update");
  const result = await prisma.taxCertificate.update({
    where: { id },
    data: { status: "Revogada" }
  });

  revalidatePath("/tributacao/certidoes");
  return result;
}
