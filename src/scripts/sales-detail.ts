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
  addFreeService,
  listTechnicians,
  assignTechnician,
  officeStartJob,
  officeFinishJob,
  JOB_STATUS_LABEL,
  removeFreeService,
  setFreeServiceCount,
  formatNpr,
  formatQty,
  STATUS_LABEL,
  TYPE_LABEL,
  SERVICE_KIND_LABEL,
  DOC_CATEGORY_LABEL,
  listSaleDocuments,
  downloadSaleDocument,
  verifySaleDocument,
  deleteSaleDocument,
  uploadSaleDocument,
  type SaleDocument,
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
  submit,
  showError,
  dlg,
  val,
  today,
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
    kind.textContent = kindLabel(s);
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
  setText("inf-kind", kindLabel(s));
  const financed = s.paymentMode === "financed";
  setText("inf-due-label", emi ? "First EMI Due" : financed ? "Company Pays By" : "Pay By");
  setText("inf-due", fmtDate(emi ? s.firstEmiDue : financed ? s.financerDueDate : s.dueDate));
  setHidden("inf-fin-row", !financed);
  setHidden("inf-fin-recv-row", !financed);
  setText("inf-fin", [s.financerName, s.financerRef].filter(Boolean).join(" · "));
  setText(
    "inf-fin-recv",
    `${formatNpr(s.financerReceived)} of ${formatNpr(s.financerReceivable)} received from company`,
  );

  setText("inf-subtotal", formatNpr(s.subtotal));
  setText("inf-discount", s.discount > 0 ? `− ${formatNpr(s.discount)}` : formatNpr(0));
  setText("inf-vat-label", `VAT ${formatQty(s.vatRate)}%`);
  setText("inf-vat", formatNpr(s.vatAmount));
  setText("inf-net", formatNpr(s.netTotal));

  setHidden("inf-finance-row", !emi);
  setHidden("inf-amountdue-row", !emi);
  setHidden("inf-rate-row", !emi || s.interestRate === null);
  setText("inf-rate", `${formatQty(s.interestRate ?? 0)}%`);
  setHidden("inf-monthly-row", !emi);
  setText("inf-monthly-label", `Monthly Installment (${s.emiMonths} months)`);
  setText("inf-monthly", formatNpr(s.emiAmount));
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
        <td>${esc(METHOD_LABEL[x.method] ?? x.method)}${x.payer === "financer" ? " · from company" : ""}</td>
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

function kindLabel(s: Sale): string {
  const base =
    s.saleType === "maintenance" && s.serviceKind !== "paid"
      ? `Maintenance · ${SERVICE_KIND_LABEL[s.serviceKind]}${s.freeServiceForNo ? ` of ${s.freeServiceForNo}` : ""}`
      : TYPE_LABEL[s.saleType];

  return `${base}${s.paymentMode === "emi" ? " · Own EMI" : s.paymentMode === "financed" ? " · Financed" : ""}`;
}

const sizeText = (n: number): string => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

async function renderDocuments(s: Sale): Promise<void> {
  const show = s.saleType === "maintenance" && s.serviceKind === "accident";

  setHidden("sad-doc-tab", !show);
  if (!show) return;

  const open = s.status === "draft";
  setHidden("sad-doc-add-btn", !(canWrite && s.status !== "cancelled"));
  setText(
    "doc-note",
    s.documentsIgnored
      ? "The bill was made without all papers verified."
      : s.documentsTotal === 0
        ? "No papers uploaded yet. Upload and verify them before billing."
        : s.documentsVerified === s.documentsTotal
          ? "All papers are verified."
          : `${s.documentsTotal - s.documentsVerified} of ${s.documentsTotal} papers still to verify.`,
  );

  const tbody = $("sad-docs");
  if (!tbody) return;

  let docs: SaleDocument[] = [];

  try {
    docs = await listSaleDocuments(s.id);
  } catch (error) {
    showNotice(describe(error));
  }

  if (!docs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="inv-empty">No papers yet</td></tr>`;
    return;
  }

  tbody.innerHTML = docs
    .map(
      (d) => `<tr>
        <td><button type="button" class="btn-link" data-dl-doc="${d.id}">${esc(d.title)}</button><br /><small>${esc(d.fileName)} · ${sizeText(d.size)}</small></td>
        <td>${esc(DOC_CATEGORY_LABEL[d.category] ?? d.category)}</td>
        <td>${esc(d.uploadedBy || "—")}<br /><small>${esc(fmtDate(d.createdAt.slice(0, 10)))}</small></td>
        <td>${d.verified ? `<strong>Verified</strong><br /><small>${esc(d.verifiedBy)} · ${esc(fmtDate((d.verifiedAt ?? "").slice(0, 10)))}</small>` : "Not verified"}</td>
        <td class="actions">${
          canWrite && s.status !== "cancelled"
            ? `<button type="button" class="btn-link" data-vf-doc="${d.id}" data-to="${d.verified ? "0" : "1"}">${d.verified ? "Unverify" : "Mark verified"}</button>`
            : ""
        }${open && canWrite ? ` <button type="button" class="btn-link is-danger" data-rm-doc="${d.id}">Remove</button>` : ""}</td>
      </tr>`,
    )
    .join("");

  const byId = (id: string) => docs.find((d) => d.id === Number(id));
  const run = async (fn: () => Promise<unknown>, reload = true) => {
    try {
      await fn();
      if (reload) await load();
    } catch (error) {
      showNotice(describe(error));
    }
  };

  tbody.querySelectorAll<HTMLButtonElement>("[data-dl-doc]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = byId(b.dataset.dlDoc ?? "");
      if (d) void run(() => downloadSaleDocument(s.id, d), false);
    }),
  );
  tbody.querySelectorAll<HTMLButtonElement>("[data-vf-doc]").forEach((b) =>
    b.addEventListener("click", () => void run(() => verifySaleDocument(s.id, Number(b.dataset.vfDoc), b.dataset.to === "1"))),
  );
  tbody.querySelectorAll<HTMLButtonElement>("[data-rm-doc]").forEach((b) =>
    b.addEventListener("click", () => {
      if (confirm("Remove this paper?")) void run(() => deleteSaleDocument(s.id, Number(b.dataset.rmDoc)));
    }),
  );
}

function hoursText(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  const mins = Math.max(Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000), 0);
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} m` : `${mins} min`;
}

function renderJob(s: Sale): void {
  const show = s.saleType === "maintenance" && s.status !== "cancelled";

  setHidden("sad-job-tab", !show);
  if (!show) return;

  setText("job-tech", s.technicianName || "Not given yet");
  setText("job-status", s.technicianId ? JOB_STATUS_LABEL[s.jobStatus] : "—");
  setText("job-time", hoursText(s.jobStartedAt, s.jobDoneAt));
  setText("job-notes", s.jobNotes ? `Technician's notes: ${s.jobNotes}` : "");
  setHidden("sad-job-assign-btn", !(canWrite && s.jobStatus !== "done"));
  setHidden("sad-job-start-btn", !(canWrite && s.technicianId && s.jobStatus === "pending"));
  setHidden("sad-job-done-btn", !(canWrite && s.technicianId && s.jobStatus !== "done"));
}

function renderFreeService(s: Sale): void {
  const show = s.saleType === "bike" && s.status === "confirmed";

  setHidden("sad-fs-tab", !show);

  if (!show) {
    if (document.querySelector('.invd-tab.is-active[data-tab="freeservice"]')) showTab("details");
    return;
  }

  setText("fs-total", String(s.freeServices));
  setText("fs-used", String(s.freeServicesUsed));
  setText("fs-left", String(s.freeServicesLeft));
  setText(
    "fs-note",
    s.freeServices === 0
      ? "No free service was included with this bike. Use Change count to add some."
      : s.freeServicesLeft === 0
        ? "All free services are done."
        : `${s.freeServicesLeft} free service${s.freeServicesLeft === 1 ? "" : "s"} still to give.`,
  );
  setText("fs-covers", s.freeServiceCovers ? `Free service covers: ${s.freeServiceCovers}. Extra parts or extra work are charged.` : "Extra parts or extra work in a free service are charged.");
  setHidden("sad-fs-add-btn", !(canWrite && s.freeServicesLeft > 0));
  setHidden("sad-fs-count-btn", !canWrite);

  const tbody = $("sad-fs");
  if (!tbody) return;

  const records = s.freeServiceRecords;

  if (!records.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="inv-empty">No free service done yet</td></tr>`;
    return;
  }

  const last = records[records.length - 1].id;

  tbody.innerHTML = records
    .map(
      (r) => `<tr>
        <td><strong>${r.number}</strong></td>
        <td class="pud-nowrap">${esc(fmtDate(r.serviceDate))}</td>
        <td class="num">${r.odometerKm.toLocaleString("en-US")} km</td>
        <td>${esc(r.performance || "—")}</td>
        <td>${esc(r.workDone || "—")}</td>
        <td class="hide-sm">${esc(r.technician || "—")}</td>
        <td class="actions">${
          canWrite && r.id === last
            ? `<button type="button" class="btn-link is-danger" data-rm-fs="${r.id}">Remove</button>`
            : ""
        }</td>
      </tr>`,
    )
    .join("");

  tbody.querySelectorAll<HTMLButtonElement>("[data-rm-fs]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this free service record?")) return;

      try {
        await removeFreeService(s.id, Number(btn.dataset.rmFs));
        await load();
      } catch (error) {
        showNotice(describe(error));
      }
    });
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
        <td>${esc(FOLLOWUP_LABEL[f.kind])}${f.installmentNumber ? ` #${f.installmentNumber}` : f.serviceNumber ? ` #${f.serviceNumber}` : ""}</td>
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
  } catch (error) {
    if (error instanceof ApiError && error.code === "documents_unverified") {
      if (
        !confirm(
          `${error.message}\n\nOpen the Documents tab to upload and verify them first. Bill anyway without verified papers?`,
        )
      ) {
        showTab("documents");
        return;
      }

      try {
        await confirmSale(s.id, true);
      } catch (again) {
        showNotice(describe(again));
        return;
      }
    } else {
      showNotice(describe(error));
      return;
    }
  }

  await load();
  void refreshChoices();
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

$("sad-job-assign-btn")?.addEventListener("click", async () => {
  const s = sale;
  if (!s) return;

  try {
    const people = await listTechnicians();
    const list = people.map((p, i) => `${i + 1}. ${p.name}${p.position ? ` (${p.position})` : ""}`).join("\n");
    const answer = prompt(`Give the job to (type the number, or 0 to take it back):\n${list}`, "");
    if (answer === null || answer.trim() === "") return;

    const n = Number(answer);
    if (!Number.isInteger(n) || n < 0 || n > people.length) {
      showNotice("Type a number from the list.");
      return;
    }

    await assignTechnician(s.id, n === 0 ? null : people[n - 1].id);
    await load();
  } catch (error) {
    showNotice(describe(error));
  }
});

$("sad-job-start-btn")?.addEventListener("click", async () => {
  if (!sale) return;
  try {
    await officeStartJob(sale.id);
    await load();
  } catch (error) {
    showNotice(describe(error));
  }
});

$("sad-job-done-btn")?.addEventListener("click", async () => {
  if (!sale) return;
  const notes = prompt("Notes on the work done / how the bike runs (optional):", sale.jobNotes);
  if (notes === null) return;
  try {
    await officeFinishJob(sale.id, notes);
    await load();
  } catch (error) {
    showNotice(describe(error));
  }
});

$("sad-doc-add-btn")?.addEventListener("click", () => {
  showError("doc-error", null);
  ($("form-doc") as HTMLFormElement).reset();
  dlg("dlg-doc").showModal();
});

$("form-doc")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = sale;
  const file = ($("doc-file") as HTMLInputElement).files?.[0];
  if (!s || !file) return;

  void submit("doc-save", "doc-error", "dlg-doc", async () => {
    await uploadSaleDocument(s.id, file, val("doc-title"), val("doc-cat"));
    await load();
  });
});

$("sad-fs-add-btn")?.addEventListener("click", () => {
  const s = sale;
  if (!s) return;

  const last = s.freeServiceRecords[s.freeServiceRecords.length - 1];

  $("fs-title")!.textContent = `Record free service ${s.freeServicesUsed + 1} of ${s.freeServices}`;
  $("fs-sub")!.textContent = last
    ? `Previous: ${last.odometerKm.toLocaleString("en-US")} km on ${fmtDate(last.serviceDate)}`
    : "";
  ($("fs-date") as HTMLInputElement).value = today();
  ($("fs-date") as HTMLInputElement).min = s.saleDate;
  ($("fs-km") as HTMLInputElement).value = "";
  ($("fs-tech") as HTMLInputElement).value = "";
  ($("fs-perf") as HTMLTextAreaElement).value = "";
  ($("fs-work") as HTMLTextAreaElement).value = "";
  showError("fs-error", null);
  dlg("dlg-fs").showModal();
});

$("form-fs")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const s = sale;
  if (!s) return;

  void submit("fs-save", "fs-error", "dlg-fs", async () => {
    await addFreeService(s.id, {
      serviceDate: val("fs-date"),
      odometerKm: Number(val("fs-km")),
      performance: val("fs-perf"),
      workDone: val("fs-work"),
      technician: val("fs-tech"),
    });
    await load();
  });
});

$("sad-fs-count-btn")?.addEventListener("click", async () => {
  const s = sale;
  if (!s) return;

  const answer = prompt(`How many free services does this bike include? (${s.freeServicesUsed} already done)`, String(s.freeServices));
  if (answer === null) return;

  const count = Number(answer);

  if (!Number.isInteger(count) || count < 0 || count > 20) {
    showNotice("Enter a whole number from 0 to 20.");
    return;
  }

  const covers = prompt("What does a free service cover? (e.g. Labour, oil change, wash). Extra parts and extra work are charged.", s.freeServiceCovers);
  if (covers === null) return;

  try {
    await setFreeServiceCount(s.id, count, covers);
    await load();
  } catch (error) {
    showNotice(describe(error));
  }
});

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
  renderFreeService(sale);
  renderJob(sale);
  void renderDocuments(sale);
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
