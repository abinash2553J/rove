'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { ArrowLeft, Check, Copy, LoaderCircle, Plus, ReceiptIndianRupee, RotateCw, Trash2, Users, Wallet } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { calculateBalances, parseAmountToPaise, settleBalances, splitEqually, type ExpenseForBalance } from '@/lib/expense-split'

type TripMember = {
  user_id: string
  display_name: string
  upi_id: string | null
}

type TripExpense = ExpenseForBalance & {
  id: string
  description: string
  createdBy: string
  createdAt: string
  splitType: 'equal' | 'custom'
}

type ExpenseRow = {
  id: string
  description: string
  amount_paise: number | string
  paid_by: string
  created_by: string
  split_type: 'equal' | 'custom'
  created_at: string
}

type SplitRow = {
  expense_id: string
  user_id: string
  amount_paise: number | string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const upiPattern = /^[a-zA-Z0-9._+-]{2,100}@[a-zA-Z0-9.-]{2,50}$/

function formatRupees(amountPaise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100)
}

export default function TripExpensesPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params)
  const [user, setUser] = useState<User | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [tripTitle, setTripTitle] = useState('')
  const [destination, setDestination] = useState('')
  const [members, setMembers] = useState<TripMember[]>([])
  const [expenses, setExpenses] = useState<TripExpense[]>([])
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [customShares, setCustomShares] = useState<Record<string, string>>({})
  const [upiInput, setUpiInput] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [copiedUpi, setCopiedUpi] = useState('')
  const loadSequence = useRef(0)
  const sessionUserId = useRef<string | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) {
      setError('Trip expenses need Supabase configured. Add the public Supabase URL and key, then reload.')
      setIsCheckingSession(false)
      setIsLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) console.error('Could not restore the trip-expense session:', sessionError)
      sessionUserId.current = data.session?.user.id ?? null
      setUser(data.session?.user ?? null)
      setIsCheckingSession(false)
    }).catch((sessionError: unknown) => {
      console.error('Could not restore the trip-expense session:', sessionError)
      setIsCheckingSession(false)
      setError('Your sign-in could not be checked. Return to ROVE and try again.')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      if (sessionUserId.current !== nextUser?.id) {
        sessionUserId.current = nextUser?.id ?? null
        loadSequence.current++
        setTripTitle('')
        setDestination('')
        setMembers([])
        setExpenses([])
        setError('')
        setIsLoading(Boolean(nextUser))
      }
      setUser((current) => current?.id === nextUser?.id ? current : nextUser)
      setIsCheckingSession(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !user || !uuidPattern.test(tripId)) {
      setIsLoading(false)
      if (!uuidPattern.test(tripId)) setError('This trip link is not valid.')
      return
    }

    const request = ++loadSequence.current
    try {
      const [tripResult, memberResult, expenseResult, splitResult] = await Promise.all([
        supabase.rpc('get_trip_split', { p_trip_id: tripId }),
        supabase.from('trip_members').select('user_id,display_name,upi_id').eq('trip_id', tripId).order('joined_at').order('user_id'),
        supabase.from('trip_expenses').select('id,description,amount_paise,paid_by,created_by,split_type,created_at').eq('trip_id', tripId).order('created_at', { ascending: false }),
        supabase.from('trip_expense_splits').select('expense_id,user_id,amount_paise').eq('trip_id', tripId),
      ])
      if (request !== loadSequence.current) return

      const loadError = tripResult.error ?? memberResult.error ?? expenseResult.error ?? splitResult.error
      if (loadError) {
        console.error('Could not load trip expenses:', loadError)
        setError('This shared expense list could not be loaded. Check your connection and trip access.')
        setIsLoading(false)
        return
      }

      const trip = Array.isArray(tripResult.data) ? tripResult.data[0] : null
      if (!trip) {
        setError('This trip is unavailable, or you do not have access to its expenses.')
        setIsLoading(false)
        return
      }

      try {
        const nextMembers = (memberResult.data ?? []) as TripMember[]
        const sharesByExpense = new Map<string, { userId: string; amountPaise: number }[]>()
        for (const row of (splitResult.data ?? []) as SplitRow[]) {
          const amountPaise = Number(row.amount_paise)
          if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) throw new Error('Invalid expense share.')
          const shares = sharesByExpense.get(row.expense_id) ?? []
          shares.push({ userId: row.user_id, amountPaise })
          sharesByExpense.set(row.expense_id, shares)
        }

        const nextExpenses = ((expenseResult.data ?? []) as ExpenseRow[]).map((row): TripExpense => {
          const amountPaise = Number(row.amount_paise)
          if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw new Error('Invalid expense amount.')
          return {
            id: row.id,
            description: row.description,
            amountPaise,
            paidBy: row.paid_by,
            createdBy: row.created_by,
            createdAt: row.created_at,
            splitType: row.split_type,
            splits: sharesByExpense.get(row.id) ?? [],
          }
        })
        const nextBalances = calculateBalances(nextMembers.map((member) => member.user_id), nextExpenses)
        settleBalances(nextBalances)
        if (!Number.isSafeInteger(nextExpenses.reduce((total, expense) => total + expense.amountPaise, 0))) {
          throw new Error('Trip spending exceeds the supported total.')
        }
        setTripTitle(trip.title)
        setDestination(trip.destination)
        setMembers(nextMembers)
        setExpenses(nextExpenses)
        setError('')
      } catch (loadFailure) {
        console.error('Trip expense data is invalid:', loadFailure)
        setError('Some expense data could not be read safely. Ask a trip member to review it.')
      } finally {
        setIsLoading(false)
      }
    } catch (loadFailure) {
      if (request !== loadSequence.current) return
      console.error('Could not reach Supabase for trip expenses:', loadFailure)
      setError('This shared expense list could not be loaded. Check your connection and try again.')
      setIsLoading(false)
    }
  }, [tripId, user])

  useEffect(() => {
    if (isCheckingSession) return
    if (!user) {
      setIsLoading(false)
      return
    }
    void refresh()

    const supabase = getSupabaseBrowserClient()
    if (!supabase || !uuidPattern.test(tripId)) return

    const channel = supabase.channel(`trip-expenses:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${tripId}` }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_expenses', filter: `trip_id=eq.${tripId}` }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_expense_splits', filter: `trip_id=eq.${tripId}` }, () => { void refresh() })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Trip expense updates could not be subscribed to:', status)
        }
      })
    return () => {
      loadSequence.current++
      void supabase.removeChannel(channel)
    }
  }, [isCheckingSession, refresh, tripId, user])

  const memberById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members])
  const balances = useMemo(
    () => members.length ? calculateBalances(members.map((member) => member.user_id), expenses) : new Map<string, number>(),
    [expenses, members],
  )
  const settlements = useMemo(() => balances.size ? settleBalances(balances) : [], [balances])
  const totalSpent = expenses.reduce((total, expense) => total + expense.amountPaise, 0)
  const ownMember = user ? memberById.get(user.id) : undefined
  const parsedAmount = parseAmountToPaise(amount)
  const parsedShares = members.map((member) => ({ userId: member.user_id, amountPaise: parseAmountToPaise(customShares[member.user_id] ?? '') }))
  const customTotal = parsedShares.reduce((total, share) => total + (share.amountPaise ?? 0), 0)
  const customSplitIsValid = parsedShares.every((share) => share.amountPaise !== null && share.amountPaise >= 0) &&
    parsedShares.every((share) => share.amountPaise === null || Number.isSafeInteger(share.amountPaise)) &&
    customTotal === parsedAmount

  useEffect(() => {
    setUpiInput(ownMember?.upi_id ?? '')
  }, [ownMember?.upi_id])

  useEffect(() => {
    setCustomShares((current) => Object.fromEntries(members.map((member) => [member.user_id, current[member.user_id] ?? ''])))
    if (user && members.some((member) => member.user_id === user.id)) setPaidBy((current) => current || user.id)
  }, [members, user])

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setMessage('Copied to clipboard.')
      setError('')
      return true
    } catch (copyError) {
      console.error('Could not copy trip details:', copyError)
      setError('Could not access the clipboard. Select and copy the text instead.')
      setMessage('')
      return false
    }
  }

  async function saveUpiId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) return
    const value = upiInput.trim()
    if (value && !upiPattern.test(value)) {
      setError('Enter a valid UPI ID, such as name@bank.')
      setMessage('')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setIsBusy(true)
    setError('')
    setMessage('')
    const { data, error: saveError } = await supabase.from('trip_members')
      .update({ upi_id: value || null })
      .eq('trip_id', tripId)
      .eq('user_id', user.id)
      .select('user_id')
      .single()
    if (saveError || !data) {
      console.error('Could not save UPI ID:', saveError)
      setError('Your UPI ID could not be saved. Please try again.')
    } else {
      setMembers((current) => current.map((member) => member.user_id === user.id ? { ...member, upi_id: value || null } : member))
      setMessage(value ? 'UPI ID saved for this trip.' : 'UPI ID removed from this trip.')
    }
    setIsBusy(false)
  }

  async function createInvite() {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setIsBusy(true)
    setError('')
    setMessage('')
    const { data, error: inviteError } = await supabase.rpc('create_trip_invite', { p_trip_id: tripId })
    if (inviteError || typeof data !== 'string') {
      console.error('Could not create trip expense invite:', inviteError)
      setError('A collaborator invite could not be created. Please try again.')
      setIsBusy(false)
      return
    }
    const url = `${window.location.origin}/split/invite/${data}`
    setInviteLink(url)
    setIsBusy(false)
    setMessage(await copyText(url)
      ? 'Invite link copied. Only signed-in collaborators can join.'
      : 'Invite created. Copy it from the field below; only signed-in collaborators can join.')
  }

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (parsedAmount === null || parsedAmount <= 0) {
      setError('Enter a valid positive amount with up to two decimal places.')
      return
    }

    const shares = splitType === 'equal'
      ? splitEqually(parsedAmount, members.map((member) => member.user_id))
      : parsedShares.map((share) => ({ userId: share.userId, amountPaise: share.amountPaise ?? -1 }))
    if (!paidBy || (splitType === 'custom' && !customSplitIsValid)) {
      setError(splitType === 'custom' ? 'Custom shares must be valid amounts that add up exactly to the expense.' : 'Choose who paid for this expense.')
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setIsBusy(true)
    const { data, error: addError } = await supabase.rpc('create_trip_expense', {
      p_trip_id: tripId,
      p_description: description.trim(),
      p_amount_paise: parsedAmount,
      p_paid_by: paidBy,
      p_split_type: splitType,
      p_splits: shares.map((share) => ({ user_id: share.userId, amount_paise: share.amountPaise })),
    })
    if (addError || typeof data !== 'string') {
      console.error('Could not add trip expense:', addError)
      setError('The expense could not be added. Check the split and try again.')
    } else {
      setDescription('')
      setAmount('')
      setCustomShares(Object.fromEntries(members.map((member) => [member.user_id, ''])))
      setMessage('Expense added for the group.')
      await refresh()
    }
    setIsBusy(false)
  }

  async function deleteExpense(expenseId: string) {
    if (!user || !window.confirm('Remove this expense from the trip?')) return
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    setError('')
    const { data, error: deleteError } = await supabase.from('trip_expenses').delete().eq('id', expenseId).select('id').single()
    if (deleteError || !data) {
      console.error('Could not remove trip expense:', deleteError)
      setError('This expense could not be removed. You can only remove expenses you added.')
      return
    }
    setMessage('Expense removed.')
    await refresh()
  }

  const title = tripTitle || 'Trip expenses'

  return (
    <main className="split-page">
      <div className="split-shell">
        <header className="split-nav">
          <a className="wordmark" href="/"><img className="brand-mark" src="/icon.svg" alt="" aria-hidden="true" />ROVE</a>
          <a className="split-back-link" href="/#saved-trips"><ArrowLeft size={15} /> My trips</a>
        </header>

        {isCheckingSession || isLoading ? (
          <div className="split-state" role="status"><LoaderCircle className="spin" size={20} /> Loading shared expenses…</div>
        ) : !user ? (
          <section className="split-panel split-state">
            <Users size={24} />
            <h1>Sign in to see this trip&apos;s expenses</h1>
            <p>Trip expenses are private to the signed-in members of this group.</p>
            <a className="split-primary-link" href="/">Go to ROVE to sign in</a>
          </section>
        ) : error && !tripTitle ? (
          <section className="split-panel split-state" role="alert">
            <h1>Trip expenses aren&apos;t available</h1>
            <p>{error}</p>
            <a className="split-primary-link" href="/#saved-trips">Back to your trips</a>
          </section>
        ) : (
          <>
            <section className="split-heading">
              <p className="section-note"><span /> THE SHARED TAB</p>
              <h1>{title}</h1>
              <p>{destination} · Add what you paid; ROVE keeps every rupee accounted for.</p>
              <div className="split-summary">
                <span><Wallet size={16} /> {formatRupees(totalSpent)} spent</span>
                <span><Users size={16} /> {members.length} {members.length === 1 ? 'member' : 'members'}</span>
              </div>
            </section>

            {error && <p className="split-alert" role="alert">{error}</p>}
            {message && <p className="split-success" role="status"><Check size={15} />{message}</p>}

            <section className="split-panel">
              <div className="split-section-heading">
                <div><p className="section-note"><span /> YOUR PAYMENT DETAILS</p><h2>UPI ID</h2></div>
                {ownMember?.upi_id && <span className="split-private-note">Visible to trip members</span>}
              </div>
              <form className="upi-form" onSubmit={(event) => void saveUpiId(event)}>
                <label htmlFor="trip-upi-id">Your UPI ID</label>
                <div>
                  <input id="trip-upi-id" value={upiInput} onChange={(event) => setUpiInput(event.target.value)} placeholder="name@bank" maxLength={100} autoComplete="off" />
                  <button className="split-button" type="submit" disabled={isBusy}>{isBusy ? 'Saving…' : ownMember?.upi_id ? 'Update UPI ID' : 'Save UPI ID'}</button>
                </div>
                <small>Only your trip members can see it. ROVE never initiates a payment.</small>
              </form>
            </section>

            <section className="split-panel">
              <div className="split-section-heading">
                <div><p className="section-note"><span /> THE GROUP</p><h2>Who&apos;s in?</h2></div>
                <button className="split-button split-outline" type="button" onClick={() => void createInvite()} disabled={isBusy}>
                  {isBusy ? <LoaderCircle className="spin" size={14} /> : inviteLink ? <RotateCw size={14} /> : <Copy size={14} />}
                  {inviteLink ? 'Replace invite link' : 'Invite a member'}
                </button>
              </div>
              <p className="split-hint">Only signed-in collaborators can join. Replacing the link invalidates the previous one.</p>
              {inviteLink && (
                <div className="split-invite-link">
                  <label htmlFor="trip-invite-link">Current member invite</label>
                  <div><input id="trip-invite-link" value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} /><button className="split-copy-link" type="button" onClick={() => void copyText(inviteLink)}><Copy size={14} /> Copy</button></div>
                </div>
              )}
              <ul className="member-list">
                {members.map((member) => (
                  <li key={member.user_id}>
                    <span className="member-avatar" aria-hidden="true">{member.display_name.trim().charAt(0).toUpperCase() || 'T'}</span>
                    <span className="member-details"><strong>{member.user_id === user.id ? `${member.display_name} (you)` : member.display_name}</strong><small>{member.upi_id || 'UPI ID not added'}</small></span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="split-panel">
              <div className="split-section-heading">
                <div><p className="section-note"><span /> KEEP IT EVEN</p><h2>Add an expense</h2></div>
              </div>
              <form className="expense-form" onSubmit={(event) => void addExpense(event)}>
                <label htmlFor="expense-description">What was it for?</label>
                <input id="expense-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={160} required placeholder="Dinner, taxi, tickets…" />
                <div className="expense-fields">
                  <label htmlFor="expense-amount">Amount (INR)<input id="expense-amount" type="text" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" maxLength={18} required /></label>
                  <label htmlFor="expense-payer">Paid by<select id="expense-payer" value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required>{members.map((member) => <option value={member.user_id} key={member.user_id}>{member.display_name}{member.user_id === user.id ? ' (you)' : ''}</option>)}</select></label>
                </div>
                <fieldset className="split-options">
                  <legend>Split this expense</legend>
                  <label><input type="radio" name="split-type" checked={splitType === 'equal'} onChange={() => setSplitType('equal')} />Equally</label>
                  <label><input type="radio" name="split-type" checked={splitType === 'custom'} onChange={() => setSplitType('custom')} />Custom amounts</label>
                </fieldset>
                {splitType === 'custom' && (
                  <div className="custom-share-list">
                    {members.map((member) => (
                      <label key={member.user_id} htmlFor={`share-${member.user_id}`}>
                        <span>{member.display_name}</span>
                        <span className="custom-share-input"><span>₹</span><input id={`share-${member.user_id}`} type="text" inputMode="decimal" value={customShares[member.user_id] ?? ''} onChange={(event) => setCustomShares((current) => ({ ...current, [member.user_id]: event.target.value }))} placeholder="0.00" maxLength={18} /></span>
                      </label>
                    ))}
                    <p className={customSplitIsValid ? 'share-total valid' : 'share-total'}>Shares: {formatRupees(customTotal)}{parsedAmount !== null ? ` / ${formatRupees(parsedAmount)}` : ''}</p>
                  </div>
                )}
                <button className="split-button split-submit" type="submit" disabled={isBusy || !members.length}>
                  {isBusy ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}
                  Add expense
                </button>
              </form>
            </section>

            <section className="split-panel">
              <div className="split-section-heading">
                <div><p className="section-note"><span /> CLEAR THE TAB</p><h2>Settle up</h2></div>
                <span className="split-private-note">Minimum payments</span>
              </div>
              {settlements.length ? (
                <ul className="settlement-list">
                  {settlements.map((settlement, index) => {
                    const payer = memberById.get(settlement.fromUserId)
                    const recipient = memberById.get(settlement.toUserId)
                    return (
                      <li key={`${settlement.fromUserId}-${settlement.toUserId}-${index}`}>
                        <div><strong>{payer?.display_name} pays {recipient?.display_name}</strong><span>{formatRupees(settlement.amountPaise)}</span></div>
                        {recipient?.upi_id ? (
                          <button className="settlement-upi" type="button" onClick={async () => { if (await copyText(recipient.upi_id!)) setCopiedUpi(settlement.toUserId) }}>
                            <span>UPI · {recipient.upi_id}</span>{copiedUpi === settlement.toUserId ? <Check size={14} /> : <Copy size={14} />}
                          </button>
                        ) : <p className="split-hint">Ask {recipient?.display_name} to add their UPI ID for payment details.</p>}
                      </li>
                    )
                  })}
                </ul>
              ) : <p className="split-empty"><Check size={16} /> Everyone is settled up.</p>}
            </section>

            <section className="split-panel expense-history">
              <div className="split-section-heading">
                <div><p className="section-note"><span /> EVERY RUPEE, ACCOUNTED FOR</p><h2>Expenses</h2></div>
                <button className="split-copy-link" type="button" onClick={() => void refresh()}><RotateCw size={14} /> Refresh</button>
              </div>
              {expenses.length ? (
                <ul className="expense-list">
                  {expenses.map((expense) => (
                    <li key={expense.id}>
                      <div className="expense-heading"><span className="expense-icon"><ReceiptIndianRupee size={17} /></span><span className="expense-description"><strong>{expense.description}</strong><small>{memberById.get(expense.paidBy)?.display_name} paid · {expense.splitType === 'equal' ? 'split equally' : 'custom split'}</small></span><strong className="expense-amount">{formatRupees(expense.amountPaise)}</strong>{expense.createdBy === user.id && <button className="expense-delete" type="button" aria-label={`Remove ${expense.description}`} onClick={() => void deleteExpense(expense.id)}><Trash2 size={15} /></button>}</div>
                      <ul className="expense-shares">{expense.splits.map((share) => <li key={share.userId}><span>{memberById.get(share.userId)?.display_name ?? 'Trip member'}</span><span>{formatRupees(share.amountPaise)}</span></li>)}</ul>
                    </li>
                  ))}
                </ul>
              ) : <p className="split-empty">Nothing added yet. The first expense is a good place to start.</p>}
            </section>

            <p className="split-footnote">ROVE tracks balances; payments happen directly between trip members in their own UPI apps.</p>
          </>
        )}
      </div>
    </main>
  )
}
