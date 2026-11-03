import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import type { DatabaseExecutor } from "@/db/transaction";
import { withDatabaseTransaction } from "@/db/transaction";
import { hrTimeCertificates } from "@/db/schema/personnel-functional-management";
import { employees } from "@/db/schema/administration";
import { lockPersonnel, personnelJson, stablePersonnelJson } from "@/db/repositories/personnel/integration";
import type { AppContext } from "@/lib/platform/tenant-context";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import { buildRetirementAssessmentReport } from "./retirement-assessment";
import { PERSONNEL_ISSUER } from "./personnel-presentation";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { personnelScope } from "./personnel-scope";
import { reportCompleteHistoryPredicate, reportEmployeePredicate } from "./report-filters";

const certificateInput = z.object({ requestKey: z.string().min(1).max(160), employeeId: z.string().min(1), referenceDate: z.iso.date(), responsible: z.string().trim().min(3).max(300), purpose: z.string().trim().min(10).max(2000), legalReference: z.string().trim().min(3).max(2000) }).strict();
export async function issueTimeCertificate(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = certificateInput.parse(raw);
  if (new Date(`${input.referenceDate}T00:00:00Z`) > new Date()) throw new Error("A certidão deve retratar uma referência já alcançada.");
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, "functional-configuration");
    await lockPersonnel(tx, `employee:${input.employeeId}`);
    await lockPersonnel(tx, `CERTIDAO_TEMPO:${input.requestKey}`);
    await assertFunctionalHolderAccess(tx, context, input.employeeId);
    const [previous] = await tx.select().from(hrTimeCertificates).where(eq(hrTimeCertificates.requestKey, input.requestKey));
    if (previous) {
      if (previous.employeeId !== input.employeeId || previous.referenceDate.toISOString().slice(0, 10) !== input.referenceDate || previous.responsible !== input.responsible || previous.purpose !== input.purpose || previous.legalReference !== input.legalReference) throw new Error("Solicitação de certidão já utilizada com outros dados.");
      return { id: previous.id, number: previous.number };
    }
    const scope = personnelScope(context.user);
    const memory = await buildRetirementAssessmentReport(tx, { kind: "MEMORIA_TEMPO_PREVIDENCIARIO", q: "", employeeId: input.employeeId, referenceDate: input.referenceDate, authorizedDepartmentIds: scope.departments === "TODOS" ? undefined : scope.departments }, isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds);
    if (!memory.rows.length) throw new Error("Não há tempo contratual documentado na referência para emitir a certidão.");
    const [serial] = (await tx.execute<{ number: string }>(sql`SELECT nextval('"HrTimeCertificate_number_seq"')::text number`)).rows;
    const number = `${new Date().getUTCFullYear()}/${serial.number.padStart(6, "0")}`;
    const snapshot = personnelJson({ ...memory, issuer: PERSONNEL_ISSUER, number, responsible: input.responsible, purpose: input.purpose, legalReference: input.legalReference, referenceDate: input.referenceDate });
    const [certificate] = await tx.insert(hrTimeCertificates).values({ ...input, referenceDate: new Date(`${input.referenceDate}T00:00:00Z`), number, issuer: PERSONNEL_ISSUER, actorId: context.user.id, snapshot, snapshotHash: createHash("sha256").update(stablePersonnelJson(snapshot)).digest("hex") }).returning();
    return { id: certificate.id, number };
  }, { timeoutMs: 120000 });
}

export async function buildIssuedTimeCertificates(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const selected = await db.select({ certificate: hrTimeCertificates }).from(hrTimeCertificates).innerJoin(employees, eq(employees.id, hrTimeCertificates.employeeId)).where(and(
    input.employeeId ? eq(hrTimeCertificates.employeeId, input.employeeId) : undefined,
    input.from ? sql`${hrTimeCertificates.createdAt}::date>=${input.from}::date` : undefined,
    input.until ? sql`${hrTimeCertificates.createdAt}::date<=${input.until}::date` : undefined,
    personnelBudgetEmployeeWhere(employees.id, budgetUnitIds),
    reportEmployeePredicate(input, employees.id, hrTimeCertificates.referenceDate),
    reportCompleteHistoryPredicate(input, employees.id, hrTimeCertificates.referenceDate),
    input.q ? sql`strpos(lower(${employees.name}||' '||${hrTimeCertificates.number}),lower(${input.q}))>0` : undefined,
  )).orderBy(hrTimeCertificates.createdAt, hrTimeCertificates.number);
  return { title: "Certidões de tempo emitidas — reprodução da fotografia imutável", headers: ["Número", "Emitido em", "Emitente", "Responsável", "Finalidade", "Fundamento", "SHA-256", "Seção", "Campo", "Conteúdo"], rows: selected.flatMap(({ certificate }) => {
    if (createHash("sha256").update(stablePersonnelJson(certificate.snapshot)).digest("hex") !== certificate.snapshotHash) throw new Error("A certidão emitida não confere com seu resumo de integridade.");
    const stored = z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }).parse(certificate.snapshot);
    return stored.rows.flatMap((row, index) => stored.headers.map((header, column) => [certificate.number, certificate.createdAt.toISOString(), certificate.issuer, certificate.responsible, certificate.purpose, certificate.legalReference, certificate.snapshotHash, String(index + 1), header, row[column] ?? ""]));
  }) };
}
