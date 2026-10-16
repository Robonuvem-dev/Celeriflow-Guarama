import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { prepareDocumentaryPocDataset } from "../src/lib/rh/poc-bootstrap";
import { calculatePayrollRun, closePayrollRun, publishPayrollStatements, saveEmploymentContract } from "../src/lib/rh/workforce-service";
import { configurePayrollPensions } from "../src/lib/rh/pension-configuration";
import { acquireVacationRights, reserveVacationRight } from "../src/lib/rh/vacation-rights";

config({ path: ".env.local", quiet: true }); config({ quiet: true }); neonConfig.webSocketConstructor = ws;
let db: PrismaClient | undefined;
const actorId = "SYSTEM:RH_POC_LINKED_V2";
async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", scope: "DEMONSTRACAO", scenarios: ["salário/jornada/lotação a partir de 16/11/2026", "pensão percentual 20%", "mensal novembro rateada", "13º dezembro vinculado à primeira parcela outubro", "diferença 13º vinculada", "férias dezembro vinculadas aos aquisitivos"], createsUsers: false, realPayments: false }, null, 2)); return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  const november = await prepareDocumentaryPocDataset(db, actorId, "11/2026");
  const december = await prepareDocumentaryPocDataset(db, actorId, "12/2026");
  const ids = november.contractIds;
  const original = await db.hrEmploymentContract.findUniqueOrThrow({ where: { id: ids[0] }, include: { revisions: true } });
  const reason = "POC_DOCUMENTAL:INTRAMES_V2";
  if (!original.revisions.some(revision => revision.reason === reason)) {
    if (original.version !== 1 || !original.salary.eq(4400) || original.status !== "ATIVO") throw new Error("Contrato fictício já alterado por outro fluxo; preserve os ajustes e prepare o cenário manualmente.");
    const civil = (date: Date | null) => date?.toISOString().slice(0, 10) || "";
    await saveEmploymentContract(db, actorId, { id: original.id, version: original.version, employeeId: original.employeeId, registration: original.registration, regimeId: original.regimeId, roleId: original.roleId, departmentId: original.departmentId || undefined, costCenterId: original.costCenterId || undefined, workLocation: "Administração — POC segunda vigência", salaryLevel: original.salaryLevel || undefined, admittedAt: civil(original.admittedAt), appointedAt: civil(original.appointedAt), swornAt: civil(original.swornAt), endsAt: civil(original.endsAt), monthlyHours: 100, salary: "6400.00", details: original.details, effectiveFrom: "2026-11-16", reason });
  }
  const existing = await db.hrPayrollRule.findUnique({ where: { ruleSetId_code: { ruleSetId: november.ruleSetId, code: "PENSOES_FOLHA" } } });
  if (existing && !(existing.value as { legalReference?: string }).legalReference?.includes("POC_LINKED_V2")) throw new Error("Pensões do conjunto já foram configuradas por outro fluxo; não foram substituídas.");
  await configurePayrollPensions(db, actorId, { ruleSetId: november.ruleSetId, requestKey: "POC_LINKED_V2:PENSOES", policy: { origin: "PENSOES_FOLHA", legalReference: "POC_LINKED_V2: decisão fictícia estimada; substituir pelos termos municipais/judiciais reais", entries: [{ id: "POC_LINKED_V2", contractId: ids[0], beneficiaryPersonId: "rh-poc-person-v1-2", courtReference: "PROCESSO FICTÍCIO POC-002/2026", startsAt: "2026-01-01", endsAt: null, payrollTypes: ["Mensal"], method: "PERCENTUAL", value: "20.00", basis: "APOS_PREVIDENCIA", deductFromIncomeTax: true }] } });
  const runs: { type: string; id: string; gross: string; net: string }[] = [];
  const calculate = async (payrollId: string, parameters?: unknown) => {
    const run = await calculatePayrollRun(db!, actorId, { payrollId, requestKey: `POC_LINKED_V2:${payrollId}`, contractIds: ids, mode: "OFICIAL", scope: "DEMONSTRACAO", ...(parameters ? { specialParameters: parameters } : { monthlyProration: true }) });
    await closePayrollRun(db!, actorId, run.id);
    if (process.argv.includes("--publish")) await publishPayrollStatements(db!, actorId, run.id, new Date());
    const payroll = await db!.payroll.findUniqueOrThrow({ where: { id: payrollId } });
    runs.push({ type: payroll.type, id: run.id, gross: run.gross.toFixed(2), net: run.net.toFixed(2) }); return run;
  };
  await calculate(november.payrollIds[0]);
  const first = await db.hrPayrollRun.findFirst({ where: { payrollId: "rh-poc-payroll-v1-10-2026-5", status: "FECHADA", mode: "OFICIAL", scope: "DEMONSTRACAO" } });
  if (!first) throw new Error("Prepare, calcule e feche a primeira parcela de outubro com seed-hr-documentary-poc.ts antes de vincular dezembro.");
  const final = await calculate(december.payrollIds[6], { sourceRunId: first.id, avos: 12, reason: "POC_LINKED_V2: parcela final vinculada à primeira parcela" });
  await calculate(december.payrollIds[7], { sourceRunId: final.id, avos: 12, average: "300.00", reason: "POC_LINKED_V2: diferença por média estimada de 300 BRL" });
  const vacationEntryIds: Record<string, string[]> = {};
  for (const contractId of ids) {
    await acquireVacationRights(db, actorId, contractId, "2025-12-31");
    const entry = await reserveVacationRight(db, actorId, { contractId, sourceKey: `POC_LINKED_V2:FERIAS:${contractId}`, periodStart: "2025-01-01", periodEnd: "2025-12-31", start: "2026-12-01", days: 10, kind: "GOZO", reason: "POC_LINKED_V2: férias vinculadas ao aquisitivo e à folha" });
    vacationEntryIds[contractId] = [entry.id];
  }
  await calculate(december.payrollIds[4], { vacationEntryIds, reason: "POC_LINKED_V2: pagamento de férias conforme reservas" });
  console.log(JSON.stringify({ scope: "DEMONSTRACAO", runs, vacationEntryIds, published: process.argv.includes("--publish") }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Cenários vinculados não concluídos."); process.exitCode = 1; }).finally(() => db?.$disconnect());
