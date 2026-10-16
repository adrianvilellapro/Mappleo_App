"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionFilters, CollectionPage } from "../collection";
import type { EntityKind } from "../config";
import { workspaceChangeEvent } from "@/lib/workspace-events";
export function useCollection(
  kind: EntityKind,
  initialPage: CollectionPage | undefined,
  filters: CollectionFilters,
) {
  const [page, setPage] = useState(initialPage);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const cache = useRef(
    new Map<string, { page: CollectionPage; until: number }>(),
  );
  const sequence = useRef(0);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify({ ...filters, offset: 0 });
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const invalidate = () => {
      cache.current.clear();
      setRevision((v) => v + 1);
    };
    window.addEventListener(workspaceChangeEvent, invalidate);
    return () => window.removeEventListener(workspaceChangeEvent, invalidate);
  }, []);
  useEffect(() => {
    if (!initialPage) return;
    const id = ++sequence.current;
    const controller = new AbortController();
    const remembered = cache.current.get(key);
    const filters = JSON.parse(key) as CollectionFilters;
    const seed = key === JSON.stringify({ ...initialPage.filters, offset: 0 });
    if (seed) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) {
          setPage(initialPage);
          setError("");
          setPending(false);
        }
      });
      return () => controller.abort();
    }
    if (remembered && remembered.until > Date.now()) {
      queueMicrotask(() => {
        if (!controller.signal.aborted) {
          setPage(remembered.page);
          setPending(false);
        }
      });
      return () => controller.abort();
    }
    const timer = setTimeout(
      () => {
        setPending(true);
        const params = new URLSearchParams({
          ...filters,
          offset: "0",
        } as unknown as Record<string, string>);
        fetch("/api/records/" + kind + "?" + params, {
          signal: controller.signal,
          cache: "no-store",
        })
          .then(async (r) => {
            const data = await r.json();
            if (!r.ok)
              throw Error(
                data.error || "No se han podido cargar los registros.",
              );
            return data as CollectionPage;
          })
          .then((data) => {
            if (id !== sequence.current || controller.signal.aborted) return;
            if (cache.current.size >= 12)
              cache.current.delete(cache.current.keys().next().value!);
            cache.current.set(key, {
              page: data,
              until: Date.now() + 2 * 60000,
            });
            setPage(data);
            setError("");
          })
          .catch((e) => {
            if (!controller.signal.aborted && id === sequence.current)
              setError(e.message);
          })
          .finally(() => {
            if (!controller.signal.aborted && id === sequence.current)
              setPending(false);
          });
      },
      filters.q ? 180 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // key includes every validated filter; initialPage changes after server mutations.
  }, [kind, key, initialPage, revision]);
  const loadMore = useCallback(async () => {
    if (!page?.hasMore || pending || error) return;
    // An observer may fire while the newly selected filter is still loading.
    // Never append a page from the previous filter to the new results.
    if (JSON.stringify({ ...page.filters, offset: 0 }) !== key) return;
    const id = sequence.current;
    const filters = JSON.parse(key) as CollectionFilters;
    setPending(true);
    try {
      const params = new URLSearchParams({
        ...filters,
        offset: String(page.offset + page.records.length),
      } as unknown as Record<string, string>);
      const response = await fetch("/api/records/" + kind + "?" + params, {
        cache: "no-store",
      });
      const next = await response.json();
      if (!response.ok)
        throw Error(next.error || "No se han podido cargar más registros.");
      if (id !== sequence.current) return;
      setPage({
        ...next,
        offset: 0,
        records: [
          ...page.records,
          ...next.records.filter(
            (r: { id: string }) => !page.records.some((old) => old.id === r.id),
          ),
        ],
      });
    } catch (e) {
      if (id === sequence.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se han podido cargar los registros.",
        );
    } finally {
      if (id === sequence.current) setPending(false);
    }
  }, [page, pending, error, kind, key]);
  useEffect(() => {
    const node = sentinel;
    if (!node || !initialPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "800px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [initialPage, loadMore, sentinel]);
  return { page, error, pending, sentinel: setSentinel };
}
