export function normalizeWord(input: string): string {
  return input.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

export function isRecognizableEnglish(input: string): boolean {
  const normalized = normalizeWord(input)
  return normalized.length > 0 && normalized.length <= 100 && /^[a-z][a-z' -]*$/i.test(normalized)
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}
