/** Reconcile completed snapshots; retain technical provenance and every unresolved empty screen. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sources = [
  "docs/checkup/demonstration-data/browser-fifth-build/report.json",
  "docs/checkup/demonstration-data/browser-fifth-build-planning-retest/report.json",
].map(file => ({ file, report: JSON.parse(readFileSync(file, "utf8")) }));
if (sources.some(({ report }) => !report.finishedAt)) throw new Error("A reconciliação exige coletas concluídas.");
if (new Set(sources.map(({ report }) => report.base)).size !== 1) throw new Error("As coletas precisam ter a mesma origem.");
sources.sort((a, b) => a.report.finishedAt.localeCompare(b.report.finishedAt));
const latest = new Map();
for (const { file, report } of sources) for (const item of report.cases) latest.set(item.path, { ...item, evidence: file, snapshotFinishedAt: report.finishedAt });
const reviewedTechnical = new Map([
  ["/controle-interno/consultas/rh", {
    markers: ["THIAGO_MORCATTY_DEMO_2026_V1:role"],
    reason: "ID técnico exposto na coluna explícita ID do cargo; nome exibido como Coordenador de TI. Preservar o ID e a rastreabilidade dos vínculos.",
  }],
  ["/saude/gerencial", {
    markers: ["MUNICIPAL_DEMO_SEEDED"],
    reason: "Tipo de evento na distribuição de auditoria, proveniente de AuditEvent.eventType. Não é nome de paciente, atendimento ou profissional.",
  }],
  ["/obras/construcao-civil/integracoes", {
    markers: ["Ambiente demonstrativo — MUNICIPAL_DEMO_JSON_V1. Leiaute federal e canal de transmissão ainda não homologados. O lote é um snapshot municipal imutável. Recibo manual registra evidência declarada pelo gestor; não comprova aceite oficial automatizado."],
    reason: "Aviso da condição técnica da integração. A mensagem precisa continuar distinguindo o snapshot municipal da transmissão oficial homologada.",
  }],
]);
const cases = [...latest.values()].map(item => {
  const review = reviewedTechnical.get(item.path);
  const markers = item.visibleMarkers ?? [];
  const markerClassification = !markers.length ? "NO_VISIBLE_MARKERS" : review && markers.every(marker => review.markers.includes(marker)) ? "REVIEWED_TECHNICAL_PROVENANCE" : "REQUIRES_INDIVIDUAL_REVIEW";
  return { ...item, markerClassification, markerReview: markers.length ? review?.reason : undefined, hasEmptyTable: item.tables?.some(table => table.rows === 0) ?? false };
});
const report = {
  generatedAt: new Date().toISOString(), base: sources[0].report.base,
  scope: "Latest completed observation per menu path, at the default filters and available identity. Empty screens are retained as unresolved data/flow evidence; no claim of full CRUD validation.",
  sources: sources.map(({ file, report }) => ({ file, startedAt: report.startedAt, finishedAt: report.finishedAt, cases: report.cases.length })),
  summary: {
    paths: cases.length,
    reviewedTechnicalMarkerScreens: cases.filter(item => item.markerClassification === "REVIEWED_TECHNICAL_PROVENANCE").length,
    unreviewedMarkerScreens: cases.filter(item => item.markerClassification === "REQUIRES_INDIVIDUAL_REVIEW").length,
    emptyTableScreens: cases.filter(item => item.hasEmptyTable).length,
    screensWithEmptyMessages: cases.filter(item => item.emptyMessages?.length).length,
    errors: cases.filter(item => item.navigationError || item.appError || item.errors?.length || item.status >= 400).length,
    layoutBlocked: cases.filter(item => item.layoutBlocked).length,
  }, cases,
};
const output = "docs/checkup/demonstration-data/current-visible-review";
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
const escape = value => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
writeFileSync(`${output}/REPORT.md`, [
  "# Revisão reconciliada dos dados visíveis", "",
  `Concluída em ${report.generatedAt}. Origem: ${report.base}.`, "",
  `${report.summary.paths} caminhos de menu. ${report.summary.reviewedTechnicalMarkerScreens} ocorrências técnicas revisadas; ${report.summary.unreviewedMarkerScreens} ocorrências de marcador sem revisão. ${report.summary.errors} erros de aplicação/navegação e ${report.summary.layoutBlocked} bloqueios de tabela.`, "",
  `Há ${report.summary.emptyTableScreens} telas com ao menos uma tabela visível sem linhas de dados e ${report.summary.screensWithEmptyMessages} telas com mensagem de vazio. São medidas distintas; não somar. Filtros, ausência de pendências, permissões, vínculos e fluxos precisam de revisão individual antes de criar operações.`, "",
  "As três páginas de Planejamento consultadas antes da carga foram substituídas pelas observações do reteste concluído. As coletas originais foram preservadas.", "",
  "## Marcadores técnicos preservados", "", "| Caminho | Motivo |", "| --- | --- |",
  ...cases.filter(item => item.visibleMarkers?.length).map(item => `| \`${item.path}\` | ${escape(item.markerReview ?? "Revisão individual pendente")} |`), "",
  "## Mensagens de vazio e tabelas sem linhas no recorte observado", "", "| Caminho | Tabela sem linhas | Mensagem |", "| --- | --- | --- |",
  ...cases.filter(item => item.hasEmptyTable || item.emptyMessages?.length).map(item => `| \`${item.path}\` | ${item.hasEmptyTable ? "Sim" : "Não"} | ${escape(item.emptyMessages?.join(" / ") || "Sem mensagem textual identificada pelo coletor")} |`), "",
].join("\n"));
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.unreviewedMarkerScreens || report.summary.errors || report.summary.layoutBlocked) process.exitCode = 1;
