import ts from "typescript";

const base = "src/app/app-domain/assinatura-digital";
const rootNames = [
  ...["usuarios", "documentos"].flatMap(kind => ["page.tsx", "actions.ts", "cadastro-model.ts", kind === "usuarios" ? "UsuariosClient.tsx" : "DocumentosClient.tsx"].map(file => `${base}/${kind}/${file}`)),
  "src/app/api/assinatura-digital/origens/route.ts",
  "tests/signature-central-cadastros.test.ts",
  "tests/signature-central-cadastros-browser.fixture.tsx",
  "next-env.d.ts",
];
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ".");
const program = ts.createProgram(rootNames, { ...parsed.options, strict: true, noEmit: true, incremental: false });
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: file => file, getNewLine: () => "\n",
  }));
  process.exitCode = 1;
} else console.log("Central cadastros: strict/noEmit — 0 diagnósticos (incluindo dependências importadas).");
