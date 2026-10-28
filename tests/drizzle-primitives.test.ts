import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { Decimal as LegacyDecimal } from "@prisma/client/runtime/client";
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
  for (const value of ["0.1", "1.005", "-1.005", "999999999999999999.99", "1e-8", "1e+21", "123456789.123456789"]) {
    const migrated = new Decimal(value);
    const legacy = new LegacyDecimal(value);
    assert.equal(migrated.toString(), legacy.toString());
    assert.equal(migrated.toFixed(2), legacy.toFixed(2));
    assert.equal(JSON.stringify(migrated), JSON.stringify(legacy));
    assert.equal(migrated.div(7).mul("1.125").plus("0.03").toString(), legacy.div(7).mul("1.125").plus("0.03").toString());
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
