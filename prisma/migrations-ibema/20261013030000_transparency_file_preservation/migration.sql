CREATE FUNCTION preserve_transparency_publication_file() RETURNS trigger AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
   IF OLD."status" <> 'DRAFT' THEN RAISE EXCEPTION 'Published transparency files are preserved'; END IF;
   RETURN OLD;
 END IF;
 IF NEW."publicKey" IS DISTINCT FROM OLD."publicKey" THEN RAISE EXCEPTION 'Public key is immutable'; END IF;
 IF OLD."status" <> 'DRAFT' AND (
   NEW."fileUrl" IS DISTINCT FROM OLD."fileUrl" OR NEW."filePathname" IS DISTINCT FROM OLD."filePathname" OR
   NEW."sha256" IS DISTINCT FROM OLD."sha256" OR NEW."contentType" IS DISTINCT FROM OLD."contentType" OR
   NEW."filename" IS DISTINCT FROM OLD."filename" OR NEW."version" IS DISTINCT FROM OLD."version"
 ) THEN RAISE EXCEPTION 'Published transparency bytes and version are immutable'; END IF;
 IF OLD."status" = 'WITHDRAWN' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Withdrawn transparency publication is preserved'; END IF;
 IF OLD."status" = 'PUBLISHED' AND NEW."status" NOT IN ('PUBLISHED', 'WITHDRAWN') THEN RAISE EXCEPTION 'Publication cannot return to draft'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "TransparencyPublication_preserve_file" BEFORE UPDATE OR DELETE ON "TransparencyPublication"
FOR EACH ROW EXECUTE FUNCTION preserve_transparency_publication_file();
