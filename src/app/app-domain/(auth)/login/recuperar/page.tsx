"use client";
import { useState } from "react";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export default function CompletePasswordRecovery() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return <main className="mx-auto max-w-lg space-y-4 p-6"><h1 className="text-xl font-semibold">Concluir recuperação da senha</h1><p>Copie a chave oobCode do link recebido por e-mail. A chave é temporária e utilizada uma única vez.</p><form className="grid gap-3" onSubmit={async event => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setPending(true); setMessage("");
    try {
      const code = String(data.get("code") || "").trim(), password = String(data.get("password") || "");
      if (password !== data.get("confirmation")) throw new Error("As senhas devem ser iguais.");
      await verifyPasswordResetCode(auth, code); await confirmPasswordReset(auth, code, password);
      setMessage("Senha atualizada. Entre novamente com sua nova senha.");
    } catch { setMessage("Não foi possível redefinir a senha. Confira a chave, sua validade e a confirmação da senha."); }
    finally { setPending(false); }
  }}><label>Chave de recuperação<input name="code" required autoComplete="off" className="block w-full rounded border p-2" /></label><label>Nova senha<input name="password" type="password" required minLength={6} autoComplete="new-password" className="block w-full rounded border p-2" /></label><label>Confirmação<input name="confirmation" type="password" required minLength={6} autoComplete="new-password" className="block w-full rounded border p-2" /></label><button disabled={pending} className="rounded border p-2">{pending ? "Atualizando…" : "Atualizar senha"}</button></form><p role="status">{message}</p><a href="/login" className="underline">Voltar ao login</a></main>;
}
