type EmployeeIdentifierSource = { id: string; cpf: string | null; registration: string | null };

/** Conflicting identifiers are unresolved, never assigned by iteration order. */
export function employeeIdentifierIndex(employees: EmployeeIdentifierSource[], aliases: { employeeId: string; registration: string | null }[] = []) {
  const index = new Map<string, string | null>();
  const active = new Set(employees.map(employee => employee.id));
  const add = (key: string | null, employeeId: string) => {
    const normalized = key?.trim().toLowerCase();
    if (!normalized) return;
    if (index.has(normalized) && index.get(normalized) !== employeeId) index.set(normalized, null);
    else index.set(normalized, employeeId);
  };
  for (const employee of employees) {
    add(employee.id, employee.id);
    add(employee.registration, employee.id);
    add(employee.cpf, employee.id);
    if (employee.cpf) add(employee.cpf.replace(/\D/g, ''), employee.id);
  }
  for (const alias of aliases) if (active.has(alias.employeeId)) add(alias.registration, alias.employeeId);
  return (identifier: string): string | undefined => {
    const key = identifier.trim().toLowerCase();
    if (index.has(key)) return index.get(key) || undefined;
    // Only a formatted CPF may lose punctuation; letters in legacy codes matter.
    if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(key)) return index.get(key.replace(/\D/g, '')) || undefined;
    return undefined;
  };
}
