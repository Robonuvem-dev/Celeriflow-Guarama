"use client";
import CemeteryLookup from "./CemeteryLookup";
export function StructureCemeteryFilter({ value }: { value: string }) {
  return <CemeteryLookup name="cemeteryId" kind="cemetery" label="Cemitério" defaultValue={value} />;
}
