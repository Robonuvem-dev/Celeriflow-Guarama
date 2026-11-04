import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { Sandbox } from "@vercel/sandbox";

const snapshotId = process.env.GED_SANDBOX_SNAPSHOT_ID;
if (!snapshotId) throw new Error("Configure GED_SANDBOX_SNAPSHOT_ID.");
const evidence = { snapshotId, checkedAt: new Date().toISOString(), networkPolicy: "deny-all", checks: [] };
const sandbox = await Sandbox.create({ source: { type: "snapshot", snapshotId }, persistent: false, timeout: 15 * 60_000, resources: { vcpus: 2 }, networkPolicy: "deny-all" });
async function task(kind, input) {
  const started = Date.now();
  await sandbox.writeFiles([{ path: "/tmp/input.json", content: Buffer.from(JSON.stringify({ kind, input })) }]);
  const command = await sandbox.runCommand({ cmd: "node", args: ["scripts/ged-sandbox-task.mjs", "/tmp/input.json", "/tmp/output.json"], cwd: "/vercel/sandbox", env: { HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", GED_OCR_CACHE_PATH: "/vercel/sandbox/ocr-cache" }, timeoutMs: 150_000 });
  assert.equal(command.exitCode, 0, `${kind}: tarefa falhou`);
  const result = JSON.parse((await sandbox.readFileToBuffer({ path: "/tmp/output.json" })).toString());
  console.log(`GED: ${kind} concluído em ${Date.now() - started} ms.`);
  return result;
}
try {
  for (const filename of ["modelo.docx", "referencia.doc", "referencia.xls", "educacao.xlsx", "referencia.pptx", "referencia-fapes-prazos-pitch-gov.pps", "educacao.odt", "referencia.ods", "referencia.odp", "formula.odf", "educacao.rtf", "educacao.html"]) {
    const bytes = await readFile(`docs/ged-poc-acervo/${filename}`);
    const converted = await task("convert", { filename, contentBase64: bytes.toString("base64"), output: "pdf" });
    assert.equal(Buffer.from(converted.pdfBase64, "base64").subarray(0, 5).toString(), "%PDF-");
    evidence.checks.push({ name: "OFFICE_PDF", filename, result: "PASS" });
  }
  for (const profile of ["1b", "2b"]) for (const expected of [true, false]) {
    const file = `referencia-pdfa-${profile}-${expected ? "pass" : "fail"}.pdf`;
    const result = await task("pdfa", { contentBase64: (await readFile(`docs/ged-poc-acervo/${file}`)).toString("base64") });
    assert.equal(result.compliant, expected);
    evidence.checks.push({ name: `PDFA_${profile.toUpperCase()}_${expected ? "PASS" : "FAIL"}_REFERENCE`, result: "PASS", profile: result.profile });
  }
  const ocr = await task("ocr", { contentBase64: (await readFile("docs/ged-poc-acervo/pagina-1.png")).toString("base64"), mimeType: "image/png", language: "por", pages: [1] });
  assert(ocr.pages[0]?.text.trim().length > 10);
  evidence.checks.push({ name: "OCR_PORTUGUESE", result: "PASS", characters: ocr.pages[0].text.length });
  const vectors = [];
  for (const text of ["Aquisição de veículos para transporte escolar.", "Compra de automóveis para levar estudantes à escola.", "Receita de bolo de chocolate com cobertura."]) {
    const result = await task("embed", { text });
    assert.equal(result.vector.length, 384);
    assert(result.vector.every(Number.isFinite));
    assert(Math.abs(Math.hypot(...result.vector) - 1) < 0.001);
    vectors.push(result.vector);
  }
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const related = dot(vectors[0], vectors[1]), unrelated = dot(vectors[0], vectors[2]);
  assert(related > unrelated, "Ordenação semântica portuguesa incorreta.");
  evidence.checks.push({ name: "SEMANTIC_PORTUGUESE", result: "PASS", dimensions: 384, related, unrelated });
  evidence.result = "PASS";
} catch (error) {
  evidence.result = "FAIL";
  evidence.error = error.message;
  process.exitCode = 1;
} finally {
  await sandbox.stop();
  await writeFile("docs/GED_VERCEL_RUNTIME_RESULTADO.json", JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence, null, 2));
}
