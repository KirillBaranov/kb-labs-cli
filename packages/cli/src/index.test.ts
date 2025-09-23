import { describe, it, expect } from 'vitest'

describe('CLI', () => {
  it('should be importable', () => {
    expect(() => import('./index.ts')).not.toThrow()
  })
})
