import { validateCnpj, validateCpf } from "@/lib/identifiers/brazilian-identifiers";

export type IdentityIssue = { issueType: string; recordType: string; recordId: string; severity: "ALTA"; description: string };
type CanonicalLink = { id: string; personId: string | null; companyId: string | null };
export type CanonicalIdentitySource = {
  persons: { id: string; cpf: string | null }[];
  companies: { id: string; cnpj: string }[];
  taxpayers: (CanonicalLink & { taxpayerType: string })[];
  suppliers: CanonicalLink[];
  creditors: (CanonicalLink & { supplierId: string | null; document: string | null })[];
};

export function analyzeCanonicalIdentityIssues({ persons, companies, taxpayers, suppliers, creditors }: CanonicalIdentitySource): IdentityIssue[] {
  const issues: IdentityIssue[] = [];
  const add = (recordType: string, recordId: string, issueType: string, description: string) => issues.push({ recordType, recordId, issueType, description, severity: "ALTA" });
  const personById = new Map(persons.map(row => [row.id, row]));
  const companyById = new Map(companies.map(row => [row.id, row]));
  const supplierById = new Map(suppliers.map(row => [row.id, row]));
  for (const [recordType, rows] of [["Person", persons.map(row => ({ id: row.id, document: row.cpf }))], ["Company", companies.map(row => ({ id: row.id, document: row.cnpj }))]] as const) {
    const byDocument = new Map<string, string[]>();
    for (const row of rows) {
      const validation = recordType === "Person" ? validateCpf(row.document ?? "") : validateCnpj(row.document);
      if (!validation.valid) { add(recordType, row.id, "CANONICAL_DOCUMENT_INVALID", "Identidade canônica com documento ausente ou inválido; exige conferência cadastral."); continue; }
      const matches = byDocument.get(validation.normalized) ?? [];
      matches.push(row.id); byDocument.set(validation.normalized, matches);
    }
    for (const matches of byDocument.values()) if (matches.length > 1) for (const id of matches) add(recordType, id, "CANONICAL_DOCUMENT_DUPLICATE", "Documento normalizado repetido em identidades canônicas distintas; históricos preservados, sem mesclagem automática.");
  }
  for (const [recordType, rows] of [["Taxpayer", taxpayers], ["Supplier", suppliers], ["Creditor", creditors]] as const) {
    const byIdentity = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.personId && !row.companyId) { add(recordType, row.id, "CANONICAL_IDENTITY_MISSING", "Cadastro sem identidade PF/PJ canônica."); continue; }
      if (row.personId && row.companyId) { add(recordType, row.id, "CANONICAL_IDENTITY_AMBIGUOUS", "Cadastro possui simultaneamente vínculos PF e PJ; exige decisão documental."); continue; }
      if (row.personId && !personById.has(row.personId) || row.companyId && !companyById.has(row.companyId)) add(recordType, row.id, "CANONICAL_IDENTITY_NOT_FOUND", "Cadastro aponta para identidade canônica inexistente.");
      const key = row.personId ? `PF:${row.personId}` : `PJ:${row.companyId}`;
      const matches = byIdentity.get(key) ?? [];
      matches.push(row.id); byIdentity.set(key, matches);
    }
    for (const matches of byIdentity.values()) if (matches.length > 1) for (const id of matches) add(recordType, id, "CANONICAL_ROLE_DUPLICATE", "Identidade repetida no mesmo papel cadastral; os registros exigem conciliação documental individual.");
  }
  for (const taxpayer of taxpayers) if (taxpayer.taxpayerType !== "PF" && taxpayer.taxpayerType !== "PJ" || taxpayer.taxpayerType === "PF" && (!taxpayer.personId || taxpayer.companyId) || taxpayer.taxpayerType === "PJ" && (!taxpayer.companyId || taxpayer.personId)) add("Taxpayer", taxpayer.id, "TAXPAYER_IDENTITY_TYPE_MISMATCH", "Tipo PF/PJ do contribuinte diverge dos vínculos de identidade.");
  for (const creditor of creditors) {
    if (creditor.supplierId) {
      const supplier = supplierById.get(creditor.supplierId);
      if (!supplier || supplier.personId !== creditor.personId || supplier.companyId !== creditor.companyId || !creditor.personId && !creditor.companyId) add("Creditor", creditor.id, "CREDITOR_SUPPLIER_IDENTITY_MISMATCH", "Fornecedor e credor não possuem a mesma identidade canônica conciliada.");
    }
    if (creditor.document) {
      const canonicalDocument = creditor.personId ? personById.get(creditor.personId)?.cpf : creditor.companyId ? companyById.get(creditor.companyId)?.cnpj : undefined;
      if (!canonicalDocument || creditor.document.replace(/\D/g, "") !== canonicalDocument.replace(/\D/g, "")) add("Creditor", creditor.id, "CREDITOR_DOCUMENT_MISMATCH", "Documento do credor diverge da identidade canônica.");
    }
  }
  return issues.sort((a, b) => a.recordType.localeCompare(b.recordType) || a.recordId.localeCompare(b.recordId) || a.issueType.localeCompare(b.issueType));
}
