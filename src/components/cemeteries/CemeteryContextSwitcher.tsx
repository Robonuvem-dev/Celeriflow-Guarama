"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";

type CemeteryItem = { id: string; label: string };

export function CemeteryContextSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentCemeteryId = searchParams.get("cemeteryId") || searchParams.get("cemetery") || "";
  const [cemeteries, setCemeteries] = useState<CemeteryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadCemeteries() {
      try {
        setLoading(true);
        const res = await fetch("/api/cemiterios/referencias?kind=cemetery&page=1");
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data.items)) {
            setCemeteries(data.items);
          }
        }
      } catch {
        // Silencioso se indisponível
      } finally {
        if (active) setLoading(false);
      }
    }
    loadCemeteries();
    return () => {
      active = false;
    };
  }, []);

  function handleSelect(newId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (newId) {
      params.set("cemeteryId", newId);
    } else {
      params.delete("cemeteryId");
      params.delete("cemetery");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 border-b border-slate-200 text-xs text-slate-700">
      <div className="flex items-center gap-1 font-semibold text-slate-800">
        <Building2 className="size-3.5 text-blue-600" />
        <span>Contexto do Cemitério:</span>
      </div>
      <select
        aria-label="Alternar contexto de cemitério"
        value={currentCemeteryId}
        onChange={(e) => handleSelect(e.target.value)}
        className="h-6 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
      >
        <option value="">Todos os Cemitérios (Visão Global)</option>
        {cemeteries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      {loading && <span className="text-[11px] text-slate-400">Carregando unidades...</span>}
      {currentCemeteryId && (
        <button
          type="button"
          onClick={() => handleSelect("")}
          className="text-[11px] text-blue-600 hover:underline"
        >
          Limpar contexto
        </button>
      )}
    </div>
  );
}
