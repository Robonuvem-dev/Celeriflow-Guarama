import type { CentralSignatureRecord } from "@/lib/contracts/signature-central";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export function selectRecords(records: readonly CentralSignatureRecord[], query: string, requestedPage: number) {
  const search = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = search ? records.filter(record => [record.code, record.filename, record.documentTypeName, record.signerName, record.signerRole, record.signerDocument, record.method, record.hashSha256].some(value => value.toLocaleLowerCase("pt-BR").includes(search))) : records;
  const total = filtered.length;
  const page = Math.min(Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  return { total, page, records: filtered.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE) };
}
