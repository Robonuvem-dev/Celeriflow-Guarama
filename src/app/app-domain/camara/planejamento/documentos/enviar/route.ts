import { planningDocumentUploadResponse } from "@/lib/planejamento/document-upload-response";
export const runtime = "nodejs";
export async function POST(request: Request) { return planningDocumentUploadResponse(request, "LEGISLATIVE"); }
