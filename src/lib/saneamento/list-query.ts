export type SanitationSearchParams = Record<string, string | string[] | undefined>;

export type SanitationListQuery = {
  q: string;
  status: string;
  category: string;
  type: string;
  year: string;
  month: string;
  page: number;
  pageSize: number;
};

export type SanitationPagination = {
  query: SanitationListQuery;
  total: number;
};

export function parseSanitationQuery(params: SanitationSearchParams): SanitationListQuery {
  const text = (key: string) => typeof params[key] === "string" ? params[key].trim().slice(0, 120) : "";
  const integer = (key: string, fallback: number, max: number) => {
    const value = Number(text(key));
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
  };
  return {
    q: text("q"), status: text("status"), category: text("category"), type: text("type"), year: text("year"), month: text("month"),
    page: integer("page", 1, 1_000_000), pageSize: 20,
  };
}

export function clampSanitationPage(query: SanitationListQuery, total: number) {
  return { ...query, page: Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize))) };
}
