Product: CareBridge, an app for family caregivers. It reads a patient's outpatient report, combines it with what the caregiver enters, and turns it into a plan: a scheduled calendar of care events plus the resources the family needs (transportation, food, primary care contact, language support, insurance, and payments). If the family has no professional caregiver, CareBridge helps connect them with one. If they already have one, it brings that person into the plan.

Fonts: Fraunces 72pt italic (display, ≥22pt, warm editorial moments only) + IBM Plex Mono (body, all numerals). Never add a third face.
Palette: deep ink #1F2A36 on a soft blue-cream canvas #F2F4F7, warm blue #3F72AF as the main accent. Supporting tokens live in styles/colors_and_type.css.
Grain: var(--grain-url) on every non-status surface.
Numerics: font-variant-numeric: tabular-nums wherever a number renders.
Motion: cubic-bezier(0.2, 0.7, 0.2, 1) for UI, cubic-bezier(0.34, 1.56, 0.64, 1) for spring moments. No bounce or elastic.
Stamps and threads are the signature decorative and kinetic primitives.
One hero action per screen. Icons before text. Data provenance is visible on every value that came from a report or a partner (source · outpatient report 10/02, entered by you, covered · Medicaid plan §3.1).

Palette
Warm blue is the identity of the product. It should feel calm, trustworthy, and human, never clinical or cold.
Ink #1F2A36 for text and dark surfaces.
Canvas #F2F4F7 (soft blue-cream) as the base surface.
Paper #E8EDF3 for nested surfaces, cards, and calendar cells.
Warm blue #3F72AF as the primary accent: hero actions, selected days, stamps, links.
Blue-soft #7FA3CF for hover on dark surfaces, secondary fills, and calendar event backgrounds.
Blue-deep #284B75 for inked surfaces (headers, the active care plan panel).
Status only, never decorative: good #3E7D5A (confirmed, covered), caution #B7832F (needs attention, missing info), urgent #B5483B (overdue medication, missed appointment).
Grain overlay is mandatory on every non-status surface. Subtle on canvas, stronger on inked or dark surfaces. It is the texture that tells the caregiver this was made with care.

Type system
Fraunces 72pt (display italic, ≥22pt only, for emotion: greetings, the patient's name, milestones, "you're all set" moments) paired with IBM Plex Mono (body, labels, every numeral, all tabular figures via font-variant-numeric: tabular-nums). This pairing is a committed decision, not a reflex. It ships product-wide, and iteration proposals must work within it, not replace it.

Signature primitives
Stamps: rotated warm-blue circles that mark state and source (SCHEDULED, COVERED, RIDE BOOKED, § REPORT). They are the signature decorative primitive.
Threads: a thin animated hairline with a soft blue glow that connects a calendar event to the resource that supports it (an appointment threaded to its ride, a prescription threaded to its pharmacy and payment). They are the signature kinetic primitive.

Design Principles
Silence is the default. Caregivers are tired and short on time. Every pixel earns its place. If a surface can be a glanceable chip instead of a card, make it a chip. If a chip can be a glyph, make it a glyph.
One hero action per screen. Everything else is progressive disclosure. Home = what needs to happen today. Calendar = the week of care. Resources = the one gap to fill next. Caregiver = who is helping. Payments = what is owed and what is covered. Nothing competes.
Plain language first. Medical terms from the outpatient report are always shown alongside a plain-language explanation. Every screen must work in the caregiver's chosen language, and translation is a first-class feature, not a setting buried in a menu.
Tabular figures on every number. Editorial italics only for emotion. Doses, times, and dollar amounts line up. Headlines don't.
State changes morph in place. Chips re-color, calendar tiles mutate. No toasts. No modals unless the user is about to commit something that is hard to undo (booking a ride, confirming a caregiver, submitting a payment, sharing health information).
Icons before text. Transportation, food, primary care, language, insurance, payments, and caregiver each have a glyph, and the glyph leads. Text is the fallback, not the default.
Data provenance is visible. Every value carries its source ("source · outpatient report 10/02", "entered by you", "covered · Medicaid plan §3.1", "confirmed by Dr. Lee's office"). It tells the caregiver what they can trust and why.
Never leave a dead end. Every gap the app finds (no ride, no caregiver, no coverage, a language barrier) comes with a next step the caregiver can take right away.

Core flows
Intake: upload or photograph the outpatient report, then confirm and fill in what the app extracted (medications, follow-ups, restrictions, primary care contact, insurance).
Care calendar: follow-ups, medications, rides, meal deliveries, and caregiver shifts are scheduled automatically on a week view, and each event is threaded to the resource behind it.
Caregiver connect: if the family has no caregiver, show matched options; if they have one, invite them to share the calendar.
Resources: transportation, food, primary care contact, language support, insurance, and payments, each shown as a single chip that is either covered or the next gap to fill.

Committed technical decisions
Fonts: Fraunces + IBM Plex Mono (do not swap, do not add a third).
Colors: the warm-blue palette above; no new accents without a documented reason.
Grain: var(--grain-url) on every non-status surface at an opacity the surface determines (subtle on canvas, stronger on ink and blue-deep).
Motion: cubic-bezier(0.2, 0.7, 0.2, 1) for UI transitions; cubic-bezier(0.34, 1.56, 0.64, 1) for spring moments (stamps landing, chips settling, events dropping into the calendar). No bounce, no elastic.
Components: every new component registers on window.CareBridgeUI so the agent layer can spawn it inline with identical pixels.
Numerics: font-variant-numeric: tabular-nums everywhere a number is rendered: medication doses, appointment times, calendar dates, copays, balances, and phone numbers.
Accessibility: minimum 16px body text, WCAG AA contrast on every text and background pair, and tap targets of at least 44px. Caregivers are often older, on the move, or using one hand.

What changes vs what stays
Product iteration is welcome. Design-system iteration is not. Proposals that re-open the typeface, swap the warm-blue accent, or remove the grain should be rejected without discussion. These are the commitments that make CareBridge recognizable as CareBridge.
Iterating on layout, density, component behavior, progressive disclosure, state machines, calendar interactions, and motion orchestration is always on the table.
