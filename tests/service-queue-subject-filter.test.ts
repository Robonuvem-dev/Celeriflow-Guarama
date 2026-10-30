import test from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { serviceQueueSubjectCondition } from "../src/lib/protocols/service-queue-filters";

test("fila de serviços filtra pelo assunto do processo com parâmetro SQL", () => {
  assert.equal(serviceQueueSubjectCondition(""), undefined);
  const condition = serviceQueueSubjectCondition("assunto-'%_1");
  assert.ok(condition);
  const query = new PgDialect().sqlToQuery(condition);
  assert.match(query.sql, /"Process"\."subjectId" = \$1/);
  assert.deepEqual(query.params, ["assunto-'%_1"]);
});
