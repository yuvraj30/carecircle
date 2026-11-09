# CareCircle product learning plan

## What is implemented now

The optional measurement control records a small, fixed set of counters **only on the current browser** for a signed-in account after that person opts in. The storage key is scoped to that account. It sends nothing to CareCircle or any other service, excludes the fictional Sample, records no patient names, medicine names, free text, doses, phone numbers, care-record details or event timestamps, and can be turned off and erased in Settings. Counters begin only after opt-in. Storage may be unavailable or cleared, and activity on other devices is not included.

Counters cover tour starts and completions; suggestion impressions, opens and dismissals; and increases this browser observes in active helpers, assigned tasks and completed tasks while a circle is loaded. A count can include changes made by another member and is not a count of unique people or unique care items. Initial state and changes seen after switching circles are baselines, not new actions. The browser can miss changes while closed or while another circle is selected. The feature is a prototype debugging aid, **not** shared product analytics, an activation funnel, a retention report, a measure of adherence or evidence of improved health outcomes.

## Research questions and hypotheses

1. Can a new caregiver understand the next action in a care item without assistance? Hypothesis: the visible status, owner and next step make a handoff easier to understand.
2. Can a coordinator create a shareable invitation, explain that they must share it themselves, and recognise that invited is different from joined? Hypothesis: an explicit invitation status reduces mistaken assumptions.
3. Do suggestions help a person choose an appropriate action without feeling pressured? Hypothesis: context and a dismiss option make guidance useful, but this must be tested.
4. Can people correctly identify when a reminder or response is simulated? Hypothesis: the prototype labels are understood throughout the journey.

## Moderated usability sessions

Recruit a small, varied group of adult caregivers and, where appropriate, older adults and family helpers. Start with around five participants as an exploratory round; this does not establish population-level performance. Include different levels of digital confidence and accessibility needs. Use fictional accounts and data. Explain the purpose, obtain informed consent, and do not request real medical information.

Use neutral, realistic prompts without naming interface controls:

1. Find an item that needs attention and explain what is known and unknown.
2. Find who is responsible for a task, and decide what you would do next.
3. Invite another person; explain how they receive the link and when they count as joined.
4. Find an upcoming visit and prepare one question or task.
5. Skip or restart the tour, and explain whether a reminder or parent reply was actually sent.

Observe without coaching. Record task completion, time, errors, requests for help, the participant's understanding of each result and their feedback. Ask permission before recording. Store notes separately from the app, avoid names and medical details, and agree a retention/deletion plan. Summarise repeated problems, prioritise by impact, fix and retest. Use representative users; internal demos and code review are not user testing.

## Metrics for a future consented pilot

These measures are **proposals**, not implemented by the current local counters. Their denominators, data collection, access and retention require design and informed consent before any pilot.

| Question | Proposed definition | Important qualification |
| --- | --- | --- |
| Activation | Unique eligible new circles in a defined cohort that create at least one real care item and have a second active member within a defined period, divided by eligible new circles in that cohort. | Choose the window before analysis; invitations sent are not accepted members. Exclude samples and test accounts. |
| Meaningful weekly use | Unique eligible circles with at least one explicitly recorded real task completion in the week. | A task completion is a coordination event, not proof of medical adherence or a health outcome. |
| Handoff clarity | Participants who correctly identify owner and next step without help, divided by participants attempting the task. | Report sample size, observed errors and uncertainty alongside the rate. |
| Suggestion usefulness | Separately count eligible impressions, optional opens and dismissals for consented pilot participants. | Clicks are not proof of benefit; combine with interviews and compare fairly before making causal claims. |

Avoid collecting raw parent messages, identifiable care text, doses or unnecessary health details. Define access, data retention, deletion and consent before any shared collection. Never use simulated reminders or Sample activity to claim real engagement or care outcomes. The real inbound WhatsApp channel and background scheduling are not implemented; they must not be implied by metrics or test results.
