import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  company: vi.fn(),
  fetch: vi.fn(),
  budget: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireApiUser: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { company: { findFirst: mocks.company } } }));
vi.mock("@/lib/company-icons", () => ({ fetchCompanyIcon: mocks.fetch }));
vi.mock("@/lib/auth/throttle", () => ({ consumeAttempt: mocks.budget }));
vi.mock("@/lib/security/controls", () => ({
  securityResponse: () =>
    Response.json(
      { error: "Inicia sesión." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    ),
}));
import { GET } from "../../app/api/company-icon/route";
const icon = { bytes: Buffer.from([1, 2, 3]), mime: "image/png" };
let seq = 0;
const get = () =>
  GET(new Request("https://localhost/api/company-icon?id=company"));
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  mocks.auth.mockResolvedValue({ id: "owner-" + ++seq });
  mocks.company.mockResolvedValue({
    websiteUrl: "https://logos.mappleo.com",
    faviconUrl: `https://logos.mappleo.com/favicon-${seq}.png`,
  });
  mocks.budget.mockResolvedValue(true);
  mocks.fetch.mockResolvedValue(icon);
});
afterEach(() => vi.useRealTimers());
describe("Caché privada y recuperable de iconos", () => {
  it("reutiliza el logo y conserva validación de propietario en cada petición", async () => {
    const first = await get(),
      second = await get();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(first.headers.get("vary")).toBe("Cookie");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.auth).toHaveBeenCalledTimes(2);
    expect(mocks.company).toHaveBeenLastCalledWith({
      where: { id: "company", userId: "owner-" + seq },
      select: { websiteUrl: true, faviconUrl: true },
    });
  });
  it("no guarda errores una hora y recupera el icono tras quince segundos", async () => {
    mocks.fetch.mockResolvedValueOnce(null);
    const failed = await get();
    expect(failed.status).toBe(204);
    expect(failed.headers.get("cache-control")).toBe("private, no-store");
    expect((await get()).status).toBe(204);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    vi.setSystemTime(Date.now() + 16000);
    expect((await get()).status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
  it("mantiene la última imagen buena ante un fallo temporal al renovar", async () => {
    await get();
    vi.setSystemTime(Date.now() + 3600001);
    mocks.fetch.mockResolvedValueOnce(null);
    const stale = await get();
    expect(stale.status).toBe(200);
    expect(Buffer.from(await stale.arrayBuffer())).toEqual(icon.bytes);
    vi.setSystemTime(Date.now() + 16000);
    mocks.fetch.mockResolvedValueOnce({
      bytes: Buffer.from([4, 5]),
      mime: "image/png",
    });
    expect(Buffer.from(await (await get()).arrayBuffer())).toEqual(
      Buffer.from([4, 5]),
    );
  });
  it("no sirve imágenes caducadas más de un día si la web sigue fallando", async () => {
    await get();
    vi.setSystemTime(Date.now() + 86400001);
    mocks.fetch.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(204);
  });
  it("una sesión no autorizada no puede leer ni el icono ya almacenado", async () => {
    await get();
    mocks.auth.mockRejectedValueOnce(Error("Unauthorized"));
    expect((await get()).status).toBe(401);
    expect(mocks.company).toHaveBeenCalledOnce();
  });
  it("no comparte caché entre propietarios", async () => {
    await get();
    mocks.auth.mockResolvedValueOnce({ id: "another-owner" });
    await get();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
