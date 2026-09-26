import { describe, expect, it } from 'vitest'
import { isFlashcardDue, masteryLabel, reviewFlashcard } from '../domain/flashcards'

describe('单词卡间隔复习', () => {
  const now = new Date('2026-09-26T00:00:00.000Z')

  it('新词标记认识后安排到次日', () => {
    const progress = reviewFlashcard('word-1', undefined, 'known', now)
    expect(progress.level).toBe(1)
    expect(progress.streak).toBe(1)
    expect(progress.nextReviewAt).toBe('2026-09-27T00:00:00.000Z')
  })

  it('连续认识会逐步延长到 3 天和 7 天', () => {
    const first = reviewFlashcard('word-1', undefined, 'known', now)
    const second = reviewFlashcard('word-1', first, 'known', now)
    const third = reviewFlashcard('word-1', second, 'known', now)
    expect(second.level).toBe(2)
    expect(second.nextReviewAt).toBe('2026-09-29T00:00:00.000Z')
    expect(third.nextReviewAt).toBe('2026-10-03T00:00:00.000Z')
  })

  it('不认识会重置连续次数并在十分钟后到期', () => {
    const learned = reviewFlashcard('word-1', undefined, 'known', now)
    const again = reviewFlashcard('word-1', learned, 'again', now)
    expect(again.level).toBe(0)
    expect(again.streak).toBe(0)
    expect(again.nextReviewAt).toBe('2026-09-26T00:10:00.000Z')
    expect(isFlashcardDue(again, new Date('2026-09-26T00:09:59.000Z'))).toBe(false)
    expect(isFlashcardDue(again, new Date('2026-09-26T00:10:00.000Z'))).toBe(true)
  })

  it('返回清晰的掌握阶段名称', () => {
    expect(masteryLabel(0)).toBe('新词')
    expect(masteryLabel(2)).toBe('学习中')
    expect(masteryLabel(4)).toBe('掌握中')
    expect(masteryLabel(6)).toBe('熟练')
  })
})
