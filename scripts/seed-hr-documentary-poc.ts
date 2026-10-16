import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { prepareDocumentaryPocDataset, RH_POC_CODE } from "../src/lib/rh/poc-bootstrap";
import { calculatePayrollRun, closePayrollRun, publishPayrollStatements } from "../src/lib/rh/workforce-service";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const args = process.argv.slice(2);
const competence = args.find(arg => arg.startsWith("--competence="))?.split("=")[1] || "10/2026";
const actorId = "SYSTEM:RH_POC_DOCUMENTAL_V1";
let db: PrismaClient | undefined;
async function main() {
  if (!args.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", code: RH_POC_CODE, competence, fictionalPeople: 3, contracts: 3, payrollTypes: 9, scope: "DEMONSTRACAO", calculates: args.includes("--calculate"), closes: args.includes("--close"), publishes: args.includes("--publish"), realPayments: 0, createsUsers: false }, null, 2));
    return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não configurada.");
  db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  const dataset = await prepareDocumentaryPocDataset(db, actorId, competence);
  const runs = [];
  if (args.includes("--calculate")) for (const payrollId of dataset.payrollIds) {
    const payroll = await db.payroll.findUniqueOrThrow({ where: { id: payrollId } });
    const run = await calculatePayrollRun(db, actorId, { payrollId, requestKey: `POC_DOCUMENTAL_V1:${payrollId}`, mode: "OFICIAL", scope: "DEMONSTRACAO", contractIds: dataset.contractIds, ...(payroll.type === "Mensal" ? {} : { specialParameters: { days: 30, vacationDays: 30, variableAmount: "150.00", rraMonths: 6, rraAmount: "18000.00", reason: "Demonstração documental POC — pacote versão 1" } }) });
    if (args.includes("--close")) await closePayrollRun(db, actorId, run.id);
    if (args.includes("--publish")) await publishPayrollStatements(db, actorId, run.id, new Date());
    runs.push({ id: run.id, type: payroll.type, gross: run.gross.toFixed(2), deductions: run.deductions.toFixed(2), net: run.net.toFixed(2), employer: run.employer.toFixed(2) });
  }
  console.log(JSON.stringify({ mode: "DEMONSTRACAO", ...dataset, runs }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Pacote POC não concluído."); process.exitCode = 1; }).finally(() => db?.$disconnect());
