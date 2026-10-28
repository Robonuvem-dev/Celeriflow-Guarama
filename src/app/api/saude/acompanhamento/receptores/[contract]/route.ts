import { z } from "zod";
import { db } from "@/db/client";
import { PersistenceError } from "@/db/errors";
import { findFollowupBatchReceiver } from "@/db/repositories/platform/health-exports";
import { AccessError, assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { followupContractNameSchema, followupEnvelopeSchema, followupHash } from "@/lib/saude/followup-contract";
import { followupBatchForActor } from "@/lib/saude/followup-exchange-service";
import { processHealthFollowupBatch } from "@/lib/saude/followup-receiver-service";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ contract: string }> }) {
  try {
    const context = await getTenantContextForModuleOperation("SAUDE", "update");
    const database = context.database ?? db;
    const contract = followupContractNameSchema.parse(decodeURIComponent((await params).contract));
    if (Number(request.headers.get("content-length")) > 16 * 1024 * 1024) return Response.json({ error: "A remessa excede 16 MB." }, { status: 413 });
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > 16 * 1024 * 1024) return Response.json({ error: "A remessa excede 16 MB." }, { status: 413 });
    const value: unknown = JSON.parse(body);
    const pointer = z.object({ batchId: z.string().min(1).max(200) }).strict().safeParse(value);
    let batchId: string;
    if (pointer.success) {
      batchId = pointer.data.batchId;
      const metadata = await findFollowupBatchReceiver(database, batchId);
      if (!metadata) return Response.json({ error: "Remessa de origem não localizada." }, { status: 404 });
      assertHealthUnitAccess(context.user, metadata.binding.unitId);
      if (metadata.contractName !== contract) return Response.json({ error: "Remessa incompatível com o contrato desse receptor." }, { status: 400 });
    }
    else {
      const envelope = followupEnvelopeSchema.parse(value); batchId = envelope.batchId;
      const stored = await followupBatchForActor(database, context, batchId);
      if (envelope.contract !== contract || followupHash(value) !== stored.hashSha256) return Response.json({ error: "Conteúdo recebido diverge da remessa de origem. Corrija na origem e gere nova remessa." }, { status: 400 });
    }
    const receipt = await processHealthFollowupBatch(context, batchId, contract);
    return Response.json(receipt, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (cause instanceof AccessError) return Response.json({ error: cause.message }, { status: cause.status });
    if (cause instanceof z.ZodError || cause instanceof SyntaxError) return Response.json({ error: "Requisição fora do esquema e da versão do receptor." }, { status: 400 });
    if (cause instanceof PersistenceError && cause.kind === "not-found") return Response.json({ error: "Remessa de origem não localizada." }, { status: 404 });
    return Response.json({ error: "Processamento do acompanhamento não concluído. Consulte a origem e o histórico da remessa." }, { status: 500 });
  }
}
