import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { healthSusFiles, healthProductionCompetences } from "@/db/schema/health-production";
import { AccessError, assertHealthUnitAccess, getTenantContextForModule } from "@/lib/platform/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("SAUDE");
    const { id } = await params;
    const [row] = await (context.database ?? db).select({ file: healthSusFiles, competence: { period: healthProductionCompetences.period } }).from(healthSusFiles).innerJoin(healthProductionCompetences, eq(healthProductionCompetences.id, healthSusFiles.competenceId)).where(eq(healthSusFiles.id, id)).limit(1);
    const file = row ? { ...row.file, competence: row.competence } : null;
    if (!file) return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
    if (file.unitId) assertHealthUnitAccess(context.user, file.unitId);
    else if (context.user.hasHealthAccessScope) throw new AccessError("Arquivo consolidado fora do seu escopo de unidade.", 403);
    const filename = `${file.fileType}_${file.competence.period}.txt`;
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-File-Hash": file.hash,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível baixar o arquivo." }, { status: 500 });
  }
}
