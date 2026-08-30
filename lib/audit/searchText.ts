// HOW SEARCH READS TEXT — ONE NORMALISATION, SHARED BY THE INDEX AND THE QUERY.
//
// The whole Level 1 failure this file exists to end came from ONE asymmetry:
// the field DISPLAYED `2026-08-19 · KE JSA Notifications Discussion`
// (graphTokens.humanizeRef) and the search INDEXED
// `ke://source/transcript/2026-08-19_KE-JSA-Notifications-Discussion`, so
// typing the exact words on screen returned nothing. A reader cannot be asked
// to know that a separator is an underscore rather than a space.
//
// The rule that fixes it, and the only rule this file has:
//
//   A SEPARATOR IS A SPACE. Hyphen, underscore, slash, colon, dot, comma and
//   every other punctuation mark all normalise to one space, on BOTH sides of
//   the comparison. Nothing else about the words is touched.
//
// Deliberately NOT here: stemming, synonyms, stop-word removal, phonetics.
// Every one of them makes a match harder to explain, and an unexplainable
// match in a project brain is worse than a missing one. See the maturity
// boundary in docs/SIGNAL-SEARCH.md.

/**
 * The canonical comparison form of a piece of text.
 *
 *   `ke://source/transcript/2026-08-19_KE-JSA-Notifications-Discussion`
 *     → `ke source transcript 2026 08 19 ke jsa notifications discussion`
 *   `SOF-487`            → `sof 487`
 *   `Lucija Jovanovska`  → `lucija jovanovska`
 *   `don't ship it`      → `dont ship it`
 *
 * Steps, in order, and each one is here because a real query needed it:
 *
 *   NFKD + mark stripping   `Jovanovská` and `Jovanovska` are the same person
 *                           to anyone typing without a compose key.
 *   apostrophes REMOVED     not spaced — `don't` must become one token
 *                           `dont`, so `dont` and `don't` both find it.
 *   everything else spaced  the separator law above.
 *   whitespace collapsed    so token counts are stable.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKD")
    // Combining marks, stripped after decomposition. Latin-1 accents, the
    // producer's occasional smart quotes and pasted rich text all land here.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // APOSTROPHES CLOSE UP RATHER THAN SPLIT. Straight, curly, backtick and
    // acute — the four a real paste actually contains.
    .replace(/['‘’ʼ`´]/g, "")
    // EVERY OTHER NON-ALPHANUMERIC IS A SPACE. Written as "keep letters and
    // digits" rather than "replace this punctuation list", so a character
    // nobody anticipated cannot quietly stay glued to a word. \p{L}\p{N}
    // keeps this true for non-Latin scripts too.
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The normalised text with its spaces closed up.
 *
 * ONE JOB: letting an identifier be typed the way people actually type it.
 * `SOF-487`, `SOF 487` and `sof487` all compact to `sof487`, so none of the
 * three is a dead end. Never used for prose matching — a compacted sentence
 * matches nothing a human would type.
 */
export function compactSearchText(input: string): string {
  return normalizeSearchText(input).replace(/ /g, "");
}

/** The normalised text, split into tokens. Empty in, empty out. */
export function tokenizeSearchText(input: string): string[] {
  const n = normalizeSearchText(input);
  return n.length === 0 ? [] : n.split(" ");
}

/**
 * Whether `token` starts one of `tokens`.
 *
 * PREFIX, NOT SUBSTRING, and the asymmetry is deliberate. `notif` should find
 * "notifications" because that is how people narrow a query as they type;
 * `ation` should NOT, because a match in the middle of a word is a match a
 * reader cannot see the reason for. Substring matching of that kind is what
 * made a raw id containing the query's letters outrank a real title.
 */
export function anyTokenStartsWith(tokens: readonly string[], token: string): boolean {
  for (const t of tokens) if (t.startsWith(token)) return true;
  return false;
}

/**
 * Whether the normalised `phrase` occurs in `hay` ON TOKEN BOUNDARIES.
 *
 * `hay.includes(phrase)` is not enough: `sof 4` is a substring of `sof 487`
 * and means nothing, and "one" is a substring of "money". Padding both sides
 * with a space makes "a run of whole words" the thing being asked about,
 * which is what a reader means by "these words appear in it".
 */
export function containsPhrase(hay: string, phrase: string): boolean {
  if (phrase.length === 0) return false;
  return ` ${hay} `.includes(` ${phrase} `);
}

/**
 * The Damerau-Levenshtein distance between two tokens, ABANDONED once it
 * exceeds `max`.
 *
 * Damerau rather than plain Levenshtein because the transposition is the
 * single commonest real typo — `notifiactions` is one slip of two fingers,
 * not two independent errors, and charging it 2 puts it outside every
 * sensible threshold.
 *
 * The bound is what makes this affordable: the whole point is to reject
 * quickly, and a row whose best cell already exceeds `max` can never come
 * back under it, so the loop stops there. See the threshold rationale in
 * searchQuery.ts.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  // A length gap alone already costs that many edits — no table needed.
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Three rows: the one before last is what a transposition looks back at.
  const width = b.length + 1;
  let prev2 = new Array<number>(width);
  let prev = new Array<number>(width);
  let cur = new Array<number>(width);
  for (let j = 0; j < width; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowBest = cur[0];
    for (let j = 1; j < width; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowBest) rowBest = v;
    }
    if (rowBest > max) return max + 1;
    const spare = prev2;
    prev2 = prev;
    prev = cur;
    cur = spare;
  }
  return prev[b.length];
}
