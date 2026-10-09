# CareBridge

CareBridge is an app for family caregivers. It reads a patient's outpatient report, combines it with what the caregiver enters, and turns it into a plan: a scheduled calendar of care events plus the resources the family needs — transportation, food, primary care contact, language support, insurance and payments. If the family has no professional caregiver, CareBridge helps connect them with one; if they already have one, it brings that person into the plan.

## What changes vs what stays

**Product iteration is welcome. Design-system iteration is not.** Proposals that re-open the typeface, swap the warm-blue accent, or remove the grain are rejected without discussion. Layout, density, component behavior, progressive disclosure, state machines, calendar interactions and motion orchestration are always on the table.

## Design principles

1. **Silence is the default.** Every pixel earns its place. If a surface can be a chip instead of a card, make it a chip. If a chip can be a glyph, make it a glyph.
2. **One hero action per screen**, in `blue`. Everything else is progressive disclosure. Home = what needs to happen today. Calendar = the week of care. Resources = the one gap to fill next. Caregiver = who is helping. Payments = what is owed and what is covered.
3. **Plain language first.** Medical terms from the report always appear with a plain-language explanation. Every screen works in the caregiver's chosen language; translation is a first-class feature, not a buried setting.
4. **Tabular figures on every number. Editorial italics only for emotion.** Doses, times and dollar amounts line up. Headlines don't.
5. **State changes morph in place.** Chips re-color, calendar tiles mutate. No toasts. No modals except before something hard to undo: booking a ride, confirming a caregiver, submitting a payment, sharing health information.
6. **Icons before text.** Transportation, food, primary care, language, insurance, payments and caregiver each have a glyph, and the glyph leads. Text is the fallback.
7. **Data provenance is visible** on every value from a report or partner: `source · outpatient report 10/02`, `entered by you`, `covered · Medicaid plan §3.1`, `confirmed by Dr. Lee's office`.
8. **Never leave a dead end.** Every gap (no ride, no caregiver, no coverage, a language barrier) comes with a next step the caregiver can take right away.

## Color

Warm blue is the identity: calm, trustworthy, human — never clinical or cold. No new accents without a documented reason.

| Role | Token | Rule |
| --- | --- | --- |
| Base surface | `canvas` | Every screen. Subtle grain. |
| Nested surface | `paper` | Cards, calendar cells, chip grounds. |
| Text, dark surfaces | `ink` | All body text. As a surface, `canvas` text on it; stronger grain. |
| Identity accent | `blue` | Hero action, selected day, stamps, links. |
| Secondary | `blue-soft` | Hover on dark surfaces, secondary fills, calendar event backgrounds (`ink` text). Never text. |
| Inked surface | `blue-deep` | Headers, the active care plan panel; `canvas` text; stronger grain. |
| Status only | `good` · `caution` · `urgent` | Confirmed/covered · needs attention/missing info · overdue medication/missed appointment. Never decorative, never grained. |

**Contrast flags** (the brief requires AA on every text pair — these brief colors don't fully meet it; the values are kept as given):

- `caution` fails as text (3.0:1 on `canvas`, 2.8:1 on `paper`); `ink` on a `caution` fill is 4.4:1.
- `good` text on `canvas` is 4.45:1 — just under 4.5.
- `blue` text on `paper` is 4.2:1 — fine for icons and 24px+ text, not body.

Until resolved: status text stays `ink`; the status color carries the glyph, stamp or fill.

## Grain

`var(--grain-url)` is mandatory on every non-status surface — the texture that tells the caregiver this was made with care. Subtle on `canvas`; stronger on `ink` and `blue-deep`. Status colors are never grained. (The grain image itself lives in the codebase and isn't in this kit yet.)

## Typography

Two faces, product-wide. Never a third.

- **Fraunces 72pt italic** — `display`. At least 22pt, for emotion only: greetings, the patient's name, milestones, "you're all set" moments.
- **IBM Plex Mono** — `body`. Body, labels and every numeral. Always `font-variant-numeric: tabular-nums` wherever a number renders: doses, appointment times, calendar dates, copays, balances, phone numbers.
- Body text is never below 16px.

## Signature primitives

- **Stamps** — rotated warm-blue circles that mark state and source: `SCHEDULED`, `COVERED`, `RIDE BOOKED`, `§ REPORT`. The signature decorative primitive. They land with the spring curve.
- **Threads** — a thin animated hairline with a soft blue glow connecting a calendar event to the resource that supports it: an appointment threaded to its ride, a prescription threaded to its pharmacy and payment. The signature kinetic primitive.

## Motion

- UI transitions: `cubic-bezier(0.2, 0.7, 0.2, 1)`.
- Spring moments — stamps landing, chips settling, events dropping into the calendar: `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- No bounce, no elastic.

## Core flows

- **Intake** — upload or photograph the outpatient report, then confirm and fill in what was extracted: medications, follow-ups, restrictions, primary care contact, insurance.
- **Care calendar** — follow-ups, medications, rides, meal deliveries and caregiver shifts scheduled automatically on a week view, each event threaded to its resource.
- **Caregiver connect** — no caregiver: matched options. Existing caregiver: invite them to share the calendar.
- **Resources** — each of the six resource types is a single chip: covered, or the next gap to fill.

## Accessibility

Minimum 16px body text, WCAG AA on every text/background pair (see the flags above), tap targets at least `tap-min` (44px). Caregivers are often older, on the move, or using one hand.

## Components

Every component registers on `window.CareBridgeUI` so the agent layer can spawn it inline with identical pixels. None are in this kit yet.
