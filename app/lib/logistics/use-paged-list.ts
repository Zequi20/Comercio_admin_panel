"use client";

import { useEffect, useState } from "react";

import { logisticsFetch, problemMessage } from "./client";

/** A numbered page from the logistics API (`page` + `pageSize`, with the total of the same filter). */
export type PagedResult<T> = { data: T[]; total: number; page: number; pageSize: number };

/**
 * Loads one page of a logistics list. `path` carries the filters and the page; changing it, or
 * `refreshKey`, loads again. Answers that arrive after a newer request are ignored, so fast typing
 * or paging never shows an older page. The last page stays visible while the next one loads.
 */
export function usePagedList<T>(
  path: string,
  refreshKey: number
): { result: PagedResult<T> | null; loading: boolean; error: string | null } {
  const [result, setResult] = useState<PagedResult<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const response = await logisticsFetch<PagedResult<T>>(path);
      if (!active) return;
      setLoading(false);
      if (response.ok) {
        setResult(response.data);
        setError(null);
      } else {
        setError(problemMessage(response.problem, "No se pudo cargar el listado."));
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [path, refreshKey]);

  return { result, loading, error };
}

/** Builds `name?key=value&…`, leaving out empty values. */
export function listPath(name: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  return `${name}?${query.toString()}`;
}
