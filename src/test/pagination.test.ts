import { describe, expect, it } from 'vitest'
import { paginate, visiblePageNumbers } from '../domain/pagination'

describe('pagination', () => {
  it('returns the requested slice', () => {
    const result = paginate(Array.from({ length: 45 }, (_, index) => index + 1), 2, 20)
    expect(result.currentPage).toBe(2)
    expect(result.totalPages).toBe(3)
    expect(result.items).toEqual(Array.from({ length: 20 }, (_, index) => index + 21))
  })

  it('clamps pages after results shrink', () => {
    const result = paginate(['a', 'b'], 8, 20)
    expect(result.currentPage).toBe(1)
    expect(result.totalPages).toBe(1)
    expect(result.items).toEqual(['a', 'b'])
  })

  it('keeps the current page near the middle of the page buttons', () => {
    expect(visiblePageNumbers(6, 10)).toEqual([4, 5, 6, 7, 8])
    expect(visiblePageNumbers(10, 10)).toEqual([6, 7, 8, 9, 10])
  })
})
