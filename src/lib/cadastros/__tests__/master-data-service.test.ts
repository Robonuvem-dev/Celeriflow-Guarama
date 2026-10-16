import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertExclusiveCanonicalIdentity,
  assertNoSelfReference,
  MasterDataValidationError,
  normalizeEffectivePeriod,
  normalizeMasterDataCode,
  selectLegalReportSigners,
} from "../master-data-service";

test("normaliza codigos gerais e codigos numericos de tamanho fixo", () => {
  assert.equal(normalizeMasterDataCode(" iss-qn "), "ISSQN");
  assert.equal(normalizeMasterDataCode("1", { digitsOnly: true, length: 3 }), "001");
  assert.equal(normalizeMasterDataCode(" 4110-10 ", { digitsOnly: true, length: 6 }), "411010");
});

test("valida e normaliza a vigencia", () => {
  const period = normalizeEffectivePeriod({ effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" });
  assert.equal(period.effectiveFrom.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(period.effectiveUntil?.toISOString(), "2026-12-31T00:00:00.000Z");
  assert.throws(
    () => normalizeEffectivePeriod({ effectiveFrom: "2026-12-31", effectiveUntil: "2026-01-01" }),
    MasterDataValidationError,
  );
});

test("exige identidade canonica PF ou PJ exclusiva", () => {
  assert.deepEqual(assertExclusiveCanonicalIdentity({ personId: " pessoa-1 " }), {
    personId: "pessoa-1",
    companyId: null,
  });
  assert.throws(
    () => assertExclusiveCanonicalIdentity({ personId: "pessoa-1", companyId: "empresa-1" }),
    MasterDataValidationError,
  );
  assert.throws(() => assertExclusiveCanonicalIdentity({}), MasterDataValidationError);
});

test("impede autorreferencia em hierarquias", () => {
  assert.deepEqual(assertNoSelfReference("centro-1", "centro-2"), {
    recordId: "centro-1",
    parentId: "centro-2",
  });
  assert.throws(() => assertNoSelfReference("centro-1", " centro-1 "), MasterDataValidationError);
});

test("seleciona signatarios ativos, vigentes e ordenados para o relatorio", () => {
  const signers = selectLegalReportSigners(
    [
      {
        id: "signer-2",
        employeeId: "employee-2",
        reportTypes: ["RREO"],
        signatureOrder: 2,
        effectiveFrom: new Date("2026-01-01"),
        status: "ATIVO",
      },
      {
        id: "signer-1",
        personId: "person-1",
        reportTypes: ["rreo", "rgf"],
        signatureOrder: 1,
        effectiveFrom: new Date("2025-01-01"),
        status: "ATIVO",
      },
      {
        id: "signer-expired",
        personId: "person-2",
        reportTypes: ["RREO"],
        signatureOrder: 3,
        effectiveFrom: new Date("2025-01-01"),
        effectiveUntil: new Date("2025-12-31"),
        status: "ATIVO",
      },
      {
        id: "signer-without-identity",
        reportTypes: ["RREO"],
        signatureOrder: 4,
        effectiveFrom: new Date("2025-01-01"),
        status: "ATIVO",
      },
    ],
    "RREO",
    new Date("2026-06-01"),
  );

  assert.deepEqual(signers.map((signer) => signer.id), ["signer-1", "signer-2"]);
});
