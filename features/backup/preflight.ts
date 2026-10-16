// Reject oversized collections BEFORE Zod builds per-item error objects.
// A small JSON body can otherwise contain millions of invalid array items.
export function backupWithinStructuralLimits(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const root = value as Record<string, unknown>;
  const limits: Record<string, number> = {
    companies: 2000,
    offers: 2000,
    applications: 2000,
    contacts: 2000,
    networking: 2000,
    boardColumns: 30,
    tasks: 2000,
    taskCompletions: 4000,
    technologyTags: 500,
  };
  let records = 0;
  for (const [name, limit] of Object.entries(limits)) {
    const items = root[name];
    if (items === undefined) continue; // Schema validation handles missing required sections.
    if (!Array.isArray(items) || items.length > limit) return false;
    if (name === "technologyTags") {
      if (items.some((item) => typeof item !== "string" || item.length > 100))
        return false;
      continue;
    }
    records += items.length;
    if (records > 6000) return false;
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item))
        return false;
      for (const [field, max] of [
        ["events", 2000],
        ["companies", 500],
        ["contacts", 500],
        ["links", 20],
      ] as const) {
        const nested = item[field];
        if (nested === undefined) continue;
        if (!Array.isArray(nested) || nested.length > max) return false;
        records += nested.length;
        if (
          records > 6000 ||
          nested.some(
            (record) =>
              !record || typeof record !== "object" || Array.isArray(record),
          )
        )
          return false;
      }
      for (const [field, max] of [
        ["tags", 100],
        ["technologies", 100],
        ["companyIds", 100],
        ["sources", 30],
      ] as const) {
        const nested = item[field];
        if (nested === undefined) continue;
        if (
          !Array.isArray(nested) ||
          nested.length > max ||
          nested.some((text) => typeof text !== "string" || text.length > 100)
        )
          return false;
      }
    }
  }
  return true;
}
