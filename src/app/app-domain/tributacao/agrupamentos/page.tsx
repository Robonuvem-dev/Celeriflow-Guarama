import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { mergeRegistriesAction } from "./actions";
export default async function Page({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const context = await getTenantContextForModule("TRIBUTACAO");
  if (!isSystemAdministrator(context.user)) throw new Error("Agrupamentos exigem administrador do sistema.");
  const database = context.database ?? db;
  const history = await database.execute<{ id: string; kind: string; sourceId: string; targetId: string; reason: string; moved: Record<string,number> }>(sql`SELECT id,kind,"sourceId","targetId",reason,moved FROM "TaxRegistryMerge" ORDER BY "createdAt" DESC,id DESC LIMIT 100`);
  const done = (await searchParams).done === "1";
  return <main className="space-y-5 p-6"><h1 className="text-2xl font-semibold">Agrupamento de cadastros duplicados</h1>{done && <p role="status">Agrupamento concluído e registrado no histórico.</p>}<p>O destino conserva seu cadastro. Os vínculos da origem são transferidos e a origem permanece arquivada para auditoria. Cidades/bairros devem representar a mesma localidade; contadores devem ter o mesmo CPF/CNPJ. Para CEP, informe a representação duplicada e como destino os mesmos oito dígitos sem pontuação.</p>
    <form action={mergeRegistriesAction} className="grid max-w-2xl gap-4 rounded border p-4"><label>Cadastro<select className="block w-full border p-2" name="kind"><option value="cep">CEP</option><option value="bairro">Bairro</option><option value="cidade">Cidade</option><option value="contador">Contador</option></select></label><label>Identificador de origem / CEP duplicado<input className="block w-full border p-2" name="source" required maxLength={100} /></label><label>Identificador de destino / CEP canônico<input className="block w-full border p-2" name="target" required maxLength={100} /></label><label>Justificativa<textarea className="block w-full border p-2" name="reason" required minLength={10} maxLength={2000} /></label><label><input type="checkbox" required /> Conferi os cadastros e autorizo transferir os vínculos da origem ao destino.</label><button className="rounded bg-blue-700 p-2 text-white">Confirmar agrupamento</button></form>
    <h2 className="text-xl font-semibold">Últimos agrupamentos</h2><table className="w-full text-sm"><thead><tr><th>Cadastro</th><th>Origem</th><th>Destino</th><th>Justificativa</th><th>Vínculos transferidos</th></tr></thead><tbody>{history.rows.map(row => <tr key={row.id}><td>{row.kind}</td><td>{row.sourceId}</td><td>{row.targetId}</td><td>{row.reason}</td><td>{Object.entries(row.moved).map(([name,count]) => `${name}: ${count}`).join("; ") || "Sem vínculos"}</td></tr>)}</tbody></table>
  </main>;
}
