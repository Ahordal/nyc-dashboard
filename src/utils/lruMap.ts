// lruMap.ts
//
// Least-recently-used helpers over a plain Map, used for dashboard.tsx's
// per-CAMIS inspection-history cache. Recency is the Map's own insertion
// order: the oldest key is the first one iteration yields.

// Reads key, moving it to the most-recently-used position on a hit.
export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value !== undefined) {
    map.delete(key);
    map.set(key, value);
  }
  return value;
}

// Writes key as most-recently-used, evicting the oldest entry once the
// map is full. Deleting first means overwriting an existing key never
// counts as growth and never triggers an eviction.
export function lruSet<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number,
): void {
  map.delete(key);
  if (map.size >= maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, value);
}
