"use client";

import { useCallback, useEffect, useState } from "react";
import { initials } from "@/lib/utils";
import { usableFaviconUrl } from "@/lib/company-icon-url";

export function CompanyLogo({
  name,
  websiteUrl,
  faviconUrl,
  companyId,
}: {
  name: string;
  websiteUrl?: string;
  faviconUrl?: string;
  companyId?: string;
}) {
  const iconUrl = usableFaviconUrl(websiteUrl, faviconUrl);
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  const [retried, setRetried] = useState("");
  const baseSrc = iconUrl
    ? companyId
      ? "/api/company-icon?id=" +
        encodeURIComponent(companyId) +
        "&v=2-" +
        iconVersion(iconUrl)
      : "/api/company-icon?url=" + encodeURIComponent(iconUrl) + "&v=2"
    : "";
  const src = baseSrc + (baseSrc && retried === baseSrc ? "&retry=1" : "");
  const showImage = Boolean(baseSrc) && failed !== baseSrc;
  const imageRef = useCallback(
    (node: HTMLImageElement | null) => {
      // Cached images may finish before React attaches its load listener.
      if (node?.complete && node.naturalWidth > 0) setLoaded(src);
      else if (node?.complete && node.currentSrc) setFailed(baseSrc);
    },
    [src, baseSrc, setLoaded, setFailed],
  );
  useEffect(() => {
    if (!baseSrc || failed !== baseSrc || retried === baseSrc) return;
    // A single bounded retry, only on failure. Never poll every logo.
    const timer = setTimeout(() => {
      setRetried(baseSrc);
      setFailed("");
    }, 16000);
    return () => clearTimeout(timer);
  }, [baseSrc, failed, retried]);

  return (
    <span
      className="company-logo"
      aria-hidden="true"
      data-favicon-url={baseSrc ? iconUrl : ""}
    >
      {(!showImage || loaded !== src) && initials(name)}
      {showImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          ref={imageRef}
          src={src}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          style={{ visibility: loaded === src ? "visible" : "hidden" }}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(baseSrc)}
        />
      )}
    </span>
  );
}
function iconVersion(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++)
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
