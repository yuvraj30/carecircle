export type UserRole = 'coordinator' | 'caregiver'
export type CircleRole = 'coordinator' | 'caregiver' | 'view-only'
export type AlertStatus = 'Unconfirmed' | 'Assigned' | 'In Progress' | 'Confirmed' | 'Missed' | 'Not recorded'
export type ConsentStatus = 'Not asked' | 'Asked' | 'Agreed' | 'Declined' | 'Withdrawn'
export type ConsentVia = 'WhatsApp reply' | 'Recorded by family'
export type CareEventKind =
  | 'reminder_sent'
  | 'followup_sent'
  | 'parent_replied'
  | 'family_confirmed'
  | 'not_taken_recorded'
  | 'consent_changed'
  | 'escalated'
  | 'claimed'
  | 'claim_lapsed'
  | 'call_unanswered'
  | 'task_assigned'
  | 'task_accepted'
  | 'task_declined'
  | 'task_taken'
  | 'task_completed'
  | 'refill_needed'
  | 'refill_done'
  | 'member_added'
  | 'medicine_changed'
  | 'appointment_reminder'
  | 'parent_medicine_photo'
  | 'medicine_photo_judgement'
  | 'weekly_digest'
  | 'reply_interpreted'
  | 'record_corrected'
  | 'thanks_sent'
export type ParentReplyCategory = 'taken' | 'not_taken' | 'later' | 'supply' | 'felt_unwell' | 'other' | 'stop' | 'pause' | 'who' | 'stop_sharing'
export type View =
  | 'today'
  | 'profile'
  | 'tasks'
  | 'medicines'
  | 'appointments'
  | 'health'
  | 'documents'
  | 'timeline'
  | 'circle'
  | 'notifications'
  | 'digest'
  | 'account'
  | 'settings'
  | 'help'
export type TimelineFilter = 'all' | 'medication' | 'appointment' | 'task' | 'document' | 'note'

export interface User {
  id: string
  name: string
  role: UserRole
  relation: string
  initials: string
  color: string
  phone?: string
  city?: string
}

export interface Patient {
  id: string
  name: string
  age: number
  initials: string
  conditions: string[]
  bloodType: string
  primaryDoctor: string
  address: string
  accentColor: string
  dob: string
  preferredName: string
  relationship: string
  primaryCaregiverId: string
  medicalHistory: string
  allergies: string
  doctors: DoctorContact[]
  emergencyContacts: EmergencyContact[]
  preferredHospital: string
  emergencyInstructions: string
  diet: string
  mobility: string
  communication: string
  routine: string
  parentChannel: ParentChannel
  archived?: boolean
}

export interface ParentConsent {
  status: ConsentStatus
  changedAt: string
  via: ConsentVia
}

export interface ParentChannel {
  whatsappNumber: string
  language: 'English' | 'Hindi'
  preferredName: string
  quietHours: { start: string; end: string }
  paused: boolean
  pausedUntil?: string
  reminders: ParentConsent
  sharing: ParentConsent & { sharedWith: string[] }
  lastAskedQuestion?: 'reminders' | 'sharing'
  aiReading?: boolean
  aiDisclosed?: boolean
  familyNote?: string
}

export interface DoctorContact {
  id: string
  name: string
  specialty: string
  clinic: string
  contact: string
}

export interface EmergencyContact {
  id: string
  name: string
  relationship: string
  phone: string
}

export interface MedicationAlert {
  id: string
  medicationId: string
  medicationName: string
  dose: string
  scheduledTime: string
  scheduledDate: string
  status: AlertStatus
  assignedTo?: string
  confirmedBy?: string
  confirmedAt?: string
  source: string
  createdAt: string
  notes?: string
  patientId?: string
}

export interface Medication {
  id: string
  name: string
  dose: string
  frequency: string
  prescribingDoctor: string
  condition: string
  startDate: string
  notes: string
  accentColor: string
  endDate?: string
  scheduleTime: string
  stock: number
  refillThreshold: number
  status?: 'Active' | 'Stopped'
  photos?: MedicationPhoto[]
  appearance?: string
  patientId?: string
}

export interface MedicationPhoto {
  id: string
  storagePath?: string
  dataUrl?: string
  savedBy: string
  savedAt: string
}

export interface Appointment {
  id: string
  type: string
  doctor: string
  specialty: string
  location: string
  datetime: string
  status: 'Upcoming' | 'Confirmed' | 'Completed' | 'Cancelled'
  notes?: string
  preparationNotes?: string
  reminder?: string
  preparationComplete?: boolean
  visitNotes?: { id: string; text: string; author: string; timestamp: string; documentId?: string }[]
  patientId?: string
}

export interface Document {
  id: string
  name: string
  category: 'Prescription' | 'Lab Report' | 'Insurance' | 'Other'
  uploadedAt: string
  uploadedBy: string
  fileType: string
  size: string
  description: string
  access?: 'All members' | 'Coordinators only' | 'Caregivers and coordinators'
  linkedType?: 'medicine' | 'appointment'
  linkedId?: string
  sampleContent?: string
  localFileName?: string
  storagePath?: string
  patientId?: string
}

export interface RecordComment {
  id: string
  author: string
  authorId: string
  text: string
  timestamp: string
}

export interface TimelineEvent {
  id: string
  type: 'medication' | 'appointment' | 'task' | 'document' | 'note'
  title: string
  description: string
  timestamp: string
  actor: string
  actorId: string
  status?: AlertStatus
  relatedId?: string
  relatedType?: 'medicine' | 'appointment' | 'document' | 'task'
  comments?: RecordComment[]
  patientId?: string
}

export interface CareTask {
  id: string
  title: string
  patientId: string
  assigneeId: string
  due: string
  priority: 'Low' | 'Medium' | 'High'
  status: 'To do' | 'In progress' | 'Completed'
  response: 'Waiting' | 'Accepted' | 'Declined'
  respondedAt?: string
  declineReason?: string
  medicationId?: string
  description: string
  comments: { id: string; author: string; text: string; timestamp: string }[]
  history?: { id: string; status: string; actor: string; timestamp: string }[]
}

export interface HealthEntry {
  id: string
  patientId: string
  type: 'Blood pressure' | 'Glucose' | 'Weight' | 'Symptoms' | 'Wellbeing'
  value: string
  unit: string
  timestamp: string
  notes: string
}

export interface AppNotification {
  id: string
  type: 'task' | 'medicine' | 'appointment' | 'invitation'
  title: string
  detail: string
  timestamp: string
  read: boolean
  target: View
}

export interface PatientData {
  alerts: MedicationAlert[]
  medications: Medication[]
  appointments: Appointment[]
  documents: Document[]
  timeline: TimelineEvent[]
}

export interface CircleMember {
  id: string
  userId?: string
  name: string
  email: string
  relationship: string
  role: CircleRole
  status: 'Active' | 'Invited' | 'Declined' | 'Cancelled'
  inviteToken?: string
  expiresAt?: string
  caregiverType?: 'Primary' | 'Backup'
  initials: string
  color: string
}

export interface ActivityItem {
  id: string
  actor: string
  action: string
  timestamp: string
}

export interface CareEvent {
  id: string
  at: string
  kind: CareEventKind
  patientId: string
  alertId?: string
  taskId?: string
  medicationId?: string
  appointmentId?: string
  memberId?: string
  actorType: 'parent' | 'member' | 'system'
  actorId: string
  targetId?: string
  rawText?: string
  replyCategory?: ParentReplyCategory
  parentText?: string
  photoId?: string
  photoDataUrl?: string
  relatedEventId?: string
  judgement?: 'same' | 'different'
  changedFields?: ('dose' | 'scheduleTime' | 'status')[]
  consentResponse?: 'agrees' | 'declines' | 'stop'
  coveredEventIds?: string[]
  recipientIds?: string[]
  interpretation?: {
    category: ParentReplyCategory
    summary: string
    confidence: number
    source: string
  }
  text: string
}

export interface CircleData {
  id: string
  name: string
  role: CircleRole
  patients: Patient[]
  activePatientId: string
  patientDataStore: Record<string, PatientData>
  tasks: CareTask[]
  healthEntries: HealthEntry[]
  notifications: EventReadReceipt[]
  members: CircleMember[]
  activity: ActivityItem[]
  careEvents: CareEvent[]
}

export interface DemoPreferences {
  medicineReminders: boolean
  taskUpdates: boolean
  quietHours: boolean
  quietStart: string
  quietEnd: string
  followUpAfter: number
  firstCallAfter: number
  backupAfter: number
  firstCallMemberId: string
  backupMemberId: string
  weeklyDigestEnabled: boolean
  weeklyDigestDay: number
  weeklyDigestTime: string
  awayUntil: Record<string, string>
}

export interface CommitError {
  modules: Record<string, unknown>
  message: string
  failedAt: string
  account?: { profile: { name: string; phone: string }; settings: DemoPreferences }
}

export interface EventReadReceipt {
  eventId: string
  userId: string
}

export interface Toast {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
}

export interface ConfirmConfig {
  title: string
  message: string
  onConfirm: () => void
  confirmLabel?: string
  variant?: 'danger' | 'primary'
}

export interface AppState {
  currentUser: User | null
  demoUsers: (User & { email: string })[]
  pendingSignupId: string | null
  authTargetCircleId: string | null
  activeCircleId: string
  activeCircleRole: CircleRole
  circles: Record<string, CircleData>
  circleName: string
  members: CircleMember[]
  activity: ActivityItem[]
  preferences: DemoPreferences
  accountProfile: { name: string; phone: string }
  activePatientId: string
  patients: Patient[]
  patientDataStore: Record<string, PatientData>
  // Mirrored from patientDataStore[activePatientId] for easy access
  alerts: MedicationAlert[]
  medications: Medication[]
  appointments: Appointment[]
  documents: Document[]
  timeline: TimelineEvent[]
  careEvents: CareEvent[]
  tasks: CareTask[]
  healthEntries: HealthEntry[]
  notifications: EventReadReceipt[]
  toasts: Toast[]
  view: View
  alertDetailId: string | null
  medicineDetailId: string | null
  appointmentDetailId: string | null
  documentDetailId: string | null
  confirmConfig: ConfirmConfig | null
  phonePaneOpen: boolean
  dismissedFirstReplyPatientIds: string[]
  isLoading: boolean
  commitError: CommitError | null
  sessionExpired: boolean
  isSample: boolean
}
