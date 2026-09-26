import { vi } from 'vitest'

if (!globalThis.crypto.randomUUID) {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: vi.fn(() => '00000000-0000-4000-8000-000000000000') })
}
