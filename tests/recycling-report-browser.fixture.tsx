import { createRoot } from "react-dom/client";
import { OperationalSurface } from "../src/components/app-ui/operational/OperationalWorkspace";
import { ReportView } from "../src/app/app-domain/meio-ambiente/residuos/relatorios/ReportView";
import { parseRecyclingReportFilters, type RecyclingReportRow } from "../src/lib/environment/recycling-reports";

const query = new URLSearchParams(location.search);
const filters = parseRecyclingReportFilters({ from: "2026-01-01", to: "2026-03-31", ...Object.fromEntries(query) });
const page = query.get("page") === "2" ? 2 : 1;
const all: RecyclingReportRow[] = Array.from({ length: 21 }, (_, i) => ({ id: String(i), code: `M${i + 1}`, name: `Material ${i + 1}`, type: "Papel", unit: "kg", depot: "Central", depotCode: "D1", opening: "10.125", incoming: "4.000", outgoing: "3.025", balance: "11.100", revenue: i === 1 ? "0.00" : "9007199254740993.01", movements: "1" }));
createRoot(document.getElementById("root")!).render(<OperationalSurface title="Relatórios de recicláveis"><ReportView data={{ filters, page, total: 21, revenue: "180143985094819860.20", maximum: "9007199254740993.01", rows: all.slice((page - 1) * 20, page * 20) }} entries={[
  { kind: "depots", code: "D1", name: "Central", description: "", address: "", active: true },
  { kind: "types", code: "T1", name: "Papel", description: "", address: "", active: false },
  { kind: "materials", code: "M1", name: "Material 1", description: "", address: "", active: true },
]} /></OperationalSurface>);
