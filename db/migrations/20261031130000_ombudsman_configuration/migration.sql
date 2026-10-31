ALTER TABLE "OmbudsmanReferenceCatalog"
 ADD COLUMN "isAnonymous" boolean NOT NULL DEFAULT true,
 ADD COLUMN "isOnline" boolean NOT NULL DEFAULT true,
 ADD COLUMN "serviceInformation" text;
ALTER TABLE "OmbudsmanReferenceCatalog" DROP CONSTRAINT "OmbudsmanReferenceCatalog_requestType_check";
ALTER TABLE "OmbudsmanReferenceCatalog" ADD CONSTRAINT "OmbudsmanReferenceCatalog_requestType_check"
 CHECK ("requestType" IN ('Denúncia','Reclamação','Sugestão','Elogio','Solicitação','Ocorrência'));
CREATE TABLE "OmbudsmanConfiguration" (
 "id" text PRIMARY KEY,
 "kind" text NOT NULL CHECK ("kind" IN ('ROUTE','QUESTIONNAIRE','STATUS')),
 "name" text NOT NULL CHECK (length(trim("name")) BETWEEN 1 AND 200),
 "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "isActive" boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "OmbudsmanConfiguration_route_sequence_key" ON "OmbudsmanConfiguration"
 (("settings"->>'requestType'), ("settings"->>'subjectId'), ("settings"->>'subsubjectId'), ("settings"->>'routeNumber'), ("settings"->>'sequence')) WHERE "kind"='ROUTE';

INSERT INTO "OmbudsmanReferenceCatalog" ("id","kind","requestType","name") VALUES
 ('cf04-street','SUBJECT','Solicitação','Rua e Bairro'),
 ('cf04-cleaning','SUBJECT','Solicitação','Lixo e Limpeza')
ON CONFLICT DO NOTHING;
INSERT INTO "OmbudsmanReferenceCatalog" ("id","kind","requestType","name","subjectId","serviceInformation")
SELECT seed.id,'SUBSUBJECT','Solicitação',seed.name,parent.id,seed.information
FROM (VALUES
 ('cf04-pothole','Rua e Bairro','Tapa-buraco','Informe rua, bairro, ponto de referência e a localização do buraco.'),
 ('cf04-urban-care','Rua e Bairro','Zeladoria da cidade','Descreva a necessidade de manutenção e informe rua e bairro.'),
 ('cf04-drains','Rua e Bairro','Limpeza de bueiros, boca de lobo e poços de visita','Informe o endereço e os pontos que necessitam de limpeza ou desobstrução.'),
 ('cf04-noise','Rua e Bairro','Reclamação de poluição sonora','Informe rua, bairro, origem do ruído e os horários da ocorrência.'),
 ('cf04-sweeping','Lixo e Limpeza','Varrição','Informe rua, bairro e trecho que necessita de varrição.'),
 ('cf04-household-waste','Lixo e Limpeza','Coleta de lixo domiciliar','Informe endereço, dias e o problema com a coleta domiciliar.'),
 ('cf04-recycling','Lixo e Limpeza','Coleta de lixo reciclável','Informe endereço e a necessidade de coleta de materiais recicláveis.'),
 ('cf04-debris','Lixo e Limpeza','Remoção de entulho em via pública','Informe rua, bairro e o ponto onde se encontra o entulho.')
) AS seed(id,subject,name,information)
JOIN "OmbudsmanReferenceCatalog" parent ON parent."kind"='SUBJECT' AND parent."requestType"='Solicitação' AND lower(trim(parent."name"))=lower(seed.subject)
ON CONFLICT DO NOTHING;
