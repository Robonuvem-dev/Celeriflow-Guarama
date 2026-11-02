"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordRecoveryForm() {
  const search = useSearchParams(), token = search.get("token"), register = search.get("cadastro") === "1";
  const [pending, setPending] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true); setMessage(""); setError("");
    try {
      if (token && form.get("password") !== form.get("confirmation")) throw new Error("As senhas devem ser iguais.");
      const body = token ? { operation: "redeem", token, password: form.get("password") } : { operation: "request", purpose: register ? "REGISTER" : "RESET", cpf: form.get("cpf"), email: form.get("email"), registration: form.get("registration"), birthDate: form.get("birthDate"), rg: form.get("rg") };
      const response = await fetch("/api/auth/portal-servidor/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir.");
      setMessage(result.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Não foi possível concluir."); }
    finally { setPending(false); }
  }
  return <section className="w-full max-w-md rounded-lg border border-slate-300 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-sky-700">Portal do Servidor</p><h1 className="mt-2 text-xl font-bold">{token ? "Definir senha" : register ? "Solicitar criação de acesso" : "Recuperar senha"}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{token ? "O link é individual, de uso único e expira em 24 horas. Use ao menos 12 caracteres, com maiúscula, minúscula, número e símbolo." : "Informe seus dados e RG já cadastrados no RH. O acesso precisa estar previamente autorizado. O link será enviado somente ao e-mail funcional correspondente e terá validade de 24 horas."}</p><form onSubmit={submit} className="mt-5 space-y-3">{token ? <><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/><Label htmlFor="confirm-password">Confirme a nova senha</Label><Input id="confirm-password" name="confirmation" type="password" minLength={12} maxLength={128} autoComplete="new-password" required/></> : <>{[{ name: "cpf", label: "CPF", type: "text", max: 14 }, { name: "registration", label: "Matrícula", type: "text", max: 80 }, { name: "birthDate", label: "Nascimento", type: "date", max: 10 }, { name: "rg", label: "RG cadastrado", type: "text", max: 40 }, { name: "email", label: "E-mail funcional cadastrado", type: "email", max: 254 }].map(field => <div className="space-y-1" key={field.name}><Label htmlFor={`access-${field.name}`}>{field.label}</Label><Input id={`access-${field.name}`} name={field.name} type={field.type} maxLength={field.max} required/></div>)}</>}<Button type="submit" disabled={pending} className="w-full">{pending ? "Aguarde…" : token ? "Salvar senha" : "Solicitar link"}</Button></form>{message && <p role="status" className="mt-4 text-sm text-emerald-800">{message}</p>}{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}<Link href="/portal-servidor/entrar" className="mt-5 inline-flex text-sm font-semibold text-sky-800 hover:underline">Voltar ao login</Link></section>;
}
