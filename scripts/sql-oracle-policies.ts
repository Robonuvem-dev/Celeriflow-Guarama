import type { CanonicalIdentitySource, IdentityIssue } from "../src/lib/cadastros/canonical-identity-policy";
import type { MergeCandidatePerson, MergeCandidate } from "../src/lib/cadastros/person-merge-policy";

// Frozen, script-owned expectations. No production policy function is called.
export function expectedMergeRanking(source: MergeCandidatePerson, people: MergeCandidatePerson[]): MergeCandidate[] {
  const normalized = (value?: string | null) => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const phone = (value?: string | null) => (value || "").replace(/\D/g, "");
  return people.filter(person => person.id !== source.id && person.status !== "Arquivado por mesclagem").map(person => {
    const reasons: string[] = [];
    let score = 0;
    if (normalized(source.fullName) && normalized(source.fullName) === normalized(person.fullName)) { score += 60; reasons.push("NOME_NORMALIZADO"); }
    if (source.cpf && source.cpf === person.cpf) { score += 100; reasons.push("CPF_IGUAL"); }
    if (source.birthDate && person.birthDate && source.birthDate.toISOString().slice(0, 10) === person.birthDate.toISOString().slice(0, 10)) { score += 20; reasons.push("DATA_NASCIMENTO"); }
    if (source.email && normalized(source.email) === normalized(person.email)) { score += 10; reasons.push("EMAIL_NORMALIZADO"); }
    if (phone(source.phonePrimary) && phone(source.phonePrimary) === phone(person.phonePrimary)) { score += 10; reasons.push("TELEFONE_NORMALIZADO"); }
    return { personId: person.id, score, reasons };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.personId.localeCompare(b.personId));
}

function validDocument(value: string | null, kind: "Person" | "Company") {
  const text = (value || "").replace(/\D/g, "");
  if (text.length !== (kind === "Person" ? 11 : 14) || /^(\d)\1+$/.test(text)) return { normalized: text, valid: false };
  let stem = text.slice(0, kind === "Person" ? 9 : 12);
  for (let pass = 0; pass < 2; pass++) {
    const weights = kind === "Person" ? Array.from({ length: stem.length }, (_, i) => stem.length + 1 - i) : pass === 0 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...stem].reduce((total, digit, i) => total + Number(digit) * weights[i], 0);
    const remainder = kind === "Person" ? sum * 10 % 11 : sum % 11;
    stem += kind === "Person" ? remainder === 10 ? 0 : remainder : remainder < 2 ? 0 : 11 - remainder;
  }
  return { normalized: text, valid: stem === text };
}

export function expectedCanonicalIssues({ persons, companies, taxpayers, suppliers, creditors }: CanonicalIdentitySource): IdentityIssue[] {
  const issues: IdentityIssue[] = [];
  const add = (recordType: string, recordId: string, issueType: string, description: string) => issues.push({ recordType, recordId, issueType, description, severity: "ALTA" });
  const personById = new Map(persons.map(row => [row.id, row])), companyById = new Map(companies.map(row => [row.id, row])), supplierById = new Map(suppliers.map(row => [row.id, row]));
  for (const [recordType, rows] of [["Person", persons.map(row => ({ id: row.id, document: row.cpf }))], ["Company", companies.map(row => ({ id: row.id, document: row.cnpj }))]] as const) {
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      const validation = validDocument(row.document, recordType);
      if (!validation.valid) { add(recordType, row.id, "CANONICAL_DOCUMENT_INVALID", "Identidade canônica com documento ausente ou inválido; exige conferência cadastral."); continue; }
      groups.set(validation.normalized, [...(groups.get(validation.normalized) || []), row.id]);
    }
    for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) add(recordType, id, "CANONICAL_DOCUMENT_DUPLICATE", "Documento normalizado repetido em identidades canônicas distintas; históricos preservados, sem mesclagem automática.");
  }
  for (const [recordType, rows] of [["Taxpayer", taxpayers], ["Supplier", suppliers], ["Creditor", creditors]] as const) {
    const groups = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.personId && !row.companyId) { add(recordType, row.id, "CANONICAL_IDENTITY_MISSING", "Cadastro sem identidade PF/PJ canônica."); continue; }
      if (row.personId && row.companyId) { add(recordType, row.id, "CANONICAL_IDENTITY_AMBIGUOUS", "Cadastro possui simultaneamente vínculos PF e PJ; exige decisão documental."); continue; }
      if (row.personId && !personById.has(row.personId) || row.companyId && !companyById.has(row.companyId)) add(recordType, row.id, "CANONICAL_IDENTITY_NOT_FOUND", "Cadastro aponta para identidade canônica inexistente.");
      const key = row.personId ? `PF:${row.personId}` : `PJ:${row.companyId}`;
      groups.set(key, [...(groups.get(key) || []), row.id]);
    }
    for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) add(recordType, id, "CANONICAL_ROLE_DUPLICATE", "Identidade repetida no mesmo papel cadastral; os registros exigem conciliação documental individual.");
  }
  for (const row of taxpayers) if (row.taxpayerType !== "PF" && row.taxpayerType !== "PJ" || row.taxpayerType === "PF" && (!row.personId || row.companyId) || row.taxpayerType === "PJ" && (!row.companyId || row.personId)) add("Taxpayer", row.id, "TAXPAYER_IDENTITY_TYPE_MISMATCH", "Tipo PF/PJ do contribuinte diverge dos vínculos de identidade.");
  for (const row of creditors) {
    if (row.supplierId) {
      const supplier = supplierById.get(row.supplierId);
      if (!supplier || supplier.personId !== row.personId || supplier.companyId !== row.companyId || !row.personId && !row.companyId) add("Creditor", row.id, "CREDITOR_SUPPLIER_IDENTITY_MISMATCH", "Fornecedor e credor não possuem a mesma identidade canônica conciliada.");
    }
    if (row.document) {
      const document = row.personId ? personById.get(row.personId)?.cpf : row.companyId ? companyById.get(row.companyId)?.cnpj : undefined;
      if (!document || row.document.replace(/\D/g, "") !== document.replace(/\D/g, "")) add("Creditor", row.id, "CREDITOR_DOCUMENT_MISMATCH", "Documento do credor diverge da identidade canônica.");
    }
  }
  return issues.sort((a, b) => a.recordType.localeCompare(b.recordType) || a.recordId.localeCompare(b.recordId) || a.issueType.localeCompare(b.issueType));
}
