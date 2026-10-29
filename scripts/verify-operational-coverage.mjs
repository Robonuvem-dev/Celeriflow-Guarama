// Independent, read-only AST reconciliation. No app imports, evaluation, emit or DB.
// --json includes every baseline ID, route witness and remaining source candidate.
import { readFileSync } from "node:fs";
import { resolve, posix } from "node:path";
import ts from "typescript";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { auditTables, readSources, operationalPrimitives } from "./audit-table-pattern.mjs";

const root = process.cwd();
const index = readFileSync(resolve(root, "docs/INVENTARIO_TABELAS_CELERIFLOW.md"), "utf8");
const ref = /\*\*Snapshot:\*\* `([^`]+)`/.exec(index)[1];
const baselineSources = readSources(ref);
const sources = readSources();
const sourceDigest = createHash("sha256").update([...sources].sort(([a], [b]) => a.localeCompare(b)).map(([file, text]) => `${file}\0${text}\0`).join("")).digest("hex");
const baseline = auditTables({ sources: baselineSources });
const current = auditTables({ sources });
const headSources = readSources("HEAD");
const headInventory = auditTables({ sources: headSources });
const opening = node => ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
const location = node => {
  const source = node.getSourceFile();
  const at = source.getLineAndCharacterOfPosition(node.getStart());
  return `${source.fileName}:${at.line + 1}:${at.character + 1}`;
};
const attr = (node, name) => opening(node)?.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText() === name)?.initializer;
const unwrap = node => node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node)) ? unwrap(node.expression) : node;
const staticAttribute = (node, name) => { const value = attr(node, name); const expression = value && ts.isJsxExpression(value) ? unwrap(value.expression) : value; return expression && ts.isStringLiteralLike(expression) ? expression.text : undefined; };
const routeOf = file => "/" + file.replace(/^src\/app\/(?:app-domain\/)?/, "").replace(/\/(?:page|loading|error|not-found|default|template)\.[jt]sx?$/, "").split("/").filter(part => !/^\(.+\)$/.test(part)).join("/");

function model(texts, inventory) {
  const parsed = new Map([...texts].map(([file, text]) => [file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, /x$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));
  const info = new Map();
  const functions = new Map();
  const nodeOwners = new Map();
  function destination(file, specifier) {
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
    const base = specifier.startsWith("@/") ? `src/${specifier.slice(2)}` : posix.normalize(`${posix.dirname(file)}/${specifier}`);
    return ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"].map(suffix => base + suffix).find(candidate => parsed.has(candidate));
  }
  for (const [file, source] of parsed) {
    const imports = new Map();
    const exports = new Map();
    const declarations = new Map();
    const register = (name, node) => {
      const key = `${file}#${name}`;
      const value = { key, file, name, node, edges: [], records: [] };
      functions.set(key, value); declarations.set(name, node);
      return key;
    };
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && statement.importClause && !statement.importClause.isTypeOnly) {
        const target = destination(file, statement.moduleSpecifier.text);
        const clause = statement.importClause;
        if (clause.name) imports.set(clause.name.text, { file: target, name: "default" });
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const item of clause.namedBindings.elements) if (!item.isTypeOnly) imports.set(item.name.text, { file: target, name: item.propertyName?.text ?? item.name.text });
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) imports.set(clause.namedBindings.name.text, { file: target, name: "*" });
      }
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) for (const item of statement.exportClause.elements) exports.set(item.name.text, { file: statement.moduleSpecifier ? destination(file, statement.moduleSpecifier.text) : file, name: item.propertyName?.text ?? item.name.text });
      if (ts.isExportAssignment(statement)) exports.set("default", { file, name: statement.expression.getText() });
    }
    walk(source, node => {
      let name;
      if (ts.isFunctionDeclaration(node) && node.body) name = node.name?.text ?? "default";
      if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) name = node.parent.name.text;
      if (name) {
        const key = register(name, node);
        nodeOwners.set(node, key);
        if (node.modifiers?.some(item => item.kind === ts.SyntaxKind.DefaultKeyword)) exports.set("default", { file, name });
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer);
    });
    info.set(file, { imports, exports, declarations });
  }
  function binding(file, name, seen = new Set()) {
    const key = `${file}#${name}`;
    if (seen.has(key)) return key;
    seen.add(key);
    const data = info.get(file);
    const imported = data?.imports.get(name) ?? data?.exports.get(name);
    if (imported?.file && `${imported.file}#${imported.name}` !== key) return binding(imported.file, imported.name, seen);
    if (name.includes(".")) {
      const [namespace, member] = name.split(".");
      const target = data?.imports.get(namespace);
      if (target?.name === "*" && target.file) return binding(target.file, member, seen);
    }
    return key;
  }
  function owner(node) {
    let parent = node;
    while (parent) { if (nodeOwners.has(parent)) return nodeOwners.get(parent); parent = parent.parent; }
    return `${node.getSourceFile().fileName}#<module>`;
  }
  function providerTag(file, name) {
    const key = binding(file, name);
    return /src\/components\/app-ui\/operational\/OperationalWorkspace\.tsx#Operational(?:Surface|Workspace)$/.test(key)
      || key === "src/components/app-ui/operational/OperationalTablePanel.tsx#OperationalTablePanel";
  }
  function protectedNode(node) {
    let parent = node.parent;
    while (parent && !nodeOwners.has(parent)) {
      if (opening(parent) && providerTag(node.getSourceFile().fileName, opening(parent).tagName.getText())) return true;
      parent = parent.parent;
    }
    return false;
  }
  function variableProvider(node, pathname) {
    let parent = node.parent;
    while (parent && !ts.isVariableDeclaration(parent) && !nodeOwners.has(parent)) parent = parent.parent;
    if (!parent || !ts.isVariableDeclaration(parent) || !ts.isIdentifier(parent.name)) return false;
    const variable = parent.name.text, file = node.getSourceFile().fileName;
    const boolean = input => {
      const value = unwrap(input);
      if (ts.isIdentifier(value)) {
        if (value.text === "pathname") return pathname;
        return boolean(info.get(file)?.declarations.get(value.text));
      }
      if (ts.isStringLiteralLike(value)) return value.text;
      if (ts.isArrayLiteralExpression(value)) return value.elements.map(boolean);
      if (ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken) return !boolean(value.operand);
      if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) && value.expression.name.text === "includes") return boolean(value.expression.expression).includes(boolean(value.arguments[0]));
      throw new Error("Unresolved provider guard");
    };
    let provided = false;
    walk(parsed.get(file), item => {
      if (!ts.isJsxExpression(item) || !item.expression || item.expression.getText() !== variable || !protectedNode(item)) return;
      let ancestor = item.parent;
      try {
        while (ancestor && !nodeOwners.has(ancestor)) {
          if (ts.isConditionalExpression(ancestor)) {
            const chosen = boolean(ancestor.condition) ? ancestor.whenTrue : ancestor.whenFalse;
            if (item.pos < chosen.pos || item.end > chosen.end) return;
          }
          ancestor = ancestor.parent;
        }
        provided = true;
      } catch { /* Unknown guard remains a review gap. */ }
    });
    return provided;
  }
  const byLocation = new Map();
  for (const [file, source] of parsed) walk(source, node => {
    if (opening(node)) byLocation.set(location(node), node);
    if (!opening(node) && !ts.isCallExpression(node)) return;
    const expression = opening(node)?.tagName ?? node.expression;
    if (!expression) return;
    const target = binding(file, expression.getText());
    const fn = functions.get(owner(node));
    if (fn && functions.has(target) && target !== fn.key) fn.edges.push({ target, at: location(node), provided: protectedNode(node), jsx: Boolean(opening(node)) });
  });
  for (const record of inventory.records) {
    const node = byLocation.get(record.id);
    if (node) { record.owner = owner(node); record.provided = protectedNode(node); functions.get(record.owner)?.records.push(record); }
  }
  const terminals = (key, directFirst = false) => {
    const seen = new Set(); const found = new Map();
    function visit(currentKey, path) {
      if (seen.has(currentKey)) return; seen.add(currentKey);
      const fn = functions.get(currentKey);
      if (!fn) return;
      const records = fn.records.filter(item => item.scope !== "primitive" && item.scope !== "nested-table" && item.scope !== "print-only");
      for (const record of records) found.set(record.id, { ...record, witness: path });
      if (directFirst && records.length) return;
      // A renderer is a leaf: do not count the implementation of its adapter twice.
      for (const edge of fn.edges) if (!operationalPrimitives.has(edge.target.split("#")[0])) visit(edge.target, [...path, edge]);
    }
    visit(key, []); return [...found.values()];
  };
  const pages = [...parsed.keys()].filter(file => /\/(?:page|loading|error|not-found|default|template)\.[jt]sx?$/.test(file)).map(file => ({ file, route: routeOf(file), entryKind: file.split("/").at(-1).split(".")[0], key: binding(file, "default") }));
  return { parsed, info, functions, byLocation, owner, binding, terminals, pages, providerTag, destination, variableProvider };
}

const before = model(baselineSources, baseline);
const after = model(sources, current);

// Small AST interpreter for manifest data, including map/flatMap and templates.
// It never executes application JS, imports ORM code or exposes process/fs.
function manifestEvaluator(graph) {
  const resolving = new Set();
  const bindPattern = (pattern, value, env) => {
    if (ts.isIdentifier(pattern)) env.set(pattern.text, value);
    else if (ts.isArrayBindingPattern(pattern)) pattern.elements.forEach((item, i) => { if (ts.isBindingElement(item)) bindPattern(item.name, value?.[i], env); });
  };
  function evaluate(input, file, env = new Map()) {
    const node = unwrap(input);
    if (!node) return undefined;
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return ts.isNumericLiteral(node) ? Number(node.text) : node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node)) {
      if (env.has(node.text)) return env.get(node.text);
      const key = graph.binding(file, node.text);
      if (resolving.has(key)) throw new Error(`Cyclic manifest: ${key}`);
      const [target, name] = key.split("#");
      const declaration = graph.info.get(target)?.declarations.get(name);
      if (!declaration) throw new Error(`Unsupported manifest identifier: ${key}`);
      resolving.add(key);
      const result = evaluate(declaration, target, env); resolving.delete(key); return result;
    }
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(item => ts.isSpreadElement(item) ? evaluate(item.expression, file, env) : [evaluate(item, file, env)]);
    if (ts.isObjectLiteralExpression(node)) {
      const object = {};
      for (const item of node.properties) {
        if (ts.isSpreadAssignment(item)) Object.assign(object, evaluate(item.expression, file, env));
        else if (ts.isPropertyAssignment(item)) {
          const name = item.name.text;
          // Presentation/navigation is not necessary to resolve route registration.
          if (["navigation", "moduleIcon", "moduleCaption"].includes(name)) continue;
          object[name] = evaluate(item.initializer, file, env);
        } else if (ts.isShorthandPropertyAssignment(item)) object[item.name.text] = evaluate(item.name, file, env);
      }
      return object;
    }
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => String(evaluate(span.expression, file, env)) + span.literal.text).join("");
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) return (...args) => {
      const local = new Map(env);
      node.parameters.forEach((param, i) => bindPattern(param.name, args[i], local));
      if (!ts.isBlock(node.body)) return evaluate(node.body, file, local);
      for (const statement of node.body.statements) {
        if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bindPattern(declaration.name, evaluate(declaration.initializer, file, local), local);
        if (ts.isReturnStatement(statement)) return evaluate(statement.expression, file, local);
      }
      throw new Error(`Unsupported manifest function: ${location(node)}`);
    };
    if (ts.isCallExpression(node)) {
      const args = node.arguments.map(arg => evaluate(arg, file, env));
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = evaluate(node.expression.expression, file, env); const method = node.expression.name.text;
        if (["map", "flatMap", "filter", "includes", "toUpperCase", "toLowerCase"].includes(method)) return receiver[method](...args);
      }
      const callee = evaluate(node.expression, file, env);
      if (typeof callee === "function") return callee(...args);
    }
    if (ts.isPropertyAccessExpression(node)) return evaluate(node.expression, file, env)?.[node.name.text];
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return evaluate(node.left, file, env) + evaluate(node.right, file, env);
    if (ts.isConditionalExpression(node)) return evaluate(evaluate(node.condition, file, env) ? node.whenTrue : node.whenFalse, file, env);
    throw new Error(`Unsupported manifest AST ${ts.SyntaxKind[node.kind]}: ${location(node)}`);
  }
  return (file, name) => evaluate(ts.factory.createIdentifier(name), file);
}
const evaluate = manifestEvaluator(after);
const manifestDirectory = "src/components/app-ui/operational/modules/";
const manifests = [...sources.keys()].filter(file => file.startsWith(manifestDirectory) && file.endsWith(".ts") && !file.endsWith("/index.ts"));
const registrations = [];
const manifestErrors = [];
const editingClaims = [];
const panelDeclarations = [];
for (const file of manifests) {
  try {
    for (const config of evaluate(file, "operationalModules")) for (const route of config.routes) registrations.push({ ...route, module: config.key, manifest: file });
  } catch (error) { manifestErrors.push({ file, error: error.message }); }
  if (after.info.get(file)?.declarations.has("operationalEditingGrades")) {
    try {
      for (const claim of evaluate(file, "operationalEditingGrades")) {
        if (typeof claim.baseline !== "string" || typeof claim.target !== "string") throw new Error("operationalEditingGrades entries require baseline and target paths");
        editingClaims.push({ ...claim, manifest: file });
      }
    }
    catch (error) { manifestErrors.push({ file, export: "operationalEditingGrades", error: error.message }); }
  }
  for (const name of ["operationalPanelRoutes", "operationalTablePanels", "operationalEditingPanels"]) {
    if (!after.info.get(file)?.declarations.has(name)) continue;
    try { for (const declaration of evaluate(file, name)) panelDeclarations.push({ ...declaration, manifest: file, export: name }); }
    catch (error) { manifestErrors.push({ file, export: name, error: error.message }); }
  }
}
const integratedFiles = new Set();
const entryFile = manifestDirectory + "index.ts";
const entry = after.info.get(entryFile);
for (const target of entry?.imports.values() ?? []) if (target.file) integratedFiles.add(target.file);
const activeModuleKeys = new Set(evaluate(entryFile, "operationalModules").map(config => config.key));
const activeRegistrations = registrations.filter(item => integratedFiles.has(item.manifest) && activeModuleKeys.has(item.module));
let registryConnected = false;
walk(after.parsed.get("src/app/app-domain/ClientLayout.tsx"), node => {
  if (ts.isCallExpression(node) && after.binding(node.getSourceFile().fileName, node.expression.getText()) === "src/components/app-ui/operational/routes.ts#findOperationalRoute"
    && node.arguments[0] && after.binding(node.getSourceFile().fileName, node.arguments[0].getText()) === `${entryFile}#operationalModules`) registryConnected = true;
});
const matches = (template, route) => {
  const expected = template.split("/").filter(Boolean); const actual = route.split("/").filter(Boolean);
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith("[[...")) return true;
    if (expected[i].startsWith("[...")) return actual.length > i;
    if (!actual[i] || (!/^\[[^/]+\]$/.test(expected[i]) && expected[i] !== actual[i])) return false;
  }
  return expected.length === actual.length;
};

// Overrides are structural identities reviewed against both ASTs, never reports.
// An ordinal is local to the named renderer owner, not a file-wide string count.
const overrides = new Map();
const reviewErrors = [];
function reviewed(file, pairs, reason, targetFile = file) {
  if (!file.startsWith("src/")) file = `src/app/app-domain/${file}`;
  if (!targetFile.startsWith("src/")) targetFile = `src/app/app-domain/${targetFile}`;
  for (const [lineColumn, selector] of pairs) {
    const originals = baseline.records.filter(item => item.file === file && (String(item.line) === String(lineColumn) || `${item.line}:${item.column}` === String(lineColumn)) && ["operational", "special-format"].includes(item.scope));
    const targets = current.records.filter(item => item.file === targetFile && (item.kind === "OperationalTable" || item.kind.startsWith("Operational adapter:")) && ["id", "preferenceId"].some(name => attr(after.byLocation.get(item.id), name)?.getText().includes(selector)));
    if (originals.length !== 1 || !targets.length) reviewErrors.push({ file, lineColumn, selector, originals: originals.length, targets: targets.length });
    else overrides.set(originals[0].id, { target: targets[0].id, targets: targets.map(item => item.id), reason });
  }
}
reviewed("camara/sessoes/SessoesClient.tsx", [[116, "camara.sessoes"], [183, "camara.sessoes"]], "sessions/propositions selected by activeTab; independent columns and row projections");
reviewed("camara/vereadores/VereadoresClient.tsx", [[110, "camara.parlamentares"], [162, "camara.parlamentares"], [200, "camara.parlamentares"]], "members/board/offices selected by activeTab, distinct row projections");
reviewed("cemiterios/taxas/page.tsx", [[36, "cemiterios.taxas.regras"], [38, "cemiterios.taxas.eventos"]], "rules.rows / events.rows preserved separately");
reviewed("compras/contratos/[id]/page.tsx", [[280, "compras-contrato-resumo"]], "seven financial indicators become financial summary rows; items and commitments are additions");
reviewed("compras/processos/[id]/page.tsx", [[118, "compras-processo-itens"]], "processo.items; origins/allocations in nested explicit panels");
reviewed("compras/solicitacoes/[id]/page.tsx", [[111, "compras-solicitacao-itens"]], "solicitacao.items; allocations and origins in nested explicit panels");
reviewed("configuracoes/processos/page.tsx", [[66, "configuracoes-processos-etapas"]], "legacyStages moved to linked stages route with same source and fields", "configuracoes/processos/etapas/page.tsx");
reviewed("controle-interno/consultas/rh/page.tsx", [[37, "controle-rh-"], [38, "controle-rh-"]], "groups / records selected by view; separate columns", "controle-interno/consultas/rh/WorkforceTables.tsx");
reviewed("educacao/professor/ProfessorEntryGrids.tsx", [[20, "educacao-professor-"], [21, "educacao-professor-"]], "attendance / grades modes; draft projections and controls remain independent");
reviewed("financeiro/contabilidade/etapas-anuais/AnnualStagesClient.tsx", [[30, "financeiro-inconsistencias-anuais"], [84, "financeiro-posicao-anual"]], "consistency.issues / edition.financialPosition.rows");
reviewed("financeiro/orcamento/OrcamentoClient.tsx", [[187, "financeiro-orcamento-despesas"], [194, "financeiro-orcamento-dotacoes"], [251, "financeiro-orcamento-creditos"], [326, "financeiro-orcamento-reservas"]], "expenses / appropriations / creditRequests / reservations");
reviewed("financeiro/orcamento/planejamento/PlanejamentoClient.tsx", [[330, "financeiro-legado-fixacoes"], [339, "financeiro-legado-cmd-mba"]], "legacy fixations / laws projections; no active route inferred");
reviewed("financeiro/pagamentos/PagamentosClient.tsx", [[299, "financeiro-pagamentos"], [501, "financeiro-retencoes"]], "pagedPayments / pendingWithholdings, reverse source order preserved semantically");
reviewed("obras/construcao-civil/regras/ConstructionRulesClient.tsx", [[50, "obras-regras-"]], "published rows moved to parent route; editor remains separate", "obras/construcao-civil/regras/page.tsx");
reviewed("obras/relatorios/page.tsx", [[130, "obras-relatorios-"], [187, "obras-relatorios-"]], "works / services selected by view", "obras/relatorios/WorksReportsClient.tsx");
reviewed("patrimonio/ciclo-vida/page.tsx", [[227, "patrimonio-ciclo-posicao"], [276, "patrimonio-ciclo-baixas"], [321, "patrimonio-ciclo-ajustes"]], "assets / writeOffs / adjustments");
reviewed("patrimonio/materiais/MaterialCatalogTable.tsx", [[110, "patrimonio-material-catalog"]], "materials rows; MaterialStockList retains both catalog consumers and route pagination");
reviewed("patrimonio/requisicoes/[id]/page.tsx", [[76, "preferenceId"]], "item.movements projected into RecordHistoryPanel; workflow items are independent", "patrimonio/_components/RecordHistoryPanel.tsx");
reviewed("portal-servidor/ferias/page.tsx", [[149, '"ferias"'], [171, '"afastamentos"']], "vacation / leave mapped by acquisitionStart vs startDate");
reviewed("rh/atividades-funcionais/page.tsx", [[28, "rh-atividades"]], "activities projection");
reviewed("rh/atividades-funcionais/page.tsx", [[31, "rh-inscricoes"]], "enrollments projection moved to CareerEnrollments", "rh/atividades-funcionais/CareerEnrollments.tsx");
reviewed("rh/consignacoes/page.tsx", [[37, "rh-consignacao-parcelas"]], "row.installments with entries in child panel");
reviewed("rh/parametrizacoes/HrPayrollSettingsClient.tsx", [[2408, "rh-parametros-"]], "shared CompactTable expanded into six domain panels: rules, rubrics, vacation, social security, brackets, links");
reviewed("saude/administracao/importacoes/ImportHistory.tsx", [[44, "saude-admin-importacoes"], [69, "saude-importacao-inconsistencias"]], "rows / issues.issues");
reviewed("saude/administracao/procedimentos/ProcedureCatalog.tsx", [[40, "saude-admin-procedimentos"], [66, "saude-procedimento-versoes"]], "rows / versions.versions");
reviewed("social/configuracoes/SocialCatalogsClient.tsx", [[77, "configuracoes-"], [100, "configuracoes-"]], "catalogs / wages selected by view with distinct columns and pages");
reviewed("sst/consolidado/ReportView.tsx", [[14, "sst-ppp-cats"]], "report.accidents / catRows; functional periods are additional");
reviewed("sst/equipamentos/entregas/page.tsx", [[26, "sst-equipamentos-entregas"]], "data.records / itemIds in DeliveryEventEditor; new employeeIds receiver selection is independent", "sst/equipamentos/entregas/DeliveryEventEditor.tsx");
reviewed("sst/equipamentos/necessidades/page.tsx", [[24, "sst-equipamentos-necessidades"]], "data.records; original HTML reserved for view=print");
reviewed("sst/equipamentos/relatorios/page.tsx", [["15:14", "sst-equipamentos-uso-"], ["15:714", "sst-equipamentos-uso-"]], "grouped summary / delivery records selected by mode; originals reserved for view=print");
reviewed("sst/ghe/page.tsx", [[29, "sst-ghe-servidores"]], "workers mapped to remotely paginated employees; group catalog is additional");
reviewed("tributacao/cobranca/CobrancaClient.tsx", [[300, "cobranca-ranking"], [501, "cobranca-beneficios"]], "data.ranking / data.benefitGrants");
reviewed("tributacao/comparativo-anual/page.tsx", [[36, "comparativo-"], [37, "comparativo-"]], "summaryFields / report.rows selected by summaryView");
reviewed("tributacao/domicilio-tributario/DteClient.tsx", [[30, "domicilio-tributario"]], "filtered communications; old table retained in print composition");
reviewed("tributacao/fiscalizacao/FiscalizacaoClient.tsx", [[435, "fiscalizacao-malhas"], [749, "fiscalizacao-documentos"], [856, "fiscalizacao-produtividade"]], "data.findings / order.documents / data.productivity");
reviewed("tributacao/iss-bancario/IssBancarioClient.tsx", [[232, "iss-bancario-apuracao"], [456, "iss-bancario-importacoes"], [735, "iss-bancario-balancetes"], [765, "iss-bancario-pacotes"], [798, "iss-bancario-fiscalizacao"]], "assessments / imports / balances / movements / cases");
reviewed("tributacao/itbi/ItbiClient.tsx", [[57, '"itbi"']], "filtered ITBI declarations; original in print composition");
reviewed("tributacao/motor-fiscal/MotorFiscalClient.tsx", [[87, "motor-fiscal-"], [92, "motor-fiscal-"]], "creditView rows / tab-specific parameter-account-guide-credit-reconciliation columns");
reviewed("tributacao/notificacoes/DebtNoticesClient.tsx", [[27, "notificacoes-destinatarios"]], "preview.targets in full-screen panel");
reviewed("tributacao/simples-nacional/SimplesNacionalClient.tsx", [[189, "simples-malhas"], [390, "simples-pagamentos"]], "visible findings / data.allocations");
reviewed("src/app/portal/licitacoes-e-contratos/page.tsx", [[40, '"licitacoes"'], [62, '"contratos"']], "biddings / contracts");
reviewed("src/components/app-ui/planejamento/PlanningManagementPage.tsx", [[60, ":documents"], [70, ":versions"], [74, ":checks"], [82, ":differences"], [95, ":amendments"], [110, ":quotas"], [122, ":credits"], [159, ":management-lines"]], "links / versions / criticisms / compatibility preview / amendments / quotas / credits / lines");
reviewed("src/components/app-ui/planejamento/PlanningReferencePage.tsx", [[27, ":references"], [28, ":reference-entries"], [34, ":relationships"]], "versions / entries / relationships");
reviewed("src/components/cemeteries/StructurePages.tsx", [[66, "cemeteries:structure-history"]], "readStructureHistory / history rows; lot-graves is an additional view, not the historical baseline table");

const baselineRecords = baseline.records.filter(item => ["operational", "special-format"].includes(item.scope));
const indexedIds = [];
let indexBase = "";
for (const line of index.split(/\r?\n/)) {
  const base = /^Base: `([^`]+)`/.exec(line); if (base) indexBase = base[1];
  const entry = /^- `([^`]+)` — (.*)$/.exec(line); if (!entry) continue;
  const file = entry[1].startsWith("src/") ? entry[1] : indexBase + entry[1];
  for (const point of entry[2].matchAll(/\bL(\d+):C(\d+)\s+[HEUSRG]\b/g)) indexedIds.push(`${file}:${point[1]}:${point[2]}`);
}
const baselineIndex = { indexed: indexedIds.length, duplicates: indexedIds.filter((id, i) => indexedIds.indexOf(id) !== i), missing: baselineRecords.filter(record => !indexedIds.includes(record.id)).map(record => record.id), extra: indexedIds.filter(id => !baselineRecords.some(record => record.id === id)) };
function rendererChain(record) {
  const node = after.byLocation.get(record.id);
  const start = after.binding(record.file, opening(node).tagName.getText());
  const destination = "src/components/app-ui/operational/OperationalTable.tsx#OperationalTable";
  const queue = [{ key: start, path: [start] }], seen = new Set();
  while (queue.length) {
    const next = queue.shift();
    if (next.key === destination) return next.path;
    if (seen.has(next.key)) continue; seen.add(next.key);
    for (const edge of after.functions.get(next.key)?.edges ?? []) queue.push({ key: edge.target, path: [...next.path, edge.target] });
  }
  return null;
}
const mappings = [];
for (const record of baselineRecords) {
  const override = overrides.get(record.id);
  let key = record.owner;
  if (!after.functions.has(key) && /\/page\.[jt]sx?$/.test(record.file)) key = after.binding(record.file, "default");
  let candidates = after.terminals(key, true).filter(item => item.scope === record.scope || (record.scope === "operational" && item.scope === "operational"));
  const siblings = baselineRecords.filter(item => item.owner === record.owner && item.scope === record.scope);
  let target;
  let method;
  if (record.scope === "special-format" && current.records.some(item => item.id === record.id)) {
    target = current.records.find(item => item.id === record.id); method = "unchanged special AST point";
  } else if (override) {
    target = current.records.find(item => item.id === override.target);
    method = override.reason;
  } else if (candidates.length === 1 && siblings.length === 1) {
    [target] = candidates; method = "same AST owner, unique reachable render point";
  } else if (siblings.length === candidates.length && candidates.length > 1) {
    // Keep ambiguous entries explicit until independently reviewed.
    method = "requires semantic review of sibling renderers";
  }
  const modern = target && (target.kind === "OperationalTable" || target.kind.startsWith("Operational adapter:"));
  const category = record.scope === "special-format" ? "special" : record.routes.length ? "active" : "legacy";
  const renderers = modern ? (override?.targets ?? [target.id]).map(id => ({ target: id, chain: rendererChain(current.records.find(item => item.id === id)) })) : [];
  mappings.push({ baseline: record.id, module: record.module, baselineOwner: record.owner, baselineScope: record.scope, baselineCategory: category, baselineRoutes: record.routes, status: target ? category === "special" ? "special" : category === "legacy" ? modern ? "mapped-legacy" : "legacy-native" : modern ? "mapped-operational" : "remaining-native" : "unresolved", target: target?.id, targets: override?.targets, renderers, kind: target?.kind, method, candidates: target ? undefined : candidates.map(item => ({ id: item.id, owner: item.owner, kind: item.kind })) });
}

const routeChecks = [];
for (const page of after.pages) {
  const targets = after.terminals(page.key).filter(item => ["operational", "special-format"].includes(item.scope));
  if (!targets.length) continue;
  const registrationsForPage = registryConnected && page.file.startsWith("src/app/app-domain/") ? activeRegistrations.filter(item => matches(item.pathname, page.route) || matches(page.route, item.pathname)) : [];
  const registration = registrationsForPage[0];
  const missingProviders = [];
  for (const target of targets) {
    if (!(target.kind === "OperationalTable" || target.kind.startsWith("Operational adapter:"))) continue;
    const key = after.binding(target.file, opening(after.byLocation.get(target.id)).tagName.getText());
    // An adapter can supply its own full-screen surface.
    const adapterProvides = after.functions.get(key)?.edges.some(edge => after.providerTag(key.split("#")[0], edge.target.split("#")[1]));
    const local = target.provided || target.witness.some(edge => edge.provided) || adapterProvides || after.variableProvider(after.byLocation.get(target.id), page.route);
    if (!registration && !local) missingProviders.push({ target: target.id, owner: target.owner, witness: target.witness });
  }
  routeChecks.push({ ...page, registered: registration?.pathname, registeredVariants: registrationsForPage.map(item => item.pathname), manifest: registration?.manifest, excludeQuery: registration?.excludeQuery, targets: targets.map(item => item.id), missingProviders });
}
for (const mapping of mappings) {
  const destinations = new Set(mapping.targets ?? [mapping.target]);
  mapping.currentConsumers = routeChecks.filter(entry => entry.targets.some(id => destinations.has(id))).map(entry => ({ route: entry.route, file: entry.file, targets: entry.targets.filter(id => destinations.has(id)) }));
}

const native = current.records.filter(item => item.kind !== "OperationalTable" && !item.kind.startsWith("Operational adapter:") && item.scope !== "primitive").map(record => {
  const astRoutes = routeChecks.filter(page => page.targets.includes(record.id)).map(page => page.route);
  let classification = record.scope;
  const evidence = [];
  let ancestor = after.byLocation.get(record.id)?.parent;
  while (ancestor) {
    if (opening(ancestor)) {
      const value = attr(ancestor, "className");
      if (value && value.getText().includes("hidden print:block") && !ts.isStringLiteral(value)) { classification = "conditional-print"; evidence.push({ at: location(ancestor), expression: value.getText() }); }
      if (value && /\[&>section(?::has\(table\)|>table)\]:hidden/.test(value.getText())) { classification = "retained-hidden"; evidence.push({ at: location(ancestor), expression: value.getText(), note: "ErpListFrame renders a direct section; verify compiled CSS in visual validation" }); }
    }
    ancestor = ancestor.parent;
  }
  if (/\/sst\/equipamentos\/(necessidades|relatorios)\/page\.tsx$/.test(record.file) && record.kind === "HTML") {
    classification = "query-print";
    evidence.push({ note: "Only reached after the params.view !== print branch returns OperationalListFrame", owner: record.owner });
  }
  if (record.scope === "operational" && !astRoutes.length) classification = mappings.some(item => item.baselineCategory === "legacy" && item.target === record.id) ? "legacy-native" : "orphan-native-review";
  return { ...record, classification, evidence, astRoutes };
});
const mappedTargets = new Set(mappings.flatMap(item => item.targets ?? [item.target]).filter(Boolean));
const newCandidates = current.records.filter(item => item.scope === "operational" && !mappedTargets.has(item.id) && !native.some(old => old.id === item.id && old.classification !== "operational"));
const appPath = file => file.startsWith("src/") ? file : `src/app/app-domain/${file}`;
// Reviewed identities complement any operationalEditingGrades export, in every
// module manifest. A declaration alone never establishes a renderer or consumer.
const explicitEditing = [
  { baseline: "compras/licitacoes/BiddingWorkflowPanel.tsx:402:1376", target: "compras/licitacoes/BiddingDraftTables.tsx", preferenceId: "compras-licitacao-membros-edicao" },
  { baseline: "compras/licitacoes/BiddingWorkflowPanel.tsx:411:688", target: "compras/licitacoes/BiddingDraftTables.tsx", preferenceId: "compras-licitacao-lote-selecao" },
  { baseline: "compras/recebimentos/ReceiptForm.tsx:65:14", target: "compras/recebimentos/ReceiptForm.tsx", preferenceId: "compras-recebimento-edicao" },
  { baseline: "compras/solicitacoes/SolicitacaoForm.tsx:317:29", target: "compras/solicitacoes/AllocationDraftTable.tsx", preferenceId: "compras-solicitacao-rateios-edicao" },
  { baseline: "obras/construcao-civil/regras/ConstructionRulesClient.tsx:38:43", target: "obras/construcao-civil/regras/ConstructionRulesClient.tsx", preferenceId: "obras-regras-campos-edicao" },
  { baseline: "obras/construcao-civil/regras/ConstructionRulesClient.tsx:40:112", target: "obras/construcao-civil/regras/ConstructionRulesClient.tsx", preferenceId: "obras-regras-criterios-edicao" },
  { baseline: "patrimonio/requisicoes/nova/MaterialRequestForm.tsx:62:163", target: "patrimonio/requisicoes/nova/MaterialRequestForm.tsx", preferenceId: "patrimonio-requisicao-nova-itens-edicao" },
  { baseline: "tributacao/avaliacoes/simulacao/page.tsx:30:261", target: "tributacao/avaliacoes/simulacao/SimulationUnitsEditor.tsx", preferenceId: "simulacao-unidades-rascunho" },
  { baseline: "tributacao/configuracoes-cadastrais/ConfigurableCadastresClient.tsx:50:108", target: "tributacao/configuracoes-cadastrais/FiscalFieldsEditor.tsx", sourcePreference: "catalogo-campos-rascunho" },
  { baseline: "tributacao/configuracoes-cadastrais/ZoningActivitiesInput.tsx:8:32", target: "tributacao/configuracoes-cadastrais/ZoningActivitiesInput.tsx", preferenceId: "zoneamento-atividades-rascunho" },
  { baseline: "tributacao/configuracoes-cadastrais/pgv-lote/PgvBulkClient.tsx:37:415", target: "tributacao/configuracoes-cadastrais/FiscalFieldsEditor.tsx", sourcePreference: "pgv-campos-rascunho" },
  { baseline: "tributacao/economico/eventos-veiculos/EconomicEventsVehiclesClient.tsx:32:181", target: "tributacao/configuracoes-cadastrais/FiscalFieldsEditor.tsx", sourcePreference: "evento-campos-rascunho" },
  { baseline: "tributacao/imoveis/[id]/perfil/PropertyProfileClient.tsx:33:161", target: "tributacao/imoveis/[id]/perfil/PropertyProfileClient.tsx", preferenceId: "perfil-imobiliario-proprietarios-rascunho" },
  { baseline: "tributacao/lotes-anuais/AnnualBatchesClient.tsx:28:45", target: "tributacao/lotes-anuais/AnnualBatchesClient.tsx", preferenceId: "lote-anual-alvos-rascunho" },
  { baseline: "tributacao/motor-fiscal/PaymentOptionsEditor.tsx:8:458", target: "tributacao/motor-fiscal/PaymentOptionsEditor.tsx", preferenceId: "opcoes-pagamento-rascunho" },
  { baseline: "src/components/app-ui/planejamento/PlanningForm.tsx:94:31", target: "src/components/app-ui/planejamento/PlanningForm.tsx", preferenceId: "planning:budget-items-edit" },
  { baseline: "src/components/app-ui/planejamento/PlanningForm.tsx:110:31", target: "src/components/app-ui/planejamento/PlanningForm.tsx", preferenceId: "planning:compatibility-mapping-edit" },
  { baseline: "src/components/transparencia/DiscoveryPresentationEditor.tsx:50:28", target: "src/components/transparencia/DiscoveryLinksTable.tsx", preferenceId: "transparencia.apresentacao.destinos" },
].map(claim => ({ ...claim, baseline: appPath(claim.baseline), target: appPath(claim.target), source: "reviewed AST identity" }));
const declaredEditing = [...editingClaims.map(claim => ({ ...claim, baseline: appPath(claim.baseline), target: appPath(claim.target), source: claim.manifest })), ...explicitEditing];
const editingReviewErrors = [];
const baselineEditingIds = new Set(baseline.gridCandidates.filter(item => item.classification === "editing-grid").map(item => `${item.file}:${item.line}:${item.column}`));
for (const claim of declaredEditing) if (!baselineEditingIds.has(claim.baseline)) editingReviewErrors.push({ baseline: claim.baseline, source: claim.source, error: "editing claim is not an indexed baseline grid" });
const entryOwners = new Map(after.pages.map(entry => {
  const reached = new Set();
  function reach(key) {
    if (reached.has(key)) return; reached.add(key);
    for (const edge of after.functions.get(key)?.edges ?? []) if (!operationalPrimitives.has(edge.target.split("#")[0])) reach(edge.target);
  }
  reach(entry.key); return [entry.file, reached];
}));
const editingMappings = baseline.gridCandidates.filter(item => item.classification === "editing-grid").map(grid => {
  const id = `${grid.file}:${grid.line}:${grid.column}`;
  const node = before.byLocation.get(id);
  const key = node ? before.owner(node) : undefined;
  const remaining = current.gridCandidates.filter(item => item.file === grid.file && item.classification === "editing-grid" && item.expression === grid.expression);
  const claims = declaredEditing.filter(claim => claim.baseline === id);
  const reachable = key ? after.terminals(key) : [];
  const targets = new Map();
  const evidence = [];
  for (const claim of claims) {
    const errors = [];
    if (claim.owner && key?.split("#")[1] !== claim.owner.split("/")[0]) errors.push("baseline owner mismatch");
    if (claim.legacy !== undefined && claim.legacy !== !grid.routes?.length) errors.push("baseline legacy category mismatch");
    const selected = reachable.filter(item => item.file === claim.target && (item.kind === "OperationalTable" || item.kind.startsWith("Operational adapter:"))
      && (!claim.renderer || after.binding(item.file, opening(after.byLocation.get(item.id)).tagName.getText()).split("#")[1] === claim.renderer)
      && (!claim.preferenceId || ["id", "preferenceId"].some(name => staticAttribute(after.byLocation.get(item.id), name) === claim.preferenceId)));
    const sourceCallSites = [];
    const sourceFunction = after.functions.get(key);
    if (sourceFunction) walk(sourceFunction.node, item => {
      if (!opening(item)) return;
      const targetBinding = after.binding(grid.file, opening(item).tagName.getText());
      if (!after.functions.has(targetBinding)) return;
      if (targetBinding.split("#")[0] !== claim.target) return;
      if (claim.sourcePreference && !["id", "preferenceId"].some(name => staticAttribute(item, name) === claim.sourcePreference)) return;
      const collection = claim.owner?.split("/")[1];
      if (collection && !attr(item, "rows")?.getText().includes(`lawForm.${collection}`)) return;
      sourceCallSites.push({ at: location(item), binding: targetBinding, rows: attr(item, "rows")?.getText(), preference: attr(item, "id")?.getText() ?? attr(item, "preferenceId")?.getText() });
    });
    if (claim.sourcePreference && !sourceCallSites.length) errors.push("source preference/callsite not found in the baseline owner");
    if (claim.owner?.includes("/") && !sourceCallSites.length) errors.push("legacy collection callsite not found");
    if (selected.length !== 1) errors.push(`expected one reachable renderer, found ${selected.length}`);
    if (errors.length) editingReviewErrors.push({ baseline: id, source: claim.source, target: claim.target, errors });
    else for (const target of selected) {
      targets.set(target.id, { id: target.id, chain: rendererChain(target), witness: target.witness, consumers: routeChecks.filter(entry => entry.targets.includes(target.id) && entryOwners.get(entry.file).has(key)).map(entry => ({ route: entry.route, file: entry.file })) });
      evidence.push({ source: claim.source, owner: key, sourceCallSites });
    }
  }
  const sourceConsumers = after.pages.filter(entry => entryOwners.get(entry.file).has(key)).map(entry => ({ route: entry.route, file: entry.file }));
  return { baseline: id, owner: key, expression: grid.expression, legacy: !grid.routes?.length, status: remaining.length ? "remaining-editing-grid" : targets.size ? "replaced-review" : "unresolved", remaining: remaining.map(item => `${item.file}:${item.line}:${item.column}`), sourceConsumers, targets: [...targets.values()], evidence };
});
const editingTargetIds = new Set(editingMappings.flatMap(item => item.targets.map(target => target.id)));
const accountedEditingIds = new Set(editingMappings.flatMap(item => item.remaining));
const newEditingGrids = current.gridCandidates.filter(item => item.classification === "editing-grid" && !accountedEditingIds.has(`${item.file}:${item.line}:${item.column}`));
for (const point of newCandidates) point.additionalCategory = editingTargetIds.has(point.id) ? "editing-grid-replacement" : headInventory.records.some(item => item.file === point.file) && point.file.endsWith("/UnitsListState.tsx") ? "head-loading-error-state" : "additional-domain-view";
for (const point of newCandidates) {
  point.rendererChain = rendererChain(point);
  point.currentConsumers = routeChecks.filter(entry => entry.targets.includes(point.id)).map(entry => ({ route: entry.route, file: entry.file }));
}
// Distinguish the added receiver selector from the baseline item-event table.
// The form field names are checked against the real actions' getAll calls.
const payloadContracts = [
  { field: "employeeIds", emitter: "sst/equipamentos/entregas/page.tsx", preferenceId: "sst-entrega-recebedores-edicao", action: "saveEquipmentDelivery", target: "sst/_components/SstSelectionTable.tsx" },
  { field: "itemIds", emitter: "sst/equipamentos/entregas/DeliveryEventEditor.tsx", preferenceId: "sst-equipamentos-entregas", action: "saveEquipmentEvent", target: "sst/equipamentos/entregas/DeliveryEventEditor.tsx" },
].map(contract => {
  const file = appPath(contract.emitter), targetFile = appPath(contract.target);
  const emitters = [], reads = [];
  walk(after.parsed.get(file), node => {
    if (opening(node) && staticAttribute(node, "name") === contract.field) emitters.push({ at: location(node), tag: opening(node).tagName.getText(), preferenceId: staticAttribute(node, "preferenceId") });
  });
  const action = after.functions.get(`${appPath("sst/equipamentos/actions.ts")}#${contract.action}`);
  if (action) walk(action.node, node => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "getAll" && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && node.arguments[0].text === contract.field) reads.push(location(node));
  });
  const target = current.records.find(record => record.file === targetFile && (contract.field === "employeeIds" || staticAttribute(after.byLocation.get(record.id), "preferenceId") === contract.preferenceId));
  const emitterOwners = new Set(emitters.map(emitter => after.owner(after.byLocation.get(emitter.at))));
  const consumers = target ? routeChecks.filter(entry => entry.targets.includes(target.id) && [...emitterOwners].some(key => entryOwners.get(entry.file).has(key))).map(entry => entry.route) : [];
  return { ...contract, passed: Boolean(emitters.length && reads.length && target && rendererChain(target) && consumers.includes("/sst/equipamentos/entregas")), emitters, reads, target: target?.id, rendererChain: target && rendererChain(target), consumers };
});
const counts = (items, key) => Object.fromEntries([...new Set(items.map(item => item[key]))].sort().map(value => [value, items.filter(item => item[key] === value).length]));
const supplementalGrids = [], supplementalRoles = [], prismaImports = [], unscannedRenderPoints = [];
for (const [file, source] of after.parsed) walk(source, node => {
  if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && /(?:@prisma\/client|generated\/prisma)/.test(node.moduleSpecifier.text)) prismaImports.push({ at: location(node), specifier: node.moduleSpecifier.text });
  if (!opening(node)) return;
  const name = opening(node).tagName.getText();
  const bound = after.binding(file, name);
  if ((name === "table" || /(?:src\/components\/ui\/table\.tsx#Table|src\/components\/app-ui\/erp\/ErpTable\.tsx#ErpTableContainer|src\/app\/app-domain\/saneamento\/components\/SanitationTable\.tsx#SanitationTable|src\/app\/app-domain\/patrimonio\/_components\/ResizableTable\.tsx#ResizableTable|src\/components\/app-ui\/operational\/OperationalTable\.tsx#OperationalTable)$/.test(bound)) && !current.records.some(record => record.id === location(node))) unscannedRenderPoints.push({ at: location(node), bound });
  const role = attr(node, "role");
  if (role && ts.isJsxExpression(role) && role.expression && ts.isStringLiteralLike(role.expression) && ["table", "grid", "treegrid"].includes(role.expression.text)) supplementalRoles.push({ at: location(node), role: role.expression.text });
  const className = attr(node, "className");
  if (!className || ts.isStringLiteral(className) || !/grid-cols-/.test(className.getText())) return;
  let parent = node.parent;
  while (parent && !opening(parent)) {
    if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && parent.expression.name.text === "map") { supplementalGrids.push({ file, at: location(node), expression: parent.expression.getText(), className: className.getText() }); break; }
    parent = parent.parent;
  }
});
const currentModern = current.records.filter(item => item.scope !== "primitive" && (item.kind === "OperationalTable" || item.kind.startsWith("Operational adapter:")));
const baselineCallableRoutes = before.pages.filter(page => before.terminals(page.key).length).map(page => page.route);
const baselineRouteMappings = baseline.routes.map(route => {
  const original = before.terminals(before.binding(route.file, "default"));
  const originalIds = new Set(original.map(record => record.id));
  const destinations = new Set(mappings.filter(mapping => originalIds.has(mapping.baseline)).flatMap(mapping => mapping.targets ?? [mapping.target]).filter(Boolean));
  const consumers = routeChecks.filter(entry => entry.targets.some(id => destinations.has(id)));
  const sameRoute = consumers.some(entry => entry.file === route.file && entry.entryKind === "page");
  return { route: route.route, file: route.file, status: !original.length ? "baseline-import-only" : sameRoute ? "same-route" : consumers.length ? "relocated" : "unresolved", baselineTargets: [...originalIds], destinationTargets: [...destinations], currentConsumers: consumers.map(entry => ({ route: entry.route, file: entry.file, targets: entry.targets.filter(id => destinations.has(id)) })) };
});

// Preference families are parsed from JSX expressions, never evaluated as app JS.
// Unknown identifiers are not universal wildcards and cannot prove a declaration.
function preferencePattern(input) {
  const node = unwrap(input && ts.isJsxExpression(input) ? input.expression : input);
  if (!node) return null;
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (ts.isStringLiteralLike(node)) return escape(node.text);
  if (ts.isTemplateExpression(node)) return escape(node.head.text) + node.templateSpans.map(span => ".*" + escape(span.literal.text)).join("");
  if (ts.isConditionalExpression(node)) {
    const yes = preferencePattern(node.whenTrue), no = preferencePattern(node.whenFalse);
    return yes !== null && no !== null ? `(?:${yes}|${no})` : null;
  }
  return null;
}
const preferenceFacts = [];
for (const [at, node] of after.byLocation) {
  const key = after.binding(node.getSourceFile().fileName, opening(node).tagName.getText());
  if (!after.functions.has(key)) continue;
  for (const name of ["preferenceId", "id"]) {
    const value = attr(node, name), pattern = preferencePattern(value);
    if (pattern !== null) preferenceFacts.push({ at, owner: after.owner(node), attribute: name, expression: value.getText(), pattern });
  }
}
const fileOwnerCache = new Map();
const realModernIds = new Set(currentModern.map(record => record.id));
const terminalCache = new Map();
const modernTerminals = key => {
  if (!terminalCache.has(key)) terminalCache.set(key, after.terminals(key).filter(record => realModernIds.has(record.id)));
  return terminalCache.get(key);
};
const panelMappings = panelDeclarations.map(declaration => {
  const entries = declaration.pathname ? after.pages.filter(entry => entry.entryKind === "page" && (matches(entry.route, declaration.pathname) || matches(declaration.pathname, entry.route))) : [];
  const ownerFile = declaration.file && appPath(declaration.file);
  const reached = new Set();
  if (ownerFile) {
    if (!fileOwnerCache.has(ownerFile)) {
      const owners = new Set();
      function reach(key) { if (owners.has(key)) return; owners.add(key); for (const edge of after.functions.get(key)?.edges ?? []) if (!operationalPrimitives.has(edge.target.split("#")[0])) reach(edge.target); }
      for (const fn of after.functions.values()) if (fn.file === ownerFile) reach(fn.key);
      fileOwnerCache.set(ownerFile, owners);
    }
    for (const key of fileOwnerCache.get(ownerFile)) reached.add(key);
  }
  for (const entry of entries) for (const key of entryOwners.get(entry.file) ?? []) reached.add(key);
  const preferences = declaration.panels ?? (declaration.preferenceId ? [declaration.preferenceId] : []);
  const evidence = preferences.map(preference => {
    const facts = preferenceFacts.filter(fact => reached.has(fact.owner) && new RegExp(`^${fact.pattern}$`).test(preference));
    const targets = new Set(facts.flatMap(fact => modernTerminals(fact.owner).map(record => record.id)));
    return { preference, facts, targets: [...targets] };
  });
  const targets = preferences.length ? [...new Set(evidence.flatMap(item => item.targets))] : [...new Set(entries.flatMap(entry => modernTerminals(entry.key).map(record => record.id)))];
  return { declaration, status: targets.length && evidence.every(item => item.targets.length) ? "proved" : "unresolved", evidence, targets: targets.map(id => ({ id, chain: rendererChain(current.records.find(record => record.id === id)) })), consumers: routeChecks.filter(entry => targets.some(id => entry.targets.includes(id)) && (entries.some(source => source.file === entry.file) || ownerFile && [...after.functions.values()].some(fn => fn.file === ownerFile && entryOwners.get(entry.file).has(fn.key)))).map(entry => ({ route: entry.route, file: entry.file })) };
});
const summary = {
  baselineRef: ref, baseline: baselineRecords.length, baselineIndex, baselineCategories: counts(mappings, "baselineCategory"), baselineStatus: counts(mappings, "status"),
  workingSourceSha256: sourceDigest,
  headLogicalPoints: headInventory.records.filter(item => ["operational", "special-format"].includes(item.scope)).length,
  headDefinitionsInNewFiles: headInventory.records.filter(item => ["operational", "special-format"].includes(item.scope) && !baseline.records.some(old => old.file === item.file)).map(item => ({ id: item.id, kind: item.kind })),
  currentFiles: sources.size, currentLogicalPoints: current.records.filter(item => ["operational", "special-format"].includes(item.scope)).length,
  operationalRenderDefinitions: currentModern.length, brokenRendererChains: mappings.filter(item => item.renderers.some(renderer => !renderer.chain)).map(item => item.baseline),
  currentKinds: counts(current.records.filter(item => item.scope === "operational"), "kind"),
  nativeScopes: counts(native, "classification"), editingBaseline: editingMappings.length, editingStatus: counts(editingMappings, "status"), editingActiveRemaining: editingMappings.filter(item => !item.legacy && item.status === "remaining-editing-grid").length,
  newEditingGrids, editingClaimExports: editingClaims.length, editingReviewErrors,
  editingClaimManifests: [...new Set(editingClaims.map(claim => claim.manifest))], payloadContracts,
  manifestRoutes: registrations.length, activeManifestRoutes: activeRegistrations.length, registryConnected, manifestErrors, reviewErrors,
  shadowedRegistrations: activeRegistrations.flatMap((item, i) => { const previous = activeRegistrations.slice(0, i).find(earlier => matches(earlier.pathname, item.pathname)); return previous ? [{ pathname: item.pathname, earlier: previous.pathname, manifest: item.manifest }] : []; }),
  unintegratedManifests: manifests.filter(file => !integratedFiles.has(file)),
  registeredWithoutPage: activeRegistrations.filter(item => !after.pages.some(page => matches(item.pathname, page.route) || matches(page.route, item.pathname))),
  tableRoutes: new Set(routeChecks.map(item => item.route)).size, tableEntries: routeChecks.length, registeredTableRoutes: new Set(routeChecks.filter(item => item.registered).map(item => item.route)).size,
  operationalTableRoutes: new Set(routeChecks.filter(item => item.targets.some(id => current.records.find(record => record.id === id)?.scope === "operational")).map(item => item.route)).size,
  importOnlyRouteFalsePositives: current.routes.filter(item => !routeChecks.some(entry => entry.route === item.route)).map(item => ({ route: item.route, file: item.file })),
  baselineCallableRouteChanges: { removed: baselineCallableRoutes.filter(route => !routeChecks.some(entry => entry.route === route)), added: [...new Set(routeChecks.map(item => item.route))].filter(route => !baselineCallableRoutes.includes(route)) },
  baselineRouteCoverage: { total: baselineRouteMappings.length, status: counts(baselineRouteMappings, "status") },
  domainPanelCoverage: { declarations: panelMappings.length, status: counts(panelMappings, "status") },
  residualCssGrids: { total: current.gridCandidates.length, classification: counts(current.gridCandidates, "classification") },
  routesMissingProvider: routeChecks.filter(item => item.missingProviders.length).length,
  newOrUnreconciledPoints: newCandidates.length,
  postBaselinePoints: newCandidates.length,
  postBaselineBeyondEditingReserve: newCandidates.filter(item => !editingTargetIds.has(item.id)).length,
  baselineDestinationDefinitions: mappedTargets.size,
  baselineOperationalDestinationDefinitions: currentModern.filter(item => mappedTargets.has(item.id)).length,
  editingDestinationDefinitions: editingTargetIds.size,
  brokenAdditionalChains: newCandidates.filter(item => !item.rendererChain).map(item => item.id),
  additionalCategories: counts(newCandidates, "additionalCategory"),
  modernWithoutEntry: currentModern.filter(item => !routeChecks.some(entry => entry.targets.includes(item.id))).map(item => ({ id: item.id, baselineLegacy: mappings.some(mapping => mapping.baselineCategory === "legacy" && (mapping.target === item.id || mapping.targets?.includes(item.id))) || editingMappings.some(mapping => mapping.legacy && mapping.targets.some(target => target.id === item.id)) })),
  coverageByModule: [...new Set(mappings.map(item => item.module))].sort().map(name => ({ module: name, baseline: mappings.filter(item => item.module === name).length, status: counts(mappings.filter(item => item.module === name), "status") })),
  supplementalGrids, supplementalRoles, unscannedRenderPoints, prismaImports,
};
const result = { summary, mappings, routeChecks, baselineRouteMappings, panelMappings, native, editingMappings, newCandidates, grids: current.gridCandidates, roles: current.summary.roleGrids, stringTables: current.stringTables, alternatives: current.alternativeCandidates };
function selfTest() {
  const fixture = new Map([
    ["src/app/app-domain/fixture/page.tsx", 'import { Used as Alias, Unused } from "./views"; export default function Page() { return <Alias />; }'],
    ["src/app/app-domain/fixture/views.tsx", 'export function Used() { return <table><tbody /></table>; } export function Unused() { return <table><tbody /></table>; }'],
    ["src/app/app-domain/fixture/barrel.ts", 'export { Used as Renamed } from "./views";'],
    ["src/app/app-domain/fixture/second/page.tsx", 'import * as Views from "../barrel"; export default function Page() { return <Views.Renamed />; }'],
    ["src/components/app-ui/operational/OperationalTable.tsx", 'export function OperationalTable() { return <table />; }'],
    ["src/components/app-ui/operational/OperationalTablePanel.tsx", 'export function OperationalTablePanel({children}) { return <div>{children}</div>; }'],
    ["src/app/app-domain/fixture/guard.tsx", 'import { OperationalTable } from "@/components/app-ui/operational/OperationalTable"; import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel"; export function Guard() { const pathname = usePathname(); const panel = !["/fixture/registered"].includes(pathname); const list = <OperationalTable />; return panel ? <OperationalTablePanel>{list}</OperationalTablePanel> : list; }'],
    ["src/app/app-domain/fixture/manifest.ts", 'const sections = [["a", "A"], ["b", "B"]] as const; function routes(base: string) { return sections.map(([key, title]) => ({ pathname: `${base}/${key}`, title })); } export const operationalModules = [{ key: "fixture", navigation: unsupportedNavigation(), routes: routes("/fixture") }];'],
    ["src/components/app-ui/planejamento/PlanningDraftTable.tsx", 'import { OperationalTable } from "@/components/app-ui/operational/OperationalTable"; export function PlanningDraftTable() { return <OperationalTable />; }'],
    ["src/app/app-domain/fixture/drafts/page.tsx", 'import { PlanningDraftTable as Draft } from "@/components/app-ui/planejamento/PlanningDraftTable"; export default function Page() { return <><Draft id="planning:items" /><Draft id="planning:mapping" /></>; }'],
  ]);
  const inventory = auditTables({ sources: fixture });
  const graph = model(fixture, inventory);
  for (const file of ["src/app/app-domain/fixture/page.tsx", "src/app/app-domain/fixture/second/page.tsx"]) {
    const reached = graph.terminals(graph.binding(file, "default"));
    assert.equal(reached.length, 1, "unused imports must not count as rendered tables");
    assert.equal(reached[0].owner, "src/app/app-domain/fixture/views.tsx#Used", "aliases, namespaces and reexports resolve to the same renderer");
  }
  const guarded = inventory.records.find(record => record.file.endsWith("/guard.tsx"));
  assert.equal(graph.variableProvider(graph.byLocation.get(guarded.id), "/fixture/contextual"), true);
  assert.equal(graph.variableProvider(graph.byLocation.get(guarded.id), "/fixture/registered"), false);
  assert.equal(inventory.records.find(record => record.file.endsWith("/OperationalTable.tsx")).scope, "primitive");
  const drafts = graph.terminals(graph.binding("src/app/app-domain/fixture/drafts/page.tsx", "default"));
  assert.equal(drafts.length, 2, "shared draft primitive must retain its two distinct consumer identities");
  assert.deepEqual(drafts.map(record => staticAttribute(graph.byLocation.get(record.id), "id")), ["planning:items", "planning:mapping"]);
  assert.equal(inventory.records.find(record => record.file.endsWith("/PlanningDraftTable.tsx")).scope, "primitive");
  assert.deepEqual(manifestEvaluator(graph)("src/app/app-domain/fixture/manifest.ts", "operationalModules")[0].routes.map(route => route.pathname), ["/fixture/a", "/fixture/b"]);
  assert.equal(matches("/a/[id]", "/a/new"), true);
  assert.equal(matches("/a/[id]", "/a/x/y"), false);
  assert.equal(matches("/a/[...slug]", "/a/x/y"), true);
  assert.equal(matches("/a/[...slug]", "/a"), false);
  assert.equal(matches("/a/[[...slug]]", "/a"), true);
  const dynamicPreference = ts.createSourceFile("fixture.ts", 'const id = `sst-${kind}-${name}`;', ts.ScriptTarget.Latest, true).statements[0].declarationList.declarations[0].initializer;
  assert.equal(new RegExp(`^${preferencePattern(dynamicPreference)}$`).test("sst-<kind>-<name>"), true);
  assert.equal(preferencePattern(ts.factory.createIdentifier("unknownPreference")), null, "unknown identifiers must not manufacture panel evidence");
  return { passed: true, checks: ["unused import exclusion", "alias / namespace / reexport resolution", "route-dependent provider around JSX variable", "primitive deduplication", "distinct draft consumers / exact preference identities", "manifest AST expansion", "route matching semantics", "dynamic panel AST / no unknown-identifier wildcard"] };
}
const reconciliationPassed = !baselineIndex.duplicates.length && !baselineIndex.missing.length && !baselineIndex.extra.length && !manifestErrors.length && !reviewErrors.length && !editingReviewErrors.length && !summary.brokenRendererChains.length && !summary.brokenAdditionalChains.length && !unscannedRenderPoints.length && !mappings.some(item => item.status === "unresolved") && !baselineRouteMappings.some(item => item.status === "unresolved") && !editingMappings.some(item => item.status === "unresolved" || item.targets.some(target => !target.chain)) && payloadContracts.every(contract => contract.passed) && registryConnected;
const strictBlockers = [];
if (!reconciliationPassed) strictBlockers.push({ kind: "reconciliation" });
const activeNative = native.filter(item => ["operational", "orphan-native-review", "legacy-native"].includes(item.classification));
if (activeNative.length) strictBlockers.push({ kind: "native-renderers", points: activeNative.map(item => item.id) });
const remainingEditing = editingMappings.filter(item => item.status !== "replaced-review");
if (remainingEditing.length) strictBlockers.push({ kind: "editing-grids", points: remainingEditing.map(item => ({ baseline: item.baseline, remaining: item.remaining, sourceConsumers: item.sourceConsumers })) });
if (newEditingGrids.length || supplementalGrids.length || supplementalRoles.length) strictBlockers.push({ kind: "new-unreviewed-grids-or-roles", newEditingGrids, supplementalGrids, supplementalRoles });
if (summary.modernWithoutEntry.some(item => !item.baselineLegacy)) strictBlockers.push({ kind: "orphan-renderers", points: summary.modernWithoutEntry.filter(item => !item.baselineLegacy) });
if (summary.routesMissingProvider) strictBlockers.push({ kind: "provider", routes: routeChecks.filter(item => item.missingProviders.length) });
if (summary.unintegratedManifests.length || summary.registeredWithoutPage.length || summary.shadowedRegistrations.length) strictBlockers.push({ kind: "manifest-integration" });
if (panelMappings.some(item => item.status !== "proved" || item.targets.some(target => !target.chain))) strictBlockers.push({ kind: "domain-panel-metadata", declarations: panelMappings.filter(item => item.status !== "proved" || item.targets.some(target => !target.chain)) });
summary.strict = { passed: strictBlockers.length === 0, blockers: strictBlockers };
if (process.argv.includes("--self-test")) console.log(JSON.stringify(selfTest(), null, 2));
else if (process.argv.includes("--check-reconciliation")) { console.log(JSON.stringify({ passed: reconciliationPassed, baseline: mappings.length, status: summary.baselineStatus, editingStatus: summary.editingStatus, baselineRoutes: summary.baselineRouteCoverage, domainPanels: summary.domainPanelCoverage, brokenRendererChains: summary.brokenRendererChains, reviewErrors, editingReviewErrors }, null, 2)); if (!reconciliationPassed) process.exitCode = 1; }
else if (process.argv.includes("--review")) {
  function describe(id, graph) {
    const node = graph.byLocation.get(id); if (!node) return id;
    const maps = [];
    walk(node, item => { if (ts.isCallExpression(item) && ts.isPropertyAccessExpression(item.expression) && item.expression.name.text === "map") maps.push(item.expression.expression.getText().slice(0, 80)); });
    return `${id} | ${["id", "preferenceId", "caption", "title", "label", "rows"].map(name => { const value = attr(node, name); return value ? `${name}=${value.getText().slice(0, 150)}` : ""; }).filter(Boolean).join(" ")} | ${maps.join(",")} | ${(baseline.records.find(r => r.id === id)?.headers ?? []).join("/")}`;
  }
  for (const item of mappings.filter(item => item.status === "unresolved")) {
    console.log(`BASE ${describe(item.baseline, before)}`);
    for (const candidate of item.candidates) console.log(`  TO ${describe(candidate.id, after)}`);
  }
}
else if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else if (process.argv.includes("--gaps")) console.log(JSON.stringify({ summary, unresolved: mappings.filter(item => item.status === "unresolved" || item.status === "remaining-native"), providers: routeChecks.filter(item => item.missingProviders.length), editing: editingMappings.filter(item => item.status !== "replaced-review"), native }, null, 2));
else console.log(JSON.stringify(summary, null, 2));
if (process.argv.includes("--strict") && !summary.strict.passed) process.exitCode = 1;
