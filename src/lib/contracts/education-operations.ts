export type EducationOperationStudent = { id: string; studentCode: string; person: { fullName: string } };
export type EducationLibraryData = {
  schools: { id: string; name: string }[]; students: EducationOperationStudent[]; titles: { id: string; title: string }[];
  copies: { id: string; assetCode: string; title: { title: string } }[];
  loans: { id: string; dueAt: Date; renewals: number; status: string; copy: { assetCode: string; title: { title: string } }; student: { person: { fullName: string } } }[];
};
export type EducationFoodData = {
  schools: { id: string; name: string }[]; materials: { id: string; name: string; unitOfMeasure: string }[]; warehouses: { id: string; name: string }[]; menus: { id: string }[];
  movements: { id: string; materialId: string; type: string; quantity: number; occurredAt: Date; notes: string | null; school: { name: string }; material: { name: string; unitOfMeasure: string }; warehouse: { name: string } | null }[];
};
export type EducationSchoolResourcesData = {
  schools: { id: string; name: string }[]; banks: { id: string; bankName: string; agency: string; accountNumber: string }[]; accounts: { id: string; name: string; school: { name: string } }[];
  plans: { id: string; title: string; total: string; status: string; items: import("@/db/json").JsonValue; school: { name: string }; account: { name: string } | null }[];
};
export type EducationTransportData = {
  schools: { id: string; name: string }[]; students: EducationOperationStudent[]; fleetRoutes: { id: string; code: string; name: string }[]; units: { id: string; code: string; name: string }[]; routes: { id: string; code: string; name: string }[];
  journeys: { id: string; startedAt: Date; endedAt: Date | null; status: string; route: { name: string }; fleetUnit: { name: string } | null; events: { type: string; notes: string | null }[] }[];
};
