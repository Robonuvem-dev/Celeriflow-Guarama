import { Search, RotateCcw } from "lucide-react";
import Link from "next/link";
import { getProtocolContext } from "@/lib/protocols/access";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { db } from "@/db/client";
import { and, asc, eq, inArray } from "drizzle-orm";
import { processTypes, processSubjects } from "@/db/schema/processes";
import { people } from "@/db/schema/people";
import { companies } from "@/db/schema/registry";
import { departments } from "@/db/schema/administration";
import { processReferenceCatalog } from "@/db/schema/process-reference-catalog";
import NewProtocolForm from "./NewProtocolForm";

export const dynamic = "force-dynamic";

export default async function NovoProtocoloPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string; q?: string; status?: string; origin?: string; period?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const returnTo = params.returnTo || "/protocolos/processos";
  await getProtocolContext("edit");

  const types = await db.select({ id: processTypes.id, name: processTypes.name }).from(processTypes).where(eq(processTypes.isActive, true));
  const subjects = types.length
    ? await db
        .select({ id: processSubjects.id, name: processSubjects.name, processTypeId: processSubjects.processTypeId })
        .from(processSubjects)
        .where(and(eq(processSubjects.isActive, true), inArray(processSubjects.processTypeId, types.map(t => t.id))))
    : [];
  const tiposProcesso = types.map(type => ({
    ...type,
    subjects: subjects.filter(s => s.processTypeId === type.id),
  }));

  const pessoas = await db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(eq(people.status, "Ativo")).limit(100);
  const empresas = await db.select({ id: companies.id, corporateName: companies.corporateName, cnpj: companies.cnpj }).from(companies).where(eq(companies.status, "Ativo")).orderBy(asc(companies.corporateName)).limit(100);
  const departamentos = await db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name));
  const otherApplicants = await db.select({ id: processReferenceCatalog.id, name: processReferenceCatalog.name }).from(processReferenceCatalog).where(and(eq(processReferenceCatalog.kind, "OTHER_APPLICANT"), eq(processReferenceCatalog.isActive, true))).orderBy(asc(processReferenceCatalog.name));

  // 19.43, 19.85, 19.89: Documentos necessários
  const requiredDocuments = await db
    .select({ id: processReferenceCatalog.id, name: processReferenceCatalog.name, description: processReferenceCatalog.description, subjectId: processReferenceCatalog.subjectId })
    .from(processReferenceCatalog)
    .where(and(eq(processReferenceCatalog.kind, "REQUIRED_DOCUMENT"), eq(processReferenceCatalog.isActive, true)))
    .orderBy(asc(processReferenceCatalog.name));

  // 19.4: Subassuntos
  const subassuntos = await db
    .select({ id: processReferenceCatalog.id, name: processReferenceCatalog.name, description: processReferenceCatalog.description, subjectId: processReferenceCatalog.subjectId })
    .from(processReferenceCatalog)
    .where(and(eq(processReferenceCatalog.kind, "SUBJECT_CHILD"), eq(processReferenceCatalog.isActive, true)))
    .orderBy(asc(processReferenceCatalog.name));

  return (
    <PageFrame className="max-w-5xl space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <PageHeader title="Novo Protocolo e Autuação de Processo" />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={returnTo}
            title="Voltar à pesquisa e manter filtros utilizados (19.106)"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs transition"
          >
            <RotateCcw className="size-3.5 text-slate-500" />
            <span>Retornar aos Filtros (19.106)</span>
          </Link>
          <Link
            href="/protocolos/processos"
            title="Pesquisar processos cadastrados"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 shadow-xs transition"
          >
            <Search className="size-3.5" />
            <span>Pesquisar Processos</span>
          </Link>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Cadastramento operacional com tipo de atendimento (19.12), número manual/automático (19.29), busca de CEP (19.65), código de barras (19.71) e documentos obrigatórios (19.43).
      </p>

      <NewProtocolForm
        tiposProcesso={tiposProcesso}
        pessoas={pessoas}
        empresas={empresas}
        departamentos={departamentos}
        otherApplicants={otherApplicants}
        requiredDocuments={requiredDocuments}
        subassuntos={subassuntos}
        returnTo={returnTo}
      />
    </PageFrame>
  );
}
