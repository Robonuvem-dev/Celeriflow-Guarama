import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = "https://parallelum.com.br/fipe/api/v1/carros";
const now = new Date().toISOString();
async function request(path) {
  const source = `${base}${path}`, response = await fetch(source, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Consulta FIPE ${path}: HTTP ${response.status}`);
  const text = await response.text();
  return { source, text, data: JSON.parse(text), hash: createHash("sha256").update(text).digest("hex") };
}

const brands = await request("/marcas");
if (!Array.isArray(brands.data) || !brands.data.length) throw new Error("A fonte FIPE não retornou marcas de carros.");
const entries = [], sources = [{ url: brands.source, sha256: brands.hash }];
const concurrency = 8;
for (let offset = 0; offset < brands.data.length; offset += concurrency) {
  const batch = await Promise.all(brands.data.slice(offset, offset + concurrency).map(async brand => {
    const models = await request(`/marcas/${encodeURIComponent(brand.codigo)}/modelos`);
    if (!Array.isArray(models.data?.modelos)) throw new Error(`Modelos inválidos para a marca ${brand.nome}.`);
    return { brand, models };
  }));
  for (const { brand, models } of batch) {
    sources.push({ url: models.source, sha256: models.hash });
    for (const model of models.data.modelos) entries.push({ code: `${brand.codigo}-${model.codigo}`, name: `${brand.nome} · ${model.nome}`, details: { brand: brand.nome, model: model.nome, yearLabel: "Anos/modelo consultáveis na fonte", referenceMonth: now.slice(0, 7), sourceUrl: models.source, sourceHash: models.hash } });
  }
  console.log(`[FIPE] ${Math.min(offset + concurrency, brands.data.length)}/${brands.data.length} marcas; ${entries.length} modelos`);
}
if (!entries.length || new Set(entries.map(entry => entry.code)).size !== entries.length) throw new Error("A consolidação FIPE retornou modelos vazios ou identificações duplicadas.");
const catalog = { kind: "FIPE", reference: `Modelos de carros FIPE · consulta ${now.slice(0, 7)}`, sourceReference: `${base}/marcas e catálogos por marca · API pública de consulta FIPE Parallelum; catálogo integral de modelos de carros retornado na consulta`, complete: true, entries, provenance: { fetchedAt: now, sources, brandCount: brands.data.length, modelCount: entries.length } };
const directory = join(process.cwd(), "data", "frotas");
if (!existsSync(directory)) throw new Error("Diretório data/frotas não encontrado.");
writeFileSync(join(directory, "fipe-carros.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`${entries.length} modelos FIPE de ${brands.data.length} marcas gravados com hashes de cada origem.`);
