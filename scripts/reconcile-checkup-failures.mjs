/** Compare each originally non-open destination against chronological local evidence. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const originalFile = "docs/checkup/all-menu-production-retest/report.json";
const original = JSON.parse(readFileSync(originalFile, "utf8"));
const evidenceFiles = [
  "docs/checkup/latest-fixes-fourth-build/report.json",
  "docs/checkup/final-details-development/report.json",
  "docs/checkup/final-corrections-fifth-build/report.json",
  "docs/checkup/all-menu-fifth-build/report.json",
  "docs/checkup/all-screens-fifth-build/report.json",
];
const evidence = evidenceFiles.filter(existsSync).map(file => ({ file, report: JSON.parse(readFileSync(file, "utf8")) })).filter(item => item.report.finishedAt).sort((a, b) => a.report.finishedAt.localeCompare(b.report.finishedAt));
const expectedAuthentication = new Set(["/portal-paciente/agenda", "/portal-paciente/saude", "/portal-paciente/ouvidoria", "/portal-paciente/dados"]);
const expectedAccess = new Set(["/portal/construcao-civil", "/portal/construcao-civil/nova"]);
const cases = original.cases.filter(item => item.result !== "OPENED").map(before => {
  const observations = evidence.flatMap(({ file, report }) => {
    const match = report.cases.find(item => item.path === before.path);
    return match ? [{ file, base: report.base, finishedAt: report.finishedAt, result: match.result, errors: match.errors, consoleErrors: match.consoleErrors, httpErrors: match.httpErrors, status: match.status }] : [];
  });
  const latest = observations.at(-1);
  const clean = latest && !latest.errors?.length && !latest.consoleErrors?.length && !latest.httpErrors?.some(error => !error.prefetch);
  let classification = "PENDING_LOCAL_VERIFICATION";
  if (clean && expectedAuthentication.has(before.path) && latest.result === "AUTH_REQUIRED") classification = "SEPARATE_PATIENT_IDENTITY_REQUIRED";
  else if (clean && expectedAccess.has(before.path) && latest.result === "ACCESS_UNAVAILABLE") classification = "EXPECTED_ACCESS_MESSAGE";
  else if (clean && latest.result === "OPENED" && !expectedAccess.has(before.path)) classification = "OPENED_LOCALLY";
  else if (latest?.result === "NAVIGATION_ERROR") classification = "INCOMPLETE_NAVIGATION_VERIFICATION";
  else if (latest && !["ACCESS_UNAVAILABLE", "OPENED"].includes(latest.result)) classification = "LOCAL_ISSUE_OBSERVED";
  return { path: before.path, publishedResult: before.result, classification, latest, observations };
});
const report = {
  generatedAt: new Date().toISOString(), originalFile,
  scope: "Reconciliation of the 65 originally non-open published destinations. Local evidence is not a published deploy or full CRUD validation. Patient identity gates were inspected individually in code.",
  summary: cases.reduce((counts, item) => { counts[item.classification] = (counts[item.classification] || 0) + 1; return counts; }, {}),
  cases,
};
const output = "docs/checkup/failure-reconciliation";
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
writeFileSync(`${output}/REPORT.md`, [
  "# Reconciliação individual dos resultados publicados",
  "", report.scope, "",
  "A conta interna não possui paciente vinculado. Nas quatro páginas pessoais, o código chama `getPatientPortalAccess` antes das consultas e redireciona para o login quando esse vínculo está indisponível; isso não aprova as consultas de um paciente autenticado.",
  "", "| Destino | Resultado publicado | Classificação atual | Evidência local mais recente |", "| --- | --- | --- | --- |",
  ...cases.map(item => `| \`${item.path}\` | ${item.publishedResult} | ${item.classification} | ${item.latest ? `[${item.latest.result}](../../${item.latest.file.replace(/^docs\//, "")})` : "Inspeção do controle de acesso; sem novo teste de conteúdo"} |`), "",
].join("\n"));
console.log(JSON.stringify(report.summary, null, 2));
