"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { administerMedicationAction } from "./actions";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { healthColumn } from "../../../operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";
import {
  administrationSuppliesPayload,
  validateAdministrationSupplies,
  type AdministrationSupplyDraft,
  type AdministrationSupplyIssue,
} from "./administration-supplies";

const field = "h-9 min-w-0 rounded border bg-white px-2 text-sm";
type Option = { id: string; name: string };

export function AdministrationForm({ medicalRecordId, medicines, warehouses, materials }: { medicalRecordId: string; medicines: Option[]; warehouses: Option[]; materials: Option[] }) {
  const formId = useId();
  const nextSupplyId = useRef(1);
  const [owned, setOwned] = useState(false);
  const [medicineId, setMedicine] = useState("");
  const [name, setName] = useState("");
  const [supplies, setSupplies] = useState<AdministrationSupplyDraft[]>([]);
  const [page, setPage] = useState(1);
  const [issue, setIssue] = useState<AdministrationSupplyIssue | null>(null);
  const activePage = Math.min(page, Math.max(1, Math.ceil(supplies.length / OPERATIONAL_PAGE_SIZE)));
  const visible = supplies.slice((activePage - 1) * OPERATIONAL_PAGE_SIZE, activePage * OPERATIONAL_PAGE_SIZE);
  const payload = JSON.stringify(administrationSuppliesPayload(supplies));

  function addSupply() {
    const id = `${formId}-supply-${nextSupplyId.current++}`;
    setSupplies(current => [...current, { id, materialId: "", warehouseId: "", batchNumber: "", quantity: "" }]);
    setPage(Math.ceil((supplies.length + 1) / OPERATIONAL_PAGE_SIZE));
  }

  function updateSupply(id: string, key: AdministrationSupplyIssue["field"], value: string) {
    setSupplies(current => current.map(item => item.id === id ? { ...item, [key]: value } : item));
    setIssue(null);
  }

  function removeSupply(id: string) {
    setSupplies(current => current.filter(item => item.id !== id));
    setIssue(null);
  }

  function validateSubmission(event: FormEvent<HTMLFormElement>) {
    const invalid = validateAdministrationSupplies(supplies, new Set(materials.map(item => item.id)), new Set(warehouses.map(item => item.id)));
    setIssue(invalid);
    if (invalid) {
      event.preventDefault();
      setPage(Math.floor(invalid.index / OPERATIONAL_PAGE_SIZE) + 1);
    }
  }

  return <form id={formId} action={administerMedicationAction} onSubmit={validateSubmission} className="mt-3 space-y-2">
    <input type="hidden" name="medicalRecordId" value={medicalRecordId} />
    <input type="hidden" name="materials" value={payload} />
    <div className="grid gap-2 sm:grid-cols-2">
      <select aria-label="Medicamento do catálogo" name="medicineId" value={medicineId} onChange={event => { setMedicine(event.target.value); setName(medicines.find(medicine => medicine.id === event.target.value)?.name || ""); }} className={field}><option value="">Medicamento próprio/livre</option>{medicines.map(medicine => <option key={medicine.id} value={medicine.id}>{medicine.name}</option>)}</select>
      <input aria-label="Nome do medicamento" name="medicineName" required value={name} onChange={event => setName(event.target.value)} placeholder="Nome do medicamento" className={field} />
      <input aria-label="Dose administrada" name="dosage" required placeholder="Dose administrada" className={field} />
      <input aria-label="Quantidade do medicamento" name="quantity" type="number" step="any" min="0.000001" required placeholder="Quantidade" className={field} />
      <input aria-label="Data e hora da administração" name="administeredAt" type="datetime-local" required className={field} />
      <label className="flex items-center gap-2 text-sm"><input name="patientOwned" type="checkbox" checked={owned} onChange={event => setOwned(event.target.checked)} /> Medicamento de propriedade do paciente</label>
      {!owned && <><select aria-label="Estoque do medicamento" name="warehouseId" required className={field}><option value="">Estoque da unidade</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select><input aria-label="Lote do medicamento" name="batchNumber" required placeholder="Lote utilizado" className={field} /></>}
    </div>
    <h3 className="text-sm font-semibold">Materiais utilizados na administração</h3>
    {issue && <p id={`${formId}-supply-error`} role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{issue.message} Abra os materiais na página {Math.floor(issue.index / OPERATIONAL_PAGE_SIZE) + 1} para corrigir. Os demais valores foram preservados.</p>}
    <OperationalTablePanel title="Materiais da administração" triggerLabel={`Editar materiais (${supplies.length})`} description="Produtos, estoques, lotes e quantidades da administração. O rascunho completo permanece no formulário pai ao paginar ou fechar este painel.">
      <OperationalListFrame label="Materiais da administração" toolbar={<span className="min-w-0 truncate text-xs" role="status">{issue?.message || "Os materiais de todas as páginas serão enviados com a administração."}</span>} actions={<button type="button" className={styles.newButton} onClick={addSupply} aria-label="Adicionar material" title="Adicionar material"><Plus aria-hidden="true" /><span className={styles.newLabel}>Adicionar material</span></button>} pagination={<OperationalPagination page={activePage} total={supplies.length} onPageChange={setPage} />}>
        <OperationalTable preferenceId="saude-administracao-materiais" caption="Materiais utilizados na administração" emptyMessage="Nenhum material adicionado." columns={[healthColumn("position", "Item", 65, 55, "text", "right", 85), healthColumn("material", "Produto", 300, 150), healthColumn("warehouse", "Estoque", 240, 130), healthColumn("batch", "Lote", 180, 100), healthColumn("quantity", "Quantidade", 140, 100, "text", "right"), healthColumn("actions", "Ações", 80, 75, "actions", "right", 100)]} rows={visible.map((item, localIndex) => {
          const position = (activePage - 1) * OPERATIONAL_PAGE_SIZE + localIndex + 1;
          const invalid = (key: AdministrationSupplyIssue["field"]) => issue?.id === item.id && issue.field === key;
          return { id: item.id, label: `Material ${position}`, values: { position: String(position), material: materials.find(material => material.id === item.materialId)?.name || "Selecione", warehouse: warehouses.find(warehouse => warehouse.id === item.warehouseId)?.name || "Selecione", batch: item.batchNumber, quantity: item.quantity }, cells: {
            material: <select aria-label={`Produto do material ${position}`} aria-invalid={invalid("materialId")} required value={item.materialId} onChange={event => updateSupply(item.id, "materialId", event.target.value)}><option value="">Material</option>{materials.map(material => <option key={material.id} value={material.id}>{material.name}</option>)}</select>,
            warehouse: <select aria-label={`Estoque do material ${position}`} aria-invalid={invalid("warehouseId")} required value={item.warehouseId} onChange={event => updateSupply(item.id, "warehouseId", event.target.value)}><option value="">Estoque</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select>,
            batch: <input aria-label={`Lote do material ${position}`} aria-invalid={invalid("batchNumber")} required value={item.batchNumber} onChange={event => updateSupply(item.id, "batchNumber", event.target.value)} />,
            quantity: <input aria-label={`Quantidade do material ${position}`} aria-invalid={invalid("quantity")} required type="number" min="0.000001" step="any" value={item.quantity} onChange={event => updateSupply(item.id, "quantity", event.target.value)} />,
          }, actions: <button type="button" className="h-6 rounded border px-1" onClick={() => removeSupply(item.id)} aria-label={`Remover material ${position}`}>Remover</button> };
        })} />
      </OperationalListFrame>
    </OperationalTablePanel>
    <button type="button" onClick={addSupply} className="mr-2 rounded border p-2">Adicionar material</button>
    <button type="submit" className="rounded border p-2">Registrar administração e movimentos de estoque</button>
  </form>;
}
