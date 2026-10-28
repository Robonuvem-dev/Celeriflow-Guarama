import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { countProcesses, listOperationalProcesses, processListCondition } from "@/db/repositories/processes/listing";
import { parseProcessListFilters, PROCESS_LIST_PAGE_SIZE, resolveProcessListPage } from "@/lib/protocols/process-listing-policy";
import ArquivadosClient from "./ArquivadosClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  page?: string | string[];
};

export default async function ArquivadosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getProtocolContext();
  const filters = parseProcessListFilters(await searchParams);
  const where = processListCondition(protocolScopeCondition(context), { ...filters, status: "Arquivado" });
  const total = await countProcesses(db, where);
  const page = resolveProcessListPage(filters.page, total);
  const processos = await listOperationalProcesses(db, where, { order: "archived", offset: (page - 1) * PROCESS_LIST_PAGE_SIZE, limit: PROCESS_LIST_PAGE_SIZE });

  return (
    <ArquivadosClient
      processos={processos.map(({id,protocolNumber,status,archivedAt,processType,subject,person,company})=>({id,protocolNumber,status,archivedAt,processType,subject,person,company}))}
      query={filters.q}
      total={total}
      page={page}
      pageSize={PROCESS_LIST_PAGE_SIZE}
    />
  );
}
