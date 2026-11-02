import { createRoot } from "react-dom/client";
import { OperationalSurface } from "../src/components/app-ui/operational/OperationalWorkspace";
import { CatalogView } from "../src/app/app-domain/meio-ambiente/residuos/cadastros/CatalogView";
import { selectRecyclingCatalogPage } from "../src/app/app-domain/meio-ambiente/residuos/cadastros/catalog-list";
import { parseRecyclingEntries, recyclingCatalogs } from "../src/lib/environment/recycling-catalog";

// Somente dados sintéticos, sem conexão com a aplicação ou banco reais.
const query = new URLSearchParams(location.search);
if (query.has("role")) sessionStorage.setItem("catalog-fixture-role", query.get("role")!);
const role = sessionStorage.getItem("catalog-fixture-role") ?? "operador";
const records = parseRecyclingEntries(Object.keys(recyclingCatalogs).flatMap(kind => Array.from({ length: 21 }, (_, index) => ({ kind, code: `C${String(index + 1).padStart(2, "0")}`, name: `Cadastro ${String(index + 1).padStart(2, "0")}`, description: index ? "Descrição integral" : "Texto completo para leitura. ".repeat(60), address: kind === "depots" || kind === "centers" ? `Rua ${index + 1}` : "", active: index !== 20 }))));
const list = selectRecyclingCatalogPage(query.get("available") === "0" ? [] : records, Object.fromEntries(query));
createRoot(document.getElementById("root")!).render(<OperationalSurface title="Cadastros de Reciclagem">
  <CatalogView kind={list.kind} entries={list.items} search={list.search} situation={list.situation} page={list.currentPage} total={list.total} available={query.get("available") !== "0"}
    canCreate={role !== "consulta" && role !== "editar"} canUpdate={role !== "consulta" && role !== "criar"}
    saveAction={async data => { const response = await fetch("/fixture-save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(data)) }); return response.json(); }} />
</OperationalSurface>);
