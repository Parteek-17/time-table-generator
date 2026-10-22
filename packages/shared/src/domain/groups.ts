/** Sections and sub-groups. */

/** Splits a strength into `parts` near-equal parts, larger parts first: 61, 2 → [31, 30]. */
export function splitEvenly(strength: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(strength / parts);
  const extra = strength % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Sub-group names for a section: A → A1, A2 … */
export function subGroupNames(sectionName: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${sectionName}${i + 1}`);
}

/** Section names A, B, … Z, AA, AB … */
export function sectionNames(count: number): string[] {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    let n = i;
    let name = '';
    do {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    names.push(name);
  }
  return names;
}

/** Default section display name: "CSE A". */
export function sectionDisplayName(groupCode: string, sectionName: string): string {
  return `${groupCode} ${sectionName}`;
}

/** True when the section has no sub-groups, or their strengths add up to the section's. */
export function subGroupsAddUp(
  sectionStrength: number,
  subGroupStrengths: readonly number[],
): boolean {
  if (subGroupStrengths.length === 0) return true;
  return subGroupStrengths.reduce((a, b) => a + b, 0) === sectionStrength;
}
