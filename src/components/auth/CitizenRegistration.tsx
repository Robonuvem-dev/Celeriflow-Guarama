"use client";
import { useState } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export function CitizenRegistration() {
  const [message, setMessage] = useState(""), [pending, setPending] = useState(false);
  return <form className="space-y-4 rounded-xl border bg-white p-6" onSubmit={async (event) => {
    event.preventDefault(); setPending(true); setMessage(""); const form = new FormData(event.currentTarget);
    try {
      const mode = String(form.get("mode")), email = String(form.get("email") || ""), password = String(form.get("password") || "");
      const credential = mode === "google" ? await signInWithPopup(auth, new GoogleAuthProvider()) : mode === "new" ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) { await sendEmailVerification(credential.user); setMessage("Enviamos a verificação do e-mail. Confirme o endereço e retorne selecionando “Já tenho conta” para solicitar acesso."); return; }
      const response = await fetch("/api/portal/acesso", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await credential.user.getIdToken(), document: String(form.get("document")), ...(mode === "consult" ? { operation: "consultar" } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error); setMessage(`${result.protocolNumber} — ${result.status}${result.reason ? `: ${result.reason}` : ". Aguarde a conferência municipal do vínculo."}`);
    } catch (issue) { setMessage(issue instanceof Error && !issue.message.startsWith("Firebase:") ? issue.message : "Não foi possível autenticar. Confira a conta e tente novamente."); } finally { setPending(false); }
  }}><label className="block text-sm font-semibold">Forma de acesso<select name="mode" className="mt-2 w-full rounded border p-3"><option value="existing">Já tenho conta de e-mail/senha</option><option value="new">Criar conta de e-mail/senha</option><option value="google">Conta Google</option><option value="consult">Consultar solicitação (e-mail/senha)</option></select></label><label className="block text-sm">E-mail<input name="email" type="email" autoComplete="email" className="mt-2 w-full rounded border p-3" /></label><label className="block text-sm">Senha<input name="password" type="password" minLength={6} autoComplete="current-password" className="mt-2 w-full rounded border p-3" /></label><label className="block text-sm">CPF/CNPJ para conferência<input name="document" maxLength={18} className="mt-2 w-full rounded border p-3" /></label><p className="text-xs leading-6 text-slate-600">Informar CPF/CNPJ não libera dados. O município confere o vínculo e decide a autorização. A solicitação não cria permissões administrativas.</p><button disabled={pending} className="rounded bg-emerald-700 px-5 py-3 text-sm font-semibold text-white">{pending ? "Aguarde…" : "Continuar"}</button><p role="status" className="whitespace-pre-wrap text-sm leading-6">{message}</p></form>;
}
