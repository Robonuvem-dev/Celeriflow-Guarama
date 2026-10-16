import PDFDocument from "pdfkit";
import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { healthBillingPreview, healthPatientConsumptionCost } from "./billing-report-service";

export async function healthBillingDocument(context: AppContext, raw: unknown, kind: "PREVIA" | "BPA_C" | "BPA_I" | "CUSTO") {
  const institution = await context.prisma.institution.findFirst();
  const title = { PREVIA: "Prévia de produção e faturamento", BPA_C: "BPA consolidado — impressão de conferência", BPA_I: "BPA individualizado — impressão de conferência", CUSTO: "Custo de consumo assistencial do paciente" }[kind];
  // Complete data is read before starting the PDF stream, so access/validation errors do not leave an open document.
  const preview = kind === "CUSTO" ? null : await healthBillingPreview(context, raw);
  const cost = kind === "CUSTO" ? await healthPatientConsumptionCost(context, raw) : null;
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: title } }), chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(14).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").moveDown().fontSize(15).text(title).fontSize(10);
  const section = (label: string, text: string) => { doc.moveDown(0.3).font("Helvetica-Bold").text(label).font("Helvetica").text(text); };
  if (preview) {
    doc.text(`Competência ${preview.period} · situação ${preview.competenceStatus}`);
    for (const group of preview.groups) section(group.name, `Quantidade ${group.quantity} · validada ${group.validQuantity} · criticada ${group.criticizedQuantity} · pendente ${group.pendingQuantity}\nValor conhecido R$ ${group.knownValue} · total ${group.totalValue !== null ? `R$ ${group.totalValue}` : "Incompleto: existem valores não informados"} · fatos sem valor ${group.unknownValueFacts}`);
    if (kind === "BPA_C") {
      const groups = new Map<string, { label: string; quantity: number; knownValue: Prisma.Decimal; missing: number }>();
      for (const row of preview.rows) {
        const key = `${row.unitId}|${row.billingProviderUnitId}|${row.procedureCode}|${row.cbo}|${row.status}`;
        const group = groups.get(key) || { label: `${row.unit}${row.billingProviderUnit ? ` · prestadora ${row.billingProviderUnit}` : ""} · CNES ${row.cnes || "Não informado"}\n${row.procedureCode || "Sem procedimento"} · ${row.procedure || ""} · CBO ${row.cbo || "Não informado"} · ${row.status}`, quantity: 0, knownValue: new Prisma.Decimal(0), missing: 0 };
        group.quantity += row.quantity; if (row.value === null) group.missing += 1; else group.knownValue = group.knownValue.plus(row.value); groups.set(key, group);
      }
      for (const group of groups.values()) section(group.label, `Quantidade ${group.quantity} · valor conhecido R$ ${group.knownValue.toFixed(2)} · fatos sem valor ${group.missing}`);
    } else {
      for (const row of preview.rows) {
        const unit = `${row.unit}${row.billingProviderUnit ? ` · prestadora ${row.billingProviderUnit}` : ""} · CNES ${row.cnes || "Não informado"}`;
        section(`${row.procedureCode || "Sem procedimento"} · ${row.procedure || row.originType}`, `${new Date(row.occurredAt).toLocaleDateString("pt-BR")} · ${unit}\nProfissional ${row.professional} · CNS ${row.professionalCns || "Não informado"} · CBO ${row.cbo || "Não informado"}\nPaciente ${row.patient || "Não individualizado"} · CNS ${row.patientCns || "Não informado"} · nascimento ${row.birthDate ? new Date(row.birthDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informado"} · sexo ${row.gender || "Não informado"}\nMunicípio ${row.municipality || "Não informado"}/${row.state || ""} · CID ${row.cid || "Não informado"}\nQuantidade ${row.quantity} · valor ${row.value !== null ? `R$ ${row.value}` : "Não informado"} · ${row.status}\nFonte do valor ${row.priceSource}${row.priceTable ? ` · ${row.priceTable}` : ""}\nOrigem ${row.originType}:${row.originId} · fato ${row.id}${row.criticisms.length ? `\nCríticas: ${row.criticisms.join("; ")}` : ""}`);
      }
    }
    if (!preview.rows.length) doc.moveDown().text("Sem produção no recorte autorizado.");
  }
  if (cost) {
    doc.text(`Paciente ${cost.patientName} · competência ${cost.period}`);
    section("Consumo de estoque municipal", `Custo conhecido R$ ${cost.knownCost} · total ${cost.totalCost !== null ? `R$ ${cost.totalCost}` : "Incompleto: existem origens sem custo conciliado"} · pendências ${cost.unknownCosts}`);
    for (const row of cost.rows) section(`${row.material} · ${row.warehouse}`, `Quantidade líquida atribuída ${row.netQuantity} · custo ${row.cost !== null ? `R$ ${row.cost}` : "Não informado"}\nAtribuição ${row.allocation} · movimento ${row.movementId}\n${row.origins.join("; ")}`);
    section("Medicamentos de propriedade do paciente", cost.patientOwnedMedicines.length ? cost.patientOwnedMedicines.join("\n") : "Nenhum registrado no recorte.");
    if (cost.unlinked.length) section("Origens sem conciliação de movimento", cost.unlinked.join("\n"));
    doc.moveDown().text("Diluente compartilhado: rateio por aplicação sobre a capacidade registrada do frasco. Quantidades e custos atribuídos são apresentados com seis casas decimais.");
  }
  doc.moveDown().fontSize(8).text(`Emissão ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id}`); doc.end(); return finished;
}
