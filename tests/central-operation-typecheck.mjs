import ts from "typescript";

const configFile = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const own = /(?:assinatura-digital\/(?:assine-agora|validacao|registros)\/|components\/signatures\/CentralValidationForm\.tsx|app\/validar-assinatura\/|tests\/central-operation.*\.tsx?$)/;
const files = parsed.fileNames.filter(file => own.test(file.replaceAll("\\", "/")));
const program = ts.createProgram([...files, "next-env.d.ts"], { ...parsed.options, incremental: false, plugins: [] });
const diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.file && own.test(diagnostic.file.fileName.replaceAll("\\", "/")));
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: file => file, getNewLine: () => "\n" }));
console.log(`Typecheck restrito: ${files.length} arquivos próprios; ${diagnostics.length} diagnósticos próprios. Dependências resolvidas para conferir contratos; sem typegen/build.`);
process.exitCode = diagnostics.length ? 1 : 0;
