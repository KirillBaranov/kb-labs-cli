import { describe, it, expect } from 'vitest'

describe('Core', () => {
  it('should be importable', () => {
    expect(() => import('./index.ts')).not.toThrow()
  })
})
