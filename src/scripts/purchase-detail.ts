import { getSession } from "../lib/auth";
import { ApiError } from "../lib/api";
import { listSuppliers, type Supplier } from "../lib/suppliers";
import { listStock, type StockItem } from "../lib/inventory";
import {
  getPurchase,
  cancelPurchase,
  voidPayment,
  listReturns,
  formatNpr,
  formatQty,
  STATUS_LABEL,
  PAYMENT_LABEL,
  METHOD_LABEL,
  type Purchase,
  type PurchaseReturn,
  setPurchaseDueDate,
} from "../lib/purchases";
import {
  configurePurchaseDialogs,
  openForm,
  openReceive,
  openPay,
  openReturn,
  openReason,
  esc,
} from "./purchase-dialogs";

if (!getSession()) window.location.replace("/");

const purchaseId = Number(new URLSearchParams(location.search).get("id"));

if (!Number.isInteger(purchaseId) || purchaseId <= 0) {
  window.location.replace("/dashboard/purchase");
}

let purchase: Purchase | null = null;
let suppliers: Supplier[] = [];
let products: StockItem[] = [];
let canWrite = getSession()?.accessMode !== "read_only";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

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
    return entries.map(([, msg]) => String(msg)).join(" ");
  }

  return error.message;
}

function showNotice(message: string | null, kind: "info" | "error" = "error"): void {
  const el = $("pud-notice");
  if (!el) return;

  el.hidden = !message;
  el.textContent = message ?? "";
  el.classList.toggle("is-error", kind === "error");
}

// ==================================================
// FORMATTING
// ==================================================

function fmtDate(s: string): string {
  const d = new Date(`${s}T00:00:00`);

  if (Number.isNaN(d.getTime())) return s || "—";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtWhen(iso: string | null): string {
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

/** Same pill classes as the purchase overview table. */
function statusPill(p: Purchase): string {
  if (p.status === "cancelled") return `<span class="pd-pill pd-pill-cancelled">Cancelled</span>`;
  if (p.status === "draft") return `<span class="pd-pill pd-pill-draft">Draft</span>`;
  if (p.status === "partial") return `<span class="pd-pill pd-pill-partial">${esc(STATUS_LABEL.partial)}</span>`;

  return `<span class="pd-pill pd-pill-delivered">Received</span>`;
}

function payPill(p: Purchase): string {
  if (p.status === "cancelled") return "";

  const cls =
    p.paymentStatus === "paid"
      ? "pd-pill-received"
      : p.paymentStatus === "partial"
        ? "pd-pill-partial"
        : "pd-pill-cancelled";

  return `<span class="pd-pill ${cls}">${esc(PAYMENT_LABEL[p.paymentStatus])}</span>`;
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;

// ==================================================
// RENDER
// ==================================================

function renderHeader(p: Purchase): void {
  document.title = `VGSync | ${p.purchaseNo}`;

  setText("pud-no", p.purchaseNo);
  setText("pud-initial", (p.supplierName || "?")[0].toUpperCase());
  setText("pud-supplier", p.supplierName);
  setText("pud-notes", p.notes);
  setText("pud-date", fmtDate(p.purchaseDate));
  setText("pud-items", `${p.lines.length} item${p.lines.length === 1 ? "" : "s"}`);

  const bill = $("pud-bill");

  if (bill) {
    bill.hidden = !p.billNo;
    bill.textContent = p.billNo ? `Bill ${p.billNo}` : "";
  }

  const status = $("pud-status");
  if (status) status.innerHTML = statusPill(p);

  const pay = $("pud-pay");
  if (pay) pay.innerHTML = payPill(p);

  const cancelled = p.status === "cancelled";

  setText("pud-stat-net", formatNpr(p.netTotal));
  setText("pud-stat-paid", formatNpr(p.paid));
  setText("pud-stat-due", cancelled ? "—" : formatNpr(p.remaining));
}

function renderActions(p: Purchase): void {
  const open = p.status === "draft" || p.status === "partial";
  const received = p.status === "received" || p.status === "partial";

  const allowed: Record<string, boolean> = {
    edit: canWrite && p.status === "draft",
    receive: canWrite && open,
    pay: canWrite && p.status !== "cancelled" && p.remaining > 0,
    return: canWrite && received && p.lines.some((l) => l.returnableQuantity > 0),
    cancel: canWrite && p.status === "draft",
  };

  let any = false;

  document
    .querySelectorAll<HTMLButtonElement>("#pud-actionbar [data-act]")
    .forEach((btn) => {
      const show = allowed[btn.dataset.act ?? ""] ?? false;
      btn.hidden = !show;
      any = any || show;
    });

  const bar = $("pud-actionbar");
  if (bar) bar.hidden = !any;

  const payBtn = $("pud-pay-btn");
  if (payBtn) payBtn.hidden = !allowed.pay;

  const recvBtn = $("pud-receive-btn");
  if (recvBtn) recvBtn.hidden = !allowed.receive;
}

function renderInfo(p: Purchase): void {
  const cancelled = p.status === "cancelled";

  setText("inf-no", p.purchaseNo);
  setText("inf-supplier", p.supplierName);
  setText("inf-bill", p.billNo || "—");
  setText("inf-date", fmtDate(p.purchaseDate));
  const late = p.dueDate && p.remaining > 0 && p.dueDate < new Date().toISOString().slice(0, 10);
  setText("inf-due-date", p.dueDate ? `${fmtDate(p.dueDate)}${late ? " (late)" : ""}` : "Not set");
  const dueEdit = $("inf-due-edit");
  if (dueEdit) dueEdit.hidden = !canWrite || cancelled;
  setText("inf-pay", cancelled ? "—" : PAYMENT_LABEL[p.paymentStatus]);

  setText("inf-subtotal", formatNpr(p.subtotal));
  setText("inf-discount", p.discount > 0 ? `− ${formatNpr(p.discount)}` : formatNpr(0));
  setText("inf-vat-label", `VAT ${formatQty(p.vatRate)}%`);
  setText("inf-vat", formatNpr(p.vatAmount));
  setText("inf-freight", formatNpr(p.freight));
  setText("inf-net", formatNpr(p.netTotal));

  // Progress
  const settled = p.paid + p.creditApplied;

  setText("pg-pay-text", `${formatNpr(p.paid)} of ${formatNpr(p.netTotal)}`);

  const payBar = $("pg-pay-bar");
  if (payBar) payBar.style.width = `${pct(settled, p.netTotal)}%`;

  setText(
    "pg-pay-note",
    cancelled
      ? "This purchase was cancelled."
      : p.remaining > 0
        ? `${formatNpr(p.remaining)} still to pay`
        : "Fully paid",
  );

  const ordered = p.lines.reduce((t, l) => t + l.quantity, 0);
  const received = p.lines.reduce((t, l) => t + l.receivedQuantity, 0);

  setText("pg-del-text", `${formatQty(received)} of ${formatQty(ordered)} units`);

  const delBar = $("pg-del-bar");
  if (delBar) delBar.style.width = `${pct(received, ordered)}%`;

  setText(
    "pg-del-note",
    cancelled
      ? "Nothing more will arrive."
      : received >= ordered && ordered > 0
        ? "Everything has arrived"
        : `${formatQty(Math.max(0, ordered - received))} units still to come`,
  );

  setText("pg-due", cancelled ? "—" : formatNpr(p.remaining));
  setText("pg-due-note", cancelled ? "" : p.remaining > 0 ? "Awaiting payment" : "Nothing owed");
  setText("pg-credit", formatNpr(p.creditApplied));
}

function renderLines(p: Purchase): void {
  const tbody = $("pud-lines");
  if (!tbody) return;

  if (!p.lines.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">No items on this purchase</td></tr>`;
    return;
  }

  tbody.innerHTML = p.lines
    .map(
      (l) => `<tr>
        <td>
          <strong>${esc(l.productName)}</strong>
          <span class="pud-sub mono">${esc(l.stockNo)}</span>
        </td>
        <td class="num">${formatQty(l.quantity)} ${esc(l.unit)}</td>
        <td class="num">${formatNpr(l.unitPrice)}</td>
        <td class="num"><strong>${formatNpr(l.lineTotal)}</strong></td>
        <td class="num">${formatQty(l.receivedQuantity)}</td>
        <td class="num hide-sm">${l.returnedQuantity > 0 ? formatQty(l.returnedQuantity) : "—"}</td>
      </tr>`,
    )
    .join("");
}

function renderPayments(p: Purchase): void {
  const tbody = $("pud-payments");
  if (!tbody) return;

  if (!p.payments.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">No payments yet</td></tr>`;
    return;
  }

  tbody.innerHTML = p.payments
    .map((x) => {
      const voided = x.status === "void";

      return `<tr class="${voided ? "is-void" : ""}">
        <td class="pud-nowrap">${esc(fmtDate(x.paidOn))}</td>
        <td>${esc(METHOD_LABEL[x.method] ?? x.method)}</td>
        <td class="hide-sm mono">${esc(x.reference || "—")}</td>
        <td class="num"><strong>${formatNpr(x.amount)}</strong></td>
        <td>${
          voided
            ? `<span class="pd-pill pd-pill-cancelled" title="${esc(x.voidReason)}">Voided</span>`
            : `<span class="pd-pill pd-pill-received">Paid</span>`
        }</td>
        <td class="actions">${
          !voided && canWrite
            ? `<button type="button" class="btn-link is-danger" data-void-pay="${x.id}">Void</button>`
            : ""
        }</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll<HTMLButtonElement>("[data-void-pay]").forEach((btn) => {
    btn.addEventListener("click", () =>
      openReason(
        "Void payment",
        "The amount goes back onto the purchase.",
        async (reason) => {
          await voidPayment(Number(btn.dataset.voidPay), reason);
        },
        purchaseId,
      ),
    );
  });
}

function renderDeliveries(p: Purchase): void {
  const tbody = $("pud-deliveries");
  if (!tbody) return;

  if (!p.receipts.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="inv-empty">Nothing received yet</td></tr>`;
    return;
  }

  tbody.innerHTML = p.receipts
    .map(
      (r) => `<tr>
        <td class="pud-nowrap">${esc(fmtDate(r.receivedOn))}</td>
        <td>${r.items
          .map(
            (i) =>
              `${esc(i.productName)} <strong>×${formatQty(i.quantity)}</strong>${
                i.damagedQuantity > 0
                  ? ` <span class="pd-pill pd-pill-cancelled">${formatQty(i.damagedQuantity)} damaged</span>`
                  : ""
              }`,
          )
          .join("<br />")}</td>
        <td class="hide-sm">${esc(r.notes || "—")}</td>
      </tr>`,
    )
    .join("");
}

function renderActivity(p: Purchase): void {
  const list = $("pud-activity");
  if (!list) return;

  type Event = {
    when: string;
    shown: string;
    title: string;
    sub: string;
    cls: "is-in" | "is-out" | "is-adjust" | "is-transfer";
  };

  const events: Event[] = [
    {
      when: p.createdAt ?? `${p.purchaseDate}T00:00:00`,
      shown: p.createdAt ? fmtWhen(p.createdAt) : fmtDate(p.purchaseDate),
      title: `${p.purchaseNo} created`,
      sub: `Supplier: ${p.supplierName}`,
      cls: "is-adjust",
    },
  ];

  for (const r of p.receipts) {
    events.push({
      when: `${r.receivedOn}T12:00:00`,
      shown: fmtDate(r.receivedOn),
      title: "Goods received",
      sub: r.items
        .map(
          (i) =>
            `${i.productName} ×${formatQty(i.quantity)}${
              i.damagedQuantity > 0 ? ` (${formatQty(i.damagedQuantity)} damaged)` : ""
            }`,
        )
        .join(", "),
      cls: "is-in",
    });
  }

  for (const x of p.payments) {
    events.push({
      when: `${x.paidOn}T12:00:00`,
      shown: fmtDate(x.paidOn),
      title:
        x.status === "void"
          ? `Payment voided – ${formatNpr(x.amount)}`
          : `Payment recorded – ${formatNpr(x.amount)}`,
      sub: `${METHOD_LABEL[x.method] ?? x.method}${x.reference ? ` • ${x.reference}` : ""}`,
      cls: x.status === "void" ? "is-out" : "is-transfer",
    });
  }

  if (p.cancelledAt) {
    events.push({
      when: p.cancelledAt,
      shown: fmtWhen(p.cancelledAt),
      title: "Purchase cancelled",
      sub: p.cancelReason || "",
      cls: "is-out",
    });
  }

  events.sort((a, b) => b.when.localeCompare(a.when));

  list.innerHTML = events
    .map(
      (e) => `<li class="inv-activity-item">
        <span class="inv-activity-dot ${e.cls}"></span>
        <div class="inv-activity-body">
          <strong>${esc(e.title)}</strong>
          ${e.sub ? `<span>${esc(e.sub)}</span>` : ""}
        </div>
        <time>${esc(e.shown)}</time>
      </li>`,
    )
    .join("");
}

function renderRelated(p: Purchase): void {
  const el = $("pud-related");
  if (!el) return;

  const rows: [string, string][] = [
    ["Supplier", p.supplierName],
    ["Supplier bill no", p.billNo || "—"],
    ["Purchase date", fmtDate(p.purchaseDate)],
    ["Created", fmtWhen(p.createdAt)],
    ["Fully received", p.receivedAt ? fmtWhen(p.receivedAt) : "—"],
    ["Cancelled", p.cancelledAt ? fmtWhen(p.cancelledAt) : "—"],
    ["Cancel reason", p.cancelReason || "—"],
    ["Notes", p.notes || "—"],
  ];

  el.innerHTML = rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("");
}

function renderReturns(list: PurchaseReturn[]): void {
  const tbody = $("pud-returns");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">No returns on this purchase</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      (r) => `<tr class="${r.status === "void" ? "is-void" : ""}">
        <td class="mono">${esc(r.returnNo)}</td>
        <td class="pud-nowrap">${esc(fmtDate(r.returnDate))}</td>
        <td>${r.items
          .map((i) => `${esc(i.productName)} ×${formatQty(i.quantity)}`)
          .join("<br />")}</td>
        <td class="hide-sm">${esc(r.reason || "—")}</td>
        <td class="num">${formatNpr(r.creditAmount)}</td>
        <td>${
          r.status === "void"
            ? `<span class="pd-pill pd-pill-cancelled">Voided</span>`
            : `<span class="pd-pill pd-pill-received">Active</span>`
        }</td>
      </tr>`,
    )
    .join("");
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
}

document.querySelectorAll<HTMLElement>(".invd-tab").forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab ?? "details"));
});

// ==================================================
// ACTIONS
// ==================================================

function runAction(act: string): void {
  const p = purchase;
  if (!p) return;

  if (act === "edit") openForm(p);
  else if (act === "receive") openReceive(p);
  else if (act === "pay") openPay(p);
  else if (act === "return") openReturn(p);
  else if (act === "cancel") {
    openReason(
      `Cancel ${p.purchaseNo}`,
      "A cancelled draft has no effect on stock.",
      async (reason) => {
        await cancelPurchase(p.id, reason);
      },
      p.id,
    );
  }
}

document
  .querySelectorAll<HTMLButtonElement>("#pud-actionbar [data-act]")
  .forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn.dataset.act ?? ""));
  });

$("pud-pay-btn")?.addEventListener("click", () => runAction("pay"));

// Payment due date: when the supplier expects to be paid.
const dueDialog = $<HTMLDialogElement>("dlg-due");

async function saveDue(value: string | null): Promise<void> {
  const err = $("due-error");
  if (err) err.hidden = true;
  try {
    await setPurchaseDueDate(purchaseId, value);
    dueDialog?.close();
    await load();
  } catch (error) {
    if (err) {
      err.textContent = describe(error);
      err.hidden = false;
    }
  }
}

$("inf-due-edit")?.addEventListener("click", () => {
  ($("due-input") as HTMLInputElement).value = purchase?.dueDate ?? "";
  $("due-error")!.hidden = true;
  dueDialog?.showModal();
});
$("form-due")?.addEventListener("submit", (e) => {
  e.preventDefault();
  void saveDue(($("due-input") as HTMLInputElement).value || null);
});
$("due-clear")?.addEventListener("click", () => void saveDue(null));
$("due-cancel")?.addEventListener("click", () => dueDialog?.close());
$("pud-receive-btn")?.addEventListener("click", () => runAction("receive"));

// ==================================================
// LOAD
// ==================================================

async function load(): Promise<void> {
  showNotice(null);

  try {
    purchase = await getPurchase(purchaseId);
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;

    showNotice(missing ? "This purchase could not be found." : describe(error));
    setText("pud-no", "Purchase not found");
    return;
  }

  renderHeader(purchase);
  renderActions(purchase);
  renderInfo(purchase);
  renderLines(purchase);
  renderPayments(purchase);
  renderDeliveries(purchase);
  renderActivity(purchase);
  renderRelated(purchase);

  if (!canWrite) {
    showNotice("Read-only: you are viewing this branch from Head Office.", "info");
  }

  try {
    const all = await listReturns();
    renderReturns(all.filter((r) => r.purchaseId === purchaseId));
  } catch (error) {
    const tbody = $("pud-returns");

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">${esc(describe(error))}</td></tr>`;
    }
  }
}

configurePurchaseDialogs({
  getProducts: () => products,
  getSuppliers: () => suppliers,
  onChanged: async () => {
    await load();

    // Receiving or returning moves stock, so refresh the product choices too.
    void listStock()
      .then((s) => (products = s))
      .catch(() => {});
  },
});

async function init(): Promise<void> {
  canWrite = getSession()?.accessMode !== "read_only";

  // Dialogs need these; the page itself does not, so do not wait on them.
  void Promise.all([listSuppliers(), listStock()])
    .then(([s, p]) => {
      suppliers = s;
      products = p;
    })
    .catch(() => {});

  await load();
}

void init();
