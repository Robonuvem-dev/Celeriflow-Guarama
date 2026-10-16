import { prisma } from "@/lib/prisma";
import { publicPlanningPublicationResponse } from "@/lib/planejamento/publication-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ publicKey: string }> }) { return publicPlanningPublicationResponse(prisma, (await params).publicKey); }
