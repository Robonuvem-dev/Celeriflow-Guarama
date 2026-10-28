import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { setupEmployees, setupUsers, setupUnits, setupAudits } from "../src/db/schema/finance-setup-tools";
import { openFinanceSetupConnection, readSetupActor, readSetupAudit, setupRequired } from "./lib/finance-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const employeeId = "aurora-accounting-responsible-admin";
const decision = "Vínculo de admin@email.com a servidor exemplificativo autorizado pelo responsável para execução das jornadas financeiras; sem CPF, matrícula legal, contrato de trabalho ou remuneração presumidos.";

export async function prepareAccountingActor(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${employeeId}, 0))::text`);
      const user = await readSetupActor(tx);
      if (!user.ativo || !user.firebaseUid || user.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Login autorizado não é administrador ativo/autenticável; vínculo preservado.");
      if (user.employeeId && user.employeeId !== employeeId) throw new Error("O login já possui outro servidor vinculado; nenhuma substituição automática.");
      const unit = setupRequired((await tx.select({ secretariatId: setupUnits.secretariatId }).from(setupUnits).where(eq(setupUnits.id, "p0-current-exe-ug-1")).limit(1))[0], "UG");
      const employee = (await tx.select().from(setupEmployees).where(eq(setupEmployees.id, employeeId)).limit(1))[0] ?? null;
      if (employee && (!employee.isActive || employee.secretariatId !== unit.secretariatId)) throw new Error("Servidor exemplificativo existente diverge do vínculo previsto.");
      const previous = await readSetupAudit(tx, "PREPARE_ACCOUNTING_ACTOR", user.id);
      if (previous && (!employee || user.employeeId !== employeeId)) throw new Error("Vínculo alterado após preparação; preserve e confira pela interface.");
      if (apply && !previous) {
        if (!employee) await tx.insert(setupEmployees).values({ id: employeeId, name: "Administrador Municipal — Responsável Financeiro", secretariatId: unit.secretariatId, isActive: true });
        await tx.update(setupUsers).set({ employeeId }).where(eq(setupUsers.id, user.id));
        await tx.insert(setupAudits).values({ action: "PREPARE_ACCOUNTING_ACTOR", entityType: "Usuario", entityId: user.id, authorUsuarioId: user.id, payload: { previousEmployeeId: user.employeeId, employeeId, decision, parameterOrigin: "OWNER_ESTIMATE", authenticationCredentialsChanged: false } });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", usuarioId: user.id, employeeId, replay: Boolean(previous), linked: apply || user.employeeId === employeeId, decision, authenticationCredentialsChanged: false };
    }, { timeoutMs: 60000 });
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await prepareAccountingActor(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação do autor contábil."); process.exitCode = 1; });
