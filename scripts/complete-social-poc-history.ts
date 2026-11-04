import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import * as s from "../src/db/schema/social";
import * as w from "../src/db/schema/social-workflows";
import { users } from "../src/db/schema/identity";
import { people } from "../src/db/schema/people";
import { employees } from "../src/db/schema/administration";
config({ path: ".env.local", quiet: true });
async function main() {
  if (!process.argv.includes("--apply")) { console.log("Complemento idempotente: rendas/despesas, fatos sociais, cotas e ficha do profissional sintético. Use --apply."); return; }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL), id = "social-poc-2026-history-v1";
  try {
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${id},0))`);
      if ((await tx.select().from(w.socialPocDatasets).where(eq(w.socialPocDatasets.id, id))).length) return { replay: true };
      if (!(await tx.select().from(w.socialPocDatasets).where(eq(w.socialPocDatasets.id, "social-poc-2026-v1"))).length) throw new Error("Execute primeiro a carga principal.");
      const [actor] = await tx.select().from(users).where(and(eq(users.email, "admin@email.com"), eq(users.ativo, true)));
      if (!actor) throw new Error("Administrador não encontrado.");
      const families = await tx.select({ family: s.socialFamilies, unitId: w.socialFamilyRegistrations.unitId }).from(s.socialFamilies).innerJoin(w.socialFamilyRegistrations, eq(w.socialFamilyRegistrations.familyId, s.socialFamilies.id));
      const catalogs = await tx.select().from(s.socialCatalogEntries);
      const today = new Date().toISOString().slice(0, 10), competence = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      for (const { family, unitId } of families) {
        for (const kind of ["INCOME", "EXPENSE"] as const) {
          const catalog = catalogs.find(c => c.kind === kind); if (!catalog) throw new Error("Catálogo ausente.");
          await tx.insert(s.socialFinancialEntries).values({ personId: family.representativeId, unitId, catalogId: catalog.id, kind, competence, value: new Decimal(family.income || 0).mul(kind === "EXPENSE" ? "0.55" : "1").toDecimalPlaces(2), observations: "Lançamento sintético para demonstração da ficha socioeconômica.", createdBy: actor.id });
        }
        const catalog = catalogs.find(c => c.kind === "POTENTIALITY");
        if (catalog) await tx.insert(s.socialPersonFacts).values({ personId: family.representativeId, unitId, catalogId: catalog.id, kind: "POTENTIALITY", identifiedAt: competence, observations: "Rede de apoio comunitária — cenário sintético.", createdBy: actor.id });
      }
      const stocks = await tx.select().from(s.socialBenefitStocks);
      for (const stock of stocks) await tx.insert(s.socialBenefitQuotas).values({ benefitId: stock.benefitId, unitId: stock.unitId, startsAt: competence, endsAt: new Date(`${today.slice(0, 4)}-12-31T00:00:00Z`), total: 50 });
      const [employee] = await tx.select().from(employees).where(eq(employees.id, "aurora-system-v1:employee:003"));
      const [person] = employee?.personId ? await tx.select().from(people).where(eq(people.id, employee.personId)) : [];
      if (person) await tx.update(people).set({ birthPlace: "Aurora das Veredas/MG — fictícia", nationality: "Brasileira", raceColor: "Parda", maritalStatus: "Solteiro(a)", motherName: "Filiação materna de demonstração", fatherName: "Filiação paterna de demonstração", gender: person.gender || "Feminino", rg: "POC-PROF-001" }).where(eq(people.id, person.id));
      // Only annotate the explicitly synthetic cohort; keep the active operational records intact.
      await tx.insert(w.socialPocDatasets).values({ id, referenceDate: today });
      return { families: families.length, entries: families.length * 2, quotas: stocks.length };
    }, { timeoutMs: 120000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha no complemento Social."); process.exitCode = 1; });
