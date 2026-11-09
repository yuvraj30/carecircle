import { useEffect, useRef } from 'react'
import { useApp } from '../context'
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon } from './icons'

export function ConfirmModal() {
  const { state, actions } = useApp()
  const { confirmConfig } = state
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.closeConfirm() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!confirmConfig) return null

  const isDanger = confirmConfig.variant === 'danger'
  const Icon = isDanger ? ExclamationTriangleIcon : CheckCircleIcon

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={actions.closeConfirm}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 z-10">
        {/* Close */}
        <button
          onClick={actions.closeConfirm}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          aria-label="Cancel"
        >
          <XMarkIcon className="w-4.5 h-4.5" />
        </button>

        {/* Icon */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: isDanger ? '#FFF1F2' : '#F0FDF4' }}
        >
          <Icon className={`w-5 h-5 ${isDanger ? 'text-red-600' : 'text-emerald-600'}`} />
        </div>

        {/* Content */}
        <h2 id="confirm-title" className="font-semibold text-slate-800 text-base mb-2">
          {confirmConfig.title}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          {confirmConfig.message}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            ref={cancelRef}
            onClick={actions.closeConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              confirmConfig.onConfirm()
              actions.closeConfirm()
            }}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: isDanger ? '#DC2626' : '#2B6B50' }}
          >
            {confirmConfig.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
