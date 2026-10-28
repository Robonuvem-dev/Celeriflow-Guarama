import { config } from "dotenv";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { healthUnits, healthProfessionals } from "../src/db/schema/health-workforce";
import { healthProductionFacts, healthProductionCompetences, healthProductionCriticisms, healthSusFiles } from "../src/db/schema/health-production";
import { healthRegulationRequests } from "../src/db/schema/health-regulation";
import type { AppContext } from "../src/lib/platform/tenant-context";
config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function main() {
  const { db, databaseConnection } = await import("../src/db/client");
  const { processCompetence, processSusFile } = await import("../src/lib/saude/production-service");
  try {
    const [usuario] = await db.select().from(users).where(isNotNull(users.employeeId)).limit(1);
    const ctx: AppContext = { database: db, user: { id: usuario!.id, firebaseUid: usuario!.firebaseUid || "", email: usuario!.email, name: usuario!.nome, role: "admin", profileCode: "ADMIN", modulePermissions: [], allowedBudgetUnitIds: [], allowedHealthUnitIds: [], hasHealthAccessScope: false, employeeId: usuario!.employeeId, departmentId: null, secretariatId: null } };
    const period = "2026-09";
    // 1) Corrige o profissional na origem e espelha no fato; procedimento segue pendente (sem SIGTAP oficial - H-Q03)
    const [fact] = await db.select({originType:healthProductionFacts.originType,originId:healthProductionFacts.originId}).from(healthProductionFacts).where(and(eq(healthProductionFacts.period,period),eq(healthProductionFacts.status,"CRITICADO"))).limit(1);
    console.log("fato criticado:", fact);
    if (fact?.originType === "REGULATION") {
      const [professional] = await db.select({id:healthProfessionals.id}).from(healthProfessionals).where(eq(healthProfessionals.isActive,true)).limit(1);
      await db.update(healthRegulationRequests).set({professionalId:professional!.id}).where(eq(healthRegulationRequests.id,fact.originId));
      await db.update(healthProductionFacts).set({professionalId:professional!.id}).where(and(eq(healthProductionFacts.originType,"REGULATION"),eq(healthProductionFacts.originId,fact.originId)));
      console.log("profissional corrigido na origem");
    }
    const [comp] = await db.select({id:healthProductionCompetences.id}).from(healthProductionCompetences).where(eq(healthProductionCompetences.period,period)).limit(1);
    await processCompetence(ctx, comp!.id);
    const remaining = await db.select({code:healthProductionCriticisms.code}).from(healthProductionCriticisms).innerJoin(healthProductionFacts,eq(healthProductionFacts.id,healthProductionCriticisms.factId)).where(and(eq(healthProductionCriticisms.status,"ABERTA"),eq(healthProductionFacts.competenceId,comp!.id)));
    console.log("criticas restantes:", remaining.map(c => c.code));
    if (remaining.length !== 1 || remaining[0].code !== "SEM_PROCEDIMENTO") throw new Error("Estado de críticas inesperado");

    // 2) Adaptador: arquivo transitório válido -> PROCESSADO; reprocesso idempotente; arquivo inválido -> REJEITADO. Remove após.
    const [unit] = await db.select({id:healthUnits.id,name:healthUnits.name}).from(healthUnits).where(eq(healthUnits.isActive,true)).limit(1);
    const [good] = await db.insert(healthSusFiles).values({fileType:"BPA",competenceId:comp!.id,unitId:unit!.id,content:`#BPA|COMPETENCIA:${period}|QTDE:1|GERADO_EM:${new Date().toISOString()}\nBPA|${period.replace("-", "")}|${unit!.name}|TESTE-PIPELINE|123456789012345|2026-09-10|1||REGULATION:teste`,hash:"teste",quantity:1,createdByUsuarioId:usuario!.id}).returning({id:healthSusFiles.id});
    const r1 = await processSusFile(ctx, good.id);
    console.log("adaptador válido:", r1);
    if (r1.status !== "PROCESSADO") throw new Error("Adaptador deveria aceitar");
    const r2 = await processSusFile(ctx, good.id);
    if (r2.status !== "PROCESSADO") throw new Error("Reprocesso divergiu");
    console.log("reprocesso idempotente ok");
    const [bad] = await db.insert(healthSusFiles).values({fileType:"BPA",competenceId:comp!.id,content:`#BPA|COMPETENCIA:${period}|QTDE:1|GERADO_EM:${new Date().toISOString()}\nBPA|${period.replace("-", "")}|||2026-09-10|0||REGULATION:teste`,hash:"teste",quantity:1,createdByUsuarioId:usuario!.id}).returning({id:healthSusFiles.id});
    const r3 = await processSusFile(ctx, bad.id);
    console.log("adaptador inválido:", r3);
    if (r3.status !== "REJEITADO") throw new Error("Adaptador deveria rejeitar");
    await db.delete(healthSusFiles).where(inArray(healthSusFiles.id,[good.id,bad.id]));
    console.log("arquivos transitórios removidos");
    console.log(JSON.stringify({ status: "S4-CLOSE READY", pendencia: "Fechamento da competência e BPA real aguardam catálogo SIGTAP oficial (H-Q03)" }));
  } finally {
    await databaseConnection.pool.end();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
