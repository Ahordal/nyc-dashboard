// toTitleCase.ts

// Capitalizes the first letter after a space, a hyphen, or the string
// start - not after an apostrophe, so a possessive "'s" stays lowercase.
export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_match, boundary: string, letter: string) => boundary + letter.toUpperCase());
}