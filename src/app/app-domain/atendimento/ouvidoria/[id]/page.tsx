import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileText, History, MessageSquareWarning, Send, ShieldAlert, UserCheck } from "lucide-react";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { canViewOmbudsmanIdentity, getAttendanceContext, getOmbudsmanContextForProtocols } from "@/lib/attendance/access";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { readOmbudsmanDetail, readActiveProcessTypes } from "@/db/repositories/attendance-portals/queries";
import { people } from "@/db/schema/people";
import { departments as departmentTable, employees } from "@/db/schema/administration";
import { ombudsmanConfigurations } from "@/db/schema/ombudsman-reference-catalog";
import { users as userTable } from "@/db/schema/identity";
import { ombudsmanAuditLogs, ombudsmanAccessGrants } from "@/db/schema/attendance-portals";
import { transparencyCitizenRequests } from "@/db/schema/citizen-channels";
import DocumentUpload from "../../DocumentUpload";
import {
  addOmbudsmanInteraction,
  applyOmbudsmanSituation,
  classifyOmbudsman,
  concludeOmbudsman,
  createProcessFromOmbudsman,
  forwardOmbudsman,
  grantOmbudsmanAccess,
  respondOmbudsman,
  revokeOmbudsmanAccess,
  startOmbudsmanInvestigation,
  startOmbudsmanTriage,
} from "../../actions";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString("pt-BR");
}

export async function OmbudsmanDetailView({
  id,
  origin = "atendimento",
  returnTo,
}: {
  id: string;
  origin?: "atendimento" | "protocolos";
  returnTo?: string;
}) {
  const decodedId = decodeURIComponent(id);
  const context = origin === "protocolos" ? await getOmbudsmanContextForProtocols() : await getAttendanceContext();
  const ombudsman = await readOmbudsmanDetail(db, decodedId, ombudsmanScopeCondition(context), context.user.id);
  if (!ombudsman) notFound();

  const identityAllowed = canViewOmbudsmanIdentity(
    context,
    ombudsman.isConfidential,
    ombudsman.accessGrants.some((grant) => grant.canViewIdentity),
  );
  const identityId = ombudsman.identity?.personId || ombudsman.personId;

  const [identity, departments, processTypes, users, grants] = await Promise.all([
    identityAllowed && identityId
      ? db
          .select({ fullName: people.fullName, cpf: people.cpf })
          .from(people)
          .where(eq(people.id, identityId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
          .catch(() => null)
      : null,
    db
      .select({ id: departmentTable.id, name: departmentTable.name })
      .from(departmentTable)
      .where(eq(departmentTable.isActive, true))
      .orderBy(asc(departmentTable.name))
      .catch(() => []),
    readActiveProcessTypes(db).catch(() => []),
    context.attendanceAccess.isAdmin && ombudsman.isConfidential
      ? db
          .select({ id: userTable.id, nome: userTable.nome, email: userTable.email })
          .from(userTable)
          .where(eq(userTable.ativo, true))
          .orderBy(asc(userTable.nome))
          .catch(() => [])
      : [],
    context.attendanceAccess.isAdmin && ombudsman.isConfidential
      ? db
          .select({ grant: ombudsmanAccessGrants, user: { nome: userTable.nome, email: userTable.email } })
          .from(ombudsmanAccessGrants)
          .leftJoin(userTable, eq(userTable.id, ombudsmanAccessGrants.userId))
          .where(eq(ombudsmanAccessGrants.ombudsmanId, decodedId))
          .orderBy(asc(ombudsmanAccessGrants.createdAt))
          .then((rows) =>
            rows.map((row) => ({
              ...row.grant,
              user: row.user ?? { nome: "Usuário", email: "" },
            })),
          )
          .catch(() => [])
      : [],
  ]);

  try {
    await db.insert(ombudsmanAuditLogs).values({
      ombudsmanId: decodedId,
      userId: context.user.id,
      employeeId: context.user.employeeId,
      action: "VIEWED",
      details: { confidential: ombudsman.isConfidential },
    });
    if (identityAllowed && identityId) {
      await db.insert(ombudsmanAuditLogs).values({
        ombudsmanId: decodedId,
        userId: context.user.id,
        employeeId: context.user.employeeId,
        action: "IDENTITY_VIEWED",
      });
    }
  } catch (auditErr) {
    console.warn("Aviso ao registrar log de leitura da manifestação:", auditErr);
  }

  const canManage = context.attendanceAccess.isOmbudsman && context.attendanceAccess.canUpdate;
  const [operators, situations, [citizenRequest]] = await Promise.all([
    context.attendanceAccess.canUpdate
      ? db
          .select({ id: employees.id, name: employees.name, departmentId: employees.departmentId })
          .from(employees)
          .where(eq(employees.isActive, true))
          .orderBy(asc(employees.name))
          .catch(() => [])
      : [],
    canManage
      ? db
          .select()
          .from(ombudsmanConfigurations)
          .where(eq(ombudsmanConfigurations.isActive, true))
          .orderBy(asc(ombudsmanConfigurations.name))
          .then((rows) => rows.filter((row) => row.kind === "STATUS"))
          .catch(() => [])
      : [],
    db
      .select({ protocol: transparencyCitizenRequests.protocol })
      .from(transparencyCitizenRequests)
      .where(eq(transparencyCitizenRequests.nativeOmbudsmanId, decodedId))
      .limit(1)
      .catch(() => []),
  ]);

  const canCreateProcess = canManage && canPerformModuleOperation(context.user, "PROCESSOS", "create");
  const backHref = returnTo || (origin === "protocolos" ? "/protocolos/ouvidoria" : "/atendimento/ouvidoria");

  return (
    <PageFrame className="space-y-4">
      <PageHeader
        title={ombudsman.protocolNumber}
        icon={<MessageSquareWarning className="size-4 shrink-0 text-[#0e4c7e]" />}
        action={
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {ombudsman.type}
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-[#0e4c7e]">
              {ombudsman.status}
            </span>
            {ombudsman.isConfidential && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                Confidencial
              </span>
            )}
            <Link
              href={backHref}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="size-3.5" />
              Voltar
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            <strong className="text-slate-900">Tipo:</strong> {ombudsman.type}
          </span>
          <span>·</span>
          <span>
            <strong className="text-slate-900">Situação:</strong> {ombudsman.status}
          </span>
          <span>·</span>
          <span className="font-semibold text-slate-900">Prioridade: {ombudsman.priority}</span>
        </div>
        <span>Abertura: {formatDateTime(ombudsman.createdAt)}</span>
      </div>

      {citizenRequest && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-900 shadow-sm">
          <div>
            <span className="font-bold uppercase tracking-wider text-blue-700">Canal Cidadão / Consulta Pública</span>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <span><strong>Protocolo Cidadão:</strong> <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-blue-800 border border-blue-200">{citizenRequest.protocol}</code></span>
              <span>·</span>
              <span><strong>Chave de Acompanhamento:</strong> <span className="text-slate-600">Disponibilizada ao manifestante no comprovante</span></span>
            </div>
          </div>
          <Link
            href={`/portal/ouvidoria?protocolo=${citizenRequest.protocol}`}
            target="_blank"
            className="inline-flex h-7 items-center rounded border border-blue-300 bg-white px-2.5 text-xs font-semibold text-blue-800 hover:bg-blue-100/50"
          >
            Ver no Portal do Cidadão
          </Link>
        </div>
      )}

      {(canManage || context.attendanceAccess.canUpdate) && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {canManage && (
            <form action={classifyOmbudsman} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <h2 className="text-sm font-bold text-slate-900">Classificação e prioridade</h2>
              <label className="field">
                <span>Prioridade</span>
                <select name="priority" defaultValue={ombudsman.priority} className="input">
                  {["Baixa", "Normal", "Alta", "Urgente"].map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              {ombudsman.type === "Reclamação" && (
                <>
                  <label className="field">
                    <span>Equipe reclamada</span>
                    <input
                      name="complaintTeam"
                      defaultValue={ombudsman.complaintTeam || ""}
                      maxLength={160}
                      placeholder="Ex.: Equipe de atendimento matutino"
                      className="input"
                    />
                  </label>
                  <label className="field">
                    <span>Profissional reclamado</span>
                    <select name="complaintProfessionalId" defaultValue={ombudsman.complaintProfessionalId || ""} className="input">
                      <option value="">Não informado</option>
                      {operators.map((operator) => (
                        <option key={operator.id} value={operator.id}>
                          {operator.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <button className="portal-btn w-full justify-center">Salvar classificação</button>
            </form>
          )}

          {context.attendanceAccess.canUpdate &&
            ["Em Triagem", "Encaminhada", "Em Apuração", "Aguardando Resposta"].includes(ombudsman.status) && (
              <form action={forwardOmbudsman} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <input type="hidden" name="ombudsmanId" value={decodedId} />
                <h2 className="text-sm font-bold text-slate-900">Tramitar para setor ou operador</h2>
                <label className="field">
                  <span>Setor de destino</span>
                  <select name="toDepartmentId" required defaultValue={ombudsman.departmentId || ""} className="input">
                    <option value="">Selecione o setor</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Operador do setor de destino</span>
                  <select name="toAssigneeId" className="input">
                    <option value="">Fila do setor</option>
                    {operators
                      .filter((operator) => operator.departmentId)
                      .map((operator) => (
                        <option key={operator.id} value={operator.id}>
                          {operator.name} ·{" "}
                          {departments.find((department) => department.id === operator.departmentId)?.name || "Setor"}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>Motivo</span>
                  <textarea name="reason" required rows={2} placeholder="Descreva o motivo do encaminhamento" className="input" />
                </label>
                <button className="portal-btn w-full justify-center">Tramitar</button>
              </form>
            )}

          {canManage && situations.length > 0 && !["Concluída", "Cancelada"].includes(ombudsman.status) && (
            <form action={applyOmbudsmanSituation} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <h2 className="text-sm font-bold text-slate-900">Aplicar situação</h2>
              <label className="field">
                <span>Situação cadastrada</span>
                <select name="situationId" required className="input">
                  <option value="">Selecione</option>
                  {situations.map((situation) => (
                    <option key={situation.id} value={situation.id}>
                      {situation.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="portal-btn w-full justify-center">Aplicar situação</button>
            </form>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="grid gap-4 rounded-lg border border-slate-100 bg-slate-50/70 p-4 text-sm sm:grid-cols-2">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Manifestante</span>
              <span className="mt-0.5 block font-medium text-slate-900">
                {ombudsman.isAnonymous
                  ? "Anônimo"
                  : identity
                    ? `${identity.fullName} · CPF ${identity.cpf || "Não informado"}`
                    : "Identidade restrita"}
              </span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Canal</span>
              <span className="mt-0.5 block font-medium text-slate-900">{ombudsman.channel?.name || "Canal Institucional"}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Setor atual</span>
              <span className="mt-0.5 block font-medium text-slate-900">{ombudsman.department?.name || "Ouvidoria"}</span>
            </div>
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-500">Responsável</span>
              <span className="mt-0.5 block font-medium text-slate-900">{ombudsman.assignee?.name || "Não atribuído"}</span>
            </div>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Assunto</h2>
            <p className="mt-1 text-base font-bold text-slate-900">{ombudsman.subject}</p>
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Narrativa restrita</h2>
            <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{ombudsman.description}</p>
            </div>
          </div>

          {ombudsman.response && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-emerald-900">
                <CheckCircle2 className="size-4" />
                Resposta registrada
              </h2>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-emerald-800">{ombudsman.response}</p>
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <FileText className="size-4 text-[#0e4c7e]" />
              Anexos GED
            </h2>
            {canManage && <DocumentUpload entityType="ombudsman" entityId={decodedId} />}
            {ombudsman.documents.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {ombudsman.documents.map((link) => (
                  <a
                    key={link.id}
                    href={`/api/download?url=${encodeURIComponent(link.document.fileUrl)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-[#0e4c7e] hover:bg-slate-100"
                  >
                    {link.document.title}
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Nenhum anexo vinculado.</p>
            )}
          </section>

          {canManage && ombudsman.status === "Recebida" && (
            <form action={startOmbudsmanTriage} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <p className="mb-2 text-xs text-slate-600">Receber manifestação para iniciar análise e classificação.</p>
              <button className="portal-btn w-full justify-center">Iniciar triagem</button>
            </form>
          )}

          {ombudsman.status === "Encaminhada" && context.attendanceAccess.canUpdate && (
            <form action={startOmbudsmanInvestigation} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <button className="portal-btn w-full justify-center">Iniciar apuração</button>
            </form>
          )}

          {canManage && (
            <form action={forwardOmbudsman} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                <Send className="size-4 text-[#0e4c7e]" />
                Encaminhar
              </h2>
              <label className="field">
                <span>Setor de destino</span>
                <select name="toDepartmentId" required className="input">
                  <option value="">Setor de destino</option>
                  {departments
                    .filter((department) => department.id !== ombudsman.departmentId)
                    .map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Motivo do encaminhamento</span>
                <textarea name="reason" required rows={2} placeholder="Motivo do encaminhamento" className="input" />
              </label>
              <button className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100">
                Encaminhar
              </button>
            </form>
          )}
        </aside>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <History className="size-4 text-[#0e4c7e]" />
            Histórico e apuração
          </h2>
          {context.attendanceAccess.canUpdate && (
            <form action={addOmbudsmanInteraction} className="space-y-3 border-b border-slate-200 pb-4">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <label className="field">
                <span>Novo registro interno</span>
                <textarea name="message" required rows={3} placeholder="Registro interno de apuração" className="input" />
              </label>
              <button className="portal-btn">Registrar</button>
            </form>
          )}
          <div className="space-y-3">
            {ombudsman.interactions.length > 0 ? (
              ombudsman.interactions.map((interaction) => (
                <div key={interaction.id} className="rounded-lg border-l-4 border-[#0e4c7e] bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-900">
                    {interaction.type} · {interaction.employee?.name || "Sistema"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{interaction.message}</p>
                  <small className="mt-1 block text-xs text-slate-500">{formatDateTime(interaction.createdAt)}</small>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Nenhuma interação registrada até o momento.</p>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {canManage && (
            <form action={respondOmbudsman} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <h2 className="text-sm font-bold text-slate-900">Resposta da Ouvidoria</h2>
              <label className="field">
                <span>Parecer / Resposta oficial ao manifestante</span>
                <textarea
                  name="response"
                  required
                  rows={4}
                  defaultValue={ombudsman.response || ""}
                  placeholder="Resposta ou providência, sem expor dados sensíveis."
                  className="input"
                />
              </label>
              <button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                Registrar resposta
              </button>
            </form>
          )}

          {canManage && (
            <form
              action={concludeOmbudsman}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="text-xs text-slate-600">Concluir após registrar a resposta ao cidadão.</span>
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <button
                disabled={ombudsman.status !== "Aguardando Resposta" || !ombudsman.response}
                className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"
              >
                Concluir
              </button>
            </form>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-900">Tramitação</h2>
            {ombudsman.movements.length ? (
              <div className="space-y-3">
                {ombudsman.movements.map((movement) => (
                  <div key={movement.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-bold text-slate-900">
                      {movement.fromDepartment?.name || "Ouvidoria"} → {movement.toDepartment?.name || "Setor de destino"}
                    </p>
                    <p className="mt-0.5 text-slate-700">{movement.reason}</p>
                    <small className="mt-1 block text-xs text-slate-500">
                      {movement.employee?.name || "Sistema"} · {formatDateTime(movement.createdAt)}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Sem encaminhamentos.</p>
            )}
          </section>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Processo formal</h2>
          {ombudsman.process ? (
            <Link href={`/protocolos/processos/${ombudsman.process.id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700 hover:underline">
              {ombudsman.process.protocolNumber} · {ombudsman.process.status}
            </Link>
          ) : canCreateProcess ? (
            <form action={createProcessFromOmbudsman} className="space-y-3">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <label className="field">
                <span>Tipo de processo</span>
                <select name="processTypeId" required className="input">
                  <option value="">Tipo de processo</option>
                  {processTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Assunto do processo</span>
                <select name="subjectId" required className="input">
                  <option value="">Assunto do processo</option>
                  {processTypes.flatMap((type) =>
                    type.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name} ({type.name})
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label className="field">
                <span>Setor configurado</span>
                <select name="initialDepartmentId" className="input">
                  <option value="">Setor configurado</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Resumo autorizado</span>
                <textarea
                  name="disclosure"
                  required
                  rows={4}
                  placeholder="Resumo autorizado. Não inclua identidade, CPF, contatos ou detalhes sigilosos."
                  className="input"
                />
              </label>
              <button className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
                Gerar processo com resumo autorizado
              </button>
            </form>
          ) : (
            <p className="text-xs text-slate-500">Nenhum processo administrativo vinculado a esta manifestação.</p>
          )}
        </section>

        {context.attendanceAccess.isAdmin && ombudsman.isConfidential && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900">
              <UserCheck className="size-4 text-[#0e4c7e]" />
              Conceder acesso confidencial
            </h2>
            <form action={grantOmbudsmanAccess} className="space-y-3">
              <input type="hidden" name="ombudsmanId" value={decodedId} />
              <label className="field">
                <span>Usuário autorizado</span>
                <select name="userId" required className="input">
                  <option value="">Usuário autorizado</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.nome} · {user.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input name="canViewIdentity" type="checkbox" className="size-4 rounded border-slate-300" />
                Permitir visualizar identidade
              </label>
              <button className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100">
                Conceder ou atualizar acesso
              </button>
            </form>
            {grants.length > 0 && (
              <div className="mt-4 space-y-2 text-sm">
                {grants.map((grant) => (
                  <form
                    key={grant.id}
                    action={revokeOmbudsmanAccess}
                    className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2"
                  >
                    <input type="hidden" name="ombudsmanId" value={decodedId} />
                    <input type="hidden" name="userId" value={grant.userId} />
                    <span>
                      {grant.user.nome} {grant.canViewIdentity && "(identidade)"}
                    </span>
                    <button className="text-xs font-bold text-red-700 hover:underline">Revogar</button>
                  </form>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {context.attendanceAccess.isManager && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <ShieldAlert className="size-4 text-[#0e4c7e]" />
            Auditoria
          </h2>
          {ombudsman.auditLogs.length > 0 ? (
            <div className="space-y-1.5">
              {ombudsman.auditLogs.map((log) => (
                <p key={log.id} className="text-xs text-slate-600">
                  <strong className="text-slate-900">{log.action}</strong> · {log.user?.nome || "Sistema"} ·{" "}
                  {formatDateTime(log.createdAt)}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Sem registros de auditoria.</p>
          )}
        </section>
      )}
    </PageFrame>
  );
}

export default async function OmbudsmanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string | string[] }>;
}) {
  const { id } = await params;
  const requestedReturnTo = searchParams ? await searchParams : {};
  const rawReturnTo = Array.isArray(requestedReturnTo.returnTo) ? requestedReturnTo.returnTo[0] : requestedReturnTo.returnTo;
  const returnTo = rawReturnTo?.startsWith("/atendimento/ouvidoria") ? rawReturnTo : undefined;
  return <OmbudsmanDetailView id={id} returnTo={returnTo} />;
}
