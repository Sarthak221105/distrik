# PRD: AI Sales OS for Indian Manufacturers
Oct 18, 2026 · @Abhinay
## 1. Overview, Decisions and Assumptions
This PRD is the single build reference for the AI Sales OS: product scope, system architecture, backend, and frontend, on a Supabase only backend with WhatsApp and text as the first channels. Where it conflicts with the earlier Frontend PRD, Backend PRD and Vision Update documents, this document wins, because those assumed a separate Node or Python service.
### Locked decisions
| Area | Decision | Why |
| Data and backend platform | Supabase: Postgres, Auth, Storage, Realtime, Edge Functions, pg_cron, pgmq queues, pgvector | One managed platform, tenant isolation through row level security, no servers to run |
| Business logic | Supabase only. Pricing and consent rules live in SQL functions; integrations and AI live in Edge Functions (TypeScript on Deno) | Decided by you. Rules in the database cannot be bypassed by a bug in an app layer |
| Region | Supabase ap-south-1 (Mumbai) | Lowest latency for Indian users and data stays in India |
| First channels | WhatsApp and text. Voice AI is phase 2 | Decided by you. The data model and channel adapter leave a slot for voice |
| Frontend | Next.js (App Router, TypeScript) web app; the rep surface ships as an installable PWA | Chosen by me, rationale below |
| AI model | Claude, called only from Edge Functions, with tool use | Constrained actions, plus document and image input for purchase orders |
| WhatsApp | WhatsApp Business Platform Cloud API through an approved BSP, behind a provider adapter | The BSP can be swapped without touching business logic |
| Money | INR stored as integer paise | No floating point errors in pricing |
| Frontend hosting | Vercel or equivalent | Zero config Next.js hosting with preview deploys |

### Why Next.js with a PWA
One codebase and one design system serve all three surfaces: the manufacturer app, the rep app, and the ops console. Most reps in India work on Android, where a PWA installs from the browser with no app store review, supports offline writes and web push, and ships updates instantly. A React Native app is deferred until a need appears that a PWA cannot meet, such as on device call recording in phase 2.
### Assumptions
- The market is India only, B2B only, INR only; buyers are distributors, dealers, wholesalers and retailers.
- Conversations happen in English, Hindi and Hinglish; the product UI is English at launch with strings externalised for Hindi later.
- MVP volume is tens of manufacturers, thousands of prospects a month, and hundreds of conversations a day.
- Meta template approvals, a BSP account, and a legal review of each prospect data source are completed before launch.
- Reps log phone calls manually in MVP; there are no AI phone calls until phase 2.
## 2. Product Vision, Goals and Non-Goals
The manufacturer uploads a product, sets commercial rules, and names a market; the AI Sales OS finds buyers, talks to them on WhatsApp, negotiates inside the rules, generates quotations, and brings back only the decisions that need a human.
Positioning: an AI sales employee for Indian manufacturers, not a CRM and not a lead list. Data sourcing and automation are internal machinery; the outcome the manufacturer buys is orders from a new market.
### Goals (MVP)
- From one product upload and one market instruction, produce 50 to 100 scored, contactable prospects per campaign.
- Run consent respecting WhatsApp conversations that answer questions, share catalogues, qualify interest, and negotiate price inside manufacturer set limits.
- Guarantee in the database, not in a prompt, that no price outside the manufacturer's limits is ever quoted and no WhatsApp message is sent without consent or an approved template.
- Route every out of policy decision to the manufacturer as a one tap approval with full context.
- Generate a quotation PDF, read the buyer's purchase order, match it to the quotation, and create the order after the manufacturer confirms.
- Track prospects, deals, orders and reorder timing across cities, and flag accounts due for a repeat order.
### Non-goals (MVP)
- AI phone calls and call recording (phase 2); reps may call and log outcomes manually.
- Fully autonomous closing: pricing exceptions, credit and contract terms always need a human.
- Cold WhatsApp broadcasts to purchased number lists.
- Payment collection, logistics booking, or ERP and accounting integrations; shipment and payment status are updated manually.
- Multi country, multi currency, or consumer (B2C) selling.
- A native mobile app.
### MVP in one line
One manufacturer can upload a product, set rules, start a campaign in one city, review prospects, let the AI converse and negotiate on WhatsApp, approve exceptions, send a quotation, confirm an order from a matched PO, and see the pipeline.
## 3. Users and Personas
Five roles use the product; four log in and one, the buyer, only ever sees WhatsApp and a quotation link.
| Persona | Main jobs | Surface | Access |
| Manufacturer owner | Set up products and rules, approve exceptions, read results | Manufacturer web app, rep PWA for approvals | Everything inside their own tenant |
| Sales head | Manage reps, approve within a delegated limit, watch the pipeline | Manufacturer web app | Tenant data; approvals up to their approval limit |
| Sales rep | Take escalated and qualified leads, log calls, hand conversations back to the AI | Rep PWA | Only prospects assigned to them |
| Platform ops admin | Gate prospect quality, review AI conversations, manage templates and sources | Ops console | Cross tenant access through audited paths only |
| Buyer (distributor, dealer, retailer) | Ask questions, negotiate, receive quotations, send purchase orders | WhatsApp, quotation PDF | No login; contacted only with consent |

Roles are stored in profiles and carried in the user's JWT as app_role, next to manufacturer_id. Each user also has an approval_limit_paise that caps the deal value or discount they may approve.
## 4. End to End Workflow and Autonomy Model
A deal moves from setup to repeat order along one loop, and the manufacturer is needed at only two points: approving exceptions and confirming orders.
deal workflow · 12 steps, 1 decision
Every step outside the highlighted two runs without a person. The approval step opens only when a buyer asks for something outside the manufacturer's rules, and the loop restarts when a reorder falls due.
### Autonomy tiers
| Tier | Meaning | Examples |
| Autonomous | The AI acts without asking | Research buyers, send the approved catalogue, follow up, answer standard product questions, schedule a callback |
| Approval required | The AI prepares the action and a person confirms it before it goes out | A price below the floor, special payment terms, credit, samples, a custom quotation |
| Human only | The AI informs and never acts | Contract changes, legal commitments, large credit exposure, appointing a strategic distributor |

The tier for each action type lives in autonomy_policies and is set per manufacturer. Defaults are conservative, and a class of decisions moves toward autonomous only after the audit trail shows the AI handling it correctly. One rule never changes: the AI quotes only prices returned by evaluate_offer.
## 5. System Architecture Overview
The system is Postgres with the rules inside it, a thin layer of Edge Functions around it, and a Next.js app on top; nothing else needs to run.
system architecture · clients, Supabase, external services
Browsers talk only to Supabase. Rules that must never fail (pricing, consent, stage order) live in SQL functions, so a bug in an app layer or an AI prompt cannot bypass them. Edge Functions are stateless and exist only to reach the outside world: WhatsApp, Claude, geocoding and push.
### Components
| Component | Responsibility |
| Next.js app (Vercel) | Three surfaces: manufacturer app, rep PWA, ops console |
| Supabase Auth | Phone OTP and email login; a token hook adds tenant and role to the JWT |
| PostgREST and RPC | Client reads and writes under row level security |
| Realtime | Pushes approvals, messages, notifications and prospect changes to open sessions |
| Storage | Catalogues, quotation PDFs and purchase orders in private buckets |
| Postgres | State machine for every workflow, with rules in SQL functions |
| pgmq and pg_cron | Durable queues, and the scheduler that wakes workers |
| pgvector and PostGIS | Knowledge retrieval for the AI, and the market map |
| Edge Functions | Webhooks, workers, AI calls, PDF generation, notifications |

### Design rules
- Postgres is the source of truth and the state machine; Edge Functions hold no state.
- Anything slow or retryable goes through a queue, and every worker is idempotent.
- The service role key and every provider secret exist only inside Edge Functions.
- The AI never touches the database directly; it calls tools that run server side and pass through the same rules.
### Inbound message flow
- A buyer replies on WhatsApp and the BSP calls whatsapp-webhook.
- The webhook verifies the signature, stores the message once, updates consent and the 24 hour window, queues an AI turn, and returns 200.
- pg_cron wakes ai-reply, which claims the turn and loads the conversation, prospect and product facts.
- Claude drafts a reply and calls tools; any price comes from evaluate_offer, and anything outside the rules becomes an approval request.
- The reply passes the price validator, then enqueue_outbound_message applies the consent gate.
- outbound-sender delivers it through the BSP, and delivery status flows back through the webhook.
### Approval flow
When evaluate_offer returns needs_approval, a human_approvals row is created and a notification goes out over Realtime and web push. The owner decides in the approval queue; decide_approval records the decision and queues an AI turn, so the conversation resumes with it.
### Limits of a Supabase only backend
Edge Functions have bounded execution time and CPU, and there are no long running workers. The design copes by splitting work into short queue steps and polling the queues from pg_cron. If one worker outgrows the limits, it can move to a container service that reads the same queue and database without changing the contract (see section 18).
## 6. Data Model and Row Level Security
Postgres is the single source of truth and the state machine for every workflow. Every tenant table carries manufacturer_id, money is bigint paise, and all timestamps are timestamptz in UTC.
### Tables by area
| Area | Table | Key columns | Notes |
| Tenancy | manufacturers | id, name, gstin, state, settings | Tenant root |
| Tenancy | profiles | user_id, manufacturer_id, role, approval_limit_paise, phone | Roles: owner, sales_head, rep, ops_admin |
| Company Brain | products | id, manufacturer_id, name, sku, category, specs, mrp_paise, distributor_price_paise, moq, hsn_code, gst_rate | One row per sellable item |
| Company Brain | discount_rules | product_id, qty_from, floor_price_paise, hard_minimum_paise, max_discount_pct, payment_terms, max_credit_paise | Tiered by quantity; floor is what the AI may offer alone |
| Company Brain | autonomy_policies | manufacturer_id, action_type, tier, threshold | Tier is autonomous, approval or human_only |
| Company Brain | documents | id, manufacturer_id, storage_path, kind, status | Catalogues, certificates |
| Company Brain | knowledge_chunks | id, manufacturer_id, product_id, content, embedding | pgvector retrieval for specs and FAQs |
| Market | campaigns | id, manufacturer_id, product_ids, objective_text, target_geo, target_count, status | One per Start Sales instruction |
| Market | sources | id, name, adapter, lawful_basis, terms_note, enabled | Governs ingestion |
| Market | raw_records | id, campaign_id, source_id, payload, status | Untouched source data |
| Market | prospects | id, campaign_id, manufacturer_id, name, type, category, address, geo, source_id, confidence, fit_score, fit_breakdown, research, review_status, stage, assigned_rep_id | The core object |
| Market | contacts | id, prospect_id, name, role, phone_e164, email, is_primary | Decision makers |
| Messaging | consents | id, contact_id, channel, status, source, evidence, changed_at | none, engaged, opted_in, opted_out |
| Messaging | conversations | id, prospect_id, contact_id, channel, window_expires_at, ai_paused, last_inbound_at | One thread per contact and channel |
| Messaging | messages | id, conversation_id, direction, body, media_path, provider_message_id, status, template_id, actor | Immutable log; provider_message_id is unique |
| Messaging | message_templates | id, name, language, body, meta_status, category | Meta approval state |
| Messaging | followups | id, conversation_id, due_at, reason, attempt, status | Scheduler input |
| Sales | negotiations | id, prospect_id, product_id, qty, status | One per price discussion |
| Sales | negotiation_offers | id, negotiation_id, by_party, price_paise, decision, rule_snapshot | Every ask and answer |
| Sales | human_approvals | id, negotiation_id, quotation_id, kind, requested_paise, permitted_paise, status, decided_by, expires_at | The approval queue |
| Sales | quotations | id, prospect_id, negotiation_id, number, lines, subtotal_paise, tax_paise, total_paise, valid_until, pdf_path, version | Versioned |
| Sales | purchase_orders | id, quotation_id, prospect_id, file_path, parsed, confidence, match_status, diffs | PO intake |
| Sales | orders | id, manufacturer_id, prospect_id, quotation_id, po_id, status, total_paise, confirmed_by | Created only after confirmation |
| Sales | shipments, payments | order_id, status, tracking_ref, due_date, amount_paise | Updated manually in MVP |
| Sales | reorder_predictions | id, prospect_id, product_id, predicted_date, confidence, status | Nightly job |
| Operations | ai_actions | id, manufacturer_id, conversation_id, agent, action_type, input, output, rule_checked, outcome, model, prompt_version | Full audit trail |
| Operations | notifications, audit_log, prompt_versions, product_events | See sections 11 and 15 | Supporting tables |
| Phase 2 | calls | prospect_id, direction, transcript, extracted_fields, recording_path | Created empty, unused in MVP |

Extensions: pg_trgm, postgis, vector, pgmq, pg_cron, pg_net, pgcrypto with Supabase Vault for secrets.
### Isolation with row level security
A Custom Access Token Hook copies manufacturer_id and app_role into the JWT (the built in role claim stays authenticated). Every tenant table enables RLS with a tenant policy, and tables with assignment rules add a restrictive policy on top.
alter table prospects enable row level security;create policy tenant_isolation on prospects  for all to authenticated  using (manufacturer_id = (auth.jwt() ->> 'manufacturer_id')::uuid)  with check (manufacturer_id = (auth.jwt() ->> 'manufacturer_id')::uuid);-- reps see only the prospects assigned to themcreate policy rep_assigned on prospects  as restrictive for select to authenticated  using ((auth.jwt() ->> 'app_role') <> 'rep' or assigned_rep_id = auth.uid());
### Rules enforced in the database
Three functions carry the rules that must never depend on an AI prompt or an app bug. All run as security definer with a fixed search_path.
-- the only code path that produces a price for a buyercreate function evaluate_offer(p_product uuid, p_qty int, p_requested_paise bigint)returns table (decision text, floor_paise bigint, reason text)language plpgsql security definer set search_path = public as $$begin  -- load the tier for p_qty: floor_price_paise and hard_minimum_paise  -- accept          when p_requested_paise >= floor  -- needs_approval  when below floor but >= hard minimum  -- reject          when below hard minimum  -- always return the floor as the counter priceend $$;-- the only code path that queues a WhatsApp messagecreate function enqueue_outbound_message(p_conversation uuid, p_body text, p_template uuid default null)returns uuidlanguage plpgsql security definer set search_path = public as $$begin  -- raise unless consent is engaged or opted_in for this contact and channel  -- raise unless now() < window_expires_at, or p_template is Meta approved  -- raise when the manufacturer's daily outbound cap is reached  -- insert into messages as queued and send to the pgmq queue outbound_messagesend $$;
A third function, set_stage, validates pipeline transitions against a transition table so a prospect cannot skip from New to First Order. Key indexes: GIN trigram on prospects.name, GiST on prospects.geo, unique on messages.provider_message_id, HNSW on knowledge_chunks.embedding, and a partial index on human_approvals where status is pending.
## 7. Backend: Discovery, Scoring and Prospect Pipeline
A campaign turns a plain language objective into 50 to 100 reviewed, scored prospects through a chain of queue driven steps, each short enough for one Edge Function invocation.
### Pipeline
- Create campaign. The create_campaign RPC stores the objective, parses geography and target count with Claude (structured output), and enqueues one ingest job per enabled source.
- Ingest. ingest-worker runs a source adapter (fetch(geo, category) returning raw records) and writes untouched payloads to raw_records. Manual CSV uploads from ops use the same path through a CSV adapter, so partly manual sourcing in MVP flows through the identical pipeline.
- Normalize. A SQL function standardises names, formats phone numbers to E.164, and cleans addresses; an Edge Function geocodes and stores a PostGIS point.
- Deduplicate. pg_trgm similarity on name plus an exact phone match. Above 0.85 similarity the records merge automatically, keeping the highest confidence source; between 0.6 and 0.85 they go to the ops merge queue. Matching runs inside the campaign and against the manufacturer's existing prospects.
- Classify. classify-worker asks Claude for a category from the manufacturer's taxonomy with a confidence score; below 0.7 the record goes to ops instead of being guessed.
- Research. For each surviving prospect, research-worker summarises public information (brands carried, estimated scale, decision makers) into prospects.research with source URLs; anything without a URL is labelled inferred.
- Score. score_prospect(prospect_id) in SQL applies the manufacturer's weighted criteria and stores fit_score and fit_breakdown.
- QA gate. Records enter review_status = pending; ops approves, edits or rejects batches in the console. Only approved records are visible to the manufacturer.
- Release. The campaign moves to ready; the manufacturer approves outreach in bulk or per prospect.
### Fit scoring
fit_score is the sum of weight times signal over seven configurable criteria. Default FMCG weights: category match 25, geographic coverage 20, brands carried 15, retail network 15, logistics 10, territory availability 10, company size 5. A missing signal takes a neutral value and is flagged in the breakdown, never silently counted as zero. The breakdown stores criterion, weight, raw signal and contribution, so the interface shows reasoning without recomputing. Changing weights bumps fit_config_version and queues a rescore.
### Acceptance criteria
- A campaign with a valid objective reaches ready with 50 to 100 approved prospects, or reports exactly which step stalled.
- Re running any step never creates duplicate prospects or raw records.
- Every prospect shows its source, a confidence flag (verified or inferred), and its fit breakdown.
- A source that is disabled, or has no recorded lawful basis, is never run.
## 8. Backend: Messaging, Consent and WhatsApp Integration
Every outbound message passes one database function that checks consent and the WhatsApp session window, so no code path can skip the rules.
### Channel adapter
Edge Functions talk to channels through one TypeScript interface: send(message), parseInbound(payload) and parseStatus(payload). WhatsApp is the only live adapter in MVP; SMS and email are thin stubs; voice is a reserved adapter for phase 2. Business logic never branches on channel.
### Consent model
| Consent status | How a contact gets there | What is allowed |
| none | Imported or discovered, never contacted | No WhatsApp. Reps may call; website forms, QR codes and referral links invite the contact to start a chat |
| engaged | The contact sent a message or tapped a click to chat link | Free form replies inside the 24 hour window; approved templates outside it |
| opted_in | Explicit opt in captured with evidence (form, reply, or existing customer import) | Approved templates and replies, including reorder reminders |
| opted_out | The contact sends STOP or asks not to be contacted | Nothing. Applied immediately and logged |

### Sending
- A caller (AI agent, rep action or scheduler) invokes enqueue_outbound_message.
- The function raises an error unless consent is engaged or opted_in, the session window is open or the template is Meta approved, and the daily outbound cap is not reached.
- It inserts the message as queued and pushes a job to the outbound_messages queue.
- outbound-sender, triggered every few seconds by pg_cron through pg_net, claims jobs, calls the BSP, stores provider_message_id, and updates status from delivery callbacks.
- Failures retry with exponential backoff; jobs that exhaust retries move to the dead letter view and alert ops.
### Receiving
whatsapp-webhook is a public Edge Function. It verifies the provider signature, inserts the message once (the unique provider_message_id makes duplicate deliveries harmless), sets consent to engaged, extends window_expires_at by 24 hours, enqueues an ai_turns job, and returns 200 immediately. Heavy work never happens inside the webhook.
### Follow ups
A followups table holds the next touch per conversation, for example day 1, day 3 and day 7. pg_cron enqueues the ones that are due; after the configured attempts the prospect is marked stale and surfaced to a rep. Follow ups outside the window use approved templates only.
### Acceptance criteria
- A message to a contact with no consent, or outside the window without an approved template, is rejected by the database and never reaches the BSP.
- Replaying the same webhook payload twice creates one message and one AI turn.
- An opt out takes effect before the next queued send for that contact.
- Every message, including AI messages, is stored with actor, status and timestamps.
## 9. Backend: AI Sales Agent, Product Brain and Negotiation Engine
The AI can talk but cannot decide a price: every number it quotes comes from a database function, and every fact it states comes from the manufacturer's own data.
### Product Brain and Company Brain
- Upload and extract. A catalogue upload lands in private Storage; catalogue-extract sends it to Claude with a JSON schema to propose products, specs, prices, MOQ and certifications. The manufacturer confirms every field on a review screen before anything becomes a product.
- Structured facts first. Prices, MOQs, discounts and terms live in typed columns (products, discount_rules), never only in text.
- Retrieval for the rest. Specs, FAQs and certificates are split into knowledge_chunks, embedded inside Edge Functions with Supabase's built in gte-small model, and searched with pgvector. Hindi retrieval quality is a known risk (see section 18); structured facts and an English knowledge base are the fallback.
- The Company Brain is the union of products, discount rules, autonomy policies, territories, existing customers and contracts, and knowledge chunks. The AI reads from it and nowhere else.
### The agent loop
The ai_turns queue triggers one loop per inbound message:
- Load the conversation, prospect, fit breakdown, qualification fields, and the product facts relevant to the message.
- Call Claude with the active prompt version and a fixed tool set.
- Execute each tool call server side; the model never touches the database directly.
- Validate the drafted reply (see guardrails), then send it through enqueue_outbound_message.
- Write every model call, tool call, rule checked and outcome to ai_actions.
| Tool | What it does |
| get_product_facts | Returns structured product data and the top matching knowledge chunks |
| send_catalogue | Sends an approved catalogue or product document |
| propose_price | Calls evaluate_offer and returns its decision and allowed price |
| request_approval | Creates a human_approvals row and tells the buyer the manufacturer is checking |
| log_qualification_field | Records current suppliers, volume, decision maker, timeline or objections on the prospect |
| schedule_followup | Creates a follow up at a chosen time inside policy |
| escalate_to_human | Sets conversations.ai_paused, assigns a rep and notifies them |

### Guardrails
- Price validator. A drafted reply containing any rupee amount not returned by evaluate_offer in the same turn is blocked and regenerated; after two failures the turn escalates to a human.
- Prompt injection. Buyer messages are untrusted data. Tools take validated arguments, and no buyer text can change rules, tiers or tool permissions.
- Forced escalation. Contract terms, credit beyond policy, legal commitments, complaints and low model confidence pause the AI on that thread.
- Language. The agent replies in the buyer's language (English, Hindi or Hinglish); outside the window it uses approved templates.
- Versioning. Prompts live in prompt_versions, and each AI action stores the version and model used. Messages flagged in the ops console become an evaluation set.
### Negotiation Engine
evaluate_offer(product, qty, requested_price) reads the discount tier for the quantity and returns accept (the request is at or above the autonomous floor), needs_approval (below the floor but at or above the manufacturer's hard minimum), or reject (below the hard minimum), always with the floor as the counter price. Example: with a floor of ₹558 and a hard minimum of ₹540, a request for ₹540 returns needs_approval with a counter of ₹558, and the AI tells the buyer it is checking. Every ask and answer is stored in negotiation_offers with a snapshot of the rule applied.
### Acceptance criteria
- Across a randomised test suite, the AI never states a price that evaluate_offer did not return in that turn.
- A buyer message telling the AI to ignore its rules changes nothing.
- Every AI message links to an ai_actions row showing the tools called and the rule checked.
- An escalated thread stays silent until a human replies or clears the pause.
## 10. Backend: Approvals, Quotations, Purchase Orders and Orders
### Approvals
- human_approvals rows move through pending, approved, rejected, countered and expired. Each carries the AI's recommendation, the negotiation history, and an expiry (default 24 hours, configurable).
- decide_approval(id, decision, counter_paise) is the only way to resolve one. It checks the decider's role and approval_limit_paise, updates the negotiation, writes ai_actions, and enqueues an AI turn so the conversation continues with the decision.
- autonomy_policies decides which actions need which tier, per manufacturer. Defaults: autonomous for research, catalogue sharing, follow ups and standard answers; approval for a price below the floor, special payment terms, credit, samples and custom quotations; human only for contract changes, legal commitments and large credit exposure.
- A pending approval notifies immediately and sends a reminder at half the expiry. An expired approval tells the AI to hold the last allowed offer.
### Quotations
- When a negotiation settles at a price the rules allow, or an approval is granted, a job lands in quotation_jobs.
- quotation-pdf builds the PDF with pdf-lib from product lines, agreed price, quantity, GST per the manufacturer's configuration, shipping, payment terms and validity, using a per manufacturer numbering sequence.
- The file is stored in a private bucket, the quotations row is versioned, and the PDF is sent as a WhatsApp document.
- Any change after sending creates a new version; older versions stay readable.
### Purchase orders
- A PO arrives as a WhatsApp document or image, or a rep uploads it; the file is stored privately.
- po-parse sends it to Claude with a JSON schema (PO number, lines, quantities, prices, taxes, delivery address, dates) and records a confidence per field.
- A SQL matcher compares the parsed PO with the latest sent quotation and sets match_status to matched, mismatch (with a field level diff), or needs_review (low confidence).
- Only matched POs reach the manufacturer's confirmation screen as ready. Mismatches and low confidence cases show the diff and are never resolved automatically.
### Orders, shipments and payments
- confirm_order(po_id, override_reason) creates the order after a manufacturer user confirms. A PO that is not matched needs an override reason, which is logged.
- In MVP, shipment status (dispatched, in transit, delivered) and payment status (due, paid, overdue) are updated manually by the manufacturer or rep; carrier and payment integrations are phase 2.
### Acceptance criteria
- A price below the floor cannot reach a quotation without an approved human_approvals row.
- Every quotation and order traces back through negotiation, approval and AI actions in one audit view.
- A PO that differs from its quotation in quantity, price or product is flagged and becomes an order only through a logged override.
## 11. Backend: Reorders, Notifications and Analytics
### Reorders
- A nightly pg_cron job runs compute_reorders() in SQL. For each account and product with at least two orders it takes the average gap between orders and sets predicted_date to the last order date plus that gap, with confidence rising with order count and falling with gap variance.
- Status moves from upcoming to due (within a configurable lead window, default 5 days) to overdue (past the date with no order).
- When an account becomes due, a reorder conversation is enqueued. The contact has ordered, so consent is opted_in and the message passes the normal consent gate. A plain reminder is an autonomous action; any change in price still goes through evaluate_offer.
- Overdue accounts with no reply after the follow up cadence surface to the owning rep as at risk.
### Notifications
| Trigger | Who is told | Channels |
| Approval needed or about to expire | Owner, and sales head within their limit | In app, web push, email |
| Qualified lead or AI escalation | Assigned rep | In app, web push |
| PO matched, mismatched or needs review | Owner, sales head | In app, email |
| Buyer replied to a quotation | Assigned rep | In app |
| Reorder due or overdue | Assigned rep | In app, web push |
| Source failure, dead letter, stuck queue | Ops admin | In app, email |

A notifications row is written first. Supabase Realtime pushes it to open sessions, and the notify Edge Function sends web push (VAPID) and email for the rest. A key per event and user suppresses duplicates.
### Analytics
- SQL views and materialized views, refreshed by pg_cron, provide the funnel (identified, contacted, conversations, qualified, quoted, ordered), conversion by city, revenue over time, reorder rate, and AI health: autonomy rate, approval rate, escalation rate, validator blocks, and median approval turnaround.
- Views run with the caller's rights so row level security applies; nothing aggregates across tenants except for ops admins.
- The frontend writes product events (screen views, approvals decided, campaigns started) to a product_events table, and optionally to a product analytics tool.
### Acceptance criteria
- An account with at least two orders has a prediction by the next morning, and a changed order updates it on the next run.
- An approval request notifies the right users within seconds and never a user outside the tenant.
- Dashboard figures match the underlying rows for the same filters.
## 12. API Surface, Queues and Edge Functions Catalogue
Browsers read and write through PostgREST and RPC with row level security. Only integrations and AI use Edge Functions with the service role key, which never leaves the server.
### Edge Functions
| Function | Trigger | Purpose |
| whatsapp-webhook | Public HTTPS, signature verified | Receive messages and status callbacks, insert once, enqueue an AI turn |
| outbound-sender | pg_cron every few seconds | Claim outbound jobs, send through the BSP, update status |
| ai-reply | pg_cron on the ai_turns queue | Run the agent loop for one inbound message |
| ingest-worker | Queue | Run a source adapter for a campaign |
| classify-worker | Queue | Categorise records and flag low confidence |
| research-worker | Queue | Summarise public information per prospect |
| catalogue-extract | After upload | Propose structured products from a catalogue |
| embeddings-index | Queue | Chunk and embed documents |
| quotation-pdf | Queue | Generate and send a quotation |
| po-parse | Queue | Extract and match a purchase order |
| notify | Queue | Web push and email delivery |
| erase-contact | Authenticated, ops only | Delete or anonymise a contact across all tables |

### Client facing RPCs
| RPC | Used by | Effect |
| create_campaign | Manufacturer | Parse the objective, create the campaign, enqueue ingestion |
| approve_prospects | Ops, manufacturer | Bulk approve or reject prospects |
| set_stage | Rep, manufacturer | Validated pipeline transition with an event row |
| decide_approval | Owner, sales head | Approve, reject or counter a request |
| confirm_order | Owner, sales head | Create an order from a matched PO |
| pause_ai, resume_ai | Rep, owner | Take over or hand back a conversation |
| update_fit_weights | Owner | Change scoring weights and trigger a rescore |

Also exposed with RLS: tables and views for campaigns, prospects, conversations, messages, negotiations, quotations, orders, analytics and notifications; Realtime channels for human_approvals, messages, notifications and prospects; and private Storage buckets for catalogues, quotations and POs, read through signed URLs.
### Queues and workers
pgmq queues: ingest, classify, research, score, outbound_messages, ai_turns, quotation_jobs, po_parse, notifications, embeddings. Each worker claims a small batch with a visibility timeout, does one bounded unit of work, and deletes or retries the message. Messages past the retry limit are archived and appear in a dead letter view in the ops console. Conversational queues are polled every few seconds; batch queues every minute.
### Conventions
- Mutations that can be retried take an idempotency key.
- Errors use one shape: code, message, field.
- Lists page by cursor, never by offset.
- Webhook and worker endpoints are not part of the public client contract.
## 13. Frontend Architecture
One Next.js codebase serves three surfaces behind role aware route groups, with Supabase Auth, Realtime and generated types as the spine.
### Stack
| Concern | Choice |
| Framework | Next.js (App Router), TypeScript strict |
| Styling and components | Tailwind CSS, shadcn/ui on Radix primitives |
| Data access | @supabase/ssr and supabase-js, with types generated from the database schema |
| Server state | TanStack Query, invalidated by Realtime events |
| Local UI state | Zustand, only for ephemeral UI such as filters and wizard steps |
| Forms and validation | react-hook-form with zod, schemas shared with RPC argument types |
| Charts and maps | Recharts (or visx) and MapLibre GL |
| PWA and offline | Serwist service worker, IndexedDB queue through Dexie, Web Push (VAPID) |
| i18n | next-intl with English strings externalised; Hindi UI in phase 2 |
| Quality | ESLint, Prettier, Vitest, Playwright, Sentry |

### Route structure
app/  (auth)/login, verify  (manufacturer)/dashboard, campaigns, campaigns/[id], prospects/[id],                 approvals, pipeline, quotations, orders, analytics, products, settings  (rep)/today, leads/[id], reorders, notifications  (ops)/qa, sources, ai-review, templates, tenants, jobs
### Rendering and data
- Server components fetch list and detail data with the signed in user's session, so row level security shapes every query; client components handle interaction.
- Realtime subscriptions power the approval queue, conversation threads, notification badge and campaign progress; each one updates the query cache instead of refetching whole pages.
- Mutations call RPCs and use optimistic updates only where a rollback is cheap, such as stage changes and notes.
### Authentication and authorisation
- Phone OTP and email magic link through Supabase Auth, with sessions in cookies via @supabase/ssr.
- A Custom Access Token Hook adds manufacturer_id and app_role to the JWT; middleware routes each user to their surface and blocks the other groups.
- Frontend checks are a convenience. Row level security and RPC role checks are the real enforcement.
### PWA and offline (rep surface)
- Installable, with an app shell cached so the app starts offline.
- Offline writes (call logs, notes, stage changes) go to an IndexedDB queue with client timestamps and sync when the connection returns, with a visible pending count.
- On conflict the server's last write wins per field; stage changes are re validated by set_stage on sync and rejected with an explanation if no longer valid.
- Web push covers approvals, escalations and reorder alerts. Offline, a thread shows its last cached messages; sending needs a connection.
### Design system
Shared components across surfaces: FitScoreBadge, ProspectCard, StagePill, ConsentTag, TierBadge, ApprovalCard, PriceGuardrailMeter (requested price against floor and hard minimum), ConversationThread (AI and human messages visually distinct, tool actions inline), QuotationPreview, POMatchTable (field level diff), AutonomyPolicyEditor, KPI card, DataTable, EmptyState, LoadingSkeleton and ConfirmDialog. Tokens for colour, type and spacing live in one theme file with light and dark modes.
### Performance and accessibility
- Rep PWA: largest contentful paint under 2.5 seconds on a mid range Android over 4G, route level code splitting, and no chart libraries on rep routes.
- Manufacturer and ops tables virtualise beyond a few hundred rows.
- WCAG 2.1 AA: colour is never the only signal, web surfaces work fully by keyboard, icon buttons carry labels, and focus is always visible.
## 14. Frontend Screens and Requirements
### Manufacturer web app
| Screen | Purpose | Key content | Live data |
| Onboarding and products | Get a product into the Product Brain | Catalogue upload, extracted fields to confirm beside the source, images, documents, certifications | Extraction progress |
| Commercial rules | Set what the AI may offer | Per product tiers (floor, hard minimum, MOQ, discount cap, payment terms, credit limit) and an autonomy policy per action | None |
| Start Sales | Launch a campaign | Plain language objective box, product picker, geography, target count, and a parsed intent preview to confirm | Campaign status |
| Campaign detail | Follow one market | Progress tracker (discovering, scoring, QA, ready, live), prospect list with fit breakdown panel, market map, bulk approve for outreach | Prospect counts |
| Prospect detail | One buyer | Profile, fit and research with sources, consent state, conversation thread, qualification fields, negotiation timeline, quotations, POs | New messages |
| Approval queue | Decide exceptions | ApprovalCard with the ask, floor, hard minimum, deal value, margin and AI recommendation, plus negotiation history; Approve, Counter with a value, or Reject | New and expiring approvals |
| Pipeline | See deals by stage | Kanban of the eight stages, filters by city, rep and product | Stage changes |
| Quotations and POs | Check documents | Quotation versions; PO beside quotation with the field diff; confirm order, with an override reason when needed | PO status |
| Orders | Follow delivery and payment | Order list, manual shipment and payment status updates | None |
| Analytics | Understand performance | Funnel, conversion by city, revenue, reorder rate, AI health | Refreshed views |
| Settings | Administer | Team and roles, approval limits, templates and channels, fit weights, data export | None |

### Rep PWA
| Screen | Purpose | Key content |
| Today | The day's work | Escalated and qualified leads by urgency, approvals within the rep's limit, reorders due |
| Lead | Work one buyer | Profile, fit score, talking points from the AI's reason to switch, thread with pause and resume AI, one tap WhatsApp and call, call log form, stage change sheet |
| Reorders | Keep accounts alive | Due and overdue accounts with last order, predicted date and a suggested message |
| Notifications | Stay current | Push history with deep links |

### Ops console
| Screen | Purpose | Key content |
| QA queue | Gate prospect quality | Batch review drawer showing raw against normalised fields; edit, approve, reject, bulk approve |
| Merge duplicates | Resolve gray zone matches | Side by side candidates with differing fields highlighted and a one tap merge |
| Sources | Keep sourcing healthy | Yield, freshness, error rate, lawful basis note, enable or disable |
| AI review | Improve the agent | Filterable transcripts with tool calls and rules inline, flag with a reason, evaluation set |
| Templates | Manage WhatsApp templates | Submission status, Meta approval state, language, usage |
| Tenants and jobs | Operate the platform | Manufacturer setup, queue depth, dead letters with retry |

### Screen states
Every screen defines a loading state (a skeleton matching the layout), an empty state (what is missing and the next action), and an error state (what failed and a retry). Errors never discard user input.
### Acceptance criteria for critical flows
- Product upload. A manufacturer uploads a catalogue, sees extracted fields beside the source, edits any field, and saves; nothing becomes a product until confirmed.
- Start Sales. Typing an objective shows the parsed market, product and target count for confirmation before any job runs.
- Approval. An approval appears in the owner's queue within seconds of the AI requesting it, shows the margin at the requested price, and the buyer conversation resumes automatically after the decision.
- Rep offline. A rep with no signal can log a call and change a stage; both sync on reconnect with a clear result for each.
## 15. Security, Privacy and Compliance
### Access control
- Row level security is on every table and tested with automated cross tenant checks; reps are further limited to assigned prospects by a restrictive policy.
- The service role key lives only in Edge Function secrets and Supabase Vault. The browser holds the anon key and the user's JWT.
- Storage buckets are private and read through short lived signed URLs; bucket policies mirror the table rules.
- Ops admin access crosses tenants only through audited paths and is recorded in audit_log.
### Data protection
- Encryption in transit and at rest; point in time recovery is enabled on production.
- Phone numbers and contact names are personal data: minimum retention, access logged, and no personal data in logs or AI prompts beyond what the task needs.
- Webhooks verify provider signatures, and public functions are rate limited.
### AI safety
- Prices come only from evaluate_offer, and the reply validator blocks any other amount.
- Buyer content is untrusted input; tools validate their arguments and cannot widen their own permissions.
- Every AI decision is stored with its prompt version and model for later review.
### India specific compliance
- DPDP Act 2023. Each source and each contact has a recorded lawful basis and consent evidence. erase-contact deletes or anonymises a person across messages, contacts and analytics on request.
- WhatsApp Business policy. Opt in and opt out tracking, approved templates only outside the window, and no bulk cold messaging. A breach puts the business account itself at risk.
- SMS. India requires DLT registration of sender ids and templates for commercial SMS, so SMS stays disabled until that is done.
- GST. Quotations carry GSTIN, HSN and tax lines per the manufacturer's configuration; tax rules are confirmed with the manufacturer's accountant before launch.
- Calls (phase 2). Call recording needs disclosure and consent under Indian telecom rules and must be reviewed before voice launches.
## 16. DevOps, Environments, Testing and Observability
### Environments
Local development uses the Supabase CLI. A staging project and a production project both run in Mumbai, and staging uses WhatsApp and BSP sandboxes so a test can never message a real buyer. Schema changes ship only as migration files in the repository.
### Delivery pipeline
- Pull request: lint, type check, generated types up to date, unit tests.
- Database tests with pgTAP: row level security, evaluate_offer, the consent gate, stage transitions.
- Edge Function tests on Deno, using recorded provider fixtures.
- Merge to main: apply migrations and deploy functions to staging, then run Playwright end to end tests.
- Manual promotion to production; Vercel deploys the frontend with a preview URL per pull request.
### Test priorities
| Area | What must be proven |
| Tenant isolation | A user of one manufacturer can never read or write another's rows |
| Pricing | Property tests show evaluate_offer never returns accept below the floor |
| Consent | Sends without consent, outside the window, or after an opt out are rejected |
| Idempotency | Replayed webhooks and retried jobs create no duplicates |
| AI behaviour | A golden set of English, Hindi and Hinglish conversations, including price pressure and injection attempts, passes before any prompt change ships |
| PO parsing | Accuracy is measured on a labelled set of real purchase orders; uncertain fields are flagged, not guessed |

### Observability
- Structured logs from Edge Functions, with a correlation id carried from webhook to reply.
- Sentry for the frontend and the functions.
- Ops views for queue depth, oldest message age, dead letters, send failure rate, AI escalation rate and source yield, with alerts on thresholds.
- Backups and restore drills on a schedule.
## 17. Success Metrics and Roadmap
### MVP success metrics
| Metric | Target to prove |
| Prospects delivered per campaign | 50 to 100, with at least 80% rated relevant by the manufacturer |
| Time from Start Sales to first outreach | Under 5 business days |
| Prospect to reply rate on WhatsApp | Tracked per campaign; baseline set over the first 10 campaigns |
| Reply to qualified lead rate | Tracked per campaign |
| Quotation to order conversion | Tracked per manufacturer |
| Approval turnaround | Median under 4 hours |
| Guardrail violations (price outside rules, send without consent) | Zero |
| Manufacturers served | 10 to 20 before widening scope |

### Roadmap
| Phase | Scope |
| MVP | Auth and tenancy; Product Brain and commercial rules; Start Sales campaigns with partly manual discovery; ops QA; WhatsApp conversations behind the consent gate; AI agent with negotiation and approvals; quotation PDFs; PO parsing with human confirmation; pipeline; basic dashboard; rep PWA |
| Phase 2 | Voice AI calling and call recording; reorder conversations at scale; carrier and payment tracking; more discovery sources; Hindi UI; email digests; deeper analytics |
| Phase 3 | Multiple verticals with their own fit models; ERP and accounting integrations such as Tally; a native app if the PWA falls short; progressive autonomy as the audit trail earns it |

### Build order inside the MVP
- Foundations: schema, row level security, auth hook, CI, queues and cron.
- Product Brain, commercial rules, and the manufacturer shell.
- Campaigns, the discovery pipeline, ops QA, and prospect views.
- WhatsApp adapter, consent gate, webhook and sender.
- AI agent, evaluate_offer, approvals and the approval queue.
- Quotations, PO parsing, orders, pipeline and dashboard.
- Rep PWA with offline queue and push, then hardening and a pilot manufacturer.