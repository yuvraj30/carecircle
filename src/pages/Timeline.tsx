import '../secondary-consistency.css'
import { useState } from 'react'
import { useApp } from '../context'
import { ClockIcon, CheckCircleIcon, PillIcon, ShieldCheckIcon } from '../components/icons'
import { PageHeader } from '../components/ui'
import type { CareEvent, CareEventKind } from '../types'
import { eventTextForMember } from '../lib/careEvents'

type EventFilter = CareEventKind | 'all' | 'tasks'

const FILTERS: { value: EventFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reminder_sent', label: 'Reminders' },
  { value: 'followup_sent', label: 'Follow-ups' },
  { value: 'parent_replied', label: 'Parent replies' },
  { value: 'family_confirmed', label: 'Family confirmations' },
  { value: 'not_taken_recorded', label: 'Not taken' },
  { value: 'record_corrected', label: 'Record corrected' },
  { value: 'escalated', label: 'Escalations' },
  { value: 'claimed', label: 'Claims' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'consent_changed', label: 'Consent' },
]

function eventIcon(kind: CareEventKind) {
  const className = 'w-3.5 h-3.5'
  if (kind === 'reminder_sent') return <PillIcon className={className} />
  if (kind === 'parent_replied' || kind === 'family_confirmed') return <CheckCircleIcon className={className} />
  if (kind === 'consent_changed') return <ShieldCheckIcon className={className} />
  return <ClockIcon className={className} />
}

function eventColors(kind: CareEventKind) {
  if (kind === 'parent_replied') return 'cc-secondary-icon cc-secondary-sage'
  if (kind === 'family_confirmed') return 'cc-secondary-icon cc-secondary-olive'
  if (kind === 'consent_changed') return 'cc-secondary-icon cc-secondary-neutral'
  if (kind === 'not_taken_recorded') return 'cc-secondary-icon cc-secondary-neutral'
  return 'cc-secondary-icon cc-secondary-gold'
}

function groupByDate(events: CareEvent[]): [string, CareEvent[]][] {
  const groups = new Map<string, CareEvent[]>()
  for (const event of events) {
    const date = new Date(event.at).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    if (!groups.has(date)) groups.set(date, [])
    groups.get(date)!.push(event)
  }
  return [...groups.entries()]
}

export function Timeline() {
  const { state } = useApp()
  const [filter, setFilter] = useState<EventFilter>('all')
  const [search, setSearch] = useState('')
  const activePatient = state.patients.find(patient => patient.id === state.activePatientId)
  const events = state.careEvents
    .filter(event => event.patientId === state.activePatientId)
    .filter(event => (filter === 'all' || event.kind === filter || (filter === 'tasks' && event.kind.startsWith('task_'))) && eventTextForMember(event, activePatient, state.currentUser?.id).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  const groups = groupByDate(events)

  return <div className="cc-timeline-page">
    <PageHeader title="Care timeline" subtitle={`A shared record of care for ${activePatient?.parentChannel.preferredName ?? 'your circle'}.`} />
    <section className="cc-timeline-tools" aria-label="Find a care update">
      <div className="cc-timeline-tools-head"><div><span className="cc-timeline-kicker">THE SHARED STORY</span><h2>Care, in context.</h2><p>Every update, in one place.</p></div><div className="cc-timeline-count"><strong>{events.length}</strong><span>{events.length === 1 ? 'update' : 'updates'}</span></div></div>
      <label className="cc-timeline-search"><span>Search updates</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name or detail" /></label>
      <div className="cc-timeline-filters" role="group" aria-label="Filter timeline">{FILTERS.map(item => <button key={item.value} type="button" onClick={() => setFilter(item.value)} aria-pressed={filter === item.value}>{item.label}</button>)}</div>
    </section>
    {!groups.length ? <div className="cc-timeline-empty"><ClockIcon className="w-7 h-7" /><strong>No updates found</strong><p>Try a different search or filter.</p><button type="button" onClick={() => { setFilter('all'); setSearch('') }}>Clear filters</button></div> : <div className="cc-timeline-feed">
      {groups.map(([date, dateEvents]) => <section key={date} className="cc-timeline-day"><div className="cc-timeline-date"><span>CARE JOURNAL</span><h2>{date}</h2><small>{dateEvents.length} {dateEvents.length === 1 ? 'update' : 'updates'}</small></div><div className="cc-timeline-list">{dateEvents.map(event => {
        const member = state.members.find(item => (item.userId ?? item.id) === event.actorId)
        const target = state.members.find(item => (item.userId ?? item.id) === event.targetId)
        const actor = target ? `For ${target.name}` : event.actorType === 'parent' ? activePatient?.parentChannel.preferredName : event.actorType === 'system' ? 'CareCircle schedule' : member?.name ?? 'Family member'
        return <article key={event.id} className="cc-timeline-event"><div className={`cc-timeline-icon ${eventColors(event.kind)}`}>{eventIcon(event.kind)}</div><div className="cc-timeline-event-body"><div className="cc-timeline-event-top"><span>{actor}</span><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</time></div><p>{eventTextForMember(event, activePatient, state.currentUser?.id)}</p></div></article>
      })}</div></section>)}
    </div>}
  </div>
}
