"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { cancelTreatmentAuthorizationAction } from "./actions";

export function CancellationForm({ reportId, requirePassword }: { reportId: string; requirePassword: boolean }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), [error, setError] = useState("");
  return <form className="space-y-2 rounded border bg-white p-3 text-sm" onSubmit={event => {
    event.preventDefault(); const form = event.currentTarget, data = new FormData(form); setError("");
    startTransition(async () => {
      try {
        let reauthenticationToken: string | null = null;
        if (requirePassword) {
          const user = auth.currentUser;
          if (!user?.email) throw new Error("Entre novamente com sua conta para confirmar o cancelamento.");
          await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, String(data.get("password") || "")));
          reauthenticationToken = await user.getIdToken(true);
        }
        const result = await cancelTreatmentAuthorizationAction({ reportId, reason: String(data.get("reason") || ""), reauthenticationToken });
        if (result.error) setError(result.error); else form.reset();
        router.refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível confirmar o cancelamento."); }
    });
  }}><h2 className="font-semibold">Cancelar autorização</h2><label className="block">Motivo<textarea name="reason" required minLength={3} disabled={pending} className="w-full rounded border p-2"/></label>{requirePassword && <label className="block">Confirme sua senha<input name="password" type="password" autoComplete="current-password" required disabled={pending} className="w-full rounded border p-2"/></label>}{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={pending} className="rounded border border-red-300 p-2 text-red-800">{pending ? "Confirmando…" : "Cancelar e preservar numeração consumida"}</button></form>;
}
