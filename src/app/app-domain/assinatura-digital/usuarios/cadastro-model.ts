import { z } from "zod";
import type { CentralOrigin, CentralSigner, CentralSignerInput } from "@/lib/contracts/signature-central";
import { validateCnpj, validateCpf } from "@/lib/identifiers/brazilian-identifiers";

const optionalId = z.string().trim().max(200, "O identificador deve ter até 200 caracteres.").transform(value => value || null).nullable();
const noControls = (value: string) => ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const phoneSchema = z.string().trim().max(40, "O telefone/celular deve ter até 40 caracteres.").refine(value => {
  const digits = value.replace(/\D/g, "");
  return !value || (/^[+\d().\s-]+$/.test(value) && digits.length >= 8 && digits.length <= 15);
}, "Informe telefone/celular com 8 a 15 dígitos, ou deixe vazio.");
export const signerInputSchema = z.object({
  id: z.string().trim().min(1).max(200, "O identificador deve ter até 200 caracteres.").optional(),
  kind: z.enum(["SERVIDOR", "CIDADAO"]),
  name: z.string().trim().min(2, "Informe o nome com pelo menos 2 caracteres.").max(200, "O nome deve ter até 200 caracteres.").refine(noControls, "O nome não pode conter caracteres de controle."),
  role: z.string().trim().max(160, "O cargo deve ter até 160 caracteres.").refine(noControls, "O cargo não pode conter caracteres de controle."),
  documentId: z.string().trim().max(18, "Informe um CPF/CNPJ válido.").refine(value => /^[\d.\/\-\s]+$/.test(value) && (validateCpf(value).valid || validateCnpj(value).valid), "Informe um CPF/CNPJ válido.").transform(value => value.replace(/\D/g, "")),
  phone: phoneSchema, mobile: phoneSchema,
  email: z.string().trim().toLowerCase().max(254, "O e-mail deve ter até 254 caracteres.").pipe(z.union([z.literal(""), z.email("Informe um e-mail válido.")])),
  validUntil: z.iso.datetime({ offset: true, message: "Informe uma validade válida." }).transform(value => new Date(value).toISOString()),
  active: z.boolean(), employeeId: optionalId, personId: optionalId, accountUserId: optionalId,
  password: z.string().refine(value => !value || (value.length >= 8 && new TextEncoder().encode(value).byteLength <= 1024), "A senha pessoal deve ter pelo menos 8 caracteres e no máximo 1024 bytes.").optional(),
}).superRefine((input, context) => {
  if (!input.id && !input.password) context.addIssue({ code: "custom", path: ["password"], message: "Informe a senha inicial." });
  if (input.kind === "SERVIDOR" && !input.employeeId) context.addIssue({ code: "custom", path: ["employeeId"], message: "Selecione um servidor no RH antes de salvar." });
  if (input.kind === "CIDADAO" && input.employeeId) context.addIssue({ code: "custom", path: ["employeeId"], message: "O cadastro de cidadão não pode manter vínculo de servidor RH." });
});

export function serializeSigner(row: CentralSigner): CentralSigner {
  return {
    id: row.id, kind: row.kind, name: row.name, role: row.role, documentId: row.documentId,
    phone: row.phone, mobile: row.mobile, email: row.email,
    validUntil: new Date(row.validUntil).toISOString(), active: row.active,
    employeeId: row.employeeId, personId: row.personId, accountUserId: row.accountUserId,
    hasPassword: row.hasPassword,
  };
}

export function serializeOrigin(row: CentralOrigin): CentralOrigin {
  return { id: row.id, kind: row.kind, name: row.name, role: row.role, documentId: row.documentId,
    phone: row.phone, mobile: row.mobile, email: row.email, employeeId: row.employeeId, personId: row.personId };
}

export function emptySigner(): CentralSignerInput {
  return { kind: "CIDADAO", name: "", role: "", documentId: "", phone: "", mobile: "", email: "",
    validUntil: "", active: true, employeeId: null, personId: null, accountUserId: null, password: "" };
}

export function editSigner(row: CentralSigner): CentralSignerInput {
  const { hasPassword: _hasPassword, ...input } = serializeSigner(row);
  void _hasPassword;
  return { ...input, password: "" };
}

export function prefillOrigin(draft: CentralSignerInput, origin: CentralOrigin): CentralSignerInput {
  return { ...draft, kind: origin.kind, name: origin.name, role: origin.role, documentId: origin.documentId,
    phone: origin.phone, mobile: origin.mobile, email: origin.email,
    employeeId: origin.employeeId, personId: origin.personId };
}

export function toLocalDateTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
}

export function fromLocalDateTime(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

export function signerValidity(row: Pick<CentralSigner, "validUntil">, now: number): "VALID" | "EXPIRED" {
  return new Date(row.validUntil).getTime() > now ? "VALID" : "EXPIRED";
}

export function filterSigners(rows: CentralSigner[], search: string, active: string, validity: string, now: number) {
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const digits = term.replace(/\D/g, "");
  return rows.filter(row => (active === "ALL" || row.active === (active === "ACTIVE"))
    && (validity === "ALL" || signerValidity(row, now) === validity)
    && ([row.name, row.role, row.documentId, row.phone, row.mobile, row.email, row.kind === "SERVIDOR" ? "Servidor RH" : "Cidadão"].some(value => value.toLocaleLowerCase("pt-BR").includes(term))
      || (!!digits && /^[-.\/\s\d()+]+$/.test(term) && [row.documentId, row.phone, row.mobile].some(value => value.replace(/\D/g, "").includes(digits)))));
}
