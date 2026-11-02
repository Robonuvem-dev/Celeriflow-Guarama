import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { normalizeGedText, type GedQuery } from "./ged-policy";

type Node = { type: "term"; value: string; field: string; phrase: boolean } | { type: "not"; child: Node } | { type: "and" | "or"; left: Node; right: Node };
export function parseGedBoolean(input: string): Node {
  const tokens = input.match(/(?:[a-zA-Z_][\w.]*:)?"[^"]*"|\(|\)|[^\s()]+/g) ?? [];
  if (tokens.length > 100 || (input.match(/"/g)?.length ?? 0) % 2) throw new Error("Expressão de pesquisa inválida.");
  let cursor = 0;
  function atom(): Node {
    const token = tokens[cursor++]; if (!token) throw new Error("Falta um termo na pesquisa.");
    if (token.toUpperCase() === "NOT") return { type: "not", child: atom() };
    if (token === "(") { const node = expression(); if (tokens[cursor++] !== ")") throw new Error("Parênteses não fechados."); return node; }
    if ([")", "AND", "OR"].includes(token.toUpperCase())) throw new Error("Operador sem termo.");
    const separator = token.indexOf(":"); const field = separator > 0 ? token.slice(0, separator) : ""; const raw = separator > 0 ? token.slice(separator + 1) : token;
    if (!raw) throw new Error("Informe o valor do campo.");
    return { type: "term", field, value: raw.replace(/^"|"$/g, ""), phrase: raw.startsWith('"') };
  }
  function conjunction(): Node {
    let node = atom(); while (cursor < tokens.length && tokens[cursor] !== ")" && tokens[cursor].toUpperCase() !== "OR") { if (tokens[cursor].toUpperCase() === "AND") cursor++; node = { type: "and", left: node, right: atom() }; } return node;
  }
  function expression(): Node { let node = conjunction(); while (tokens[cursor]?.toUpperCase() === "OR") { cursor++; node = { type: "or", left: node, right: conjunction() }; } return node; }
  const node = expression(); if (cursor !== tokens.length) throw new Error("Expressão de pesquisa inválida."); return node;
}

export async function gedUnifiedCondition(database: DatabaseExecutor, query: GedQuery): Promise<SQL> {
  if (!query.text) return sql`TRUE`;
  const match = (column: SQL, value: string, mode: string): SQL => {
    const normalized = normalizeGedText(value);
    if (mode === "wildcard" || /[*?]/.test(value)) {
      const pattern = normalized.replace(/[\\%_]/g, "\\$&").replace(/\*/g, "%").replace(/\?/g, "_");
      return sql`EXISTS(SELECT 1 FROM regexp_split_to_table(ged_normalize(${column}),'[[:space:]]+') word WHERE word LIKE ${pattern} ESCAPE '\\')`;
    }
    if (mode === "fuzzy") return sql`EXISTS(SELECT 1 FROM regexp_split_to_table(ged_normalize(${column}),'[^[:alnum:]_]+') word WHERE ged_similarity(word,${normalized})>=0.38)`;
    if (mode === "fragment") return sql`strpos(ged_normalize(${column}),${normalized})>0`;
    if (mode === "phrase") return sql`to_tsvector('simple',ged_normalize(${column})) @@ phraseto_tsquery('simple',${normalized})`;
    return sql`to_tsvector('simple',ged_normalize(${column})) @@ plainto_tsquery('simple',${normalized})`;
  };
  const term = (value: string, field = "", phrase = false): SQL => {
    const mode = phrase ? "phrase" : query.mode;
    if (field === "title" || field === "titulo") return match(sql`d.title`, value, mode);
    if (field === "filename" || field === "arquivo") return match(sql`coalesce(vf.filename,e.filename)`, value, mode);
    if (field === "type" || field === "tipo") return match(sql`dc.code || ' ' || dc.label`, value, mode);
    if (field.startsWith("meta.")) return match(sql`gm.values->>${field.slice(5)}`, value, mode);
    const content = sql`EXISTS(SELECT 1 FROM "GedTextPage" p WHERE p."versionId"=v.id AND ${match(sql`p.text`, value, mode)})`;
    if (field === "content" || field === "conteudo") return content;
    if (field) throw new Error(`Campo de pesquisa desconhecido: ${field}.`);
    return sql`(${match(sql`d.title || ' ' || coalesce(vf.filename,e.filename) || ' ' || coalesce(gm.values::text,'') || ' ' || coalesce(gm.tags::text,'')`, value, mode)} OR ${content})`;
  };
  if (query.mode === "boolean") {
    const compile = (node: Node): SQL => {
      if (node.type === "term") return term(node.value, node.field, node.phrase);
      if (node.type === "not") return sql`NOT (${compile(node.child)})`;
      return node.type === "and" ? sql`(${compile(node.left)} AND ${compile(node.right)})` : sql`(${compile(node.left)} OR ${compile(node.right)})`;
    };
    return compile(parseGedBoolean(query.text));
  }
  if (query.mode === "words" && query.thesaurus) {
    const dictionary = await database.execute<{ term: string; equivalents: string[] }>(sql`SELECT term,equivalents FROM "GedThesaurus"`);
    return sql.join(normalizeGedText(query.text).split(/\s+/).filter(Boolean).map(word => {
      const entry = dictionary.rows.find(d => d.term === word || d.equivalents.includes(word));
      return sql`(${sql.join((entry ? [entry.term, ...entry.equivalents] : [word]).map(value => term(value)), sql` OR `)})`;
    }), sql` AND `);
  }
  if (query.mode === "words" || query.mode === "fuzzy") return sql.join(query.text.split(/\s+/).filter(Boolean).map(value => sql`(${term(value)})`), sql` AND `);
  return term(query.text);
}

export function gedRank(query: GedQuery) {
  const value = normalizeGedText(query.mode === "boolean" ? query.text.replace(/\b(?:AND|OR|NOT)\b|\b[\w.]+:/gi, " ").replace(/[()"*?]/g, " ").trim() : query.text);
  return sql`((CASE WHEN strpos(ged_normalize(d.title),${value})>0 THEN 3 ELSE 0 END) +
    (CASE WHEN strpos(ged_normalize(coalesce(vf.filename,e.filename)),${value})>0 THEN 1 ELSE 0 END) +
    coalesce((SELECT max(ts_rank_cd(p.search,plainto_tsquery('simple',${value}))) FROM "GedTextPage" p WHERE p."versionId"=v.id),0)) * coalesce((td.policy->>'rankWeight')::float8,1)`;
}
