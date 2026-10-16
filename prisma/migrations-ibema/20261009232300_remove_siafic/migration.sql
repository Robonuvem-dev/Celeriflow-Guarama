-- Remove the retired integration in dependency order without affecting other connectors.
DROP TABLE IF EXISTS "SiaficDeliveryAttempt";
DROP TABLE IF EXISTS "SiaficDelivery";
DROP TABLE IF EXISTS "SiaficExternalLink";
DROP TABLE IF EXISTS "SiaficOutboxEvent";
DROP TABLE IF EXISTS "SiaficEntityVersion";

DELETE FROM "IntegrationConnection" WHERE "code" = 'SIAFIC_DEMO';
