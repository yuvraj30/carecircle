import type { ParentReplyCategory } from '../types'

// Rule-based only, not medical; review Hindi words with a native speaker.
const RULES: { category: ParentReplyCategory; phrases: string[] }[] = [
  { category: 'stop_sharing', phrases: ['stop sharing', 'sharing band karo', 'sajha karna band', 'साझा करना बंद'] },
  { category: 'stop', phrases: ['stop', 'band karo', 'बंद करो'] },
  { category: 'pause', phrases: ['pause', 'ruko', 'not today', 'रुको', 'आज नहीं'] },
  { category: 'who', phrases: ['who', 'kaun dekhta hai', 'कौन देखता है'] },
  { category: 'not_taken', phrases: ['not taken', "didn't", 'did not take', "haven't", 'have not taken', 'nahi liya', 'नहीं लिया'] },
  { category: 'later', phrases: ['later', 'baad mein', 'abhi nahi', 'बाद में', 'अभी नहीं'] },
  { category: 'supply', phrases: ['ran out', 'khatam', 'nahi hai', 'खत्म', 'नहीं है'] },
  { category: 'felt_unwell', phrases: ['not feeling well', 'dizzy', 'chakkar', 'dard', 'pain', 'tabiyat', 'चक्कर', 'दर्द', 'तबियत'] },
  { category: 'taken', phrases: ['yes', 'taken', 'le li', 'liya', 'ho gaya', 'ले ली', 'लिया', 'हो गया', 'हाँ'] },
]

// A "taken" reply confirms a dose, so it must be unmistakable. Any of these words beside a "taken"
// phrase ("not yet taken", "liya nahi") leaves the reply for a person to read instead.
const NEGATIONS = new Set(['not', 'no', 'never', 'cannot', 'forgot', 'nahi', 'nahin', 'nai', 'nhi', 'na', 'mat', 'bhool', 'bhul', 'नहीं', 'नही', 'ना', 'मत', 'भूल'])

function wordsOf(text: string) {
  return text.replace(/’/g, "'").split(/[^\p{L}\p{M}\p{N}']+/u).filter(Boolean)
}

export function classifyParentReply(reply: string): ParentReplyCategory {
  const normalized = reply.trim().toLocaleLowerCase()
  const words = wordsOf(normalized)
  const spaced = ` ${words.join(' ')} `
  for (const rule of RULES) {
    if (rule.category === 'taken') {
      // Whole words only, so "mistaken" or a name containing "liya" never confirms a dose.
      if (!rule.phrases.some(phrase => words.join(' ') === phrase || (phrase.length > 3 && spaced.includes(` ${phrase} `)))) continue
      return words.some(word => NEGATIONS.has(word) || word.endsWith("n't")) ? 'other' : 'taken'
    }
    if (rule.phrases.some(phrase => normalized === phrase || (phrase.length > 3 && normalized.includes(phrase)))) return rule.category
  }
  return 'other'
}

const CONSENT_AGREE_REPLIES = new Set(['yes', 'y', 'haan', 'ha', 'हाँ', 'हां'])
const CONSENT_DECLINE_REPLIES = new Set(['no', 'n', 'nahi', 'नहीं'])

export function classifyParentConsentReply(reply: string): 'agrees' | 'declines' | undefined {
  const normalized = reply.trim().toLocaleLowerCase()
  if (CONSENT_AGREE_REPLIES.has(normalized)) return 'agrees'
  if (CONSENT_DECLINE_REPLIES.has(normalized)) return 'declines'
  return undefined
}

type AcknowledgedCategory = Extract<ParentReplyCategory, 'taken' | 'later' | 'supply'>
type ReplyLanguage = 'English' | 'Hindi'

export const ACK_POOLS: Record<ReplyLanguage, Record<AcknowledgedCategory, string[]>> = {
  English: {
    taken: ['Thank you, {name}. We noted that at {time}.', 'Got it, {name}. Thank you for letting us know.', 'Thanks, {name}. That has been noted.'],
    later: ['Of course, {name}. We will check again later.', 'Thanks for letting us know, {name}. We will wait.', 'Understood, {name}. We will remind you later.'],
    supply: ['Thank you for telling us, {name}. We noted the supply update.', 'Got it, {name}. The supply update has been noted.', 'Thanks for letting us know about the supply, {name}.'],
  },
  // Hindi copy needs native-speaker review before launch.
  Hindi: {
    taken: ['धन्यवाद, {name}। हमने {time} का अपडेट नोट कर लिया है।', 'ठीक है, {name}। बताने के लिए धन्यवाद।', 'धन्यवाद, {name}। हमने इसे नोट कर लिया है।'],
    later: ['ठीक है, {name}। हम बाद में फिर याद दिलाएँगे।', 'बताने के लिए धन्यवाद, {name}। हम इंतज़ार करेंगे।', 'समझ गए, {name}। हम बाद में याद दिलाएँगे।'],
    supply: ['बताने के लिए धन्यवाद, {name}। हमने दवा की उपलब्धता का अपडेट नोट कर लिया है।', 'ठीक है, {name}। दवा की उपलब्धता का अपडेट नोट कर लिया गया है।', 'दवा की उपलब्धता बताने के लिए धन्यवाद, {name}।'],
  },
}

function seedNumber(seed: string) {
  let value = 0
  for (const character of seed) value = ((value * 31) + character.charCodeAt(0)) >>> 0
  return value
}

export function acknowledgementFor(category: ParentReplyCategory, language: ReplyLanguage, name: string, time: Date, seed: string) {
  if (category !== 'taken' && category !== 'later' && category !== 'supply') return undefined
  const pool = ACK_POOLS[language][category]
  const day = Math.floor(time.getTime() / (24 * 60 * 60 * 1000))
  const template = pool[(seedNumber(seed) + day) % pool.length]
  const timeLabel = time.toLocaleTimeString(language === 'Hindi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' })
  return template.replace('{name}', name).replace('{time}', timeLabel)
}

export const FAMILY_MESSAGE_AUTO_REPLY = 'Thank you for telling us. We have shared your message with your family. If you need urgent help, please call your local emergency number.'
