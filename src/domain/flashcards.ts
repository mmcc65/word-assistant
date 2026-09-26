import type { FlashcardProgress, FlashcardRating } from './types'

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const KNOWN_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60]

export function isFlashcardDue(progress: FlashcardProgress | undefined, now = new Date()): boolean {
  return !progress || Date.parse(progress.nextReviewAt) <= now.getTime()
}

export function reviewFlashcard(
  wordId: string,
  current: FlashcardProgress | undefined,
  rating: FlashcardRating,
  now = new Date(),
): FlashcardProgress {
  const previousLevel = current?.level ?? 0
  let level = previousLevel
  let streak = current?.streak ?? 0
  let nextReviewAt: Date

  if (rating === 'again') {
    level = Math.max(0, previousLevel - 1)
    streak = 0
    nextReviewAt = new Date(now.getTime() + 10 * MINUTE)
  } else if (rating === 'hard') {
    level = Math.max(0, previousLevel)
    streak = 0
    nextReviewAt = new Date(now.getTime() + DAY)
  } else {
    level = Math.min(KNOWN_INTERVAL_DAYS.length - 1, previousLevel + 1)
    streak += 1
    nextReviewAt = new Date(now.getTime() + KNOWN_INTERVAL_DAYS[level] * DAY)
  }

  const timestamp = now.toISOString()
  return {
    wordId,
    level,
    streak,
    reviewCount: (current?.reviewCount ?? 0) + 1,
    lastRating: rating,
    lastReviewedAt: timestamp,
    nextReviewAt: nextReviewAt.toISOString(),
    updatedAt: timestamp,
  }
}

export function masteryLabel(level: number): string {
  if (level >= 5) return '熟练'
  if (level >= 3) return '掌握中'
  if (level >= 1) return '学习中'
  return '新词'
}
