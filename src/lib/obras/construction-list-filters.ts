export type LifecycleListQuery = Record<string, string | undefined>;
export const lifecyclePageSize = 20;
export function lifecyclePage(value: string | undefined, total: number) {
  return Math.min(Math.max(1, Math.ceil(total / lifecyclePageSize)), Math.max(1, Number.parseInt(value || "1", 10) || 1));
}
export function lifecycleListHref(query: LifecycleListQuery, pageKey: string, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  params.set(pageKey, String(Math.max(1, page)));
  return `?${params.toString()}`;
}
export function lifecycleFilter(value: string | undefined, options: string[]) { return options.includes(value || "") ? value : undefined; }
export function lifecycleSearch(value: string | undefined) { return (value || "").trim().slice(0, 160); }
