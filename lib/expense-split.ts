export type ExpenseShare = {
  userId: string
  amountPaise: number
}

export type ExpenseForBalance = {
  amountPaise: number
  paidBy: string
  splits: ExpenseShare[]
}

export type Settlement = {
  fromUserId: string
  toUserId: string
  amountPaise: number
}

export function parseAmountToPaise(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null

  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}

export function splitEqually(amountPaise: number, userIds: string[]): ExpenseShare[] {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 0 || !userIds.length || userIds.length > 12 || new Set(userIds).size !== userIds.length) {
    throw new Error('An equal split needs a valid amount and 1–12 different members.')
  }

  const base = Math.floor(amountPaise / userIds.length)
  const remainder = amountPaise % userIds.length
  return userIds.map((userId, index) => ({ userId, amountPaise: base + Number(index < remainder) }))
}

export function calculateBalances(userIds: string[], expenses: ExpenseForBalance[]): Map<string, number> {
  if (!userIds.length || userIds.length > 12 || new Set(userIds).size !== userIds.length) {
    throw new Error('A trip must have 1–12 different members.')
  }

  const balances = new Map(userIds.map((userId) => [userId, 0]))
  for (const expense of expenses) {
    if (!Number.isSafeInteger(expense.amountPaise) || expense.amountPaise <= 0 || !balances.has(expense.paidBy) || !expense.splits.length) {
      throw new Error('An expense has an invalid amount or member.')
    }

    const splitMembers = new Set<string>()
    let splitTotal = 0
    for (const split of expense.splits) {
      if (!balances.has(split.userId) || splitMembers.has(split.userId) || !Number.isSafeInteger(split.amountPaise) || split.amountPaise < 0) {
        throw new Error('An expense split has an invalid or repeated member.')
      }
      splitMembers.add(split.userId)
      splitTotal += split.amountPaise
      if (!Number.isSafeInteger(splitTotal)) throw new Error('An expense split exceeds the supported amount.')
    }
    if (splitTotal !== expense.amountPaise) throw new Error('Expense shares must add up to the expense total.')

    const payerBalance = balances.get(expense.paidBy)! + expense.amountPaise
    if (!Number.isSafeInteger(payerBalance)) throw new Error('A trip balance exceeds the supported amount.')
    balances.set(expense.paidBy, payerBalance)
    for (const split of expense.splits) {
      const balance = balances.get(split.userId)! - split.amountPaise
      if (!Number.isSafeInteger(balance)) throw new Error('A trip balance exceeds the supported amount.')
      balances.set(split.userId, balance)
    }
  }

  return balances
}

export function settleBalances(balances: Map<string, number>): Settlement[] {
  let totalBalance = 0
  let totalOwed = 0
  let totalOwedTo = 0
  for (const balance of balances.values()) {
    totalBalance += balance
    if (balance < 0) totalOwed -= balance
    else totalOwedTo += balance
    if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(totalBalance) ||
      !Number.isSafeInteger(totalOwed) || !Number.isSafeInteger(totalOwedTo)) {
      throw new Error('Trip balances must be safe integer paise that add up to zero.')
    }
  }
  if (balances.size > 12 || totalBalance !== 0) {
    throw new Error('Trip balances must be safe integer paise that add up to zero.')
  }

  const unsettled = [...balances.entries()].filter(([, balance]) => balance !== 0)
  const count = unsettled.length
  if (!count) return []

  const subsetCount = 1 << count
  const subsetSums = new Array<number>(subsetCount).fill(0)
  const bestGroupCount = new Array<number>(subsetCount).fill(-1)
  const bestGroup = new Array<number>(subsetCount).fill(0)
  bestGroupCount[0] = 0

  for (let mask = 1; mask < subsetCount; mask++) {
    const first = mask & -mask
    const index = 31 - Math.clz32(first)
    subsetSums[mask] = subsetSums[mask ^ first] + unsettled[index][1]
    if (!Number.isSafeInteger(subsetSums[mask])) throw new Error('Trip balances exceed the supported settlement range.')
    for (let group = mask; group; group = (group - 1) & mask) {
      const remaining = mask ^ group
      if ((group & first) && subsetSums[group] === 0 && bestGroupCount[remaining] >= 0 &&
        bestGroupCount[remaining] + 1 > bestGroupCount[mask]) {
        bestGroupCount[mask] = bestGroupCount[remaining] + 1
        bestGroup[mask] = group
      }
    }
  }

  const settlements: Settlement[] = []
  for (let mask = subsetCount - 1; mask;) {
    let group = bestGroup[mask]
    const debtors: [string, number][] = []
    const creditors: [string, number][] = []
    for (let index = 0; index < count; index++) {
      if (group & (1 << index)) {
        const [userId, balance] = unsettled[index]
        if (balance < 0) debtors.push([userId, -balance])
        else creditors.push([userId, balance])
      }
    }

    let debtorIndex = 0
    let creditorIndex = 0
    while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
      const amountPaise = Math.min(debtors[debtorIndex][1], creditors[creditorIndex][1])
      settlements.push({
        fromUserId: debtors[debtorIndex][0],
        toUserId: creditors[creditorIndex][0],
        amountPaise,
      })
      debtors[debtorIndex][1] -= amountPaise
      creditors[creditorIndex][1] -= amountPaise
      if (!debtors[debtorIndex][1]) debtorIndex++
      if (!creditors[creditorIndex][1]) creditorIndex++
    }

    mask ^= group
  }

  return settlements
}
