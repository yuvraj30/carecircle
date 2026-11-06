# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an adult child who lives away from an ageing parent, often in another city, and coordinates that parent's medicines, refills and doctor visits together with siblings or other family members (confirmed in init). The parent does not use the app: they receive reminders and reply on WhatsApp, in English or Hindi. Other family members join a circle by invitation as caregivers or view-only members.

## Product Purpose

CareCircle helps a family share the care of a parent without calling every hour. The core action, from the Journey v3 document, is that a family repeatedly closes each open care item (a dose, a refill or a visit) with a parent reply or a named owner, so that no miss is left without someone holding it. Success means circles that close items, not logins or app opens.

## Positioning

The parent answers in their own words on WhatsApp, and the family sees those exact words; when nobody hears back, a named family member takes the follow-up. A sample day lets anyone try the product before creating an account.

## Operating Context

CareCircle is a course team project at the prototype stage, being usability-tested with real people; it has no paying customers (confirmed in init). The source of truth for the app is the GitHub repo `yuvraj30/carecircle` (moved from Figma Make on 2026-11-06; the Figma Make file `gzx3ZBweyXOXX2oS1DLcDm` is now an archive). It is live at carecircle-iimb.vercel.app, with a Supabase backend (project `ksnmbtlicmmzfwhwcicv`, edge function `make-server-e043d7e3`). Several team members change it through pull requests, often with Claude Code. Typical use is in India: families coordinate over WhatsApp, and the parent's language is English or Hindi.

## Capabilities and Constraints

Built: a public landing page and a fictional Sample day that runs in the browser only; sign-in that returns the user to the action they tried; a short onboarding (circle, patient, optional first medicine); medicine reminders with a follow-up and call ladder; separate parent consents for reminders and for sharing replies; tasks, appointments, records, a timeline and a weekly digest; invitations with a WhatsApp share link; away dates and a larger-text setting; and three optional assistant features (reading unusual replies, a visit summary, and paste-to-add medicine) that only propose and fall back to plain behaviour without an API key.

Not built: a real inbound WhatsApp channel (parent replies reach the app only through the demo phone on the Sample day) and a server-side scheduler (reminders move only while someone has the app open).

Documented product rules (from CHANGES.md and Journey v3, not separately confirmed as binding in init): rules decide anything that affects a dose and the assistant only proposes; the parent's exact words are always shown and the parent decides what is shared; nothing reaches the parent before they agree; CareCircle does not diagnose, prescribe, change doses or contact emergency services; no streaks, scores or guilt copy, and the parent's health is never used as pressure. Care history is append-only: corrections are added, never erased.

Open decisions: pricing and subscription are set aside; whether real WhatsApp sending and a server scheduler are in scope is undecided; the Hindi copy has not been reviewed by a native speaker; whether sending parent reply text to an outside AI service is acceptable is not yet confirmed.

## Brand Commitments

The product name appears as both "CareCircle" and "Care Circle" in the app and documents; one form has not been chosen. Existing lines in the app include "Family caregiving, connected" and the landing promise "Keep medicines, tasks and family follow-ups in one shared circle." People whose pronouns are unknown are written as they/them.

## Evidence on Hand

Survey responses: `Downloads/Family Healthcare Coordination - 3 Minute Survey (Responses).xlsx`. Research and course documents: `Downloads/Family Healthcare Coordination.pdf`, `Downloads/CareCircle_Session67_Worksheet_Filled.pdf`, `Downloads/Care Circle — Journey v3 Try First, Save Later.md`, and `Downloads/CHANGES.md`. Video: `Downloads/Care Circle Intro.mp4`. The Sample day family (Lakshmi Iyer) is fictional. There are no real testimonials, customer quotes, usage numbers or press; future work must not invent them.

## Product Principles

Close the loop, not the session: value is a care item that ends with a parent reply or a named owner. Try first, sign in to act: an account is asked for only when someone wants to save, send or invite. Share the load fairly: show who helped as counts, never as a ranking.
