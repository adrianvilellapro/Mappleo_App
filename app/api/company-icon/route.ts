import { requireApiUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchCompanyIcon } from "@/lib/company-icons";
import { usableFaviconUrl } from "@/lib/company-icon-url";
import { consumeAttempt } from "@/lib/auth/throttle";
import { securityResponse } from "@/lib/security/controls";

export const runtime = "nodejs";
const cache = new Map<
  string,
  {
    until: number;
    staleUntil: number;
    image: Awaited<ReturnType<typeof fetchCompanyIcon>>;
  }
>();
const inFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof fetchCompanyIcon>>>
>();
export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const params = new URL(request.url).searchParams;
    const suppliedUrl = params.get("url") ?? "";
    const id = params.get("id");
    if (id && (id.length > 100 || !/^[a-zA-Z0-9_:-]+$/.test(id)))
      return new Response(null, { status: 204 });
    if (!id && (!suppliedUrl || suppliedUrl.length > 2048))
      return new Response(null, { status: 204 });
    const company = id
      ? await db.company.findFirst({
          where: { id, userId: user.id },
          select: { websiteUrl: true, faviconUrl: true },
        })
      : (
          await db.company.findMany({
            where: { userId: user.id },
            select: { websiteUrl: true, faviconUrl: true },
          })
        ).find((c) => c.faviconUrl === suppliedUrl);
    if (!company || !usableFaviconUrl(company.websiteUrl, company.faviconUrl))
      return new Response(null, { status: 204 });
    const url = company.faviconUrl;
    const key = user.id + "\0" + url;
    let image = cache.get(key);
    if (!image || image.until < Date.now()) {
      if (!(await consumeAttempt("icon-download", user.id, 300, 60000)))
        return new Response(null, { status: 204 });
      let pending = inFlight.get(key);
      if (!pending) {
        pending = fetchCompanyIcon(url);
        inFlight.set(key, pending);
      }
      try {
        const fetched = await pending;
        const now = Date.now();
        const previous = image;
        // An outage/concurrency limit must not replace a previously good image.
        image = {
          image:
            fetched ??
            (previous && previous.staleUntil > now ? previous.image : null),
          until: now + (fetched ? 3600000 : 15000),
          staleUntil: fetched ? now + 86400000 : (previous?.staleUntil ?? 0),
        };
      } finally {
        inFlight.delete(key);
      }
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, image);
    }
    if (!image.image)
      return new Response(null, {
        status: 204,
        // A failed download is not an image: don't poison the browser cache for an hour.
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
      });
    return new Response(new Uint8Array(image.image.bytes), {
      headers: {
        "Content-Type": image.image.mime,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        Vary: "Cookie",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return securityResponse(error);
  }
}
