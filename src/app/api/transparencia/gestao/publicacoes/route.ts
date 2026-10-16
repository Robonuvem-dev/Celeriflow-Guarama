import { createHash } from "node:crypto";
import { AccessError, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { uploadFile, deleteUploadedDocument, validateUpload } from "@/lib/platform/blob";
import { publicationMetadataSchema } from "@/lib/transparencia/publication-policy";
import { getTransparencySettings } from "@/lib/transparencia/presentation-settings";
import {isSameOriginRequest} from "@/lib/transparencia/request-origin";

export async function POST(request: Request) {
  try {
    const context = await getTenantContextForModuleOperation("TRANSPARENCIA", "create");
    if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const form = await request.formData();
    const metadata = publicationMetadataSchema.parse(Object.fromEntries(["title", "collectionSlug", "entity", "year", "group", "referencePeriod"].map(key => [key, form.get(key)])));
    const settings = await getTransparencySettings(context.prisma);
    if (!settings.availableYears.includes(metadata.year)) throw new Error("Configure o exercício antes do upload.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um documento.");
    validateUpload(file);
    if (file.type !== "application/pdf") throw new Error("Envie PDF para esta biblioteca de documentos públicos.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Conteúdo não reconhecido como PDF.");
    const blob = await uploadFile(file);
    try {
      const entry = await context.prisma.transparencyPublication.create({ data: { ...metadata, source: "DOCUMENTOS", values: { origin: "Acervo público municipal", name: metadata.title }, fileUrl: blob.url, filePathname: blob.pathname, filename: file.name, contentType: file.type, sha256: createHash("sha256").update(bytes).digest("hex") } });
      return Response.json({ id: entry.id, title: entry.title, status: entry.status }, { status: 201 });
    } catch (error) {
      await deleteUploadedDocument(blob);
      throw error;
    }
  } catch (error) {
    return Response.json({ error: error instanceof AccessError ? error.message : error instanceof Error ? error.message : "Não foi possível enviar o documento." }, { status: error instanceof AccessError ? error.status : 400 });
  }
}
