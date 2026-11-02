import { createRoot } from "react-dom/client";
import { OperationalSurface } from "../src/components/app-ui/operational/OperationalWorkspace";
import { LegalDocumentsView } from "../src/app/app-domain/cadastros/textos-juridicos/documentos/LegalDocumentsView";
const query = Object.fromEntries(new URLSearchParams(location.search));
createRoot(document.getElementById("root")!).render(<OperationalSurface title="Documentos do Texto Jurídico"><LegalDocumentsView query={query} canBind={query.role !== "read"} /></OperationalSurface>);
