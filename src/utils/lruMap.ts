// lruMap.ts
//
// LRU helpers over a plain Map, for dashboard.tsx's per-CAMIS cache.
// Recency is just the Map's own insertion order.

// Reads key, moving it to the most-recently-used position on a hit.
export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value !== undefined) {
    map.delete(key);
    map.set(key, value);
  }
  return value;
}

// Writes key as MRU, evicting the oldest entry once full. Deletes first,
// so overwriting a key never counts as growth.
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
