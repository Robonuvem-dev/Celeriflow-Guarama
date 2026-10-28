import { config } from "dotenv";
import type { DatabaseConnection } from "../src/db/connection";
import { requirePayroll } from "../src/db/repositories/personnel/workforce";
import { prepareMunicipalPocDataset, RH_POC_CODE } from "./lib/municipal-setup-poc";
import { openMunicipalSetupConnection } from "./lib/municipal-setup-tools";
import { calculatePayrollRun, closePayrollRun, publishPayrollStatements } from "../src/lib/rh/workforce-service";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const args = process.argv.slice(2);
const competence = args.find(arg => arg.startsWith("--competence="))?.split("=")[1] || "10/2026";
const actorId = "SYSTEM:RH_POC_DOCUMENTAL_V1";
export function documentaryPocPreview(competence = "10/2026", args: readonly string[] = []) {
  return { mode: "PREVIEW", code: RH_POC_CODE, competence, fictionalPeople: 3, contracts: 3, payrollTypes: 9, scope: "DEMONSTRACAO", calculates: args.includes("--calculate"), closes: args.includes("--close"), publishes: args.includes("--publish"), realPayments: 0, createsUsers: false };
}
export async function seedHrDocumentaryPoc(connection: DatabaseConnection, competence = "10/2026", args: readonly string[] = []) {
  const dataset = await prepareMunicipalPocDataset(connection, actorId, competence);
  const runs = [];
  if (args.includes("--calculate")) for (const payrollId of dataset.payrollIds) {
    const payroll = await requirePayroll(connection.db, payrollId);
    const run = await calculatePayrollRun(connection, actorId, { payrollId, requestKey: `POC_DOCUMENTAL_V1:${payrollId}`, mode: "OFICIAL", scope: "DEMONSTRACAO", contractIds: dataset.contractIds, ...(payroll.type === "Mensal" ? {} : { specialParameters: { days: 30, vacationDays: 30, variableAmount: "150.00", rraMonths: 6, rraAmount: "18000.00", reason: "Demonstração documental POC — pacote versão 1" } }) });
    if (args.includes("--close")) await closePayrollRun(connection, actorId, run.id);
    if (args.includes("--publish")) await publishPayrollStatements(connection, actorId, run.id, new Date());
    runs.push({ id: run.id, type: payroll.type, gross: run.gross.toFixed(2), deductions: run.deductions.toFixed(2), net: run.net.toFixed(2), employer: run.employer.toFixed(2) });
  }
  return { mode: "DEMONSTRACAO", ...dataset, runs };
}
async function main() {
  if (!args.includes("--apply")) {
    console.log(JSON.stringify(documentaryPocPreview(competence, args), null, 2));
    return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  const connection = openMunicipalSetupConnection(connectionString);
  try { console.log(JSON.stringify(await seedHrDocumentaryPoc(connection, competence, args), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Pacote POC não concluído."); process.exitCode = 1; });
