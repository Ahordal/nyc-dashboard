// utils/toTitleCase.ts

export function toTitleCase(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}