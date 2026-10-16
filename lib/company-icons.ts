import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { publicWebsiteUrl, sameWebsiteHost } from "./company-icon-url";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["2001::", 23],
  ["2002::", 16],
  ["::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");

export function allowedUrl(value: URL) {
  return (
    value.href.length <= 2048 &&
    publicWebsiteUrl(value) &&
    !isIP(value.hostname)
  );
}

export function isPublicAddress(address: string, family: number) {
  if (![4, 6].includes(family) || isIP(address) !== family) return false;
  if (family === 6 && !/^[23]/.test(address)) return false;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

function linkTags(html: string) {
  if (html.length > 300000) return [];
  const lower = html.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const tags: string[] = [];
  let cursor = 0;
  while (tags.length < 128) {
    const start = lower.indexOf("<link", cursor);
    if (start < 0) break;
    cursor = start + 5;
    if (!/[\s/>]/.test(lower[cursor] ?? "")) continue;
    const end = lower.indexOf(">", cursor);
    if (end < 0) break;
    cursor = end + 1;
    if (end - start <= 4096) tags.push(html.slice(start + 5, end));
  }
  return tags;
}
function linkAttributes(tag: string) {
  const attributes: Record<string, string> = Object.create(null);
  let i = 0;
  while (i < tag.length) {
    while (i < tag.length && /\s/.test(tag[i])) i++;
    const start = i;
    while (i < tag.length && /[\w:-]/.test(tag[i])) i++;
    if (i === start) {
      i++;
      continue;
    }
    const name = tag.slice(start, i).toLowerCase();
    while (i < tag.length && /\s/.test(tag[i])) i++;
    if (tag[i] !== "=") continue;
    i++;
    while (i < tag.length && /\s/.test(tag[i])) i++;
    const quote = tag[i] === '"' || tag[i] === "'" ? tag[i++] : "";
    const valueStart = i;
    if (quote) {
      const end = tag.indexOf(quote, i);
      if (end < 0) break;
      i = end;
    } else while (i < tag.length && !/\s/.test(tag[i])) i++;
    if (["href", "rel", "type", "sizes"].includes(name))
      attributes[name] = tag.slice(valueStart, i).replace(/&amp;/gi, "&");
    if (quote) i++;
  }
  return attributes;
}
export function findIconInHtml(html: string, pageUrl: string) {
  const base = new URL(pageUrl);
  const links = linkTags(html);
  const candidates: { href: string; score: number }[] = [];
  for (const tag of links) {
    const attributes = linkAttributes(tag);
    const rel = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    if (!rel.includes("icon") && !rel.includes("apple-touch-icon")) continue;
    if (!attributes.href) continue;
    try {
      const icon = new URL(attributes.href, base);
      if (
        attributes.type?.toLowerCase() === "image/svg+xml" ||
        /\.svg$/i.test(icon.pathname)
      )
        continue;
      if (!allowedUrl(icon) || !sameWebsiteHost(icon.hostname, base.hostname))
        continue;
      const sizes = attributes.sizes ?? "";
      const dimension = Number(sizes.match(/(\d+)x\d+/)?.[1] ?? 0);
      candidates.push({
        href: icon.href,
        score: rel.includes("icon") ? Math.min(dimension || 32, 128) : 16,
      });
    } catch {
      // Enlaces mal formados no impiden guardar la empresa.
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0]?.href ?? "";
}

type PublicResource = { bytes: Buffer; mime: string; url: string };
let activeRequests = 0;
async function getResource(
  url: URL,
  signal: AbortSignal,
  accept: string,
  redirects = 0,
): Promise<PublicResource | null> {
  if (!allowedUrl(url) || redirects > 3 || signal.aborted) return null;
  try {
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("Deadline")), {
          once: true,
        }),
      ),
    ]);
    if (signal.aborted) return null;
    if (
      !addresses.length ||
      addresses.some(({ address, family }) => !isPublicAddress(address, family))
    )
      return null;
    const selected =
      addresses.find((address) => address.family === 4) ?? addresses[0];
    return await new Promise((resolve) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: "GET",
          signal,
          timeout: 5000,
          headers: {
            Accept: accept,
            "Accept-Encoding": "identity",
            "User-Agent": "Mappleo favicon discovery/1.0",
          },
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [selected]);
            else callback(null, selected.address, selected.family);
          },
        },
        (response) => {
          const location = response.headers.location;
          if (
            response.statusCode &&
            response.statusCode >= 300 &&
            response.statusCode < 400 &&
            location
          ) {
            response.destroy();
            try {
              const next = new URL(location, url);
              resolve(
                sameWebsiteHost(next.hostname, url.hostname)
                  ? getResource(next, signal, accept, redirects + 1)
                  : null,
              );
            } catch {
              resolve(null);
            }
            return;
          }
          if (
            response.statusCode !== 200 ||
            (accept === "text/html" &&
              !String(response.headers["content-type"] ?? "")
                .toLowerCase()
                .includes("text/html")) ||
            Number(response.headers["content-length"] ?? 0) > 300000 ||
            ![undefined, "identity"].includes(
              response.headers["content-encoding"],
            )
          ) {
            response.destroy();
            resolve(null);
            return;
          }
          const payload = Buffer.allocUnsafe(300000);
          let size = 0;
          let tail = "";
          response.on("data", (chunk: Buffer) => {
            if (size + chunk.length > 300_000) {
              response.destroy();
              resolve(null);
              return;
            }
            payload.set(chunk, size);
            size += chunk.length;
            const fragment =
              accept === "text/html"
                ? tail + chunk.toString("latin1").toLowerCase()
                : "";
            tail = fragment.slice(-6);
            if (accept === "text/html" && fragment.includes("</head>")) {
              response.destroy();
              resolve({
                bytes: Buffer.from(payload.subarray(0, size)),
                mime: String(response.headers["content-type"] ?? "")
                  .split(";")[0]
                  .toLowerCase(),
                url: url.href,
              });
            }
          });
          response.on("end", () =>
            resolve({
              bytes: Buffer.from(payload.subarray(0, size)),
              mime: String(response.headers["content-type"] ?? "")
                .split(";")[0]
                .toLowerCase(),
              url: url.href,
            }),
          );
          response.on("error", () => resolve(null));
        },
      );
      request.on("timeout", () => request.destroy());
      request.on("error", () => resolve(null));
      request.end();
    });
  } catch {
    return null;
  }
}
async function boundedResource(url: URL, accept: string) {
  if (activeRequests >= 12) return null;
  activeRequests++;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    return await getResource(url, controller.signal, accept);
  } finally {
    clearTimeout(timer);
    controller.abort();
    activeRequests--;
  }
}

// Never serve SVG, HTML or an image with a misleading MIME type as trusted same-origin content.
export function safeImageMime(bytes: Buffer, mime: string) {
  if (
    mime === "image/png" &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return mime;
  if (
    ["image/jpeg", "image/jpg"].includes(mime) &&
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  )
    return "image/jpeg";
  if (
    mime === "image/gif" &&
    ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())
  )
    return mime;
  if (
    mime === "image/webp" &&
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    return mime;
  if (
    ["image/x-icon", "image/vnd.microsoft.icon"].includes(mime) &&
    bytes.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))
  )
    return "image/x-icon";
  return "";
}
export async function fetchCompanyIcon(url: string) {
  const image = await boundedResource(
    new URL(url),
    "image/png,image/jpeg,image/webp,image/gif,image/x-icon",
  );
  if (!image || !safeImageMime(image.bytes, image.mime)) return null;
  return { bytes: image.bytes, mime: safeImageMime(image.bytes, image.mime) };
}

export async function discoverCompanyIcon(websiteUrl: string) {
  if (!websiteUrl) return "";
  try {
    const page = await boundedResource(new URL(websiteUrl), "text/html");
    return page ? findIconInHtml(page.bytes.toString("utf8"), page.url) : "";
  } catch {
    return "";
  }
}
