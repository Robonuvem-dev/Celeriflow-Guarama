export const PROCESS_LIST_PAGE_SIZE = 20;

export type ProcessListFilters = {
  q: string;
  status: string;
  page: number;
  origin?: string;
  period?: string;
};

type QueryValue = string | string[] | undefined;

function firstQueryValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function parsePositiveInteger(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseProcessListFilters(searchParams: { q?: QueryValue; status?: QueryValue; page?: QueryValue; origin?: QueryValue; period?: QueryValue }): ProcessListFilters {
  return {
    q: firstQueryValue(searchParams.q).trim().slice(0, 120),
    status: firstQueryValue(searchParams.status).trim().slice(0, 80),
    page: parsePositiveInteger(firstQueryValue(searchParams.page)),
    origin: firstQueryValue(searchParams.origin).trim().toUpperCase(),
    period: firstQueryValue(searchParams.period).trim().toUpperCase(),
  };
}

export function resolveProcessListPage(requestedPage: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / PROCESS_LIST_PAGE_SIZE));
  return Math.min(Math.max(1, requestedPage), totalPages);
}

export function processListHref(filters: Pick<ProcessListFilters, "q" | "status"> & { origin?: string; period?: string }, page = 1) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.origin) params.set("origin", filters.origin);
  if (filters.period) params.set("period", filters.period);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/protocolos/processos?${query}` : "/protocolos/processos";
}
