import { getSession } from "../lib/auth";
import { ApiError } from "../lib/api";
import { listCustomers, type Customer } from "../lib/customers";
import { listStock, type StockItem } from "../lib/inventory";
import {
  getSale,
  confirmSale,
  cancelSale,
  voidPayment,
  listReturns,
  listFollowups,
  listBikes,
  listLocalProducts,
  formatNpr,
  formatQty,
  STATUS_LABEL,
  TYPE_LABEL,
  PAYMENT_LABEL,
  METHOD_LABEL,
  FOLLOWUP_LABEL,
  type Sale,
  type SaleReturn,
  type Followup,
  type BikeUnit,
  type LocalProduct,
} from "../lib/sales";
import {
  configureSalesDialogs,
  openForm,
  openPay,
  openReturn,
  openReason,
  describe,
  esc,
} from "./sales-dialogs";

if (!getSession()) window.location.replace("/");

const saleId = Number(new URLSearchParams(location.search).get("id"));

if (!Number.isInteger(saleId) || saleId <= 0) {
  window.location.replace("/dashboard/sales");
}

let sale: Sale | null = null;
let customers: Customer[] = [];
let products: StockItem[] = [];
let bikes: BikeUnit[] = [];
let localProducts: LocalProduct[] = [];
let canWrite = getSession()?.accessMode !== "read_only";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

function setText(id: string, text: string): void {
  const el = $(id);
  if (el) el.textContent = text;
}

function setHidden(id: string, hidden: boolean): void {
  const el = $(id);
  if (el) el.hidden = hidden;
}

function showNotice(message: string | null, kind: "info" | "error" = "error"): void {
  const el = $("sad-notice");
  if (!el) return;

  el.hidden = !message;
  el.textContent = message ?? "";
  el.classList.toggle("is-error", kind === "error");
}

// ==================================================
// FORMATTING
// ==================================================

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";

  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;

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

const customerName = (s: Sale) =>
  s.customerId ? s.customerName : s.walkInName || "Walk-in customer";

/** Same pill classes as the sales overview table. */
function statusPill(s: Sale): string {
  if (s.status === "cancelled") return `<span class="pd-pill pd-pill-cancelled">Cancelled</span>`;
  if (s.status === "draft") return `<span class="pd-pill pd-pill-draft">Draft</span>`;
  if (s.paymentStatus === "paid") return `<span class="pd-pill pd-pill-received">Completed</span>`;

  return `<span class="pd-pill pd-pill-delivered">${esc(STATUS_LABEL.confirmed)}</span>`;
}

function payPill(s: Sale): string {
  if (s.status === "cancelled") return "";

  const cls =
    s.paymentStatus === "paid"
      ? "pd-pill-received"
      : s.paymentStatus === "partial"
        ? "pd-pill-partial"
        : "pd-pill-cancelled";

  return `<span class="pd-pill ${cls}">${esc(PAYMENT_LABEL[s.paymentStatus])}</span>`;
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.min(100, Math.max(0, (part / whole) * 100)) : 0;

// ==================================================
// RENDER
// ==================================================

function renderHeader(s: Sale): void {
  const no = s.invoiceNo || s.saleNo;

  document.title = `VGSync | ${no}`;

  setText("sad-no", no);
  setText("sad-initial", (customerName(s) || "?")[0].toUpperCase());
  setText("sad-customer", customerName(s));
  setText("sad-notes", s.notes);
  setText("sad-date", fmtDate(s.saleDate));
  setText("sad-items", `${s.lines.length} item${s.lines.length === 1 ? "" : "s"}`);

  const kind = $("sad-kind");

  if (kind) {
    kind.hidden = false;
    kind.textContent = `${TYPE_LABEL[s.saleType]}${s.paymentMode === "emi" ? " · EMI" : ""}`;
  }

  const vehicle = $("sad-vehicle");
  const vehicleText = [s.vehicleRegNo, s.vehicleChassisNo].filter(Boolean).join(" / ");

  if (vehicle) {
    vehicle.hidden = !vehicleText;
    vehicle.textContent = vehicleText;
  }

  const status = $("sad-status");
  if (status) status.innerHTML = statusPill(s);

  const pay = $("sad-pay");
  if (pay) pay.innerHTML = payPill(s);

  const cancelled = s.status === "cancelled";

  setText("sad-stat-net", formatNpr(s.netTotal));
  setText("sad-stat-paid", formatNpr(s.paid));
  setText("sad-stat-due", cancelled ? "—" : formatNpr(s.remaining));
}

function renderActions(s: Sale): void {
  const allowed: Record<string, boolean> = {
    confirm: canWrite && s.status === "draft",
    edit: canWrite && s.status === "draft",
    pay: canWrite && s.status !== "cancelled" && s.remaining > 0,
    return:
      canWrite &&
      s.status === "confirmed" &&
      s.lines.some((l) => l.returnableQuantity > 0),
    cancel: canWrite && s.status === "draft",
  };

  let any = false;

  document
    .querySelectorAll<HTMLButtonElement>("#sad-actionbar [data-act]")
    .forEach((btn) => {
      const show = allowed[btn.dataset.act ?? ""] ?? false;
      btn.hidden = !show;
      any = any || show;
    });

  setHidden("sad-actionbar", !any);
  setHidden("sad-pay-btn", !allowed.pay);
}

function renderInfo(s: Sale): void {
  const cancelled = s.status === "cancelled";
  const emi = s.paymentMode === "emi";

  setText("inf-invoice", s.invoiceNo || "Not issued yet");
  setText("inf-no", s.saleNo);
  setText("inf-customer", customerName(s));
  setText("inf-date", fmtDate(s.saleDate));
  setText("inf-kind", `${TYPE_LABEL[s.saleType]}${emi ? " · EMI" : ""}`);
  setText("inf-due-label", emi ? "First EMI Due" : "Pay By");
  setText("inf-due", fmtDate(emi ? s.firstEmiDue : s.dueDate));

  setText("inf-subtotal", formatNpr(s.subtotal));
  setText("inf-discount", s.discount > 0 ? `− ${formatNpr(s.discount)}` : formatNpr(0));
  setText("inf-vat-label", `VAT ${formatQty(s.vatRate)}%`);
  setText("inf-vat", formatNpr(s.vatAmount));
  setText("inf-net", formatNpr(s.netTotal));

  setHidden("inf-finance-row", !emi);
  setHidden("inf-amountdue-row", !emi);
  setText("inf-finance", formatNpr(s.financeCharge));
  setText("inf-amountdue", formatNpr(s.amountDue));

  // Payment progress: what has come in, measured against what is owed
  const owed = emi ? s.amountDue : s.netTotal;
  const settled = s.paid + s.creditApplied + s.returnedAmount;

  setText("pg-pay-text", `${formatNpr(s.paid)} of ${formatNpr(owed)}`);

  const payBar = $("pg-pay-bar");
  if (payBar) payBar.style.width = `${pct(settled, owed)}%`;

  setText(
    "pg-pay-note",
    cancelled
      ? "This sale was cancelled."
      : s.status === "draft"
        ? s.paid > 0
          ? "Advance taken on a draft"
          : "Nothing is due until the sale is confirmed"
        : s.remaining > 0
          ? `${formatNpr(s.remaining)} still to receive`
          : "Fully paid",
  );

  setHidden("pg-emi-wrap", !emi || s.installments.length === 0);

  if (emi && s.installments.length > 0) {
    const done = s.installments.filter((i) => i.status === "paid").length;

    setText("pg-emi-text", `${done} of ${s.installments.length}`);

    const bar = $("pg-emi-bar");
    if (bar) bar.style.width = `${pct(done, s.installments.length)}%`;

    const overdue = s.installments.filter((i) => i.status === "overdue").length;

    setText(
      "pg-emi-note",
      overdue > 0
        ? `${overdue} instalment${overdue === 1 ? "" : "s"} overdue`
        : done === s.installments.length
          ? "All instalments paid"
          : `${s.installments.length - done} instalments to go`,
    );
  }

  setText("pg-due", cancelled ? "—" : formatNpr(s.remaining));
  setText(
    "pg-due-note",
    cancelled ? "" : s.status === "draft" ? "After confirming" : s.remaining > 0 ? "Awaiting payment" : "Nothing owed",
  );

  const reduced = s.returnedAmount + s.creditApplied;

  setText("pg-credit", formatNpr(reduced));
  setText(
    "pg-credit-note",
    s.returnedAmount > 0 || s.creditApplied > 0
      ? `Returned ${formatNpr(s.returnedAmount)} • credit ${formatNpr(s.creditApplied)}`
      : "Goods returned or credit used",
  );
}

function renderLines(s: Sale): void {
  const tbody = $("sad-lines");
  if (!tbody) return;

  if (!s.lines.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="inv-empty">No items on this sale</td></tr>`;
    return;
  }

  tbody.innerHTML = s.lines
    .map((l) => {
      const sub = l.chassisNo
        ? `${l.chassisNo} / ${l.engineNo}`
        : l.stockNo || "";

      return `<tr>
        <td>
          <strong>${esc(l.name)}</strong>
          ${sub ? `<span class="pud-sub mono">${esc(sub)}</span>` : ""}
        </td>
        <td class="num">${formatQty(l.quantity)}</td>
        <td class="num">${formatNpr(l.unitPrice)}</td>
        <td class="num"><strong>${formatNpr(l.lineTotal)}</strong></td>
        <td class="num hide-sm">${l.returnedQuantity > 0 ? formatQty(l.returnedQuantity) : "—"}</td>
      </tr>`;
    })
    .join("");
}

function renderPayments(s: Sale): void {
  const tbody = $("sad-payments");
  if (!tbody) return;

  if (!s.payments.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">No payments yet</td></tr>`;
    return;
  }

  tbody.innerHTML = s.payments
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
        "The amount goes back onto the sale.",
        async (reason) => {
          await voidPayment(Number(btn.dataset.voidPay), reason);
        },
        saleId,
      ),
    );
  });
}

function renderEmi(s: Sale): void {
  const emi = s.paymentMode === "emi";

  setHidden("sad-emi-tab", !emi);

  // If the open tab just disappeared, go back to the first one.
  if (!emi && document.querySelector('.invd-tab.is-active[data-tab="emi"]')) {
    showTab("details");
  }

  if (!emi) return;

  setText(
    "sad-emi-sum",
    `Down payment ${formatNpr(s.downPayment)}, then ${s.emiMonths} × ${formatNpr(s.emiAmount)} a month.`,
  );

  const tbody = $("sad-emi");
  if (!tbody) return;

  if (!s.installments.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="inv-empty">Instalments are created when the sale is confirmed</td></tr>`;
    return;
  }

  tbody.innerHTML = s.installments
    .map((i) => {
      const cls =
        i.status === "paid"
          ? "pd-pill-received"
          : i.status === "partial"
            ? "pd-pill-partial"
            : i.status === "overdue"
              ? "pd-pill-cancelled"
              : "pd-pill-draft";

      return `<tr>
        <td>${i.number}</td>
        <td class="pud-nowrap">${esc(fmtDate(i.dueDate))}</td>
        <td class="num">${formatNpr(i.amount)}</td>
        <td class="num">${formatNpr(i.paidAmount)}</td>
        <td><span class="pd-pill ${cls}">${esc(i.status.charAt(0).toUpperCase() + i.status.slice(1))}</span></td>
      </tr>`;
    })
    .join("");
}

function renderActivity(s: Sale, returns: SaleReturn[]): void {
  const list = $("sad-activity");
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
      when: s.createdAt ?? `${s.saleDate}T00:00:00`,
      shown: s.createdAt ? fmtWhen(s.createdAt) : fmtDate(s.saleDate),
      title: `${s.saleNo} created`,
      sub: `Customer: ${customerName(s)}`,
      cls: "is-adjust",
    },
  ];

  if (s.confirmedAt) {
    events.push({
      when: s.confirmedAt,
      shown: fmtWhen(s.confirmedAt),
      title: `Sale confirmed${s.invoiceNo ? ` – ${s.invoiceNo}` : ""}`,
      sub: "Stock taken out and invoice issued",
      cls: "is-in",
    });
  }

  for (const x of s.payments) {
    events.push({
      when: `${x.paidOn}T12:00:00`,
      shown: fmtDate(x.paidOn),
      title:
        x.status === "void"
          ? `Payment voided – ${formatNpr(x.amount)}`
          : `Payment received – ${formatNpr(x.amount)}`,
      sub: `${METHOD_LABEL[x.method] ?? x.method}${x.reference ? ` • ${x.reference}` : ""}`,
      cls: x.status === "void" ? "is-out" : "is-transfer",
    });
  }

  for (const r of returns) {
    events.push({
      when: `${r.returnDate}T12:00:00`,
      shown: fmtDate(r.returnDate),
      title: `${r.returnNo} – goods returned${r.status === "void" ? " (voided)" : ""}`,
      sub: r.items.map((i) => `${i.productName} ×${formatQty(i.quantity)}`).join(", "),
      cls: "is-out",
    });
  }

  if (s.cancelledAt) {
    events.push({
      when: s.cancelledAt,
      shown: fmtWhen(s.cancelledAt),
      title: "Sale cancelled",
      sub: s.cancelReason || "",
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

function renderRelated(s: Sale): void {
  const el = $("sad-related");
  if (!el) return;

  const customer = s.customerId ? customers.find((c) => c.id === s.customerId) : null;

  const rows: [string, string][] = [
    ["Customer", customerName(s)],
    ["Phone", customer?.phone || "—"],
    ["Address", customer?.address || "—"],
    ["Sale date", fmtDate(s.saleDate)],
    ["Created", fmtWhen(s.createdAt)],
    ["Confirmed", s.confirmedAt ? fmtWhen(s.confirmedAt) : "—"],
    ["Cancelled", s.cancelledAt ? fmtWhen(s.cancelledAt) : "—"],
    ["Cancel reason", s.cancelReason || "—"],
    ["Notes", s.notes || "—"],
  ];

  if (s.vehicleChassisNo || s.vehicleRegNo) {
    rows.splice(
      3,
      0,
      ["Vehicle reg no", s.vehicleRegNo || "—"],
      ["Vehicle chassis no", s.vehicleChassisNo || "—"],
    );
  }

  el.innerHTML = rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("");
}

function renderReturns(list: SaleReturn[]): void {
  const tbody = $("sad-returns");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">No returns on this sale</td></tr>`;
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
        <td class="num">${formatNpr(r.goodsValue)}</td>
        <td>${
          r.status === "void"
            ? `<span class="pd-pill pd-pill-cancelled">Voided</span>`
            : `<span class="pd-pill pd-pill-received">Active</span>`
        }</td>
      </tr>`,
    )
    .join("");
}

function renderFollowups(list: Followup[]): void {
  const tbody = $("sad-followups");
  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="inv-empty">No follow-ups for this sale</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map((f) => {
      const cls =
        f.status === "done"
          ? "pd-pill-received"
          : f.status === "skipped"
            ? "pd-pill-draft"
            : f.isOverdue
              ? "pd-pill-cancelled"
              : "pd-pill-partial";

      const label = f.status === "pending" && f.isOverdue ? "Overdue" : f.status.charAt(0).toUpperCase() + f.status.slice(1);

      return `<tr>
        <td class="pud-nowrap">${esc(fmtDate(f.dueDate))}</td>
        <td>${esc(FOLLOWUP_LABEL[f.kind])}${f.installmentNumber ? ` #${f.installmentNumber}` : ""}</td>
        <td class="num">${f.amount > 0 ? formatNpr(f.amount) : "—"}</td>
        <td><span class="pd-pill ${cls}">${esc(label)}</span></td>
      </tr>`;
    })
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

async function doConfirm(s: Sale): Promise<void> {
  if (
    !confirm(
      `Confirm ${s.saleNo}? Stock goes down and an invoice number is given. It cannot be edited afterwards.`,
    )
  ) {
    return;
  }

  try {
    await confirmSale(s.id);
    await load();
    void refreshChoices();
  } catch (error) {
    showNotice(describe(error));
  }
}

function runAction(act: string): void {
  const s = sale;
  if (!s) return;

  if (act === "edit") openForm(s);
  else if (act === "pay") openPay(s);
  else if (act === "return") openReturn(s);
  else if (act === "confirm") void doConfirm(s);
  else if (act === "cancel") {
    openReason(
      `Cancel ${s.saleNo}`,
      "A cancelled draft has no effect on stock.",
      async (reason) => {
        await cancelSale(s.id, reason);
      },
      s.id,
    );
  }
}

document
  .querySelectorAll<HTMLButtonElement>("#sad-actionbar [data-act]")
  .forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn.dataset.act ?? ""));
  });

$("sad-pay-btn")?.addEventListener("click", () => runAction("pay"));

// ==================================================
// LOAD
// ==================================================

async function load(): Promise<void> {
  showNotice(null);

  try {
    sale = await getSale(saleId);
  } catch (error) {
    const missing = error instanceof ApiError && error.status === 404;

    showNotice(missing ? "This sale could not be found." : describe(error));
    setText("sad-no", "Sale not found");
    return;
  }

  renderHeader(sale);
  renderActions(sale);
  renderInfo(sale);
  renderLines(sale);
  renderPayments(sale);
  renderEmi(sale);
  renderRelated(sale);

  if (!canWrite) {
    showNotice("Read-only: you are viewing this branch from Head Office.", "info");
  }

  // Returns and follow-ups live on their own endpoints.
  let returns: SaleReturn[] = [];

  try {
    returns = (await listReturns()).filter((r) => r.saleId === saleId);
    renderReturns(returns);
  } catch (error) {
    const tbody = $("sad-returns");

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">${esc(describe(error))}</td></tr>`;
    }
  }

  renderActivity(sale, returns);

  try {
    const all = await listFollowups({ status: "" });
    renderFollowups(all.filter((f) => f.saleId === saleId));
  } catch (error) {
    const tbody = $("sad-followups");

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" class="inv-empty">${esc(describe(error))}</td></tr>`;
    }
  }
}

/** Stock and bikes move when a sale is confirmed or returned. */
async function refreshChoices(): Promise<void> {
  try {
    [products, bikes] = await Promise.all([listStock(), listBikes("in_stock")]);
  } catch {
    /* the dialogs just keep their old choices */
  }
}

configureSalesDialogs({
  getProducts: () => products,
  getCustomers: () => customers,
  getBikes: () => bikes,
  getLocalProducts: () => localProducts,
  onChanged: async () => {
    await load();
    void refreshChoices();
  },
});

async function init(): Promise<void> {
  canWrite = getSession()?.accessMode !== "read_only";

  // The related tab and the dialogs need these; the page itself does not wait on them.
  void Promise.all([listCustomers(), listStock(), listBikes("in_stock"), listLocalProducts()])
    .then(([c, p, b, l]) => {
      customers = c;
      products = p;
      bikes = b;
      localProducts = l;

      if (sale) renderRelated(sale);
    })
    .catch(() => {});

  await load();
}

void init();
