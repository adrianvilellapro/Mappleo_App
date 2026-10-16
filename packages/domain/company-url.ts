export function isExampleHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return ["example.com", "example.org", "example.net", "example.test"].some(
    (reserved) => host === reserved || host.endsWith("." + reserved),
  );
}

export function sameWebsiteHost(left: string, right: string) {
  return (
    left.toLowerCase().replace(/^www\./, "") ===
    right.toLowerCase().replace(/^www\./, "")
  );
}

export function usableFaviconUrl(websiteUrl?: string, faviconUrl?: string) {
  if (!websiteUrl || !faviconUrl) return "";
  try {
    const site = new URL(websiteUrl);
    const icon = new URL(faviconUrl);
    if (
      !["http:", "https:"].includes(site.protocol) ||
      !["http:", "https:"].includes(icon.protocol) ||
      !sameWebsiteHost(site.hostname, icon.hostname) ||
      isExampleHost(site.hostname) ||
      !publicWebsiteUrl(site) ||
      !publicWebsiteUrl(icon)
    )
      return "";
    return icon.href;
  } catch {
    return "";
  }
}
export function publicWebsiteUrl(url: URL) {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return (
    ["http:", "https:"].includes(url.protocol) &&
    !url.username &&
    !url.password &&
    !url.port &&
    host.includes(".") &&
    !host.includes(":") &&
    !/^\d+\.\d+\.\d+\.\d+$/.test(host) &&
    ![".local", ".localhost", ".internal", ".invalid", ".test"].some((suffix) =>
      host.endsWith(suffix),
    ) &&
    !isExampleHost(host)
  );
}
