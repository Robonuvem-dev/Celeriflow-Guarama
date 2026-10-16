"use client";
import { useEffect, useRef } from "react";

export function ServiceNoticePopup({ notice }: { notice: { id: string; title: string; text: string } }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { try { if (!sessionStorage.getItem(`portal-service-notice:${notice.id}`)) ref.current?.showModal(); } catch { ref.current?.showModal(); } }, [notice.id]);
  return <dialog ref={ref} className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg overflow-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/40" aria-labelledby={`service-notice-title-${notice.id}`} onClose={() => { try { sessionStorage.setItem(`portal-service-notice:${notice.id}`, "1"); } catch {} }}><h2 id={`service-notice-title-${notice.id}`} className="text-xl font-bold">{notice.title}</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-600">{notice.text}</p><form method="dialog" className="mt-5"><button className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white">Fechar aviso</button></form></dialog>;
}
