'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Check, Copy, LoaderCircle, Plus, Receipt, Users, Wallet } from 'lucide-react'
import { balancesSumToZero, calculateBalances, calculateSettlements, formatPaise, isValidUpiId, parseRupeesToPaise, type SplitExpense, type SplitMember, type TripSplitLedger } from '@/lib/trip-split'

type SplitResponse = {
  tripId: string
  title: string
  destination: string
  members: SplitMember[]
  expenses: SplitExpense[]
}

const emptyLedger: TripSplitLedger = { members: [], expenses: [] }

export default function TripSplitPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState('')
  const [trip, setTrip] = useState<SplitResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [upiId, setUpiId] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitBetween, setSplitBetween] = useState<string[]>([])

  const load = useCallback(async (inviteToken: string) => {
    const response = await fetch(`/api/trip-split/${encodeURIComponent(inviteToken)}`, { cache: 'no-store' })
    const result = await response.json() as { split?: SplitResponse; error?: string }
    if (!response.ok || !result.split) throw new Error(result.error ?? 'Could not load this trip split.')
    setTrip(result.split)
  }, [])

  useEffect(() => {
    let cancelled = false
    params.then(({ token: inviteToken }) => {
      if (cancelled) return
      setToken(inviteToken)
      load(inviteToken).catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not load this trip split.')
      }).finally(() => { if (!cancelled) setLoading(false) })
    }).catch(() => { if (!cancelled) { setError('This trip split link is not valid.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [params, load])

  const ledger = useMemo<TripSplitLedger>(() => trip ? { members: trip.members, expenses: trip.expenses } : emptyLedger, [trip])
  const balances = useMemo(() => calculateBalances(ledger), [ledger])
  const settlements = useMemo(() => calculateSettlements(ledger), [ledger])
  const totalPaise = ledger.expenses.reduce((sum, expense) => sum + expense.amountPaise, 0)
  const memberById = useMemo(() => new Map(ledger.members.map((member) => [member.id, member])), [ledger.members])

  async function submitAction(payload: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/trip-split/${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'The change could not be saved.')
      await load(token)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The change could not be saved.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function joinTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim()) return
    if (upiId.trim() && !isValidUpiId(upiId)) { setError('Enter a valid UPI ID, such as name@bank.'); return }
    const success = await submitAction({ action: 'join', name: name.trim(), upiId: upiId.trim() })
    if (success) { setName(''); setUpiId('') }
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amountPaise = parseRupeesToPaise(amount)
    if (!amountPaise) { setError('Enter an amount greater than ₹0, with up to two decimal places.'); return }
    if (!paidBy || splitBetween.length === 0) { setError('Choose who paid and at least one person to split with.'); return }
    const success = await submitAction({ action: 'expense', description: description.trim(), amountPaise, paidBy, splitBetween })
    if (success) { setDescription(''); setAmount('') }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(window.location.href) }
    catch { setError('Copying is unavailable in this browser. You can copy the URL from the address bar.') }
  }

  if (loading) return <main className="split-page"><div className="split-loading"><LoaderCircle className="spin" />Loading Trip Split…</div></main>
  if (!trip) return <main className="split-page"><a className="split-back" href="/"><ArrowLeft size={15} /> Back to Rove</a><section className="split-card"><h1>Trip Split unavailable</h1><p>{error || 'This invite link may have expired.'}</p></section></main>

  return (
    <main className="split-page">
      <div className="split-shell">
        <header className="split-nav">
          <a className="wordmark" href="/">ROVE</a><span>TRIP SPLIT</span>
          <button className="split-outline-button" type="button" onClick={copyInvite}><Copy size={14} />Copy invite</button>
        </header>
        <section className="split-hero">
          <a className="split-back" href="/"><ArrowLeft size={14} /> Back to Rove</a>
          <p className="section-note"><span /> SHARED TRIP EXPENSES</p>
          <h1>{trip.title}</h1><p>{trip.destination} · Keep the group spend in one place, then settle up with fewer payments.</p>
          <div className="split-stats">
            <div><span>GROUP SPEND</span><strong>{formatPaise(totalPaise)}</strong></div>
            <div><span>PEOPLE</span><strong>{ledger.members.length}</strong></div>
            <div><span>EXPENSES</span><strong>{ledger.expenses.length}</strong></div>
          </div>
        </section>
        {error && <p className="split-error" role="alert">{error}</p>}
        <div className="split-grid">
          <section className="split-card">
            <div className="split-card-heading"><Users size={18} /><div><h2>People</h2><p>Everyone adds their name and optional UPI ID.</p></div></div>
            <form className="split-form" onSubmit={joinTrip}>
              <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Aditi" required /></label>
              <label>UPI ID <span>optional</span><input value={upiId} onChange={(event) => setUpiId(event.target.value)} maxLength={256} placeholder="name@bank" /></label>
              <button className="split-primary-button" type="submit" disabled={busy}><Plus size={15} />Join this trip</button>
            </form>
            <div className="split-member-list">{ledger.members.map((member) => <div className="split-member" key={member.id}><span className="split-avatar">{member.name.trim().slice(0,1).toUpperCase()}</span><div><strong>{member.name}</strong><small>{member.upiId || 'UPI ID not added'}</small></div></div>)}{!ledger.members.length && <p className="split-muted">No one has joined yet. Be the first.</p>}</div>
          </section>
          <section className="split-card">
            <div className="split-card-heading"><Receipt size={18} /><div><h2>Add an expense</h2><p>Enter the exact amount in rupees.</p></div></div>
            <form className="split-form" onSubmit={addExpense}>
              <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} placeholder="Dinner, cab, hotel…" required /></label>
              <label>Amount (₹)<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="1250.00" required /></label>
              <label>Paid by<select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required><option value="">Choose a person</option>{ledger.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
              <fieldset className="split-participants"><legend>Split between</legend><div>{ledger.members.map((member) => <label key={member.id}><input type="checkbox" checked={splitBetween.includes(member.id)} onChange={(event) => setSplitBetween((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />{member.name}</label>)}</div></fieldset>
              <button className="split-primary-button" type="submit" disabled={busy || ledger.members.length === 0}><Plus size={15} />Add expense</button>
            </form>
          </section>
          <section className="split-card">
            <div className="split-card-heading"><Wallet size={18} /><div><h2>Balances</h2><p>Positive means owed money; negative means you owe.</p></div></div>
            <div className="split-balance-list">{ledger.members.map((member) => { const balance = balances.get(member.id) ?? 0; return <div className="split-balance" key={member.id}><span>{member.name}</span><strong className={balance > 0 ? 'is-credit' : balance < 0 ? 'is-debit' : ''}>{balance > 0 ? '+' : ''}{formatPaise(balance)}</strong></div> })}{!ledger.members.length && <p className="split-muted">Balances appear when people join.</p>}</div>
            <p className="split-zero-check">{balancesSumToZero(ledger) ? <><Check size={14} />Balances add up to exactly ₹0.00</> : 'Balance check failed. Review the expenses.'}</p>
          </section>
          <section className="split-card">
            <div className="split-card-heading"><Check size={18} /><div><h2>Settle up</h2><p>Suggested transfers generated from net balances.</p></div></div>
            <div className="split-settlement-list">{settlements.map((settlement, index) => <article key={index}><div><strong>{settlement.from.name}</strong><span> pays </span><strong>{settlement.to.name}</strong><small>{settlement.to.upiId || 'Add the receiver’s UPI ID before paying'}</small></div><b>{formatPaise(settlement.amountPaise)}</b></article>)}{!settlements.length && <p className="split-muted">Add expenses to calculate who should pay whom.</p>}</div>
            <p className="split-disclaimer">Confirm the payee and UPI ID in your UPI app before sending money. Rove does not initiate or verify payments.</p>
          </section>
          <section className="split-card split-expenses-card">
            <div className="split-card-heading"><Receipt size={18} /><div><h2>Expense history</h2><p>Expenses are divided as evenly as possible among selected people.</p></div></div>
            <div className="split-expense-list">{ledger.expenses.map((expense) => <article key={expense.id}><div><strong>{expense.description}</strong><small>Paid by {memberById.get(expense.paidBy)?.name ?? 'Unknown'} · split with {expense.splitBetween.map((id) => memberById.get(id)?.name).filter(Boolean).join(', ')}</small></div><b>{formatPaise(expense.amountPaise)}</b></article>)}{!ledger.expenses.length && <p className="split-muted">Your group’s expenses will show up here.</p>}</div>
          </section>
        </div>
        <footer className="split-footer">ROVE · Travel together. Settle simply.</footer>
      </div>
    </main>
  )
}
