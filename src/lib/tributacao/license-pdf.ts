import PDFDocument from "pdfkit";
import type { DatabaseExecutor } from "@/db/transaction";
import { readEconomicLicenseByCode } from "@/db/repositories/tax-economic/licenses";
import { readLicenseIssuance } from "@/db/repositories/tax-economic/registry";
import { readEconomicOrigin } from "@/db/repositories/tax-economic/registrations";
import { taxScopeSnapshot } from "./scope";

export async function renderConfiguredLicensePdf(db: DatabaseExecutor, code: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code)) throw new Error("Código inválido.");
  const license = await readEconomicLicenseByCode(db, code);
  const entry = await readLicenseIssuance(db, license.id);
  const data = taxScopeSnapshot(entry.data); if (data.authCode !== code) throw new Error("Emissão não conciliada.");
  const binding = typeof data.budgetUnitId === "string" ? await readEconomicOrigin(db, String(data.governmentEntityId), data.budgetUnitId) : null;
  const valid = license.status === "Emitido" && license.validUntil !== null && license.validUntil >= new Date();
  return new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: String(data.layoutTitle), Author: binding?.governmentEntity.name ?? "Administração municipal" } });
    const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on("error", reject);
    const text = (value: string, bold = false) => { if (doc.y > 735) doc.addPage(); doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).text(value, { paragraphGap: 9 }); };
    text(binding?.governmentEntity.name ?? "Administração municipal", true);
    if (binding) text(`UG ${binding.budgetUnit.code}`);
    doc.font("Helvetica-Bold").fontSize(18).text(String(data.layoutTitle), { paragraphGap: 16 });
    text(valid ? "EMISSÃO REGISTRADA E VIGENTE" : `SEM VIGÊNCIA — ${license.status === "Emitido" ? "Vencido" : license.status}`, true);
    text(`Titular: ${String(data.taxpayerName)}\nInscrição: ${String(data.inscription)}\nTipo: ${license.licenseType} · Exercício ${String(data.year)}`);
    text(`Emissão: ${license.issueDate?.toLocaleDateString("pt-BR", { timeZone: "UTC" }) ?? "—"} · Validade: ${license.validUntil?.toLocaleDateString("pt-BR", { timeZone: "UTC" }) ?? "—"}`);
    text(String(data.layoutText));
    const fields = taxScopeSnapshot(data.values);
    const event = taxScopeSnapshot(data.event);
    const definitions = Array.isArray(event.fields) ? event.fields : [];
    if (Object.keys(fields).length) {
      text("Informações adicionais", true);
      for (const [key, value] of Object.entries(fields)) {
        const definition = definitions.find(item => taxScopeSnapshot(item).key === key);
        const label = definition ? String(taxScopeSnapshot(definition).label) : key;
        text(`${label}: ${typeof value === "boolean" ? value ? "Sim" : "Não" : value === null ? "Não informado" : String(value)}`);
      }
    }
    text(`Fundamento legal: ${String(data.legalBasis)}`);
    text(`Autenticidade: ${code}`, true);
    text("Consulte a situação atual deste documento no endereço /validar-alvara/ seguido do código de autenticidade. A situação pode ser alterada por vencimento, suspensão ou cancelamento.");
    doc.end();
  });
}
