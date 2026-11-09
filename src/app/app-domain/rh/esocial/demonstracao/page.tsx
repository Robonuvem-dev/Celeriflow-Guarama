import { redirect } from "next/navigation";

/** Compatibility URL; all demonstrations use the same console and service. */
export default async function EsocialDemoPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const p = await searchParams;
  const tabs: Record<string,string> = { visao:'geral', configuracao:'auditoria', historico:'auditoria' };
  redirect('/rh/esocial?' + new URLSearchParams({ competencia:p.period || '2026-10', tab:tabs[p.tab || ''] || p.tab || 'retornos', ...(p.employerId ? {employerId:p.employerId} : {}), ...(p.error ? {error:p.error} : {}), ...(p.notice ? {notice:p.notice} : {}) }));
}
