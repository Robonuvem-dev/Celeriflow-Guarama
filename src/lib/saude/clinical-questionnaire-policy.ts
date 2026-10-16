export function clinicalConditionQuestionnaireKeys(conditions: { kind: string; label: string }[], pregnant: boolean) {
  const keys = new Set(conditions.flatMap(condition => [condition.kind, condition.label]));
  if (pregnant) keys.add("PREGNANCY");
  for (const condition of conditions) {
    const label = condition.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
    if (condition.kind === "CHRONIC" && label === "HIPERTENSAO") keys.add("HYPERTENSION");
    if (condition.kind === "CHRONIC" && label === "DIABETES") keys.add("DIABETES");
  }
  return [...keys];
}
