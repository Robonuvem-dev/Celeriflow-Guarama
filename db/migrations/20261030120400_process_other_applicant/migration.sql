ALTER TABLE "ProcessReferenceCatalog" DROP CONSTRAINT "ProcessReferenceCatalog_kind_check";
ALTER TABLE "ProcessReferenceCatalog" ADD CONSTRAINT "ProcessReferenceCatalog_kind_check" CHECK ("kind" IN ('SUBJECT_CHILD','PHYSICAL_LOCATION','REQUIRED_DOCUMENT','JUSTIFICATION','REQUEST_METHOD','OTHER_APPLICANT'));
ALTER TABLE "ProcessRegistrationDetail" ADD COLUMN "otherApplicantId" text REFERENCES "ProcessReferenceCatalog"("id");
