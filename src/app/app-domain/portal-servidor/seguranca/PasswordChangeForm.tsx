"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordChangeForm({ email, firebaseUid, returnTo = "/portal-servidor/entrar" }: { email: string; firebaseUid: string; returnTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const employeePortal = returnTo.startsWith("/portal-servidor");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== data.get("confirmation")) { setError("A confirmação deve ser igual à nova senha."); return; }
    setPending(true); setError("");
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== firebaseUid) throw new Error("Entre novamente com sua conta funcional para atualizar a senha.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, String(data.get("currentPassword"))));
      if (employeePortal) {
        const activity = await fetch("/api/auth/portal-servidor/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await user.getIdToken(true), password }) });
        if (!activity.ok) throw new Error((await activity.json()).error || "Não foi possível concluir a alteração.");
      } else {
        await updatePassword(user, password);
        const logout = await fetch("/api/auth/session/logout", { method: "POST" });
        if (!logout.ok) throw new Error("A senha foi alterada, mas não foi possível encerrar a sessão. Utilize Sair antes de entrar novamente.");
      }
      await signOut(auth);
      router.replace(returnTo); router.refresh();
    } catch (failure) {
      setError(failure instanceof Error && !failure.message.startsWith("Firebase:") ? failure.message : "Não foi possível atualizar a senha. Confira a senha atual e a política de senha da sua conta.");
    } finally { setPending(false); }
  }
  return <form onSubmit={submit} className="grid max-w-lg gap-3 rounded border border-slate-300 bg-white p-4 text-sm"><p className="text-xs text-slate-600">Após a alteração, entre novamente com a nova senha.{employeePortal ? " Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo." : ""}</p><Label htmlFor="employee-current-password">Senha atual</Label><Input id="employee-current-password" name="currentPassword" type="password" autoComplete="current-password" required /><Label htmlFor="employee-new-password">Nova senha</Label><Input id="employee-new-password" name="password" type="password" autoComplete="new-password" minLength={employeePortal ? 12 : 6} required /><Label htmlFor="employee-confirm-password">Confirme a nova senha</Label><Input id="employee-confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={employeePortal ? 12 : 6} required /><Button type="submit" disabled={pending} className="w-fit">{pending ? "Atualizando…" : "Atualizar senha"}</Button>{error && <p role="alert" className="text-xs text-red-700">{error}</p>}</form>;
}
