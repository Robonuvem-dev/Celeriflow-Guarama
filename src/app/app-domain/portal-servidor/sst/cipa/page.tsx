import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { portalElections } from "@/lib/sst/prevention-service";
import { SstForm } from "../../../sst/SstForm";
import { selfRegisterCipa, selfVoteCipa } from "./actions";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
export const dynamic = "force-dynamic";
export default async function PortalCipaPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <main className="p-4">É necessário um vínculo ativo de servidor para participar da CIPA.</main>;
  const result = await portalElections(access.context, Number((await searchParams).page || 1)), { elections } = result, now = new Date().toISOString();
  return <main className="space-y-5 p-4"><h1 className="text-xl font-semibold">CIPA — inscrições e voto secreto</h1><p>Servidor autenticado: {access.employee.name} — {access.employee.registration || "sem matrícula"}</p>{!elections.length && <p>Nenhuma eleição aberta para seu vínculo.</p>}{elections.map(e => <section key={e.id} className="space-y-4 rounded border p-4"><h2 className="text-lg font-semibold">{e.title}</h2><p>Inscrições: {new Date(e.payload.registrationStartsAt).toLocaleString("pt-BR")} até {new Date(e.payload.registrationEndsAt).toLocaleString("pt-BR")}</p><p>Votação: {new Date(e.payload.startsAt).toLocaleString("pt-BR")} até {new Date(e.payload.endsAt).toLocaleString("pt-BR")}</p>
    {now >= e.payload.registrationStartsAt && now < e.payload.registrationEndsAt && <SstForm action={selfRegisterCipa} label="Inscrever minha candidatura"><input type="hidden" name="electionId" value={e.id}/><p>A candidatura será vinculada exclusivamente ao seu servidor autenticado.</p></SstForm>}
    {e.voted ? <p role="status" className="font-semibold">Participação registrada. Seu voto permanece secreto.</p> : now >= e.payload.startsAt && now < e.payload.endsAt ? <SstForm action={selfVoteCipa} label="Confirmar voto secreto"><input type="hidden" name="electionId" value={e.id}/><fieldset className="grid gap-2"><legend className="font-semibold">Escolha um candidato ou voto em branco</legend>{e.candidates.map(c => <label key={c.id} className="flex gap-2"><input type="radio" name="candidateId" value={c.id} required/>{c.nameSnapshot}</label>)}<label className="flex gap-2"><input type="radio" name="candidateId" value="" required/>Em branco</label></fieldset><p>Um voto por servidor nesta eleição. Após confirmar, não será possível alterar a escolha.</p></SstForm> : <p>Votação ainda não aberta.</p>}
  </section>)}<ErpPagination page={result.page} total={result.total} pageSize={20} previousHref={`/portal-servidor/sst/cipa?page=${result.page - 1}`} nextHref={`/portal-servidor/sst/cipa?page=${result.page + 1}`} jumpTo={{ pathname: "/portal-servidor/sst/cipa" }} /></main>;
}
