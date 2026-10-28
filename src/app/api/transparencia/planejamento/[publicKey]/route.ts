import { db } from "@/db/client";
import { publicPlanningPublicationResponse } from "@/lib/transparencia/planning-publications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ publicKey: string }> }) { return publicPlanningPublicationResponse(db, (await params).publicKey); }
