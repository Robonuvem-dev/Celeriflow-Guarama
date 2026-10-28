import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { activePortalEmployee, changePortalEvent, portalEvent, portalFirst } from "@/db/repositories/portal-servidor/records";
import { z } from "zod";
import { getPayrollStatement, renderPayrollStatementPdf } from "@/lib/rh/statement-service";
import { arePortalPayrollStatementsEnabled } from "@/lib/rh/payroll-configuration";
import { enqueueHrIntegration } from "@/lib/rh/workforce-service";
import { uploadGeneratedFinancialFile, getFile } from "@/lib/platform/blob";

const receiptSchema = z.object({ statementId: z.string(), employeeId: z.string(), code: z.uuid(), statementHash: z.string().length(64), fileHash: z.string().length(64), fileUrl: z.string(), issuedAt: z.iso.datetime() });
function hash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

export async function readOwnVerifiedReceipt(connection: DatabaseConnection, employeeId: string, statementId: string) {
  const db = connection.db;
  const artifact = await withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`PORTAL:RECIBO:${statementId}`}))`);
    if (!await arePortalPayrollStatementsEnabled(tx)) throw new Error("Demonstrativos não disponíveis pela política RH.");
    const statement = await getPayrollStatement(tx, statementId, employeeId);
    const sourceKey = `PORTAL:RECIBO:${statementId}`, previous = await portalEvent(tx, sql`"sourceKey"=${sourceKey}`);
    if (previous) {
      const stored = receiptSchema.parse(previous.payload);
      if (previous.status !== "PROCESSADO" || stored.employeeId !== employeeId || stored.statementHash !== hash(statement)) throw new Error("Documento indisponível ou alterado após emissão. O RH deve revogar a versão e publicar outra.");
      return stored;
    }
    const code = randomUUID(), bytes = await renderPayrollStatementPdf(statement, code);
    const blob = await uploadGeneratedFinancialFile(`recibo-${statement.id}.pdf`, bytes, "application/pdf");
    const payload = { statementId, employeeId, code, statementHash: hash(statement), fileHash: createHash("sha256").update(bytes).digest("hex"), fileUrl: blob.url, issuedAt: new Date().toISOString() };
    const event = await enqueueHrIntegration(tx, { sourceKey, domain: "PORTAL", environment: "INTERNO", eventType: "RECIBO_FUNCIONAL_EMITIDO", payload });
    await changePortalEvent(tx, event.id, { status: "PROCESSADO" });
    return payload;
  }, { timeoutMs: 60000 });
  const file = await getFile(artifact.fileUrl);
  if (!file?.stream) throw new Error("Arquivo do recibo indisponível.");
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== artifact.fileHash) throw new Error("Integridade do recibo inválida.");
  const current = await getPayrollStatement(db, statementId, employeeId);
  if (hash(current) !== artifact.statementHash || !await activePortalEmployee(db, employeeId)) throw new Error("Recibo indisponível após atualização da publicação ou do acesso funcional.");
  return { bytes, code: artifact.code };
}

export async function verifyPublicReceipt(db: DatabaseExecutor, code: string) {
  if (!z.uuid().safeParse(code).success || !await arePortalPayrollStatementsEnabled(db)) return { valid: false as const };
  const event = await portalEvent(db, sql`domain='PORTAL' AND "eventType"='RECIBO_FUNCIONAL_EMITIDO' AND status='PROCESSADO' AND payload->>'code'=${code}`);
  if (!event) return { valid: false as const };
  const artifact = receiptSchema.parse(event.payload);
  const available = await portalFirst<{ id: string }>(db, sql`SELECT s.id FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" JOIN "HrPayrollRun" r ON r.id=s."runId" WHERE s.id=${artifact.statementId} AND c."employeeId"=${artifact.employeeId} AND s."releaseAt"<=${new Date()} AND s."revokedAt" IS NULL AND r.mode='OFICIAL' AND r.status IN ('FECHADA','CALCULADA') LIMIT 1`);
  if (!available) return { valid: false as const };
  const current = await getPayrollStatement(db, available.id, artifact.employeeId).catch(() => null);
  if (!current) return { valid: false as const };
  if (hash(current) !== artifact.statementHash) return { valid: false as const };
  return { valid: true as const, type: "Recibo de pagamento", issuedAt: artifact.issuedAt, fileHash: artifact.fileHash };
}
