# Demo walkthrough

Fictional patients, providers, programs, and prices. No AI. Clinical text is entered by hand and reviewed by a coordinator.

Password for every demo account: `demo`

| Role | Account | What you see |
| --- | --- | --- |
| Patient | `maria@demo.carebridge` | Maria Rodriguez, Spanish-preferring, Lakeside knee arthroscopy. Walker gap, uncovered supervision hours, ride, finance. |
| Caregiver | `sofia@demo.carebridge` | Sofia (daughter). Only her assigned tasks and the instructions behind them. Invite already accepted. |
| Coordinator | `jordan@demo.carebridge` | Queue for Maria and James. Draft antibiotic instruction waiting for review. |
| Patient (cleaner) | `james@demo.carebridge` | Same procedure; Grace covering; fewer gaps. |

Plan codes (patient shares these so a caregiver can enter the full assessment):

- Maria: `PLAN-MARIA`
- James: `PLAN-JAMES`

Task invite (assigned tasks only, not the full assessment): `SOFIA-2026`

## Suggested 5-minute path

1. Open the landing page. Headline is **Your surgery is planned. Is your recovery?**
2. Sign up a new **patient**. The **plan code** is the first thing on Home before any assessment, and always at the top of **Settings**. A caregiver signs in, enters that code, and can complete the assessment and instructions for them.
3. Sign in as **Maria**. Dashboard: plan code, readiness stamp, coverage bar, next tasks, alerts.
4. **Calendar** — timeline / days / list. Starts at her discharge time (`America/Chicago`).
5. **Resources** — confirm walker / ride. Confirming here updates the calendar.
6. **Caregivers** — Sofia’s pending hours vs uncovered window. Request a professional provider; use **Simulate provider reply** (labeled simulated). Nothing counts as booked until that confirm.
7. **Finance** — estimates marked hypothetical. Apply to a program; only **approved** assistance reduces the gap (coordinator does that).
8. **Pay** — CareBridge is the middle party: approved programs and the family pay CareBridge, CareBridge pays each service. Maria's ride is already covered by Medicaid transportation (seeded as approved), so it shows **$0 family · paid to Rapid Ride**. Tap **Pay**, pick **Half**, confirm with the prefilled test card (`4242 4242 4242 4242`). The walker is paid out to Prairie Mobility Rentals. Caregiving stays under **Not booked yet** until a provider is confirmed. Simulated; only brand and last 4 digits are saved.
9. Sign out. Sign in as **Jordan**. Approve the draft antibiotic instruction (or mark needs clarification). Assign / resolve / escalate gaps. Verify a completed task.
10. Sign in as **Sofia**. Accept a task, mark complete, or report a barrier. Confirm availability blocks. Or enter `PLAN-MARIA` to fill her assessment. **Pay** shows the same family bill (no income or eligibility details) and she can cover the rest of the balance.
11. Settings → language EN/ES. Doses and times must stay the same. **Reset demo data** restores the seed.

Surgery dates are relative (next Friday at least two days out) so the seed does not go stale.
