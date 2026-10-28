import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthSusReferences, healthSusProcedures } from "@/db/schema/health-catalogs";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getTenantContextForModule("SAUDE");
    const type = request.nextUrl.searchParams.get("type");
    const query = request.nextUrl.searchParams.get("q")?.trim().slice(0, 120) || "";
    if (!query || !["cid", "procedure"].includes(type || "")) return NextResponse.json({ items: [] });
    const database = context.database ?? db;
    const items = type === "cid"
      ? await database.select({ id: healthSusReferences.id, code: healthSusReferences.code, description: healthSusReferences.description }).from(healthSusReferences).where(and(eq(healthSusReferences.isCurrent, true), eq(healthSusReferences.isActive, true), eq(healthSusReferences.kind, "CID"), or(sql`strpos(lower(${healthSusReferences.code}), lower(${query})) > 0`, sql`strpos(lower(${healthSusReferences.description}), lower(${query})) > 0`))).orderBy(asc(healthSusReferences.code)).limit(20)
      : await database.select({ id: healthSusProcedures.id, code: healthSusProcedures.code, description: healthSusProcedures.description }).from(healthSusProcedures).where(and(eq(healthSusProcedures.isCurrent, true), eq(healthSusProcedures.isActive, true), or(sql`strpos(lower(${healthSusProcedures.code}), lower(${query})) > 0`, sql`strpos(lower(${healthSusProcedures.description}), lower(${query})) > 0`))).orderBy(asc(healthSusProcedures.code)).limit(20);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível pesquisar o catálogo SUS." }, { status: 500 });
  }
}
