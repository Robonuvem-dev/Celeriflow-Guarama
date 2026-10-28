import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { portalFirst } from "@/db/repositories/portal-servidor/records";
import { listPublicRecruitmentNotices } from "@/lib/rh/recruitment-service";
import { getFile, downloadFilename } from "@/lib/platform/blob";

export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = (await params).id;
    const notice = (await listPublicRecruitmentNotices(db)).find(row => row.id === id);
    if (!notice) return NextResponse.json({ error: "Edital indisponível." }, { status: 404 });
    const version = await portalFirst<{ fileUrl: string; hashSha256: string }>(db, sql`SELECT v."fileUrl",v."hashSha256" FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v.id=${notice.policy.documentVersionId} AND v.status IN ('FINAL','SIGNED') AND d.status='Válido' AND d."personId" IS NULL LIMIT 1`);
    if (!version) return NextResponse.json({ error: "Edital indisponível." }, { status: 404 });
    const file = await getFile(version.fileUrl);
    if (!file?.stream) return NextResponse.json({ error: "Arquivo indisponível." }, { status: 404 });
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) return NextResponse.json({ error: "Integridade documental inválida." }, { status: 423 });
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/pdf", "Content-Disposition": `inline; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ error: "Não foi possível consultar o edital." }, { status: 500 }); }
}
