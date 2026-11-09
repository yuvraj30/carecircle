import '../auth-refresh.css'
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Button, Card, Field, SelectField } from '../components/ui'
import { HeartIcon } from '../components/icons'
import { useApp } from '../context'
import { returnPath } from '../auth/Gate'

const DRAFT_KEY = 'carecircle-onboarding-draft'

interface OnboardingDraft {
  step: number
  circleName: string
  patientName: string
  patientDob: string
  relationship: string
  condition: string
  medicineName: string
  medicineDose: string
  medicineFrequency: string
  medicineTime: string
}

const EMPTY_DRAFT: OnboardingDraft = {
  step: 0,
  circleName: '',
  patientName: '',
  patientDob: '',
  relationship: 'Parent',
  condition: '',
  medicineName: '',
  medicineDose: '',
  medicineFrequency: 'Once daily',
  medicineTime: '08:00',
}

function restoreDraft() {
  try {
    const saved = localStorage.getItem(DRAFT_KEY)
    return saved ? { ...EMPTY_DRAFT, ...JSON.parse(saved) } as OnboardingDraft : EMPTY_DRAFT
  } catch {
    return EMPTY_DRAFT
  }
}

export function Onboarding() {
  const { state, actions } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [draft, setDraft] = useState<OnboardingDraft>(restoreDraft)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState('')
  const steps = ['Circle', 'Patient', 'First medicine']
  const set = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) => setDraft(current => ({ ...current, [key]: value }))

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      // Onboarding remains usable when storage is unavailable.
    }
  }, [draft])
  useEffect(() => {
    if (completed && state.currentUser) {
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* storage unavailable */ }
      navigate(returnPath(location.search, '/app'))
    }
  }, [completed, state.currentUser, navigate, location.search])
  useEffect(() => {
    if (!state.isLoading && !state.currentUser) navigate('/login')
  }, [state.isLoading, state.currentUser, navigate])

  const next = () => {
    if (draft.step === 0 && !draft.circleName.trim()) return setError('Circle name is required')
    if (draft.step === 1 && !draft.patientName.trim()) return setError('Patient name is required')
    if (draft.step === 1 && !draft.patientDob) return setError('Date of birth is required')
    setError('')
    set('step', Math.min(2, draft.step + 1))
  }
  const finish = async (skipMedicine = false) => {
    setError('')
    const success = await actions.completeOnboarding({
      circleName: draft.circleName,
      patientName: draft.patientName,
      patientDob: draft.patientDob,
      relationship: draft.relationship,
      condition: draft.condition,
      firstMedicine: skipMedicine || !draft.medicineName.trim() ? undefined : {
        name: draft.medicineName,
        dose: draft.medicineDose,
        frequency: draft.medicineFrequency,
        scheduleTime: draft.medicineTime,
        condition: draft.condition,
      },
    }).catch(reason => {
      setError(reason instanceof Error ? reason.message : 'Unable to create the circle')
      return false
    })
    if (success) setCompleted(true)
  }

  return <div className="cc-onboard min-h-screen p-6 lg:p-12"><div className="cc-onboard-container max-w-4xl mx-auto">
    <div className="cc-onboard-nav flex items-center justify-between"><div className="flex items-center gap-2"><HeartIcon className="w-6 h-6 text-[#285D48]" /><b className="text-slate-800">CareCircle setup</b></div><Button variant="ghost" onClick={() => navigate('/login')}>Cancel setup</Button></div>
    <div className="cc-onboard-progress flex gap-2 mt-8" aria-label={`Setup step ${draft.step + 1} of ${steps.length}`}>{steps.map((label, index) => <div key={label} className="flex-1"><div className={`h-1.5 rounded-full ${index <= draft.step ? 'bg-[#2B6B50]' : 'bg-slate-200'}`} /><p className="text-xs text-slate-500 mt-2">{label}</p></div>)}</div>
    <Card className="cc-onboard-card mt-8 p-8 max-w-2xl mx-auto"><span className="cc-auth-form-kicker">STEP {draft.step + 1} OF {steps.length}</span>
      {draft.step === 0 && <><h1 className="text-2xl font-semibold text-slate-800">Name your care circle</h1><p className="text-sm text-slate-500 mt-2">You will be the coordinator and the first patient’s primary caregiver.</p><div className="mt-6"><Field label="Circle name" value={draft.circleName} onChange={event => set('circleName', event.target.value)} error={error} placeholder="e.g. Iyer Family Circle" /></div></>}
      {draft.step === 1 && <><h1 className="text-2xl font-semibold text-slate-800">Add the first patient</h1><div className="grid sm:grid-cols-2 gap-4 mt-6"><Field label="Full name" value={draft.patientName} onChange={event => set('patientName', event.target.value)} error={error && !draft.patientName ? error : undefined} /><Field label="Date of birth" type="date" value={draft.patientDob} onChange={event => set('patientDob', event.target.value)} error={error && !draft.patientDob ? error : undefined} /><SelectField label="Relationship" value={draft.relationship} onChange={event => set('relationship', event.target.value)}><option>Parent</option><option>Partner</option><option>Grandparent</option><option>Other</option></SelectField><Field label="Primary condition" value={draft.condition} onChange={event => set('condition', event.target.value)} /></div><p className="text-xs text-slate-500 mt-5">Parent consent is asked later from the Patient profile. Nothing is sent during setup.</p></>}
      {draft.step === 2 && <><h1 className="text-2xl font-semibold text-slate-800">Add the first medicine</h1><p className="text-sm text-slate-500 mt-2">Record the family’s current instructions. CareCircle does not decide or change doses.</p><div className="grid sm:grid-cols-2 gap-4 mt-6"><Field label="Medicine name" value={draft.medicineName} onChange={event => set('medicineName', event.target.value)} /><Field label="Dose" value={draft.medicineDose} onChange={event => set('medicineDose', event.target.value)} /><Field label="Frequency" value={draft.medicineFrequency} onChange={event => set('medicineFrequency', event.target.value)} /><Field label="Schedule time" type="time" value={draft.medicineTime} onChange={event => set('medicineTime', event.target.value)} /></div>{error && <p className="text-sm text-rose-600 mt-4">{error}</p>}</>}
      <div className="flex justify-between gap-3 mt-8"><Button variant="secondary" disabled={draft.step === 0 || state.isLoading} onClick={() => set('step', Math.max(0, draft.step - 1))}>Back</Button><div className="flex gap-2">{draft.step === 2 && <Button variant="ghost" disabled={state.isLoading || completed} onClick={() => finish(true)}>Skip</Button>}<Button disabled={state.isLoading || completed} onClick={draft.step === 2 ? () => finish(false) : next}>{completed ? 'Opening…' : state.isLoading ? 'Saving…' : draft.step === 2 ? 'Create circle' : 'Continue'}</Button></div></div>
    </Card>
  </div></div>
}
