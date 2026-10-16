import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";

type XmlNode = Record<string, unknown>;
const node = (value: unknown): XmlNode => value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
const nodes = (value: unknown) => (Array.isArray(value) ? value : value == null ? [] : [value]).map(node);
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
function numeric(value: unknown, label: string, zero = false) {
  const parsed = Number(text(value));
  if (!text(value) || !Number.isFinite(parsed) || (zero ? parsed < 0 : parsed <= 0)) throw new Error(`Confira ${label} no XML da NF-e.`);
  return parsed;
}
function date(value: unknown, label: string, required = false) {
  const raw = text(value);
  if (!raw && !required) return null;
  const calendarDay = new Date(`${raw.slice(0, 10)}T12:00:00Z`);
  if (!raw || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) || !Number.isFinite(new Date(raw).valueOf()) || !Number.isFinite(calendarDay.valueOf()) || calendarDay.toISOString().slice(0, 10) !== raw.slice(0, 10)) throw new Error(`Confira ${label} no XML da NF-e.`);
  return raw;
}

export type PharmacyInvoiceItem = { key: string; line: string; supplierCode: string; barcode: string; description: string; unit: string; quantity: number; unitCost: number; batchNumber: string; productionDate: string | null; expirationDate: string | null };
export function parsePharmacyInvoice(content: string) {
  if (Buffer.byteLength(content, "utf8") > 2 * 1024 * 1024) throw new Error("O XML da NF-e deve ter até 2 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(content)) throw new Error("XML fiscal com declarações externas não é aceito.");
  if (XMLValidator.validate(content) !== true) throw new Error("XML fiscal inválido.");
  const parsed = node(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, processEntities: true, htmlEntities: false }).parse(content));
  const nfe = node(node(parsed.nfeProc).NFe || parsed.NFe), info = node(nfe.infNFe), ide = node(info.ide), emit = node(info.emit);
  if (!["3.10", "4.00"].includes(text(info["@_versao"])) || text(ide.mod) !== "55") throw new Error("Selecione um XML de NF-e modelo 55, versão 3.10 ou 4.00.");
  const key = text(info["@_Id"]).replace(/^NFe/, "");
  if (!/^\d{44}$/.test(key)) throw new Error("Chave de acesso da NF-e ausente ou inválida.");
  const supplierCnpj = text(emit.CNPJ).replace(/\D/g, "");
  if (supplierCnpj.length !== 14 || !text(emit.xNome) || !text(ide.nNF)) throw new Error("Identificação do emitente ou da nota incompleta.");
  const issuedAt = date(ide.dhEmi || ide.dEmi, "a emissão", true)!;
  const items: PharmacyInvoiceItem[] = [];
  const lines = nodes(info.det);
  if (!lines.length || lines.length > 1000) throw new Error("A NF-e deve conter entre 1 e 1000 itens.");
  for (const detail of lines) {
    const product = node(detail.prod), line = text(detail["@_nItem"]);
    const quantity = numeric(product.qCom, "a quantidade"), unitCost = numeric(product.vUnCom, "o custo unitário", true);
    if (!line || !text(product.cProd) || !text(product.xProd) || !text(product.uCom)) throw new Error("Item da NF-e sem identificação, descrição ou unidade comercial.");
    const batches = nodes(product.rastro).length ? nodes(product.rastro) : nodes(product.med).filter(medication => text(medication.nLote));
    const base = { line, supplierCode: text(product.cProd), barcode: text(product.cEAN), description: text(product.xProd), unit: text(product.uCom), unitCost };
    if (!batches.length) items.push({ ...base, key: `${line}:0`, quantity, batchNumber: "", productionDate: null, expirationDate: null });
    else {
      const total = batches.reduce((sum, batch) => sum + numeric(batch.qLote, "a quantidade do lote"), 0);
      if (Math.abs(total - quantity) > 0.000001) throw new Error(`Os lotes do item ${line} não totalizam a quantidade comercial. Confira o XML e a unidade de fornecimento.`);
      batches.forEach((batch, index) => {
        const batchNumber = text(batch.nLote), productionDate = date(batch.dFab, "a fabricação"), expirationDate = date(batch.dVal, "a validade", true);
        if (!batchNumber || productionDate && expirationDate && productionDate > expirationDate) throw new Error(`Lote ou datas incoerentes no item ${line}.`);
        items.push({ ...base, key: `${line}:${index}`, quantity: numeric(batch.qLote, "a quantidade do lote"), batchNumber, productionDate, expirationDate });
      });
    }
  }
  if (new Set(items.map(item => item.key)).size !== items.length) throw new Error("A NF-e possui numeração de itens duplicada.");
  return { invoiceKey: key, invoiceNumber: text(ide.nNF), series: text(ide.serie), invoiceIssuedAt: issuedAt, invoiceXmlHash: createHash("sha256").update(content).digest("hex"), supplierCnpj, supplierName: text(emit.xNome), items };
}
