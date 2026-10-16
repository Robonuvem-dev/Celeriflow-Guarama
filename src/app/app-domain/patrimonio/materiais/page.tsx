import { redirect } from "next/navigation";
import { MaterialStockList } from "../_components/MaterialStockList";

export default async function MateriaisPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (params?.type === "PATRIMONIO") {
    const query = new URLSearchParams(Object.entries(params).filter(([key, value]) => key !== "type" && typeof value === "string") as [string, string][]);
    redirect(`/patrimonio/bens/estoque${query.size ? `?${query}` : ""}`);
  }
  return <MaterialStockList searchParams={Promise.resolve(params || {})} />;
}
