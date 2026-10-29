"use client";

import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export const taxDraftInput = "h-6 w-full min-w-0 rounded border px-1 text-[13px] leading-5";

/** The draft belongs to the caller, including while this editor/panel is closed. */
export function TaxDraftText({ label, value, onChange, maxLength }: { label: string; value: string; onChange: (value: string) => void; maxLength?: number }) {
  return <Dialog>
    <DialogTrigger render={<button type="button" className="flex h-6 w-full min-w-0 items-center gap-1 text-left text-[13px]" aria-label={`Editar ${label} completo`} />}>
      <span className="min-w-0 flex-1 truncate">{value || "Não informado"}</span><span className="shrink-0 underline">Editar</span>
    </DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
      <textarea aria-label={label} value={value} maxLength={maxLength} onChange={event => onChange(event.target.value)} rows={6} className="w-full resize-none rounded border p-2 text-[13px]" />
      <DialogClose render={<button type="button" className="h-7 rounded border px-2 text-[13px]" />}>Concluir edição</DialogClose>
    </DialogContent>
  </Dialog>;
}
