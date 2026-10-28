import { getProtocolContext, protocolScopeCondition } from "@/lib/protocols/access";
import { db } from "@/db/client";
import { countProcesses, listOperationalProcesses, processListCondition } from "@/db/repositories/processes/listing";
import { parseProcessListFilters, PROCESS_LIST_PAGE_SIZE, resolveProcessListPage } from "@/lib/protocols/process-listing-policy";
import BuscaClient from "./BuscaClient";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  page?: string | string[];
};

export default async function BuscarProcessoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await getProtocolContext();
  const filters = parseProcessListFilters(await searchParams);
  const where = processListCondition(protocolScopeCondition(context), { q: filters.q });
  const total = await countProcesses(db, where);
  const page = resolveProcessListPage(filters.page, total);
  const processos = await listOperationalProcesses(db, where, { offset: (page - 1) * PROCESS_LIST_PAGE_SIZE, limit: PROCESS_LIST_PAGE_SIZE });

  return (
    <BuscaClient
      processos={processos.map(({id,protocolNumber,status,createdAt,processType,subject,person,company})=>({id,protocolNumber,status,createdAt,processType,subject,person,company}))}
      query={filters.q}
      total={total}
      page={page}
      pageSize={PROCESS_LIST_PAGE_SIZE}
    />
  );
}
