export const constructionDocumentKinds = { VIABILITY: "Viabilidade", PERMIT: "Alvará", OCCUPANCY: "Habite-se" } as const;
export const templateFields = ["protocol", "number", "kind", "issuedAt", "totalArea", "category", "locationType", "applicant", "properties"] as const;
