import { describe, expect, it } from "vitest";
import {
  allowedUrl,
  findIconInHtml,
  isPublicAddress,
} from "../../lib/company-icons";
import { isExampleHost, usableFaviconUrl } from "../../lib/company-icon-url";

describe("Iconos de empresa", () => {
  it("procesa HTML incompleto sin búsquedas cuadráticas y descarta URLs enormes", () => {
    expect(
      findIconInHtml("<link ".repeat(40000), "https://metaenlace.com/"),
    ).toBe("");
    expect(
      findIconInHtml(
        '<LINK REL=icon HREF="/icon.png?a=1&amp;b=2">',
        "https://metaenlace.com/",
      ),
    ).toBe("https://metaenlace.com/icon.png?a=1&b=2");
    expect(
      allowedUrl(new URL("https://metaenlace.com/" + "a".repeat(2048))),
    ).toBe(false);
  });
  it("descubre el favicon declarado en el HTML, no solo /favicon.ico", () => {
    const html = `
      <link rel="icon" href="/icon-small.png" sizes="16x16">
      <link sizes="32x32" href="/wp-content/uploads/favicon-metaenlace.png" rel="icon">
      <link rel="icon" href="https://otro.example.org/icon.png" sizes="128x128">
    `;
    expect(findIconInHtml(html, "https://metaenlace.com/")).toBe(
      "https://metaenlace.com/wp-content/uploads/favicon-metaenlace.png",
    );
  });

  it("omite dominios ficticios y rechaza direcciones internas", () => {
    expect(isExampleHost("equipo-05.example.com")).toBe(true);
    expect(allowedUrl(new URL("https://equipo-05.example.com/"))).toBe(false);
    expect(allowedUrl(new URL("http://127.0.0.1/"))).toBe(false);
    expect(allowedUrl(new URL("https://metaenlace.com/"))).toBe(true);
    expect(isPublicAddress("127.0.0.1", 4)).toBe(false);
    expect(isPublicAddress("192.168.1.1", 4)).toBe(false);
    expect(isPublicAddress("::1", 6)).toBe(false);
    expect(isPublicAddress("::ffff:127.0.0.1", 6)).toBe(false);
    expect(isPublicAddress("188.93.73.159", 4)).toBe(true);
  });

  it("solo muestra iconos de la propia web y nunca pide los ejemplos", () => {
    expect(
      usableFaviconUrl(
        "https://equipo-05.example.com/",
        "https://equipo-05.example.com/favicon.ico",
      ),
    ).toBe("");
    expect(
      usableFaviconUrl(
        "https://metaenlace.com/",
        "https://metaenlace.com/wp-content/uploads/favicon-metaenlace.png",
      ),
    ).toBe("https://metaenlace.com/wp-content/uploads/favicon-metaenlace.png");
    expect(
      usableFaviconUrl(
        "https://metaenlace.com/",
        "https://otro.com/favicon.ico",
      ),
    ).toBe("");
  });
});
