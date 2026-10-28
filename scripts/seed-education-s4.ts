import "dotenv/config";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { materials, warehouses } from "../src/db/schema/assets-stock";
import { schools, students } from "../src/db/schema/education-core";
import { educationApplicationPlans, educationFinancialAccounts, educationFinancialMovements, educationFoodMovements, educationLibraryCopies, educationLibraryLoans, educationLibraryTitles, educationSchoolMenus, educationTransportEvents, educationTransportJourneys, educationTransportRoutes, educationTransportStops, educationTransportStudents } from "../src/db/schema/education-operations";

async function main() {
  const [school] = await db.select({ id: schools.id, name: schools.name }).from(schools).where(eq(schools.isActive, true)).orderBy(asc(schools.name)).limit(1);
  if (!school) throw new Error("Cadastre uma escola antes do seed EDU-S4.");
  const studentRows = await db.select({ id: students.id }).from(students).where(eq(students.status, "Ativo")).orderBy(asc(students.studentCode)).limit(2);
  let [title] = await db.select({ id: educationLibraryTitles.id }).from(educationLibraryTitles).where(and(eq(educationLibraryTitles.schoolId, school.id), eq(educationLibraryTitles.title, "Histórias do Município"))).limit(1);
  if (!title) [title] = await db.insert(educationLibraryTitles).values({ schoolId: school.id, title: "Histórias do Município", author: "Acervo Municipal", category: "Literatura local" }).returning({ id: educationLibraryTitles.id });
  const [copy] = await db.insert(educationLibraryCopies).values({ titleId: title.id, assetCode: "BIB-EDU-0001" }).onConflictDoUpdate({ target: educationLibraryCopies.assetCode, set: { titleId: title.id, updatedAt: new Date() } }).returning({ id: educationLibraryCopies.id });
  if (studentRows[0]) {
    const [loan] = await db.select({ id: educationLibraryLoans.id }).from(educationLibraryLoans).where(and(eq(educationLibraryLoans.copyId, copy.id), eq(educationLibraryLoans.studentId, studentRows[0].id), eq(educationLibraryLoans.status, "Emprestado"))).limit(1);
    if (!loan) await db.insert(educationLibraryLoans).values({ copyId: copy.id, studentId: studentRows[0].id, dueAt: new Date("2026-10-05T12:00:00Z") });
  }
  const [menu] = await db.select({ id: educationSchoolMenus.id }).from(educationSchoolMenus).where(and(eq(educationSchoolMenus.schoolId, school.id), eq(educationSchoolMenus.name, "Cardápio semanal 01"))).limit(1);
  if (!menu) await db.insert(educationSchoolMenus).values({ schoolId: school.id, name: "Cardápio semanal 01", weekStart: new Date("2026-09-21T12:00:00Z"), shift: "Integral", servingsPlanned: 250, items: { description: "Arroz, feijão, frango, legumes e fruta" }, status: "Publicado" });
  const [material] = await db.select({ id: materials.id }).from(materials).where(eq(materials.isActive, true)).orderBy(asc(materials.name)).limit(1);
  const [warehouse] = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.isActive, true)).orderBy(asc(warehouses.name)).limit(1);
  if (material) {
    const [movement] = await db.select({ id: educationFoodMovements.id }).from(educationFoodMovements).where(and(eq(educationFoodMovements.schoolId, school.id), eq(educationFoodMovements.materialId, material.id), eq(educationFoodMovements.notes, "Carga inicial EDU-S4"))).limit(1);
    if (!movement) await db.insert(educationFoodMovements).values({ schoolId: school.id, materialId: material.id, warehouseId: warehouse?.id, type: "Entrada", quantity: 100, notes: "Carga inicial EDU-S4" });
  }
  let [account] = await db.select({ id: educationFinancialAccounts.id }).from(educationFinancialAccounts).where(and(eq(educationFinancialAccounts.schoolId, school.id), eq(educationFinancialAccounts.name, "Programa escolar"))).limit(1);
  if (!account) {
    const bank = await db.execute<{ id: string }>(sql`SELECT id FROM "BankAccount" WHERE "isActive" = true LIMIT 1`);
    [account] = await db.insert(educationFinancialAccounts).values({ schoolId: school.id, name: "Programa escolar", bankAccountId: bank.rows[0]?.id }).returning({ id: educationFinancialAccounts.id });
  }
  const [financialMovement] = await db.select({ id: educationFinancialMovements.id }).from(educationFinancialMovements).where(and(eq(educationFinancialMovements.accountId, account.id), eq(educationFinancialMovements.description, "Repasse anual"))).limit(1);
  if (!financialMovement) await db.insert(educationFinancialMovements).values({ accountId: account.id, type: "Repasse", value: "25000", description: "Repasse anual" });
  const [plan] = await db.select({ id: educationApplicationPlans.id }).from(educationApplicationPlans).where(and(eq(educationApplicationPlans.schoolId, school.id), eq(educationApplicationPlans.title, "Plano anual de materiais"))).limit(1);
  if (!plan) await db.insert(educationApplicationPlans).values({ schoolId: school.id, accountId: account.id, title: "Plano anual de materiais", total: "18000", items: { description: "Materiais pedagógicos e manutenção" }, status: "Enviado", submittedAt: new Date() });
  const fleetRoute = await db.execute<{ id: string }>(sql`SELECT id FROM "FleetRoute" WHERE active = true LIMIT 1`);
  const unit = await db.execute<{ id: string }>(sql`SELECT id FROM "FleetUnit" WHERE status = 'ATIVO' LIMIT 1`);
  const [route] = await db.insert(educationTransportRoutes).values({ schoolId: school.id, code: "EDU-ROTA-01", name: "Rota escolar Norte", fleetRouteId: fleetRoute.rows[0]?.id, fleetUnitId: unit.rows[0]?.id }).onConflictDoUpdate({ target: educationTransportRoutes.code, set: { schoolId: school.id, fleetRouteId: fleetRoute.rows[0]?.id, fleetUnitId: unit.rows[0]?.id, updatedAt: new Date() } }).returning({ id: educationTransportRoutes.id });
  await db.insert(educationTransportStops).values({ routeId: route.id, name: "Praça Central", address: "Praça Central", sequence: 1 }).onConflictDoUpdate({ target: [educationTransportStops.routeId, educationTransportStops.sequence], set: { name: "Praça Central" } });
  if (studentRows[0]) await db.insert(educationTransportStudents).values({ routeId: route.id, studentId: studentRows[0].id, boardingStop: "Praça Central" }).onConflictDoUpdate({ target: [educationTransportStudents.routeId, educationTransportStudents.studentId], set: { status: "Ativo" } });
  const [journey] = await db.select({ id: educationTransportJourneys.id }).from(educationTransportJourneys).where(and(eq(educationTransportJourneys.routeId, route.id), eq(educationTransportJourneys.notes, "Percurso matutino"))).limit(1);
  if (!journey) await withDatabaseTransaction(databaseConnection, async tx => {
    const [created] = await tx.insert(educationTransportJourneys).values({ routeId: route.id, fleetUnitId: unit.rows[0]?.id, status: "Concluída", startedAt: new Date("2026-09-18T10:00:00Z"), endedAt: new Date("2026-09-18T11:10:00Z"), notes: "Percurso matutino" }).returning({ id: educationTransportJourneys.id });
    await tx.insert(educationTransportEvents).values([{ journeyId: created.id, type: "Embarque", latitude: -19.92, longitude: -43.94, notes: "Praça Central" }, { journeyId: created.id, type: "Chegada", latitude: -19.93, longitude: -43.95, notes: school.name }]);
  });
  console.log("EDU-S4 preparado.");
}
main().finally(() => databaseConnection.pool.end());
