import test from 'node:test'
import assert from 'node:assert/strict'

import { consumeRateLimit, rateLimitBuckets } from './rate-limit.ts'

test('rate limiter allows a burst up to the configured limit', () => {
  const key = 'limit-test-user'
  rateLimitBuckets.delete(key)

  assert.equal(consumeRateLimit(key, 2, 60_000), true)
  assert.equal(consumeRateLimit(key, 2, 60_000), true)
  assert.equal(consumeRateLimit(key, 2, 60_000), false)
})

test('rate limiter resets when the window expires', () => {
  const key = 'limit-reset-user'
  const windowMs = 50
  rateLimitBuckets.delete(key)

  assert.equal(consumeRateLimit(key, 1, windowMs), true)
  assert.equal(consumeRateLimit(key, 1, windowMs), false)

  const state = rateLimitBuckets.get(key)
  if (state) {
    state.resetAt = Date.now() - 1
  }

  assert.equal(consumeRateLimit(key, 1, windowMs), true)
})
