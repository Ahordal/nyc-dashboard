// typeScale.test.ts
//
// Guards the type scale: every font-size in global.css must resolve to a
// --fs-* token (or `inherit`), never a raw length. This is what keeps the
// scale from drifting back into ~20 hand-picked sizes. If you genuinely
// need a new step, add it to :root and to VALID_TOKENS below.

import { describe, expect, it } from "vitest";

import css from "./global.css?raw";

const VALID_TOKENS = [
  "--fs-2xs",
  "--fs-xs",
  "--fs-sm",
  "--fs-md",
  "--fs-lg",
  "--fs-xl",
  "--fs-2xl",
  "--fs-display",
];

// The reflow block recomputes the decorative "NYC" wordmark as a
// viewport-relative clamp(); it's the one intentional non-token size.
const ALLOWED_RAW = [/font-size:\s*clamp\(4rem, 12vw, 9rem\)/];

describe("type scale", () => {
  it("only uses defined --fs-* tokens", () => {
    const used = new Set(
      [...css.matchAll(/font-size:\s*var\((--fs-[a-z0-9-]+)\)/g)].map(
        (m) => m[1],
      ),
    );
    for (const token of used) {
      expect(VALID_TOKENS, `${token} is not a known scale step`).toContain(
        token,
      );
      expect(css, `${token} is used but never defined in :root`).toMatch(
        new RegExp(`\\s${token}:\\s`),
      );
    }
  });

  it("has no raw font-size literals", () => {
    const offenders = [...css.matchAll(/font-size:[^;]+;/g)]
      .map((m) => m[0])
      .filter(
        (decl) =>
          !decl.includes("var(--fs-") &&
          !/font-size:\s*inherit;/.test(decl) &&
          !ALLOWED_RAW.some((re) => re.test(decl)),
      );
    expect(
      offenders,
      `use a --fs-* token instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
