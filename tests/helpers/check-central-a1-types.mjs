import ts from "typescript";

const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const roots = [
  "node_modules/next/types/global.d.ts",
  "src/lib/signatures/central-a1.ts", "src/lib/signatures/central-a1-certificate.ts",
  "src/db/schema/signature-central-a1.ts", "src/app/app-domain/assinatura-digital/integracoes/page.tsx",
  "src/app/app-domain/assinatura-digital/integracoes/IntegrationsClient.tsx",
  "src/app/app-domain/assinatura-digital/integracoes/api/route.ts", "tests/central-a1.test.ts",
  "tests/helpers/central-a1-certificates.ts",
  "tests/central-a1-browser.fixture.tsx",
];
const program = ts.createProgram(roots, { ...parsed.options, incremental: false, noEmit: true });
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => "\n" }));
  process.exitCode = 1;
} else console.log(`Central A1: types OK (${roots.length} entrypoints and imported dependencies; no build/typegen).`);
