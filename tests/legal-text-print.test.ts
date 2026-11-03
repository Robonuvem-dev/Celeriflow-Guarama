import assert from "node:assert/strict";
import { test } from "node:test";
import { renderLegalTextPrint } from "../src/lib/cadastros/legal-text-print";

const record = { type: "Lei", number: "2/2026", governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura", summary: "Ementa", content: "Art. 1º\n\n" + "Texto integral.\n".repeat(1000) + "Disposição final.", versionNumber: 3, publicationDate: new Date("2026-11-02T12:00:00Z") };
test("impressão preserva versão, publicação, conteúdo completo e quebras de linha", () => {
  const output = renderLegalTextPrint(record);
  assert.match(output, /Versão jurídica 3 · Publicação: 02\/11\/2026/);
  assert(output.includes(`<main class="text">${record.content}</main>`));
  assert.match(output, /white-space:pre-wrap/);
});
test("textos e metadados são impressos como texto, sem HTML ativo", () => {
  const output = renderLegalTextPrint({ ...record, type: "<img src=x>", summary: "<script>bad()</script>", content: "A & B < C" });
  assert.doesNotMatch(output, /<img|<script/);
  assert.match(output, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(output, /A &amp; B &lt; C/);
});
