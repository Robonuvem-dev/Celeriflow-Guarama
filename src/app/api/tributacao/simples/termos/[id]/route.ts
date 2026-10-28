import PDFDocument from "pdfkit";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { simplesOptionLayoutSchema } from "@/lib/tributacao/simples-option-files";
import { taxActionConnection } from "@/db/repositories/tax-actions/context";
import { actionRegistryEntry, latestActionRegistryEntry, firstActionRegistryEntry } from "@/db/repositories/tax-actions/registry";
import { actionActorName } from "@/db/repositories/tax-actions/documents";
import { readEconomicOrigin } from "@/db/repositories/tax-economic/registrations";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const { id } = await params;
    const database = taxActionConnection(context).db;
    const decision = await actionRegistryEntry(database, id);
    if (!decision || decision.entityType !== "SIMPLES_OPTION_COMPANY" || decision.category !== "SIMPLES_OPTION_DECISION") throw new Error("Termo não encontrado.");
    const data = taxScopeSnapshot(decision.data);
    if (!isSystemAdministrator(user) && !user.allowedBudgetUnitIds.includes(String(data.budgetUnitId))) throw new Error("Termo fora da UG autorizada.");
    const binding = await readEconomicOrigin(database, String(data.governmentEntityId), String(data.budgetUnitId));
    if (!binding) throw new Error("Origem do termo não conciliada.");
    const latest = await latestActionRegistryEntry(database, decision.entityType, decision.entityId, decision.category);
    if (latest?.id !== decision.id) throw new Error("Decisão substituída. Emita o termo da versão atual.");
    const source = await firstActionRegistryEntry(database, "SIMPLES_OPTION_FILE", String(data.fileId), "SIMPLES_OPTION_FILE");
    if (!source) throw new Error("Arquivo de origem não encontrado.");
    const original = taxScopeSnapshot(source.data); const company = Array.isArray(original.rows) ? original.rows.find(row => taxScopeSnapshot(row).cnpj === data.cnpj) : undefined;
    if (!company) throw new Error("Empresa não encontrada no arquivo de origem.");
    const snapshot = taxScopeSnapshot(company); const layout = simplesOptionLayoutSchema.parse(data.layout);
    const actor = decision.actorUsuarioId ? await actionActorName(database, decision.actorUsuarioId) : null;
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const title = data.approved === true ? layout.approvalTitle : layout.refusalTitle;
      const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: title, Author: binding.governmentEntity.name } }); const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on("error", reject);
      const text = (value: string, bold = false) => { if (doc.y > 730) doc.addPage(); doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(11).text(value, { paragraphGap: 12 }); };
      text(binding.governmentEntity.name, true); text(`UG ${binding.budgetUnit.code}`); text(title, true);
      text(`Empresa: ${String(snapshot.name)}\nCNPJ: ${String(data.cnpj)}\nArquivo de origem: ${String(original.filename)}`);
      text(layout.termText); text(`Decisão municipal: ${data.approved === true ? "DEFERIDA" : "INDEFERIDA"}`, true); text(`Fundamento da decisão: ${String(data.reason)}`); text(`Fundamento legal: ${layout.legalBasis}`);
      text(`Pendências na posição analisada: ${Array.isArray(snapshot.pending) ? snapshot.pending.map(String).join(", ") || "Nenhuma" : "—"}\nSaldo: R$ ${String(snapshot.balance)}`);
      text(`Decisão registrada por ${actor?.nome ?? "Operador"} em ${decision.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Versão ${decision.version}. Referência ${decision.id}.`);
      text("Este termo registra a decisão municipal. O processamento e a efetivação perante a Receita Federal seguem o intercâmbio aplicável."); doc.end();
    });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="termo-simples-${String(data.cnpj)}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Termo indisponível." }, { status: 403, headers: { "Cache-Control": "private, no-store" } }); }
}
