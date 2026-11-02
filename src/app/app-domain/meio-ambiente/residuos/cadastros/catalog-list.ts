import { recyclingCatalogs, type RecyclingEntry } from "@/lib/environment/recycling-catalog";
import { filterAndPaginate, type EnvironmentSearchParams } from "../../list-utils";

export function selectRecyclingCatalogPage(entries: RecyclingEntry[], query: EnvironmentSearchParams) {
  const kind: RecyclingEntry["kind"] = Object.hasOwn(recyclingCatalogs, query.catalog ?? "") ? query.catalog as RecyclingEntry["kind"] : "units";
  const search = (query.q ?? "").trim().toLocaleLowerCase("pt-BR");
  const situation = query.situacao === "Ativo" || query.situacao === "Inativo" ? query.situacao : "";
  const matching = entries.filter(entry => entry.kind === kind
    && (!situation || entry.active === (situation === "Ativo"))
    && `${entry.code} ${entry.name} ${entry.description} ${entry.address}`.toLocaleLowerCase("pt-BR").includes(search));
  const list = filterAndPaginate(matching, { page: query.page });
  return { kind, situation, search: query.q ?? "", ...list, total: matching.length };
}
