import assert from "node:assert/strict";
import test from "node:test";
import { querySocialSms, transmitSocialSms, type SocialSmsConfiguration } from "../src/lib/social/sms-adapter";

test("SMS: aceitação não significa entrega; falha ambígua exige conciliação", async () => {
  const reference = "SOCIAL_SMS_UNIT_TEST_CREDENTIAL";
  const previous = process.env[reference];
  process.env[reference] = JSON.stringify({ username: "fixture", password: "fixture" });
  const configuration: SocialSmsConfiguration = { provider: "SMSGATE", baseUrl: "https://sms.example.invalid", credentialReference: reference, sender: "Assistência Social" };
  const message = { id: "message-fixture", phone: "31999999999", body: "Compareça à unidade de referência." };
  try {
    const accepted = await transmitSocialSms(configuration, message, async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body.phoneNumbers, ["+5531999999999"]);
      assert.equal(body.withDeliveryReport, true);
      return Response.json({ id: message.id, state: "Pending" });
    });
    assert.equal(accepted.state, "ACCEPTED");
    assert.equal((await transmitSocialSms(configuration, message, async () => { throw new Error("timeout"); })).state, "UNKNOWN");
    assert.equal((await transmitSocialSms(configuration, message, async () => new Response("", { status: 503 }))).state, "UNKNOWN");
    assert.equal((await querySocialSms(configuration, message.id, async () => Response.json({ state: "Sent" }))).state, "SENT");
    assert.equal((await querySocialSms(configuration, message.id, async () => Response.json({ state: "Delivered" }))).state, "DELIVERED");
    assert.equal((await querySocialSms(configuration, message.id, async () => new Response("", { status: 404 }))).state, "UNKNOWN");
  } finally {
    if (previous === undefined) delete process.env[reference]; else process.env[reference] = previous;
  }
});
