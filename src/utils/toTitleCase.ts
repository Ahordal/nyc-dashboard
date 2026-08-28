// toTitleCase.ts
//
// Lower-cases a string, then capitalizes the first letter of each
// space-separated word.

export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}