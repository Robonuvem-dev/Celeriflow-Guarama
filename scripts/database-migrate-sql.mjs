// This scanner only locates top-level SQL statements. PostgreSQL still parses
// and executes the original SQL. Strings, quoted identifiers, nested comments
// and dollar-quoted function bodies must not expose transaction keywords.
export function scanSql(sql) {
  const statements = [];
  let start = 0, words = [], index = 0, codeStart = null, codeEnd = null;
  const fail = message => { throw new Error(`Invalid migration SQL at offset ${index}: ${message}`); };
  const push = (end, terminatorStart = null) => {
    if (words.length) statements.push({ start, end, words, codeStart, codeEnd, terminatorStart });
    start = end;
    words = [];
    codeStart = null;
    codeEnd = null;
  };
  while (index < sql.length) {
    const char = sql[index], next = sql[index + 1];
    if (/\s/.test(char)) { index++; continue; }
    if (char === "-" && next === "-") {
      const end = sql.indexOf("\n", index + 2);
      index = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (char === "/" && next === "*") {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth) {
        if (sql.startsWith("/*", index)) { depth++; index += 2; }
        else if (sql.startsWith("*/", index)) { depth--; index += 2; }
        else index++;
      }
      if (depth) fail("unterminated block comment");
      continue;
    }
    if (char !== ";" && codeStart === null) codeStart = index;
    if (char === "'" || char === '"') {
      const escaped = char === "'" && /[eE]/.test(sql[index - 1] ?? "") && !/[\w$]/.test(sql[index - 2] ?? "");
      let closed = false;
      index++;
      while (index < sql.length) {
        if (escaped && sql[index] === "\\") { index += 2; continue; }
        if (sql[index] === char) {
          if (sql[index + 1] === char) { index += 2; continue; }
          index++;
          closed = true;
          break;
        }
        index++;
      }
      if (!closed) fail("unterminated quoted value");
      words.push(char === "'" ? "<literal>" : "<identifier>");
      codeEnd = index;
      continue;
    }
    if (char === "$") {
      const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end === -1) fail("unterminated dollar quote");
        words.push("<body>");
        index = end + tag.length;
        codeEnd = index;
        continue;
      }
    }
    if (char === ";") { const terminatorStart = index++; push(index, terminatorStart); continue; }
    const word = sql.slice(index).match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    if (word) { words.push(word.toUpperCase()); index += word.length; }
    else { words.push(char); index++; }
    codeEnd = index;
  }
  push(sql.length);
  return statements;
}

export function prepareMigrationSql(sql, { name, allowHistoricalEnvelope = false }) {
  let statements = scanSql(sql);
  if (!statements.length) throw new Error(`${name}: empty migration`);
  let executionSql = sql;
  if (allowHistoricalEnvelope) {
    const first = statements[0], last = statements.at(-1);
    if (first.words.join(" ") !== "BEGIN" || last.words.join(" ") !== "COMMIT") {
      throw new Error(`${name}: the reviewed historical BEGIN/COMMIT envelope changed`);
    }
    // The opening envelope's header follows the existing execution contract.
    // Remove the control tokens/semicolons by their actual code positions:
    // last.start includes preceding comments/newlines that belong to the body.
    const omitted = [[0, first.codeEnd]];
    if (first.terminatorStart !== null) omitted.push([first.terminatorStart, first.terminatorStart + 1]);
    omitted.push([last.codeStart, last.codeEnd]);
    if (last.terminatorStart !== null) omitted.push([last.terminatorStart, last.terminatorStart + 1]);
    let retainedFrom = 0;
    executionSql = "";
    for (const [start, end] of omitted) {
      executionSql += sql.slice(retainedFrom, start);
      retainedFrom = end;
    }
    executionSql += sql.slice(retainedFrom);
    statements = statements.slice(1, -1);
  }
  for (const { words } of statements) {
    const first = words[0], text = words.join(" ");
    if (["BEGIN", "START", "COMMIT", "END", "ROLLBACK", "ABORT", "SAVEPOINT", "RELEASE", "PREPARE", "EXECUTE", "DISCARD"].includes(first)) {
      throw new Error(`${name}: transaction/session control is owned by the SQL runner (${first})`);
    }
    if (["VACUUM", "CLUSTER", "REINDEX", "CALL", "COPY"].includes(first)
      || /^(CREATE|DROP) (DATABASE|TABLESPACE|SUBSCRIPTION)\b/.test(text)
      || words.includes("CONCURRENTLY")) {
      throw new Error(`${name}: non-transactional/unsupported migration statement (${first})`);
    }
    if (first === "SET" || first === "RESET" || /\bSET_CONFIG\b/.test(text)) {
      throw new Error(`${name}: migrations must not override runner session settings`);
    }
  }
  return { executionSql, statementCount: statements.length, historicalEnvelope: allowHistoricalEnvelope };
}
