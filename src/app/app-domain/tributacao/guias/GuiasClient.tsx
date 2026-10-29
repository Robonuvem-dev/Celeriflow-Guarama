"use client";

import { useState } from "react";
import { DollarSign, Trash2 } from "lucide-react";
import { payGuide, cancelGuide } from "./actions";
import { TaxOperationalTable } from "../TaxOperationalTable";

type Guide = {
  id: string; barcode: string | null; guideNumber?: string | null; totalValue: number;
  outstandingValue: number; dueDate: Date; status: string;
  assessment: { year: number; tax: { name: string }; taxpayer: {
    person: { fullName: string; cpf: string | null } | null;
    company: { corporateName: string; cnpj: string } | null;
  } };
};

export default function GuiasClient({ guias }: { guias: Guide[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const filtered = guias.filter(guia => {
    const term = searchTerm.toLowerCase();
    return (guia.guideNumber || guia.barcode || "").toLowerCase().includes(term)
      || guia.assessment.tax.name.toLowerCase().includes(term)
      || (guia.assessment.taxpayer.company?.corporateName || guia.assessment.taxpayer.person?.fullName || "").toLowerCase().includes(term);
  });
  async function handlePay(id: string, amount: number) {
    if (!confirm("Confirmar baixa manual desta guia?")) return;
    try { await payGuide(id, amount); }
    catch (err) { console.error(err); alert("Erro ao realizar baixa manual."); }
  }
  async function handleCancel(id: string) {
    if (!confirm("Confirmar o cancelamento desta guia?")) return;
    try { await cancelGuide(id); }
    catch (err) { console.error(err); alert("Erro ao cancelar guia."); }
  }
  return <TaxOperationalTable resetKey={searchTerm} id="guias" emptyMessage="Nenhuma guia de arrecadação encontrada."
    toolbar={<input aria-label="Buscar guia" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Código de barras, tributo ou contribuinte" className="h-7 min-w-0 flex-1 rounded border px-2 text-[13px]" />}
    columns={[["code", "Guia / código de barras", 130, 180, "identifier"], ["tax", "Tributo", 100, 160], ["year", "Exercício", 75, 80], ["name", "Contribuinte", 140, 220], ["due", "Vencimento", 95, 105], ["total", "Valor total", 110, 125, "text", "right"], ["status", "Status", 85, 100, "status"], ["actions", "Ações", 80, 80, "actions"]]}
    rows={filtered.map(guia => ({ id: guia.id, label: guia.guideNumber || guia.barcode || guia.id,
      values: { code: guia.guideNumber || guia.barcode || "—", tax: guia.assessment.tax.name, year: String(guia.assessment.year), name: guia.assessment.taxpayer.company?.corporateName || guia.assessment.taxpayer.person?.fullName || "Não Identificado", due: new Date(guia.dueDate).toLocaleDateString("pt-BR"), total: new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(guia.totalValue), status: guia.status },
      actions: ["Emitida", "Parcial"].includes(guia.status) ? <div className="flex items-center justify-end gap-2"><button onClick={() => handlePay(guia.id, guia.outstandingValue)} aria-label={`Baixa manual da guia ${guia.guideNumber || guia.id}`} title="Baixa manual"><DollarSign className="size-4" /></button><button onClick={() => handleCancel(guia.id)} aria-label={`Cancelar guia ${guia.guideNumber || guia.id}`} title="Cancelar guia"><Trash2 className="size-4" /></button></div> : null,
    }))} />;
}
