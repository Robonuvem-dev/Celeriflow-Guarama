import { createHash } from "node:crypto";
import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import { DEMO_LABEL, type Artifact, type DemoState } from "./contract";

export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const options = { ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false };
export function buildXml(root: Record<string, unknown>) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${DEMO_LABEL}; XML conceitual, não validado por XSD oficial. -->\n` + new XMLBuilder({ ...options, format: true }).build({ eSocial: { "@_xmlns": "urn:celeriflow:esocial:demo:retorno-processamento", ...root } });
}
export function parseDemoXml(xml: string): Record<string, any> {
  if (Buffer.byteLength(xml, "utf8") > 500_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("XML demonstrativo inválido ou acima de 500 KB.");
  const parsed = new XMLParser(options).parse(xml);
  if (!String(parsed.eSocial?.["@_xmlns"] || "").startsWith("urn:celeriflow:esocial:demo:")) throw new Error("Esta importação aceita somente XML demonstrativo do kit, em namespace privado.");
  return parsed.eSocial;
}
export function artifact(state: DemoState, kind: Artifact["kind"], xml: string, at: string): string {
  parseDemoXml(xml);
  const hash = digest(xml), id = `DEMO-XML-${kind}-${hash}`;
  if (!state.artifacts.some(row => row.id === id)) state.artifacts.push({ id, kind, xml, hash, createdAt: at });
  return id;
}
export function array<T>(value: T | T[] | undefined): T[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
