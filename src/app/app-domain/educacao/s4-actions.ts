"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { educationApplicationPlans, educationFinancialAccounts, educationFinancialMovements, educationFoodMovements, educationLibraryCopies, educationLibraryLoans, educationLibraryTitles, educationSchoolMenus, educationTransportEvents, educationTransportJourneys, educationTransportRoutes, educationTransportStops, educationTransportStudents } from "@/db/schema/education-operations";
import { createEducationLibraryLoan, renewEducationLibraryLoan, reserveEducationLibraryTitle, returnEducationLibraryLoan } from "@/lib/educacao/library-service";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

export type S4ActionResult = { error: string | null; message?: string };
const value = (data: FormData, key: string) => String(data.get(key) || "").trim();
const date = (raw: string) => new Date(`${raw}T12:00:00.000Z`);
const error = (cause: unknown): S4ActionResult => ({ error: cause instanceof Error ? cause.message : "Não foi possível concluir a operação." });
const refresh = () => ["biblioteca", "merenda", "recursos-escolares", "transporte"].forEach(path => revalidatePath(`/educacao/${path}`));

export async function createLibraryTitleAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationLibraryTitles).values({ schoolId: value(data, "schoolId"), title: value(data, "title"), author: value(data, "author"), isbn: value(data, "isbn") || null, category: value(data, "category") });
    refresh(); return { error: null, message: "Título incluído no acervo." };
  } catch (cause) { return error(cause); }
}
export async function createLibraryCopyAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationLibraryCopies).values({ titleId: value(data, "titleId"), assetCode: value(data, "assetCode") });
    refresh(); return { error: null, message: "Exemplar registrado." };
  } catch (cause) { return error(cause); }
}
export async function createLoanAction(data: FormData): Promise<S4ActionResult> {
  try {
    await getTenantContextForModuleOperation("EDUCACAO", "create");
    await withDatabaseTransaction(databaseConnection, tx => createEducationLibraryLoan(tx, { copyId: value(data, "copyId"), studentId: value(data, "studentId"), dueAt: date(value(data, "dueAt")) }));
    refresh(); return { error: null, message: "Empréstimo registrado." };
  } catch (cause) { return error(cause); }
}
export async function updateLoanAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "update"), database = context.database ?? db;
    const [loan] = await database.select({ id: educationLibraryLoans.id, copyId: educationLibraryLoans.copyId }).from(educationLibraryLoans).where(eq(educationLibraryLoans.id, value(data, "loanId"))).limit(1);
    if (!loan) throw new Error("Empréstimo não encontrado.");
    const operation = value(data, "operation");
    if (operation === "Renovar") await renewEducationLibraryLoan(database, loan.id, date(value(data, "dueAt")));
    else await withDatabaseTransaction(databaseConnection, tx => returnEducationLibraryLoan(tx, { loanId: loan.id, copyId: loan.copyId }));
    refresh(); return { error: null, message: `Empréstimo ${operation.toLowerCase()}.` };
  } catch (cause) { return error(cause); }
}
export async function reserveTitleAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await reserveEducationLibraryTitle(context.database ?? db, value(data, "titleId"), value(data, "studentId"));
    refresh(); return { error: null, message: "Reserva registrada." };
  } catch (cause) { return error(cause); }
}
export async function createSchoolMenuAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationSchoolMenus).values({ schoolId: value(data, "schoolId"), name: value(data, "name"), weekStart: date(value(data, "weekStart")), shift: value(data, "shift"), servingsPlanned: Number(value(data, "servingsPlanned")), items: { description: value(data, "items") } });
    refresh(); return { error: null, message: "Cardápio planejado." };
  } catch (cause) { return error(cause); }
}
export async function createFoodMovementAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationFoodMovements).values({ schoolId: value(data, "schoolId"), materialId: value(data, "materialId"), warehouseId: value(data, "warehouseId") || null, type: value(data, "type"), quantity: Number(value(data, "quantity")), unitCost: value(data, "unitCost") || null, notes: value(data, "notes") || null });
    refresh(); return { error: null, message: "Movimentação de alimentação registrada." };
  } catch (cause) { return error(cause); }
}
export async function createEducationAccountAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationFinancialAccounts).values({ schoolId: value(data, "schoolId"), name: value(data, "name"), bankAccountId: value(data, "bankAccountId") || null });
    refresh(); return { error: null, message: "Conta escolar vinculada." };
  } catch (cause) { return error(cause); }
}
export async function createEducationMovementAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationFinancialMovements).values({ accountId: value(data, "accountId"), type: value(data, "type"), value: value(data, "amount"), description: value(data, "description") });
    refresh(); return { error: null, message: "Movimento financeiro registrado." };
  } catch (cause) { return error(cause); }
}
export async function createApplicationPlanAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationApplicationPlans).values({ schoolId: value(data, "schoolId"), accountId: value(data, "accountId") || null, title: value(data, "title"), total: value(data, "total"), items: { description: value(data, "items") }, status: value(data, "status") || "Rascunho", submittedAt: value(data, "status") === "Enviado" ? new Date() : null });
    refresh(); return { error: null, message: "Plano de aplicação registrado." };
  } catch (cause) { return error(cause); }
}
export async function createTransportRouteAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationTransportRoutes).values({ schoolId: value(data, "schoolId"), code: value(data, "code"), name: value(data, "name"), fleetRouteId: value(data, "fleetRouteId") || null, fleetUnitId: value(data, "fleetUnitId") || null });
    refresh(); return { error: null, message: "Rota escolar registrada." };
  } catch (cause) { return error(cause); }
}
export async function addTransportStopAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationTransportStops).values({ routeId: value(data, "routeId"), name: value(data, "name"), address: value(data, "address"), sequence: Number(value(data, "sequence")), latitude: value(data, "latitude") ? Number(value(data, "latitude")) : null, longitude: value(data, "longitude") ? Number(value(data, "longitude")) : null });
    refresh(); return { error: null, message: "Ponto incluído." };
  } catch (cause) { return error(cause); }
}
export async function addTransportStudentAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    const routeId = value(data, "routeId"), studentId = value(data, "studentId"), boardingStop = value(data, "boardingStop") || null;
    await (context.database ?? db).insert(educationTransportStudents).values({ routeId, studentId, boardingStop }).onConflictDoUpdate({ target: [educationTransportStudents.routeId, educationTransportStudents.studentId], set: { status: "Ativo", boardingStop } });
    refresh(); return { error: null, message: "Aluno vinculado à rota." };
  } catch (cause) { return error(cause); }
}
export async function createJourneyAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "create");
    await (context.database ?? db).insert(educationTransportJourneys).values({ routeId: value(data, "routeId"), fleetUnitId: value(data, "fleetUnitId") || null, notes: value(data, "notes") || null });
    refresh(); return { error: null, message: "Viagem iniciada." };
  } catch (cause) { return error(cause); }
}
export async function updateJourneyAction(data: FormData): Promise<S4ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("EDUCACAO", "update"), database = context.database ?? db;
    const journeyId = value(data, "journeyId"), operation = value(data, "operation");
    if (operation === "Finalizar") {
      const [journey] = await database.update(educationTransportJourneys).set({ status: "Concluída", endedAt: new Date() }).where(eq(educationTransportJourneys.id, journeyId)).returning({ id: educationTransportJourneys.id });
      if (!journey) throw new Error("Viagem não encontrada.");
    } else await database.insert(educationTransportEvents).values({ journeyId, type: value(data, "type"), latitude: value(data, "latitude") ? Number(value(data, "latitude")) : null, longitude: value(data, "longitude") ? Number(value(data, "longitude")) : null, notes: value(data, "notes") || null });
    refresh(); return { error: null, message: operation === "Finalizar" ? "Viagem finalizada." : "Evento registrado no histórico." };
  } catch (cause) { return error(cause); }
}
