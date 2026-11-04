import { z } from "zod";

const id = z.string().trim().min(1).max(100);
export const legalDocumentInput = z.object({ legalTextId: id, legalTextVersionId: id, expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), documentId: id, documentVersionId: id, role: z.enum(["ORIGINAL", "ATTACHMENT"]) });
export const wordAndLibreOfficeMimeTypes = {
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  odf: "application/vnd.oasis.opendocument.formula",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
} as const;
export const wordAndLibreOfficeAcceptedExtensions = Object.keys(wordAndLibreOfficeMimeTypes).map(ext => `.${ext}`).join(",");
export function isWordOrLibreOfficeFilename(filename: string) {
  const ext = filename.trim().split(".").pop()?.toLowerCase() ?? "";
  return Object.hasOwn(wordAndLibreOfficeMimeTypes, ext);
}
export const legalDatabaseDocumentInput = z.object({
  legalTextId: id,
  legalTextVersionId: id,
  expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  role: z.enum(["ORIGINAL", "ATTACHMENT"]),
  filename: z.string().trim().min(1).max(250).refine(isWordOrLibreOfficeFilename, "Informe um arquivo gerado por Microsoft Word (.doc, .docx, .rtf) ou LibreOffice (.odt, .odf, .ods)."),
  contentBase64: z.string().trim().min(4).max(8_000_000),
});
export class LegalDocumentError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
