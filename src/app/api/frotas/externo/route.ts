import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isSameOriginRequest } from "@/lib/transparencia/request-origin";
import { submitFleetExternal, throttleFleetExternal } from "@/lib/frotas/control-external";
import { FleetControlError } from "@/lib/frotas/control-access";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    const source = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unresolved";
    await throttleFleetExternal(prisma, createHash("sha256").update(`FLEET_SOURCE:${source}`).digest("hex"));
    const body = await request.json(); await throttleFleetExternal(prisma, createHash("sha256").update(`FLEET_CODE:${String(body.code || "").toUpperCase()}`).digest("hex"));
    return Response.json(await submitFleetExternal(prisma, body), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof FleetControlError ? error.message : "Não foi possível registrar. Confira os dados de conferência." }, { status: 400, headers: { "Cache-Control": "private, no-store" } }); }
}
