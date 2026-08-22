import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createTransactionPool } from "../_shared/postgres.ts";
import { captureMonitoringException } from "../_shared/observability.ts";
import { readJsonBody, requestError } from "../_shared/request-security.ts";
import { resolveSyncRange } from "../_shared/sync-range.ts";

const PROJECT_URL = Deno.env.get("SUPABASE_URL") || "";
const PROJECT_ORIGIN = (() => {
  try {
    return new URL(PROJECT_URL).origin;
  } catch {
    return "";
  }
})();
const DB_URL = Deno.env.get("KARKALKAN_DB_POOLER_URL") || "";
const sql = createTransactionPool(DB_URL);
const DAY_MS = 86_400_000,
  FIN_SIZE = 500,
  FIN_MAX = 100,
  CARGO_SIZE = 500,
  CARGO_MAX = 100,
  ORDER_SIZE = 200,
  ORDER_MAX = 50,
  MAX_INVOICES = 500,
  FIN_WAIT = 700,
  ORDER_WAIT = 2100,
  INSERT_BATCH = 400;
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
      Boolean(Deno.env.get('KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX'))&&u.hostname.endsWith(String(Deno.env.get('KARKALKAN_VERCEL_PREVIEW_HOST_SUFFIX')))
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
function cents(v: unknown) {
  return Math.round(num(v) * 100);
}
function moneyCents(v: number) {
  return Math.round(v) / 100;
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
function label(v: unknown, max = 240) {
  const s = String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");
  return s ? s.slice(0, max) : null;
}
function norm(v: unknown) {
  return String(v ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ");
}
function dayKey(ms: unknown) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return null;
  const p = fmt.formatToParts(new Date(n)),
    g = (t: string) => p.find((x) => x.type === t)?.value;
  const y = g("year"),
    m = g("month"),
    d = g("day");
  return y && m && d ? `${y}-${m}-${d}` : null;
}
function windows(start: number, end: number, maxDays = 15) {
  const out: { start: number; end: number }[] = [];
  for (let cur = start; cur <= end; ) {
    const e = Math.min(end, cur + maxDays * DAY_MS - 1);
    out.push({ start: cur, end: e });
    cur = e + 1;
  }
  return out;
}
function isCargoInvoice(row: any) {
  return [
    norm(row?.transactionType),
    norm(row?.description),
    norm(row?.transactionSubType),
  ].some((v) => v.includes("kargo fatura") || v === "cargo invoice");
}
async function requestJson(u: URL, authHeader: string, userAgent: string) {
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
    throw new Error("TRENDYOL_NETWORK");
  }
  if (r.status === 401) throw new Error("TRENDYOL_UNAUTHORIZED");
  if (r.status === 403) throw new Error("TRENDYOL_FORBIDDEN");
  if (r.status === 429) throw new Error("TRENDYOL_RATE_LIMIT");
  if (!r.ok) throw new Error(`TRENDYOL_HTTP_${r.status}`);
  try {
    return await r.json();
  } catch {
    throw new Error("TRENDYOL_BAD_JSON");
  }
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
type OrderProduct = {
  connection_id: string;
  user_id: string;
  order_number: string;
  order_day: string | null;
  external_product_id: string;
  sku: string | null;
  product_name: string | null;
  quantity: number;
  line_net_amount: number;
  source: string;
  updated_at: string;
};
type Allocation = {
  connection_id: string;
  user_id: string;
  invoice_day: string;
  invoice_serial_number: string;
  parcel_unique_id: string;
  order_number: string;
  shipment_package_type: string;
  external_product_id: string;
  allocated_amount: number;
  allocation_basis: string;
  weight_line_net_amount: number;
  weight_quantity: number;
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
  const connectionId = String(body?.connection_id || "");
  const range = resolveSyncRange(body, { allowedDays: [7, 30], maxExplicitDays: 3 });
  if (!validUuid(connectionId))
    return json(400, { error: "INVALID_CONNECTION" }, origin);
  if (!range)
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
    { start, end, startDay, endDay } = range;
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
      );
    const apiKey = map.get(kn) || "",
      apiSecret = map.get(sn) || "";
    if (!apiKey || !apiSecret)
      return json(409, { error: "CREDENTIALS_MISSING" }, origin);
    const authHeader = `Basic ${basic(`${apiKey}:${apiSecret}`)}`,
      userAgent = `${sellerId} - Karkalkan`;
    const platformByDay = new Map<string, number>(),
      stoppageByDay = new Map<string, number>();
    let platformRows = 0,
      stoppageRows = 0;
    for (const spec of [
      {
        type: "DeductionInvoices",
        sub: "PlatformServiceFee",
        target: platformByDay,
      },
      { type: "Stoppage", sub: "", target: stoppageByDay },
    ])
      for (const w of windows(start, end)) {
        let page = 0,
          totalPages = 1;
        do {
          if (page >= FIN_MAX)
            return json(
              409,
              {
                error: "SYNC_TOO_LARGE",
                stage: spec.sub ? "platform_service_fee" : "stoppage",
              },
              origin,
            );
          const u = new URL(
            `https://apigw.trendyol.com/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/otherfinancials`,
          );
          u.searchParams.set("transactionType", spec.type);
          if (spec.sub) u.searchParams.set("transactionSubType", spec.sub);
          u.searchParams.set("startDate", String(w.start));
          u.searchParams.set("endDate", String(w.end));
          u.searchParams.set("page", String(page));
          u.searchParams.set("size", String(FIN_SIZE));
          let data: any;
          try {
            data = await requestJson(u, authHeader, userAgent);
          } catch (e) {
            const code = e instanceof Error ? e.message : "TRENDYOL_ERROR";
            return json(
              code === "TRENDYOL_UNAUTHORIZED"
                ? 401
                : code === "TRENDYOL_RATE_LIMIT"
                  ? 429
                  : 502,
              {
                error: code,
                stage: spec.sub ? "platform_service_fee" : "stoppage",
              },
              origin,
            );
          }
          const rows = Array.isArray(data?.content) ? data.content : [];
          totalPages = Math.max(0, Math.trunc(num(data?.totalPages)));
          for (const row of rows) {
            const day = dayKey(row?.transactionDate);
            if (!day) continue;
            spec.target.set(
              day,
              (spec.target.get(day) || 0) +
                cents(row?.debt) -
                cents(row?.credit),
            );
            if (spec.sub) platformRows++;
            else stoppageRows++;
          }
          page++;
          if (page < totalPages) await sleep(FIN_WAIT);
        } while (page < totalPages);
      }
    let cargoOk = true,
      cargoWarning: string | null = null;
    const invoices = new Map<string, InvoiceRef>(),
      cargoRows: CargoRow[] = [],
      cargoByDay = new Map<string, number>();
    let cargoItemPages = 0,
      skippedCargoItems = 0;
    try {
      for (const w of windows(start, end)) {
        let page = 0,
          totalPages = 1;
        do {
          if (page >= FIN_MAX) throw new Error("CARGO_INVOICE_LIST_TOO_LARGE");
          const u = new URL(
            `https://apigw.trendyol.com/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/otherfinancials`,
          );
          for (const [k, v] of Object.entries({
            transactionType: "DeductionInvoices",
            startDate: w.start,
            endDate: w.end,
            page,
            size: FIN_SIZE,
          }))
            u.searchParams.set(k, String(v));
          const data: any = await requestJson(u, authHeader, userAgent),
            rows = Array.isArray(data?.content) ? data.content : [];
          totalPages = Math.max(0, Math.trunc(num(data?.totalPages)));
          for (const row of rows) {
            if (!isCargoInvoice(row)) continue;
            const serial = clean(row?.id, 160),
              day = dayKey(row?.transactionDate);
            if (serial && day) invoices.set(serial, { serial, day });
          }
          if (invoices.size > MAX_INVOICES)
            throw new Error("CARGO_INVOICE_COUNT_TOO_LARGE");
          page++;
          if (page < totalPages) await sleep(FIN_WAIT);
        } while (page < totalPages);
      }
      for (const inv of invoices.values()) {
        let page = 0,
          totalPages = 1;
        do {
          if (page >= CARGO_MAX) throw new Error("CARGO_ITEMS_TOO_LARGE");
          const u = new URL(
            `https://apigw.trendyol.com/integration/finance/che/sellers/${encodeURIComponent(sellerId)}/cargo-invoice/${encodeURIComponent(inv.serial)}/items`,
          );
          u.searchParams.set("page", String(page));
          u.searchParams.set("size", String(CARGO_SIZE));
          const data: any = await requestJson(u, authHeader, userAgent),
            rows = Array.isArray(data?.content) ? data.content : [];
          totalPages = Math.max(0, Math.trunc(num(data?.totalPages)));
          cargoItemPages++;
          for (const row of rows) {
            const parcel = clean(row?.parcelUniqueId, 120),
              packageType = clean(row?.shipmentPackageType, 120);
            if (!parcel || !packageType) {
              skippedCargoItems++;
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
            cargoByDay.set(
              inv.day,
              money((cargoByDay.get(inv.day) || 0) + amount),
            );
          }
          page++;
          if (page < totalPages) await sleep(FIN_WAIT);
        } while (page < totalPages);
        await sleep(FIN_WAIT);
      }
    } catch (e) {
      cargoOk = false;
      cargoWarning = e instanceof Error ? e.message : "CARGO_SYNC_FAILED";
    }
    let orderMapOk = cargoOk,
      orderMapWarning: string | null = null;
    const wantedOrders = new Set(
        cargoRows.map((x) => x.order_number).filter((x): x is string => !!x),
      ),
      orderProducts = new Map<string, OrderProduct>();
    let orderPages = 0;
    if (cargoOk && wantedOrders.size)
      try {
        for (const w of windows(start, end, 14)) {
          let page = 0,
            totalPages = 1;
          do {
            if (page >= ORDER_MAX) throw new Error("ORDER_WINDOW_TOO_LARGE");
            const u = new URL(
              `https://apigw.trendyol.com/integration/order/sellers/${encodeURIComponent(sellerId)}/v2/orders`,
            );
            for (const [k, v] of Object.entries({
              startDate: w.start,
              endDate: w.end,
              page,
              size: ORDER_SIZE,
              orderByField: "CreatedDate",
              orderByDirection: "ASC",
            }))
              u.searchParams.set(k, String(v));
            const data: any = await requestJson(u, authHeader, userAgent),
              packs = Array.isArray(data?.content) ? data.content : [];
            totalPages = Math.max(0, Math.trunc(num(data?.totalPages)));
            orderPages++;
            for (const pack of packs) {
              const order = clean(pack?.orderNumber, 100);
              if (!order || !wantedOrders.has(order)) continue;
              const orderDay = dayKey(
                pack?.orderDate ??
                  pack?.createdDate ??
                  pack?.packageLastModifiedDate,
              );
              for (const line of Array.isArray(pack?.lines) ? pack.lines : []) {
                const product = clean(line?.barcode, 180);
                if (!product) continue;
                const q = Math.max(0, Math.trunc(num(line?.quantity))),
                  unit = Math.max(0, num(line?.lineUnitPrice)),
                  net = money(q * unit),
                  key = `${order}\u0000${product}`,
                  current = orderProducts.get(key) || {
                    connection_id: connectionId,
                    user_id: user.id,
                    order_number: order,
                    order_day: orderDay,
                    external_product_id: product,
                    sku: label(line?.stockCode ?? line?.merchantSku, 180),
                    product_name: label(line?.productName, 240),
                    quantity: 0,
                    line_net_amount: 0,
                    source: "order_v2",
                    updated_at: new Date().toISOString(),
                  };
                current.quantity += q;
                current.line_net_amount = money(current.line_net_amount + net);
                if (!current.order_day) current.order_day = orderDay;
                orderProducts.set(key, current);
              }
            }
            page++;
            if (page < totalPages) await sleep(ORDER_WAIT);
          } while (page < totalPages);
        }
      } catch (e) {
        orderMapOk = false;
        orderMapWarning = e instanceof Error ? e.message : "ORDER_MAP_FAILED";
      }
    const allocations: Allocation[] = [];
    let allocatedCargoCents = 0,
      unallocatedCargoCents = 0,
      unmatchedCargoItems = 0;
    if (cargoOk && orderMapOk) {
      const byOrder = new Map<string, OrderProduct[]>();
      for (const p of orderProducts.values()) {
        const a = byOrder.get(p.order_number) || [];
        a.push(p);
        byOrder.set(p.order_number, a);
      }
      for (const c of cargoRows) {
        const amountCents = cents(c.amount),
          products = c.order_number ? byOrder.get(c.order_number) || [] : [],
          weighted = products.filter((p) => p.line_net_amount > 0),
          totalWeight = weighted.reduce(
            (s, p) => s + cents(p.line_net_amount),
            0,
          );
        if (!c.order_number || !weighted.length || totalWeight <= 0) {
          unmatchedCargoItems++;
          unallocatedCargoCents += amountCents;
          continue;
        }
        let used = 0;
        for (let i = 0; i < weighted.length; i++) {
          const p = weighted[i],
            part =
              i === weighted.length - 1
                ? amountCents - used
                : Math.round(
                    (amountCents * cents(p.line_net_amount)) / totalWeight,
                  );
          used += part;
          allocations.push({
            connection_id: connectionId,
            user_id: user.id,
            invoice_day: c.invoice_day,
            invoice_serial_number: c.invoice_serial_number,
            parcel_unique_id: c.parcel_unique_id,
            order_number: c.order_number,
            shipment_package_type: c.shipment_package_type,
            external_product_id: p.external_product_id,
            allocated_amount: moneyCents(part),
            allocation_basis: "line_net_amount",
            weight_line_net_amount: p.line_net_amount,
            weight_quantity: p.quantity,
            updated_at: new Date().toISOString(),
          });
        }
        allocatedCargoCents += used;
      }
    } else if (cargoOk) {
      unallocatedCargoCents = cargoRows.reduce(
        (s, c) => s + cents(c.amount),
        0,
      );
      unmatchedCargoItems = cargoRows.length;
    }
    await sql.begin(async (tx) => {
      await tx`update public.marketplace_daily_financials set platform_service_fee_cost=0,stoppage_net=0,other_financial_coverage=case when cargo_cost<>0 then 'cargo' else 'none' end,updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`;
      for (const [day, c] of platformByDay)
        await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,platform_service_fee_cost,other_financial_coverage) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${moneyCents(c)},'platform_service_fee') on conflict (connection_id,day,currency) do update set platform_service_fee_cost=excluded.platform_service_fee_cost,other_financial_coverage=case when public.marketplace_daily_financials.cargo_cost<>0 then 'platform_service_fee_and_cargo' else 'platform_service_fee' end,updated_at=now()`;
      for (const [day, c] of stoppageByDay)
        await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,stoppage_net) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${moneyCents(c)}) on conflict (connection_id,day,currency) do update set stoppage_net=excluded.stoppage_net,updated_at=now()`;
      if (cargoOk) {
        await tx`delete from public.marketplace_cargo_invoice_items where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and invoice_day between ${startDay}::date and ${endDay}::date`;
        for (let i = 0; i < cargoRows.length; i += INSERT_BATCH) {
          const b = cargoRows.slice(i, i + INSERT_BATCH);
          if (b.length)
            await tx`insert into public.marketplace_cargo_invoice_items ${tx(b, "connection_id", "user_id", "invoice_serial_number", "invoice_day", "parcel_unique_id", "order_number", "shipment_package_type", "amount", "desi", "updated_at")} on conflict (connection_id,invoice_serial_number,parcel_unique_id,shipment_package_type) do update set invoice_day=excluded.invoice_day,order_number=excluded.order_number,amount=excluded.amount,desi=excluded.desi,updated_at=excluded.updated_at`;
        }
        await tx`update public.marketplace_daily_financials set cargo_cost=0,other_financial_coverage=case when platform_service_fee_cost<>0 then 'platform_service_fee' else 'none' end,updated_at=now() where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and day between ${startDay}::date and ${endDay}::date`;
        for (const [day, c] of cargoByDay)
          await tx`insert into public.marketplace_daily_financials(connection_id,user_id,day,currency,cargo_cost,other_financial_coverage) values(${connectionId}::uuid,${user.id}::uuid,${day}::date,'TRY',${c},'cargo') on conflict (connection_id,day,currency) do update set cargo_cost=excluded.cargo_cost,other_financial_coverage=case when public.marketplace_daily_financials.platform_service_fee_cost<>0 then 'platform_service_fee_and_cargo' else 'cargo' end,updated_at=now()`;
      }
      if (cargoOk && orderMapOk) {
        await tx`delete from public.marketplace_order_product_map where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and order_day between ${startDay}::date and ${endDay}::date`;
        const maps = [...orderProducts.values()];
        for (let i = 0; i < maps.length; i += INSERT_BATCH) {
          const b = maps.slice(i, i + INSERT_BATCH);
          if (b.length)
            await tx`insert into public.marketplace_order_product_map ${tx(b, "connection_id", "user_id", "order_number", "order_day", "external_product_id", "sku", "product_name", "quantity", "line_net_amount", "source", "updated_at")} on conflict (connection_id,order_number,external_product_id) do update set order_day=excluded.order_day,sku=excluded.sku,product_name=excluded.product_name,quantity=excluded.quantity,line_net_amount=excluded.line_net_amount,source=excluded.source,updated_at=excluded.updated_at`;
        }
        await tx`delete from public.marketplace_product_cargo_allocations where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and invoice_day between ${startDay}::date and ${endDay}::date`;
        for (let i = 0; i < allocations.length; i += INSERT_BATCH) {
          const b = allocations.slice(i, i + INSERT_BATCH);
          if (b.length)
            await tx`insert into public.marketplace_product_cargo_allocations ${tx(b, "connection_id", "user_id", "invoice_day", "invoice_serial_number", "parcel_unique_id", "order_number", "shipment_package_type", "external_product_id", "allocated_amount", "allocation_basis", "weight_line_net_amount", "weight_quantity", "updated_at")} on conflict (connection_id,invoice_serial_number,parcel_unique_id,shipment_package_type,external_product_id) do update set allocated_amount=excluded.allocated_amount,weight_line_net_amount=excluded.weight_line_net_amount,weight_quantity=excluded.weight_quantity,updated_at=excluded.updated_at`;
        }
      }
    });
    const platformTotal = moneyCents(
        [...platformByDay.values()].reduce((a, b) => a + b, 0),
      ),
      stoppageTotal = moneyCents(
        [...stoppageByDay.values()].reduce((a, b) => a + b, 0),
      ),
      cargoTotal = cargoOk
        ? money([...cargoByDay.values()].reduce((a, b) => a + b, 0))
        : null;
    return json(
      200,
      {
        ok: true,
        workerVersion: "otherfinancials-v4-endpoint-pacing",
        coverage: cargoOk
          ? "platform_service_fee_stoppage_and_cargo"
          : "platform_service_fee_and_stoppage",
        rangeDays: range.rangeDays,
        startDay,
        endDay,
        platformServiceFeeRows: platformRows,
        platformServiceFeeCost: platformTotal,
        stoppageRows,
        stoppageNet: stoppageTotal,
        cargoOk,
        cargoWarning,
        cargoInvoices: cargoOk ? invoices.size : null,
        cargoItems: cargoOk ? cargoRows.length : null,
        cargoCost: cargoTotal,
        orderMapOk,
        orderMapWarning,
        orderPages: orderMapOk ? orderPages : null,
        orderMappedProducts: orderMapOk ? orderProducts.size : null,
        cargoAllocations: orderMapOk ? allocations.length : null,
        allocatedCargoCost: orderMapOk ? moneyCents(allocatedCargoCents) : null,
        unallocatedCargoCost: cargoOk
          ? moneyCents(unallocatedCargoCents)
          : null,
        unmatchedCargoItems: cargoOk ? unmatchedCargoItems : null,
        rateLimits: { financeWaitMs: FIN_WAIT, orderWaitMs: ORDER_WAIT },
      },
      origin,
    );
  } catch (e) {
    console.error("trendyol-otherfinancials-sync failed: INTERNAL_ERROR");
    await captureMonitoringException(e, {
      functionName: "trendyol-otherfinancials-sync",
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
