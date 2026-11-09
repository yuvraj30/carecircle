import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type {
  ActivityItem, AppState, Appointment, CareEvent, CareTask, CircleData, CircleMember, ConfirmConfig,
  Document, HealthEntry, Medication, MedicationAlert, ParentChannel, Patient, PatientData, RecordComment,
  TimelineEvent, Toast, User, View,
} from './types'
import { api, ApiError, supabase } from './lib/supabase'
import { acknowledgementFor, classifyParentConsentReply, classifyParentReply } from './constants/replyClassifier'
import { replyAlertId } from './lib/personReplies'
import { BUILT_IN_MEDICINE_PHOTOS } from './lib/medicinePhotos'
import { buildWeeklyDigest, mostRecentDigestDelivery, nextSundayAtSix } from './lib/weeklyDigest'
import { parentConsentMessages } from './constants/parentConsent'
import { interpretReply } from './lib/assistant'
import { buildSampleCircle } from './lib/sampleData'
import { useAuthStatus } from './auth/AuthStatus'

interface OnboardingInput {
  circleName: string
  patientName: string
  patientDob: string
  relationship: string
  condition: string
  firstMedicine?: {
    name: string
    dose: string
    frequency: string
    scheduleTime: string
    condition: string
  }
}

interface AppActions {
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (name: string, email: string, password: string) => Promise<{ success: boolean; needsVerification: boolean }>
  signOut: () => Promise<void>
  completeOnboarding: (input: OnboardingInput) => Promise<boolean>
  acceptInvitation: (token: string, accepted: boolean) => Promise<void>
  registerDemoUser: () => string
  setView: (view: View) => void
  switchCircle: (circleId: string) => Promise<void>
  switchPatient: (patientId: string) => void
  openAlertDetail: (id: string) => void
  closeAlertDetail: () => void
  openMedicineDetail: (id: string | null) => void
  openAppointmentDetail: (id: string | null) => void
  openDocumentDetail: (id: string | null) => void
  assignAlert: (alertId: string, userId: string) => void
  confirmAlert: (alertId: string) => void
  recordNotTaken: (alertId: string, reason: string) => void
  replyAsParent: (alertId: string | undefined, reply: string) => void
  ingestParentReply: (alertId: string | undefined, reply: string) => void
  correctAlertRecord: (alertId: string) => void
  thankCareEvent: (eventId: string) => void
  sendParentMedicinePhoto: (alertId: string, sampleId: string, dataUrl: string) => void
  judgeParentMedicinePhoto: (eventId: string, judgement: 'same' | 'different') => void
  claimAlert: (alertId: string) => void
  recordCallUnanswered: (alertId: string, nextStep: 'call_later' | 'ask_backup' | 'not_reachable') => void
  addReplyToNextAppointment: (alertId: string) => void
  createRefillTask: (alertId: string) => void
  togglePhonePane: (open?: boolean) => void
  advanceSimulatedTime: (minutes: number) => void
  jumpToNextReminder: () => void
  jumpToSundayDigest: () => void
  resetSimulatedTime: () => void
  dismissFirstReply: (patientId: string) => void
  showConfirm: (config: ConfirmConfig) => void
  closeConfirm: () => void
  addToast: (type: Toast['type'], message: string) => void
  removeToast: (id: string) => void
  resetDemo: () => void
  savePatient: (patient: Patient) => void
  sendParentConsent: (patientId: string) => void
  sendSharingConsent: (patientId: string) => void
  simulateParentConsent: (patientId: string, response: 'agrees' | 'declines' | 'stop') => void
  archivePatient: (patientId: string) => void
  restorePatient: (patientId: string) => void
  saveTask: (task: CareTask) => void
  takeTask: (taskId: string) => void
  respondToTask: (taskId: string, response: 'Accepted' | 'Declined', reason?: string) => void
  completeTask: (taskId: string, note?: string) => void
  addHealthEntry: (entry: HealthEntry) => void
  addCareNote: (text: string) => void
  addTimelineComment: (eventId: string, text: string) => void
  openLinkedRecord: (event: TimelineEvent) => void
  markNotification: (id?: string | string[]) => void
  saveMedication: (medication: Medication) => void
  stopMedication: (id: string) => void
  replenishMedication: (id: string, amount: number) => void
  saveAppointment: (appointment: Appointment) => void
  addDigestToVisitNotes: (digestEventId: string) => void
  addDocument: (document: Document) => void
  updateDocument: (document: Document) => void
  saveMember: (member: CircleMember) => void
  updateInvitation: (id: string, status: 'Invited' | 'Cancelled') => void
  removeMember: (id: string) => void
  transferOwnership: (memberId: string) => void
  savePreferences: (preferences: AppState['preferences']) => void
  renameCircle: (name: string) => void
  saveAccountProfile: (profile: AppState['accountProfile']) => void
  retryCommit: () => Promise<void>
  retryLoad: () => Promise<void>
}

interface AppContextValue { state: AppState; actions: AppActions; now: () => Date }
const AppContext = createContext<AppContextValue | null>(null)

export function useApp() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}

const emptyPatientData = (): PatientData => ({ alerts: [], medications: [], appointments: [], documents: [], timeline: [] })

function storedDismissedFirstReplies() {
  try {
    const value = localStorage.getItem('carecircle-dismissed-first-replies')
    return value ? JSON.parse(value) as string[] : []
  } catch {
    return []
  }
}

function emptyState(memoryOnly = false): AppState {
  return {
    currentUser: null,
    demoUsers: [],
    pendingSignupId: null,
    authTargetCircleId: null,
    activeCircleId: '',
    activeCircleRole: 'view-only',
    circles: {},
    circleName: '',
    members: [],
    activity: [],
    preferences: {
      medicineReminders: true,
      taskUpdates: true,
      quietHours: true,
      quietStart: '21:00',
      quietEnd: '07:00',
      followUpAfter: 30,
      firstCallAfter: 60,
      backupAfter: 120,
      firstCallMemberId: '',
      backupMemberId: '',
      weeklyDigestEnabled: true,
      weeklyDigestDay: 0,
      weeklyDigestTime: '18:00',
      awayUntil: {},
    },
    accountProfile: { name: '', phone: '' },
    activePatientId: '',
    patients: [],
    patientDataStore: {},
    alerts: [],
    medications: [],
    appointments: [],
    documents: [],
    timeline: [],
    tasks: [],
    healthEntries: [],
    notifications: [],
    careEvents: [],
    toasts: [],
    view: 'today',
    alertDetailId: null,
    medicineDetailId: null,
    appointmentDetailId: null,
    documentDetailId: null,
    confirmConfig: null,
    phonePaneOpen: false,
    dismissedFirstReplyPatientIds: memoryOnly ? [] : storedDismissedFirstReplies(),
    isLoading: true,
    commitError: null,
    sessionExpired: false,
    isSample: false,
  }
}

function toUser(authUser: any, name?: string): User {
  const resolvedName = name || authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'CareCircle member'
  return {
    id: authUser.id,
    name: resolvedName,
    role: 'caregiver',
    relation: 'Care-circle member',
    initials: resolvedName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
    color: '#4A7FA5',
    phone: authUser.phone,
  }
}

function recordsForPatient<T extends { patientId?: string }>(records: T[], patientId: string, patientCount: number) {
  return records.filter(record => record.patientId === patientId || (!record.patientId && patientCount === 1))
}

function normalizeMember(member: any): CircleMember {
  const name = member?.name || member?.email?.split('@')[0] || 'Circle member'
  return {
    ...member,
    id: member?.id ?? member?.userId ?? `member-${member?.email ?? crypto.randomUUID()}`,
    name,
    email: member?.email ?? '',
    relationship: member?.relationship ?? 'Care-circle member',
    role: member?.role ?? 'caregiver',
    status: member?.status ?? 'Active',
    initials: member?.initials || name.split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
    color: member?.color ?? '#4A7FA5',
  }
}

function defaultParentChannel(patient: any): ParentChannel {
  return {
    whatsappNumber: '',
    language: 'English',
    preferredName: patient?.preferredName || patient?.name?.split(' ')[0] || 'Parent',
    quietHours: { start: '21:00', end: '07:00' },
    paused: true,
    lastAskedQuestion: undefined,
    reminders: { status: 'Not asked', changedAt: '', via: 'Recorded by family' },
    sharing: { status: 'Not asked', changedAt: '', via: 'Recorded by family', sharedWith: [] },
  }
}

function normalizePatient(patient: any): Patient {
  const defaults = defaultParentChannel(patient)
  return {
    ...patient,
    parentChannel: {
      ...defaults,
      ...(patient?.parentChannel ?? {}),
      quietHours: { ...defaults.quietHours, ...(patient?.parentChannel?.quietHours ?? {}) },
      reminders: { ...defaults.reminders, ...(patient?.parentChannel?.reminders ?? {}) },
      sharing: { ...defaults.sharing, ...(patient?.parentChannel?.sharing ?? {}) },
    },
  }
}

function neutralLegacyCopy(event: CareEvent): CareEvent { return typeof event.text === 'string' && event.text.includes('Please call her.') ? { ...event, text: event.text.replace('Please call her.', 'Please call them.') } : event }

function normalizeTask(task: any): CareTask {
  return {
    ...task,
    assigneeId: task?.assigneeId ?? '',
    response: task?.response ?? (task?.status === 'Completed' || task?.status === 'In progress' ? 'Accepted' : 'Waiting'),
  }
}

function normalizeMedication(medication: any): Medication {
  const sample = medication?.name === 'Metformin'
    ? BUILT_IN_MEDICINE_PHOTOS[0]
    : medication?.name === 'Amlodipine'
      ? BUILT_IN_MEDICINE_PHOTOS[1]
      : medication?.name === 'Aspirin'
        ? BUILT_IN_MEDICINE_PHOTOS[2]
        : undefined
  return {
    ...medication,
    status: medication?.status ?? 'Active',
    appearance: medication?.appearance ?? sample?.appearance ?? '',
    photos: medication?.photos ?? (sample ? [{
      id: `${medication.id}-sample-photo`,
      dataUrl: sample.dataUrl,
      savedBy: 'Anaya',
      savedAt: '2026-10-13T09:15:00',
    }] : []),
  }
}

function circleFromSnapshot(membership: any, snapshot: any): CircleData {
  const patients = Array.isArray(snapshot.patients) ? snapshot.patients.map(normalizePatient) : []
  const patientDataStore: Record<string, PatientData> = {}
  for (const patient of patients) {
    patientDataStore[patient.id] = {
      alerts: recordsForPatient(snapshot.alerts ?? [], patient.id, patients.length),
      medications: recordsForPatient(snapshot.medications ?? [], patient.id, patients.length).map(normalizeMedication),
      appointments: recordsForPatient(snapshot.appointments ?? [], patient.id, patients.length),
      documents: recordsForPatient(snapshot.documents ?? [], patient.id, patients.length),
      timeline: recordsForPatient(snapshot.timeline ?? [], patient.id, patients.length),
    }
  }
  return {
    id: snapshot.meta.id,
    name: snapshot.meta.name,
    role: snapshot.role,
    patients,
    activePatientId: patients.find((patient: Patient) => !patient.archived)?.id ?? patients[0]?.id ?? '',
    patientDataStore,
    tasks: (snapshot.tasks ?? []).map(normalizeTask),
    healthEntries: snapshot.healthEntries ?? [],
    notifications: (snapshot.notifications ?? []).filter((item: any) => item?.eventId && item?.userId),
    members: (snapshot.members ?? []).map(normalizeMember),
    activity: snapshot.activity ?? [],
    careEvents: (snapshot.careEvents ?? []).map(neutralLegacyCopy),
  }
}

function activeData(circle: CircleData) {
  return circle.patientDataStore[circle.activePatientId] ?? emptyPatientData()
}

function applyCircle(state: AppState, circle: CircleData): AppState {
  const data = activeData(circle)
  return {
    ...state,
    activeCircleId: circle.id,
    activeCircleRole: circle.role,
    circleName: circle.name,
    patients: circle.patients,
    activePatientId: circle.activePatientId,
    patientDataStore: circle.patientDataStore,
    alerts: data.alerts,
    medications: data.medications,
    appointments: data.appointments,
    documents: data.documents,
    timeline: data.timeline,
    tasks: circle.tasks,
    healthEntries: circle.healthEntries,
    notifications: circle.notifications,
    members: circle.members,
    activity: circle.activity,
    careEvents: circle.careEvents,
    alertDetailId: null,
    medicineDetailId: null,
    appointmentDetailId: null,
    documentDetailId: null,
  }
}

function withPatientId<T extends object>(records: T[], patientId: string) {
  return records.map(record => ({ ...record, patientId }))
}

function allPatientRecords(state: AppState, key: keyof PatientData, activeRecords: any[]) {
  return Object.entries(state.patientDataStore).flatMap(([patientId, data]) =>
    withPatientId(patientId === state.activePatientId ? activeRecords : (data[key] as any[]), patientId)
  )
}

const systemNow = () => new Date()

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isQuietTime(time: string, start: string, end: string) {
  if (start === end) return false
  return start < end ? time >= start && time < end : time >= start || time < end
}

function friendlyScheduleTime(time: string) {
  const [hours, minutes] = time.split(':')
  return `${Number(hours)}:${minutes}`
}

function displayDose(dose: string) {
  return dose.replace(/(\d)\s*(mg|mcg|g|ml)\b/i, '$1 $2')
}

function dosesPerDay(frequency: string) {
  const value = frequency.toLocaleLowerCase()
  if (value.includes('three') || value.includes('3')) return 3
  if (value.includes('twice') || value.includes('two') || value.includes('2')) return 2
  return 1
}

function appointmentReminderMinutes(reminder?: string) {
  if (reminder === '1 week before') return 7 * 24 * 60
  if (reminder === '2 days before') return 2 * 24 * 60
  return 24 * 60
}

function isParentPaused(channel: ParentChannel, currentTime: Date) {
  if (!channel.paused) return false
  return !channel.pausedUntil || currentTime.getTime() < Date.parse(channel.pausedUntil)
}

function eventId(prefix: string, value: string) {
  return `${prefix}-${value}`
}

function isAwayOn(state: AppState, id: string, at: Date) { const until = state.preferences.awayUntil?.[id]; return Boolean(until) && at.getTime() <= Date.parse(until + 'T23:59:59') }

function escalationContacts(state: AppState, patient: Patient, at: Date = new Date()) {
  const activeIds = state.members
    .filter(member => member.status === 'Active')
    .map(member => member.userId ?? member.id)
  const firstCallId = [
    state.preferences.firstCallMemberId,
    patient.primaryCaregiverId,
    activeIds[0],
  ].find(id => Boolean(id) && activeIds.includes(id!)) ?? ''
  const backupId = [
    state.preferences.backupMemberId,
    ...activeIds,
  ].find(id => Boolean(id) && id !== firstCallId && activeIds.includes(id!)) ?? ''
  const away = (id: string) => Boolean(id) && isAwayOn(state, id, at)
  if (firstCallId && away(firstCallId) && backupId && !away(backupId)) return { firstCallId: backupId, backupId: '' }
  if (backupId && away(backupId)) return { firstCallId, backupId: '' }
  return { firstCallId, backupId }
}

export function AppProvider({ children, now: baseNow = systemNow, sample = false }: { children: ReactNode; now?: () => Date; sample?: boolean }) {
  const authStatus = useAuthStatus()
  const [state, setState] = useState<AppState>(() => sample
    ? applyCircle({
        ...emptyState(true),
        currentUser: {
          id: 'sample-anita',
          name: 'Anita Iyer',
          role: 'coordinator',
          relation: 'Daughter',
          initials: 'AI',
          color: '#477E78',
        },
        accountProfile: { name: 'Anita Iyer', phone: '' },
        isLoading: false,
        isSample: true,
      }, buildSampleCircle(baseNow()))
    : emptyState())
  const [simulatedAt, setSimulatedAt] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const now = useCallback(() => simulatedAt ? new Date(simulatedAt) : baseNow(), [baseNow, simulatedAt, clockTick])
  const toastCounter = useRef(0)
  const reminderGenerationRef = useRef(false)
  const ladderEvaluationRef = useRef(false)
  const pauseResumeRef = useRef(false)
  const refillEvaluationRef = useRef(false)
  const appointmentReminderRef = useRef(false)
  const weeklyDigestRef = useRef(false)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(value => value + 1), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = `toast-${++toastCounter.current}`
    setState(current => ({ ...current, toasts: [...current.toasts, { id, type, message }] }))
    setTimeout(() => setState(current => ({ ...current, toasts: current.toasts.filter(toast => toast.id !== id) })), 4500)
  }, [])

  const loadCircle = useCallback(async (circleId: string, membership?: any) => {
    const snapshot = await api<any>(`/circles/${circleId}/snapshot`)
    const circle = circleFromSnapshot(membership ?? { circleId }, snapshot)
    setState(current => applyCircle({
      ...current,
      circles: { ...current.circles, [circle.id]: circle },
      isLoading: false,
    }, circle))
  }, [])

  const loadAccount = useCallback(async (authUser: any, preferredCircleId?: string) => {
    const session = await api<any>('/session')
    const circles: Record<string, CircleData> = {}
    for (const membership of session.circles ?? []) {
      circles[membership.circleId] = {
        id: membership.circleId,
        name: membership.circle?.name ?? 'Care circle',
        role: membership.role,
        patients: [],
        activePatientId: '',
        patientDataStore: {},
        tasks: [],
        healthEntries: [],
        notifications: [],
        members: [],
        activity: [],
        careEvents: [],
      }
    }
    const targetId = preferredCircleId && circles[preferredCircleId] ? preferredCircleId : Object.keys(circles)[0]
    setState(current => ({
      ...emptyState(),
      currentUser: toUser(authUser, session.profile?.name),
      accountProfile: { name: session.profile?.name ?? authUser.email, phone: session.profile?.phone ?? '' },
      preferences: { ...current.preferences, ...(session.settings ?? {}) },
      circles,
      toasts: current.toasts,
      isLoading: Boolean(targetId),
    }))
    if (targetId) await loadCircle(targetId, session.circles.find((item: any) => item.circleId === targetId))
  }, [loadCircle])

  useEffect(() => {
    if (sample) return
    let active = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!active) return
      if (error || !data.session?.user) {
        try {
          // Works only while the server's UI preview switch is on; otherwise this falls through to the login screen.
          const preview = await api<any>('/session')
          if (!active) return
          await loadAccount({ id: preview.user.id, email: preview.user.email, user_metadata: { name: preview.profile?.name } })
        } catch {
          setState(current => ({ ...emptyState(), toasts: current.toasts, isLoading: false }))
        }
        return
      }
      try {
        await loadAccount(data.session.user)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Backend unavailable'
        setState(current => ({ ...current, currentUser: toUser(data.session!.user), isLoading: false }))
        addToast('error', `Could not load server data: ${message}. Retry after deploying the connected Edge Function.`)
      }
    })
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_OUT') {
        return
      } else if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        if (stateRef.current.currentUser && !stateRef.current.isLoading) {
          setState(current => ({ ...current, sessionExpired: false }))
          return
        }
        setTimeout(() => loadAccount(session.user).catch(error => addToast('error', error.message)), 0)
      }
    })
    return () => { active = false; subscription.subscription.unsubscribe() }
  }, [addToast, loadAccount, sample])

  async function commitModules(
    modules: Record<string, unknown>,
    apply: (current: AppState) => AppState,
    message: string,
  ) {
    const current = stateRef.current
    if (!current.activeCircleId) return
    if (current.isSample) {
      setState(value => ({ ...apply(value), isLoading: false, commitError: null }))
      addToast('success', message)
      return
    }
    setState(value => ({ ...value, isLoading: true }))
    try {
      await api(`/circles/${current.activeCircleId}/commit`, {
        method: 'PUT',
        body: JSON.stringify({ modules }),
      })
      setState(value => {
        const applied = apply(value)
        if (!Array.isArray(modules.careEvents)) return { ...applied, isLoading: false, commitError: null }
        const mergedEvents = [...value.careEvents]
        const eventIds = new Set(mergedEvents.map(event => event.id))
        for (const event of applied.careEvents) {
          if (!eventIds.has(event.id)) {
            mergedEvents.push(event)
            eventIds.add(event.id)
          }
        }
        return { ...applied, careEvents: mergedEvents, isLoading: false, commitError: null }
      })
      addToast('success', message)
    } catch (error) {
      setState(value => ({
        ...value,
        isLoading: false,
        commitError: {
          modules,
          message,
          failedAt: new Date().toISOString(),
        },
        sessionExpired: error instanceof ApiError && error.status === 401,
      }))
      addToast('error', error instanceof Error ? error.message : 'Server commit failed')
    }
  }

  useEffect(() => {
    const current = stateRef.current
    if (
      reminderGenerationRef.current ||
      current.isSample ||
      current.isLoading ||
      !current.activeCircleId ||
      current.activeCircleRole === 'view-only'
    ) return
    const currentTime = now()
    const date = localDateKey(currentTime)
    const events: CareEvent[] = []
    const patientDataStore = { ...current.patientDataStore }
    let additionCount = 0
    for (const patient of current.patients) {
      const data = patientDataStore[patient.id] ?? emptyPatientData()
      const sourceAlerts = patient.id === current.activePatientId ? current.alerts : data.alerts
      const existingAlerts = sourceAlerts.map(alert =>
        alert.scheduledDate < date &&
        !['Confirmed', 'Missed', 'Not recorded'].includes(alert.status)
          ? { ...alert, status: 'Not recorded' as const }
          : alert
      )
      const staleCount = existingAlerts.filter((alert, index) => alert !== sourceAlerts[index]).length
      additionCount += staleCount
      if (staleCount) patientDataStore[patient.id] = { ...data, alerts: existingAlerts }
      if (
        !current.preferences.medicineReminders ||
        isParentPaused(patient.parentChannel, currentTime) ||
        patient.parentChannel.reminders.status !== 'Agreed'
      ) continue
      const medications = patient.id === current.activePatientId ? current.medications : data.medications
      const additions: MedicationAlert[] = []
      for (const medication of medications) {
        if (medication.status === 'Stopped') continue
        const time = medication.scheduleTime
        if (current.preferences.quietHours && isQuietTime(time, current.preferences.quietStart, current.preferences.quietEnd)) continue
        const scheduledAt = new Date(`${date}T${time}:00`)
        const id = `${medication.id}-${date}-${time}`
        if (currentTime.getTime() < scheduledAt.getTime() || existingAlerts.some(alert => alert.id === id)) continue
        const isInsideLiveWindow = currentTime.getTime() <= scheduledAt.getTime() + 30 * 60 * 1000
        additions.push({
          id,
          patientId: patient.id,
          medicationId: medication.id,
          medicationName: medication.name,
          dose: medication.dose,
          scheduledTime: time,
          scheduledDate: date,
          status: isInsideLiveWindow ? 'Unconfirmed' : 'Not recorded',
          source: isInsideLiveWindow ? 'Simulated reminder schedule' : 'Schedule history',
          createdAt: currentTime.toISOString(),
        })
        if (isInsideLiveWindow) {
          events.push({
            id: eventId('reminder', id),
            at: currentTime.toISOString(),
            kind: 'reminder_sent',
            patientId: patient.id,
            alertId: id,
            actorType: 'system',
            actorId: 'care-circle',
            text: `Simulated reminder for ${medication.name} ${medication.dose} at ${time}; no message was sent.${patient.parentChannel.familyNote ? ` ${patient.parentChannel.familyNote}` : ''}`,
          })
        }
      }
      if (additions.length || staleCount) {
        additionCount += additions.length
        patientDataStore[patient.id] = { ...data, alerts: [...existingAlerts, ...additions].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)) }
      }
    }
    if (!additionCount) return

    reminderGenerationRef.current = true
    const alerts = patientDataStore[current.activePatientId]?.alerts ?? current.alerts
    const careEvents = [...current.careEvents, ...events]
    const allAlerts = Object.entries(patientDataStore).flatMap(([patientId, data]) => withPatientId(data.alerts, patientId))
    void commitModules(
      { alerts: allAlerts, careEvents },
      value => ({ ...value, alerts, careEvents, patientDataStore }),
      events.length === 0
        ? 'Dose history updated'
        : events.length === 1
          ? 'Simulated reminder recorded; no message sent'
          : `${events.length} simulated reminders recorded; no messages sent`,
    ).finally(() => { reminderGenerationRef.current = false })
  }, [
    now,
    simulatedAt,
    state.activeCircleId,
    state.activeCircleRole,
    state.activePatientId,
    state.isLoading,
    state.medications,
    state.patients,
    state.preferences,
  ])

  useEffect(() => {
    const current = stateRef.current
    if (current.isSample || refillEvaluationRef.current || current.isLoading || !current.activeCircleId || current.activeCircleRole === 'view-only') return
    const tasksToAdd: CareTask[] = []
    const events: CareEvent[] = []
    for (const patient of current.patients) {
      const data = current.patientDataStore[patient.id] ?? emptyPatientData()
      const medications = patient.id === current.activePatientId ? current.medications : data.medications
      for (const medication of medications) {
        if (medication.status === 'Stopped') continue
        if (medication.stock > medication.refillThreshold) continue
        const openTask = current.tasks.some(task => task.patientId === patient.id && (task.medicationId === medication.id || task.title === `Refill ${medication.name}`) && task.status !== 'Completed')
        if (openTask) continue
        const latestRefillEvent = [...current.careEvents].reverse().find(event => event.patientId === patient.id && event.medicationId === medication.id && (event.kind === 'refill_needed' || event.kind === 'refill_done'))
        if (latestRefillEvent?.kind === 'refill_needed') continue
        const days = Math.max(0, Math.floor(medication.stock / dosesPerDay(medication.frequency)))
        const taskId = `refill-${medication.id}-${latestRefillEvent?.id ?? 'initial'}`
        tasksToAdd.push({
          id: taskId,
          title: `Refill ${medication.name}`,
          patientId: patient.id,
          medicationId: medication.id,
          assigneeId: '',
          due: `${localDateKey(now())}T17:00`,
          priority: 'High',
          status: 'To do',
          response: 'Waiting',
          description: `About ${days} days of tablets left`,
          comments: [],
          history: [],
        })
        events.push({
          id: crypto.randomUUID(), at: now().toISOString(), kind: 'refill_needed', patientId: patient.id,
          medicationId: medication.id, taskId, actorType: 'system', actorId: 'care-circle',
          text: `${medication.name} needs a refill. About ${days} days of tablets left.`,
        })
      }
    }
    if (!tasksToAdd.length) return
    refillEvaluationRef.current = true
    const tasks = [...tasksToAdd, ...current.tasks]
    const careEvents = [...current.careEvents, ...events]
    void commitModules(
      { tasks, careEvents },
      value => ({ ...value, tasks, careEvents }),
      tasksToAdd.length === 1 ? 'Refill task opened' : `${tasksToAdd.length} refill tasks opened`,
    ).finally(() => { refillEvaluationRef.current = false })
  }, [now, simulatedAt, state.activeCircleId, state.activeCircleRole, state.careEvents, state.isLoading, state.medications, state.patients, state.tasks])

  useEffect(() => {
    const current = stateRef.current
    if (current.isSample || appointmentReminderRef.current || current.isLoading || !current.activeCircleId || current.activeCircleRole === 'view-only') return
    const currentTime = now()
    const events: CareEvent[] = []
    for (const patient of current.patients) {
      const data = current.patientDataStore[patient.id] ?? emptyPatientData()
      const appointments = patient.id === current.activePatientId ? current.appointments : data.appointments
      for (const appointment of appointments) {
        if (appointment.status === 'Completed' || appointment.status === 'Cancelled') continue
        const reminderAt = Date.parse(appointment.datetime) - appointmentReminderMinutes(appointment.reminder) * 60 * 1000
        const eventId = `appointment-reminder-${appointment.id}`
        if (currentTime.getTime() < reminderAt || current.careEvents.some(event => event.id === eventId)) continue
        events.push({
          id: eventId, at: currentTime.toISOString(), kind: 'appointment_reminder', patientId: patient.id,
          appointmentId: appointment.id, actorType: 'system', actorId: 'care-circle',
          text: `Appointment reminder: ${appointment.type} with ${appointment.doctor} on ${new Date(appointment.datetime).toLocaleString('en-IN')}.`,
        })
      }
    }
    if (!events.length) return
    appointmentReminderRef.current = true
    const careEvents = [...current.careEvents, ...events]
    void commitModules(
      { careEvents },
      value => ({ ...value, careEvents }),
      events.length === 1 ? 'Appointment reminder added' : `${events.length} appointment reminders added`,
    ).finally(() => { appointmentReminderRef.current = false })
  }, [now, simulatedAt, state.activeCircleId, state.activeCircleRole, state.appointments, state.careEvents, state.isLoading, state.patients])

  useEffect(() => {
    const current = stateRef.current
    if (
      weeklyDigestRef.current ||
      current.isSample ||
      current.isLoading ||
      !current.activeCircleId ||
      current.activeCircleRole === 'view-only' ||
      !current.preferences.weeklyDigestEnabled
    ) return
    const currentTime = now()
    const delivery = mostRecentDigestDelivery(currentTime, current.preferences.weeklyDigestDay, current.preferences.weeklyDigestTime)
    const periodStart = delivery.getTime() - 7 * 24 * 60 * 60 * 1000
    const additions: CareEvent[] = []
    for (const patient of current.patients) {
      const sharing = patient.parentChannel.sharing
      if (sharing.status !== 'Agreed' || !sharing.sharedWith.length) continue
      if (sharing.changedAt && Date.parse(sharing.changedAt) > delivery.getTime()) continue
      const eventId = `weekly-digest-${patient.id}-${localDateKey(delivery)}`
      if (current.careEvents.some(event => event.id === eventId)) continue
      const coveredEventIds = current.careEvents
        .filter(event =>
          event.patientId === patient.id &&
          event.kind !== 'weekly_digest' &&
          Date.parse(event.at) > periodStart &&
          Date.parse(event.at) <= delivery.getTime()
        )
        .map(event => event.id)
      additions.push({
        id: eventId,
        at: delivery.toISOString(),
        kind: 'weekly_digest',
        patientId: patient.id,
        actorType: 'system',
        actorId: 'care-circle',
        coveredEventIds,
        recipientIds: [...sharing.sharedWith],
        text: `Weekly digest for ${patient.parentChannel.preferredName} is ready.`,
      })
    }
    if (!additions.length) return
    weeklyDigestRef.current = true
    const careEvents = [...current.careEvents, ...additions]
    void commitModules(
      { careEvents },
      value => ({ ...value, careEvents }),
      additions.length === 1 ? 'Weekly digest created' : `${additions.length} weekly digests created`,
    ).finally(() => { weeklyDigestRef.current = false })
  }, [
    now,
    simulatedAt,
    state.activeCircleId,
    state.activeCircleRole,
    state.careEvents,
    state.isLoading,
    state.patients,
    state.preferences.weeklyDigestDay,
    state.preferences.weeklyDigestEnabled,
    state.preferences.weeklyDigestTime,
  ])

  useEffect(() => {
    const current = stateRef.current
    if (current.isSample || pauseResumeRef.current || current.isLoading || !current.activeCircleId || current.activeCircleRole === 'view-only') return
    const currentTime = now()
    const expired = current.patients.filter(patient =>
      patient.parentChannel.paused &&
      patient.parentChannel.pausedUntil &&
      currentTime.getTime() >= Date.parse(patient.parentChannel.pausedUntil)
    )
    if (!expired.length) return
    const expiredIds = new Set(expired.map(patient => patient.id))
    const patients = current.patients.map(patient => expiredIds.has(patient.id) ? {
      ...patient,
      parentChannel: { ...patient.parentChannel, paused: false, pausedUntil: undefined },
    } : patient)
    pauseResumeRef.current = true
    void commitModules(
      { patients },
      value => ({ ...value, patients }),
      expired.length === 1 ? `${expired[0].parentChannel.preferredName}'s reminder pause ended` : 'Reminder pauses ended',
    ).finally(() => { pauseResumeRef.current = false })
  }, [now, simulatedAt, state.activeCircleId, state.activeCircleRole, state.isLoading, state.patients])

  useEffect(() => {
    const current = stateRef.current
    if (
      ladderEvaluationRef.current ||
      current.isSample ||
      current.isLoading ||
      !current.activeCircleId ||
      current.activeCircleRole === 'view-only'
    ) return

    const currentTime = now()
    const today = localDateKey(currentTime)
    const additions: CareEvent[] = []
    const tasksToAdd: CareTask[] = []
    const unscheduledMessagesByPatient = new Map<string, number>()
    for (const event of current.careEvents) {
      if (event.kind !== 'followup_sent' || localDateKey(new Date(event.at)) !== today) continue
      unscheduledMessagesByPatient.set(event.patientId, (unscheduledMessagesByPatient.get(event.patientId) ?? 0) + 1)
    }
    for (const patient of current.patients) {
      if (patient.parentChannel.reminders.status === 'Withdrawn') continue
      const { firstCallId, backupId } = escalationContacts(current, patient)
      let unscheduledMessagesToday = unscheduledMessagesByPatient.get(patient.id) ?? 0
      const data = current.patientDataStore[patient.id] ?? emptyPatientData()
      const alerts = patient.id === current.activePatientId ? current.alerts : data.alerts
      for (const alert of alerts) {
        if (alert.status === 'Not recorded' || alert.scheduledDate !== today) continue
        const alertEvents = [...current.careEvents, ...additions].filter(event => event.alertId === alert.id)
        const inQuietHours = current.preferences.quietHours &&
          isQuietTime(
            `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`,
            current.preferences.quietStart,
            current.preferences.quietEnd,
          )
        const laterReply = [...alertEvents].reverse().find(event => event.kind === 'parent_replied' && event.replyCategory === 'later')
        const laterReminderId = `later-reminder-${alert.id}`
        const laterReminderAt = laterReply ? new Date(Date.parse(laterReply.at) + 30 * 60 * 1000) : undefined
        if (
          laterReply &&
          laterReminderAt &&
          currentTime.getTime() >= laterReminderAt.getTime() &&
          localDateKey(laterReminderAt) === today &&
          !alertEvents.some(event => event.id === laterReminderId) &&
          !isParentPaused(patient.parentChannel, currentTime) &&
          patient.parentChannel.reminders.status === 'Agreed' &&
          !inQuietHours &&
          unscheduledMessagesToday < 2
        ) {
          additions.push({
            id: laterReminderId,
            at: currentTime.toISOString(),
            kind: 'followup_sent',
            patientId: patient.id,
            alertId: alert.id,
            actorType: 'system',
            actorId: 'care-circle',
            text: `Simulated follow-up; no message was sent. Reminder: ${alert.medicationName} ${alert.dose}. Reply Le li once you have taken it.`,
          })
          unscheduledMessagesToday += 1
          unscheduledMessagesByPatient.set(patient.id, unscheduledMessagesToday)
        }
        const outcomeRecorded = alertEvents.some(event =>
          (event.kind === 'parent_replied' && event.replyCategory !== 'later') ||
          event.kind === 'family_confirmed' ||
          event.kind === 'not_taken_recorded'
        )
        if (outcomeRecorded || alert.status === 'Confirmed' || alert.status === 'Missed') continue

        let latestClaimIndex = -1
        for (let index = alertEvents.length - 1; index >= 0; index -= 1) {
          if (alertEvents[index].kind === 'claimed') {
            latestClaimIndex = index
            break
          }
        }
        const latestClaim = latestClaimIndex >= 0 ? alertEvents[latestClaimIndex] : undefined
        if (latestClaim) {
          const claimResolved = alertEvents.slice(latestClaimIndex + 1).some(event =>
            (event.kind === 'claim_lapsed' ||
              event.kind === 'call_unanswered' ||
              (event.kind === 'parent_replied' && event.replyCategory !== 'later') ||
              event.kind === 'family_confirmed' ||
              event.kind === 'not_taken_recorded')
          )
          if (!claimResolved) {
            const claimAgeMinutes = (currentTime.getTime() - Date.parse(latestClaim.at)) / 60000
            if (claimAgeMinutes < 20) continue
            const lapseId = eventId('claim-lapsed', latestClaim.id)
            if (!alertEvents.some(event => event.id === lapseId)) {
              additions.push({
                id: lapseId,
                at: currentTime.toISOString(),
                kind: 'claim_lapsed',
                patientId: patient.id,
                alertId: alert.id,
                actorType: 'system',
                actorId: 'care-circle',
                text: 'Claim lapsed',
              })
            }
          }
        }

        const scheduledAt = new Date(`${alert.scheduledDate}T${alert.scheduledTime}:00`)
        const ageMinutes = (currentTime.getTime() - scheduledAt.getTime()) / 60000
        if (ageMinutes < 0) continue

        const followupId = eventId('followup', alert.id)
        const followupAlreadySent = alertEvents.some(event => event.id === followupId || event.kind === 'followup_sent')
        if (
          ageMinutes >= current.preferences.followUpAfter &&
          !followupAlreadySent &&
          !isParentPaused(patient.parentChannel, currentTime) &&
          patient.parentChannel.reminders.status === 'Agreed' &&
          !inQuietHours &&
          unscheduledMessagesToday < 2
        ) {
          additions.push({
            id: followupId,
            at: currentTime.toISOString(),
            kind: 'followup_sent',
            patientId: patient.id,
            alertId: alert.id,
            actorType: 'system',
            actorId: 'care-circle',
            text: `Simulated follow-up; no message was sent. Namaste ${patient.parentChannel.preferredName} ji, just checking whether you have taken your ${friendlyScheduleTime(alert.scheduledTime)} ${alert.medicationName}. Reply Le li once you have.`,
          })
          unscheduledMessagesToday += 1
          unscheduledMessagesByPatient.set(patient.id, unscheduledMessagesToday)
        }

        const escalationStages = [
          { key: 'first-call', after: current.preferences.firstCallAfter, targetId: firstCallId },
          { key: 'backup', after: current.preferences.backupAfter, targetId: backupId },
        ]
        for (const stage of escalationStages) {
          const escalationId = `escalated-${alert.id}-${stage.key}`
          if (ageMinutes < stage.after || alertEvents.some(event => event.id === escalationId)) continue
          if (stage.key === 'backup' && !stage.targetId && firstCallId) {
            const taskId = `ladder-followup-${alert.id}`
            if (!current.tasks.some(task => task.id === taskId) && !tasksToAdd.some(task => task.id === taskId)) {
              tasksToAdd.push({
                id: taskId,
                title: `Try ${patient.parentChannel.preferredName} again`,
                patientId: patient.id,
                assigneeId: firstCallId,
                due: currentTime.toISOString().slice(0, 16),
                priority: 'High',
                status: 'To do',
                response: 'Waiting',
                medicationId: alert.medicationId,
                description: `No backup caregiver is available for the ${alert.medicationName} follow-up.`,
                comments: [],
                history: [],
              })
            }
            additions.push({
              id: escalationId,
              at: currentTime.toISOString(),
              kind: 'task_assigned',
              patientId: patient.id,
              alertId: alert.id,
              taskId,
              actorType: 'system',
              actorId: 'care-circle',
              targetId: firstCallId,
              text: 'No backup caregiver is available. A follow-up task was opened for the first-call caregiver.',
            })
            continue
          }
          if (!stage.targetId) continue
          additions.push({
            id: escalationId,
            at: currentTime.toISOString(),
            kind: 'escalated',
            patientId: patient.id,
            alertId: alert.id,
            actorType: 'system',
            actorId: 'care-circle',
            targetId: stage.targetId,
            text: `No reply yet from ${patient.parentChannel.preferredName} after ${stage.after} minutes. Care Circle cannot tell why. Please call them.`,
          })
        }
      }
    }
    if (!additions.length) return

    ladderEvaluationRef.current = true
    const careEvents = [...current.careEvents, ...additions]
    const tasks = tasksToAdd.length ? [...tasksToAdd, ...current.tasks] : current.tasks
    void commitModules(
      { careEvents, ...(tasksToAdd.length ? { tasks } : {}) },
      value => ({ ...value, careEvents, tasks }),
      additions.length === 1 ? additions[0].text : `${additions.length} follow-up updates added`,
    ).finally(() => { ladderEvaluationRef.current = false })
  }, [
    now,
    simulatedAt,
    state.activeCircleId,
    state.activeCircleRole,
    state.alerts,
    state.careEvents,
    state.isLoading,
    state.members,
    state.patients,
    state.preferences,
    state.tasks,
  ])

  function recordParentConsent(
    current: AppState,
    patient: Patient,
    response: 'agrees' | 'declines' | 'stop',
    exactReply: string,
  ) {
    const timestamp = now().toISOString()
    const activeMemberIds = current.members.filter(member => member.status === 'Active').map(member => member.userId ?? member.id)
    const question = patient.parentChannel.lastAskedQuestion ?? 'reminders'
    let parentChannel: ParentChannel
    if (response === 'stop') {
      parentChannel = {
        ...patient.parentChannel,
        paused: true,
        lastAskedQuestion: undefined,
        reminders: { status: 'Withdrawn', changedAt: timestamp, via: 'WhatsApp reply' },
      }
    } else if (question === 'sharing') {
      parentChannel = {
        ...patient.parentChannel,
        lastAskedQuestion: undefined,
        sharing: {
          status: response === 'agrees' ? 'Agreed' : 'Declined',
          changedAt: timestamp,
          via: 'WhatsApp reply',
          sharedWith: response === 'agrees' ? activeMemberIds : [],
        },
      }
    } else {
      parentChannel = {
        ...patient.parentChannel,
        paused: response !== 'agrees',
        lastAskedQuestion: undefined,
        reminders: {
          status: response === 'agrees' ? 'Agreed' : 'Declined',
          changedAt: timestamp,
          via: 'WhatsApp reply',
        },
      }
    }
    const patients = current.patients.map(item => item.id === patient.id ? { ...item, parentChannel } : item)
    const label = response === 'stop'
      ? 'asked to stop reminders'
      : `${response === 'agrees' ? 'agreed to' : 'declined'} ${question === 'sharing' ? 'reply sharing' : 'reminders'}`
    const timelineEvent: TimelineEvent = {
      id: crypto.randomUUID(), patientId: patient.id, type: 'note',
      title: `${parentChannel.preferredName} ${label}`,
      description: response === 'stop'
        ? `${parentChannel.preferredName} sent STOP by WhatsApp. Reminder messages are paused.`
        : `${parentChannel.preferredName} replied by WhatsApp.`,
      timestamp, actor: parentChannel.preferredName, actorId: `parent-${patient.id}`, comments: [],
    }
    const timeline = [timelineEvent, ...current.timeline]
    const careEvent: CareEvent = {
      id: crypto.randomUUID(), at: timestamp, kind: 'consent_changed', patientId: patient.id,
      actorType: 'parent', actorId: `parent-${patient.id}`,
      rawText: exactReply,
      consentResponse: response,
      text: response === 'stop'
        ? `${parentChannel.preferredName} asked to stop reminders with reply "${exactReply}".`
        : `${parentChannel.preferredName} replied about ${question === 'sharing' ? 'reply sharing' : 'reminders'} consent: "${exactReply}".`,
    }
    const careEvents = [...current.careEvents, careEvent]
    void commitModules(
      { patients, timeline: allPatientRecords(current, 'timeline', timeline), careEvents },
      value => ({ ...value, patients, timeline, careEvents }),
      response === 'stop' ? 'Reminder messages paused' : `${parentChannel.preferredName}'s reply recorded`,
    )
  }

  const actions: AppActions = {
    async signIn(email, password) {
      setState(current => ({ ...current, isLoading: true }))
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.user) {
        setState(current => ({ ...current, isLoading: false }))
        addToast('error', error?.message ?? 'Sign in failed')
        throw new Error(error?.message ?? 'Authentication did not return a user')
      }
      try {
        const inviteToken = sessionStorage.getItem('carecircle-invite-token')
        if (inviteToken) {
          await api(`/invites/${inviteToken}/accept`, { method: 'POST' })
          sessionStorage.removeItem('carecircle-invite-token')
        }
        await loadAccount(data.user)
        return true
      } catch (error) {
        setState(current => ({ ...current, isLoading: false }))
        addToast('error', error instanceof Error ? error.message : 'Could not load account')
        throw new Error('Your sign-in succeeded, but CareCircle could not load your account: ' + (error instanceof Error ? error.message : 'Unknown account-loading error'))
      }
    },
    async signUp(name, email, password) {
      setState(current => ({ ...current, isLoading: true }))
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      })
      setState(current => ({ ...current, isLoading: false }))
      if (error) {
        addToast('error', error.message)
        return { success: false, needsVerification: false }
      }
      if (data.session?.user) await loadAccount(data.session.user).catch(() => undefined)
      return { success: true, needsVerification: !data.session }
    },
    async signOut() {
      authStatus.markExplicitSignOut()
      const { error } = await supabase.auth.signOut()
      if (error) addToast('error', error.message)
      else {
        setState({ ...emptyState(), isLoading: false })
        window.location.assign('/login')
      }
    },
    async completeOnboarding(input) {
      setState(current => ({ ...current, isLoading: true }))
      try {
        const result = await api<{ circleId: string; patientId: string }>('/onboarding', {
          method: 'POST',
          body: JSON.stringify({
            circleName: input.circleName,
            creatorName: stateRef.current.currentUser?.name,
            patient: {
              name: input.patientName,
              preferredName: input.patientName.split(' ')[0],
              dob: input.patientDob,
              age: now().getFullYear() - Number(input.patientDob.slice(0, 4)),
              relationship: input.relationship,
              conditions: [input.condition],
              initials: input.patientName.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(),
              bloodType: '',
              primaryDoctor: '',
              primaryCaregiverId: stateRef.current.currentUser?.id,
              address: '',
              accentColor: '#4A7FA5',
              medicalHistory: '',
              allergies: '',
              doctors: [],
              emergencyContacts: [],
              preferredHospital: '',
              emergencyInstructions: '',
              diet: '',
              mobility: '',
              communication: '',
              routine: '',
              parentChannel: {
                whatsappNumber: '',
                language: 'English',
                preferredName: input.patientName.split(' ')[0],
                quietHours: { start: '21:00', end: '07:00' },
                paused: true,
                reminders: { status: 'Not asked', changedAt: '', via: 'Recorded by family' },
                sharing: { status: 'Not asked', changedAt: '', via: 'Recorded by family', sharedWith: [] },
              },
            },
            firstMedicine: input.firstMedicine ? {
              ...input.firstMedicine,
              prescribingDoctor: '',
              startDate: localDateKey(now()),
              notes: '',
              accentColor: '#C5DCEE',
              stock: 30,
              refillThreshold: 7,
              status: 'Active',
              appearance: '',
              photos: [],
            } : undefined,
          }),
        })
        const { data } = await supabase.auth.getUser()
        if (!data.user) throw new Error('Session expired')
        await loadAccount(data.user, result.circleId)
        return true
      } catch (error) {
        setState(current => ({ ...current, isLoading: false }))
        addToast('error', error instanceof Error ? error.message : 'Onboarding failed')
        throw error
      }
    },
    async acceptInvitation(token, accepted) {
      if (!accepted) {
        sessionStorage.removeItem('carecircle-invite-token')
        return
      }
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        sessionStorage.setItem('carecircle-invite-token', token)
        return
      }
      const result = await api<{ circleId: string }>(`/invites/${token}/accept`, { method: 'POST' })
      await loadAccount(data.session.user, result.circleId)
    },
    registerDemoUser() { return '' },
    setView(view) { setState(current => ({ ...current, view, alertDetailId: null, medicineDetailId: null, appointmentDetailId: null, documentDetailId: null })) },
    togglePhonePane(open) { setState(current => ({ ...current, phonePaneOpen: open ?? !current.phonePaneOpen })) },
    advanceSimulatedTime(minutes) { setSimulatedAt(new Date(now().getTime() + minutes * 60 * 1000).toISOString()) },
    jumpToNextReminder() {
      const current = stateRef.current
      const from = now()
      const candidates: Date[] = []
      for (let dayOffset = 0; dayOffset < 8; dayOffset += 1) {
        const day = new Date(from)
        day.setDate(from.getDate() + dayOffset)
        const date = localDateKey(day)
        for (const medication of current.medications) {
          if (current.preferences.quietHours && isQuietTime(medication.scheduleTime, current.preferences.quietStart, current.preferences.quietEnd)) continue
          const candidate = new Date(`${date}T${medication.scheduleTime}:00`)
          if (candidate.getTime() > from.getTime()) candidates.push(candidate)
        }
      }
      const next = candidates.sort((a, b) => a.getTime() - b.getTime())[0]
      if (next) setSimulatedAt(next.toISOString())
      else addToast('info', 'No upcoming reminder time is available')
    },
    jumpToSundayDigest() { setSimulatedAt(nextSundayAtSix(now()).toISOString()) },
    resetSimulatedTime() { setSimulatedAt(null) },
    dismissFirstReply(patientId) {
      setState(current => {
        const dismissedFirstReplyPatientIds = [...new Set([...current.dismissedFirstReplyPatientIds, patientId])]
        if (!current.isSample) localStorage.setItem('carecircle-dismissed-first-replies', JSON.stringify(dismissedFirstReplyPatientIds))
        return { ...current, dismissedFirstReplyPatientIds }
      })
    },
    async switchCircle(circleId) {
      setState(current => ({ ...current, isLoading: true }))
      try { await loadCircle(circleId) } catch (error) {
        setState(current => ({ ...current, isLoading: false }))
        addToast('error', error instanceof Error ? error.message : 'Circle access denied')
      }
    },
    switchPatient(patientId) {
      setState(current => {
        const data = current.patientDataStore[patientId] ?? emptyPatientData()
        return { ...current, activePatientId: patientId, alerts: data.alerts, medications: data.medications, appointments: data.appointments, documents: data.documents, timeline: data.timeline }
      })
    },
    openAlertDetail(id) { setState(current => ({ ...current, alertDetailId: id })) },
    closeAlertDetail() { setState(current => ({ ...current, alertDetailId: null, confirmConfig: null })) },
    openMedicineDetail(id) { setState(current => ({ ...current, medicineDetailId: id })) },
    openAppointmentDetail(id) { setState(current => ({ ...current, appointmentDetailId: id })) },
    openDocumentDetail(id) { setState(current => ({ ...current, documentDetailId: id })) },
    assignAlert(alertId, userId) {
      const current = stateRef.current
      const alert = current.alerts.find(item => item.id === alertId)
      if (!alert) return
      const alerts = current.alerts.map(item => item.id === alertId ? { ...item, status: 'Assigned' as const, assignedTo: userId } : item)
      const task: CareTask = {
        id: `med-followup-${alertId}`, title: `Confirm ${alert.medicationName} dose`,
        patientId: current.activePatientId, assigneeId: userId, due: `${alert.scheduledDate}T${alert.scheduledTime}`,
        priority: 'High', status: 'To do', response: 'Waiting', description: `Record the ${alert.dose} dose.`, comments: [], history: [],
      }
      const tasks = [...current.tasks.filter(item => item.id !== task.id), task]
      const timestamp = now().toISOString()
      const timeline = [{ id: crypto.randomUUID(), patientId: current.activePatientId, type: 'task' as const, title: 'Medication follow-up assigned', description: `${alert.medicationName} follow-up assigned.`, timestamp, actor: current.currentUser?.name ?? '', actorId: current.currentUser?.id ?? '', relatedId: alert.medicationId, relatedType: 'medicine' as const, comments: [] }, ...current.timeline]
      const assignee = current.members.find(member => (member.userId ?? member.id) === userId)
      const taskEvent: CareEvent = {
        id: crypto.randomUUID(), at: timestamp, kind: 'task_assigned', patientId: current.activePatientId, taskId: task.id,
        actorType: 'member', actorId: current.currentUser?.id ?? '', targetId: userId,
        text: `${assignee?.name ?? 'A circle member'} was assigned ${task.title}. Waiting for a reply.`,
      }
      const careEvents = [...current.careEvents, taskEvent]
      commitModules({
        alerts: allPatientRecords(current, 'alerts', alerts),
        tasks,
        timeline: allPatientRecords(current, 'timeline', timeline),
        careEvents,
      }, value => ({ ...value, alerts, tasks, timeline, careEvents }), 'Follow-up assigned')
    },
    confirmAlert(alertId) {
      const current = stateRef.current
      const alert = current.alerts.find(item => item.id === alertId)
      if (!alert) return
      const timestamp = now().toISOString()
      const alerts = current.alerts.map(item => item.id === alertId ? { ...item, status: 'Confirmed' as const, confirmedBy: current.currentUser?.id, confirmedAt: timestamp } : item)
      const medications = current.medications.map(item => item.id === alert.medicationId ? { ...item, stock: Math.max(0, item.stock - 1) } : item)
      const tasks = current.tasks.map(item => item.id === `med-followup-${alertId}` ? { ...item, status: 'Completed' as const } : item)
      const timeline = [{ id: crypto.randomUUID(), patientId: current.activePatientId, type: 'medication' as const, title: `${alert.medicationName} confirmed`, description: `Dose recorded by ${current.currentUser?.name}.`, timestamp, actor: current.currentUser?.name ?? '', actorId: current.currentUser?.id ?? '', status: 'Confirmed' as const, relatedId: alert.medicationId, relatedType: 'medicine' as const, comments: [] }, ...current.timeline]
      const careEvent: CareEvent = { id: crypto.randomUUID(), at: timestamp, kind: 'family_confirmed', patientId: current.activePatientId, alertId, actorType: 'member', actorId: current.currentUser?.id ?? '', text: `${current.currentUser?.name ?? 'A family member'} confirmed.` }
      const careEvents = [...current.careEvents, careEvent]
      const visibleNames = current.members
        .filter(member =>
          member.status === 'Active' &&
          (member.userId ?? member.id) !== current.currentUser?.id &&
          current.patients.find(patient => patient.id === current.activePatientId)?.parentChannel.sharing.status === 'Agreed' &&
          current.patients.find(patient => patient.id === current.activePatientId)?.parentChannel.sharing.sharedWith.includes(member.userId ?? member.id)
        )
        .map(member => member.name.split(' ')[0])
      const visibilityMessage = visibleNames.length
        ? `${visibleNames.length === 1 ? visibleNames[0] : `${visibleNames.slice(0, -1).join(', ')} and ${visibleNames.at(-1)}`} can see it.`
        : 'Only you can see it.'
      commitModules({
        alerts: allPatientRecords(current, 'alerts', alerts),
        medications: allPatientRecords(current, 'medications', medications),
        tasks,
        timeline: allPatientRecords(current, 'timeline', timeline),
        careEvents,
      }, value => ({ ...value, alerts, medications, tasks, timeline, careEvents, confirmConfig: null }), `Logged. ${visibilityMessage}`)
    },
    recordNotTaken(alertId, reason) {
      const current = stateRef.current
      const alert = current.alerts.find(item => item.id === alertId)
      if (!alert) return
      const alerts = current.alerts.map(item => item.id === alertId ? { ...item, status: 'Missed' as const, notes: reason } : item)
      const timestamp = now().toISOString()
      const timeline = [{ id: crypto.randomUUID(), patientId: current.activePatientId, type: 'medication' as const, title: `${alert.medicationName} not taken`, description: reason, timestamp, actor: current.currentUser?.name ?? '', actorId: current.currentUser?.id ?? '', status: 'Missed' as const, relatedId: alert.medicationId, relatedType: 'medicine' as const, comments: [] }, ...current.timeline]
      const careEvent: CareEvent = { id: crypto.randomUUID(), at: timestamp, kind: 'not_taken_recorded', patientId: current.activePatientId, alertId, actorType: 'member', actorId: current.currentUser?.id ?? '', text: `${current.currentUser?.name ?? 'A family member'} recorded not taken: ${reason}` }
      const careEvents = [...current.careEvents, careEvent]
      commitModules({ alerts: allPatientRecords(current, 'alerts', alerts), timeline: allPatientRecords(current, 'timeline', timeline), careEvents }, value => ({ ...value, alerts, timeline, careEvents }), 'Not-taken note recorded')
    },
    replyAsParent(alertId, reply) {
      const current = stateRef.current
      const alert = alertId ? current.alerts.find(item => item.id === alertId) : undefined
      const patient = current.patients.find(item => item.id === current.activePatientId)
      const exactReply = reply.trim()
      if (!patient || !exactReply) return
      const currentTime = now()
      const timestamp = currentTime.toISOString()
      const normalizedReply = exactReply.toLocaleLowerCase()
      const pendingMemberEvent = [...current.careEvents].reverse().find(event =>
        event.patientId === patient.id &&
        event.kind === 'member_added' &&
        event.memberId &&
        !patient.parentChannel.sharing.sharedWith.includes(event.memberId) &&
        !current.careEvents.some(replyEvent => replyEvent.kind === 'parent_replied' && replyEvent.memberId === event.memberId)
      )
      const isMemberSharingReply = Boolean(pendingMemberEvent && (normalizedReply === 'yes' || normalizedReply === 'no'))
      const awaitingAskedQuestion =
        (patient.parentChannel.lastAskedQuestion === 'reminders' && patient.parentChannel.reminders.status === 'Asked') ||
        (patient.parentChannel.lastAskedQuestion === 'sharing' && patient.parentChannel.sharing.status === 'Asked')
      const consentResponse = !isMemberSharingReply && awaitingAskedQuestion
        ? classifyParentConsentReply(exactReply)
        : undefined
      if (consentResponse) {
        recordParentConsent(current, patient, consentResponse, exactReply)
        return
      }
      const replyCategory = isMemberSharingReply ? 'other' : classifyParentReply(exactReply)
      const effectiveAlertId = replyAlertId(replyCategory, alertId, isMemberSharingReply)
      const confirmsDose = replyCategory === 'taken' && Boolean(alert) && !isMemberSharingReply
      const wasConfirmed = alert?.status === 'Confirmed'
      const alerts = confirmsDose
        ? current.alerts.map(item => item.id === alertId ? { ...item, status: 'Confirmed' as const, confirmedBy: `parent-${patient.id}`, confirmedAt: timestamp } : item)
        : current.alerts
      const medications = confirmsDose && !wasConfirmed && alert
        ? current.medications.map(item => item.id === alert.medicationId ? { ...item, stock: Math.max(0, item.stock - 1) } : item)
        : current.medications
      let parentChannel = patient.parentChannel
      if (replyCategory === 'stop') {
        parentChannel = {
          ...parentChannel,
          paused: true,
          pausedUntil: undefined,
          reminders: { status: 'Withdrawn', changedAt: timestamp, via: 'WhatsApp reply' },
        }
      } else if (replyCategory === 'pause') {
        const resumeAt = new Date(currentTime)
        resumeAt.setDate(resumeAt.getDate() + 1)
        const [hours, minutes] = parentChannel.quietHours.end.split(':').map(Number)
        resumeAt.setHours(hours, minutes, 0, 0)
        parentChannel = { ...parentChannel, paused: true, pausedUntil: resumeAt.toISOString() }
      } else if (replyCategory === 'stop_sharing') {
        parentChannel = {
          ...parentChannel,
          sharing: { status: 'Withdrawn', changedAt: timestamp, via: 'WhatsApp reply', sharedWith: [] },
        }
      } else if (isMemberSharingReply && pendingMemberEvent?.memberId) {
        parentChannel = {
          ...parentChannel,
          sharing: {
            ...parentChannel.sharing,
            status: normalizedReply === 'yes' ? 'Agreed' : parentChannel.sharing.status,
            changedAt: timestamp,
            via: 'WhatsApp reply',
            sharedWith: normalizedReply === 'yes'
              ? [...new Set([...parentChannel.sharing.sharedWith, pendingMemberEvent.memberId])]
              : parentChannel.sharing.sharedWith,
          },
        }
      }
      const patientChanged = parentChannel !== patient.parentChannel
      const patients = patientChanged ? current.patients.map(item => item.id === patient.id ? { ...item, parentChannel } : item) : current.patients
      const replyEvent: CareEvent = {
        id: crypto.randomUUID(),
        at: timestamp,
        kind: 'parent_replied',
        patientId: patient.id,
        alertId: effectiveAlertId,
        memberId: isMemberSharingReply ? pendingMemberEvent?.memberId : undefined,
        actorType: 'parent',
        actorId: `parent-${patient.id}`,
        rawText: exactReply,
        replyCategory,
        parentText: acknowledgementFor(replyCategory, patient.parentChannel.language, patient.parentChannel.preferredName, currentTime, `${patient.id}:${replyCategory}`),
        text: `${patient.parentChannel.preferredName} wrote: "${exactReply}"`,
      }
      const interpretationEvent: CareEvent = {
        id: crypto.randomUUID(),
        at: timestamp,
        kind: 'reply_interpreted',
        patientId: patient.id,
        alertId: effectiveAlertId,
        relatedEventId: replyEvent.id,
        actorType: 'system',
        actorId: 'care-circle-rules',
        interpretation: {
          category: replyCategory,
          summary: `Rules suggest “${replyCategory.replace('_', ' ')}”; the exact reply remains the record.`,
          confidence: replyCategory === 'other' ? 0 : 1,
          source: 'rule-based reply classifier',
        },
        text: `Rule-based interpretation proposed: ${replyCategory.replace('_', ' ')}.`,
      }
      const consentEvent: CareEvent | undefined = replyCategory === 'stop' || replyCategory === 'stop_sharing' || isMemberSharingReply
        ? {
            id: crypto.randomUUID(),
            at: timestamp,
            kind: 'consent_changed',
            patientId: patient.id,
            actorType: 'parent',
            actorId: `parent-${patient.id}`,
            memberId: isMemberSharingReply ? pendingMemberEvent?.memberId : undefined,
            text: isMemberSharingReply
              ? `${patient.parentChannel.preferredName} replied ${normalizedReply.toUpperCase()} to sharing replies with the new member.`
              : replyCategory === 'stop'
                ? `${patient.parentChannel.preferredName} asked to stop reminders.`
                : `${patient.parentChannel.preferredName} asked to stop sharing replies.`,
          }
        : undefined
      const careEvents = [...current.careEvents, replyEvent, interpretationEvent, ...(consentEvent ? [consentEvent] : [])]
      const modules: Record<string, unknown> = { careEvents }
      const tasks = confirmsDose
        ? current.tasks.map(task =>
            task.id === `med-followup-${alertId}` || task.id === `ladder-followup-${alertId}`
              ? { ...task, status: 'Completed' as const, response: 'Accepted' as const }
              : task
          )
        : current.tasks
      if (confirmsDose) {
        modules.alerts = allPatientRecords(current, 'alerts', alerts)
        modules.medications = allPatientRecords(current, 'medications', medications)
        modules.tasks = tasks
      }
      if (patientChanged) modules.patients = patients
      commitModules(
        modules,
        value => ({ ...value, alerts, medications, patients, careEvents, tasks }),
        `${patient.parentChannel.preferredName} replied: ${replyCategory.replace('_', ' ')}`,
      )
      // Opt-in assistant: only for replies the rules could not read, only after the parent was told, never in Sample.
      // It adds a proposal beside the exact words. It never confirms, misses or changes a dose; a failure changes nothing.
      if (replyCategory === 'other' && !isMemberSharingReply && patient.parentChannel.aiReading && patient.parentChannel.aiDisclosed && !current.isSample && current.activeCircleId) {
        void interpretReply(current.activeCircleId, exactReply, alert?.medicationName ?? '').then(reading => {
          if (!reading) return
          const proposal: CareEvent = {
            id: crypto.randomUUID(),
            at: now().toISOString(),
            kind: 'reply_interpreted',
            patientId: patient.id,
            alertId: effectiveAlertId,
            relatedEventId: replyEvent.id,
            actorType: 'system',
            actorId: 'care-circle-assistant',
            interpretation: { category: reading.category, summary: reading.summary, confidence: reading.confidence, source: 'assistant' },
            text: `Assistant suggestion: ${reading.category.replace('_', ' ')}. The exact reply remains the record.`,
          }
          const careEvents = [...stateRef.current.careEvents, proposal]
          commitModules({ careEvents }, value => ({ ...value, careEvents }), 'Assistant suggestion added')
        }).catch(() => undefined)
      }
    },
    ingestParentReply(alertId, reply) {
      actions.replyAsParent(alertId, reply)
    },
    correctAlertRecord(alertId) {
      const current = stateRef.current
      if (current.activeCircleRole === 'view-only') return
      const alert = current.alerts.find(item => item.id === alertId)
      if (!alert || (alert.status !== 'Confirmed' && alert.status !== 'Missed')) return
      const previousStatus = alert.status
      const alerts = current.alerts.map(item => item.id === alertId ? {
        ...item,
        status: 'Unconfirmed' as const,
        confirmedBy: undefined,
        confirmedAt: undefined,
        notes: undefined,
      } : item)
      const medications = previousStatus === 'Confirmed'
        ? current.medications.map(item => item.id === alert.medicationId ? { ...item, stock: item.stock + 1 } : item)
        : current.medications
      const tasks = current.tasks.map(item =>
        item.id === `med-followup-${alertId}` || item.id === `ladder-followup-${alertId}`
          ? { ...item, status: 'To do' as const }
          : item
      )
      const event: CareEvent = {
        id: crypto.randomUUID(),
        at: now().toISOString(),
        kind: 'record_corrected',
        patientId: alert.patientId ?? current.activePatientId,
        alertId,
        medicationId: alert.medicationId,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        text: `${current.currentUser?.name ?? 'A family member'} corrected the ${alert.medicationName} record from ${previousStatus.toLowerCase()}. It is unresolved again.`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({
        alerts: allPatientRecords(current, 'alerts', alerts),
        medications: allPatientRecords(current, 'medications', medications),
        tasks,
        careEvents,
      }, value => ({ ...value, alerts, medications, tasks, careEvents }), 'Correction saved. The earlier history remains visible.')
    },
    thankCareEvent(eventId) {
      const current = stateRef.current
      if (current.activeCircleRole === 'view-only') return
      const source = current.careEvents.find(event =>
        event.id === eventId &&
        ['family_confirmed', 'claimed', 'task_completed', 'refill_done'].includes(event.kind) &&
        event.actorType === 'member' &&
        event.actorId !== current.currentUser?.id
      )
      if (!source || current.careEvents.some(event => event.kind === 'thanks_sent' && event.relatedEventId === source.id)) return
      const recipient = current.members.find(member => (member.userId ?? member.id) === source.actorId)
      const sender = current.currentUser?.name ?? 'A family member'
      const event: CareEvent = {
        id: crypto.randomUUID(),
        at: now().toISOString(),
        kind: 'thanks_sent',
        patientId: source.patientId,
        alertId: source.alertId,
        taskId: source.taskId,
        medicationId: source.medicationId,
        relatedEventId: source.id,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        targetId: source.actorId,
        text: `${sender} thanked ${recipient?.name ?? 'a family member'}.`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ careEvents }, value => ({ ...value, careEvents }), `Thanks sent to ${recipient?.name ?? 'your family member'}.`)
    },
    sendParentMedicinePhoto(alertId, sampleId, dataUrl) {
      const current = stateRef.current
      const alert = current.alerts.find(item => item.id === alertId)
      const patient = current.patients.find(item => item.id === current.activePatientId)
      if (!alert || !patient) return
      const event: CareEvent = {
        id: crypto.randomUUID(),
        at: now().toISOString(),
        kind: 'parent_medicine_photo',
        patientId: patient.id,
        alertId,
        medicationId: alert.medicationId,
        photoId: sampleId,
        photoDataUrl: dataUrl,
        actorType: 'parent',
        actorId: `parent-${patient.id}`,
        text: `${patient.parentChannel.preferredName} sent a photo of what they are holding.`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ careEvents }, value => ({ ...value, careEvents }), `${patient.parentChannel.preferredName} sent a medicine photo`)
    },
    judgeParentMedicinePhoto(eventId, judgement) {
      const current = stateRef.current
      if (current.activeCircleRole === 'view-only') return
      const parentPhoto = current.careEvents.find(event => event.id === eventId && event.kind === 'parent_medicine_photo')
      if (!parentPhoto || current.careEvents.some(event => event.kind === 'medicine_photo_judgement' && event.relatedEventId === eventId)) return
      const memberName = current.currentUser?.name ?? 'A family member'
      const event: CareEvent = {
        id: crypto.randomUUID(),
        at: now().toISOString(),
        kind: 'medicine_photo_judgement',
        patientId: parentPhoto.patientId,
        alertId: parentPhoto.alertId,
        medicationId: parentPhoto.medicationId,
        relatedEventId: eventId,
        judgement,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        text: `${memberName}: looks ${judgement === 'same' ? 'the same' : 'different'}`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ careEvents }, value => ({ ...value, careEvents }), event.text)
    },
    claimAlert(alertId) {
      const current = stateRef.current
      if (current.activeCircleRole === 'view-only') return
      const alert = current.alerts.find(item => item.id === alertId)
      if (!alert) return
      const alertEvents = current.careEvents.filter(event => event.alertId === alertId)
      let latestClaimIndex = -1
      for (let index = alertEvents.length - 1; index >= 0; index -= 1) {
        if (alertEvents[index].kind === 'claimed') {
          latestClaimIndex = index
          break
        }
      }
      const latestClaim = latestClaimIndex >= 0 ? alertEvents[latestClaimIndex] : undefined
      if (latestClaim) {
        const resolved = alertEvents.slice(latestClaimIndex + 1).some(event => ['claim_lapsed', 'call_unanswered', 'parent_replied', 'family_confirmed', 'not_taken_recorded'].includes(event.kind))
        if (!resolved && now().getTime() - Date.parse(latestClaim.at) < 20 * 60 * 1000) {
          addToast('info', latestClaim.text)
          return
        }
      }
      const timestamp = now().toISOString()
      const careEvent: CareEvent = {
        id: crypto.randomUUID(),
        at: timestamp,
        kind: 'claimed',
        patientId: current.activePatientId,
        alertId,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        targetId: current.currentUser?.id,
        text: `${current.currentUser?.name ?? 'A family member'} is calling them`,
      }
      const careEvents = [...current.careEvents, careEvent]
      commitModules({ careEvents }, value => ({ ...value, careEvents }), careEvent.text)
    },
    recordCallUnanswered(alertId, nextStep) {
      const current = stateRef.current
      const alert = current.alerts.find(item => item.id === alertId)
      const patient = current.patients.find(item => item.id === current.activePatientId)
      if (!alert || !patient) return
      const timestamp = now().toISOString()
      const careEvent: CareEvent = {
        id: crypto.randomUUID(),
        at: timestamp,
        kind: 'call_unanswered',
        patientId: current.activePatientId,
        alertId,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        text: `${current.currentUser?.name ?? 'A family member'} couldn't reach them`,
      }
      const { firstCallId, backupId } = escalationContacts(current, patient)
      const targetId = nextStep === 'ask_backup'
        ? backupId || firstCallId
        : current.currentUser?.id ?? firstCallId
      const followupTaskId = `ladder-followup-${alertId}`
      const nextTask: CareTask | undefined = nextStep !== 'not_reachable' && targetId ? {
        id: followupTaskId,
        title: nextStep === 'ask_backup' ? `Backup call to ${patient.parentChannel.preferredName}` : `Call ${patient.parentChannel.preferredName} again`,
        patientId: patient.id,
        assigneeId: targetId,
        due: new Date(now().getTime() + (nextStep === 'call_later' ? 30 : 0) * 60 * 1000).toISOString().slice(0, 16),
        priority: 'High',
        status: 'To do',
        response: 'Waiting',
        medicationId: alert.medicationId,
        description: `${alert.medicationName}: the previous call was unanswered.`,
        comments: [],
        history: [],
      } : undefined
      if (nextStep === 'ask_backup' && !backupId) {
        addToast('warning', 'No backup caregiver is available; a task was kept with the first-call caregiver')
      }
      const tasks = nextTask
        ? [nextTask, ...current.tasks.filter(task => task.id !== followupTaskId)]
        : current.tasks.map(task =>
            task.id === `med-followup-${alertId}` || task.id === followupTaskId
              ? { ...task, status: 'Completed' as const }
              : task
          )
      const alerts = nextStep === 'not_reachable'
        ? current.alerts.map(item => item.id === alertId ? { ...item, status: 'Not recorded' as const } : item)
        : current.alerts
      const nextEvent: CareEvent = {
        id: crypto.randomUUID(),
        at: timestamp,
        kind: nextStep === 'not_reachable' ? 'record_corrected' : 'task_assigned',
        patientId: patient.id,
        alertId,
        taskId: nextTask?.id,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        targetId: nextTask?.assigneeId,
        text: nextStep === 'not_reachable'
          ? 'Outcome marked not reachable; no dose outcome was inferred.'
          : nextStep === 'ask_backup' && backupId
            ? 'The backup caregiver was asked to call.'
            : 'A later call task was opened for the first-call caregiver.',
      }
      const careEvents = [...current.careEvents, careEvent, nextEvent]
      commitModules(
        {
          careEvents,
          tasks,
          ...(nextStep === 'not_reachable' ? { alerts: allPatientRecords(current, 'alerts', alerts) } : {}),
        },
        value => ({ ...value, careEvents, tasks, alerts }),
        'Call outcome recorded',
      )
    },
    addReplyToNextAppointment(alertId) {
      const current = stateRef.current
      const reply = [...current.careEvents].reverse().find(event => event.alertId === alertId && event.kind === 'parent_replied' && event.rawText)
      const nextAppointment = current.appointments
        .filter(appointment => appointment.status === 'Upcoming')
        .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))[0]
      const patient = current.patients.find(item => item.id === current.activePatientId)
      if (!reply || !nextAppointment || !patient) {
        addToast('info', 'No upcoming appointment is available for this note')
        return
      }
      const datedQuote = `${new Date(reply.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}: ${patient.parentChannel.preferredName} wrote: "${reply.rawText}"`
      const appointment = {
        ...nextAppointment,
        preparationNotes: [nextAppointment.preparationNotes, datedQuote].filter(Boolean).join('\n\n'),
      }
      const appointments = current.appointments.map(item => item.id === appointment.id ? appointment : item)
      commitModules(
        { appointments: allPatientRecords(current, 'appointments', appointments) },
        value => ({ ...value, appointments }),
        'Reply added to visit preparation notes',
      )
    },
    createRefillTask(alertId) {
      const current = stateRef.current
      const alert = current.alerts.find(item => item.id === alertId)
      const patient = current.patients.find(item => item.id === current.activePatientId)
      const reply = [...current.careEvents].reverse().find(event => event.alertId === alertId && event.kind === 'parent_replied' && (event.replyCategory === 'supply' || current.careEvents.some(proposal => proposal.kind === 'reply_interpreted' && proposal.relatedEventId === event.id && proposal.interpretation?.source === 'assistant' && proposal.interpretation.category === 'supply')))
      if (!alert || !patient || !reply) return
      const firstActiveMember = current.members.find(member => member.status === 'Active')
      const assigneeId = current.preferences.firstCallMemberId || firstActiveMember?.userId || firstActiveMember?.id || current.currentUser?.id || ''
      const id = `refill-${alert.id}`
      if (current.tasks.some(task => task.id === id)) {
        addToast('info', 'A refill task already exists for this reminder')
        return
      }
      const task: CareTask = {
        id,
        title: `Refill ${alert.medicationName}`,
        patientId: patient.id,
        medicationId: alert.medicationId,
        assigneeId,
        due: `${localDateKey(now())}T17:00`,
        priority: 'High',
        status: 'To do',
        response: 'Waiting',
        description: `${patient.parentChannel.preferredName} wrote: "${reply.rawText}"`,
        comments: [],
        history: [],
      }
      const tasks = [task, ...current.tasks]
      const assignee = current.members.find(member => (member.userId ?? member.id) === assigneeId)
      const event: CareEvent | undefined = assigneeId ? {
        id: crypto.randomUUID(), at: now().toISOString(), kind: 'task_assigned', patientId: patient.id, taskId: task.id,
        actorType: 'member', actorId: current.currentUser?.id ?? '', targetId: assigneeId,
        text: `${assignee?.name ?? 'A circle member'} was assigned ${task.title}. Waiting for a reply.`,
      } : undefined
      const careEvents = event ? [...current.careEvents, event] : current.careEvents
      commitModules({ tasks, ...(event ? { careEvents } : {}) }, value => ({ ...value, tasks, careEvents }), 'Refill task created')
    },
    showConfirm(config) { setState(current => ({ ...current, confirmConfig: config })) },
    closeConfirm() { setState(current => ({ ...current, confirmConfig: null })) },
    addToast,
    removeToast(id) { setState(current => ({ ...current, toasts: current.toasts.filter(toast => toast.id !== id) })) },
    resetDemo() {
      if (stateRef.current.isSample) {
        setState(current => applyCircle({ ...emptyState(true), currentUser: current.currentUser, accountProfile: current.accountProfile, isLoading: false, isSample: true }, buildSampleCircle(now())))
        addToast('info', 'Sample reset')
        return
      }
      loadCircle(stateRef.current.activeCircleId).then(() => addToast('info', 'Reloaded server records; nothing was deleted')).catch(error => addToast('error', error.message))
    },
    savePatient(patient) {
      const current = stateRef.current
      const patients = current.patients.some(item => item.id === patient.id) ? current.patients.map(item => item.id === patient.id ? patient : item) : [...current.patients, patient]
      commitModules({ patients }, value => ({ ...value, patients }), 'Patient saved')
    },
    sendParentConsent(patientId) {
      const current = stateRef.current
      if (current.activeCircleRole !== 'coordinator') {
        addToast('warning', 'Only the coordinator can send a consent message')
        return
      }
      const patient = current.patients.find(item => item.id === patientId)
      if (!patient) return
      const timestamp = now().toISOString()
      const patients = current.patients.map(item => item.id === patientId ? {
        ...item,
        parentChannel: {
          ...item.parentChannel,
          paused: true,
          lastAskedQuestion: 'reminders' as const,
          aiDisclosed: Boolean(item.parentChannel.aiReading),
          reminders: { status: 'Asked' as const, changedAt: timestamp, via: 'Recorded by family' as const },
        },
      } : item)
      const event: TimelineEvent = {
        id: crypto.randomUUID(), patientId, type: 'note', title: 'Simulated consent request',
        description: `A reminders consent question was recorded for the prototype. No message was sent to ${patient.parentChannel.preferredName}.`,
        timestamp, actor: current.currentUser?.name ?? '', actorId: current.currentUser?.id ?? '', comments: [],
      }
      const timeline = [event, ...current.timeline]
      const careEvent: CareEvent = {
        id: crypto.randomUUID(), at: timestamp, kind: 'consent_changed', patientId,
        actorType: 'member', actorId: current.currentUser?.id ?? '',
        parentText: parentConsentMessages(
          patient.parentChannel.language,
          patient.preferredName || patient.name,
          current.members.filter(member => member.status === 'Active').map(member => member.name),
          Boolean(patient.parentChannel.aiReading),
        ).reminders,
        text: `${current.currentUser?.name ?? 'A family member'} recorded a simulated reminders consent request. No message was sent.`,
      }
      const careEvents = [...current.careEvents, careEvent]
      commitModules(
        { patients, timeline: allPatientRecords(current, 'timeline', timeline), careEvents },
        value => ({ ...value, patients, timeline, careEvents }),
        'Simulated consent request recorded; no message sent',
      )
    },
    sendSharingConsent(patientId) {
      const current = stateRef.current
      if (current.activeCircleRole !== 'coordinator') {
        addToast('warning', 'Only the coordinator can send a consent message')
        return
      }
      const patient = current.patients.find(item => item.id === patientId)
      if (!patient || patient.parentChannel.reminders.status !== 'Agreed') {
        addToast('warning', 'Ask about sharing only after the parent agrees to reminders')
        return
      }
      const timestamp = now().toISOString()
      const patients = current.patients.map(item => item.id === patientId ? {
        ...item,
        parentChannel: {
          ...item.parentChannel,
          lastAskedQuestion: 'sharing' as const,
          sharing: { ...item.parentChannel.sharing, status: 'Asked' as const, changedAt: timestamp, via: 'Recorded by family' as const, sharedWith: [] },
        },
      } : item)
      const message = parentConsentMessages(
        patient.parentChannel.language,
        patient.preferredName || patient.name,
        current.members.filter(member => member.status === 'Active').map(member => member.name),
      ).sharing
      const careEvent: CareEvent = {
        id: crypto.randomUUID(),
        at: timestamp,
        kind: 'consent_changed',
        patientId,
        actorType: 'member',
        actorId: current.currentUser?.id ?? '',
        parentText: message,
        text: `${current.currentUser?.name ?? 'A family member'} recorded a simulated reply-sharing consent request. No message was sent.`,
      }
      const careEvents = [...current.careEvents, careEvent]
      commitModules(
        { patients, careEvents },
        value => ({ ...value, patients, careEvents }),
        'Simulated sharing request recorded; no message sent',
      )
    },
    simulateParentConsent(patientId, response) {
      const current = stateRef.current
      if (current.activeCircleRole !== 'coordinator') {
        addToast('warning', 'Only the coordinator can use parent-consent prototype controls')
        return
      }
      const patient = current.patients.find(item => item.id === patientId)
      if (!patient) return
      if (response !== 'stop' && !patient.parentChannel.lastAskedQuestion) {
        addToast('warning', `Send the consent question before recording ${patient.parentChannel.preferredName}'s reply`)
        return
      }
      actions.ingestParentReply(undefined, response === 'agrees' ? 'YES' : response === 'declines' ? 'NO' : 'STOP')
    },
    archivePatient(patientId) {
      const current = stateRef.current
      const patients = current.patients.map(patient => patient.id === patientId ? { ...patient, archived: true } : patient)
      commitModules({ patients }, value => ({ ...value, patients }), 'Patient archived')
    },
    restorePatient(patientId) {
      const current = stateRef.current
      const patients = current.patients.map(patient => patient.id === patientId ? { ...patient, archived: false } : patient)
      commitModules({ patients }, value => ({ ...value, patients }), 'Patient restored')
    },
    saveTask(task) {
      const current = stateRef.current
      const existing = current.tasks.find(item => item.id === task.id)
      const assignmentChanged = !existing || existing.assigneeId !== task.assigneeId
      const savedTask: CareTask = assignmentChanged
        ? { ...task, response: 'Waiting', respondedAt: undefined, declineReason: undefined }
        : normalizeTask(task)
      const tasks = existing ? current.tasks.map(item => item.id === task.id ? savedTask : item) : [savedTask, ...current.tasks]
      const timestamp = now().toISOString()
      const events: CareEvent[] = []
      if (assignmentChanged && savedTask.assigneeId) {
        const assignee = current.members.find(member => (member.userId ?? member.id) === savedTask.assigneeId)
        events.push({
          id: crypto.randomUUID(), at: timestamp, kind: 'task_assigned', patientId: savedTask.patientId, taskId: savedTask.id,
          actorType: 'member', actorId: current.currentUser?.id ?? '', targetId: savedTask.assigneeId,
          text: `${assignee?.name ?? 'A circle member'} was assigned ${savedTask.title}. Waiting for a reply.`,
        })
      }
      if (existing?.status !== 'Completed' && savedTask.status === 'Completed') {
        events.push({
          id: crypto.randomUUID(), at: timestamp, kind: 'task_completed', patientId: savedTask.patientId, taskId: savedTask.id,
          actorType: 'member', actorId: current.currentUser?.id ?? '',
          text: `${current.currentUser?.name ?? 'A circle member'} completed ${savedTask.title}.`,
        })
      }
      const careEvents = [...current.careEvents, ...events]
      commitModules({ tasks, careEvents }, value => ({ ...value, tasks, careEvents }), 'Task saved')
    },
    takeTask(taskId) {
      const current = stateRef.current
      const task = current.tasks.find(item => item.id === taskId)
      if (!task || task.status === 'Completed' || task.assigneeId || current.activeCircleRole === 'view-only' || !current.currentUser) return
      const timestamp = now().toISOString()
      const updated = { ...task, assigneeId: current.currentUser.id, response: 'Accepted' as const, respondedAt: timestamp, declineReason: undefined }
      const tasks = current.tasks.map(item => item.id === taskId ? updated : item)
      const event: CareEvent = {
        id: crypto.randomUUID(), at: timestamp, kind: 'task_taken', patientId: task.patientId, taskId,
        actorType: 'member', actorId: current.currentUser.id, targetId: current.currentUser.id,
        text: `${current.currentUser.name} took ${task.title}.`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ tasks, careEvents }, value => ({ ...value, tasks, careEvents }), `${current.currentUser.name} took the task`)
    },
    respondToTask(taskId, response, reason) {
      const current = stateRef.current
      const task = current.tasks.find(item => item.id === taskId)
      if (!task || !current.currentUser || (task.assigneeId && task.assigneeId !== current.currentUser.id) || task.response !== 'Waiting') return
      const timestamp = now().toISOString()
      const actorName = current.currentUser?.name ?? 'A circle member'
      const accepted = response === 'Accepted'
      const updated: CareTask = accepted
        ? { ...task, assigneeId: task.assigneeId || current.currentUser.id, response: 'Accepted', respondedAt: timestamp, declineReason: undefined }
        : { ...task, assigneeId: '', response: 'Declined', respondedAt: timestamp, declineReason: reason?.trim() || undefined, status: 'To do' }
      const tasks = current.tasks.map(item => item.id === taskId ? updated : item)
      const coordinator = current.members.find(member => member.status === 'Active' && member.role === 'coordinator')
      const event: CareEvent = {
        id: crypto.randomUUID(), at: timestamp, kind: accepted ? 'task_accepted' : 'task_declined',
        patientId: task.patientId, taskId, actorType: 'member', actorId: current.currentUser?.id ?? '',
        targetId: accepted ? undefined : coordinator?.userId ?? coordinator?.id,
        text: accepted
          ? `${actorName} accepted ${task.title}.`
          : `${actorName} can't do this${reason?.trim() ? `: ${reason.trim()}` : '.'}`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ tasks, careEvents }, value => ({ ...value, tasks, careEvents }), accepted ? `${actorName} accepted` : `${actorName} declined`)
    },
    completeTask(taskId, note) {
      const current = stateRef.current
      const task = current.tasks.find(item => item.id === taskId)
      const canComplete = task && current.currentUser && current.activeCircleRole !== 'view-only' && (current.activeCircleRole === 'coordinator' || task.assigneeId === current.currentUser.id)
      if (!task || !canComplete || task.status === 'Completed') return
      const update = note?.trim() ?? ''
      if (update.length > 300) {
        addToast('warning', 'Keep the completion update to 300 characters or fewer')
        return
      }
      const timestamp = now().toISOString()
      const actorName = current.currentUser?.name ?? 'A circle member'
      const updated: CareTask = { ...task, status: 'Completed', response: 'Accepted', respondedAt: task.respondedAt ?? timestamp }
      const tasks = current.tasks.map(item => item.id === taskId ? updated : item)
      const event: CareEvent = {
        id: crypto.randomUUID(), at: timestamp, kind: 'task_completed', patientId: task.patientId, taskId,
        actorType: 'member', actorId: current.currentUser?.id ?? '', text: `${actorName} completed ${task.title}.${update ? ` Update: ${update}` : ''}`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ tasks, careEvents }, value => ({ ...value, tasks, careEvents }), `${actorName} completed the task`)
    },
    addHealthEntry(entry) {
      const current = stateRef.current
      const healthEntries = [entry, ...current.healthEntries]
      commitModules({ healthEntries }, value => ({ ...value, healthEntries }), 'Health entry saved')
    },
    addCareNote(text) {
      const current = stateRef.current
      const event: TimelineEvent = { id: crypto.randomUUID(), patientId: current.activePatientId, type: 'note', title: 'Care note added', description: text, timestamp: now().toISOString(), actor: current.currentUser?.name ?? '', actorId: current.currentUser?.id ?? '', comments: [] }
      const timeline = [event, ...current.timeline]
      commitModules({ timeline: allPatientRecords(current, 'timeline', timeline) }, value => ({ ...value, timeline }), 'Care note added')
    },
    addTimelineComment(eventId, text) {
      const current = stateRef.current
      const comment: RecordComment = { id: crypto.randomUUID(), author: current.currentUser?.name ?? '', authorId: current.currentUser?.id ?? '', text, timestamp: now().toISOString() }
      const timeline = current.timeline.map(event => event.id === eventId ? { ...event, comments: [...(event.comments ?? []), comment] } : event)
      commitModules({ timeline: allPatientRecords(current, 'timeline', timeline) }, value => ({ ...value, timeline }), 'Comment saved')
    },
    openLinkedRecord(event) {
      if (event.relatedType === 'medicine') setState(current => ({ ...current, view: 'medicines', medicineDetailId: event.relatedId ?? null }))
      if (event.relatedType === 'appointment') setState(current => ({ ...current, view: 'appointments', appointmentDetailId: event.relatedId ?? null }))
      if (event.relatedType === 'document') setState(current => ({ ...current, view: 'documents', documentDetailId: event.relatedId ?? null }))
      if (event.relatedType === 'task') setState(current => ({ ...current, view: 'tasks' }))
    },
    markNotification(id) {
      const current = stateRef.current
      if (!current.currentUser) return
      const eventIds = Array.isArray(id) ? id : id ? [id] : []
      const existing = new Set(current.notifications.filter(item => item.userId === current.currentUser?.id).map(item => item.eventId))
      const additions = eventIds.filter(eventId => !existing.has(eventId)).map(eventId => ({ eventId, userId: current.currentUser!.id }))
      if (!additions.length) return
      const notifications = [...current.notifications, ...additions]
      commitModules({ notifications }, value => ({ ...value, notifications }), 'Notifications updated')
    },
    saveMedication(medication) {
      const current = stateRef.current
      const existing = current.medications.find(item => item.id === medication.id)
      const saved = normalizeMedication(medication)
      const medications = existing ? current.medications.map(item => item.id === saved.id ? saved : item) : [saved, ...current.medications]
      const changed = existing && (existing.dose !== saved.dose || existing.scheduleTime !== saved.scheduleTime || (existing.status ?? 'Active') !== saved.status)
      const newPhoto = Boolean(existing && saved.photos?.[0] && saved.photos[0].id !== existing.photos?.[0]?.id)
      const changedFields: CareEvent['changedFields'] = existing ? [
        ...(existing.dose !== saved.dose ? ['dose' as const] : []),
        ...(existing.scheduleTime !== saved.scheduleTime ? ['scheduleTime' as const] : []),
        ...((existing.status ?? 'Active') !== saved.status ? ['status' as const] : []),
      ] : []
      const careEvent: CareEvent | undefined = changed ? {
        id: crypto.randomUUID(), at: newPhoto ? saved.photos![0].savedAt : now().toISOString(), kind: 'medicine_changed', patientId: current.activePatientId,
        medicationId: saved.id, actorType: 'member', actorId: current.currentUser?.id ?? '',
        changedFields,
        text: existing.dose !== saved.dose && existing.scheduleTime === saved.scheduleTime && (existing.status ?? 'Active') === saved.status
          ? `${saved.name} changed from ${displayDose(existing.dose)} to ${displayDose(saved.dose)} by ${current.currentUser?.name ?? 'a family member'}`
          : `${saved.name} changed from ${displayDose(existing.dose)} at ${friendlyScheduleTime(existing.scheduleTime)} (${existing.status ?? 'Active'}) to ${displayDose(saved.dose)} at ${friendlyScheduleTime(saved.scheduleTime)} (${saved.status}) by ${current.currentUser?.name ?? 'a family member'}`,
        parentText: `Your family updated your medicines: ${saved.name} is now ${displayDose(saved.dose)} at ${friendlyScheduleTime(saved.scheduleTime)}. If this does not match what your doctor told you, please tell your family.`,
      } : undefined
      const careEvents = careEvent ? [...current.careEvents, careEvent] : current.careEvents
      commitModules({ medications: allPatientRecords(current, 'medications', medications), ...(careEvent ? { careEvents } : {}) }, value => ({ ...value, medications, careEvents }), 'Medicine schedule saved')
    },
    stopMedication(id) {
      const current = stateRef.current
      const medication = current.medications.find(item => item.id === id)
      if (!medication || medication.status === 'Stopped') return
      const stopped = { ...medication, status: 'Stopped' as const }
      const medications = current.medications.map(item => item.id === id ? stopped : item)
      const event: CareEvent = {
        id: crypto.randomUUID(), at: now().toISOString(), kind: 'medicine_changed', patientId: current.activePatientId,
        medicationId: id, actorType: 'member', actorId: current.currentUser?.id ?? '',
        changedFields: ['status'],
        text: `${medication.name} changed from Active to Stopped by ${current.currentUser?.name ?? 'a family member'}`,
        parentText: `Your family updated your medicines: ${medication.name} is now stopped. If this does not match what your doctor told you, please tell your family.`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ medications: allPatientRecords(current, 'medications', medications), careEvents }, value => ({ ...value, medications, careEvents }), 'Medicine stopped; history retained')
    },
    replenishMedication(id, amount) {
      const current = stateRef.current
      const medications = current.medications.map(item => item.id === id ? { ...item, stock: item.stock + amount } : item)
      const medicineName = current.medications.find(item => item.id === id)?.name
      const refillTaskIds = new Set(current.careEvents.filter(event => event.kind === 'refill_needed' && event.patientId === current.activePatientId && event.medicationId === id && event.taskId).map(event => event.taskId))
      const refillTasks = current.tasks.filter(task => task.patientId === current.activePatientId && task.status !== 'Completed' && (refillTaskIds.has(task.id) || task.title === `Refill ${medicineName}`))
      const tasks = current.tasks.map(task => refillTasks.some(item => item.id === task.id) ? { ...task, status: 'Completed' as const, response: 'Accepted' as const } : task)
      const event: CareEvent = {
        id: crypto.randomUUID(), at: now().toISOString(), kind: 'refill_done', patientId: current.activePatientId,
        medicationId: id, actorType: 'member', actorId: current.currentUser?.id ?? '',
        text: `${current.currentUser?.name ?? 'A circle member'} replenished ${medicineName ?? 'medicine'} stock.`,
      }
      const careEvents = [...current.careEvents, event]
      commitModules({ medications: allPatientRecords(current, 'medications', medications), tasks, careEvents }, value => ({ ...value, medications, tasks, careEvents }), 'Stock replenished')
    },
    saveAppointment(appointment) {
      const current = stateRef.current
      const appointments = current.appointments.some(item => item.id === appointment.id) ? current.appointments.map(item => item.id === appointment.id ? appointment : item) : [appointment, ...current.appointments]
      commitModules({ appointments: allPatientRecords(current, 'appointments', appointments) }, value => ({ ...value, appointments }), 'Appointment saved')
    },
    addDigestToVisitNotes(digestEventId) {
      const current = stateRef.current
      const digestEvent = current.careEvents.find(event => event.id === digestEventId && event.kind === 'weekly_digest')
      if (!digestEvent) return
      const digest = buildWeeklyDigest(current, digestEvent)
      if (!digest.questions.length) return
      const nextAppointment = current.appointments
        .filter(appointment => appointment.status !== 'Cancelled' && appointment.status !== 'Completed' && Date.parse(appointment.datetime) > now().getTime())
        .sort((a, b) => Date.parse(a.datetime) - Date.parse(b.datetime))[0]
      if (!nextAppointment) {
        addToast('info', 'No upcoming appointment is available')
        return
      }
      const section = `Questions from weekly digest:\n${digest.questions.map(question => `• ${question}`).join('\n')}`
      const appointments = current.appointments.map(appointment => appointment.id === nextAppointment.id ? {
        ...appointment,
        preparationNotes: [appointment.preparationNotes, section].filter(Boolean).join('\n\n'),
      } : appointment)
      commitModules(
        { appointments: allPatientRecords(current, 'appointments', appointments) },
        value => ({ ...value, appointments }),
        `Added ${digest.questions.length} items to ${nextAppointment.type} notes`,
      )
    },
    addDocument(document) {
      const current = stateRef.current
      const documents = [document, ...current.documents]
      commitModules({ documents: { upserts: [{ ...document, patientId: current.activePatientId }], removedIds: [] } }, value => ({ ...value, documents }), 'Document saved')
    },
    updateDocument(document) {
      const current = stateRef.current
      const documents = current.documents.map(item => item.id === document.id ? document : item)
      commitModules({ documents: { upserts: [{ ...document, patientId: document.patientId ?? current.activePatientId }], removedIds: [] } }, value => ({ ...value, documents }), 'Document updated')
    },
    async saveMember(member) {
      if (stateRef.current.isSample) {
        const current = stateRef.current
        const members = current.members.some(item => item.id === member.id)
          ? current.members.map(item => item.id === member.id ? member : item)
          : [...current.members, member]
        await commitModules({ members }, value => ({ ...value, members }), member.userId ? 'Member role saved' : 'Invitation created')
        return
      }
      try {
        if (member.status === 'Invited' && !member.userId) {
          const result = await api<any>(`/circles/${stateRef.current.activeCircleId}/invites`, { method: 'POST', body: JSON.stringify(member) })
          addToast('info', `Share ${window.location.origin}${result.shareablePath}; no email was sent.`)
        } else if (member.userId) {
          await api(`/circles/${stateRef.current.activeCircleId}/members/${member.userId}`, { method: 'PUT', body: JSON.stringify(member) })
          addToast('success', 'Member role saved')
        }
        await loadCircle(stateRef.current.activeCircleId)
      } catch (error) { addToast('error', error instanceof Error ? error.message : 'Member update failed') }
    },
    async updateInvitation(id, status) {
      const member = stateRef.current.members.find(item => item.id === id) as any
      if (!member?.inviteToken) return
      try {
        if (status === 'Cancelled') await api(`/invites/${member.inviteToken}`, { method: 'DELETE' })
        else if (status === 'Invited') {
          const result = await api<any>(`/circles/${stateRef.current.activeCircleId}/invites`, { method: 'POST', body: JSON.stringify(member) })
          addToast('info', `New shareable link: ${window.location.origin}${result.shareablePath}`)
        }
        await loadCircle(stateRef.current.activeCircleId)
      } catch (error) { addToast('error', error instanceof Error ? error.message : 'Invitation update failed') }
    },
    async removeMember(id) {
      const member = stateRef.current.members.find(item => item.id === id)
      
      if (!member?.userId) return
      try {
        await api(`/circles/${stateRef.current.activeCircleId}/members/${member.userId}`, { method: 'DELETE' })
        await loadCircle(stateRef.current.activeCircleId)
        addToast('success', 'Member removed')
      } catch (error) { addToast('error', error instanceof Error ? error.message : 'Member removal failed') }
    },
    async transferOwnership(memberId) {
      const current = stateRef.current
      const target = current.members.find(item => item.id === memberId)
      const self = current.members.find(item => item.userId === current.currentUser?.id)
      if (!target?.userId || !self?.userId) return
      try {
        await api(`/circles/${current.activeCircleId}/members/${target.userId}`, { method: 'PUT', body: JSON.stringify({ role: 'coordinator', caregiverType: target.caregiverType }) })
        await api(`/circles/${current.activeCircleId}/members/${self.userId}`, { method: 'PUT', body: JSON.stringify({ role: 'caregiver', caregiverType: self.caregiverType }) })
        await loadCircle(current.activeCircleId)
        addToast('success', 'Ownership transferred')
      } catch (error) { addToast('error', error instanceof Error ? error.message : 'Ownership transfer failed') }
    },
    async savePreferences(preferences) {
      try {
        await api('/account', { method: 'PUT', body: JSON.stringify({ profile: stateRef.current.accountProfile, settings: preferences }) })
        setState(current => ({ ...current, preferences }))
        addToast('success', 'Preferences saved')
      } catch (error) { setState(current => ({ ...current, commitError: { modules: {}, message: 'Preferences saved', failedAt: new Date().toISOString(), account: { profile: stateRef.current.accountProfile, settings: preferences } } })); addToast('error', error instanceof Error ? error.message : 'Settings save failed') }
    },
    async renameCircle(name) {
      try {
        await api(`/circles/${stateRef.current.activeCircleId}`, { method: 'PUT', body: JSON.stringify({ name }) })
        setState(current => ({ ...current, circleName: name, circles: { ...current.circles, [current.activeCircleId]: { ...current.circles[current.activeCircleId], name } } }))
        addToast('success', 'Circle name saved')
      } catch (error) { addToast('error', error instanceof Error ? error.message : 'Circle update failed') }
    },
    async saveAccountProfile(profile) {
      try {
        await api('/account', { method: 'PUT', body: JSON.stringify({ profile, settings: stateRef.current.preferences }) })
        await supabase.auth.updateUser({ data: { name: profile.name } })
        setState(current => ({ ...current, accountProfile: profile, currentUser: current.currentUser ? { ...current.currentUser, name: profile.name, phone: profile.phone } : null }))
        addToast('success', 'Account saved')
      } catch (error) { addToast('error', error instanceof Error ? error.message : 'Account save failed') }
    },
    async retryCommit() {
      const failed = stateRef.current.commitError
      if (!failed) return
      if (failed.account) { const account = failed.account; try { await api('/account', { method: 'PUT', body: JSON.stringify(account) }); setState(current => ({ ...current, preferences: account.settings, accountProfile: account.profile, commitError: null })); addToast('success', failed.message) } catch (error) { addToast('error', error instanceof Error ? error.message : 'Retry failed') } return }
      if (stateRef.current.isSample) {
        setState(current => ({ ...current, commitError: null }))
        return
      }
      try {
        await api(`/circles/${stateRef.current.activeCircleId}/commit`, {
          method: 'PUT',
          body: JSON.stringify({ modules: failed.modules }),
        })
        await loadCircle(stateRef.current.activeCircleId)
        setState(current => ({ ...current, commitError: null }))
        addToast('success', failed.message)
      } catch (error) {
        setState(current => ({ ...current, commitError: { ...failed, failedAt: new Date().toISOString() } }))
        addToast('error', error instanceof Error ? error.message : 'Retry failed')
      }
    },
    async retryLoad() {
      const { data } = await supabase.auth.getUser()
      if (data.user) await loadAccount(data.user, stateRef.current.activeCircleId)
    },
  }

  return <AppContext.Provider value={{ state, actions, now }}>{children}</AppContext.Provider>
}
