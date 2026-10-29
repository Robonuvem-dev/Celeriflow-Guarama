import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

// Filter first; only the visible page is sliced. Never mutate the full source used by forms/printing.
export function comprasPage<T>(items: readonly T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(items.length / OPERATIONAL_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), pages);
  return { page, pages, rows: items.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE) };
}
