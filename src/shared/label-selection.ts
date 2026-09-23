/**
 * Labels to tick when the form opens: the last selection for this repo if there is one,
 * else the mapping's defaults, else the global defaults. Names that don't exist in the
 * repo are dropped; matching is case-insensitive, like GitHub's.
 */
export function preselectLabels(
  available: readonly string[],
  lastForRepo: readonly string[] | undefined,
  mappingDefaults: readonly string[] | undefined,
  globalDefaults: readonly string[],
): string[] {
  const wanted = lastForRepo ?? (mappingDefaults?.length ? mappingDefaults : globalDefaults);
  const byLowerName = new Map(available.map((name) => [name.toLowerCase(), name]));
  const result: string[] = [];
  for (const name of wanted) {
    const actual = byLowerName.get(name.toLowerCase());
    if (actual && !result.includes(actual)) result.push(actual);
  }
  return result;
}
