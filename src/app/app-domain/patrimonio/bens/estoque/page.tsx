import { MaterialStockList } from "../../_components/MaterialStockList";

export default function EquipmentStockPage({ searchParams }: { searchParams?: Promise<Record<string, string | undefined>> }) {
  return <MaterialStockList searchParams={searchParams} equipmentOnly />;
}
