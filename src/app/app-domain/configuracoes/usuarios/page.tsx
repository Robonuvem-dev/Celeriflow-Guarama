import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { getSystemAdministratorEmail, SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import { readAdditionalProfiles } from "@/db/repositories/platform/additional-profiles";
import { saveAdditionalUserProfiles } from "./additional-profile-actions";
import UsuariosClient from "./components/UsuariosClient";
import { db } from "@/db/client";
import { loadUserAdministration } from "@/db/repositories/platform/system-administration";

export default async function UsuariosPage() {
  const context = await getTenantContextForSystemAdministration();
  const { usuarios, perfis, servidores } = await loadUserAdministration(context.database ?? db, getSystemAdministratorEmail(), SYSTEM_ADMIN_PROFILE_CODE);

  const memberships = await Promise.all(usuarios.map(async user=>({user,profiles:await readAdditionalProfiles(context.database??db,user.id)})));
  return <><UsuariosClient usuarios={usuarios} perfis={perfis} servidores={servidores} /><section className="mt-6 space-y-4 rounded border bg-white p-4"><h2 className="text-lg font-semibold">Perfis complementares</h2><p className="text-sm text-slate-600">O perfil principal é preservado. As operações autorizadas pelos perfis ativos são somadas, respeitando as restrições individuais de módulos.</p>{memberships.map(({user,profiles})=><details key={user.id} className="rounded border p-3"><summary>{user.nome} — principal: {user.perfil.nome}</summary><form action={saveAdditionalUserProfiles} className="mt-3 space-y-3"><input type="hidden" name="usuarioId" value={user.id}/><div className="grid gap-2 md:grid-cols-3">{perfis.filter(profile=>profile.id!==user.perfilId).map(profile=><label key={profile.id} className="text-sm"><input name="profileIds" type="checkbox" value={profile.id} defaultChecked={profiles.some(member=>member.id===profile.id)}/> {profile.nome}</label>)}</div><button className="rounded border px-3 py-2 text-sm">Salvar perfis complementares</button></form></details>)}</section></>;

}
