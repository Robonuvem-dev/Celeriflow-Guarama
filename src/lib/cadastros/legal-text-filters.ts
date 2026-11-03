export const legalTextFilterFields = [
  { name: "tipo", label: "Tipo do ato", type: "text" },
  { name: "assunto", label: "Assunto na ementa", type: "text" },
  { name: "numero", label: "Número do ato", type: "text" },
  { name: "publicacao", label: "Data de publicação", type: "date" },
  { name: "situacao", label: "Situação", type: "text" },
  { name: "ignorar", label: "Palavras ignoradas na busca (separe por vírgula ou espaço)", type: "text" },
] as const;

export type LegalTextFilters = Partial<Record<typeof legalTextFilterFields[number]["name"], string>>;
