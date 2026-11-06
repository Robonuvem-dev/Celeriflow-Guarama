/** Route inventory and literal-link audit. No application server modules or SQL are executed.
 * Optional --base-url=https://... checks public documents and login redirects with GET.
 * CHECKUP_COOKIE_FILE may point to a user-provided Cookie header for authenticated checks.
 */
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { build } from "esbuild";
import { createRequire } from "node:module";
import ts from "typescript";

const root = process.cwd();
const walk = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
const files = walk("src").filter(file => /\.[jt]sx?$/.test(file));
const routePath = file => "/" + file.replace(/^src\/app\/(?:app-domain\/)?/, "").replace(/\/(?:page|route)\.[jt]sx?$/, "").split("/").filter(part => !/^\(.+\)$/.test(part) && !part.startsWith("@")).join("/");
const pages = files.filter(file => /^src\/app\//.test(file) && /\/page\.[jt]sx?$/.test(file)).map(file => ({ pathname: routePath(file), file }));
const endpoints = files.filter(file => /^src\/app\//.test(file) && /\/route\.[jt]sx?$/.test(file)).map(routePath);
const bundled = await build({ stdin: { contents: 'export { operationalModules } from "./src/components/app-ui/operational/modules"; export { findOperationalRoute, findOperationalShell, matchesOperationalPath } from "./src/components/app-ui/operational/routes"; export {isEmployeePublicRoute} from "./src/lib/portal-servidor/routes";', resolveDir: root, loader: "ts" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "silent" });
const compiled = { exports: {} };
new Function("module", "exports", "require", bundled.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const { operationalModules, findOperationalRoute, findOperationalShell, matchesOperationalPath, isEmployeePublicRoute } = compiled.exports;
const aliases = new Set(["/", "/portal/portaldoservidor", "/portal-transparencia", "/smarttv"]);
const exists = path => {
  const publicPath = path === "/app-domain" ? "/" : path.replace(/^\/app-domain\//, "/");
  return aliases.has(publicPath) || pages.some(page => matchesOperationalPath(page.pathname, publicPath)) || endpoints.some(route => matchesOperationalPath(route, publicPath));
};
const links = [];
for (const file of files) {
  if (/\.(test|spec)\.|\/__tests__\//.test(file)) continue;
  const text = readFileSync(file, "utf8"), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    let value;
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "href") {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) value = init.text;
      else if (init && ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) value = init.expression.text;
    } else if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "href" && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) value = node.initializer.text;
    if (value?.startsWith("/") && !value.startsWith("//") && !value.includes("[")) {
      const pathname = value.split(/[?#]/)[0];
      if (!/\.[a-z0-9]+$/i.test(pathname) && !pathname.startsWith("/api/") && !exists(pathname)) links.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1, href: value });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const inventory = pages.map(page => {
  const shell = isEmployeePublicRoute(page.pathname) ? null : findOperationalShell(operationalModules, page.pathname);
  return { ...page, module: shell?.module.key ?? page.pathname.split("/")[1] ?? "root", shell: Boolean(shell), list: Boolean(findOperationalRoute(operationalModules, page.pathname, new URLSearchParams())) };
});
const invalidMenuLinks = operationalModules.flatMap(mod => mod.navigation.flatMap(group => group.items.filter(item => item.href.startsWith("/") && !exists(item.href.split(/[?#]/)[0])).map(item => ({ module: mod.key, href: item.href }))));
const invalidRegistrations = operationalModules.flatMap(mod => mod.routes.filter(route => !pages.some(page => matchesOperationalPath(page.pathname, route.pathname))).map(route => ({ module: mod.key, pathname: route.pathname })));
const report = { date: new Date().toISOString(), summary: { pages: pages.length, modules: operationalModules.length, shellPages: inventory.filter(page => page.shell).length, listPages: inventory.filter(page => page.list).length, brokenLiteralLinks: links.length, invalidMenuLinks: invalidMenuLinks.length, invalidRegistrations: invalidRegistrations.length }, invalidMenuLinks, invalidRegistrations, brokenLiteralLinks: links, inventory, http: [] };
const base = process.argv.find(arg => arg.startsWith("--base-url="))?.slice(11);
if (base) {
  const cookie = process.env.CHECKUP_COOKIE_FILE ? readFileSync(process.env.CHECKUP_COOKIE_FILE, "utf8").trim() : "";
  const selected = inventory.filter(page => !page.pathname.includes("[") && (cookie || page.pathname.startsWith("/portal/") || page.pathname === "/portal" || page.pathname === "/portal-servidor/entrar" || page.pathname === "/login"));
  // Sequential requests avoid exhausting the municipal connection pool.
  for (const page of selected) {
    try {
      const response = await fetch(new URL(page.pathname, base), { headers: cookie ? { Cookie: cookie } : {}, signal: AbortSignal.timeout(60000), redirect: "follow" });
      const body = await response.text();
      const login = /\/(?:login|entrar)(?:\?|$)/.test(response.url);
      const serverError = /NEXT_HTTP_ERROR_FALLBACK;500|"digest"\s*:\s*"\d+"|Application error: a server-side exception|Internal Server Error/.test(body);
      const result = { pathname: page.pathname, status: response.status, finalUrl: response.url, result: !response.ok || serverError ? "ERROR" : login && !/\/(?:login|entrar)$/.test(page.pathname) ? "AUTH_REQUIRED" : "OPENED" };
      report.http.push(result);
      console.log(`${result.result} ${response.status} ${page.pathname}`);
    } catch (error) { report.http.push({ pathname: page.pathname, result: "NETWORK_ERROR", message: error.message }); }
  }
}
const output = resolve(process.env.CHECKUP_OUTPUT ?? "docs/checkup");
mkdirSync(output, { recursive: true });
writeFileSync(`${output}/routes.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report.summary, http: report.http.length, output: relative(root, output) }, null, 2));
