# Brainstorm: Savings Goal App for Vietnamese Workers in Japan

## Commission
Personal project (not company work). Build a web app to track savings toward goals
(buy a house, pay off debt, etc.) for the user's own use in Japan, with intent to
possibly launch publicly and monetize later.

## Answers gathered
- Purpose: real public product (not a learning exercise) — user already knows full-stack
- Data entry: manual entry (no bank API/CSV import for MVP)
- MVP scope: small, core features only, shippable in 1-2 weeks
- Niche: Vietnamese (or immigrant) workers in Japan saving toward goals, JPY/VND context

## Assessment — is it a good idea?
Crowded market for general budgeting apps in Japan (Zaim, Moneytree, MoneyForward), but
clear underserved niche: goal-based saving for Vietnamese/immigrant workers in Japan
(multi-currency JPY/VND, remittance tips, tax refund info for people leaving Japan).
Viable as a real niche product, not a general competitor to the big apps.

## Feature brainstorm (phased)

**MVP (1-2 weeks):**
- Auth (email or Google)
- Create savings goal: name, target amount, deadline, currency (JPY/VND)
- Manual entry of saved amounts (date, amount, note)
- Dashboard: % progress per goal, total saved
- Transaction history list

**Phase 2:**
- Multiple goals + prioritization
- Recurring reminders ("transfer X yen to goal Y monthly")
- Monthly savings trend chart
- JPY↔VND conversion for house-in-Vietnam goals
- CSV export

**Phase 3 (growth/differentiation):**
- Bank statement CSV import
- Content for Vietnamese workers in Japan: furusato nozei, nenkin refund on leaving Japan,
  remittance service comparison (Wise, SBI Remit)
- VI/JA/EN localization
- PWA / mobile

## Risks to watch
- Financial data is sensitive even with manual entry only — need privacy policy + Row
  Level Security if multi-user, per Japan's Act on Protection of Personal Information
- Vendor lock-in with Supabase (mitigated: standard Postgres underneath, exportable)

## Agreed direction
- Stack: **Next.js (TypeScript) + Supabase (Postgres + Auth + RLS)**, deploy Vercel
- Reasoning: fastest path to a real, usable MVP for a solo builder; auth/DB/storage
  bundled; free tier covers early growth; RLS handles per-user data isolation cleanly;
  Postgres underneath avoids hard lock-in
- Scope: MVP feature set only for first cut (see above)

## Success criteria
- User can create a goal, log manual savings entries, and see progress % within 1-2 weeks
  of build time

## Next steps
- Hand off to `/tkm:create-plan` for detailed phase-by-phase implementation blueprint

## Unresolved questions
- None blocking — future decisions (multi-currency conversion source, hosting for beyond
  free tier, monetization model) deferred to later phases
