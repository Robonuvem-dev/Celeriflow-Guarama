/** Consolidate completed route evidence without claiming older routes were rerun on the new build. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const load = file => ({ file, report: JSON.parse(readFileSync(file, "utf8")) });
const baseline = load("docs/checkup/all-screens-fifth-build/report.json");
const retest = load("docs/checkup/late-details-sixth-build/report.json");
assert.ok(baseline.report.finishedAt && retest.report.finishedAt, "Somente rodadas concluídas podem ser consolidadas.");
assert.equal(baseline.report.base, retest.report.base);
const lateFailures = baseline.report.cases.filter(item => !["OPENED", "AUTH_REQUIRED", "ACCESS_UNAVAILABLE"].includes(item.result));
const cases = new Map(baseline.report.cases.map(item => [item.path, { path: item.path, result: item.result, evidence: baseline.file, bundle: "fifth", errors: item.errors, consoleErrors: item.consoleErrors, httpErrors: item.httpErrors }]));
for (const item of retest.report.cases) cases.set(item.path, { path: item.path, result: item.passed ? "OPENED" : "RETEST_FAILED", evidence: retest.file, bundle: "sixth", errors: item.errors, consoleErrors: item.consoleErrors, httpErrors: item.httpErrors, error: item.error });
const reconciliation = lateFailures.map(before => ({ path: before.path, originalResult: before.result, latestResult: cases.get(before.path).result, originalEvidence: baseline.file, latestEvidence: cases.get(before.path).evidence }));
const entries = [...cases.values()];
const report = {
  generatedAt: new Date().toISOString(), base: baseline.report.base,
  scope: "Consolidated evidence across two local bundles. The sixth-bundle retest exercises the four late failures and every planning management section/entity variant. Earlier successful routes retain their fifth-bundle evidence; this is not a full sixth-bundle rerun or full CRUD approval.",
  sources: [baseline, retest].map(({ file, report }) => ({ file, startedAt: report.startedAt, finishedAt: report.finishedAt, buildId: report.buildId, cases: report.cases.length })),
  summary: {
    uniqueDestinations: entries.length,
    results: entries.reduce((counts, item) => ({ ...counts, [item.result]: (counts[item.result] ?? 0) + 1 }), {}),
    lateFailures: reconciliation.length,
    lateFailuresResolved: reconciliation.filter(item => item.latestResult === "OPENED").length,
    retestedOnSixth: retest.report.cases.length,
    failedOnSixth: retest.report.cases.filter(item => !item.passed).length,
  }, reconciliation, cases: entries,
};
const output = "docs/checkup/late-failure-reconciliation";
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
writeFileSync(`${output}/REPORT.md`, [
  "# Reconciliação das quatro falhas adicionais", "",
  report.scope, "",
  `A rodada ampliada do quinto bundle inspecionou ${baseline.report.cases.length} destinos. O reteste específico do sexto bundle inspecionou ${report.summary.retestedOnSixth}, com ${report.summary.failedOnSixth} falhas. ${report.summary.lateFailuresResolved}/${report.summary.lateFailures} problemas adicionais resolvidos.`, "",
  "| Caminho | Resultado anterior | Resultado mais recente |", "| --- | --- | --- |",
  ...reconciliation.map(item => `| \`${item.path}\` | ${item.originalResult} | ${item.latestResult} |`), "",
  "A correção foi a normalização do parâmetro de ID nas páginas, equivalente à que as telas principais já aplicavam. A entrada de gestão da Câmara recebeu a mesma correção após inspeção individual, mas não foi homologada com uma peça legislativa inexistente no cadastro disponível.", "",
  "Os sucessos anteriores mantêm a origem cronológica explícita no JSON. As quatro páginas pessoais do Portal do Paciente ainda dependem de identidade vinculada; as duas páginas de Construção Civil continuam apresentando a restrição legítima de contexto profissional.", "",
].join("\n"));
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.lateFailuresResolved !== report.summary.lateFailures || report.summary.failedOnSixth) process.exitCode = 1;
