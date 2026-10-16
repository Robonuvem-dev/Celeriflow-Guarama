"use client";

import { useEffect, useState } from "react";

export type ConstructionInspectionCorrection = { inspectionId: string; inspectionTypeId: string; requirementNote: string; originalDeadline: string | null; effectiveDeadline: string | null; correctionSnapshot: unknown; latestExtension: { id: string; reason: string; createdAt: string; previousDeadline: string | null; newDeadline: string } | null };

/** Portal-safe summary: case authorization belongs to the caller; no invented external user/notification. */
export default function ConstructionInspectionRequirements({ requirements, inspectionTypes, nowISO }: { requirements: ConstructionInspectionCorrection[]; inspectionTypes: { id: string; name: string }[]; nowISO: string }) {
  const [now, setNow] = useState(nowISO);
  useEffect(() => { const timer = setInterval(() => setNow(new Date().toISOString()), 30000); return () => clearInterval(timer); }, [nowISO]);
  return <section className="space-y-3"><h2 className="text-xl font-semibold">Exigências de ajuste de vistorias</h2>{!requirements.length && <p>Nenhuma exigência de vistoria pendente.</p>}{requirements.map((requirement) => {
    const expired = !requirement.effectiveDeadline || new Date(now) > new Date(requirement.effectiveDeadline);
    return <article className="space-y-2 rounded border p-3" key={requirement.inspectionId}><h3 className="font-semibold">{inspectionTypes.find((type) => type.id === requirement.inspectionTypeId)?.name || requirement.inspectionTypeId}</h3><p className="whitespace-pre-wrap break-words">{requirement.requirementNote}</p><p>Prazo vigente: {requirement.effectiveDeadline ? new Date(requirement.effectiveDeadline).toLocaleString("pt-BR", { timeZone: "UTC" }) + " UTC" : "Requer regularização do gestor"}</p><p role="status" className={expired ? "text-red-700" : "text-green-700"}>{expired ? "Prazo encerrado ou não regularizado — nova vistoria bloqueada até regularização motivada pelo gestor." : "Prazo aberto — solicite e agende nova vistoria até o vencimento."}</p>{requirement.latestExtension && <p>Última regularização: {requirement.latestExtension.reason} · {new Date(requirement.latestExtension.createdAt).toLocaleString("pt-BR", { timeZone: "UTC" })} UTC</p>}<details><summary>Memória de prazo e configuração aplicada</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify({ originalDeadline: requirement.originalDeadline, effectiveDeadline: requirement.effectiveDeadline, calculation: requirement.correctionSnapshot, latestExtension: requirement.latestExtension }, null, 2)}</pre></details></article>;
  })}</section>;
}
