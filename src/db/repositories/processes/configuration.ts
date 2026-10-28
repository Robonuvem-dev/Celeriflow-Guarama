import { asc, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { departments } from "../../schema/administration";
import { documentClasses } from "../../schema/document-workflow";
import { processTypes, processSubjects, processWorkflowStages, genericWorkflowDefinitions, genericWorkflowStages } from "../../schema/processes";

export async function readProcessConfiguration(db: DatabaseExecutor) {
  const [typeRows, subjects, departmentRows, legacyRows, definitionRows, stageRows, classRows] = await Promise.all([
    db.select({ type: processTypes, initialDepartment: departments }).from(processTypes).leftJoin(departments, eq(departments.id, processTypes.initialDepartmentId)).orderBy(asc(processTypes.name)),
    db.select().from(processSubjects).orderBy(asc(processSubjects.name)),
    db.select({ id: departments.id, name: departments.name }).from(departments).where(eq(departments.isActive, true)).orderBy(asc(departments.name)),
    db.select({ stage: processWorkflowStages, processType: processTypes, subject: processSubjects, department: departments }).from(processWorkflowStages).innerJoin(processTypes, eq(processTypes.id, processWorkflowStages.processTypeId)).leftJoin(processSubjects, eq(processSubjects.id, processWorkflowStages.subjectId)).innerJoin(departments, eq(departments.id, processWorkflowStages.departmentId)).orderBy(asc(processTypes.name), asc(processWorkflowStages.subjectId), asc(processWorkflowStages.position)),
    db.select({ definition: genericWorkflowDefinitions, processType: processTypes }).from(genericWorkflowDefinitions).innerJoin(processTypes, eq(processTypes.id, genericWorkflowDefinitions.processTypeId)).orderBy(asc(processTypes.name), desc(genericWorkflowDefinitions.version)),
    db.select({ stage: genericWorkflowStages, department: departments, requiredDocumentClass: documentClasses }).from(genericWorkflowStages).innerJoin(departments, eq(departments.id, genericWorkflowStages.departmentId)).leftJoin(documentClasses, eq(documentClasses.id, genericWorkflowStages.requiredDocumentClassId)).orderBy(asc(genericWorkflowStages.position)),
    db.select({ id: documentClasses.id, label: documentClasses.label }).from(documentClasses).where(eq(documentClasses.isActive, true)).orderBy(asc(documentClasses.label)),
  ]);
  return {
    types: typeRows.map(row => ({ ...row.type, initialDepartment: row.initialDepartment, subjects: subjects.filter(subject => subject.processTypeId === row.type.id) })),
    departments: departmentRows,
    legacyStages: legacyRows.map(row => ({ ...row.stage, processType: row.processType, subject: row.subject, department: row.department })),
    definitions: definitionRows.map(row => ({ ...row.definition, processType: row.processType, stages: stageRows.filter(stage => stage.stage.definitionId === row.definition.id).map(stage => ({ ...stage.stage, department: stage.department, requiredDocumentClass: stage.requiredDocumentClass })) })),
    documentClasses: classRows,
  };
}
