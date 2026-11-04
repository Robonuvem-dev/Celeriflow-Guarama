import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { XMLParser, XMLValidator } from "fast-xml-parser";

const run = promisify(execFile);
const officeExtensions = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pps", ".ppsx", ".odt", ".ods", ".odp", ".odf", ".rtf", ".html", ".htm"]);
const maximumBytes = 20 * 1024 * 1024;

function decode(contentBase64) {
  if (typeof contentBase64 !== "string" || contentBase64.length > 28_000_000 || !contentBase64.length || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) throw new Error("Base64 inválido.");
  const bytes = Buffer.from(contentBase64, "base64");
  if (!bytes.length || bytes.length > maximumBytes) throw new Error("Limite de 20 MiB por original.");
  return bytes;
}

export function parseVeraPdfReport(report) {
  if (typeof report !== "string" || report.length > 2_000_000 || /<!DOCTYPE/i.test(report) || XMLValidator.validate(report) !== true) throw new Error("Relatório veraPDF inválido.");
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: true }).parse(report);
  const jobs = parsed.report?.jobs?.job;
  const job = Array.isArray(jobs) ? jobs[0] : jobs;
  const validations = job?.validationReport;
  const validation = Array.isArray(validations) ? validations[0] : validations;
  if (typeof validation?.isCompliant !== "boolean" || !/^PDF\/A-/i.test(validation.profileName ?? "")) throw new Error("Relatório sem resultado PDF/A reconhecido.");
  return { compliant: validation.isCompliant, profile: validation.profileName, report };
}

export function createGedDocumentEngine({ libreOfficePath = process.env.GED_LIBREOFFICE_PATH || "soffice", veraPdfPath = process.env.GED_VERAPDF_PATH || "verapdf", timeoutMs = 80_000 } = {}) {
  return {
    async initialize() {
      await run(libreOfficePath, ["--headless", "--version"], { timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true });
      await run(veraPdfPath, ["--version"], { timeout: 15_000, maxBuffer: 1024 * 1024, windowsHide: true });
    },
    async convert(input) {
      if (!input || input.output !== "pdf" || typeof input.filename !== "string" || input.filename.length > 255) throw new Error("Conversão inválida.");
      const extension = extname(input.filename).toLowerCase();
      if (!officeExtensions.has(extension)) throw new Error("Formato Office/ODF não suportado.");
      const bytes = decode(input.contentBase64);
      const directory = await mkdtemp(join(tmpdir(), "ged-office-"));
      try {
        const path = join(directory, `original${extension}`);
        await writeFile(path, bytes);
        await run(libreOfficePath, [`-env:UserInstallation=${pathToFileURL(join(directory, "profile")).href}`, "--headless", "--convert-to", "pdf", "--outdir", directory, path], { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
        const pdf = await readFile(join(directory, "original.pdf"));
        if (pdf.length > maximumBytes || pdf.subarray(0, 5).toString() !== "%PDF-") throw new Error("PDF convertido inválido ou superior a 20 MiB.");
        return { pdfBase64: pdf.toString("base64") };
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
    async validate(input) {
      const bytes = decode(input?.contentBase64);
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Original não é PDF.");
      const directory = await mkdtemp(join(tmpdir(), "ged-verapdf-"));
      try {
        const path = join(directory, "original.pdf");
        await writeFile(path, bytes);
        // Let veraPDF detect the declared PDF/A flavour. Never infer compliance from the extension.
        let stdout;
        try { ({ stdout } = await run(veraPdfPath, ["--format", "xml", path], { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true })); }
        catch (error) {
          // veraPDF exits 1 for a completed, noncompliant validation.
          if (error.code !== 1 || error.killed) throw error;
          const result = parseVeraPdfReport(error.stdout);
          if (result.compliant) throw new Error("Resultado veraPDF incompatível com o código de saída.");
          return result;
        }
        return parseVeraPdfReport(stdout);
      } finally { await rm(directory, { recursive: true, force: true }); }
    },
  };
}
