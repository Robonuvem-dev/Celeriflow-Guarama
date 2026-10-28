export const OPERATIONAL_PAGE_SIZE = 20;
export const OPERATIONAL_ROW_HEIGHT = 24;

export type OperationalColumn = {
  key: string;
  label: string;
  type: "text" | "identifier" | "status" | "actions";
  initialWidth: number;
  minWidth: number;
  maxWidth?: number;
  resizable: boolean;
  sortable: boolean;
  details: "overflow" | "none";
  align?: "left" | "center" | "right";
};

export function fitOperationalWidths(columns: readonly OperationalColumn[], available: number, preferences: Record<string, number> | null = null) {
  const minimum = columns.reduce((sum, column) => sum + column.minWidth, 0);
  const width = Math.floor(available);
  if (width < minimum) return { widths: columns.map((column) => column.minWidth), minimum, fits: false };
  const values = columns.map((column) => Math.max(column.minWidth, Math.min(column.maxWidth ?? Infinity,
    preferences?.[column.key] ? preferences[column.key] * width : column.initialWidth)));
  for (let iteration = 0; iteration < columns.length + 2; iteration++) {
    const difference = width - values.reduce((sum, value) => sum + value, 0);
    if (Math.abs(difference) < 0.001) break;
    const eligible = columns.map((column, index) => ({ column, index })).filter(({ column, index }) => difference > 0
      ? values[index] < (column.maxWidth ?? Infinity)
      : values[index] > column.minWidth);
    const weight = eligible.reduce((sum, { column, index }) => sum + (difference > 0 ? column.initialWidth : values[index] - column.minWidth), 0);
    if (!eligible.length || !weight) break;
    for (const { column, index } of eligible) {
      const share = difference * (difference > 0 ? column.initialWidth : values[index] - column.minWidth) / weight;
      values[index] = Math.max(column.minWidth, Math.min(column.maxWidth ?? Infinity, values[index] + share));
    }
  }
  const rounded = values.map(Math.floor);
  let remaining = width - rounded.reduce((sum, value) => sum + value, 0);
  const order = values.map((value, index) => ({ index, fraction: value - rounded[index] })).sort((a, b) => b.fraction - a.fraction);
  while (remaining > 0) {
    let changed = false;
    for (const { index } of order) if (remaining && rounded[index] < (columns[index].maxWidth ?? Infinity)) {
      rounded[index]++; remaining--; changed = true;
    }
    if (!changed) break;
  }
  return { widths: rounded, minimum, fits: rounded.reduce((sum, value) => sum + value, 0) === width };
}

export function resizeOperationalWidths(columns: readonly OperationalColumn[], widths: readonly number[], index: number, delta: number) {
  const next = [...widths];
  const target = columns[index];
  if (!target?.resizable || !Number.isFinite(delta)) return next;
  const neighbors = [...columns.keys()].filter((position) => position > index).concat([...columns.keys()].filter((position) => position < index).reverse())
    .filter((position) => columns[position].resizable);
  const requested = Math.round(delta);
  if (requested > 0) {
    let needed = Math.min(requested, (target.maxWidth ?? Infinity) - next[index]);
    for (const position of neighbors) {
      const taken = Math.min(needed, next[position] - columns[position].minWidth);
      next[position] -= taken; next[index] += taken; needed -= taken;
      if (!needed) break;
    }
  } else {
    let released = Math.min(-requested, next[index] - target.minWidth);
    for (const position of neighbors) {
      const given = Math.min(released, (columns[position].maxWidth ?? Infinity) - next[position]);
      next[position] += given; next[index] -= given; released -= given;
      if (!released) break;
    }
  }
  return next;
}

export function operationalWidthPreferences(columns: readonly OperationalColumn[], widths: readonly number[]) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  return Object.fromEntries(columns.map((column, index) => [column.key, widths[index] / total]));
}

export function paginateFullValue(value: string, fits: (text: string) => boolean) {
  if (!value) return [""];
  const characters = [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(value)].map((item) => item.segment);
  const pages: string[] = [];
  let start = 0;
  while (start < characters.length) {
    let low = start + 1, high = characters.length, best = start;
    while (low <= high) {
      const end = Math.floor((low + high) / 2);
      if (fits(characters.slice(start, end).join(""))) { best = end; low = end + 1; } else high = end - 1;
    }
    const end = Math.max(start + 1, best);
    pages.push(characters.slice(start, end).join(""));
    start = end;
  }
  return pages;
}
