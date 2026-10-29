import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listSstUnits } from "@/db/repositories/sst/scope";
import { searchSstPeople } from "@/db/repositories/sst/references";
import { sstDatabase } from "@/lib/sst/database";
import { readSstBoardsPage } from "@/db/repositories/sst-pages/administration";
import { SstForm } from "../SstForm";
import { saveSstBoard } from "../agenda-actions";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { BoardMemberFields } from "./BoardMemberFields";

export default async function SstBoardsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const context = await getTenantContextForModule("SST");
  const params = await searchParams;
  const database = sstDatabase(context), units = await listSstUnits(database, context);
  const { total, page, boards } = await readSstBoardsPage(database, units.map(item => item.id), params.page);
  const people = params.q && params.q.trim().length >= 3 ? await searchSstPeople(database, params.q.trim()) : [];
  return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Juntas médicas</h1><form className="flex gap-2"><input aria-label="Buscar profissionais" name="q" defaultValue={params.q} placeholder="Buscar profissionais no Cadastro Único (3 letras)" className="w-full rounded border p-2" /><button className="rounded border p-2">Pesquisar</button></form>
    <SstForm action={saveSstBoard} label="Cadastrar junta"><label>Unidade gestora<select required name="budgetUnitId" className="block w-full rounded border p-2"><option value="">Selecione</option>{units.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Nome da junta<input required name="name" className="block w-full rounded border p-2" /></label><div className="grid gap-3 sm:grid-cols-2"><label>Vigência inicial<input required type="datetime-local" name="startsAt" className="block rounded border p-2" /></label><label>Vigência final<input required type="datetime-local" name="endsAt" className="block rounded border p-2" /></label></div><BoardMemberFields people={people} /></SstForm>
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">Juntas cadastradas</h2>{boards.map(board => <article className="border-b pb-2" key={board.id}><h3>{board.name} · {board.budgetUnit.name}</h3><p>{board.startsAt.toLocaleString("pt-BR")} — {board.endsAt.toLocaleString("pt-BR")}</p><p>Identificador para perícia: {board.id}</p>{board.members.map(member => <p key={member.id}>{member.person.fullName} · {member.council}</p>)}</article>)}<ErpPagination page={page} total={total} previousHref={`/sst/juntas?page=${page - 1}`} nextHref={`/sst/juntas?page=${page + 1}`} /></section>
  </div>;
}
