import React from "react";
import { createRoot } from "react-dom/client";
import AssineAgoraClient from "../src/app/app-domain/assinatura-digital/assine-agora/AssineAgoraClient";
import CentralValidationForm from "../src/components/signatures/CentralValidationForm";
import type { CentralA1Integration, CentralSigner } from "../src/lib/contracts/signature-central";

const signer: CentralSigner = { id: "signer", name: "Assinador de teste", role: "Servidor", kind: "SERVIDOR", documentId: "52998224725", phone: "", mobile: "", email: "", validUntil: "2099-01-01T00:00:00Z", active: true, employeeId: "employee", personId: null, accountUserId: null, hasPassword: true };
const integration: CentralA1Integration = { id: "a1", kind: "A1_ECPF", alias: "A1 de teste", ownerName: signer.name, documentId: signer.documentId, certificateId: "cert", active: true, validFrom: "2020-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", credentialReference: "TEST_ONLY" };

createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("validation")
  ? <CentralValidationForm initialCode="CFS-test" />
  : <AssineAgoraClient signers={[signer, { ...signer, id: "inactive", name: "Inativo", active: false }, { ...signer, id: "expired", name: "Vencido", validUntil: "2020-01-01T00:00:00Z" }]} documentTypes={[{ id: "type", name: "Contrato", description: "", active: true }]} integrations={[integration]} canCreate />);
