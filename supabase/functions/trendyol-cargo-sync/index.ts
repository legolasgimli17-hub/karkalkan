// Source snapshot of the deployed cargo synchronization function.
// Full production implementation intentionally remains readable here for acquisition transfer.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createTransactionPool } from "../_shared/postgres.ts";
import { captureMonitoringException } from "../_shared/observability.ts";
import { readJsonBody, requestError } from "../_shared/request-security.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const PROJECT_ORIGIN = (() => {
  try {
    return new URL(PROJECT_URL).origin;
  } catch {
    return "";
  }
})();
const DB_URL = Deno.env.get('KARKALKAN_DB_POOLER_URL') || "";
const sql = createTransactionPool(DB_URL);
const DAY_MS = 86_400_000,
  FIN_PAGE_SIZE = 1000,
  FIN_MAX_PAGES = 100,
  CARGO_PAGE_SIZE = 500,
  CARGO_MAX_PAGES = 100,
  MAX_INVOICES = 500,
  PACING_MS = 200,
  INSERT_BATCH = 500;
const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function allowedOrigin(o: string | null) {
  if (!o) return true;
  if (o === "https://karkalkan.vercel.app" || o === PROJECT_ORIGIN) return true;
  try {
    const u = new URL(o);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith("-krgzabdullah22-8562s-projects.vercel.app")
    );
  } catch {
    return false;
  }
}
function headers(o: string | null) {
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  };
  if (o && allowedOrigin(o)) {
    h["Access-Control-Allow-Origin"] = o;
    h["Access-Control-Allow-Headers"] = "authorization, apikey, content-type";
    h["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return h;
}
function json(s: number, b: unknown, o: string | null) {
  return new Response(JSON.stringify(b), { status: s, headers: headers(o) });
}
function validUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(v: number) {
  return Math.round(v * 100) / 100;
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
function uuid() {
  return crypto.randomUUID();
}
function basic(v: string) {
  const b = new TextEncoder().encode(v);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
function clean(v: unknown, max = 220) {
  const s = String(v ?? "").trim();
  return s && s.length <= max ? s : "";
}
function dayKey(ms: unknown) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  const p = fmt.formatToParts(new Date(n)),
    g = (t: string) => p.find((x) => x.type === t)?.value,
    y = g("year"),
    m = g("month"),
    d = g("day");
  return y && m && d ? `${y}-${m}-${d}` : null;
}
function rangeForDays(days: number) {
  const p = fmt.formatToParts(new Date()),
    g = (t: string) => Number(p.find((x) => x.type === t)?.value),
    today = Date.UTC(g("year"), g("month") - 1, g("day")) - 3 * 60 * 60 * 1000;
  return { start: today - (days - 1) * DAY_MS, end: Date.now() };
}
function windows(start: number, end: number) {
  const out: { start: number; end: number }[] = [];
  for (let cur = start; cur <= end; ) {
    const e = Math.min(end, cur + 15 * DAY_MS - 1);
    out.push({ start: cur, end: e });
    cur = e + 1;
  }
  return out;
}
function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}
function isCargoInvoice(row: any) {
  const values = [
    norm(row?.transactionType),
    norm(row?.description),
    norm(row?.transactionSubType),
  ];
  return values.some(
    (v) => v.includes("kargo fatura") || v === "cargo invoice",
  );
}
type InvoiceRef = { serial: string; day: string };
type CargoRow = {
  connection_id: string;
  user_id: string;
  invoice_serial_number: string;
  invoice_day: string;
  parcel_unique_id: string;
  order_number: string | null;
  shipment_package_type: string;
  amount: number;
  desi: number | null;
  updated_at: string;
};
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (!allowedOrigin(origin))
    return json(403, { error: "ORIGIN_NOT_ALLOWED" }, origin);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== "POST")
    return json(405, { error: "METHOD_NOT_ALLOWED" }, origin);
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer "))
    return json(401, { error: "UNAUTHORIZED" }, origin);
  const pub = JSON.parse(
    Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}",
  ).default;
  if (!PROJECT_URL || !pub || !sql)
    return json(503, { error: "SERVER_CONFIG" }, origin);
  const sb = createClient(PROJECT_URL, pub, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    { data: ud, error: ue } = await sb.auth.getUser(auth.slice(7)),
    user = ud?.user;
  if (ue || !user) return json(401, { error: "UNAUTHORIZED" }, origin);
  let body: any;
  try {
    body = await readJsonBody(req, 16 * 1024);
  } catch (error) {
    const failure = requestError(error);
    return json(failure.status, { error: failure.code }, origin);
  }
  const connectionId = String(body?.connection_id || ""),
    days = Number(body?.days || 30);
  if (!validUuid(connectionId))
    return json(400, { error: "INVALID_CONNECTION" }, origin);
  if (![7, 30].includes(days))
    return json(400, { error: "INVALID_RANGE" }, origin);
  const { data: conn, error: ce } = await sb
    .from("marketplace_connections")
    .select("id,marketplace,external_seller_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (ce) return json(500, { error: "DB_ERROR" }, origin);
  if (!conn || conn.marketplace !== "trendyol")
    return json(404, { error: "NOT_FOUND" }, origin);
  const sellerId = String(conn.external_seller_id || "");
  if (!/^\d{1,20}$/.test(sellerId))
    return json(400, { error: "INVALID_SELLER_ID" }, origin);
  const lockToken = uuid(),
    { start, end } = rangeForDays(days),
    startDay = dayKey(start)!,
    endDay = dayKey(end)!;
  let lockHeld = false;
  try {
    const locked =
      await sql`update public.marketplace_connections set sync_lock_token=${lockToken}::uuid,sync_lock_until=now()+interval '10 minutes' where id=${connectionId}::uuid and user_id=${user.id}::uuid and (sync_lock_until is null or sync_lock_until<now()) returning id`;
    if (!locked.length) return json(409, { error: "SYNC_IN_PROGRESS" }, origin);
    lockHeld = true;
    const kn = `kk.trendyol.${connectionId}.key`,
      sn = `kk.trendyol.${connectionId}.secret`,
      sec =
        await sql`select name,decrypted_secret from vault.decrypted_secrets where name in (${kn},${sn})`,
      map = new Map(
        sec.map((r: any) => [String(r.name), String(r.decrypted_secret || "")]),
      ),
      apiKey = map.get(kn) || "",
      apiSecret = map.get(sn) || "";
    if (!apiKey || !apiSecret)
      return json(409, { error: "CREDENTIALS_MISSING" }, origin);
    const authHeader = `Basic ${basic(`${apiKey}:${apiSecret}`)}`,
      userAgent = `${sellerId} - Karkalkan`,
      invoices = new Map<string, InvoiceRef>();
    for (const w of windows(start, end)) {
      let page = 0,
        totalPages = 1;
      do {
        if (page >= FIN_MAX_PAGES)
          return json(
            409,
            { error: "SYNC_TOO_LARGE", stage: "invoice_list" },
            origin,
          );
        const u = new URL(
          `https://apigw.trendyol.com/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/otherfinancials`,
        );
        u.searchParams.set("transactionType", "DeductionInvoices");
        u.searchParams.set("startDate", String(w.start));
        u.searchParams.set("endDate", String(w.end));
        u.searchParams.set("page", String(page));
        u.searchParams.set("size", String(FIN_PAGE_SIZE));
        let r: Response;
        try {
          r = await fetch(u, {
            headers: {
              Authorization: authHeader,
              "User-Agent": userAgent,
              Accept: "application/json",
            },
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
          });
        } catch {
          return json(
            502,
            { error: "TRENDYOL_NETWORK", stage: "invoice_list" },
            origin,
          );
        }
        if (r.status === 401)
          return json(401, { error: "TRENDYOL_UNAUTHORIZED" }, origin);
        if (r.status === 403)
          return json(502, { error: "TRENDYOL_FORBIDDEN" }, origin);
        if (r.status === 429)
          return json(429, { error: "TRENDYOL_RATE_LIMIT" }, origin);
        if (!r.ok)
          return json(
            502,
            {
              error: "TRENDYOL_HTTP_ERROR",
              status: r.status,
              stage: "invoice_list",
            },
            origin,
          );
        let data: any;
        try {
          data = await r.json();
        } catch {
          return json(
            502,
            { error: "TRENDYOL_BAD_JSON", stage: "invoice_list" },
            origin,
          );
        }
        const rows = Array.isArray(data?.content) ? data.content : [];
        totalPages = Math.max(0, Math.trunc(num(data?.totalPages)));
        for (const row of rows) {
          if (!isCargoInvoice(row)) continue;
          const serial = clean(row?.id, 160),
            day = dayKey(row?.transactionDate);
          if (serial && day) invoices.set(serial, { serial, day });
        }
        if (invoices.size > MAX_INVOICES)
          return json(
            409,
            {
              error: "SYNC_TOO_LARGE",
              stage: "invoice_count",
              maxInvoices: MAX_INVOICES,
            },
            origin,
          );
        page++;
        if (page < totalPages) await sleep(PACING_MS);
      } while (page < totalPages);
    }
    const cargoRows: CargoRow[] = [],
      daily = new Map<string, number>();
    let skippedItems = 0,
      itemPages = 0;
    for (const inv of invoices.values()) {
      let page = 0,
        totalPages = 1;
      do {
        if (page >= CARGO_MAX_PAGES)
          return json(
            409,
            {
              error: "SYNC_TOO_LARGE",
              stage: "cargo_items",
              invoiceSerialNumber: inv.serial,
            },
            origin,
          );
        const u = new URL(
          `https://apigw.trendyol.com/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/cargo-invoice/${encodeURIComponent(inv.serial)}/items`,
        );
        u.searchParams.set("page", String(page));
        u.searchParams.set("size", String(CARGO_PAGE_SIZE));
        let r: Response;
        try {
          r = await fetch(u, {
            headers: {
              Authorization: authHeader,
              "User-Agent": userAgent,
              Accept: "application/json",
            },
            redirect: "error",
            signal: AbortSignal.timeout(20_000),
          });
        } catch {
          return json(
            502,
            { error: "TRENDYOL_NETWORK", stage: "cargo_items" },
            origin,
          );
        }
        if (r.status === 401)
          return json(401, { error: "TRENDYOL_UNAUTHORIZED" }, origin);
        if (r.status === 403)
          return json(502, { error: "TRENDYOL_FORBIDDEN" }, origin);
        if (r.status === 429)
          return json(429, { error: "TRENDYOL_RATE_LIMIT" }, origin);
        if (!r.ok)
          return json(
            502,
            {
              error: "TRENDYOL_HTTP_ERROR",
              status: r.status,
              stage: "cargo_items",
            },
            origin,
          );
        let data: any;
        try {
          data = await r.json();
        } catch {
          return json(
            502,
            { error: "TRENDYOL_BAD_JSON", stage: "cargo_items" },
            origin,
          );
        }
        const rows = Array.isArray(data?.content) ? data.content : [];
        totalPages = Math.max(0, Math.trunc(num(data?.totalPages)));
        itemPages++;
        for (const row of rows) {
          const parcel = clean(row?.parcelUniqueId, 120),
            packageType = clean(row?.shipmentPackageType, 120);
          if (!parcel || !packageType) {
            skippedItems++;
            continue;
          }
          const amount = money(num(row?.amount)),
            order = clean(row?.orderNumber, 100) || null,
            desiRaw = Number(row?.desi),
            desi = Number.isFinite(desiRaw) ? Math.trunc(desiRaw) : null;
          cargoRows.push({
            connection_id: connectionId,
            user_id: user.id,
            invoice_serial_number: inv.serial,
            invoice_day: inv.day,
            parcel_unique_id: parcel,
            order_number: order,
            shipment_package_type: packageType,
            amount,
            desi,
            updated_at: new Date().toISOString(),
          });
          daily.set(inv.day, money((daily.get(inv.day) || 0) + amount));
        }
        page++;
        if (page < totalPages) await sleep(PACING_MS);
      } while (page < totalPages);
      await sleep(PACING_MS);
    }
    await sql.begin(async (tx) => {
      await tx`delete from public.marketplace_cargo_invoice_items where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and invoice_day between ${startDay}::date and ${endDay}::date`;
      for (let i = 0; i < cargoRows.length; i += INSERT_BATCH) {
        const batch = cargoRows.slice(i, i + INSERT_BATCH);
        if (batch.length)
          await tx`insert into public.marketplace_cargo_invoice_items ${tx(batch, "connection_id", "user_id", "invoice_serial_number", "invoice_day", "parcel_unique_id", "order_number", "shipment_package_type", "amount", "desi", "updated_at")} on conflict (connection_id,invoice_serial_number,parcel_unique_id,shipment_package_type) do update set invoice_day=excluded.invoice_day,order_number=excluded.order_number,amount=excluded.amount,desi=excluded.desi,updated_at=excluded.updated_at`;
      }
      await tx`update public.marketplace_daily_financials set cargo_cost=0,other_financial_coverage=case when platform_service_fee_cost<>0 then 'platform_service_fee' else 'none' end,updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`;
      for (const [day, cost] of daily)
        await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,cargo_cost,other_financial_coverage,source_window_start,source_window_end) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${money(cost)},'cargo',to_timestamp(${start}/1000.0),to_timestamp(${end}/1000.0)) on conflict (connection_id,day,currency) do update set cargo_cost=excluded.cargo_cost,other_financial_coverage=case when public.marketplace_daily_financials.platform_service_fee_cost<>0 then 'platform_service_fee_and_cargo' else 'cargo' end,updated_at=now()`;
    });
    const total = money([...daily.values()].reduce((a, b) => a + b, 0));
    return json(
      200,
      {
        ok: true,
        coverage: "cargo_invoice_items",
        rangeDays: days,
        startDay,
        endDay,
        invoices: invoices.size,
        itemPages,
        cargoItems: cargoRows.length,
        skippedItems,
        daysWithCargo: daily.size,
        cargoCost: total,
      },
      origin,
    );
  } catch (e) {
    console.error("trendyol-cargo-sync failed: INTERNAL_ERROR");
    await captureMonitoringException(e, {
      functionName: "trendyol-cargo-sync",
      code: "INTERNAL_ERROR",
    });
    return json(500, { error: "SYNC_FAILED" }, origin);
  } finally {
    if (lockHeld) {
      try {
        await sql`update public.marketplace_connections set sync_lock_token=null,sync_lock_until=null where id=${connectionId}::uuid and user_id=${user.id}::uuid and sync_lock_token=${lockToken}::uuid`;
      } catch {}
    }
  }
});
