"use client";
import { ModuleShell, type ModuleNavGroup } from "@/components/app-ui/erp/ModuleShell";
import { structureConfig, structureKinds } from "@/lib/cemeteries/structure-config";
import { usePathname, useSearchParams } from "next/navigation";
import { useOptionalOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";

const navigation: ModuleNavGroup[] = [
  { title: "Estrutura", items: structureKinds.filter(k => !["LOTE", "SEPULTURA"].includes(k)).map(k => ({ title: structureConfig[k].title, href: `/cemiterios/estrutura?tipo=${k}`, icon: "building2", query: { key: "tipo", values: [k] } })) },
  { title: "Ocupação", items: ["LOTE", "SEPULTURA"].map(k => ({ title: k === "LOTE" ? "Lotes" : "Sepulturas / Lóculos", href: `/cemiterios/ocupacao?tipo=${k}`, icon: "mapPin", query: { key: "tipo", values: [k] } })) },
  { title: "Atendimento", items: [{ title: "Processos funerários", href: "/cemiterios/processos", icon: "calendarClock" }, { title: "Transferências", href: "/cemiterios/transferencias", icon: "arrowRightLeft" }] },
  { title: "Tributário e análises", items: [{ title: "Taxas e guias", href: "/cemiterios/taxas", icon: "receiptText" }, { title: "Consulta unificada", href: "/cemiterios/consulta", icon: "search" }, { title: "Relatório de sepultados", href: "/cemiterios/relatorio", icon: "barChart3" }] },
];
export default function CemeteryLayout({ children }: { children: React.ReactNode }) {
  const search = useSearchParams();
  const path = usePathname();
  const workspace = useOptionalOperationalWorkspace();
  const cemeteryId = search.get("cemeteryId") || search.get("cemetery");
  const scopedNavigation = navigation.map(group => ({ ...group, items: group.items.map(item => ({ ...item, href: cemeteryId ? `${item.href}${item.href.includes("?") ? "&" : "?"}cemeteryId=${encodeURIComponent(cemeteryId)}` : item.href })) }));
  if (workspace) return children;
  if (path.startsWith("/cemiterios/comprovante/") || path === "/cemiterios/relatorio" || path.startsWith("/cemiterios/taxas/guias/")) return <div className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">{children}</div>;
  return <ModuleShell moduleTitle="Cemitérios" moduleCaption="Gestão funerária municipal" moduleIcon="building2" navigation={scopedNavigation}><div className="min-h-0 flex-1 overflow-y-auto">{children}</div></ModuleShell>;
}
