import React from "react";
import { createRoot } from "react-dom/client";
import IntegrationsClient from "../src/app/app-domain/assinatura-digital/integracoes/IntegrationsClient";
import type { CentralA1Integration } from "../src/lib/contracts/signature-central";
import "../src/app/globals.css";

const rows: CentralA1Integration[] = Array.from({ length: 21 }, (_, i) => ({ id: `integration-${i}`, kind: "A1_ECPF", alias: `Integração ${i + 1}`, ownerName: "Titular de teste", documentId: "52998224725", certificateId: `certificate-${i}`, active: true, validFrom: "2020-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", credentialReference: "TEST_ONLY" }));
createRoot(document.getElementById("root")!).render(<IntegrationsClient initial={rows} canManage={!new URLSearchParams(location.search).has("readonly")} status={{ internalKeyPresent: true, internalKeyValid: true, blobConfigured: true }} />);
