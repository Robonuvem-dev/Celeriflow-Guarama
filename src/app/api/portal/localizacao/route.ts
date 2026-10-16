import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { digitalServiceSchema, validateMunicipalLocation } from "@/lib/portal-cidadao/services-policy";
import { checkRateLimit } from "@/lib/platform/rate-limit";
import { portalApiError } from "@/lib/portal-cidadao/api-access";

export async function GET(request: Request) {
  try {
    if (!checkRateLimit(`portal-geocode:${request.headers.get("x-forwarded-for") || "local"}`).allowed) return Response.json({ error: "Aguarde antes de selecionar outro ponto." }, { status: 429 });
    const input = z.object({ serviceId: z.string().min(1), latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180) }).parse(Object.fromEntries(new URL(request.url).searchParams));
    const service = await prisma.portalServiceConfiguration.findFirst({ where: { id: input.serviceId, published: true, provider: "MANUTENCAO" }, select: { configuration: true } });
    if (!service) throw new Error("Serviço indisponível.");
    validateMunicipalLocation(digitalServiceSchema.parse(service.configuration), input.latitude, input.longitude);
    const url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({ format: "jsonv2", lat: String(input.latitude), lon: String(input.longitude), "accept-language": "pt-BR" })}`;
    const response = await fetch(url, { headers: { "User-Agent": "CeleriFlow-Municipal-Services" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Endereço não localizado. Preencha manualmente.");
    const data = await response.json(); if (typeof data.display_name !== "string") throw new Error("Endereço não localizado. Preencha manualmente.");
    return Response.json({ address: data.display_name.slice(0, 1000) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return portalApiError(error); }
}
