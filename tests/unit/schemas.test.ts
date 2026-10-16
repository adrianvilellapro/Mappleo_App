import { describe, expect, it } from "vitest";
import {
  webUrl,
  corporateDomain,
  companySchema,
  offerSchema,
  applicationSchema,
  networkingSchema,
} from "../../features/tracker/schemas";
const offer = {
  title: "Developer",
  companyId: "company",
  source: "OTHER",
  workMode: "REMOTE",
  salaryCurrency: "EUR",
  interestRating: 3,
};
describe("Validación de datos privados", () => {
  it("normaliza webs y rechaza esquemas ejecutables", () => {
    expect(webUrl.parse("example.com")).toBe("https://example.com");
    expect(webUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(webUrl.safeParse("data:text/html,test").success).toBe(false);
    expect(corporateDomain("https://www.example.com/jobs")).toBe("example.com");
  });
  it("acepta empresa mínima y normaliza etiquetas", () => {
    const result = companySchema.parse({
      name: " Acme ",
      workMode: "UNKNOWN",
      interestRating: 3,
      tags: " React, ,Web ",
    });
    expect(result.name).toBe("Acme");
    expect(result.tags).toEqual(["React", "Web"]);
  });
  it("rechaza interés fuera de rango y enums desconocidos", () => {
    expect(
      companySchema.safeParse({
        name: "Acme",
        interestRating: 6,
        workMode: "REMOTE",
      }).success,
    ).toBe(false);
    expect(
      companySchema.safeParse({
        name: "Acme",
        interestRating: 3,
        workMode: "invented",
      }).success,
    ).toBe(false);
  });
  it("conserva salarios vacíos como null y exige orden", () => {
    expect(
      offerSchema.parse({ ...offer, salaryMin: "", salaryMax: "" }).salaryMin,
    ).toBeNull();
    expect(
      offerSchema.safeParse({ ...offer, salaryMin: 60000, salaryMax: 30000 })
        .success,
    ).toBe(false);
  });
  it("no acepta SAVED como estado de candidatura", () => {
    expect(
      applicationSchema.safeParse({
        jobOfferId: "offer",
        status: "SAVED",
        appliedAt: new Date(),
        coverLetterUsed: false,
      }).success,
    ).toBe(false);
  });
  it("exige acción cuando hay fecha", () => {
    expect(
      applicationSchema.safeParse({
        jobOfferId: "offer",
        status: "APPLIED",
        appliedAt: new Date(),
        nextActionDueAt: new Date(),
      }).success,
    ).toBe(false);
  });
  it("rechaza eventos que terminan antes de empezar", () => {
    expect(
      networkingSchema.safeParse({
        name: "Meetup",
        type: "MEETUP",
        startsAt: "2026-10-02T12:00:00Z",
        endsAt: "2026-10-01T12:00:00Z",
      }).success,
    ).toBe(false);
  });
});
