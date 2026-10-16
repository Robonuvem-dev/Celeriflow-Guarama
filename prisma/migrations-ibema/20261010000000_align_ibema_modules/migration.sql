-- Alinha o catalogo contratado pela instancia de Ibema com os modulos avaliados na POC.
UPDATE "ConfiguracaoModulo"
SET "ativo" = false,
    "dataAtivacao" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "codigo" IN ('EDUCACAO', 'CULTURA', 'SANEAMENTO', 'SEGURANCA', 'MEIO_AMBIENTE');

UPDATE "ConfiguracaoModulo"
SET "ativo" = true,
    "dataAtivacao" = COALESCE("dataAtivacao", CURRENT_TIMESTAMP),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "codigo" = 'OBRAS';
