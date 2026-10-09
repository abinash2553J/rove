export const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? ''
  const ip = forwarded.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return ip || 'unknown'
}

export function consumeRateLimit(key: string, limit: number, windowMs: number): boolean {
  if (limit <= 0 || windowMs <= 0) return false

  const now = Date.now()
  const bucket = rateLimitBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) {
    return false
  }

  bucket.count += 1
  return true
}
