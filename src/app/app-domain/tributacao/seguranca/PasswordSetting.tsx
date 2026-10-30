"use client";
import { useState } from "react";
import { updateTaxPasswordSetting } from "./actions";
export function PasswordSetting({initialRequired}:{initialRequired:boolean}) {
 const [required,setRequired]=useState(initialRequired); const [notice,setNotice]=useState("");const[pending,setPending]=useState(false);
 return <form className="space-y-3" onSubmit={async e=>{e.preventDefault();setPending(true);try{const result=await updateTaxPasswordSetting(required);setNotice(result.error||"Preferência salva.");}finally{setPending(false);}}}><label className="flex gap-2"><input type="checkbox" checked={required} onChange={e=>setRequired(e.target.checked)}/>Exigir confirmação de senha nas manutenções tributárias de configuração e movimentação</label><p>Quando habilitada, cada confirmação de senha vale por 60 segundos e autoriza uma única gravação. Para desabilitar uma preferência já ativa, confirme a senha primeiro.</p><button disabled={pending} className="rounded border p-2">Salvar preferência</button><p role="status">{notice}</p></form>;
}
