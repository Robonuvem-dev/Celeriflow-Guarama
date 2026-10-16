import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { downloadConstructionAutomaticViability } from "@/lib/obras/construction-automatic-viability";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const { id, runId } = await params;
    const identity = await getConstructionPortalIdentity();
    const artifact = await downloadConstructionAutomaticViability(prisma, identity.id, id, runId);
    return new Response(Buffer.from(artifact.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${artifact.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Document-SHA256": artifact.hash } });
  } catch {
    return Response.json({ error: "Documento indisponível ou assinatura GED ainda não validada." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }
}
