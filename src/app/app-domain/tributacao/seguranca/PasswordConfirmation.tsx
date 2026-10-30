"use client";
import { useState } from "react";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { confirmTaxPassword } from "./actions";
export function PasswordConfirmation() {
 const [password,setPassword]=useState(""); const [notice,setNotice]=useState(""); const [pending,setPending]=useState(false);
 return <form className="flex flex-wrap items-center gap-2 text-xs" onSubmit={async event=>{event.preventDefault();setPending(true);setNotice("");try{const user=auth.currentUser;if(!user?.email)throw new Error("Entre novamente no sistema para confirmar sua senha.");await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password));const result=await confirmTaxPassword(await user.getIdToken(true));if(result.error)throw new Error(result.error);setNotice("Senha confirmada por 60 segundos para uma única manutenção.");setPassword("");}catch(error){setNotice(error instanceof Error?error.message:"Falha na confirmação.");}finally{setPending(false);}}}><label>Confirmar senha<input aria-label="Senha para confirmar manutenção tributária" autoComplete="current-password" type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="mx-2 rounded border p-1"/></label><button disabled={pending} className="rounded border px-2 py-1">{pending?"Confirmando…":"Confirmar"}</button><span role="status">{notice}</span></form>;
}
