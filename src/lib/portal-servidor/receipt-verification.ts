import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { getPayrollStatement, renderPayrollStatementPdf } from "@/lib/rh/statement-service";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { uploadGeneratedFinancialFile, getFile } from "@/lib/platform/blob";

const receiptSchema = z.object({ statementId: z.string(), employeeId: z.string(), code: z.uuid(), statementHash: z.string().length(64), fileHash: z.string().length(64), fileUrl: z.string(), issuedAt: z.iso.datetime() });
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function readOwnVerifiedReceipt(db: PrismaClient, employeeId: string, statementId: string) {
  const artifact = await db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:RECIBO:${statementId}`}))`;
    if (!await arePortalPayrollStatementsEnabled(tx)) throw new Error("Demonstrativos não disponíveis pela política RH.");
    const statement = await getPayrollStatement(tx, statementId, employeeId);
    const sourceKey = `PORTAL:RECIBO:${statementId}`, previous = await tx.hrIntegrationEvent.findUnique({ where: { sourceKey } });
    if (previous) {
      const stored = receiptSchema.parse(previous.payload);
      if (previous.status !== "PROCESSADO" || stored.employeeId !== employeeId || stored.statementHash !== hash(statement)) throw new Error("Documento indisponível ou alterado após emissão. O RH deve revogar a versão e publicar outra.");
      return stored;
    }
    const code = randomUUID(), bytes = await renderPayrollStatementPdf(statement, code);
    const blob = await uploadGeneratedFinancialFile(`recibo-${statement.id}.pdf`, bytes, "application/pdf");
    const payload = { statementId, employeeId, code, statementHash: hash(statement), fileHash: createHash("sha256").update(bytes).digest("hex"), fileUrl: blob.url, issuedAt: new Date().toISOString() };
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "PORTAL", environment: "INTERNO", eventType: "RECIBO_FUNCIONAL_EMITIDO", payload });
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return payload;
  }, { timeout: 60000 });
  const file = await getFile(artifact.fileUrl);
  if (!file?.stream) throw new Error("Arquivo do recibo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.fileHash) throw new Error("Integridade do recibo inválida.");
  const current = await getPayrollStatement(db, statementId, employeeId);
  if (hash(current) !== artifact.statementHash || !await db.employee.findFirst({ where: { id: employeeId, isActive: true }, select: { id: true } })) throw new Error("Recibo indisponível após atualização da publicação ou do acesso funcional.");
  return { bytes, code: artifact.code };
}

export async function verifyPublicReceipt(db: PrismaClient, code: string) {
  if (!z.uuid().safeParse(code).success || !await arePortalPayrollStatementsEnabled(db)) return { valid: false as const };
  const event = await db.hrIntegrationEvent.findFirst({ where: { domain: "PORTAL", eventType: "RECIBO_FUNCIONAL_EMITIDO", status: "PROCESSADO", payload: { path: ["code"], equals: code } } });
  if (!event) return { valid: false as const };
  const artifact = receiptSchema.parse(event.payload);
  const available = await db.hrPayrollStatement.findFirst({ where: { id: artifact.statementId, contract: { employeeId: artifact.employeeId }, releaseAt: { lte: new Date() }, revokedAt: null, run: { mode: "OFICIAL", status: { in: ["FECHADA", "CALCULADA"] } } }, select: { id: true } });
  if (!available) return { valid: false as const };
  const current = await getPayrollStatement(db, available.id, artifact.employeeId).catch(() => null);
  if (!current) return { valid: false as const };
  if (hash(current) !== artifact.statementHash) return { valid: false as const };
  return { valid: true as const, type: "Recibo de pagamento", issuedAt: artifact.issuedAt, fileHash: artifact.fileHash };
}
