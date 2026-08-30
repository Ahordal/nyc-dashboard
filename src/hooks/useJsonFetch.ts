// useJsonFetch.ts
//
// Fetches a JSON document once on mount, returning the parsed value or the
// fallback on any failure (non-ok response or parse/network error). Aborts
// the in-flight request on unmount. `fallback` must be a stable reference —
// it's only read when the fetch fails and is not a dependency.

import { useEffect, useState } from "react";

export function useJsonFetch<T>(url: string, fallback: T): T {
  const [data, setData] = useState<T>(fallback);

  useEffect(() => {
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : fallback))
      .then((value: T) => {
        setData(value);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setData(fallback);
        }
      });

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return data;
}
