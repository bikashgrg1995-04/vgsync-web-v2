import { getSession } from "../lib/auth";
import { ApiError } from "../lib/api";
import {
  getStock,
  listMovements,
  addStockAdjustment,
  formatNpr,
  formatQty,
  STATUS_LABEL,
  MOVEMENT_LABEL,
  ADJUSTMENT_OPTIONS,
  type StockItem,
  type StockMovement,
  type MovementType,
  type AdjustmentMode,
  type AdjustmentReason,
} from "../lib/inventory";

if (!getSession()) window.location.replace("/");

const productId = Number(new URLSearchParams(location.search).get("id"));

if (!Number.isInteger(productId) || productId <= 0) {
  window.location.replace("/dashboard/inventory");
}

const MOVES_PAGE_SIZE = 25;
const ACTIVITY_PAGE_SIZE = 8;
const RECENT_COUNT = 4;

const IN_TYPES: MovementType[] = [
  "opening",
  "purchase_receipt",
  "sale_return",
  "adjustment_in",
  "transfer_in",
];

const OUT_TYPES: MovementType[] = [
  "sale_issue",
  "purchase_return",
  "adjustment_out",
  "transfer_out",
];

let item: StockItem | null = null;
const loadedTabs = new Set<string>();

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setText(id: string, text: string): void {
  const el = $(id);
  if (el) el.textContent = text;
}

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }

  const entries = Object.entries(error.fields);

  if (entries.length > 0 && error.status === 400) {
    return entries.map(([, msg]) => msg).join(" ");
  }

  return error.message;
}

function showNotice(message: string | null): void {
  const el = $("invd-notice");
  if (!el) return;

  el.hidden = !message;
  el.textContent = message ?? "";
  el.classList.add("is-error");
}

// ==================================================
// FORMATTING
// ==================================================

function formatWhen(iso: string | null): string {
  if (!iso) return "—";

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${date} • ${time}`;
}

function relativeTime(d: Date): string {
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);

  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} d ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function isOut(type: MovementType): boolean {
  return OUT_TYPES.includes(type);
}

function signedQty(m: StockMovement): string {
  if (IN_TYPES.includes(m.type)) return `+${formatQty(m.quantity)}`;
  if (isOut(m.type)) return `−${formatQty(m.quantity)}`;
  return formatQty(m.quantity);
}

function typeKind(type: MovementType): "in" | "out" | "adjust" | "transfer" {
  if (type.startsWith("transfer")) return "transfer";
  if (type.startsWith("adjustment")) return "adjust";
  return isOut(type) ? "out" : "in";
}

const ARROW_UP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>`;
const ARROW_DOWN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M12 5v14"></path><path d="m19 12-7 7-7-7"></path></svg>`;
const ARROW_SWAP = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m17 3 4 4-4 4"></path><path d="M3 7h18"></path><path d="m7 21-4-4 4-4"></path><path d="M21 17H3"></path></svg>`;

function typeCell(type: MovementType): string {
  const kind = typeKind(type);
  const icon = kind === "in" ? ARROW_UP : kind === "out" ? ARROW_DOWN : ARROW_SWAP;

  return `<span class="invd-type is-${kind}">${icon}${esc(MOVEMENT_LABEL[type] ?? type)}</span>`;
}

function qtyClass(type: MovementType): string {
  return IN_TYPES.includes(type) ? "is-in" : isOut(type) ? "is-out" : "";
}

// ==================================================
// PAGER
// ==================================================

function renderPages(
  el: HTMLElement | null,
  page: number,
  totalPages: number,
  onChange: (page: number) => void,
): void {
  if (!el) return;

  if (totalPages <= 1) {
    el.innerHTML = "";
    return;
  }

  const pages: (number | "…")[] = [];

  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - page) <= 1) {
      pages.push(n);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  el.innerHTML =
    `<button type="button" class="inv-pg" data-pg="${page - 1}" aria-label="Previous page" ${page <= 1 ? "disabled" : ""}>‹</button>` +
    pages
      .map((n) =>
        n === "…"
          ? `<span class="inv-pg-gap">…</span>`
          : `<button type="button" class="inv-pg${n === page ? " is-active" : ""}" data-pg="${n}">${n}</button>`,
      )
      .join("") +
    `<button type="button" class="inv-pg" data-pg="${page + 1}" aria-label="Next page" ${page >= totalPages ? "disabled" : ""}>›</button>`;

  el.querySelectorAll<HTMLButtonElement>("[data-pg]").forEach((btn) => {
    btn.addEventListener("click", () => onChange(Number(btn.dataset.pg)));
  });
}

// ==================================================
// HEADER + STOCK INFORMATION
// ==================================================

function renderProduct(p: StockItem): void {
  const unit = p.unit || "pcs";
  const available = p.quantity;

  document.title = `VGSync | ${p.name}`;

  setText("invd-name", p.name);
  setText("invd-initial", (p.name || "?")[0].toUpperCase());
  setText("invd-stock-no", p.stockNo);
  setText("invd-desc", p.description);
  setText("invd-unit", `Unit: ${unit}`);

  const status = $("invd-status");

  if (status) {
    status.innerHTML = `<span class="inv-badge inv-badge-${esc(p.status)}">${esc(STATUS_LABEL[p.status] ?? "Unknown")}</span>`;
  }

  const img = $<HTMLImageElement>("invd-image");

  if (img) {
    if (p.image) {
      img.src = p.image;
      img.alt = p.name;
      img.hidden = false;
    } else {
      img.hidden = true;
    }
  }

  const category = $("invd-category");

  if (category) {
    category.hidden = !p.category;
    category.textContent = p.category;
  }

  setText("invd-stat-qty", `${formatQty(p.quantity)} ${unit}`);
  setText("invd-stat-sale", formatNpr(p.salePrice));
  setText("invd-stat-cost", formatNpr(p.purchasePrice));

  setText("inf-name", p.name);
  setText("inf-stock-no", p.stockNo);
  setText("inf-category", p.category || "—");
  setText("inf-brand", p.brand || "—");
  setText("inf-unit", unit);
  setText(
    "inf-min",
    p.reorderLevel > 0 ? `${formatQty(p.reorderLevel)} ${unit}` : "Not set",
  );
  setText("inf-qty", `${formatQty(p.quantity)} ${unit}`);
  setText("inf-avail", `${formatQty(available)} ${unit}`);
  setText("inf-dmg", `${formatQty(p.damagedQuantity)} ${unit}`);
  setText("inf-updated", formatWhen(p.updatedAt));

  setText("invd-value", formatNpr(p.quantity * p.purchasePrice));
  setText(
    "invd-value-note",
    `${formatQty(p.quantity)} ${unit} × ${formatNpr(p.purchasePrice)}`,
  );

  renderRelated(p);
}

function renderRelated(p: StockItem): void {
  const el = $("invd-related");
  if (!el) return;

  const rows: [string, string][] = [
    ["Brand", p.brand || "—"],
    ["Model", p.model || "—"],
    ["Category", p.category || "—"],
    ["Group", p.group || "—"],
    ["Unit", p.unit || "pcs"],
    ["Purchase price", formatNpr(p.purchasePrice)],
    ["Selling price", formatNpr(p.salePrice)],
    ["MRP", formatNpr(p.mrp)],
    [
      "Reorder level",
      p.reorderLevel > 0 ? formatQty(p.reorderLevel) : "Not set",
    ],
    ["Description", p.description || "—"],
  ];

  el.innerHTML = rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("");
}

// ==================================================
// MOVEMENT CHART
// ==================================================

const rangeCache = new Map<number, StockMovement[]>();

async function loadRange(days: number): Promise<StockMovement[]> {
  const cached = rangeCache.get(days);
  if (cached) return cached;

  const from = new Date();
  from.setDate(from.getDate() - (days - 1));

  const all: StockMovement[] = [];

  for (let page = 1; page <= 10; page++) {
    const data = await listMovements(
      page,
      { productId, dateFrom: dayKey(from) },
      100,
    );

    all.push(...data.results);
    if (!data.hasNext) break;
  }

  rangeCache.set(days, all);
  return all;
}

function niceMax(v: number): number {
  if (v <= 5) return 5;

  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const step = pow / 2;

  return Math.ceil(v / step) * step;
}

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";

  let d = `M${pts[0][0]},${pts[0][1]}`;

  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;

    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }

  return d;
}

async function renderChart(): Promise<void> {
  const host = $("invd-chart");
  if (!host) return;

  const days = Number($<HTMLSelectElement>("invd-range")?.value ?? 30);

  let moves: StockMovement[];

  try {
    moves = await loadRange(days);
  } catch (error) {
    host.innerHTML = `<p class="inv-empty">${esc(describe(error))}</p>`;
    return;
  }

  setText("invd-moves-total", String(moves.length));
  setText("invd-moves-note", `(Last ${days} days)`);

  // One bucket per day; only good-stock movements, so a damaged
  // reclassification is not counted twice.
  const buckets = new Map<string, { inn: number; out: number }>();
  const labels: { key: string; label: string }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);

    const key = dayKey(d);
    buckets.set(key, { inn: 0, out: 0 });

    labels.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  for (const m of moves) {
    if (m.condition !== "good") continue;

    const bucket = buckets.get(dayKey(new Date(m.createdAt)));
    if (!bucket) continue;

    if (IN_TYPES.includes(m.type)) bucket.inn += m.quantity;
    else if (isOut(m.type)) bucket.out += m.quantity;
  }

  const series = labels.map((l) => buckets.get(l.key)!);
  const peak = Math.max(1, ...series.map((s) => Math.max(s.inn, s.out)));
  const yMax = niceMax(peak);

  const W = 560;
  const H = 210;
  const padL = 36;
  const padR = 14;
  const padT = 12;
  const padB = 26;

  const x = (i: number) =>
    padL + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB);

  const inPts = series.map((s, i): [number, number] => [x(i), y(s.inn)]);
  const outPts = series.map((s, i): [number, number] => [x(i), y(s.out)]);

  const baseY = y(0);
  const area = (pts: [number, number][]) =>
    `${smoothPath(pts)} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z`;

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = yMax * f;
      return `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="invd-grid" />
        <text x="${padL - 6}" y="${y(v) + 3}" text-anchor="end" class="invd-axis">${formatQty(Math.round(v))}</text>`;
    })
    .join("");

  const tickEvery = Math.max(1, Math.ceil(series.length / 5));
  const ticks = labels
    .map((l, i) =>
      i % tickEvery === 0 || i === labels.length - 1
        ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="invd-axis">${esc(l.label)}</text>`
        : "",
    )
    .join("");

  const dots = (pts: [number, number][], cls: string) =>
    series.length <= 31
      ? pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="3" class="${cls}" />`).join("")
      : "";

  const empty = moves.length === 0;

  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Stock in and stock out per day" preserveAspectRatio="xMidYMid meet">
    ${grid}
    <path d="${area(inPts)}" class="invd-area-in" />
    <path d="${area(outPts)}" class="invd-area-out" />
    <path d="${smoothPath(inPts)}" class="invd-line-in" />
    <path d="${smoothPath(outPts)}" class="invd-line-out" />
    ${dots(inPts, "invd-dot-in")}
    ${dots(outPts, "invd-dot-out")}
    ${ticks}
  </svg>${empty ? `<p class="invd-chart-empty">No movements in this period</p>` : ""}`;
}

// ==================================================
// RECENT MOVEMENTS (details tab)
// ==================================================

async function loadRecent(): Promise<void> {
  const tbody = $("invd-recent");
  if (!tbody) return;

  try {
    const data = await listMovements(1, { productId }, RECENT_COUNT);

    if (!data.results.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="inv-empty">No movements yet</td></tr>`;
      return;
    }

    tbody.innerHTML = data.results
      .map(
        (m) => `<tr>
          <td class="invd-nowrap">${esc(formatWhen(m.createdAt))}</td>
          <td>${typeCell(m.type)}</td>
          <td class="num"><strong class="invd-qty ${qtyClass(m.type)}">${signedQty(m)}</strong></td>
          <td class="mono">${esc(m.reference || "—")}</td>
          <td>${esc(m.notes || MOVEMENT_LABEL[m.type] || "")}</td>
        </tr>`,
      )
      .join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="inv-empty">${esc(describe(error))}</td></tr>`;
  }
}

// ==================================================
// MOVEMENTS TAB
// ==================================================

let movesPage = 1;

async function loadMovesTab(): Promise<void> {
  const tbody = $("invd-moves");
  if (!tbody) return;

  try {
    const data = await listMovements(movesPage, { productId }, MOVES_PAGE_SIZE);
    const totalPages = Math.max(1, Math.ceil(data.count / MOVES_PAGE_SIZE));

    if (!data.results.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="inv-empty">No movements yet</td></tr>`;
    } else {
      tbody.innerHTML = data.results
        .map(
          (m) => `<tr>
            <td class="invd-nowrap">${esc(formatWhen(m.createdAt))}</td>
            <td>${typeCell(m.type)}</td>
            <td class="hide-sm">${m.condition === "damaged" ? "Damaged" : "Good"}</td>
            <td class="num"><strong class="invd-qty ${qtyClass(m.type)}">${signedQty(m)}</strong></td>
            <td class="num hide-sm">${formatQty(m.balanceAfter)}</td>
            <td class="hide-md mono">${esc(m.reference || "—")}</td>
            <td class="hide-md">${esc(m.createdByName || "System")}</td>
          </tr>`,
        )
        .join("");
    }

    const start = data.count === 0 ? 0 : (movesPage - 1) * MOVES_PAGE_SIZE + 1;
    setText(
      "invd-moves-count",
      `Showing ${start}–${start === 0 ? 0 : start + data.results.length - 1} of ${data.count} movements`,
    );

    renderPages($("invd-moves-pages"), movesPage, totalPages, (p) => {
      movesPage = p;
      void loadMovesTab();
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="inv-empty">${esc(describe(error))}</td></tr>`;
  }
}

// ==================================================
// ACTIVITIES TAB
// ==================================================

let activityPage = 1;

async function loadActivities(): Promise<void> {
  const list = $("invd-activity");
  if (!list) return;

  try {
    const data = await listMovements(
      activityPage,
      { productId },
      ACTIVITY_PAGE_SIZE,
    );

    const totalPages = Math.max(1, Math.ceil(data.count / ACTIVITY_PAGE_SIZE));

    if (!data.results.length) {
      list.innerHTML = `<li class="inv-activity-empty">No activity yet</li>`;
    } else {
      list.innerHTML = data.results
        .map((m) => {
          const kind = typeKind(m.type);
          const cls =
            kind === "transfer"
              ? "is-transfer"
              : kind === "adjust"
                ? "is-adjust"
                : kind === "out"
                  ? "is-out"
                  : "is-in";

          return `<li class="inv-activity-item">
            <span class="inv-activity-dot ${cls}"></span>
            <div class="inv-activity-body">
              <strong>${esc(MOVEMENT_LABEL[m.type] ?? m.type)} – ${formatQty(m.quantity)} ${esc(item?.unit || "pcs")}</strong>
              <span>by ${esc(m.createdByName || "System")}${m.reference ? ` • ${esc(m.reference)}` : ""}</span>
            </div>
            <time>${esc(relativeTime(new Date(m.createdAt)))}</time>
          </li>`;
        })
        .join("");
    }

    setText("invd-act-count", `${data.count} activities`);

    renderPages($("invd-act-pages"), activityPage, totalPages, (p) => {
      activityPage = p;
      void loadActivities();
    });
  } catch (error) {
    list.innerHTML = `<li class="inv-activity-empty">${esc(describe(error))}</li>`;
  }
}

// ==================================================
// TABS
// ==================================================

function showTab(name: string): void {
  document.querySelectorAll<HTMLElement>(".invd-tab").forEach((t) => {
    t.classList.toggle("is-active", t.dataset.tab === name);
  });

  document.querySelectorAll<HTMLElement>(".invd-panel").forEach((p) => {
    p.classList.toggle("is-active", p.dataset.panel === name);
  });

  if (!loadedTabs.has(name)) {
    loadedTabs.add(name);

    if (name === "movements") void loadMovesTab();
    if (name === "activities") void loadActivities();
  }
}

document.querySelectorAll<HTMLElement>(".invd-tab").forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab ?? "details"));
});

$("invd-view-all")?.addEventListener("click", () => showTab("movements"));
$("invd-range")?.addEventListener("change", () => void renderChart());

// ==================================================
// STOCK ADJUSTMENT
// ==================================================

function updateAdjustmentReasons(): void {
  const type = ($("adj-type") as HTMLSelectElement).value as AdjustmentMode;
  const reason = $<HTMLSelectElement>("adj-reason");
  const option = ADJUSTMENT_OPTIONS.find((o) => o.value === type);

  if (!reason || !option) return;

  reason.innerHTML = option.reasons
    .map((r) => `<option value="${r.value}">${esc(r.label)}</option>`)
    .join("");
}

function openAdjust(mode: AdjustmentMode, title: string): void {
  if (!item) return;

  setText("adj-title", title);
  setText("adj-product", `${item.stockNo} · ${item.name}`);

  const typeSel = $<HTMLSelectElement>("adj-type");

  if (typeSel) {
    typeSel.value = mode;
    updateAdjustmentReasons();
  }

  ($("adj-qty") as HTMLInputElement).value = "1";
  ($("adj-ref") as HTMLInputElement).value = "";
  ($("adj-note") as HTMLInputElement).value = "";

  const err = $("adj-error");

  if (err) {
    err.hidden = true;
    err.textContent = "";
  }

  ($("inv-adjust-dialog") as HTMLDialogElement | null)?.showModal();
}

$("invd-stock-in")?.addEventListener("click", () =>
  openAdjust("increase", "Stock in"),
);
$("invd-stock-out")?.addEventListener("click", () =>
  openAdjust("decrease", "Stock out"),
);
$("invd-adjust")?.addEventListener("click", () =>
  openAdjust("increase", "Adjust stock"),
);

$("adj-type")?.addEventListener("change", updateAdjustmentReasons);
$("adj-cancel")?.addEventListener("click", () =>
  ($("inv-adjust-dialog") as HTMLDialogElement | null)?.close(),
);

$("inv-adjust-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const err = $("adj-error");
  const submit = $<HTMLButtonElement>("adj-submit");

  if (err) {
    err.hidden = true;
    err.textContent = "";
  }

  const mode = ($("adj-type") as HTMLSelectElement).value as AdjustmentMode;
  const reason = ($("adj-reason") as HTMLSelectElement).value as AdjustmentReason;

  const actionMap: Record<AdjustmentMode, "increase" | "decrease" | "remove_damaged"> = {
    increase: "increase",
    decrease: "decrease",
    mark_damaged: "decrease",
    remove_damaged: "remove_damaged",
  };

  const quantity = Number(($("adj-qty") as HTMLInputElement).value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    if (err) {
      err.hidden = false;
      err.textContent = "Enter a valid quantity greater than zero.";
    }
    return;
  }

  if (submit) submit.disabled = true;

  try {
    await addStockAdjustment({
      productId,
      action: actionMap[mode],
      reason,
      quantity,
      reference: ($("adj-ref") as HTMLInputElement).value,
      notes: ($("adj-note") as HTMLInputElement).value,
    });

    ($("inv-adjust-dialog") as HTMLDialogElement)?.close();
    await load();
  } catch (error) {
    if (err) {
      err.hidden = false;
      err.textContent = describe(error);
    }
  } finally {
    if (submit) submit.disabled = false;
  }
});

// ==================================================
// INITIAL LOAD
// ==================================================

async function load(): Promise<void> {
  showNotice(null);

  // New movements invalidate everything derived from them.
  rangeCache.clear();
  movesPage = 1;
  activityPage = 1;

  try {
    item = await getStock(productId);
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;
    showNotice(missing ? "This product could not be found." : describe(error));
    setText("invd-name", "Product not found");
    return;
  }

  renderProduct(item);

  const edit = $<HTMLButtonElement>("invd-edit");

  if (edit) {
    edit.hidden = false;
    edit.onclick = () => {
      window.location.href = `/dashboard/inventory?edit=${productId}`;
    };
  }

  void renderChart();
  void loadRecent();

  // Refresh whichever extra tabs were already opened.
  if (loadedTabs.has("movements")) void loadMovesTab();
  if (loadedTabs.has("activities")) void loadActivities();
}

void load();
