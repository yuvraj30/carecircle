import { useApp } from '../context'
import { dayClosure } from '../lib/metrics'

export function DayStrip({ hideQuote = false }: { hideQuote?: boolean }) {
  const { state, now } = useApp()
  const metrics = dayClosure(state, now())
  return <section className="cc-day-overview" aria-label="Care overview">
    <div className="cc-day-intro"><span className="cc-kicker">AT A GLANCE</span><strong>Your care overview</strong></div>
    <div className="cc-day-metric"><span>Today</span><strong>{metrics.closedToday}<small> / {metrics.totalToday}</small></strong><span>items closed</span></div>
    <div className="cc-day-metric"><span>This week</span><strong>{metrics.closedThisWeek}</strong><span>{metrics.closedThisWeek === 1 ? 'item' : 'items'} closed</span></div>
    <div className="cc-day-next"><span>UP NEXT</span><strong>{metrics.next ?? 'Nothing open'}</strong>{metrics.tomorrowPreview && <p>Tomorrow · {metrics.tomorrowPreview}</p>}</div>
    {!hideQuote && metrics.quotedReply && <div className="cc-day-quote"><span>IN THEIR WORDS · {metrics.quotedReply.speaker}</span><p>“{metrics.quotedReply.text}”</p></div>}
  </section>
}
