/**
 * VoiceSearchEngine
 *
 * Pure, stateless functions for the Voice Intel Protocol.
 * Zero React dependencies — pluggable into any screen.
 *
 * Layers:
 *  1. Protocol constants (VOICE_TRIGGERS)
 *  2. Text normalisation (control-word stripping, transcript cleaning)
 *  3. Vocabulary snapping (Levenshtein / fuzzy correction)
 *  4. Candidate scoring (token intersection, Sørensen–Dice similarity)
 *  5. Number parsing (spoken 0–100)
 */

// ============================================================================
// 1. PROTOCOL CONSTANTS
// ============================================================================

export const VOICE_TRIGGERS = {
  WAKE:     'CHECK',
  TERMINATE: 'OVER',
  SKIP:     'PASS',
  ABANDON:  'QUIT',
  OPTIONS:  'OPTIONS',
  MIA:      'MISSING',
  RESTART:  'START OVER',
  COMPLETE: 'OVER AND OUT',
} as const;

/** All control words — excluded from vocabulary snapping so they are never
 *  accidentally mapped to a product name (e.g. CHECK → CHEDDAR). */
export const CONTROL_WORDS = new Set(
  Object.values(VOICE_TRIGGERS).flatMap(t => t.toLowerCase().split(' '))
);

// ============================================================================
// 2. TEXT NORMALISATION
// ============================================================================

/**
 * Normalises raw speech-recognition output for downstream processing:
 *  - Strips the OVER terminator so it doesn't appear in search tokens
 *  - Removes punctuation the speech engine injects (commas, slashes, etc.)
 *  - Lower-cases and trims
 *
 * Also used as a pre-pass before vocab snapping.
 */
export function normaliseTranscript(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\bover\b/g, '')        // strip OVER terminator
    .replace(/\//g, ' ')             // forward-slash → space (handles "1/")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/['']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalises a raw currentText stream value for trigger detection:
 *  - Upper-cases
 *  - Strips punctuation (.,!)
 *  - Replaces "/" with " OVER" so "1/" → "1 OVER" triggers correctly
 */
export function normaliseStreamText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[.,!]/g, '')
    .replace(/\//g, ' OVER')
    .trim();
}

// ============================================================================
// 3. VOCABULARY SNAPPING
// ============================================================================

const STOP_WORDS = new Set(['and', 'the', 'with', 'for', 'from', 'but', 'nor', 'yet', 'per', 'off']);

/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const matrix = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) matrix[i][0] = i;
  for (let j = 0; j <= n; j++) matrix[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[m][n];
}

/**
 * Snaps each token in a raw phrase to the nearest known vocabulary term using
 * Levenshtein distance. Control words are excluded from snapping.
 *
 * @param rawText  - Already normalised (lower-case, punctuation stripped)
 * @param knownVocab - Array of known product/brand terms from the database
 */
export function snapToVocabulary(rawText: string, knownVocab: string[]): string {
  const rawTokens = rawText.split(/\s+/).filter(t => t.length > 2);

  return rawTokens.map(token => {
    // Never snap control words
    if (CONTROL_WORDS.has(token)) return token;
    // Already a known word — return as-is
    if (knownVocab.includes(token)) return token;
    // Stop words pass through unchanged
    if (STOP_WORDS.has(token)) return token;

    let bestMatch = token;
    let minDistance = token.length <= 4 ? 2 : 3;

    for (const word of knownVocab) {
      const d = levenshtein(token, word);
      if (d < minDistance) {
        minDistance = d;
        bestMatch = word;
      }
    }
    return bestMatch;
  }).join(' ');
}

/**
 * Full normalise + snap pipeline. Equivalent to the old `normalizePhrase`.
 */
export function normalizePhrase(rawText: string, knownVocab: string[]): string {
  return snapToVocabulary(normaliseTranscript(rawText), knownVocab);
}

// ============================================================================
// 4. CANDIDATE SCORING
// ============================================================================

/**
 * Sørensen–Dice bigram similarity coefficient.
 * Returns 0.0–1.0. Robust to minor phonetic transcription errors.
 */
export function getSimilarity(first: string, second: string): number {
  first  = first.replace(/\s+/g, '').toLowerCase();
  second = second.replace(/\s+/g, '').toLowerCase();
  if (!first.length && !second.length) return 1;
  if (!first.length || !second.length) return 0;
  if (first === second) return 1;
  if (first.length < 2 || second.length < 2) return 0;

  const firstBigrams = new Map<string, number>();
  for (let i = 0; i < first.length - 1; i++) {
    const bigram = first.substring(i, i + 2);
    firstBigrams.set(bigram, (firstBigrams.get(bigram) || 0) + 1);
  }

  let intersectionSize = 0;
  for (let i = 0; i < second.length - 1; i++) {
    const bigram = second.substring(i, i + 2);
    const count = firstBigrams.get(bigram);
    if (count && count > 0) {
      firstBigrams.set(bigram, count - 1);
      intersectionSize++;
    }
  }

  return (2.0 * intersectionSize) / (first.length + second.length - 2);
}

/**
 * Filters candidates where a specific field matches the spoken text.
 * Uses substring inclusion with a 40% Dice bigram fallback.
 */
export function filterByTextIncludes<T>(
  candidates: T[],
  fieldExtractor: (c: T) => string | null | undefined,
  spokenText: string
): T[] {
  return candidates.filter(c => {
    const fieldVal = fieldExtractor(c)?.toLowerCase().trim();
    if (!fieldVal) return false;
    if (fieldVal.includes(spokenText) || spokenText.includes(fieldVal)) return true;
    return getSimilarity(spokenText, fieldVal) > 0.4;
  });
}

export interface ScoredCandidate {
  score: number;
  evidence: Array<{ field: string; token: string; confidence: number }>;
}

/**
 * Scores a database row against the query tokens.
 * Cabinet bonus doubles the score when the item matches the active cabinet.
 */
export function scoreCandidate<T extends { name: string; brand?: string | null; cabinet_id?: number | null; default_cabinet_id?: number | null }>(
  row: T,
  tokens: string[],
  selectedCabinetId?: string | number | null
): ScoredCandidate {
  let score = 0;
  const evidence: ScoredCandidate['evidence'] = [];

  for (const token of tokens) {
    if (row.name.toLowerCase().includes(token)) {
      score += 1.5;
      evidence.push({ field: 'name', token, confidence: 1.0 });
    }
    if (row.brand?.toLowerCase().includes(token)) {
      score += 1.0;
      evidence.push({ field: 'brand', token, confidence: 1.0 });
    }
  }

  if (
    selectedCabinetId &&
    (String(row.cabinet_id) === String(selectedCabinetId) ||
      String(row.default_cabinet_id) === String(selectedCabinetId))
  ) {
    score *= 2.0;
  }

  return { score, evidence };
}

// ============================================================================
// 5. NUMBER PARSING
// ============================================================================

/**
 * Parses a spoken quantity (0–100) from a string.
 * Handles digits, word forms, and compound forms ("twenty one").
 * Returns null if the input cannot be resolved.
 */
export function parseSpokenNumber(raw: string): number | null {
  const lower = raw.toLowerCase().trim();

  // Direct digit parse — parseInt stops at first non-digit so "1/" → 1 safely
  const direct = parseInt(lower, 10);
  if (!isNaN(direct) && direct >= 0 && direct <= 100) return direct;

  const ones: Record<string, number> = {
    zero: 0, nought: 0, oh: 0,
    one: 1, won: 1,
    two: 2, to: 2, too: 2,
    three: 3, free: 3,
    four: 4, for: 4, fore: 4,
    five: 5, six: 6, seven: 7, eight: 8, ate: 8,
    nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  };
  const tens: Record<string, number> = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };

  if (ones[lower] !== undefined) return ones[lower];
  if (tens[lower] !== undefined) return tens[lower];
  if (lower === 'hundred' || lower === 'a hundred' || lower === 'one hundred') return 100;

  // Compound: "twenty one", "thirty-five"
  const parts = lower.split(/[\s-]+/);
  if (parts.length === 2) {
    const tenPart = tens[parts[0]];
    const onePart = ones[parts[1]];
    if (tenPart !== undefined && onePart !== undefined && onePart < 20) {
      return tenPart + onePart;
    }
  }

  return null;
}
