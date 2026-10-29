import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { fitOperationalWidths, resizeOperationalWidths, type OperationalColumn } from "../src/lib/operational-tables";

type Fixture = { file: string; declarations?: string[]; result?: string; counts: number[] };
const domain = "src/app/app-domain/";
const fixtures: Fixture[] = [
  { file: `${domain}camara/legislaturas/LegislaturasClient.tsx`, counts: [5] },
  { file: `${domain}camara/leis/LeisClient.tsx`, counts: [7] },
  { file: `${domain}camara/proposicoes/ProposicoesClient.tsx`, counts: [7] },
  { file: `${domain}camara/sessoes/SessoesClient.tsx`, declarations: ["column", "columns"], result: "Object.values(columns)", counts: [7, 7, 7] },
  { file: `${domain}camara/vereadores/VereadoresClient.tsx`, declarations: ["column", "columns"], result: "Object.values(columns)", counts: [8, 4, 6] },
  { file: `${domain}cemiterios/consulta/page.tsx`, declarations: ["fields", "columns"], counts: [11] },
  { file: `${domain}cemiterios/processos/page.tsx`, counts: [10] },
  { file: `${domain}cemiterios/taxas/page.tsx`, declarations: ["column", "ruleColumns", "eventColumns"], result: "[ruleColumns, eventColumns]", counts: [10, 14] },
  { file: `${domain}cemiterios/CemiteriosClient.tsx`, declarations: ["legacyColumns"], result: "[legacyColumns]", counts: [9] },
  { file: `${domain}cultura/components/AtividadesEsporteLazerClient.tsx`, counts: [6] },
  { file: `${domain}cultura/components/CulturaProjetosClient.tsx`, counts: [7] },
  { file: `${domain}cultura/components/GestaoCulturalClient.tsx`, counts: [5] },
  { file: `${domain}seguranca/components/SegMobCrudClient.tsx`, counts: [8] },
  { file: `${domain}protocolos/acompanhamento/page.tsx`, counts: [12] },
  { file: `${domain}protocolos/arquivados/ArquivadosClient.tsx`, counts: [7] },
  { file: `${domain}protocolos/assinaturas/AssinaturasClient.tsx`, counts: [6] },
  { file: `${domain}protocolos/busca/BuscaClient.tsx`, counts: [7] },
  { file: `${domain}protocolos/ouvidoria/page.tsx`, counts: [7] },
  { file: `${domain}protocolos/processos/ProcessosClient.tsx`, counts: [9] },
  { file: `${domain}protocolos/servicos/ServiceCatalogEditor.tsx`, counts: [6] },
  { file: `${domain}protocolos/servicos/solicitacoes/page.tsx`, counts: [6] },
  { file: `${domain}transparencia/acessos/page.tsx`, counts: [6] },
  { file: `${domain}transparencia/banners/BannersClient.tsx`, counts: [7] },
  { file: `${domain}transparencia/contratos/ContratosClient.tsx`, counts: [8] },
  { file: `${domain}transparencia/diario-oficial/DiarioTable.tsx`, counts: [6] },
  { file: `${domain}transparencia/licitacoes/LicitacoesClient.tsx`, counts: [7] },
  { file: `${domain}transparencia/noticias/NoticiasTable.tsx`, counts: [6] },
  { file: `${domain}transparencia/paginas/PaginasTable.tsx`, counts: [6] },
  { file: `${domain}transparencia/publicacoes/page.tsx`, counts: [8] },
  { file: "src/components/transparencia/DiscoveryLinksTable.tsx", counts: [9] },
];

/** Avalia apenas configurações puras selecionadas por AST, sem importar páginas/actions/ORM. */
function configurations(fixture: Fixture): OperationalColumn[][] {
  const source = ts.createSourceFile(fixture.file, readFileSync(resolve(fixture.file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, ts.VariableDeclaration>();
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && (fixture.declarations ?? ["columns"]).includes(node.name.text)) declarations.set(node.name.text, node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const code = (fixture.declarations ?? ["columns"]).map(name => {
    const declaration = declarations.get(name);
    assert.ok(declaration, `${fixture.file}: configuração ${name} ausente`);
    return `const ${declaration.getText(source)};`;
  }).join("\n");
  const js = ts.transpileModule(`${code}\n globalThis.result = ${fixture.result ?? "[columns]"};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { config: { codeLabel: "Código", titleLabel: "Título", typeLabel: "Tipo", locationLabel: "Local" }, result: [] };
  runInNewContext(js, sandbox, { timeout: 1000 });
  return JSON.parse(JSON.stringify(sandbox.result)) as OperationalColumn[][];
}

test("35 configurações do lote preservam colunas e cabem em 1224px úteis sem ampliar no resize", () => {
  let reviewed = 0;
  for (const fixture of fixtures) {
    const groups = configurations(fixture);
    assert.deepEqual(groups.map(columns => columns.length), fixture.counts, `${fixture.file}: campos removidos ou variantes não revisadas`);
    for (const columns of groups) {
      const label = `${fixture.file}: ${columns.map(column => column.key).join(",")}`;
      assert.equal(new Set(columns.map(column => column.key)).size, columns.length, label);
      for (const column of columns) {
        assert.ok(column.initialWidth >= column.minWidth, label);
        assert.ok(column.maxWidth === undefined || column.maxWidth >= column.initialWidth, label);
        if (column.type !== "actions" && column.key !== "selection") assert.equal(column.details, "overflow", label);
      }
      const layout = fitOperationalWidths(columns, 1224);
      assert.equal(layout.fits, true, `${label}: mínimos ${layout.minimum}`);
      assert.equal(layout.widths.reduce((sum, width) => sum + width, 0), 1224, label);
      const index = columns.findIndex(column => column.resizable);
      for (const delta of [-10_000, 10_000]) {
        const resized = resizeOperationalWidths(columns, layout.widths, index, delta);
        assert.equal(resized.reduce((sum, width) => sum + width, 0), 1224, label);
        resized.forEach((width, position) => assert.ok(width >= columns[position].minWidth, label));
      }
      reviewed++;
    }
  }
  assert.equal(reviewed, 35);
});
