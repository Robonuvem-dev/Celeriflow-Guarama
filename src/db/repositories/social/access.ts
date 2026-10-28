import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { employees } from "../../schema/administration";
import { socialProfessionalLinks, socialUnits } from "../../schema/social";

export async function listCurrentSocialLinks(database: DatabaseExecutor, employeeId: string, today: Date): Promise<{ unitId: string; individualScope: string; familyScope: string }[]> {
  return database.select({ unitId: socialProfessionalLinks.unitId, individualScope: socialProfessionalLinks.individualScope, familyScope: socialProfessionalLinks.familyScope })
    .from(socialProfessionalLinks).innerJoin(employees, eq(employees.id, socialProfessionalLinks.employeeId)).innerJoin(socialUnits, eq(socialUnits.id, socialProfessionalLinks.unitId))
    .where(and(eq(socialProfessionalLinks.employeeId, employeeId), eq(socialProfessionalLinks.isActive, true), eq(employees.isActive, true), eq(socialUnits.isActive, true), lte(socialProfessionalLinks.startsAt, today), or(isNull(socialProfessionalLinks.endsAt), gte(socialProfessionalLinks.endsAt, today))));
}
