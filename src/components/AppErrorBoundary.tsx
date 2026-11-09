import { Component, type ErrorInfo, type ReactNode } from 'react'
import { HeartIcon } from './icons'

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CareCircle recovered from a render error', error, info)
  }

  private resetDemo = () => {
    try {
      localStorage.removeItem('carecircle-demo-v2')
      localStorage.removeItem('carecircle-demo-v3')
      localStorage.removeItem('carecircle-demo-v4')
    } finally {
      window.location.replace('/login')
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-3xl bg-white border border-slate-100 shadow-sm p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#DFEEE2] flex items-center justify-center">
            <HeartIcon className="w-6 h-6 text-[#285D48]" />
          </div>
          <h1 className="text-xl font-semibold text-slate-800 mt-5">CareCircle needs a local demo reset</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            A saved prototype state could not be migrated. Resetting removes only local fictional demo data; no password or external account data is stored.
          </p>
          <button onClick={this.resetDemo} className="mt-6 min-h-11 px-5 rounded-xl bg-[#2B6B50] text-white text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[#2B6B50] focus-visible:ring-offset-2">
            Reset local demo and return to Login
          </button>
        </section>
      </main>
    )
  }
}
