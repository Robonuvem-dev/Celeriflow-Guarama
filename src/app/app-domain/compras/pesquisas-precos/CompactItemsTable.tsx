"use client";

import { ComprasPanelTable } from "../_components/ComprasPanelTable";
import { comprasColumn } from "../_components/columns";

export type PriceResearchItemRow = { id: string; name: string; unit: string; quantity: number };
type CompactItemsTableProps = { items: PriceResearchItemRow[]; title: string; description?: string; className?: string; printAll?: boolean };
const quantity = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const columns = [comprasColumn("name", "Item", 160, 600, "identifier"), comprasColumn("unit", "Unidade", 70, 100), comprasColumn("quantity", "Quantidade", 90, 140, "text", "right")];

export function CompactItemsTable({ items, title, description, printAll = false }: CompactItemsTableProps) {
  return <section className="rounded-md border bg-white p-3 print:border-0 print:p-0">
    <div className="print:hidden"><ComprasPanelTable title={title} description={description} columns={columns} preferenceId="compras-pesquisa-itens"
      rows={items.map((item) => ({ id: item.id, label: item.name, values: { name: item.name, unit: item.unit, quantity: quantity.format(item.quantity) } }))} /></div>
    {printAll && <div className="hidden print:block">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <table className="w-full border-collapse text-left text-xs"><thead><tr><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5">Unidade</th><th className="px-2 py-1.5 text-right">Quantidade</th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id} className="border-b"><td className="px-2 py-1.5">{item.name}</td><td className="px-2 py-1.5">{item.unit}</td><td className="px-2 py-1.5 text-right">{quantity.format(item.quantity)}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
