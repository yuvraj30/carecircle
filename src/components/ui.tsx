import '../shared-refresh.css'
import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { XMarkIcon } from './icons'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <header className="cc-page-header cc-page-hero flex items-start justify-between gap-4">
      <div className="cc-page-title">
        <div>
          <span className="cc-page-hero-eyebrow">YOUR CARE CIRCLE</span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>
      </div>
      {action}
    </header>
  )
}

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const styles = {
    primary: 'bg-[#245F49] text-white hover:bg-[#194A39]',
    secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'text-slate-600 hover:bg-slate-100',
  }
  return <button className={`cc-btn cc-btn-${variant} min-h-11 px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all disabled:opacity-50 ${styles[variant]} ${className}`} {...props} />
}

export function Field({ label, hint, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input className={`mt-1.5 w-full min-h-11 px-3.5 rounded-xl bg-white border text-sm outline-none focus:ring-2 focus:ring-[#4F8A68] ${error ? 'border-rose-400' : 'border-slate-200'}`} {...props} />
      {(error || hint) && <span className={`block mt-1 text-xs ${error ? 'text-rose-600' : 'text-slate-400'}`}>{error || hint}</span>}
    </label>
  )
}

export function SelectField({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select className="mt-1.5 w-full min-h-11 px-3.5 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#4F8A68]" {...props}>{children}</select>
    </label>
  )
}

export function TextAreaField({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea className="mt-1.5 w-full px-3.5 py-3 rounded-xl bg-white border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#4F8A68] resize-y" rows={3} {...props} />
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cc-card bg-[#fffefc] rounded-3xl border border-[#e3eadf] ${className}`}>{children}</div>
}

export function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    closeRef.current?.focus()
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} aria-label="Close dialog" />
      <div className={`cc-dialog-panel relative z-10 bg-[#fffefc] rounded-3xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[88vh] overflow-y-auto`}>
        <div className="cc-dialog-header sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b border-slate-100 z-10">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button ref={closeRef} onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <Card className="p-10 text-center"><p className="font-semibold text-slate-700">{title}</p><p className="text-sm text-slate-400 mt-1 mb-4">{detail}</p>{action}</Card>
}
