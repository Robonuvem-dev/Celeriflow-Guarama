CREATE TABLE "MaterialSubcategory" (
  id TEXT PRIMARY KEY, "categoryId" TEXT NOT NULL REFERENCES "MaterialCategory"(id) ON DELETE RESTRICT,
  code TEXT NOT NULL, name TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "MaterialSubcategory_categoryId_code_key" ON "MaterialSubcategory" ("categoryId",code);
CREATE UNIQUE INDEX "MaterialSubcategory_id_categoryId_key" ON "MaterialSubcategory" (id,"categoryId");
ALTER TABLE "Material" ADD COLUMN "subcategoryId" TEXT;
ALTER TABLE "Material" ADD CONSTRAINT "Material_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "MaterialSubcategory"(id) ON DELETE RESTRICT;
ALTER TABLE "Material" ADD CONSTRAINT "Material_subcategory_category_integrity" FOREIGN KEY ("subcategoryId","categoryId") REFERENCES "MaterialSubcategory"(id,"categoryId") ON DELETE RESTRICT;
