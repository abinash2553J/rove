import test from 'node:test'
import assert from 'node:assert/strict'

import { calculateBalances, parseAmountToPaise, settleBalances, splitEqually } from './expense-split.ts'

function minimumPayments(balances: number[]) {
  const pending = [...balances]
  function search(start: number): number {
    while (start < pending.length && pending[start] === 0) start++
    if (start === pending.length) return 0

    const debt = pending[start]
    let minimum = Number.POSITIVE_INFINITY
    const tried = new Set<number>()
    pending[start] = 0
    for (let index = start + 1; index < pending.length; index++) {
      if (debt * pending[index] >= 0 || tried.has(pending[index])) continue
      tried.add(pending[index])
      const previous = pending[index]
      pending[index] += debt
      minimum = Math.min(minimum, 1 + search(start + 1))
      pending[index] = previous
      if (debt + previous === 0) break
    }
    pending[start] = debt
    return minimum
  }
  return search(0)
}

test('parses rupee amounts as exact paise and rejects invalid precision', () => {
  assert.equal(parseAmountToPaise('100.01'), 10_001)
  assert.equal(parseAmountToPaise('1'), 100)
  assert.equal(parseAmountToPaise('001.5'), 150)
  assert.equal(parseAmountToPaise('1.001'), null)
  assert.equal(parseAmountToPaise('-1'), null)
  assert.equal(parseAmountToPaise('90071992547409.92'), null)
})

test('equal splits assign every leftover paise deterministically', () => {
  const shares = splitEqually(100, ['a', 'b', 'c'])
  assert.deepEqual(shares, [
    { userId: 'a', amountPaise: 34 },
    { userId: 'b', amountPaise: 33 },
    { userId: 'c', amountPaise: 33 },
  ])
  assert.equal(shares.reduce((total, share) => total + share.amountPaise, 0), 100)
  assert.deepEqual(splitEqually(1, ['a', 'b', 'c']), [
    { userId: 'a', amountPaise: 1 },
    { userId: 'b', amountPaise: 0 },
    { userId: 'c', amountPaise: 0 },
  ])
})

test('balances valid custom shares without rounding', () => {
  assert.deepEqual(
    calculateBalances(['a', 'b'], [{
      amountPaise: 101,
      paidBy: 'a',
      splits: [{ userId: 'a', amountPaise: 40 }, { userId: 'b', amountPaise: 61 }],
    }]),
    new Map([['a', 61], ['b', -61]]),
  )
})

test('rejects custom expense splits that do not add up exactly', () => {
  assert.throws(() => calculateBalances(['a', 'b'], [{
    amountPaise: 100,
    paidBy: 'a',
    splits: [{ userId: 'a', amountPaise: 33 }, { userId: 'b', amountPaise: 66 }],
  }]), /add up/)
})

test('finds four minimum payments for two independent three-person groups', () => {
  const settlements = settleBalances(new Map([
    ['a', 7_000], ['b', 5_000], ['c', -12_000],
    ['d', 4_000], ['e', -1_500], ['f', -2_500],
  ]))

  assert.equal(settlements.length, 4)
  assert.equal(settlements.length, minimumPayments([7_000, 5_000, -12_000, 4_000, -1_500, -2_500]))
  assert.deepEqual(
    settlements.reduce((balances, payment) => {
      balances.set(payment.fromUserId, (balances.get(payment.fromUserId) ?? 0) - payment.amountPaise)
      balances.set(payment.toUserId, (balances.get(payment.toUserId) ?? 0) + payment.amountPaise)
      return balances
    }, new Map<string, number>()),
    new Map([['c', -12_000], ['a', 7_000], ['b', 5_000], ['e', -1_500], ['d', 4_000], ['f', -2_500]]),
  )
})

test('balances and settles ten independently generated trips', () => {
  let seed = 41
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff
    return seed % 10_000 + 1
  }

  for (let trip = 0; trip < 10; trip++) {
    const userIds = Array.from({ length: 6 }, (_, index) => `trip-${trip}-person-${index}`)
    const expenses = Array.from({ length: 8 }, (_, index) => {
      const amountPaise = random()
      return {
        amountPaise,
        paidBy: userIds[index % userIds.length],
        splits: splitEqually(amountPaise, userIds),
      }
    })
    const balances = calculateBalances(userIds, expenses)
    const settlements = settleBalances(balances)
    const paid = new Map(userIds.map((userId) => [userId, 0]))
    for (const settlement of settlements) {
      paid.set(settlement.fromUserId, paid.get(settlement.fromUserId)! - settlement.amountPaise)
      paid.set(settlement.toUserId, paid.get(settlement.toUserId)! + settlement.amountPaise)
    }

    assert.deepEqual(paid, balances)
    assert.equal(settlements.length, minimumPayments([...balances.values()]))
    assert.ok(settlements.length <= userIds.length - 1)
  }
})
