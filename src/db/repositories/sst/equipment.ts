import type { Equipment, EquipmentItem, EquipmentDelivery } from "@/lib/sst/equipment-service";
import { sstTimestamp } from "./sql";

export type EquipmentWire = Omit<Equipment, "caValidUntil"> & { caValidUntil: string | null; createdAt: string };
export function equipmentDto(row: EquipmentWire) { return { ...row, caValidUntil: row.caValidUntil === null ? null : sstTimestamp(row.caValidUntil), createdAt: sstTimestamp(row.createdAt) }; }
export type EquipmentItemWire = Omit<EquipmentItem, "expiresAt" | "nextReviewAt" | "deliveredAt"> & { expiresAt: string; nextReviewAt: string; deliveredAt: string };
export function equipmentItemDto(row: EquipmentItemWire) { return { ...row, expiresAt: sstTimestamp(row.expiresAt), nextReviewAt: sstTimestamp(row.nextReviewAt), deliveredAt: sstTimestamp(row.deliveredAt) }; }
export type EquipmentDeliveryWire = Omit<EquipmentDelivery, "deliveredAt"> & { deliveredAt: string; createdAt: string };
export function equipmentDeliveryDto(row: EquipmentDeliveryWire) { return { ...row, deliveredAt: sstTimestamp(row.deliveredAt), createdAt: sstTimestamp(row.createdAt) }; }
