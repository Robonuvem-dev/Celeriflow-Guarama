import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = "https://parallelum.com.br/fipe/api/v1/carros/marcas/26/modelos";
const response = await fetch(source, { signal: AbortSignal.timeout(60000) });
if (!response.ok) throw new Error(`Consulta de modelos FIPE: HTTP ${response.status}`);
const text = await response.text(), data = JSON.parse(text);
const models = data.modelos.filter(model => model.nome.startsWith("HB20S"));
if (!models.some(model => model.codigo === 10821)) throw new Error("Modelo HB20S Comfort Plus Turbo não localizado na fonte.");
const now = new Date().toISOString();
const catalog = { kind: "FIPE", reference: `Modelos Hyundai HB20S · consulta ${now.slice(0, 7)}`, sourceReference: `${source} · API pública de consulta FIPE Parallelum; amostra de modelos Hyundai HB20S`, complete: false, entries: models.map(model => ({ code: `Hyundai-${model.codigo}`, name: model.nome, details: { brand: "Hyundai", model: model.nome, yearLabel: "Anos/modelo consultáveis na fonte", referenceMonth: now.slice(0, 7), sourceUrl: source, sourceHash: createHash("sha256").update(text).digest("hex") } })) };
const directory = join(process.cwd(), "data", "frotas");
if (!existsSync(directory)) throw new Error("Diretório data/frotas não encontrado.");
writeFileSync(join(directory, "fipe-hb20s.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`${models.length} modelos HB20S recebidos da consulta FIPE, com identificação de amostra e hash da resposta.`);
