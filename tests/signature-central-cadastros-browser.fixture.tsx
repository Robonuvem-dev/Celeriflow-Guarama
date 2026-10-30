import React from "react";
import { createRoot } from "react-dom/client";
import { OperationalSurface } from "../src/components/app-ui/operational/OperationalWorkspace";
import { UsuariosClient } from "../src/app/app-domain/assinatura-digital/usuarios/UsuariosClient";
import type { CentralSigner } from "../src/lib/contracts/signature-central";

const rows: CentralSigner[] = Array.from({ length: 80 }, (_, index) => ({
  id: `signer-${index + 1}`, kind: "CIDADAO", name: `Pessoa ${String(index + 1).padStart(2, "0")}`,
  role: "Analista", documentId: "52998224725", phone: "(11) 2222-3333", mobile: "(11) 99999-8888", email: "contato@example.org",
  validUntil: "2099-01-01T00:00:00.123Z", active: true, employeeId: null, personId: null, accountUserId: null, hasPassword: index !== 79,
}));

createRoot(document.getElementById("root")!).render(<OperationalSurface title="Central de Assinaturas — cadastros">
  <UsuariosClient initialRows={rows} initialNow={Date.parse("2026-10-29T12:00:00Z")} canCreate canUpdate />
</OperationalSurface>);
