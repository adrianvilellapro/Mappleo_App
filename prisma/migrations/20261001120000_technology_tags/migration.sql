CREATE TABLE "TechnologyTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TechnologyTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnologyTag_userId_key_key" ON "TechnologyTag"("userId", "key");
CREATE INDEX "TechnologyTag_userId_name_idx" ON "TechnologyTag"("userId", "name");
ALTER TABLE "TechnologyTag" ADD CONSTRAINT "TechnologyTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TechnologyTag" ("id", "userId", "name", "key")
SELECT md5(u."id" || ':' || lower(t.name)), u."id", t.name, lower(t.name)
FROM "User" AS u
CROSS JOIN unnest(ARRAY[
  'HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue.js',
  'Next.js', 'Node.js', 'Express', 'NestJS', 'Python', 'Django', 'FastAPI',
  'Java', 'Spring Boot', 'Kotlin', 'C#', '.NET', 'PHP', 'Laravel',
  'Ruby on Rails', 'Go', 'Rust', 'Swift', 'Flutter', 'React Native',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Docker', 'Kubernetes',
  'AWS', 'Azure', 'Google Cloud', 'Git', 'GitHub Actions', 'Terraform',
  'GraphQL', 'REST API', 'Tailwind CSS', 'Sass', 'Jest', 'Vitest',
  'Playwright', 'Cypress', 'Figma', 'Linux'
]) AS t(name)
ON CONFLICT ("userId", "key") DO NOTHING;
