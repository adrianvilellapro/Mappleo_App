INSERT INTO "TechnologyTag" ("id", "userId", "name", "key")
SELECT DISTINCT ON (o."userId", lower(trim(t.name)))
  md5(o."userId" || ':' || lower(trim(t.name))),
  o."userId",
  trim(t.name),
  lower(trim(t.name))
FROM "JobOffer" AS o
CROSS JOIN LATERAL unnest(o."technologies") AS t(name)
WHERE trim(t.name) <> ''
ORDER BY o."userId", lower(trim(t.name)), o."createdAt"
ON CONFLICT ("userId", "key") DO NOTHING;
