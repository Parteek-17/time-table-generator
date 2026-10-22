/**
 * Fuzzy matching of spreadsheet headers to template columns, so colleges can upload the
 * sheets they already have ("Emp. Code", "Employee No", "Faculty Code" → employeeCode).
 */

export interface TemplateColumn {
  key: string;
  label: string;
  /** Other names people use for this column. */
  synonyms?: readonly string[];
  required?: boolean;
}

export interface HeaderMatch {
  /** Template column key → index of the header in the file. */
  mapping: Record<string, number>;
  /** Headers in the file that matched nothing (shown so the user can map them). */
  unmatchedHeaders: { index: number; header: string }[];
  /** Required template columns with no header. */
  missingRequired: string[];
}

/** "Emp. Code " → "empcode" */
export function normaliseHeader(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** 0..1, how well a header matches one name of a column. */
export function headerScore(header: string, name: string): number {
  const h = normaliseHeader(header);
  const n = normaliseHeader(name);
  if (!h || !n) return 0;
  if (h === n) return 1;
  // "employeecode" vs "code": containment of a reasonably long name.
  if (n.length >= 4 && (h.includes(n) || n.includes(h)) && Math.min(h.length, n.length) >= 4) {
    return 0.85;
  }
  const similarity = 1 - editDistance(h, n) / Math.max(h.length, n.length);
  return similarity >= 0.75 ? similarity * 0.9 : 0;
}

const MIN_SCORE = 0.6;

/**
 * Best one-to-one matching of headers to columns, highest scores first. A header is
 * used for at most one column.
 */
export function matchHeaders(
  headers: readonly string[],
  columns: readonly TemplateColumn[],
): HeaderMatch {
  const candidates: { key: string; index: number; score: number }[] = [];
  for (const column of columns) {
    const names = [column.key, column.label, ...(column.synonyms ?? [])];
    headers.forEach((header, index) => {
      const score = Math.max(...names.map((n) => headerScore(header, n)));
      if (score >= MIN_SCORE) candidates.push({ key: column.key, index, score });
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const mapping: Record<string, number> = {};
  const usedHeaders = new Set<number>();
  for (const c of candidates) {
    if (c.key in mapping || usedHeaders.has(c.index)) continue;
    mapping[c.key] = c.index;
    usedHeaders.add(c.index);
  }
  return {
    mapping,
    unmatchedHeaders: headers
      .map((header, index) => ({ index, header }))
      .filter((h) => !usedHeaders.has(h.index) && h.header.trim() !== ''),
    missingRequired: columns.filter((c) => c.required && !(c.key in mapping)).map((c) => c.key),
  };
}
