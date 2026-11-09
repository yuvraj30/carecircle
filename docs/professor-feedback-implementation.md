# Professor feedback: implementation notes

The professor reviewed an earlier Figma prototype. The final AI-generated usability section was explicitly unconfirmed; test the current application with representative caregivers before drawing conclusions about usability or engagement.

## Implemented in this revision

- Setup explains a small starting plan and offers an optional medicine starter. Medicine details are entered by the user, not generated or prescribed.
- A shared garden reflects categories of recorded care actions in the last seven days. It has no rankings, scores, streaks, or health claims. A digest reflects the recorded actions covered by that digest.
- Unqualified symptom replies are recorded against the person instead of an arbitrary dose, with a consent-aware check-in entry point. Existing historical events are not rewritten. A check-in is not a medical assessment.
- The dashboard distinguishes the person responsible for a medicine from whoever confirmed a reply, and labels later medicine replies as the latest rather than first.
- Invitations show circle and inviter information only after the intended email signs in. The recipient must explicitly choose to join. Coordinators can copy a visit-preparation invitation; CareCircle does not send it.
- Visit details offer an invitation entry point and acknowledge recorded completed visits. The digest can suggest one currently open, unassigned task, display recorded shared moments, and offer thanks without a ranking.
- Recorded dates in task and circle histories and health entries use a consistent format.

## Delivery and verification limits

- The invitation preview relies on the updated Supabase edge function. Deploy the backend and frontend together; the revised client does not work with the previous preview response. Signed-in invitation and multi-member flows still need end-to-end testing with separate accounts.
- The sample phone, replies and reminders remain simulated. There is no real inbound WhatsApp integration or reliable background delivery. A dashboard or garden event is not evidence of a health outcome or adherence.
- The garden represents recorded events in a rolling window rather than permanent growth or points; it does not indicate that care is missing when activity is absent. No individual question-answer count is inferred for visits.
- In-browser metrics are opt-in and device-local; they do not provide cross-device funnels, unique-member retention, or evidence that nudges improve outcomes.
- Existing storage is not transactional for concurrent invitations and handoffs. Review authorization, concurrency, and access control before real medical use, and conduct consent-based usability testing with fictional data.
