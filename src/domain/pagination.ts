export interface PaginationResult<T> {
  currentPage: number
  totalPages: number
  items: T[]
}

export function paginate<T>(items: T[], requestedPage: number, pageSize: number): PaginationResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize))
  const currentPage = Math.min(totalPages, Math.max(1, Math.floor(requestedPage)))
  const start = (currentPage - 1) * safePageSize
  return { currentPage, totalPages, items: items.slice(start, start + safePageSize) }
}

export function visiblePageNumbers(currentPage: number, totalPages: number, maximum = 5): number[] {
  const count = Math.min(Math.max(1, maximum), totalPages)
  let start = Math.max(1, currentPage - Math.floor(count / 2))
  start = Math.min(start, totalPages - count + 1)
  return Array.from({ length: count }, (_, index) => start + index)
}
