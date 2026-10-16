import Link from "next/link";
import type { ReactNode } from "react";

export function EquipmentNav() {
  return <nav aria-label="Equipamentos SST" className="flex flex-wrap gap-4 text-sm print:hidden"><Link className="underline" href="/sst/equipamentos">Catálogo EPI/EPC</Link><Link className="underline" href="/sst/equipamentos/entregas">Entregas e revisões</Link><Link className="underline" href="/sst/equipamentos/relatorios">Tempo de uso</Link><Link className="underline" href="/sst/equipamentos/necessidades">Necessidades PGR</Link></nav>;
}
export function EquipmentField({label,children}:{label:string;children:ReactNode}) { return <label className="grid min-w-0 gap-1">{label}{children}</label>; }
export const equipmentControl="min-w-0 w-full rounded border bg-transparent p-2";
export function equipmentDate(date:Date|null, civil = false) { return date?.toLocaleDateString("pt-BR",{timeZone:civil ? "UTC" : "America/Sao_Paulo"}) || "—"; }
