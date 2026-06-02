# Kongsian — Implementation Plan

> Multi-tenant consignment tracking SaaS. Brand → Tenant (cafe) stock and revenue split, weekly settlement, WhatsApp-first auth for non-tech cafe PICs.

- **Owner:** Erwin (@erwin)
- **Domain:** kongsian.com (or .app) — TBD
- **Stack:** Astro 4 + Cloudflare Workers + D1 (SQLite) + Drizzle ORM + Lucia auth + R2 (assets) + WA Business API
- **First user:** Hanniel (Han's Overnight Oats) — 2 cafe partners including padel-cafe
- **Showcase:** Lives under Eeveeon (agent portfolio)
- **Repo (planned):** git@github.com:eeveeon/kongsian.git

---

## File index

| # | File | Purpose |
|---|------|---------|
| 1 | [`README.md`](./README.md) | This index |
| 2 | [`implementation-plan.md`](./implementation-plan.md) | Exec summary, stack choice, MVP/Phase 2/3, architecture |
| 3 | [`data-model.md`](./data-model.md) | ER diagram (mermaid) + D1/Drizzle schemas with types |
| 4 | [`api-routes.md`](./api-routes.md) | All HTTP endpoints (REST) with auth/scope notes |
| 5 | [`user-flows.md`](./user-flows.md) | 3-actor flows with mermaid sequence diagrams |
| 6 | [`ui-wireframes.md`](./ui-wireframes.md) | Mobile text wireframes for every key screen |
| 7 | [`whatsapp-templates.md`](./whatsapp-templates.md) | OTP, reminder, settlement, dispute, edge-case messages |
| 8 | [`edge-cases.md`](./edge-cases.md) | Failure modes and how the system behaves |
| 9 | [`anti-slop-checklist.md`](./anti-slop-checklist.md) | Pre-launch verification list (15+ items) |
| 10 | [`deployment.md`](./deployment.md) | Cloudflare setup, CI/CD, domains, secrets |
| 11 | [`milestones.md`](./milestones.md) | 4-week roadmap with daily tasks |
| 12 | [`open-questions.md`](./open-questions.md) | 12-15 decisions Erwin must make before build |

## Reading order

1. `implementation-plan.md` — the 10-min version
2. `data-model.md` — what the DB looks like
3. `api-routes.md` — what the system can do
4. `user-flows.md` — how a day works
5. Everything else is reference

## Status

- [x] Plan written — 2026-06-02
- [ ] Stack confirmed
- [ ] Domain registered
- [ ] First deployment
