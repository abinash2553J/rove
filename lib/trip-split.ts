export type SplitMember = {
  id: string
  name: string
  upiId: string
}

export type SplitExpense = {
  id: string
  description: string
  amountPaise: number
  paidBy: string
  splitBetween: string[]
  createdAt: string
}

export type TripSplitLedger = {
  members: SplitMember[]
  expenses: SplitExpense[]
}

export type Settlement = {
  from: SplitMember
  to: SplitMember
  amountPaise: number
}

export function isValidUpiId(value: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(value.trim())
}

export function parseRupeesToPaise(value: string): number | null {
  const normalized = value.trim().replace(/,/g, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const [rupees, fraction = ''] = normalized.split('.')
  const amount = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function formatPaise(amountPaise: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100)
}

export function calculateBalances(ledger: TripSplitLedger): Map<string, number> {
  const balances = new Map<string, number>(ledger.members.map((member) => [member.id, 0]))
  for (const expense of ledger.expenses) {
    if (!Number.isSafeInteger(expense.amountPaise) || expense.amountPaise <= 0) continue
    const participants = [...new Set(expense.splitBetween)].filter((id) => balances.has(id))
    if (!participants.length || !balances.has(expense.paidBy)) continue
    const baseShare = Math.floor(expense.amountPaise / participants.length)
    const remainder = expense.amountPaise % participants.length
    participants.forEach((id, index) => {
      const share = baseShare + (index < remainder ? 1 : 0)
      balances.set(id, (balances.get(id) ?? 0) - share)
    })
    balances.set(expense.paidBy, (balances.get(expense.paidBy) ?? 0) + expense.amountPaise)
  }
  return balances
}

export function calculateSettlements(ledger: TripSplitLedger): Settlement[] {
  const membersById = new Map(ledger.members.map((member) => [member.id, member]))
  const balances = calculateBalances(ledger)
  const creditors = [...balances.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  const debtors = [...balances.entries()]
    .filter(([, amount]) => amount < 0)
    .map(([id, amount]) => ({ id, amount: -amount }))
    .sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id))
  const settlements: Settlement[] = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amountPaise = Math.min(debtor.amount, creditor.amount)
    const from = membersById.get(debtor.id)
    const to = membersById.get(creditor.id)
    if (from && to && from.id !== to.id && amountPaise > 0) settlements.push({ from, to, amountPaise })
    debtor.amount -= amountPaise
    creditor.amount -= amountPaise
    if (debtor.amount === 0) debtorIndex += 1
    if (creditor.amount === 0) creditorIndex += 1
  }

  return settlements
}

export function balancesSumToZero(ledger: TripSplitLedger): boolean {
  return [...calculateBalances(ledger).values()].reduce((sum, value) => sum + value, 0) === 0
}
