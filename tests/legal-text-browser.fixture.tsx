import { createRoot } from "react-dom/client";
import { OperationalSurface } from "../src/components/app-ui/operational/OperationalWorkspace";
import { MasterDataCatalogClient } from "../src/app/app-domain/cadastros/MasterDataCatalogClient";
import { legalGovernmentLevels } from "../src/lib/cadastros/legal-text-policy";

const query = new URLSearchParams(location.search), role = query.get("role") ?? "edit";
const catalog = query.get("legacy") ? "banks" : "legalTexts";
const permissions = catalog === "legalTexts" ? { canCreate: role === "create", canUpdate: role === "edit" } : {};
createRoot(document.getElementById("root")!).render(<OperationalSurface title="Textos Jurídicos"><MasterDataCatalogClient catalog={catalog} pathname="/cadastros/textos-juridicos" rows={[{ id: "legal-fixture", active: true, values: { number: "1", summary: "Ementa original", content: "Conteúdo original", version: "7", governmentLevel: "Consórcio regional" } }]} columns={[{ key: "number", label: "Número" }, { key: "summary", label: "Ementa" }, { key: "version", label: "Versão" }]} fields={[{ name: "summary", label: "Ementa", type: "textarea", required: true }, { name: "content", label: "Conteúdo consolidado", type: "textarea", required: true }, { name: "governmentLevel", label: "Esfera", type: "select", required: true, options: [...legalGovernmentLevels, { value: "Consórcio regional", label: "Consórcio regional (existente)" }] }]} page={1} total={1} query="" {...permissions} /></OperationalSurface>);
