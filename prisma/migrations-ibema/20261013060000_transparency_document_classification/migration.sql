ALTER TABLE "TransparencyPublication" ADD COLUMN "documentKind" TEXT NOT NULL DEFAULT 'OUTRO',
 ADD COLUMN "legalStage" TEXT NOT NULL DEFAULT 'REFERENCIA';
UPDATE "TransparencyPublication" SET "documentKind"='PCA_CONTAS',"legalStage"='EM_TRAMITACAO' WHERE id='ibema-archive-ND-025-v1';
UPDATE "TransparencyPublication" SET "documentKind"='PCA_CONTAS',"legalStage"='ANALISE_TECNICA' WHERE id='ibema-archive-ND-109-v1';
UPDATE "TransparencyPublication" SET "documentKind"='PCA_CONTRATACOES' WHERE id='ibema-archive-ND-030-v1';
