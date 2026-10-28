import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { renderCdaPdf } from "@/lib/tributacao/cda-pdf";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionCdaDocument } from "@/db/repositories/tax-actions/documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = taxActionConnection(await getTenantContextForModule("TRIBUTACAO")).db;
  const { debt, institution, versions, events } = await actionCdaDocument(database, id);
  if (!debt?.cdaNumber) return new Response("CDA não encontrada.", { status: 404 });
  const latest = versions[versions.length - 1];
  const pdf = await renderCdaPdf({
    cdaNumber: debt.cdaNumber,
    version: latest?.versionNumber ?? 1,
    annotation: latest?.annotation,
    signatureStatus: latest?.signatureStatus ?? "NAO_ASSINADA",
    debt: { origin: debt.originDebtType, year: debt.year, original: String(debt.originalValueDecimal ?? debt.originalValue), updated: String(debt.updatedValueDecimal ?? debt.updatedValue), status: debt.status, enrolledAt: debt.createdAt.toLocaleDateString("pt-BR") },
    taxpayer: { name: debt.taxpayer.company?.corporateName ?? debt.taxpayer.person?.fullName ?? "-", document: debt.taxpayer.company?.cnpj ?? debt.taxpayer.person?.cpf ?? "-" },
    institution: { name: institution?.name ?? institution?.legalName ?? "Município não configurado", cnpj: institution?.cnpj ?? "", city: institution?.city ?? "", state: institution?.state ?? "" },
    versions: versions.map((v) => ({ version: v.versionNumber, createdAt: v.createdAt.toLocaleString("pt-BR"), signature: v.signatureStatus })),
    events: events.map((e) => `${e.eventType}: ${e.description}`),
  });
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="cda-${debt.cdaNumber}.pdf"`, "cache-control": "private, no-store" } });
}
