// Read-only static inventory. This script does not change application files or
// query a database. Signals are evidence for review, not proof of conformance.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";
import ts from "typescript";

const root = process.cwd();
const normalize = (file) => relative(root, file).replaceAll("\\", "/");
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (["__tests__", "node_modules", ".next"].includes(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.[jt]sx?$/.test(file) && !/\.(?:test|spec)\.[jt]sx?$/.test(file)) files.push(file);
  }
}
walk(join(root, "src"));
files.sort();
const sourceFiles = new Map();
for (const file of files) sourceFiles.set(normalize(file), ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
const sourceInfo = new Map();
const primitives = new Set([
  "src/components/ui/table.tsx", "src/components/app-ui/erp/ErpTable.tsx",
  "src/app/app-domain/saneamento/components/SanitationTable.tsx",
  "src/app/app-domain/patrimonio/_components/ResizableTable.tsx",
]);
const records = [];
const gridCandidates = [];
const stringTables = [];
const roleGrids = [];
const alternativeCandidates = [];
const opening = (node) => ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
const attribute = (node, name) => opening(node)?.attributes.properties.find((item) => ts.isJsxAttribute(item) && item.name.getText() === name);
const literalAttribute = (node, name) => {
  const value = attribute(node, name)?.initializer;
  return value && ts.isStringLiteral(value) ? value.text : "";
};
const tag = (node) => opening(node)?.tagName.getText() ?? "";
function resolveImport(file, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/") ? join(root, "src", specifier.slice(2)) : resolve(dirname(file), specifier);
  for (const suffix of ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"]) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return normalize(candidate);
  }
  return null;
}
function descendants(node, predicate) {
  const found = [];
  const visit = (child) => { if (predicate(child)) found.push(child); ts.forEachChild(child, visit); };
  ts.forEachChild(node, visit);
  return found;
}
function owner(file) {
  const match = /^src\/app\/app-domain\/([^/]+)/.exec(file);
  if (match) return match[1];
  if (file.startsWith("src/app/")) return `publico:${file.split("/")[2]}`;
  return "compartilhado";
}
function routeOf(file) {
  return "/" + file.replace(/^src\/app\/(?:app-domain\/)?/, "").replace(/\/page\.[jt]sx?$/, "").split("/").filter((part) => !/^\(.+\)$/.test(part)).join("/");
}
function staticLabel(node) {
  if (ts.isJsxText(node)) return node.text.replace(/\s+/g, " ").trim();
  if (ts.isJsxExpression(node)) return node.expression && ts.isStringLiteral(node.expression) ? node.expression.text : "{dinâmico}";
  if (ts.isJsxElement(node)) return node.children.map(staticLabel).filter(Boolean).join(" ");
  return "";
}

for (const [file, source] of sourceFiles) {
  const text = source.text;
  const imports = new Map();
  const runtimeTsxImports = [];
  const reexports = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && !statement.importClause?.isTypeOnly) {
      const destination = resolveImport(source.fileName, statement.moduleSpecifier.text);
      if (destination && /\.[jt]sx$/.test(destination)) runtimeTsxImports.push(destination);
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { destination, original: "default", specifier: statement.moduleSpecifier.text });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) {
        if (!item.isTypeOnly) imports.set(item.name.text, { destination, original: item.propertyName?.text ?? item.name.text, specifier: statement.moduleSpecifier.text });
      }
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
      const destination = resolveImport(source.fileName, statement.moduleSpecifier.text);
      if (destination) reexports.push(destination);
    }
  }
  const edges = new Set([...reexports, ...runtimeTsxImports]);
  const pageSizes = [];
  for (const node of descendants(source, (item) => ts.isVariableDeclaration(item))) {
    if (/^(?:pageSize|itemsPerPage|rowsPerPage|[A-Z_]*PAGE_SIZE)$/.test(node.name.getText()) && node.initializer) {
      pageSizes.push({ name: node.name.getText(), value: node.initializer.getText().slice(0, 180), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
  }
  sourceInfo.set(file, { edges, imports, pageSizes, paginationSignal: /Pagination|Paginação|Paginacao|totalPages|pageCount|Página anterior|Próxima página/.test(text) });

  const visit = (node) => {
    const element = opening(node);
    if (element) {
      const name = tag(node);
      const binding = imports.get(name);
      if (binding?.destination && /\.[jt]sx$/.test(binding.destination)) edges.add(binding.destination);
      let kind = null;
      if (name === "table") kind = "HTML";
      else if (binding?.original === "Table" && /\/ui\/table$/.test(binding.specifier)) kind = "Table UI";
      else if (["ErpTableContainer", "SanitationTable", "ResizableTable"].includes(binding?.original ?? name)) kind = binding?.original ?? name;
      const role = literalAttribute(node, "role");
      if (["table", "grid", "treegrid"].includes(role)) roleGrids.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, role });
      if (kind) {
        const ancestors = [];
        let parent = node.parent;
        while (parent) { if (opening(parent)) ancestors.push(parent); parent = parent.parent; }
        const ancestorsText = [node, ...ancestors].map((item) => literalAttribute(item, "className")).join(" ");
        const printOnly = /(?:^|\s)hidden\s[^\n]*print:(?:block|table|flex)/.test(ancestorsText) || /\/api\//.test(file);
        const primitive = name === "table" && primitives.has(file);
        const nestedTable = name === "table" && ancestors.some((item) => ["table", "ErpTableContainer", "SanitationTable", "ResizableTable"].includes(tag(item)));
        const children = descendants(node, (item) => Boolean(opening(item)));
        const cells = children.filter((item) => ["td", "TableCell", "ErpTableTd"].includes(tag(item)));
        const heads = children.filter((item) => ["th", "TableHead", "ErpTableTh"].includes(tag(item)));
        const hiddenColumns = [...cells, ...heads].some((item) => /(?:^|\s)hidden(?:\s|$)/.test(literalAttribute(item, "className")));
        const stackedCells = cells.filter((cell) => {
          const nested = descendants(cell, (item) => Boolean(opening(item)));
          const blocks = nested.filter((item) => ["p", "br"].includes(tag(item)) || /(?:^|\s)(?:block|flex-col)(?:\s|$)/.test(literalAttribute(item, "className")));
          return blocks.length >= 2 || nested.some((item) => tag(item) === "br") || (blocks.length >= 1 && ts.isJsxElement(cell) && cell.children.filter((item) => (ts.isJsxExpression(item) && item.expression) || ts.isJsxElement(item)).length >= 2);
        }).length;
        const tableText = node.getText(source);
        const position = source.getLineAndCharacterOfPosition(node.getStart());
        const nodeLine = position.line + 1;
        const renderWrapper = ["SanitationTable", "ResizableTable"].includes(kind) ? kind : null;
        let headers = heads.map((head) => ts.isJsxElement(head) ? head.children.map(staticLabel).filter(Boolean).join(" ") : "");
        if (!headers.length && attribute(node, "columns")) headers = [...(attribute(node, "columns").getText().matchAll(/label:\s*["']([^"']+)["']/g))].map((item) => item[1]);
        records.push({
          id: `${file}:${nodeLine}:${position.character + 1}`, file, line: nodeLine, column: position.character + 1, module: owner(file), kind,
          scope: primitive ? "primitive" : printOnly ? "print-only" : nestedTable ? "nested-table" : "operational",
          context: ancestors.some((item) => /DialogContent|SheetContent|PopoverContent/.test(tag(item))) ? "modal/seletor" : ancestors.some((item) => tag(item) === "details") ? "expansível" : ancestors.some((item) => tag(item) === "TabsContent") ? "aba" : "listagem/consulta",
          headers, pageSizes, paginationSignal: sourceInfo.get(file).paginationSignal,
          signals: {
            resize: Boolean(renderWrapper) || /col-resize|setColumnWidths|resizeColumn/.test(tableText),
            hiddenColumns, stackedCells,
            ancestorScroll: /(?:^|\s)overflow-(?:auto|scroll|[xy]-(?:auto|scroll))(?:\s|$)/.test(ancestorsText),
            fixedLayout: /table-fixed|tableLayout:\s*["']fixed/.test(tableText) || Boolean(renderWrapper) || kind === "ErpTableContainer",
            truncation: /truncate|text-ellipsis|line-clamp|textOverflow/.test(tableText) || Boolean(renderWrapper) || kind === "ErpTableContainer",
            explicitCellDetail: cells.some((cell) => /<(?:button|Button)[\s\S]*(?:Ver (?:assunto|ementa|objeto|endereço|observação|conteúdo)|conteúdo completo|texto completo)/i.test(cell.getText(source))),
            smallFontLiterals: [...new Set([...tableText.matchAll(/text-\[((?:\d+\.?\d*)|(?:\.\d+))px\]/g)].map((item) => Number(item[1])).filter((size) => size < 13))],
          },
          routes: [],
        });
      }
      // Div-based repeated grids are review candidates, not automatically tables.
      if (["div", "section", "article"].includes(name) && /grid-cols-/.test(literalAttribute(node, "className"))) {
        let parent = node.parent;
        while (parent && !ts.isSourceFile(parent) && !ts.isJsxElement(parent)) {
          if (ts.isCallExpression(parent) && /\.map$/.test(parent.expression.getText())) {
            const position = source.getLineAndCharacterOfPosition(node.getStart());
            const containers = [];
            let container = node.parent;
            while (container) { if (opening(container)) containers.push(container); container = container.parent; }
            gridCandidates.push({ file, line: position.line + 1, column: position.character + 1, expression: parent.expression.getText(), className: literalAttribute(node, "className"), modal: containers.some((item) => /DialogContent|SheetContent/.test(tag(item))), snippet: node.getText(source).slice(0, 420) });
            break;
          }
          parent = parent.parent;
        }
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "map") {
      const callback = node.arguments[0];
      if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) && callback.parameters[0] && ts.isIdentifier(callback.parameters[0].name)) {
        const parameter = callback.parameters[0].name.text;
        const properties = [...new Set(descendants(callback.body, (item) => ts.isPropertyAccessExpression(item) && ts.isIdentifier(item.expression) && item.expression.text === parameter).map((item) => item.name.text).filter((name) => !["id", "key"].includes(name)))];
        const ancestors = [];
        let parent = node.parent;
        while (parent) { if (opening(parent)) ancestors.push(parent); parent = parent.parent; }
        const insideTable = ancestors.some((item) => ["table", "Table", "ErpTableContainer", "SanitationTable", "ResizableTable", "tbody", "thead", "tr", "td"].includes(tag(item)));
        const body = callback.body;
        const unwrap = (value) => ts.isParenthesizedExpression(value) ? unwrap(value.expression) : value;
        const returns = ts.isBlock(body) ? descendants(body, (item) => ts.isReturnStatement(item) && item.expression).filter((item) => {
          let current = item.parent;
          while (current && current !== body) { if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) return false; current = current.parent; }
          return true;
        }).map((item) => unwrap(item.expression)) : [unwrap(body)];
        for (const returned of returns) {
          if (!insideTable && opening(returned) && properties.length >= 2 && !["option", "SelectItem", "Combobox.Item", "Link", "a", "svg", "g", "th", "td", "tr", "TableRow", "TableHead", "TableCell", "ErpTableTr", "ErpTableTd"].includes(tag(returned))) {
            const position = source.getLineAndCharacterOfPosition(returned.getStart());
            alternativeCandidates.push({ file, line: position.line + 1, column: position.character + 1, tag: tag(returned), expression: node.expression.expression.getText().slice(0, 180), properties, modal: ancestors.some((item) => /DialogContent|SheetContent|PopoverContent/.test(tag(item))), form: ancestors.some((item) => tag(item) === "form"), inputs: descendants(returned, (item) => Boolean(opening(item)) && /^(?:input|Input|select|Select|textarea|Textarea)$/.test(tag(item))).length, snippet: returned.getText(source).slice(0, 300) });
          }
        }
      }
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /<table\b/i.test(node.text)) {
      stringTables.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, occurrences: [...node.text.matchAll(/<table\b/gi)].length });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// Manually reviewed classifications of the 48 explicit repeated CSS grids in
// the baseline. Keep editing grids and charts separate from data-list tables.
for (const grid of gridCandidates) {
  const file = grid.file;
  const expression = grid.expression;
  grid.classification =
    (file.endsWith("/compras/contratos/[id]/page.tsx") || file.endsWith("/importacoes/ImportHistory.tsx") || file.endsWith("/procedimentos/ProcedureCatalog.tsx") || (file.endsWith("/BiTributarioClient.tsx") && expression.startsWith("drillRows")) || file.endsWith("/cobranca/CobrancaClient.tsx") || file.endsWith("/divida-ativa/DividaAtivaClient.tsx") || file.endsWith("/iss-bancario/IssBancarioClient.tsx") || file.endsWith("/motor-fiscal/MotorFiscalClient.tsx") || file.endsWith("/vaf/VafClient.tsx")) ? "data-grid" :
    (file.endsWith("/cemiterios/CemiteriosClient.tsx") || file.endsWith("/simples-nacional/SimplesNacionalClient.tsx")) ? "operational-card" :
    (file.endsWith("/HealthReportsClient.tsx") || file.endsWith("/BiTributarioClient.tsx")) ? "chart" :
    file.endsWith("/suporte-tecnico/page.tsx") ? "informational" : "editing-grid";
  if (grid.classification === "data-grid") {
    const info = sourceInfo.get(file);
    records.push({ id: `${file}:${grid.line}:${grid.column}`, file, line: grid.line, column: grid.column, module: owner(file), kind: "CSS grid", scope: "operational", context: grid.modal ? "modal/seletor" : "grade alternativa", headers: [], pageSizes: info.pageSizes, paginationSignal: info.paginationSignal, signals: { resize: false, hiddenColumns: false, stackedCells: /<br\s*\/>|<small/.test(grid.snippet) ? 1 : 0, ancestorScroll: false, fixedLayout: false, truncation: /truncate/.test(grid.snippet), explicitCellDetail: false, smallFontLiterals: [] }, routes: [] });
  }
}
records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
const specialFormats = new Set([
  "src/app/portal/privacidade/page.tsx",
  "src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx",
  "src/app/app-domain/cemiterios/relatorio/page.tsx",
  "src/app/app-domain/compras/contratos/InstrumentLifecycleReport.tsx",
  "src/app/app-domain/rh/operacoes/demonstrativos/[id]/page.tsx",
]);
for (const record of records) if (record.scope === "operational" && specialFormats.has(record.file)) record.scope = "special-format";
const isTabular = (record) => ["operational", "special-format"].includes(record.scope);
const routeRecords = [];
for (const file of sourceFiles.keys()) {
  if (!/\/page\.[jt]sx?$/.test(file)) continue;
  const reached = new Set();
  function reach(current) {
    if (reached.has(current)) return;
    reached.add(current);
    for (const destination of sourceInfo.get(current)?.edges ?? []) reach(destination);
  }
  reach(file);
  for (const grid of gridCandidates) if (reached.has(grid.file)) (grid.routes ??= []).push(routeOf(file));
  const tables = records.filter((record) => isTabular(record) && reached.has(record.file));
  for (const record of tables) record.routes.push(routeOf(file));
  if (tables.length) routeRecords.push({ file, route: routeOf(file), module: owner(file), tables: tables.map((record) => record.id) });
}
const routesUsingModuleShell = routeRecords.filter((route) => {
  let folder = dirname(join(root, route.file));
  while (folder.startsWith(join(root, "src/app"))) {
    const layout = sourceFiles.get(normalize(join(folder, "layout.tsx")));
    if (layout && /ModuleShell/.test(layout.text)) return true;
    folder = dirname(folder);
  }
  return false;
});
const operational = records.filter((record) => record.scope === "operational");
const tabular = records.filter(isTabular);
const modules = [...new Set([...readdirSync(join(root, "src/app/app-domain"), { withFileTypes: true }).filter((item) => item.isDirectory() && !item.name.startsWith("(")).map((item) => item.name), ...tabular.map((record) => record.module)])].sort().map((module) => {
  const all = tabular.filter((record) => record.module === module);
  const tables = all.filter((record) => record.scope === "operational");
  return { module, tables: all.length, operational: tables.length, special: all.filter((record) => record.scope === "special-format").length, withoutRoute: tables.filter((record) => !record.routes.length).length, active: tables.filter((record) => record.routes.length).length, files: new Set(all.map((record) => record.file)).size, routeTemplates: routeRecords.filter((route) => route.module === module).length, resize: tables.filter((record) => record.signals.resize).length, paginationSignal: tables.filter((record) => record.paginationSignal).length, noPaginationSignal: tables.filter((record) => !record.paginationSignal).length, hiddenColumns: tables.filter((record) => record.signals.hiddenColumns).length, stackedCells: tables.filter((record) => record.signals.stackedCells > 0).length, scroll: tables.filter((record) => record.signals.ancestorScroll).length };
});
const summary = {
  scannedFiles: sourceFiles.size, jsxRenderPoints: records.length,
  tabularPoints: tabular.length, tabularFiles: new Set(tabular.map((record) => record.file)).size,
  specialFormatPoints: records.filter((record) => record.scope === "special-format").map((record) => record.id),
  activeOperationalPoints: operational.filter((record) => record.routes.length).length,
  operationalPoints: operational.length, operationalFiles: new Set(operational.map((record) => record.file)).size,
  internalPoints: operational.filter((record) => record.file.startsWith("src/app/app-domain/")).length,
  sharedPoints: operational.filter((record) => record.module === "compartilhado").length,
  publicPoints: operational.filter((record) => record.module.startsWith("publico:")).length,
  routeTemplates: routeRecords.length,
  internalRouteTemplates: routeRecords.filter((record) => record.file.startsWith("src/app/app-domain/")).length,
  primitivePoints: records.filter((record) => record.scope === "primitive").length,
  printOnlyPoints: records.filter((record) => record.scope === "print-only").length,
  nestedTablePoints: records.filter((record) => record.scope === "nested-table").map((record) => record.id),
  stringTableFragments: stringTables.reduce((sum, item) => sum + item.occurrences, 0),
  tablesWithoutRouteMapping: operational.filter((record) => !record.routes.length).map((record) => record.id),
  kindCounts: Object.fromEntries([...new Set(operational.map((record) => record.kind))].sort().map((kind) => [kind, operational.filter((record) => record.kind === kind).length])),
  signalCounts: Object.fromEntries(["resize", "hiddenColumns", "ancestorScroll", "fixedLayout", "truncation", "explicitCellDetail"].map((key) => [key, operational.filter((record) => record.signals[key]).length])),
  stackedTablePoints: operational.filter((record) => record.signals.stackedCells > 0).length,
  paginationSignalPoints: operational.filter((record) => record.paginationSignal).length,
  explicitPageSizes: operational.filter((record) => record.pageSizes.length).map((record) => ({ id: record.id, sizes: record.pageSizes })),
  cssGridClassification: Object.fromEntries([...new Set(gridCandidates.map((item) => item.classification))].map((kind) => [kind, gridCandidates.filter((item) => item.classification === kind).length])),
  editingGridsWithoutRoute: gridCandidates.filter((item) => item.classification === "editing-grid" && !item.routes?.length).map((item) => ({ file: item.file, line: item.line })),
  routesUsingModuleShell: routesUsingModuleShell.length,
  pointsUsingModuleShell: operational.filter((record) => record.routes.some((route) => routesUsingModuleShell.some((item) => item.route === route))).length,
  explicitPageSize20Points: operational.filter((record) => record.pageSizes.some((size) => size.value === "20")).length,
  explicitNon20Points: operational.filter((record) => record.pageSizes.some((size) => /^\d+$/.test(size.value) && size.value !== "20")).map((record) => ({ id: record.id, sizes: record.pageSizes })),
  roleGrids, cssGridCandidates: gridCandidates.length, alternativeCandidates: alternativeCandidates.length, modules,
};
if (process.argv.includes("--verify-index")) {
  const document = readFileSync(join(root, "docs/INVENTARIO_TABELAS_CELERIFLOW.md"), "utf8");
  let base = "";
  const indexed = [];
  for (const line of document.split(/\r?\n/)) {
    const folder = /^Base: `([^`]+)`/.exec(line);
    if (folder) base = folder[1];
    const entry = /^- `([^`]+)` — (.*)$/.exec(line);
    if (!entry) continue;
    const file = entry[1].startsWith("src/") ? entry[1] : base + entry[1];
    for (const location of entry[2].matchAll(/\bL(\d+):C(\d+)\s+[HEUSRG]\b/g)) indexed.push(`${file}:${location[1]}:${location[2]}`);
  }
  const expected = new Set(tabular.map((record) => record.id));
  const actual = new Set(indexed);
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  const duplicates = indexed.filter((id, index) => indexed.indexOf(id) !== index);
  const passed = !missing.length && !extra.length && !duplicates.length && actual.size === tabular.length;
  console.log(JSON.stringify({ passed, expected: tabular.length, indexed: actual.size, missing, extra, duplicates }, null, 2));
  if (!passed) process.exitCode = 1;
}
else if (process.argv.includes("--inventory")) console.log(JSON.stringify({ summary, records, routes: routeRecords, gridCandidates, alternativeCandidates, stringTables }, null, 2));
else if (process.argv.includes("--grids")) console.log(JSON.stringify(gridCandidates, null, 2));
else if (process.argv.includes("--alternatives")) console.log(JSON.stringify(alternativeCandidates, null, 2));
else if (process.argv.includes("--alternatives-compact")) {
  for (const item of alternativeCandidates.filter((item) => /^(?:article|li|div|section|label|Card|details|p)$/.test(item.tag) && item.properties.some((name) => /status|numero|number|^code$|createdAt|amount|total|quantity|valor|competence|cpf|cnpj|dueDate|updatedValue|^cda$|year|date|^value$|registration|protocol/i.test(name)))) console.log(`${item.file}:${item.line}:${item.column} | ${item.tag} | ${item.expression.replace(/\s+/g, " ")} | ${item.properties.join(",")} | inputs=${item.inputs}${item.modal ? " modal" : ""}${item.form ? " form" : ""}`);
}
else if (process.argv.includes("--index")) {
  for (const moduleEntry of modules) {
    const selected = tabular.filter((record) => record.module === moduleEntry.module);
    if (!selected.length) continue;
    console.log(`### ${moduleEntry.module}`);
    for (const file of [...new Set(selected.map((record) => record.file))]) {
      const items = selected.filter((record) => record.file === file);
      console.log(`- \`${file}\` — ${items.map((record) => `L${record.line}:C${record.column} (${record.kind}${record.scope === "special-format" ? "; especial" : ""}${record.routes.length ? "" : "; sem rota"})`).join("; ")}`);
    }
  }
}
else if (process.argv.includes("--summary")) console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([key]) => key !== "explicitPageSizes")), null, 2));
else if (process.argv.includes("--csv")) {
  const rows = [["id", "module", "file", "line", "kind", "scope", "context", "headers", "page_sizes_in_file", "pagination_signal_in_file", "resize_signal", "hidden_columns", "stacked_cells", "ancestor_scroll", "routes_static"]];
  for (const record of records) rows.push([record.id, record.module, record.file, record.line, record.kind, record.scope, record.context, record.headers.join(" / "), record.pageSizes.map((item) => `${item.name}=${item.value}`).join(" / "), record.paginationSignal, record.signals.resize, record.signals.hiddenColumns, record.signals.stackedCells, record.signals.ancestorScroll, record.routes.join(" | ")]);
  console.log(rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n"));
} else console.log(JSON.stringify(summary, null, 2));
