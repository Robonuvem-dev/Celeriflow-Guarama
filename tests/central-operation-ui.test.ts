import assert from "node:assert/strict";
import test from "node:test";
import { fileError, integrationProblem, MAX_FILE_BYTES, signerProblem, submitBatch, type BatchItem } from "../src/app/app-domain/assinatura-digital/assine-agora/batch";
import { selectRecords } from "../src/app/app-domain/assinatura-digital/registros/records";
import { validationCode } from "../src/app/validar-assinatura/validation-input";
import type { CentralSignatureRecord, CentralSigner, CentralA1Integration } from "../src/lib/contracts/signature-central";

test("lote multipart sequencial: falha individual, arquivo retido, UUID estável e sucesso não repetido", async () => {
  const file = new File(["original"], "contrato.txt", { type: "text/plain" });
  let items: BatchItem[] = ["one", "two", "three"].map(requestId => ({ requestId, file, status: "pending" }));
  const calls: string[] = [];
  let inFlight = 0;
  let retry = false;
  const request = (async (url, init) => {
    assert.equal(url, "/api/assinatura-digital/assinar");
    assert.equal(init?.method, "POST");
    assert.equal(++inFlight, 1, "não deve haver paralelismo");
    const body = init?.body as FormData;
    const id = String(body.get("requestId")); calls.push(id);
    assert.equal(await (body.get("file") as File).text(), "original");
    assert.equal(body.get("password"), "senha-do-assinador");
    assert.equal(body.get("signerId"), "signer");
    assert.equal(body.get("documentTypeId"), "type");
    assert.equal(body.get("method"), "A1_ECPF");
    assert.equal(body.get("integrationId"), "a1");
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--;
    if (id === "two" && !retry) throw new Error("conexão perdida");
    return Response.json({ record: { id, code: id } });
  }) as typeof fetch;
  const update = (next: BatchItem) => { items = items.map(item => item.requestId === next.requestId ? next : item); };
  const options = { signerId: "signer", documentTypeId: "type", method: "A1_ECPF" as const, integrationId: "a1", password: "senha-do-assinador" };
  await submitBatch(items, options, update, request);
  assert.deepEqual(items.map(item => item.status), ["success", "error", "success"]);
  assert.strictEqual(items[1].file, file);
  retry = true;
  await submitBatch(items, options, update, request);
  assert.deepEqual(calls, ["one", "two", "three", "two"]);
  assert.ok(items.every(item => item.status === "success"));
});

test("limites físicos da UI e autorização por validade/estado", () => {
  assert.equal(fileError(new File([new Uint8Array(MAX_FILE_BYTES)], "limite.pdf")), undefined);
  assert.match(fileError(new File([new Uint8Array(MAX_FILE_BYTES + 1)], "grande.pdf"))!, /3 MiB/);
  assert.ok(fileError(new File([], "vazio.txt")));
  assert.ok(fileError(new File(["x"], "script.exe")));
  const signer = { active: true, validUntil: "2030-01-01T00:00:00Z", hasPassword: true } as CentralSigner;
  const now = Date.parse("2026-10-29");
  assert.equal(signerProblem(signer, now), "");
  assert.match(signerProblem({ ...signer, active: false }, now), /inativo/);
  assert.match(signerProblem({ ...signer, validUntil: "2020-01-01" }, now), /vencido/);
  assert.match(signerProblem({ ...signer, hasPassword: false }, now), /sem senha/);
  const integration = { kind: "A1_ECPF", active: true, validFrom: "2020-01-01", validTo: "2030-01-01" } as CentralA1Integration;
  assert.equal(integrationProblem(integration, "A1_ECPF", now), "");
  assert.ok(integrationProblem(integration, "A1_ECNPJ", now));
  assert.ok(integrationProblem({ ...integration, active: false }, "A1_ECPF", now));
  assert.ok(integrationProblem({ ...integration, validTo: "2021-01-01" }, "A1_ECPF", now));
});

test("registros: busca em todo conjunto antes de paginar 20, total e página corrigida", () => {
  const records = Array.from({ length: 47 }, (_, index) => ({ id: String(index), code: `CFS-${index}`, filename: `arquivo-${index}.pdf`, documentTypeName: "Contrato", signerName: index === 46 ? "Alvo" : "Outro", signerRole: "Servidor", signerDocument: "123", method: "INTERNAL", hashSha256: "hash" })) as CentralSignatureRecord[];
  assert.equal(selectRecords(records, "", 1).records.length, 20);
  assert.equal(selectRecords(records, "", 3).records.length, 7);
  assert.equal(selectRecords(records, "", 3).total, 47);
  assert.equal(selectRecords(records, "alvo", 99).records[0].id, "46");
  assert.equal(selectRecords(records, "alvo", 99).total, 1);
  assert.equal(selectRecords(records, "alvo", 99).page, 1);
  assert.equal(selectRecords(records, "ausente", NaN).page, 1);
});

test("código/URL somente extraem texto; CFS e UUID sem fixar formato e sem redirects", () => {
  assert.equal(validationCode(" CFS-novo_123 "), "CFS-novo_123");
  assert.equal(validationCode("/validar-assinatura/CFS-123"), "CFS-123");
  assert.equal(validationCode("https://externo.example/validar-assinatura?code=CFS-456&next=https://evil.example"), "CFS-456");
  assert.equal(validationCode("01234567-89ab-4def-8123-0123456789ab"), "01234567-89ab-4def-8123-0123456789ab");
  for (const value of ["javascript:alert(1)", "https://x.example/other", "https://x.example/validar-assinatura/%3Cscript%3E", "a\nb", "x".repeat(257)]) assert.throws(() => validationCode(value));
});
