// ingest-worker (PRD 7): runs one source adapter for one campaign job and
// writes untouched payloads to raw_records (idempotent on external id), then
// normalises the campaign (which queues classification). A source that is
// disabled or has no lawful basis never runs.

import { type CanonicalRecord, generateDemoDirectory, recordCount } from "../_shared/demo_directory.ts";
import { config } from "../_shared/env.ts";
import { cityByName } from "../_shared/india_cities.ts";
import { errorMessage } from "../_shared/log.ts";
import { rpc } from "../_shared/supabase.ts";
import { PermanentError, serveWorker } from "../_shared/worker.ts";

interface Campaign {
  id: string;
  manufacturer_id: string;
  target_city: string | null;
  target_state: string | null;
  target_category: string | null;
  target_count: number;
  product_ids: string[];
}

class NonRetryable extends Error {}

async function googlePlaces(c: Campaign, max: number): Promise<CanonicalRecord[]> {
  const key = config.googlePlacesKey();
  if (!key) throw new NonRetryable("GOOGLE_PLACES_API_KEY is not set; the google_places source cannot run");
  const city = c.target_city ?? "";
  const query = `${(c.target_category ?? "FMCG").replace(/_/g, " ")} distributors wholesalers in ${city}`;
  const out: CanonicalRecord[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3 && out.length < max; page++) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.types,places.businessStatus,places.addressComponents,nextPageToken",
      },
      body: JSON.stringify({ textQuery: query, regionCode: "IN", languageCode: "en", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 400 || res.status === 403) throw new NonRetryable(`Places API ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`Places API ${res.status}: ${body.slice(0, 200)}`);
    }
    // deno-lint-ignore no-explicit-any
    const data: any = await res.json();
    for (const p of data.places ?? []) {
      if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
      // deno-lint-ignore no-explicit-any
      const comp = (type: string) => (p.addressComponents ?? []).find((a: any) => (a.types ?? []).includes(type))?.longText ?? null;
      const types: string[] = p.types ?? [];
      out.push({
        external_id: `gp-${p.id}`,
        name: p.displayName?.text ?? "",
        phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
        email: null,
        address: p.formattedAddress ?? "",
        city: comp("locality") ?? city,
        state: comp("administrative_area_level_1") ?? c.target_state ?? "",
        pincode: comp("postal_code") ?? "",
        lat: p.location?.latitude,
        lng: p.location?.longitude,
        type: types.includes("supermarket") || types.includes("grocery_store") ? "retailer" : types.includes("wholesaler") ? "wholesaler" : "distributor",
        category_hint: c.target_category,
        website: p.websiteUri ?? null,
        source_url: p.googleMapsUri ?? null,
        contact_name: "",
        contact_role: "",
        brands: [],
        signals: {},
        verified: true,
        description: `Google Places listing (${types.slice(0, 3).join(", ")})`,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, max);
}

serveWorker<{ campaign_job_id: string }>({
  name: "ingest-worker",
  queue: "ingest",
  vt: 180,
  batch: 1,
  maxAttempts: 4,
  async handle(job, { svc, log: base, readCt }) {
    if (!job?.campaign_job_id) throw new PermanentError("job has no campaign_job_id");
    const log = base.child({ campaign_job_id: job.campaign_job_id });
    const { data: cj, error } = await svc.from("campaign_jobs").select("*").eq("id", job.campaign_job_id).maybeSingle();
    if (error) throw error;
    if (!cj) throw new PermanentError("campaign job not found");
    if (cj.status === "done") return;

    const [{ data: campaign }, { data: source }] = await Promise.all([
      svc.from("campaigns").select("id, manufacturer_id, target_city, target_state, target_category, target_count, product_ids").eq("id", cj.campaign_id).single(),
      svc.from("sources").select("*").eq("id", cj.source_id).single(),
    ]);
    const c = campaign as Campaign;
    const fail = async (msg: string) => {
      await svc.from("campaign_jobs").update({ status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", cj.id);
      await rpc(svc, "advance_campaign", { p_campaign: cj.campaign_id }).catch(() => {});
      log.error("ingest_failed", { error: msg, campaign_id: cj.campaign_id });
    };
    if (!source || !source.enabled || !String(source.lawful_basis ?? "").trim()) {
      await fail("Source is disabled or has no recorded lawful basis");
      return;
    }

    await svc.from("campaign_jobs").update({ status: "running", attempts: (cj.attempts ?? 0) + 1, started_at: new Date().toISOString(), error: null }).eq("id", cj.id);
    try {
      let records: CanonicalRecord[] = [];
      let category = c.target_category;
      if (!category && c.product_ids?.length) {
        const { data: prods } = await svc.from("products").select("category").in("id", c.product_ids);
        category = (prods ?? []).map((p: { category: string | null }) => p.category).find(Boolean) ?? null;
      }
      switch (source.adapter) {
        case "demo_directory":
          records = generateDemoDirectory({
            campaignId: c.id,
            city: c.target_city,
            state: c.target_state ?? cityByName(c.target_city)?.state ?? null,
            category,
            count: recordCount(Number(source.config?.per_run) || 60, c.target_count),
          });
          break;
        case "google_places":
          records = await googlePlaces({ ...c, target_category: category }, Math.min(60, c.target_count + 10));
          break;
        case "csv_upload":
          records = []; // rows arrive through import_prospect_records (manufacturer upload)
          break;
        default:
          throw new NonRetryable(`Unknown adapter ${source.adapter}`);
      }

      let inserted = 0;
      for (let i = 0; i < records.length; i += 100) {
        const rows = records.slice(i, i + 100).map((r) => ({
          manufacturer_id: c.manufacturer_id,
          campaign_id: c.id,
          source_id: source.id,
          external_id: r.external_id,
          payload: r,
        }));
        const { data, error: insErr } = await svc.from("raw_records")
          .upsert(rows, { onConflict: "campaign_id,source_id,external_id", ignoreDuplicates: true })
          .select("id");
        if (insErr) throw insErr;
        inserted += data?.length ?? 0;
      }
      await svc.from("campaign_jobs").update({ status: "done", records: records.length, finished_at: new Date().toISOString() }).eq("id", cj.id);
      await svc.from("sources").update({ last_run_at: new Date().toISOString() }).eq("id", source.id);
      const norm = await rpc<Record<string, number>>(svc, "normalize_campaign_records", { p_campaign: c.id });
      log.info("ingest_done", { campaign_id: c.id, adapter: source.adapter, records: records.length, inserted, normalized: norm });
    } catch (e) {
      const msg = errorMessage(e);
      if (e instanceof NonRetryable || readCt >= 4) {
        await fail(msg);
        return;
      }
      await svc.from("campaign_jobs").update({ status: "queued", error: msg.slice(0, 500) }).eq("id", cj.id);
      throw e;
    }
  },
});
