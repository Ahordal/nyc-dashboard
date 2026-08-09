// geocode.mjs
// Thin wrapper around the LocationIQ API. Deliberately does nothing except
// make the HTTP call and return raw results — all scoring/matching logic
// lives in scoring.mjs, kept separate so it stays testable without hitting
// the live API.

const RATE_LIMIT_DELAY_MS = 1000; // stay well under LocationIQ's per-second limits

export function buildQueries(restaurant) {
  const { dba, building, street, boro, zip } = restaurant;
  const hyphenated = `${dba}, ${building} ${street}, ${boro}, NY ${zip}`;
  const squished = building.replace(/-/g, '');
  const noHyphen = `${dba}, ${squished} ${street}, ${boro}, NY ${zip}`;
  return [
    { label: 'hyphenated', query: hyphenated },
    { label: 'no-hyphen', query: noHyphen },
  ];
}

// Makes a single LocationIQ search request. Throws on network/HTTP errors —
// caller is responsible for catching and translating into a "pending" state.
export async function fetchGeocode(query, apiKey) {
  const url = new URL('https://us1.locationiq.com/v1/search');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');

  const res = await fetch(url);

  if (res.status === 404) {
    // LocationIQ returns 404 for "no results found" — not an error, just empty.
    return [];
  }
  if (!res.ok) {
    throw new Error(`LocationIQ error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function rateLimitDelay() {
  return new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
}
