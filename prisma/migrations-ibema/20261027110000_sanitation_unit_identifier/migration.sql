BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "SanConsumerUnit"
    GROUP BY to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM')
    HAVING count(*) > 99999
  ) THEN RAISE EXCEPTION 'Limite mensal de 99999 unidades consumidoras excedido'; END IF;
END $$;

-- Temporary unique values avoid collisions while replacing existing codes.
UPDATE "SanConsumerUnit" SET "code" = 'san-identifier-migration:' || "id";
WITH identifiers AS (
  SELECT "id",
    to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM') AS period,
    row_number() OVER (
      PARTITION BY to_char("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYYMM')
      ORDER BY "createdAt", "id"
    ) AS sequence
  FROM "SanConsumerUnit"
)
UPDATE "SanConsumerUnit" AS unit
SET "code" = identifiers.period || lpad(identifiers.sequence::text, 5, '0')
FROM identifiers WHERE unit."id" = identifiers."id";

COMMIT;
