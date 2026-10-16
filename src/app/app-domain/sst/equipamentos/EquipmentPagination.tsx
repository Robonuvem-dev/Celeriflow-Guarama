import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export function EquipmentPagination(props: { page: number; total: number; pageSize?: number; previousHref: string; nextHref: string }) {
  const url = new URL(props.previousHref, "http://sst.local");
  url.searchParams.delete("page");
  return <ErpPagination {...props} jumpTo={{ pathname: url.pathname, values: Object.fromEntries(url.searchParams) }}/>;
}
