export type MasterDataCatalog =
  | "families"
  | "entities"
  | "costCenters"
  | "cities"
  | "neighborhoods"
  | "streets"
  | "banks"
  | "branches"
  | "taxes"
  | "currencies"
  | "products"
  | "cbos"
  | "signers"
  | "legalTexts";

export type MasterDataValue = string | string[] | boolean;

export type MasterDataRow = {
  id: string;
  values: Record<string, MasterDataValue>;
  active: boolean;
};

export type MasterDataOption = { value: string; label: string };

export type MasterDataField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "date" | "number" | "checkbox" | "select" | "multiselect";
  required?: boolean;
  options?: MasterDataOption[];
  placeholder?: string;
};

export type MasterDataColumn = { key: string; label: string };

export type MasterDataActionResult = { error?: string };
