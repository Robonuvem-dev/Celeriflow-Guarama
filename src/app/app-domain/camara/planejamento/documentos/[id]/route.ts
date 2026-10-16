import { planningDocumentResponse } from "@/lib/planejamento/document-response";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return planningDocumentResponse("LEGISLATIVE", (await params).id);
}
