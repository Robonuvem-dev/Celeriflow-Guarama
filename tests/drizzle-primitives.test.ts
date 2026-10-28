import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { Decimal } from "../src/db/decimal";
import { createId } from "../src/db/ids";
import { getPostgresError, PersistenceError, translateDatabaseError } from "../src/db/errors";

test("IDs novos mantêm o formato cuid aceito pelos contratos atuais", () => {
  const identifiers = Array.from({ length: 10_000 }, createId);
  assert.equal(new Set(identifiers).size, identifiers.length);
  for (const identifier of identifiers) {
    assert.match(identifier, /^c[a-z0-9]{24}$/);
    assert.equal(z.string().cuid().safeParse(identifier).success, true);
  }
});

test("decimais independentes preservam precisão, arredondamento e JSON existentes", () => {
  // Golden values captured from the pre-removal decimal runtime. Keeping the
  // independent expectations avoids requiring a generated ORM in this test.
  const cases = [
    { value: "0.1", fixed2: "0.10", calculated: "0.046071428571428571428" },
    { value: "1.005", fixed2: "1.01", calculated: "0.19151785714285714286" },
    { value: "-1.005", fixed2: "-1.01", calculated: "-0.13151785714285714286" },
    { value: "999999999999999999.99", fixed2: "999999999999999999.99", calculated: "160714285714285714.31" },
    { value: "1e-8", fixed2: "0.00", calculated: "0.030000001607142857143" },
    { value: "1e+21", fixed2: "1000000000000000000000.00", calculated: "160714285714285714280" },
    { value: "123456789.123456789", fixed2: "123456789.12", calculated: "19841269.710555555375" },
  ];
  for (const { value, fixed2, calculated } of cases) {
    const migrated = new Decimal(value);
    assert.equal(migrated.toString(), value);
    assert.equal(migrated.toFixed(2), fixed2);
    assert.equal(JSON.stringify(migrated), JSON.stringify(value));
    assert.equal(migrated.div(7).mul("1.125").plus("0.03").toString(), calculated);
  }
});

test("erros PostgreSQL encapsulados preservam classificação e causa sem expor parâmetros", () => {
  for (const [code, kind] of Object.entries({ "23505": "unique", "23503": "foreign-key", "23001": "foreign-key", "23502": "not-null", "23514": "check", "40001": "serialization", "40P01": "deadlock", "25P04": "timeout", "57014": "timeout" })) {
    const postgres = { code, constraint: "fixture_constraint", message: "sensitive parameters" };
    const wrapped = new Error("query failed", { cause: postgres });
    const translated = translateDatabaseError(wrapped);
    assert.ok(translated instanceof PersistenceError);
    assert.equal(translated.kind, kind);
    assert.equal(translated.constraint, "fixture_constraint");
    assert.equal(translated.cause, wrapped);
    assert.doesNotMatch(translated.message, /sensitive|query/);
  }
  const unrelated = new Error("business rule");
  assert.equal(translateDatabaseError(unrelated), unrelated);
  const cyclic: { cause?: unknown } = {};
  cyclic.cause = cyclic;
  assert.equal(getPostgresError(cyclic), null);
});
