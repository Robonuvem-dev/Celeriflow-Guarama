"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordRecoveryForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") || "").trim();
    setPending(true); setMessage(""); setError("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Se houver uma conta para este e-mail, você receberá as orientações de recuperação. Confira também sua caixa de spam.");
    } catch (failure) {
      const code = (failure as { code?: string }).code;
      if (code === "auth/user-not-found") setMessage("Se houver uma conta para este e-mail, você receberá as orientações de recuperação. Confira também sua caixa de spam.");
      else setError(code === "auth/too-many-requests" ? "Aguarde antes de solicitar novamente." : "Não foi possível solicitar a recuperação. Confira o e-mail e tente novamente.");
    } finally { setPending(false); }
  }
  return <section className="w-full max-w-md rounded-lg border border-slate-300 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Portal do Servidor</p><h1 className="mt-2 text-xl font-bold">Recuperar senha</h1><p className="mt-2 text-sm leading-6 text-slate-600">Informe o e-mail da sua conta funcional.</p><form onSubmit={submit} className="mt-5 space-y-3"><Label htmlFor="recovery-email">E-mail</Label><Input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} /><Button type="submit" disabled={pending} className="w-full">{pending ? "Enviando…" : "Enviar orientações"}</Button></form>{message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<Link href="/portal-servidor/entrar" className="mt-5 inline-flex text-sm font-semibold text-sky-800 hover:underline">Voltar ao login</Link></section>;
}
