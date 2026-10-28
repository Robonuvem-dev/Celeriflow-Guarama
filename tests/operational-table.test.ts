import assert from "node:assert/strict";
import test from "node:test";
import { fitOperationalWidths, operationalWidthPreferences, OPERATIONAL_PAGE_SIZE, paginateFullValue, resizeOperationalWidths } from "../src/lib/operational-tables";
import { unitColumns } from "../src/app/app-domain/saneamento/unidades/columns";

test("as oito colunas cabem sem ampliar a grade; arrastes extremos preservam mínimos e ações", () => {
  assert.equal(OPERATIONAL_PAGE_SIZE, 20);
  for (const available of [702, 703, 712, 740, 744, 768, 800, 1024, 1280, 1366, 1920, 3840]) {
    const result = fitOperationalWidths(unitColumns, available);
    assert.ok(result.fits);
    assert.equal(result.widths.reduce((sum, width) => sum + width, 0), available);
    for (let index = 0; index < unitColumns.length; index++) {
      for (const delta of [-10000, -100, -8, 8, 100, 10000]) {
        const resized = resizeOperationalWidths(unitColumns, result.widths, index, delta);
        assert.equal(resized.reduce((sum, width) => sum + width, 0), available, "Arrastar não muda a largura total");
        resized.forEach((width, position) => {
          assert.ok(width >= unitColumns[position].minWidth);
          assert.ok(width <= (unitColumns[position].maxWidth ?? Infinity));
        });
        assert.equal(resized.at(-1), 64, "Os dois botões de ação permanecem utilizáveis");
      }
    }
  }
});

test("preferências de um monitor amplo são revalidadas no tablet sem perder campos", () => {
  const desktop = fitOperationalWidths(unitColumns, 1920);
  const edited = resizeOperationalWidths(unitColumns, desktop.widths, 1, 450);
  const preferences = operationalWidthPreferences(unitColumns, edited);
  const restored = fitOperationalWidths(unitColumns, 1920, preferences);
  assert.deepEqual(restored.widths, edited);
  const tablet = fitOperationalWidths(unitColumns, 768 - 56, preferences);
  assert.ok(tablet.fits);
  assert.equal(tablet.widths.length, 8);
  assert.equal(tablet.widths.reduce((sum, width) => sum + width, 0), 768 - 56);
  tablet.widths.forEach((width, index) => assert.ok(width >= unitColumns[index].minWidth));
  assert.equal(fitOperationalWidths(unitColumns, 701).fits, false, "Área insuficiente é um conflito explícito");
});

test("leitura por trechos preserva conteúdo integral, quebras e grafemas Unicode", () => {
  const value = "Observação completa: ação, vínculo, 👨‍👩‍👧‍👦 e e\u0301.\n\n".repeat(30) + "Fim sem perda de espaços.  ";
  const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
  const graphemes = (text: string) => [...segmenter.segment(text)].map((item) => item.segment);
  const pages = paginateFullValue(value, (text) => graphemes(text).length <= 37);
  assert.ok(pages.length > 1);
  assert.equal(pages.join(""), value);
  assert.deepEqual(pages.flatMap(graphemes), graphemes(value));
  pages.forEach((page) => assert.ok(graphemes(page).length <= 37));
});
