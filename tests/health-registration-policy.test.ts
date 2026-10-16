import assert from "node:assert/strict";
import test from "node:test";
import { ageOn, cpfRequired, patientRegistrationPolicySchema, registrationValidity } from "../src/lib/saude/patient-registration-policy";

test("CPF é exigido exatamente a partir da idade configurada, sem inventar identificador", () => {
  const policy = patientRegistrationPolicySchema.parse({ cpfRequiredFromAge: 18 });
  assert.equal(ageOn(new Date("2008-10-15T12:00:00Z"), new Date("2026-10-14T12:00:00Z")), 17);
  assert.equal(cpfRequired(policy, "COMPLETE", new Date("2008-10-15T12:00:00Z"), new Date("2026-10-14T12:00:00Z")), false);
  assert.equal(cpfRequired(policy, "COMPLETE", new Date("2008-10-15T12:00:00Z"), new Date("2026-10-15T12:00:00Z")), true);
  assert.equal(cpfRequired(policy, "PRE", null), false);
  assert.equal(cpfRequired(policy, "COMPLETE", null), true);
});

test("validades de pré-cadastro e cadastro são independentes por política", () => {
  const policy = patientRegistrationPolicySchema.parse({ preRegistrationDays: 7, registrationDays: 365, allowOutdatedForUrgency: true });
  const reviewedAt = new Date("2026-01-01T12:00:00Z"), now = new Date("2026-01-09T12:00:00Z");
  assert.equal(registrationValidity(policy, "PRE", reviewedAt, now).expired, true);
  assert.equal(registrationValidity(policy, "COMPLETE", reviewedAt, now).expired, false);
  assert.equal(registrationValidity(patientRegistrationPolicySchema.parse({}), "COMPLETE", reviewedAt, now).expiresAt, null);
  assert.throws(() => patientRegistrationPolicySchema.parse({ preRegistrationDays: 0 }));
});
