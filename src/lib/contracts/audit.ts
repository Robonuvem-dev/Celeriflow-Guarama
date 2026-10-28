export const auditEventTypes = {
  sessionLogin: "SESSION_LOGIN",
  sessionLogout: "SESSION_LOGOUT",
  documentDownload: "DOCUMENT_DOWNLOAD",
  financialReportExport: "FINANCIAL_REPORT_EXPORT",
  reportIssued: "REPORT_ISSUED",
  pageView: "PAGE_VIEW",
  uiInteraction: "UI_INTERACTION",
  formSubmit: "FORM_SUBMIT",
  instanceConfigurationChanged: "INSTANCE_CONFIGURATION_CHANGED",
  internalNotificationCreated: "INTERNAL_NOTIFICATION_CREATED",
  internalNotificationRead: "INTERNAL_NOTIFICATION_READ",
  personMergeProposed: "PERSON_MERGE_PROPOSED",
  personMergeExecuted: "PERSON_MERGE_EXECUTED",
  personMergeReversed: "PERSON_MERGE_REVERSED",
  administrativeMutation: "ADMINISTRATIVE_MUTATION",
  processOpened: "PROCESS_OPENED",
  processUpdated: "PROCESS_UPDATED",
  processDocumentLinked: "PROCESS_DOCUMENT_LINKED",
  gedDocumentIngested: "GED_DOCUMENT_INGESTED",
  documentSignatureRequested: "DOCUMENT_SIGNATURE_REQUESTED",
  documentSignatureRegistered: "DOCUMENT_SIGNATURE_REGISTERED",
  publicNoticePublished: "PUBLIC_NOTICE_PUBLISHED",
  stockManuallyAdjusted: "STOCK_MANUALLY_ADJUSTED",
  stockReturned: "STOCK_RETURNED",
  stockMovementReversed: "STOCK_MOVEMENT_REVERSED",
  assetAcquiredFromReceipt: "ASSET_ACQUIRED_FROM_RECEIPT",
  internalControlFindingRegistered: "INTERNAL_CONTROL_FINDING_REGISTERED",
  fleetOperationRegistered: "FLEET_OPERATION_REGISTERED",
} as const;

export type AuditEventType = (typeof auditEventTypes)[keyof typeof auditEventTypes];

export type AuditEventInput = {
  actorUsuarioId: string;
  eventType: AuditEventType;
  targetType: string;
  targetId: string;
};

export type AuditEventRecord = {
  id: string; actorUsuarioId: string; eventType: string; targetType: string; targetId: string; createdAt: Date;
  actorUsuario: { nome: string; email: string; perfil: { nome: string } };
};
export type AuditEventPage = { events: AuditEventRecord[]; previousCursor: string | undefined; nextCursor: string | undefined };
export type AuditEventSummary = {
  total: number; recent: number;
  eventGroups: { eventType: string; _count: { _all: number } }[];
  targetGroups: { targetType: string; _count: { _all: number } }[];
};
export type AuditUsageSummary = { totalEvents: number; eventsLast24Hours: number; activeUsers: { actorUsuarioId: string }[] };
