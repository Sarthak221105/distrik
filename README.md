# Distrik · AI Sales OS for Indian Manufacturers

An AI sales employee for Indian manufacturers. A manufacturer uploads a product, sets commercial rules and names a market. Distrik then finds buyers, talks to them on WhatsApp, negotiates inside the rules, sends GST quotations, reads purchase orders, and brings back only the decisions that need a human.

The product spec is [docs/PRD.md](docs/PRD.md) (extracted from the PRD docx in this folder).

## Architecture

```
web/                    Next.js 16 (App Router, TypeScript): manufacturer app, rep PWA, system admin console
supabase/migrations/    Postgres schema, RLS, rule functions, queues (pgmq), schedules (pg_cron)
supabase/functions/     Edge Functions (Deno): WhatsApp, Claude agent, workers, PDFs, PO parsing
supabase/tests/         pgTAP tests: tenant isolation, pricing, consent, idempotency, approvals
supabase/seed.sql       Local demo data (two tenants, every role, a full deal pipeline)
scripts/setup-local.ts  Uploads sample PDFs for seeded rows and queues quotation PDFs
```

Postgres is the source of truth and the state machine. Rules that must never fail live in SQL functions, so a bug in the app or an AI prompt cannot bypass them:

| Rule | Where |
|---|---|
| Only prices the manufacturer allows are ever quoted | `evaluate_offer`, `negotiate_offer`, `quotations_price_guard` trigger |
| No WhatsApp message without consent, outside the 24 h window, or past the daily cap | `enqueue_outbound_message` (re-checked at send time by `claim_outbound_message`) |
| Pipeline stages cannot be skipped | `set_stage` + `stage_transitions` |
| Approvals respect the decider's limit | `decide_approval` |
| An order needs a matched PO or a logged override | `confirm_order` |
| Tenants never see each other's rows; reps see only assigned leads | RLS on every table + restrictive policies |
| Discovered prospects are contacted only after the manufacturer approves them | `review_prospects` + the gate in `enqueue_outbound_message` |
| Lead review actions need the delegated permission | `has_permission` in every review RPC |

### Who runs sales operations

Distrik supplies the intelligence and automation; each manufacturer owns its sales operations. There is no Distrik ops team in the loop:

```
discovery -> automatic cleaning, dedupe, classification, research, fit score
          -> Lead Review (the manufacturer's own team) -> approved prospects -> outreach
```

- **Lead Review** (`/leads`): Pending Review, Needs Review (possible duplicate, low confidence, missing phone, flagged by a rep), Approved, Rejected. Approve, reject with a reason, edit, merge duplicates, keep separate, assign to a rep, bulk actions, review history.
- **Outreach gate**: a discovered prospect can only be messaged after approval (`enqueue_outbound_message` raises `prospect_not_approved`), and consent rules still apply independently. Outreach can launch for approved prospects while others are still under review.
- **Permissions**: owners can do everything; owners delegate `review_leads`, `resolve_duplicates`, `assign_leads`, `launch_campaigns` and `override_reviews` to sales heads. Reps see only assigned leads and can correct them or send them back to review.
- **System admin** (`/system`): platform health, queues and dead letters, activating self-serve applications, connecting tenants' WhatsApp numbers, data-source compliance and template status sync. It works from aggregates and cannot read any manufacturer's prospects, contacts or conversations.

### From landing page to workspace

Manufacturers sign themselves up; the system admin no longer types tenant details in.

```
/ (landing: product, how it works, policies, pricing, FAQ, waitlist)
  -> Join the waitlist (email only)                         -> waitlist counter +1
  -> Choose Basic / Growth / Scale, monthly or yearly
     -> /signup  company, owner, accept Terms                 (public-signup fn)
        -> application (pending_payment) + placeholder payment + waitlist counter +1
        -> /signup/status/<token>  "payment coming soon, you are #N on the waitlist"
System admin -> /system/applications -> Activate (records the payment reference)
  -> activate-application fn: manufacturer + subscription + owner invite email
  -> /auth/confirm -> /welcome (set password) -> /dashboard
```

- Plans live in the `plans` table: Basic ₹5,000, Growth ₹9,000 and Scale ₹20,000 a month plus GST, or yearly at 20% off. Limits (seats, campaigns, prospects) are shown in **Settings → Plan & billing** and are not enforced.
- Online payment is a placeholder (`supabase/functions/_shared/payments/`). A gateway adapter plus webhook will call the same activation path the Activate button uses.
- The policy pages (`/policies/terms`, `/policies/privacy`, `/policies/refunds`) are drafts pending legal review.
- Locally, the invite email lands in Mailpit at http://127.0.0.1:55424. The seeded application waiting for payment has its status page at `/signup/status/demo-application-token`.

Edge Functions are stateless and only reach the outside world. pg_cron wakes them through pg_net when their pgmq queue has work.

## Run it locally

Prerequisites: Docker Desktop, Supabase CLI, Node 22+, Deno 2.

```bash
supabase start
```

This applies migrations and the seed. The project uses ports 55421–55429 so it can run next to other local Supabase projects.

```bash
deno run -A scripts/setup-local.ts
```

```bash
cd web && npm install && npm run dev
```

Open http://localhost:3000. If `supabase status` shows a different publishable key, copy `web/.env.example` to `web/.env.local` and paste it in.

### Demo logins (local only)

Every demo user's password is `Password123!`. Phone OTP `123456` also works for the numbers in `supabase/config.toml`.

| User | Role | Lands on |
|---|---|---|
| owner@shakti.test | Manufacturer owner | /dashboard |
| head@shakti.test | Sales head (₹5 lakh approval limit) | /dashboard |
| rep@shakti.test, rep2@shakti.test | Sales reps | /rep/today |
| admin@platform.test | System admin (platform maintenance only, no buyer data) | /system/health |
| owner@kaveri.test | Owner of a second tenant (isolation checks) | /dashboard |

### Try the whole loop locally

`WHATSAPP_PROVIDER=sandbox` (in `supabase/.env`) sends nothing to Meta. With no `ANTHROPIC_API_KEY`, a deterministic rule-based agent stands in for Claude and goes through the same tools and price validator.

1. Sign in as the owner and open **Settings → WhatsApp test**. Send "Rate kya hai 5L mustard oil ka? 100 jar chahiye", then "540 me de do".
2. The AI quotes only prices `evaluate_offer` returned. The ₹540 ask opens an approval.
3. Sign in as the owner. The approval appears within seconds under **Approvals**. Approve or counter it.
4. The conversation resumes, a GST quotation PDF is generated and sent, and a PO sent back is matched against it. Then confirm the order under **Quotations & POs**.

To use the real services, set `ANTHROPIC_API_KEY` (Claude) and `WHATSAPP_PROVIDER=meta_cloud` with your BSP credentials in `supabase/.env`, then restart.

## Tests

```bash
supabase test db
```

```bash
deno test --allow-env --allow-read supabase/functions/tests
```

```bash
cd web && npx tsc --noEmit && npx eslint src e2e
```

End-to-end tests need the dev server running and a fresh seed (`supabase db reset`):

```bash
cd web && npx playwright test
```

## Edge Functions

| Function | Trigger | Purpose |
|---|---|---|
| whatsapp-webhook | Public, signature verified | Receive messages and delivery statuses, store once, queue one AI turn |
| outbound-sender | pg_cron, queue `outbound_messages` | Re-check consent, send through the channel adapter, track delivery |
| ai-reply | pg_cron, queue `ai_turns` | Agent loop with tools, price validator, escalation; Claude or the fallback agent |
| ingest-worker / classify-worker / research-worker | pg_cron, queues | Discovery pipeline: source adapters, classification, research and signals |
| embeddings-index | pg_cron, queue `embeddings` | Chunk and embed catalogue knowledge (gte-small) |
| quotation-pdf | pg_cron, queue `quotation_jobs` | GST quotation PDF (CGST/SGST or IGST, amount in words) and send |
| po-parse | pg_cron, queue `po_parse` | Read a PO (Claude or a regex fallback) and run the SQL matcher |
| notify | pg_cron, queue `notifications` | Web push (VAPID) and email (Resend) |
| catalogue-extract, parse-objective | Signed in manager | Propose products from a catalogue, parse a Start Sales objective |
| admin-users | Owner | Owners invite their team |
| public-signup | Public (rate limited, honeypot) | Landing stats, waitlist, self-serve applications and their status page |
| activate-application | System admin | Mark an application paid, create the tenant and subscription, invite the owner |
| erase-contact | Company owner | DPDP erasure across messages, contacts and media |
| simulate-inbound | Owner / sales head, sandbox only | WhatsApp test sandbox for the caller's own business number |

## Deliberate choices beyond the PRD

- **Hand written service worker** (`web/public/sw.js`) instead of Serwist, because Next 16 builds with Turbopack. It handles the app shell, the offline page and web push. Offline writes queue in IndexedDB (Dexie) and replay through idempotent RPCs.
- **Strings externalised** in `web/src/messages/en.json` behind a small `t()` helper, ready for a Hindi bundle in phase 2.
- **Client data fetching**: list and detail screens use TanStack Query in client components with the user's session, so RLS still shapes every query and Realtime events update the cache directly. Layouts check the session on the server.
- **Password sign in for local demo users**, alongside phone OTP and email magic links. Public sign up is disabled: the system admin creates tenants and owners invite their team.
- **File paths**: `messages.media_path` and `purchase_orders.file_path` store `bucket/key`. Quotation and document paths are relative to their own bucket.
