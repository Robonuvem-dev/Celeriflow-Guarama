import { createRoot } from "react-dom/client";
import { OperationalContext } from "../src/components/app-ui/operational/OperationalContext";
import RecordActions from "../src/app/app-domain/assinatura-digital/registros/RecordActions";
import type { CentralSignatureRecord } from "../src/lib/contracts/signature-central";

const record: CentralSignatureRecord = {
  id: "expired-record", code: "01234567-89ab-4def-8123-0123456789ab", filename: `${"Documento original com título extenso e informações preservadas ".repeat(4)}.pdf`, mimeType: "application/pdf", byteLength: 2048,
  hashSha256: "0123456789abcdef".repeat(4), documentTypeName: "Contrato administrativo detalhado", signerName: "Nome completo do assinador com sobrenomes extensos ".repeat(6), signerRole: "Responsável pela conferência e assinatura de contratos administrativos", signerDocument: new URLSearchParams(location.search).has("cnpj") ? "12.345.678/0001-95" : "529.982.247-25", method: "INTERNAL",
  signedAt: "2020-01-01T12:00:00Z", expiresAt: "2020-03-31T12:00:00Z", storageDeletedAt: "2020-04-01T12:00:00Z",
};
createRoot(document.getElementById("root")!).render(<OperationalContext.Provider value={{ userId: "isolated-test", device: "desktop", actionsHost: null }}><RecordActions record={record} /></OperationalContext.Provider>);
