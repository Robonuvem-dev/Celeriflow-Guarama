"use client";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export function CitizenPasswordRecovery() {
  const [message, setMessage] = useState(""), [pending, setPending] = useState(false);
  return <form className="space-y-4 rounded-xl border p-5" onSubmit={async (event) => { event.preventDefault(); setPending(true); const form = new FormData(event.currentTarget); try { await sendPasswordResetEmail(auth, String(form.get("email")), { url: `${location.origin}/portal/entrar` }); } catch {} finally { setMessage("Se houver uma conta elegível, você receberá as instruções no e-mail informado."); setPending(false); } }}><label className="block text-sm font-semibold">E-mail<input name="email" type="email" required autoComplete="email" className="mt-2 w-full rounded border p-3" /></label><button disabled={pending} className="rounded bg-emerald-700 px-5 py-2 text-sm font-semibold text-white">Enviar instruções</button><p role="status" className="text-sm leading-6">{message}</p></form>;
}
