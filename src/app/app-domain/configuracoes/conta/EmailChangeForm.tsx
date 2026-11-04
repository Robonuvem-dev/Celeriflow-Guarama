"use client";
import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { changeOwnEmail } from "./actions";

export function EmailChangeForm({ email, firebaseUid }: { email: string; firebaseUid: string }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  return <form className="grid max-w-lg gap-3 rounded border p-4" onSubmit={async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setMessage("");
    const nextEmail = String(data.get("email") || "").trim(), password = String(data.get("password") || "");
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== firebaseUid) throw new Error("Entre novamente para alterar o e-mail.");
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, password));
      const result = await changeOwnEmail(nextEmail, await user.getIdToken(true));
      if (result.error) throw new Error(result.error);
      await fetch("/api/auth/session/logout", { method: "POST" });
      await signOut(auth);
      const credential = await signInWithEmailAndPassword(auth, nextEmail, password);
      await sendEmailVerification(credential.user); await signOut(auth);
      setMessage("E-mail alterado. Confirme o novo endereço pelo e-mail enviado e entre novamente.");
    } catch (error) { setMessage(error instanceof Error && !error.message.startsWith("Firebase:") ? error.message : "Não foi possível concluir. Se o e-mail já foi alterado, entre com o novo endereço e solicite sua verificação."); }
    finally { setPending(false); }
  }}><h2 className="font-semibold">Alterar meu e-mail</h2><p className="text-sm">O novo endereço precisa ser verificado antes do próximo acesso.</p><label>Novo e-mail<input name="email" type="email" required className="block w-full rounded border p-2" /></label><label>Senha atual<input name="password" type="password" required autoComplete="current-password" className="block w-full rounded border p-2" /></label><button disabled={pending} className="rounded border p-2">{pending ? "Atualizando…" : "Alterar e-mail"}</button><p role="status">{message}</p></form>;
}
