import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { followupContractNameSchema, followupJsonSchema, followupSchemaVersion } from "@/lib/saude/followup-contract";
export async function GET(_request: Request, { params }: { params: Promise<{ contract: string }> }) {
  await getTenantContextForModule("SAUDE");
  const contract = followupContractNameSchema.parse(decodeURIComponent((await params).contract));
  return Response.json({ contract, schemaVersion: followupSchemaVersion, ...followupJsonSchema(contract) }, { headers: { "Cache-Control": "private, no-store" } });
}
