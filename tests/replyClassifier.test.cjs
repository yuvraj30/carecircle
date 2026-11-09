// Run with: node tests/replyClassifier.test.cjs
// A "taken" reading confirms a dose, so negated or unclear replies must never produce it.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '..', 'src/constants/replyClassifier.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const module_ = { exports: {} }
new Function('require', 'exports', 'module', js)(require, module_.exports, module_)
const { classifyParentReply } = module_.exports

const expectAll = (category, replies) => {
  for (const reply of replies) assert.equal(classifyParentReply(reply), category, `"${reply}" should read as ${category}`)
}

// Clear confirmations still confirm, including the quick-reply buttons and trailing punctuation.
expectAll('taken', ['Taken', 'taken.', 'Yes', 'yes!', 'Le li', 'Le li, thank you', 'liya', 'ho gaya', 'ले ली', 'लिया', 'हाँ', 'I have taken it'])

// Negated replies are left for a person to read.
expectAll('other', ['not yet taken', 'liya nahi', 'liya nahi abhi tak', 'nahi li, le li kya?', 'never taken', 'forgot, taken tomorrow', 'I don’t think I have taken it', 'लिया नहीं', 'no'])

// Words that merely contain a "taken" phrase do not confirm.
expectAll('other', ['mistaken', 'Kaliya aaya tha'])

// Earlier rules are unchanged.
expectAll('not_taken', ['Not taken', 'Nahi liya', "I haven't", 'नहीं लिया'])
expectAll('later', ['Later', 'abhi nahi'])
expectAll('supply', ['Ran out', 'dawai khatam'])
expectAll('felt_unwell', ['Dizzy', 'Not feeling well', 'thoda chakkar aa raha hai'])
expectAll('stop', ['STOP'])

console.log('replyClassifier tests passed')
