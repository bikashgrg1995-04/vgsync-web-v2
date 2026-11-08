
import { getSession } from "../lib/auth";
import { ApiError } from "../lib/api";
import { openProductDialog } from "./product-dialog";
import {
  listStock,
  listMovements,
  deactivateProduct,
  addStockAdjustment,
  formatNpr,
  formatQty,
  STATUS_LABEL,
  MOVEMENT_LABEL,
  ADJUSTMENT_OPTIONS,
  type StockItem,
  type MovementType,
  type AdjustmentMode,
  type AdjustmentReason,
} from "../lib/inventory";

if (!getSession()) window.location.replace("/");

const PAGE_SIZE = 25;
const CATEGORY_PAGE_SIZE = 5;
const ACTIVITY_PAGE_SIZE = 5;

let items: StockItem[] = [];
let canAdjust = true;
let canEditCatalog = true;

let mvPage = 1;
let mvHasNext = false;
let mvLoaded = false;

let categoryPage = 1;
let activityPage = 1;
let activityHasNext = false;
let activityCount = 0;

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FIELD_LABELS: Record<string, string> = {
  stock_no: "Stock no",
  name: "Name",
  unit: "Unit",
  mrp: "MRP",
  purchase_price: "Purchase price",
  sale_price: "Sale price",
  reorder_level: "Reorder at",
  quantity: "Quantity",
  product_id: "Product",
  movement_type: "Type",
  stock_condition: "Stock",
  adjustment_action: "Adjustment type",
  adjustment_reason: "Reason",
};

function describe(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }

  const entries = Object.entries(error.fields);

  if (entries.length > 0 && error.status === 400) {
    return entries
      .map(([key, msg]) =>
        FIELD_LABELS[key] ? `${FIELD_LABELS[key]}: ${msg}` : msg,
      )
      .join(" ");
  }

  return error.message;
}

function showNotice(
  message: string | null,
  kind: "info" | "error" = "info",
): void {
  const el = $("inv-notice");
  if (!el) return;

  el.hidden = !message;
  el.textContent = message ?? "";
  el.classList.toggle("is-error", kind === "error");
}

function statusBadge(status?: string): string {
  const safeStatus = status || "unknown";

  const label =
    STATUS_LABEL[safeStatus as keyof typeof STATUS_LABEL] ?? "Unknown";

  return `<span class="inv-badge inv-badge-${esc(safeStatus)}">${esc(label)}</span>`;
}

function fillCategories(): void {
  const cats = Array.from(
    new Set(items.map((i) => i.category).filter(Boolean)),
  ).sort();

  const sel = $<HTMLSelectElement>("inv-category");

  if (sel) {
    const current = sel.value;

    sel.innerHTML =
      `<option value="">All Categories</option>` +
      cats.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");

    sel.value = cats.includes(current) ? current : "";
  }

  const list = $("prd-category-list");

  if (list) {
    list.innerHTML = cats
      .map((c) => `<option value="${esc(c)}"></option>`)
      .join("");
  }
}

function filteredItems(): StockItem[] {
  const q = ($<HTMLInputElement>("inv-search")?.value ?? "")
    .trim()
    .toLowerCase();

  const cat = $<HTMLSelectElement>("inv-category")?.value ?? "";
  const st = $<HTMLSelectElement>("inv-status")?.value ?? "";

  return items.filter((i) => {
    if (cat && i.category !== cat) return false;
    if (st && i.status !== st) return false;
    if (!q) return true;

    return (
      i.stockNo.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.brand.toLowerCase().includes(q) ||
      i.model.toLowerCase().includes(q)
    );
  });
}

const EYE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

let tablePage = 1;

function detailHref(productId: number): string {
  return `/dashboard/inventory/detail?id=${productId}`;
}

function renderPager(totalRows: number): void {
  const pager = $("inv-pages");
  if (!pager) return;

  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  tablePage = Math.min(tablePage, totalPages);

  if (totalPages <= 1) {
    pager.innerHTML = "";
    return;
  }

  const pages: (number | "…")[] = [];
  for (let n = 1; n <= totalPages; n++) {
    if (n === 1 || n === totalPages || Math.abs(n - tablePage) <= 1) {
      pages.push(n);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  pager.innerHTML =
    `<button type="button" class="inv-pg" data-pg="${tablePage - 1}" aria-label="Previous page" ${tablePage <= 1 ? "disabled" : ""}>‹</button>` +
    pages
      .map((n) =>
        n === "…"
          ? `<span class="inv-pg-gap">…</span>`
          : `<button type="button" class="inv-pg${n === tablePage ? " is-active" : ""}" data-pg="${n}">${n}</button>`,
      )
      .join("") +
    `<button type="button" class="inv-pg" data-pg="${tablePage + 1}" aria-label="Next page" ${tablePage >= totalPages ? "disabled" : ""}>›</button>`;

  pager.querySelectorAll<HTMLButtonElement>("[data-pg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      tablePage = Number(btn.dataset.pg);
      renderTable();
    });
  });
}

function renderTable(): void {
  const tbody = $("inv-tbody");
  const count = $("inv-count");

  if (!tbody) return;

  const rows = filteredItems();

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="inv-empty">${
      items.length === 0
        ? "No products yet."
        : "No products match this filter."
    }</td></tr>`;

    if (count) count.textContent = "Showing 0 of 0 items";
    renderPager(0);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  tablePage = Math.min(tablePage, totalPages);

  const start = (tablePage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageRows
    .map((i) => {
      const menu: string[] = [];

      if (canAdjust) {
        menu.push(`<button type="button" data-adjust="${i.productId}">Adjust stock</button>`);
      }

      if (canEditCatalog) {
        menu.push(`<button type="button" data-edit="${i.productId}">Edit product</button>`);
        menu.push(`<button type="button" class="is-danger" data-hide="${i.productId}">Deactivate</button>`);
      }

      return `<tr>
        <td class="mono">${esc(i.stockNo)}</td>
        <td class="inv-thumb-cell">
          <div class="inv-thumb">
            <span class="inv-prod-icon">${esc((i.name || "?")[0].toUpperCase())}</span>
            ${
              i.image
                ? `<img class="inv-prod-image" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">`
                : ""
            }
          </div>
        </td>
        <td>
          <a class="inv-name-link" href="${detailHref(i.productId)}">${esc(i.name)}</a>
        </td>

        <td class="num">
          <strong>${formatQty(i.quantity)}</strong>
          <span class="inv-unit">${esc(i.unit || "pcs")}</span>
          ${
            i.damagedQuantity > 0
              ? `<span class="inv-dmg">+${formatQty(i.damagedQuantity)} dmg</span>`
              : ""
          }
        </td>

        <td class="num hide-sm">${formatNpr(i.salePrice)}</td>
        <td>${statusBadge(i.status)}</td>
        <td class="actions">
          <a class="inv-view-btn" href="${detailHref(i.productId)}">${EYE_ICON} View</a>
          ${
            menu.length
              ? `<div class="inv-more">
                  <button type="button" class="inv-more-btn" aria-label="More actions" aria-haspopup="true">⋯</button>
                  <div class="inv-more-menu" hidden>${menu.join("")}</div>
                </div>`
              : ""
          }
        </td>
      </tr>`;
    })
    .join("");

  if (count) {
    count.textContent = `Showing ${start + 1}–${start + pageRows.length} of ${rows.length} items`;
  }

  renderPager(rows.length);

  tbody.querySelectorAll<HTMLButtonElement>(".inv-more-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling as HTMLElement | null;
      const wasHidden = menu?.hidden ?? true;
      closeMenus();
      if (menu) menu.hidden = !wasHidden;
    });
  });

  tbody.querySelectorAll<HTMLButtonElement>("[data-adjust]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeMenus();
      openAdjust(Number(btn.dataset.adjust));
    });
  });

  tbody.querySelectorAll<HTMLButtonElement>("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeMenus();
      openProduct(Number(btn.dataset.edit));
    });
  });

  tbody.querySelectorAll<HTMLButtonElement>("[data-hide]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeMenus();
      hideProduct(Number(btn.dataset.hide));
    });
  });
}

function closeMenus(): void {
  document
    .querySelectorAll<HTMLElement>(".inv-more-menu")
    .forEach((m) => (m.hidden = true));
}

document.addEventListener("click", closeMenus);

// ==================================================
// MOVEMENT HELPERS
// ==================================================

const OUT_TYPES: MovementType[] = [
  "sale_issue",
  "purchase_return",
  "adjustment_out",
  "transfer_out",
];

const CAT_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#ef4444",
  "#64748b",
];

// ==================================================
// STOCK BY CATEGORY
// ==================================================

function renderCategoryChart(): void {
  const legend = $("inv-cat-legend");
  const donut = $("inv-donut");
  const totalEl = $("inv-cat-total");

  if (!legend || !donut) return;

  const map = new Map<string, number>();

  for (const i of items) {
    const key = i.category?.trim() || "Others";
    map.set(key, (map.get(key) ?? 0) + i.quantity);
  }

  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);

  const actualTotal = entries.reduce(
    (sum, [, qty]) => sum + qty,
    0,
  );

  const total = actualTotal || 1;

  if (totalEl) {
    totalEl.textContent = formatQty(actualTotal);
  }

  // Donut represents all categories.
  let offset = 0;
  const r = 15.9155;

  const circles = entries
    .map(([, qty], idx) => {
      const pct = (qty / total) * 100;
      const dash = `${pct} ${100 - pct}`;

      const circle = `<circle
        cx="21"
        cy="21"
        r="${r}"
        fill="transparent"
        stroke="${CAT_COLORS[idx % CAT_COLORS.length]}"
        stroke-width="3.5"
        stroke-dasharray="${dash}"
        stroke-dashoffset="${-offset}"
      />`;

      offset += pct;
      return circle;
    })
    .join("");

  donut.innerHTML =
    `<circle cx="21" cy="21" r="${r}" fill="transparent" stroke="var(--border)" stroke-width="3.5" />` +
    circles;

  // Paginated category legend.
  const totalPages = Math.max(
    1,
    Math.ceil(entries.length / CATEGORY_PAGE_SIZE),
  );

  categoryPage = Math.min(categoryPage, totalPages);

  const start = (categoryPage - 1) * CATEGORY_PAGE_SIZE;

  const visibleEntries = entries.slice(
    start,
    start + CATEGORY_PAGE_SIZE,
  );

  legend.innerHTML =
    visibleEntries
      .map(([name, qty], idx) => {
        const actualIndex = start + idx;
        const pct = ((qty / total) * 100).toFixed(1);

        return `<li>
          <span class="dot" style="background:${CAT_COLORS[actualIndex % CAT_COLORS.length]}"></span>
          <span class="name">${esc(name)}</span>
          <span class="pct">${pct}%</span>
        </li>`;
      })
      .join("") || '<li class="inv-activity-empty">No categories</li>';

  const pager = $("inv-cat-pager");
  const pageInfo = $("inv-cat-page-info");
  const prev = $<HTMLButtonElement>("inv-cat-prev");
  const next = $<HTMLButtonElement>("inv-cat-next");

  if (pager) {
    pager.hidden = entries.length <= CATEGORY_PAGE_SIZE;
  }

  if (pageInfo) {
    pageInfo.textContent = `Page ${categoryPage} of ${totalPages}`;
  }

  if (prev) prev.disabled = categoryPage <= 1;
  if (next) next.disabled = categoryPage >= totalPages;
}

// ==================================================
// RECENT STOCK ACTIVITIES
// ==================================================

async function loadRecentActivity(): Promise<void> {
  const list = $("inv-activity");
  if (!list) return;

  try {
    const data = await listMovements(
      activityPage,
      {},
      ACTIVITY_PAGE_SIZE,
    );

    activityCount = data.count;
    activityHasNext = data.hasNext;

    // If records were removed and the current page no longer exists,
    // move back to the last valid page.
    const totalPages = Math.max(
      1,
      Math.ceil(activityCount / ACTIVITY_PAGE_SIZE),
    );

    if (activityPage > totalPages) {
      activityPage = totalPages;
      void loadRecentActivity();
      return;
    }

    if (!data.results.length) {
      list.innerHTML =
        '<li class="inv-activity-empty">No recent movements</li>';
    } else {
      list.innerHTML = data.results
        .map((m) => {
          const isOut = OUT_TYPES.includes(m.type);
          const isAdj = m.type.startsWith("adjustment");
          const isTr = m.type.startsWith("transfer");

          const cls = isTr
            ? "is-transfer"
            : isAdj
              ? "is-adjust"
              : isOut
                ? "is-out"
                : "is-in";

          const label = MOVEMENT_LABEL[m.type] ?? m.type;
          const ago = relativeTime(new Date(m.createdAt));

          return `<li class="inv-activity-item">
            <span class="inv-activity-dot ${cls}"></span>

            <div class="inv-activity-body">
              <strong>${esc(label)} – ${formatQty(m.quantity)} ${esc(m.productName)}</strong>
              <span>by ${esc(m.createdByName || "System")}</span>
            </div>

            <time>${esc(ago)}</time>
          </li>`;
        })
        .join("");
    }

    const pager = $("inv-act-pager");
    const pageInfo = $("inv-act-page-info");
    const prev = $<HTMLButtonElement>("inv-act-prev");
    const next = $<HTMLButtonElement>("inv-act-next");

    if (pager) {
      pager.hidden = activityCount <= ACTIVITY_PAGE_SIZE;
    }

    if (pageInfo) {
      pageInfo.textContent = `Page ${activityPage} of ${totalPages}`;
    }

    if (prev) prev.disabled = activityPage <= 1;
    if (next) next.disabled = !activityHasNext;
  } catch {
    /* Keep the dashboard usable if activity loading fails. */
  }
}

function relativeTime(d: Date): string {
  const sec = Math.max(0, (Date.now() - d.getTime()) / 1000);

  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hr ago`;

  return d.toLocaleDateString();
}

function fillMovementTypes(): void {
  const sel = $<HTMLSelectElement>("mv-type");
  if (!sel) return;

  sel.innerHTML =
    `<option value="">All types</option>` +
    (Object.keys(MOVEMENT_LABEL) as MovementType[])
      .map(
        (t) =>
          `<option value="${t}">${esc(MOVEMENT_LABEL[t])}</option>`,
      )
      .join("");
}

async function loadMovements(): Promise<void> {
  const tbody = $("moves-tbody");
  if (!tbody) return;

  try {
    const data = await listMovements(
      mvPage,
      {
        search: ($<HTMLInputElement>("mv-search")?.value ?? "").trim(),
        type: ($<HTMLSelectElement>("mv-type")?.value ?? "") as
          MovementType | "",
        dateFrom: $<HTMLInputElement>("mv-from")?.value ?? "",
        dateTo: $<HTMLInputElement>("mv-to")?.value ?? "",
      },
      PAGE_SIZE,
    );

    mvHasNext = data.hasNext;
    mvLoaded = true;

    if (data.results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="inv-empty">No movements found.</td></tr>`;
    } else {
      tbody.innerHTML = data.results
        .map((m) => {
          let when = m.createdAt;

          try {
            when = new Date(m.createdAt).toLocaleString();
          } catch {
            /* keep original */
          }

          const out =
            OUT_TYPES.includes(m.type) ||
            (m.type === "reversal" &&
              m.balanceAfter < m.balanceBefore);

          const sign = out ? "−" : "+";

          return `<tr>
            <td class="muted">${esc(when)}</td>
            <td class="mono">${esc(m.stockNo)}</td>
            <td>${esc(m.productName)}</td>
            <td>
              <span class="inv-move ${out ? "inv-move-out" : "inv-move-in"}">
                ${esc(MOVEMENT_LABEL[m.type] ?? m.type)}
              </span>
            </td>
            <td class="hide-sm">${m.condition === "damaged" ? "Damaged" : "Good"}</td>
            <td class="num">${sign}${formatQty(m.quantity)}</td>
            <td class="num muted hide-sm">${formatQty(m.balanceBefore)} → ${formatQty(m.balanceAfter)}</td>
            <td class="mono hide-md">${esc(m.reference || "—")}</td>
            <td class="muted hide-md">${esc(m.createdByName || "—")}</td>
          </tr>`;
        })
        .join("");
    }

    const from =
      data.count === 0 ? 0 : (mvPage - 1) * PAGE_SIZE + 1;

    const to = Math.min(mvPage * PAGE_SIZE, data.count);
    const el = $("mv-count");

    if (el) {
      el.textContent = data.count
        ? `${from}–${to} of ${data.count}`
        : "0 movements";
    }

    ($("mv-prev") as HTMLButtonElement | null)?.toggleAttribute(
      "disabled",
      mvPage <= 1,
    );

    ($("mv-next") as HTMLButtonElement | null)?.toggleAttribute(
      "disabled",
      !mvHasNext,
    );
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="9" class="inv-empty">${esc(describe(error))}</td></tr>`;
  }
}

// ==================================================
// DATA RELOAD
// ==================================================

async function reload(): Promise<void> {
  showNotice(null);

  try {
    items = await listStock();

    fillCategories();
    renderTable();
    renderCategoryChart();
    void loadRecentActivity();

    const editId = Number(new URLSearchParams(location.search).get("edit"));

    if (editId && canEditCatalog && items.some((i) => i.productId === editId)) {
      history.replaceState(null, "", location.pathname);
      openProduct(editId);
    }

    if (mvLoaded) {
      void loadMovements();
    }
  } catch (error) {
    showNotice(describe(error), "error");
  }
}

// ==================================================
// STOCK ADJUSTMENT
// ==================================================

function updateAdjustmentReasons(): void {
  const typeSel = $<HTMLSelectElement>("adj-type");
  const reasonSel = $<HTMLSelectElement>("adj-reason");

  if (!typeSel || !reasonSel) return;

  const selected = ADJUSTMENT_OPTIONS.find(
    (option) => option.value === typeSel.value,
  );

  if (!selected) return;

  reasonSel.innerHTML = selected.reasons
    .map(
      (reason) =>
        `<option value="${reason.value}">${esc(reason.label)}</option>`,
    )
    .join("");
}

function openAdjust(productId: number): void {
  const item = items.find((i) => i.productId === productId);
  if (!item) return;

  ($("adj-id") as HTMLInputElement).value = String(productId);

  const sub = $("adj-product");

  if (sub) {
    sub.textContent = `${item.stockNo} · ${item.name}`;
  }

  const typeSel = $<HTMLSelectElement>("adj-type");

  if (typeSel) {
    typeSel.value = "increase";
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

// ==================================================
// PRODUCT MANAGEMENT
// ==================================================

function openProduct(productId?: number): void {
  const item = productId
    ? items.find((i) => i.productId === productId)
    : null;

  openProductDialog({
    item,
    categories: Array.from(
      new Set(items.map((i) => i.category).filter(Boolean)),
    ).sort(),
    onSaved: reload,
  });
}

async function hideProduct(productId: number): Promise<void> {
  const item = items.find((i) => i.productId === productId);
  if (!item) return;

  if (
    !confirm(
      `Deactivate ${item.name}? Stock history stays; product is hidden from lists.`,
    )
  ) {
    return;
  }

  try {
    await deactivateProduct(productId);
    await reload();
  } catch (error) {
    showNotice(describe(error), "error");
  }
}

// ==================================================
// PANEL NAVIGATION
// ==================================================

function showPanel(name: "stock" | "moves"): void {
  document.querySelectorAll("[data-inv-panel]").forEach((p) => {
    const el = p as HTMLElement;
    el.classList.toggle("is-active", el.dataset.invPanel === name);
  });

  if (name === "moves" && !mvLoaded) {
    void loadMovements();
  }
}

// ==================================================
// EVENT LISTENERS
// ==================================================

$("inv-search")?.addEventListener("input", () => {
  tablePage = 1;
  renderTable();
});

$("inv-category")?.addEventListener("change", () => {
  tablePage = 1;
  renderTable();
});

$("inv-status")?.addEventListener("change", () => {
  const sel = $<HTMLSelectElement>("inv-status");

  $("inv-low-filter")?.classList.toggle(
    "is-active",
    sel?.value === "low",
  );

  tablePage = 1;
  renderTable();
});

$("inv-add")?.addEventListener("click", () => openProduct());

$("inv-low-filter")?.addEventListener("click", () => {
  const sel = $<HTMLSelectElement>("inv-status");
  if (!sel) return;

  const on = sel.value !== "low";

  sel.value = on ? "low" : "";

  $("inv-low-filter")?.classList.toggle("is-active", on);

  tablePage = 1;
  renderTable();
});

$("inv-view-moves")?.addEventListener("click", () =>
  showPanel("moves"),
);

$("inv-back-stock")?.addEventListener("click", () =>
  showPanel("stock"),
);

// Category pagination

$("inv-cat-prev")?.addEventListener("click", () => {
  if (categoryPage <= 1) return;

  categoryPage -= 1;
  renderCategoryChart();
});

$("inv-cat-next")?.addEventListener("click", () => {
  categoryPage += 1;
  renderCategoryChart();
});

// Recent activity pagination

$("inv-act-prev")?.addEventListener("click", () => {
  if (activityPage <= 1) return;

  activityPage -= 1;
  void loadRecentActivity();
});

$("inv-act-next")?.addEventListener("click", () => {
  if (!activityHasNext) return;

  activityPage += 1;
  void loadRecentActivity();
});

// Movement pagination

$("mv-prev")?.addEventListener("click", () => {
  if (mvPage > 1) {
    mvPage -= 1;
    void loadMovements();
  }
});

$("mv-next")?.addEventListener("click", () => {
  if (mvHasNext) {
    mvPage += 1;
    void loadMovements();
  }
});

["mv-search", "mv-type", "mv-from", "mv-to"].forEach((id) => {
  $(id)?.addEventListener("change", () => {
    mvPage = 1;
    void loadMovements();
  });
});

// Adjustment dialog

$("adj-type")?.addEventListener("change", () => {
  updateAdjustmentReasons();
});

$("adj-cancel")?.addEventListener("click", () =>
  ($("inv-adjust-dialog") as HTMLDialogElement)?.close(),
);

$("inv-adjust-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const err = $("adj-error");
  const submit = $<HTMLButtonElement>("adj-submit");

  if (err) {
    err.hidden = true;
    err.textContent = "";
  }

  const mode = (
    $("adj-type") as HTMLSelectElement
  ).value as AdjustmentMode;

  const reason = (
    $("adj-reason") as HTMLSelectElement
  ).value as AdjustmentReason;

  const actionMap: Record<
    AdjustmentMode,
    "increase" | "decrease" | "remove_damaged"
  > = {
    increase: "increase",
    decrease: "decrease",
    mark_damaged: "decrease",
    remove_damaged: "remove_damaged",
  };

  const quantity = Number(
    ($("adj-qty") as HTMLInputElement).value,
  );

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
      productId: Number(
        ($("adj-id") as HTMLInputElement).value,
      ),
      action: actionMap[mode],
      reason,
      quantity,
      reference: ($("adj-ref") as HTMLInputElement).value,
      notes: ($("adj-note") as HTMLInputElement).value,
    });

    ($("inv-adjust-dialog") as HTMLDialogElement)?.close();

    // Start activity at the newest page after a new movement.
    activityPage = 1;

    await reload();
  } catch (error) {
    if (err) {
      err.hidden = false;
      err.textContent = describe(error);
    }
  } finally {
    if (submit) submit.disabled = false;
  }
});

// Product dialog

// ==================================================
// ROLE / PERMISSION INITIALIZATION
// ==================================================

try {
  const session = getSession();
  const role = session?.role;

  canEditCatalog = role === "owner" || role === "headoffice";

  const viewingBranchAsHO =
    role === "owner" &&
    session?.businessType === "branch" &&
    session?.accessMode === "read_only";

  if (viewingBranchAsHO) {
    canAdjust = false;
    canEditCatalog = false;

    showNotice(
      "Read-only: you are viewing this branch from Head Office.",
    );
  }

  const addBtn = $("inv-add");

  if (addBtn) {
    addBtn.hidden = !canEditCatalog;
  }
} catch {
  /* ignore */
}

// Always start on All Status so products are visible.
{
  const sel = $<HTMLSelectElement>("inv-status");

  if (sel) sel.value = "";

  $("inv-low-filter")?.classList.remove("is-active");
}

// ==================================================
// INITIALIZATION
// ==================================================

fillMovementTypes();
void reload();
