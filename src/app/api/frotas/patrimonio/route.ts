import { NextResponse } from "next/server";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { fleetScope } from "@/lib/frotas/service";
import { fleetDatabase } from "@/db/repositories/fleet/records";
import { fleetAssetReference } from "@/db/repositories/fleet/page-data";

export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("FROTAS"), scope = fleetScope(context);
    if (!scope.canReadAssets) throw new AccessError("Seu perfil não permite consultar Patrimônio.", 403);
    const assetId = new URL(request.url).searchParams.get("assetId") || "";
    if (!assetId || assetId.length > 100) return NextResponse.json({ error: "Bem inválido." }, { status: 400 });
    const asset = await fleetAssetReference(fleetDatabase(context), scope, assetId);
    if (!asset?.departmentId) return NextResponse.json({ error: "Bem não encontrado, baixado, inativo, sem setor ou fora do seu acesso." }, { status: 404 });
    return NextResponse.json({ asset }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível consultar o bem." }, { status: error instanceof AccessError ? error.status : 500 });
  }
}
