const DAY = 86400000;
function dayValue(date: Date) {
  if (!Number.isFinite(date.valueOf())) throw new Error("Data clínica inválida.");
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function pregnancyDating(input: { lastMenstrualDate: Date | null; ultrasoundDate: Date | null; ultrasoundGestationalDays: number | null; calculationMethod: "LMP" | "ULTRASOUND" }, referenceDate: Date) {
  let origin: number;
  if (input.calculationMethod === "LMP") {
    if (!input.lastMenstrualDate) throw new Error("Informe a data da última menstruação para o cálculo pela DUM.");
    origin = dayValue(input.lastMenstrualDate);
  } else {
    if (!input.ultrasoundDate || input.ultrasoundGestationalDays === null || !Number.isInteger(input.ultrasoundGestationalDays) || input.ultrasoundGestationalDays < 0 || input.ultrasoundGestationalDays > 315) throw new Error("Informe data e idade gestacional em dias do ultrassom.");
    if (dayValue(input.ultrasoundDate) > dayValue(referenceDate)) throw new Error("Ultrassom posterior à data de referência.");
    origin = dayValue(input.ultrasoundDate) - input.ultrasoundGestationalDays * DAY;
  }
  const gestationalDays = Math.floor((dayValue(referenceDate) - origin) / DAY);
  if (gestationalDays < 0 || gestationalDays > 350) throw new Error("Confira a data-base e a idade gestacional na data do atendimento.");
  return { estimatedDeliveryDate: new Date(origin + 280 * DAY), gestationalDays, weeks: Math.floor(gestationalDays / 7), days: gestationalDays % 7, trimester: gestationalDays < 98 ? 1 : gestationalDays < 196 ? 2 : 3 };
}

export const ADULT_TEETH = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(String);
export const CHILD_TEETH = [55,54,53,52,51,61,62,63,64,65,85,84,83,82,81,71,72,73,74,75].map(String);
export function assertDentalTarget(dentition: "ADULT" | "CHILD" | "BOTH", type: "TOOTH" | "ARCH" | "QUADRANT" | "MOUTH" | "SEXTANT", code: string) {
  const teeth = dentition === "ADULT" ? ADULT_TEETH : dentition === "CHILD" ? CHILD_TEETH : [...ADULT_TEETH, ...CHILD_TEETH];
  const valid = type === "TOOTH" ? teeth.includes(code) : type === "ARCH" ? ["UPPER", "LOWER"].includes(code) : type === "QUADRANT" ? ["1", "2", "3", "4"].includes(code) : type === "MOUTH" ? code === "ALL" : ["1", "2", "3", "4", "5", "6"].includes(code);
  if (!valid) throw new Error("Marcação incompatível com a dentição ou região odontológica selecionada.");
}
