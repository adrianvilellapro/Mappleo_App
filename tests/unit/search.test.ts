import { describe, expect, it } from "vitest";
import { matchesSearch, searchRecord } from "../../features/tracker/search";

describe("Búsqueda en campos relevantes", () => {
  it("ignora claves internas, ids y el contenido de registros hijos", () => {
    expect(
      searchRecord(
        "companies",
        {
          id: "product-id",
          name: "Acme",
          offers: [{ id: "offer", title: "Product Manager" }],
          updatedAt: "2026-10-01",
          status: "product",
        },
        "product",
      ),
    ).toBeNull();
    expect(
      searchRecord(
        "applications",
        {
          id: "app",
          jobOffer: {
            id: "job",
            title: "Developer",
            company: {
              id: "co",
              name: "Acme",
              domain: "",
              websiteUrl: "",
              faviconUrl: "",
            },
          },
          events: [
            {
              id: "event",
              title: "Product",
              description: "",
              happenedAt: "2026-10-01",
            },
          ],
        },
        "product",
      ),
    ).toBeNull();
  });
  it("indica el campo real de la coincidencia y acepta prefijos", () => {
    expect(
      searchRecord(
        "companies",
        { id: "co", name: "Acme", tags: ["producto"] },
        "product",
      ),
    ).toMatchObject({ label: "Etiquetas", excerpt: "producto" });
  });
  it("normaliza acentos y exige todas las palabras", () => {
    expect(matchesSearch("Programación Angular", "programacion angular")).toBe(
      true,
    );
    expect(
      searchRecord(
        "offers",
        {
          id: "o",
          title: "Developer",
          technologies: ["Angular"],
          location: "Málaga",
        },
        "angular malaga",
      ),
    ).not.toBeNull();
    expect(
      searchRecord(
        "offers",
        { id: "o", title: "Developer", technologies: ["Angular"] },
        "angular react",
      ),
    ).toBeNull();
  });
});
