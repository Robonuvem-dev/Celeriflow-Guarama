import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { countProcesses, listOperationalProcesses, processListCondition } from "@/db/repositories/processes/listing";
import { parseProcessListFilters, PROCESS_LIST_PAGE_SIZE, processListHref, resolveProcessListPage } from "@/lib/protocols/process-listing-policy";
import ProcessosClient from "./ProcessosClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
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
    />
  );
}
