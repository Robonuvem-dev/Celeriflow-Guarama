import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { createGedDocumentEngine } from "./ged-document-engine.mjs";
import { createGedOcrEngine } from "./ged-ocr-engine.mjs";

const [inputPath, outputPath] = process.argv.slice(2);
try {
  const raw = await readFile(inputPath);
  if (raw.length > 29_000_000) throw new Error("Limite excedido.");
  const { kind, input } = JSON.parse(raw.toString("utf8"));
  let result;
  switch (kind) {
    case "ocr": {
      const engine = createGedOcrEngine({ cachePath: process.env.GED_OCR_CACHE_PATH || join(process.cwd(), "ocr-cache") });
      try { result = await engine.recognize(input); } finally { await engine.terminate(); }
      break;
    }
    case "convert": result = await createGedDocumentEngine().convert(input); break;
    case "pdfa": result = await createGedDocumentEngine().validate(input); break;
    case "embed": {
      await promisify(execFile)(process.env.GED_PYTHON_PATH || "/opt/ged/venv/bin/python", [join(process.cwd(), "services/ged-semantic/server.py"), "--input", inputPath, "--output", outputPath], { timeout: 120_000, maxBuffer: 1024 * 1024 });
      process.exit(0);
      break;
    }
    default: throw new Error("Operação interna inválida.");
  }
  await writeFile(outputPath, JSON.stringify(result), { mode: 0o600 });
} catch {
  // Tool output can contain document contents: never forward stdout/stderr.
  console.error("GED_INTERNAL_TASK_FAILED");
  process.exitCode = 1;
}
