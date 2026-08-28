// geocode.mjs
//
// Thin wrapper around the LocationIQ API. Does nothing except make the
// HTTP call and return raw results; all scoring/matching lives in
// scoring.mjs, kept separate so it stays testable without the live API.

const RATE_LIMIT_DELAY_MS = 1000; // stay well under LocationIQ's per-second limits

export function buildQueries(restaurant) {
  const { dba, building, street, boro, zip } = restaurant;
  const hyphenated = `${dba}, ${building} ${street}, ${boro}, NY ${zip}`;
  const queries = [{ label: 'hyphenated', query: hyphenated }];

  // Only add the no-hyphen variant when there's actually a hyphen to
  // strip. Otherwise `squished` equals `building` and this fired a
  // second, redundant LocationIQ request (its own quota hit and
  // rate-limit delay) for every restaurant whose address never had a
  // hyphen, which is most of them outside Queens-style building numbers.
  const squished = building.replace(/-/g, '');
  if (squished !== building) {
    const noHyphen = `${dba}, ${squished} ${street}, ${boro}, NY ${zip}`;
    queries.push({ label: 'no-hyphen', query: noHyphen });
  }

  return queries;
}

// Thrown specifically for HTTP 429 (rate limited) responses, distinct
// from other errors. Callers use it to tell "the account is
// rate-limited, stop trying entirely" from an ordinary transient failure
// that's fine to retry on a future run.
export class RateLimitedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitedError';
  }
}

// Makes a single LocationIQ search request. Throws on network/HTTP
// errors; the caller catches and translates into a "pending" state.
export async function fetchGeocode(query, apiKey) {
  const url = new URL('https://us1.locationiq.com/v1/search');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');

  const res = await fetch(url);

  if (res.status === 404) {
    // LocationIQ returns 404 for "no results found": not an error, just empty.
    return [];
  }
  if (res.status === 429) {
    throw new RateLimitedError(`LocationIQ rate limit hit (429): ${await res.text()}`);
  }
  if (!res.ok) {
    throw new Error(`LocationIQ error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function rateLimitDelay() {
  return new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
}