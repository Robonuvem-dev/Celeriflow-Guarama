import assert from "node:assert/strict";
import test from "node:test";
import { C7OperationError, createInternalControlPlan } from "../operations-service";

test("C7 requires a title and reference before creating a control plan", async () => {
  await assert.rejects(
    () => createInternalControlPlan({} as never, { usuarioId: "user-1" }, { title: "", reference: "" }),
    C7OperationError,
  );
});
