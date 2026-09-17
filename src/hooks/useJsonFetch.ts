// useJsonFetch.ts
//
// Fetches JSON once on mount, falling back to `fallback` on any failure;
// aborts on unmount. `fallback` must stay referentially stable — it's
// read only on failure, never a dependency.

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
