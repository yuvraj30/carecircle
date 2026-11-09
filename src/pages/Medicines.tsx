import '../medicines-refresh.css'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useApp } from '../context'
import { XMarkIcon, ClockIcon, UserIcon, PlusIcon } from '../components/icons'
import { AlertSourceStatus } from '../components/AlertSourceStatus'
import { MedicinePhoto } from '../components/MedicinePhoto'
import { Button, Dialog, Field, PageHeader, SelectField, TextAreaField } from '../components/ui'
import type { Medication } from '../types'
import { api } from '../lib/supabase'
import { parsePrescription, parsePrescriptionLocally, type ParsedMedicine } from '../lib/assistant'
import { BUILT_IN_MEDICINE_PHOTOS, builtInPhoto } from '../lib/medicinePhotos'
import { useGate } from '../auth/Gate'
import { canMemberSeeParentReplies, parentReplyCategoryLabel, shortTime } from '../lib/careEvents'
import { clockLabel } from '../lib/time'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function photoSavedLabel(med: Medication) {
  const photo = med.photos?.[0]
  if (!photo) return ''
  return `Photo saved ${new Date(photo.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} by ${photo.savedBy}`
}

function photoNeedsReview(med: Medication, events: ReturnType<typeof useApp>['state']['careEvents']) {
  const photo = med.photos?.[0]
  if (!photo) return false
  return events.some(event =>
    event.kind === 'medicine_changed' &&
    event.medicationId === med.id &&
    Date.parse(event.at) > Date.parse(photo.savedAt) &&
    (event.changedFields?.includes('dose') || event.changedFields?.includes('scheduleTime'))
  )
}

function MedicineDetail({ med, onClose, onEdit }: { med: Medication; onClose: () => void; onEdit: () => void }) {
  const { state, actions, now } = useApp()
  const gate = useGate()
  const [refillAmount, setRefillAmount] = useState('')
  const [showRefill, setShowRefill] = useState(false)
  const refillUnits = Number(refillAmount)
  const validRefill = Number.isSafeInteger(refillUnits) && refillUnits > 0
  const today = now().toLocaleDateString('en-CA')
  const todayAlerts = state.alerts.filter(a => a.medicationId === med.id && a.scheduledDate === today)
  const todayAlert = todayAlerts[0]
  const patient = state.patients.find(item => item.id === state.activePatientId)
  const eventHistory = state.timeline.filter(event => event.type === 'medication' && event.relatedId === med.id).map(event => ({
    id: event.id,
    timestamp: event.timestamp,
    actor: event.actor,
    status: event.status,
    title: event.title,
    label: undefined as string | undefined,
  }))
  const alertHistory = state.alerts.filter(alert => alert.medicationId === med.id && (alert.status === 'Confirmed' || alert.status === 'Missed' || alert.status === 'Not recorded')).map(alert => ({
    id: alert.id,
    timestamp: alert.confirmedAt ?? `${alert.scheduledDate}T${alert.scheduledTime}:00`,
    actor: state.members.find(member => member.userId === alert.confirmedBy)?.name ?? 'Care circle',
    status: alert.status,
    title: `${alert.medicationName} ${alert.status.toLowerCase()}`,
    label: undefined as string | undefined,
  }))
  const replyHistory = canMemberSeeParentReplies(patient, state.currentUser?.id)
    ? state.careEvents.filter(event => {
        if (event.kind !== 'parent_replied' || !event.alertId) return false
        return state.alerts.find(alert => alert.id === event.alertId)?.medicationId === med.id
      }).map(event => ({
        id: event.id,
        timestamp: event.at,
        actor: patient?.parentChannel.preferredName ?? 'Parent',
        status: undefined,
        title: `${patient?.parentChannel.preferredName ?? 'Parent'} wrote: "${event.rawText ?? event.text}" (${shortTime(event.at)})`,
        label: event.replyCategory === 'taken' ? undefined : parentReplyCategoryLabel(event),
      }))
    : []
  const history = [...eventHistory, ...alertHistory, ...replyHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="med-detail-title"
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md z-10 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div
          className="px-5 pt-5 pb-4 flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${med.accentColor}40 0%, ${med.accentColor}20 100%)`, borderBottom: '1px solid #F1F5F9' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div
                className="w-10 h-10 rounded-xl mb-3 flex items-center justify-center"
                style={{ backgroundColor: med.accentColor }}
              >
                <svg className="w-5 h-5" fill="none" stroke="#2C3A47" viewBox="0 0 24 24" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                </svg>
              </div>
              <h2 id="med-detail-title" className="text-lg font-semibold text-slate-800">{med.name}</h2>
              <p className="text-slate-600 text-sm font-medium">{med.dose}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-white/60 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Today's status */}
          {todayAlert && (
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Today:</span>
                <AlertSourceStatus alert={todayAlert} />
              </div>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {med.photos?.[0] && <div className="rounded-2xl border border-slate-100 overflow-hidden">
            <MedicinePhoto photo={med.photos[0]} alt={`${med.name} saved medicine photo`} className="w-full h-48" />
            <div className="p-3"><p className="text-xs font-medium text-slate-600">{photoSavedLabel(med)}</p>{med.appearance && <p className="text-xs text-slate-500 mt-1">{med.appearance}</p>}{photoNeedsReview(med, state.careEvents) && <p className="text-xs text-amber-700 mt-2">Dose changed after this photo was saved. Check it still matches.</p>}</div>
          </div>}
          {[
            { label: 'Dose', value: med.dose },
            { label: 'Frequency', value: med.frequency },
            { label: 'For condition', value: med.condition },
            { label: 'Prescribing doctor', value: med.prescribingDoctor },
            { label: 'Started', value: fmtDate(med.startDate) },
            { label: 'Status', value: med.status ?? 'Active' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start justify-between gap-4 py-2.5" style={{ borderBottom: '1px solid #F8FAFC' }}>
              <span className="text-sm text-slate-500 flex-shrink-0 w-36">{label}</span>
              <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
            </div>
          ))}

          <div className="cc-stock-guide"><strong>Supply on record: {med.stock}</strong><p>Refill threshold: {med.refillThreshold}. This is the last recorded count, not a live inventory. Check the actual supply before arranging a refill.</p><div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => gate.requireAccount(onEdit, 'edit-medicine')}>Review stock</Button><Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => setShowRefill(value => !value)}>{showRefill ? 'Cancel refill' : 'Record refill'}</Button></div>{showRefill && <div className="mt-4 space-y-3"><Field label="Units added" type="number" min="1" step="1" inputMode="numeric" value={refillAmount} onChange={event => setRefillAmount(event.target.value)} hint="Recording a refill completes this medicine’s open refill tasks." /><Button disabled={!validRefill || state.activeCircleRole === 'view-only'} onClick={() => gate.requireAccount(() => { actions.replenishMedication(med.id, refillUnits); setRefillAmount(''); setShowRefill(false) }, 'edit-medicine')}>Add to recorded supply</Button></div>}</div>
          {/* Notes */}
          <div className="pt-2">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Notes &amp; Instructions</p>
            <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl px-3 py-3">{med.notes}</p>
          </div>
          <div className="pt-2">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-2">Recent dose history</p>
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              {history.length ? history.map(item => <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs border-b last:border-0 border-slate-100"><div><span className="text-slate-500">{new Date(item.timestamp).toLocaleString('en-IN')} · {item.actor}</span><p className="text-slate-700 mt-1">{item.title}</p></div>{item.label ? <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{item.label}</span> : item.status && <span className={item.status === 'Missed' ? 'text-rose-600' : item.status === 'Not recorded' ? 'text-slate-500' : 'text-emerald-600'}>{item.status === 'Missed' ? 'Not taken' : item.status}</span>}</div>) : <p className="p-3 text-xs text-slate-400">No confirmed or not-taken doses recorded yet.</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => gate.requireAccount(onEdit, 'edit-medicine')}>Edit medicine</Button>
            <Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => { onClose(); actions.setView('tasks') }}>Review refill tasks</Button>
            {(med.status ?? 'Active') === 'Active' && <Button variant="secondary" className="col-span-2" disabled={state.activeCircleRole === 'view-only'} onClick={() => gate.requireAccount(() => actions.stopMedication(med.id), 'edit-medicine')}>Stop this medicine</Button>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Medicines() {
  const { state, actions, now } = useApp()
  const gate = useGate()
  const [searchParams] = useSearchParams()
  const { medications, medicineDetailId, patients, activePatientId } = state
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Medication | null>(null)
  const selectedMed = medications.find(m => m.id === medicineDetailId)
  const activePatient = patients.find(p => p.id === activePatientId)
  const today = now().toLocaleDateString('en-CA')
  const earlierUnresolved = state.alerts.filter(alert =>
    alert.scheduledDate < today &&
    !['Confirmed', 'Missed'].includes(alert.status)
  )
  useEffect(() => {
    if (searchParams.get('action') === 'add-medicine') setAdding(true)
  }, [searchParams])
  const careTeam = [...new Set(medications.map(m => m.prescribingDoctor).filter(Boolean))].map((name, index) => {
    const related = medications.filter(m => m.prescribingDoctor === name)
    const initials = name.replace('Dr. ', '').split(' ').map(part => part[0]).join('').slice(0, 2)
    return {
      name,
      role: 'Prescriber',
      for: related.map(m => m.condition).join(' · '),
      initials,
      color: index % 2 === 0 ? '#A8C4AB' : '#C8BAE0',
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Medicines" subtitle={`${activePatient?.name}'s current medication regimen`} action={<Button disabled={state.activeCircleRole === 'view-only'} onClick={() => gate.requireAccount(() => setAdding(true), 'add-medicine')}><PlusIcon className="w-4 h-4 inline mr-2" />Add medicine</Button>} />

      <section className="med-overview" aria-label="Medicine overview"><div><span className="med-kicker">THE CARE PLAN</span><h2>A little more peace of mind.</h2><p>Everything in one place, ready when your family needs it.</p></div><div className="med-overview-stats"><div><strong>{medications.filter(med => med.status !== 'Stopped').length}</strong><span>active medicines</span></div><div><strong>{medications.filter(med => med.status !== 'Stopped' && med.stock <= med.refillThreshold).length}</strong><span>need stock review</span></div></div></section>
      <section className="med-list"><div className="med-list-head"><div><span className="med-kicker">THE MEDICINE CABINET</span><h2>Medicines at a glance</h2></div><span>{medications.length} {medications.length === 1 ? 'medicine' : 'medicines'}</span></div>
      {medications.length === 0 ? <div className="med-empty"><strong>No medicines recorded yet.</strong><p>Add a medicine to start the care plan.</p></div> : <div className="med-grid">
        {medications.map(med => {
          const todayAlert = state.alerts.find(a => a.medicationId === med.id && a.scheduledDate === today)
          const photo = med.photos?.[0]
          const needsPhotoReview = photoNeedsReview(med, state.careEvents)
          const low = med.stock <= med.refillThreshold
          return <button key={med.id} onClick={() => actions.openMedicineDetail(med.id)} className="med-card" aria-label={`${med.name} ${med.dose} — ${med.condition}`}>
            <div className="med-card-top">{photo ? <MedicinePhoto photo={photo} alt="" className="med-card-photo" /> : <span className="med-card-icon"><svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" /></svg></span>}<span className={'med-stock' + (low ? ' med-stock-low' : '')}>{med.status === 'Stopped' ? 'Stopped' : low ? 'Stock review' : 'In plan'}</span></div>
            <div className="med-card-title"><span>MEDICINE</span><h3>{med.name}</h3><p>{med.dose} <span>·</span> {med.frequency}</p></div>
            <div className="med-card-status">{todayAlert ? <AlertSourceStatus alert={todayAlert} /> : <span>{med.condition || 'No condition recorded'}</span>}{needsPhotoReview && <p>Check that the saved photo still matches the dose.</p>}</div>
            <div className="med-card-footer"><div><span>SUPPLY ON RECORD</span><strong>{med.stock} {med.stock === 1 ? 'unit' : 'units'}</strong></div><span className="med-card-link">View details <b aria-hidden="true">↗</b></span></div>
          </button>
        })}
      </div>}</section>
      {earlierUnresolved.length > 0 && <section aria-labelledby="earlier-alerts-heading"><h2 id="earlier-alerts-heading" className="font-semibold text-slate-700 text-sm mb-3">Earlier</h2><div className="bg-white rounded-2xl shadow-sm divide-y divide-slate-100">{earlierUnresolved.map(alert => <button key={alert.id} onClick={() => actions.openAlertDetail(alert.id)} className="w-full flex items-center justify-between gap-4 px-5 py-3 text-left"><span><span className="text-sm font-semibold text-slate-700">{alert.medicationName}</span><span className="text-xs text-slate-500 ml-2">{new Date(`${alert.scheduledDate}T${alert.scheduledTime}:00`).toLocaleString('en-IN')}</span></span><AlertSourceStatus alert={alert} /></button>)}</div></section>}

      {/* Prescribing doctors info */}
      <section aria-labelledby="doctors-heading">
        <h2 id="doctors-heading" className="font-semibold text-slate-700 text-sm mb-3">Care Team</h2>
        <div className="grid lg:grid-cols-2 bg-white rounded-2xl shadow-sm divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          {careTeam.map(doc => (
            <div key={doc.name} className="flex items-center gap-3 px-5 py-4">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                style={{ backgroundColor: doc.color }}
              >
                {doc.initials}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
                <p className="text-xs text-slate-500">{doc.role} · {doc.for}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedMed && (
        <MedicineDetail
          med={selectedMed}
          onClose={() => actions.openMedicineDetail(null)}
          onEdit={() => { setEditing(selectedMed); actions.openMedicineDetail(null) }}
        />
      )}
      {adding && <MedicineForm onClose={() => setAdding(false)} onSave={med => { actions.saveMedication(med); setAdding(false) }} />}
      {editing && <MedicineForm initial={editing} onClose={() => setEditing(null)} onSave={med => { actions.saveMedication(med); setEditing(null) }} />}
    </div>
  )
}

function MedicineForm({ initial, onClose, onSave }: { initial?: Medication; onClose: () => void; onSave: (med: Medication) => void }) {
  const { state, now } = useApp()
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<Medication>(() => {
    if (initial) return initial
    const createdAt = now()
    return { id: `med-${createdAt.getTime()}`, name: '', dose: '', frequency: 'Once daily', prescribingDoctor: '', condition: '', startDate: createdAt.toISOString().slice(0, 10), endDate: '', notes: '', accentColor: '#C5DCEE', scheduleTime: '08:00', stock: 30, refillThreshold: 7, status: 'Active', appearance: '', photos: [] }
  })
  const set = <K extends keyof Medication>(key: K, value: Medication[K]) => setForm(current => ({ ...current, [key]: value }))
  const chooseFile = (chosen?: File) => {
    if (!chosen) return
    if (chosen.size > 10 * 1024 * 1024) { setError('Photo exceeds the private 10 MB limit.'); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) { setError('Choose a JPEG, PNG, or WebP photo.'); return }
    setError('')
    setFile(chosen)
  }
  const chooseSample = (sampleId: string) => {
    const sample = BUILT_IN_MEDICINE_PHOTOS.find(item => item.id === sampleId)
    const photo = builtInPhoto(sampleId, state.accountProfile.name, now().toISOString())
    if (!sample || !photo) return
    set('photos', [photo, ...(form.photos ?? [])])
    if (!form.appearance) set('appearance', sample.appearance)
  }
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      let photos = form.photos ?? []
      if (file && !state.isSample) {
        const signed = await api<{ photoId: string; path: string; signedUrl: string }>(`/circles/${state.activeCircleId}/medicine-photos/upload-url`, {
          method: 'POST',
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        })
        const response = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
        if (!response.ok) throw new Error('Private medicine photo upload failed')
        photos = [{ id: signed.photoId, storagePath: signed.path, savedBy: state.accountProfile.name, savedAt: now().toISOString() }, ...photos]
      }
      onSave({ ...form, photos })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Photo upload failed')
      setSaving(false)
    }
  }
  const [paste, setPaste] = useState('')
  const [parsed, setParsed] = useState<ParsedMedicine[]>([])
  const [reading, setReading] = useState(false)
  const readPaste = async () => {
    setReading(true)
    setParsed(state.isSample ? parsePrescriptionLocally(paste) : await parsePrescription(state.activeCircleId, paste))
    setReading(false)
  }
  const fillFrom = (row: ParsedMedicine) => {
    set('name', row.name)
    set('dose', row.dose)
    set('frequency', row.frequency)
    set('scheduleTime', '')
    if (row.notes) set('notes', row.notes)
  }
  return <Dialog title={initial ? 'Edit medicine' : 'Add medicine'} onClose={onClose} wide>{!initial && <div className="mb-4 rounded-xl bg-slate-50 p-3"><TextAreaField label="Paste a prescription or medicine list" value={paste} onChange={event => setPaste(event.target.value)} /><p className="text-xs text-slate-500 mt-2">Reading suggests values and may infer times. Check every medicine, dose and frequency against the original instructions. Enter the schedule time yourself before saving. In your circle, the text may be sent to an external AI service.</p><Button variant="secondary" className="mt-3" disabled={!paste.trim() || reading} onClick={readPaste}>{reading ? 'Reading…' : 'Read it'}</Button>{parsed.map((row, index) => <div key={index} className="flex items-center justify-between gap-3 mt-3 text-sm"><span>{row.name} {row.dose} · {row.frequency} · Enter time after review</span><Button variant="ghost" onClick={() => fillFrom(row)}>Use this</Button></div>)}</div>}<div className="grid sm:grid-cols-2 gap-4"><Field label="Medicine name" value={form.name} onChange={e => set('name', e.target.value)} /><Field label="Dose" value={form.dose} onChange={e => set('dose', e.target.value)} /><Field label="Frequency" value={form.frequency} onChange={e => set('frequency', e.target.value)} /><Field label="Schedule time" type="time" value={form.scheduleTime} onChange={e => set('scheduleTime', e.target.value)} /><SelectField label="Status" value={form.status ?? 'Active'} onChange={e => set('status', e.target.value as Medication['status'])}><option>Active</option><option>Stopped</option></SelectField><Field label="Start date" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} /><Field label="End date" type="date" value={form.endDate ?? ''} onChange={e => set('endDate', e.target.value)} /><Field label="Prescriber" value={form.prescribingDoctor} onChange={e => set('prescribingDoctor', e.target.value)} /><Field label="Condition" value={form.condition} onChange={e => set('condition', e.target.value)} /><Field label="Current stock" type="number" value={form.stock} onChange={e => set('stock', Number(e.target.value))} /><Field label="Refill threshold" type="number" value={form.refillThreshold} onChange={e => set('refillThreshold', Number(e.target.value))} /><div className="sm:col-span-2"><Field label="Appearance" value={form.appearance ?? ''} placeholder="Small white round tablet, blister strip" onChange={e => set('appearance', e.target.value)} /></div><div className="sm:col-span-2"><Field label="Upload a private medicine photo" type="file" disabled={state.isSample} accept="image/jpeg,image/png,image/webp" onChange={event => chooseFile(event.target.files?.[0])} hint={state.isSample ? 'Photo upload is disabled in Sample.' : undefined} /><p className="text-xs text-slate-400 mt-2">Or use a built-in sample:</p><div className="grid grid-cols-3 gap-2 mt-2">{BUILT_IN_MEDICINE_PHOTOS.map(sample => <Button type="button" variant="secondary" className="h-auto p-2 flex-col" key={sample.id} onClick={() => chooseSample(sample.id)}><img src={sample.dataUrl} alt="" className="w-full h-20 rounded-lg object-cover mb-2" /><span className="text-xs">{sample.label}</span></Button>)}</div>{form.photos?.[0] && <p className="text-xs text-emerald-700 mt-2">{photoSavedLabel(form)}</p>}{error && <p className="text-sm text-rose-700 bg-rose-50 rounded-xl p-3 mt-2">{error}</p>}</div><div className="sm:col-span-2"><TextAreaField label="Instructions" value={form.notes} onChange={e => set('notes', e.target.value)} /></div></div><div className="flex justify-end gap-2 mt-6"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!form.name || !form.dose || !form.scheduleTime || saving} onClick={save}>{saving ? 'Saving securely…' : 'Save medicine & schedule'}</Button></div></Dialog>
}
