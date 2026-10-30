import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { schoolSubjects } from "@/db/schema/education-core";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { S1ActionForm } from "../S1ActionForm";
import { saveSchoolSubject } from "./actions";
export const dynamic = "force-dynamic";
export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
 const context = await getTenantContextForModule("EDUCACAO");
 const subjects = await (context.database ?? db).select().from(schoolSubjects).orderBy(asc(schoolSubjects.name));
 const params = await searchParams; const selected = subjects.find(s => s.id === params.id);
 return <div className="space-y-4 p-4"><h1 className="text-xl font-semibold">Disciplinas · nomenclatura e abreviação</h1><Link href="/educacao/academico">Núcleo acadêmico</Link>
 <S1ActionForm key={selected?.id || "novo"} title={selected ? `Editar ${selected.name}` : "Nova disciplina"} submitLabel="Salvar" action={saveSchoolSubject} fields={[{ name:"id",label:"Identificador",type:"hidden",defaultValue:selected?.id },{ name:"code",label:"Código",required:true,defaultValue:selected?.code || "" },{ name:"name",label:"Nomenclatura da Secretaria de Educação",required:true,defaultValue:selected?.name },{ name:"abbreviation",label:"Abreviação",required:true,defaultValue:selected?.abbreviation || "" }]} />
 <table className="w-full text-left"><thead><tr><th>Código</th><th>Nomenclatura</th><th>Abreviação</th><th>Ação</th></tr></thead><tbody>{subjects.map(s => <tr key={s.id}><td>{s.code}</td><td>{s.name}</td><td>{s.abbreviation || "Não informada"}</td><td><Link href={`/educacao/disciplinas?id=${s.id}`}>Editar</Link></td></tr>)}</tbody></table></div>;
}
