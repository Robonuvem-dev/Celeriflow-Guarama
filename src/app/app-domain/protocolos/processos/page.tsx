import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { and, desc, eq } from "drizzle-orm";
import { processes, processSubjects } from "@/db/schema/processes";
import { countProcesses, listOperationalProcesses, processListCondition } from "@/db/repositories/processes/listing";
import { parseProcessListFilters, PROCESS_LIST_PAGE_SIZE, processListHref, resolveProcessListPage } from "@/lib/protocols/process-listing-policy";
import ProcessosClient from "./ProcessosClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
  origin?: string | string[];
  period?: string | string[];
};

export default async function ProcessosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getProtocolContext();
  const parsedFilters = parseProcessListFilters(await searchParams);
  const filters = { ...parsedFilters, status: parsedFilters.status || "ATIVOS" };
  const where = processListCondition(protocolScopeCondition(context), filters);
  const total = await countProcesses(db, where);
  const page = resolveProcessListPage(filters.page, total);

  const processos = await listOperationalProcesses(db, where, { offset: (page - 1) * PROCESS_LIST_PAGE_SIZE, limit: PROCESS_LIST_PAGE_SIZE });

  const canReceive = context.protocolAccess.canUpdate && Boolean(context.user.departmentId);
  const currentDepartmentId = context.user.departmentId || null;
  const returnTo = processListHref(filters, page);

  // 19.86: Notificar usuário na tela inicial do assunto e subassunto ao qual a nova solicitação pertence
  const portalPendingRows = currentDepartmentId
    ? await db
        .select({
          protocolNumber: processes.protocolNumber,
          subjectName: processSubjects.name,
          createdAt: processes.createdAt,
        })
        .from(processes)
        .innerJoin(processSubjects, eq(processSubjects.id, processes.subjectId))
        .where(
          and(
            eq(processes.currentDepartmentId, currentDepartmentId),
            eq(processes.portalOrigin, "PORTAL"),
            eq(processes.status, "Aguardando Recebimento")
          )
        )
        .orderBy(desc(processes.createdAt))
        .limit(5)
    : [];

  const portalNotifications = portalPendingRows.map((p) => ({
    protocolNumber: p.protocolNumber,
    subjectName: p.subjectName,
    createdAt: p.createdAt.toLocaleString("pt-BR"),
  }));

  return (
    <ProcessosClient
      processos={processos}
      filters={filters}
      total={total}
      page={page}
      pageSize={PROCESS_LIST_PAGE_SIZE}
      canReceive={canReceive}
      currentDepartmentId={currentDepartmentId}
      canCreate={context.protocolAccess.canCreate}
      returnTo={returnTo}
      portalNotifications={portalNotifications}
    />
  );
}
