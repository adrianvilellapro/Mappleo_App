export const defaultTechnologies = [
  "HTML",
  "CSS",
  "JavaScript",
  "TypeScript",
  "React",
  "Angular",
  "Vue.js",
  "Next.js",
  "Node.js",
  "Express",
  "NestJS",
  "Python",
  "Django",
  "FastAPI",
  "Java",
  "Spring Boot",
  "Kotlin",
  "C#",
  ".NET",
  "PHP",
  "Laravel",
  "Ruby on Rails",
  "Go",
  "Rust",
  "Swift",
  "Flutter",
  "React Native",
  "SQL",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "Google Cloud",
  "Git",
  "GitHub Actions",
  "Terraform",
  "GraphQL",
  "REST API",
  "Tailwind CSS",
  "Sass",
  "Jest",
  "Vitest",
  "Playwright",
  "Cypress",
  "Figma",
  "Linux",
] as const;

export function cleanTechnologyName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function technologyKey(name: string) {
  return cleanTechnologyName(name).toLocaleLowerCase("en");
}

export function uniqueTechnologies(values: string[]) {
  const result = new Map<string, string>();
  for (const value of values) {
    const name = cleanTechnologyName(value);
    if (name && name.length <= 100 && !result.has(technologyKey(name)))
      result.set(technologyKey(name), name);
  }
  return [...result.entries()].map(([key, name]) => ({ key, name }));
}
