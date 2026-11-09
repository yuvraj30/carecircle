import '../secondary-consistency.css'
import '../records-refresh.css'
import { useEffect, useState } from 'react'
import { useApp } from '../context'
import type { Document } from '../types'
import { DocumentIcon, FolderIcon, MagnifyingGlassIcon, PlusIcon } from '../components/icons'
import { Button, Card, Dialog, Field, PageHeader, SelectField, TextAreaField } from '../components/ui'
import { api } from '../lib/supabase'

const categoryStyle: Record<Document['category'], string> = {
  Prescription: 'cc-secondary-icon cc-secondary-sage',
  'Lab Report': 'cc-secondary-icon cc-secondary-olive',
  Insurance: 'cc-secondary-icon cc-secondary-gold',
  Other: 'cc-secondary-icon cc-secondary-neutral',
}

export function Documents() {
  const { state, actions } = useApp()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<Document['category'] | 'All'>('All')
  const [upload, setUpload] = useState(false)
  const selected = state.documents.find(document => document.id === state.documentDetailId)
  const filtered = state.documents.filter(document =>
    (category === 'All' || document.category === category) &&
    `${document.name} ${document.description}`.toLowerCase().includes(search.toLowerCase())
  )
  return <div className="space-y-6">
    <PageHeader title="Care records" subtitle="The important documents your circle needs, together." action={<Button disabled={state.activeCircleRole === 'view-only'} onClick={() => setUpload(true)}><PlusIcon className="w-4 h-4 inline mr-2" />Upload document</Button>} />
    <section className="cc-records-tools"><div className="cc-records-intro"><div><span>YOUR CARE LIBRARY</span><h2>Everything in its place.</h2><p>Find the records shared with you.</p></div><strong>{state.documents.length}<small> records</small></strong></div><div className="cc-records-filter">
      <label className="relative"><MagnifyingGlassIcon className="absolute left-3 top-3 w-4 h-4 text-slate-400" /><input aria-label="Search documents" value={search} onChange={event => setSearch(event.target.value)} className="w-full min-h-11 pl-10 pr-3 rounded-xl border border-slate-200" placeholder="Search records…" /></label>
      <div className="flex gap-2">{(['All', 'Prescription', 'Lab Report', 'Insurance', 'Other'] as const).map(value => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
    </div></section>
    {filtered.length ? <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-3">{filtered.map(document => <button key={document.id} onClick={() => actions.openDocumentDetail(document.id)} className="cc-record-card"><div className={`w-11 h-11 rounded-xl flex items-center justify-center ${categoryStyle[document.category]}`}><DocumentIcon className="w-5 h-5" /></div><span className="cc-record-kicker">{document.category}</span><h2 className="font-semibold text-sm mt-4">{document.name}</h2><p className="text-xs text-slate-400 mt-1">{document.fileType} · {document.access ?? 'All members'}</p>{document.linkedId && <p className="text-xs cc-secondary-link mt-2">Linked {document.linkedType}</p>}</button>)}</div> : <Card className="p-12 text-center"><FolderIcon className="w-8 h-8 mx-auto text-slate-300" /><p className="mt-3 text-sm">No records match this filter.</p></Card>}
    {selected && <DocumentDetail document={selected} onClose={() => actions.openDocumentDetail(null)} />}
    {upload && <UploadDocument onClose={() => setUpload(false)} />}
  </div>
}

function DocumentDetail({ document, onClose }: { document: Document; onClose: () => void }) {
  const { state, actions } = useApp()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(document)
  const [signedUrl, setSignedUrl] = useState('')
  const [error, setError] = useState('')
  const loadUrl = async () => {
    if (!document.storagePath) return
    setError('')
    try {
      const result = await api<{ signedUrl: string }>(`/circles/${state.activeCircleId}/files/${document.id}/url`)
      setSignedUrl(result.signedUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Private file access failed')
    }
  }
  useEffect(() => { void loadUrl() }, [document.id])
  const openLink = () => {
    onClose()
    if (document.linkedType === 'medicine') { actions.setView('medicines'); actions.openMedicineDetail(document.linkedId ?? null) }
    if (document.linkedType === 'appointment') { actions.setView('appointments'); actions.openAppointmentDetail(document.linkedId ?? null) }
  }
  return <Dialog title={document.name} onClose={onClose} wide><div className="space-y-4">
    <div className="rounded-2xl bg-slate-50 min-h-48 flex items-center justify-center overflow-hidden border border-slate-100">
      {error ? <div className="text-center p-6"><p className="text-sm text-rose-600">{error}</p><Button variant="secondary" className="mt-3" onClick={loadUrl}>Retry secure access</Button></div>
        : !document.storagePath ? <p className="text-sm text-slate-500 p-6">This record has no attached file. Open the linked record to read its visit notes.</p>
        : !signedUrl ? <p className="text-sm text-slate-400">Requesting short-lived private preview…</p>
        : document.fileType.startsWith('image/') ? <img src={signedUrl} className="max-h-80" alt={document.name} />
        : <iframe src={signedUrl} title={document.name} className="w-full h-80" />}
    </div>
    {editing ? <div className="space-y-4">
      <Field label="Record name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
      <SelectField label="Access" value={form.access ?? 'All members'} onChange={event => setForm({ ...form, access: event.target.value as Document['access'] })}><option>All members</option><option>Caregivers and coordinators</option><option>Coordinators only</option></SelectField>
      <SelectField label="Linked record" value={`${form.linkedType ?? ''}:${form.linkedId ?? ''}`} onChange={event => { const [linkedType, linkedId] = event.target.value.split(':'); setForm({ ...form, linkedType: linkedType as Document['linkedType'] || undefined, linkedId: linkedId || undefined }) }}><option value=":">None</option>{state.medications.map(medicine => <option key={medicine.id} value={`medicine:${medicine.id}`}>Medicine · {medicine.name}</option>)}{state.appointments.map(appointment => <option key={appointment.id} value={`appointment:${appointment.id}`}>Appointment · {appointment.type}</option>)}</SelectField>
      <TextAreaField label="Description" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} />
      <div className="flex gap-2"><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button onClick={() => { actions.updateDocument(form); setEditing(false) }}>Save metadata</Button></div>
    </div> : <>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-400">Category</dt><dd>{document.category}</dd></div><div><dt className="text-slate-400">Access</dt><dd>{document.access ?? 'All members'}</dd></div><div><dt className="text-slate-400">Uploaded by</dt><dd>{document.uploadedBy}</dd></div><div><dt className="text-slate-400">File</dt><dd>{document.fileType} · {document.size}</dd></div></dl>
      <p className="text-sm text-slate-600">{document.description}</p>
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!signedUrl} onClick={() => window.open(signedUrl, '_blank', 'noopener,noreferrer')}>Open private file</Button><Button variant="secondary" disabled={state.activeCircleRole === 'view-only'} onClick={() => setEditing(true)}>Rename & access</Button>{document.linkedId && <Button onClick={openLink}>Open linked record</Button>}</div>
    </>}
  </div></Dialog>
}

function UploadDocument({ onClose }: { onClose: () => void }) {
  const { state, actions, now } = useApp()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<Document['category']>('Other')
  const [description, setDescription] = useState('')
  const [access, setAccess] = useState<Document['access']>('All members')
  const [link, setLink] = useState(':')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const choose = (chosen?: File) => {
    if (!chosen) return
    if (chosen.size > 10 * 1024 * 1024) { setError('File exceeds the private 10 MB limit.'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(chosen.type)) { setError('Choose a PDF, JPEG, PNG, or WebP file.'); return }
    setError('')
    setFile(chosen)
    setName(chosen.name.replace(/\.[^.]+$/, ''))
  }
  const upload = async () => {
    if (!file) return
    setProgress(15)
    setError('')
    try {
      const signed = await api<{ documentId: string; path: string; signedUrl: string }>(`/circles/${state.activeCircleId}/files/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
      })
      setProgress(40)
      const response = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('Private upload failed')
      setProgress(90)
      const [linkedType, linkedId] = link.split(':')
      actions.addDocument({
        id: signed.documentId,
        patientId: state.activePatientId,
        name,
        category,
        uploadedAt: now().toISOString(),
        uploadedBy: state.accountProfile.name,
        fileType: file.type,
        size: `${Math.ceil(file.size / 1024)} KB`,
        description,
        access,
        linkedType: linkedType as Document['linkedType'] || undefined,
        linkedId: linkedId || undefined,
        storagePath: signed.path,
      })
      setProgress(100)
      onClose()
    } catch (reason) {
      setProgress(0)
      setError(reason instanceof Error ? reason.message : 'Upload failed')
    }
  }
  return <Dialog title="Upload private document" onClose={onClose} wide><div className="space-y-4">
    <label className="block border-2 border-dashed rounded-2xl p-6 text-center text-sm"><input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event => choose(event.target.files?.[0])} />Choose PDF, JPEG, PNG, or WebP</label>
    {error && <p className="bg-rose-50 text-rose-700 p-3 rounded-xl text-sm">{error}</p>}
    {progress > 0 && <div><div className="h-2 bg-slate-100 rounded-full"><div className="h-2 cc-secondary-progress rounded-full" style={{ width: `${progress}%` }} /></div><p className="text-xs text-slate-400 mt-1">Uploading to private storage…</p></div>}
    <Field label="Name" value={name} onChange={event => setName(event.target.value)} />
    <SelectField label="Category" value={category} onChange={event => setCategory(event.target.value as Document['category'])}><option>Prescription</option><option>Lab Report</option><option>Insurance</option><option>Other</option></SelectField>
    <SelectField label="Access" value={access} onChange={event => setAccess(event.target.value as Document['access'])}><option>All members</option><option>Caregivers and coordinators</option><option>Coordinators only</option></SelectField>
    <SelectField label="Link to record" value={link} onChange={event => setLink(event.target.value)}><option value=":">None</option>{state.medications.map(medicine => <option key={medicine.id} value={`medicine:${medicine.id}`}>{medicine.name}</option>)}{state.appointments.map(appointment => <option key={appointment.id} value={`appointment:${appointment.id}`}>{appointment.type}</option>)}</SelectField>
    <TextAreaField label="Description" value={description} onChange={event => setDescription(event.target.value)} />
    <Button disabled={!file || !name || progress > 0} onClick={upload}>Upload securely</Button>
  </div></Dialog>
}
