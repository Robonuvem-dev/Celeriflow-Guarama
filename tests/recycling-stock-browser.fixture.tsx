import { createRoot } from "react-dom/client";
import { OperationalSurface } from "../src/components/app-ui/operational/OperationalWorkspace";
import { StockView } from "../src/app/app-domain/meio-ambiente/residuos/estoque/StockView";
import { recyclingUiProps } from "./fixtures/recycling-stock-ui";

const query = new URLSearchParams(location.search);
const page = (name: string) => Math.min(2, Math.max(1, Number(query.get(name)) || 1));
const stockPage = page("estoquePagina"), historyPage = page("historicoPagina");
const positions = Array.from({ length: 21 }, (_, index) => ({ ...recyclingUiProps.positions[0], materialCode: `M${index + 1}`, materialName: index ? `Papel ${index + 1}` : "Papel", canDispatch: index !== 19 }));
const history = Array.from({ length: 21 }, (_, index) => ({ ...recyclingUiProps.history[0], id: `movement-${index}` }));
createRoot(document.getElementById("root")!).render(<OperationalSurface title="Estoque de recicláveis">
  <StockView {...recyclingUiProps} canRecord={query.get("consulta") !== "1"} stockPage={stockPage} historyPage={historyPage} view={query.get("visao") === "historico" ? "history" : "stock"}
    positions={positions.slice((stockPage - 1) * 20, stockPage * 20)} history={history.slice((historyPage - 1) * 20, historyPage * 20)}
    recordAction={async form => { const response = await fetch("/fixture-record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); return response.json(); }} />
</OperationalSurface>);
