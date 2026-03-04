/**
 * Detects actionable questions in assistant messages and extracts
 * quick-reply options (yes/no, numbered lists, A-or-B patterns).
 */

export interface ActionOption {
  label: string
  value: string
}

// --- Yes/No detection ---

const YES_NO_PATTERNS = [
  /\bdo you want (?:me to|to)\b/i,
  /\bshould I\b/i,
  /\bwould you like (?:me to|to)?\b/i,
  /\bshall I\b/i,
  /\bwant me to\b/i,
  /\bready to (?:proceed|continue|start|go)\b/i,
  /\bcan I (?:go ahead|proceed)\b/i,
  /\bproceed\??$/i,
  /\bcontinue\??$/i,
]

function findLastQuestionBlock(text: string): string {
  const blocks = text.trim().split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    if (blocks[i].includes('?')) return blocks[i]
  }
  return ''
}

function isYesNoQuestion(text: string): boolean {
  const lastQuestion = findLastQuestionBlock(text)
  if (!lastQuestion) return false
  return YES_NO_PATTERNS.some((p) => p.test(lastQuestion))
}

// --- Numbered option list detection ---
// Matches lines like "1. Option one", "2) Option two", "- Option three"

const NUMBERED_OPTION_RE = /^(?:\d+[.)]\s+|[-*+•]\s+)(.+)$/

function normalizeLabel(label: string): string {
  return label
    .replace(/\*\*/g, '')
    .replace(/`+/g, '')
    .replace(/_{1,2}/g, '')
    .trim()
}

function looksLikeExplanatoryText(label: string): boolean {
  // Lines with "=" or "—" followed by explanation are definitions, not options
  if (/\s+=\s+/.test(label) || /\s+—\s+/.test(label)) return true
  // Lines with parenthetical explanations longer than 20 chars
  const parenMatch = label.match(/\(([^)]+)\)/)
  if (parenMatch && parenMatch[1].length > 20) return true
  // Lines that are too long are usually explanatory
  if (label.length > 80) return true
  return false
}

function extractNumberedOptions(text: string): ActionOption[] | null {
  const lines = text.trim().split(/\r?\n/)
  let current: ActionOption[] = []

  const flushIfValid = (): ActionOption[] | null => {
    if (current.length >= 2) return current
    current = []
    return null
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim()
    if (!line) {
      const found = flushIfValid()
      if (found) return found
      continue
    }

    const match = line.match(NUMBERED_OPTION_RE)
    if (match) {
      const label = normalizeLabel(match[1])
      // Skip explanatory/definition lines
      if (looksLikeExplanatoryText(label)) {
        const found = flushIfValid()
        if (found) return found
        continue
      }
      if (label.length > 0 && label.length <= 120) {
        current.unshift({ label, value: label })
      }
      continue
    }

    const found = flushIfValid()
    if (found) return found
  }

  return flushIfValid()
}

// --- "A or B" pattern detection ---

const OR_PATTERN_RE = /\b(.{3,60}?)\s+or\s+(.{3,60})\?/i

function extractOrOptions(text: string): ActionOption[] | null {
  const lastQuestion = findLastQuestionBlock(text)
  if (!lastQuestion) return null

  const match = lastQuestion.match(OR_PATTERN_RE)
  if (!match) return null

  const a = normalizeLabel(match[1])
  const b = normalizeLabel(match[2].replace(/[?.!]*$/, ''))

  // Filter out overly generic fragments
  if (a.length < 2 || b.length < 2) return null
  if (a.split(' ').length > 10 || b.split(' ').length > 10) return null

  return [
    { label: a, value: a },
    { label: b, value: b },
  ]
}

// --- Public API ---

/**
 * Given the text of the last assistant message, returns an array of
 * quick-reply options, or null if no actionable question is detected.
 */
export function detectActionOptions(text: string): ActionOption[] | null {
  if (!text || text.length < 10) return null

  // 1. Check for numbered option lists first (most specific)
  const numbered = extractNumberedOptions(text)
  if (numbered) return numbered

  // 2. Check for "A or B?" pattern
  const orOptions = extractOrOptions(text)
  if (orOptions) return orOptions

  // 3. Check for yes/no questions
  if (isYesNoQuestion(text)) {
    return [
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' },
    ]
  }

  return null
}
