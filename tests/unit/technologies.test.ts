import { describe, expect, it } from "vitest";
import {
  cleanTechnologyName,
  defaultTechnologies,
  technologyKey,
  uniqueTechnologies,
} from "../../features/tracker/technologies";

describe("Catálogo de tecnologías", () => {
  it("incluye tecnologías habituales", () => {
    expect(defaultTechnologies).toEqual(
      expect.arrayContaining(["HTML", "CSS", "Angular", "PostgreSQL"]),
    );
  });
  it("normaliza espacios y evita duplicados por mayúsculas", () => {
    expect(cleanTechnologyName("  React   Native  ")).toBe("React Native");
    expect(technologyKey(" TypeScript ")).toBe("typescript");
    expect(uniqueTechnologies(["Angular", " angular ", "C#"])).toEqual([
      { key: "angular", name: "Angular" },
      { key: "c#", name: "C#" },
    ]);
  });
});
