import { ApiError } from "../lib/api";
import {
  createProduct,
  updateProduct,
  MAX_IMAGE_BYTES,
  type StockItem,
} from "../lib/inventory";

/**
 * Add / edit product dialog shared by the inventory list and detail pages.
 * Markup lives in components/inventory/ProductDialog.astro.
 */

const FIELD_LABELS: Record<string, string> = {
  stock_no: "Stock no",
  name: "Name",
  unit: "Unit",
  mrp: "MRP",
  purchase_price: "Purchase price",
  sale_price: "Sale price",
  reorder_level: "Reorder at",
  description: "Description",
  image: "Image",
};

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

const input = (id: string) => $(id) as HTMLInputElement;

let onSaved: (() => void | Promise<void>) | null = null;
let previewUrl: string | null = null;

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

function showError(message: string | null): void {
  const err = $("prd-error");
  if (!err) return;

  err.hidden = !message;
  err.textContent = message ?? "";
}

function setPreview(src: string | null): void {
  const img = $<HTMLImageElement>("prd-image-img");
  const placeholder = $("prd-image-placeholder");
  if (!img || !placeholder) return;

  if (src) {
    img.src = src;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    placeholder.hidden = false;
  }
}

function clearPreviewUrl(): void {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }
}

function refreshImageControls(hasExisting: boolean): void {
  const label = $("prd-image-label");
  const removeWrap = $("prd-remove-wrap");
  const hasFile = Boolean(input("prd-image").files?.length);

  if (label) {
    label.textContent =
      hasFile || hasExisting ? "Change image" : "Upload image";
  }

  if (removeWrap) removeWrap.hidden = !hasExisting || hasFile;
}

export interface ProductDialogOptions {
  /** The product to edit; leave out to add a new one. */
  item?: StockItem | null;

  /** Category suggestions for the category field. */
  categories?: string[];

  /** Called after a successful save (reload the page data here). */
  onSaved?: () => void | Promise<void>;
}

let existingImage = false;

export function openProductDialog(options: ProductDialogOptions = {}): void {
  const item = options.item ?? null;

  onSaved = options.onSaved ?? null;
  existingImage = Boolean(item?.image);

  input("prd-id").value = item ? String(item.productId) : "";

  const title = $("prd-title");
  if (title) title.textContent = item ? "Edit product" : "Add product";

  input("prd-stock-no").value = item?.stockNo ?? "";
  input("prd-name").value = item?.name ?? "";
  input("prd-brand").value = item?.brand ?? "";
  input("prd-model").value = item?.model ?? "";
  input("prd-category").value = item?.category ?? "";
  input("prd-group").value = item?.group ?? "";
  input("prd-unit").value = item?.unit || "pcs";
  input("prd-reorder").value = String(item?.reorderLevel ?? 0);
  input("prd-cost").value = String(item?.purchasePrice ?? 0);
  input("prd-sale").value = String(item?.salePrice ?? 0);
  input("prd-mrp").value = String(item?.mrp ?? 0);
  ($("prd-description") as HTMLTextAreaElement).value =
    item?.description ?? "";

  const list = $("prd-category-list");

  if (list && options.categories) {
    list.innerHTML = options.categories
      .map((c) => `<option value="${c.replace(/"/g, "&quot;")}"></option>`)
      .join("");
  }

  const dialog = $("inv-product-dialog") as HTMLElement | null;
  if (dialog) dialog.dataset.originalImage = item?.image ?? "";

  input("prd-image").value = "";
  input("prd-image-remove").checked = false;
  clearPreviewUrl();
  setPreview(item?.image ?? null);
  refreshImageControls(existingImage);

  showError(null);

  ($("inv-product-dialog") as HTMLDialogElement | null)?.showModal();
}

input("prd-image")?.addEventListener("change", () => {
  const file = input("prd-image").files?.[0];

  clearPreviewUrl();
  showError(null);

  if (!file) {
    setPreview(null);
    refreshImageControls(existingImage);
    return;
  }

  if (!file.type.startsWith("image/")) {
    input("prd-image").value = "";
    showError("Please choose an image file (JPG, PNG or WebP).");
    refreshImageControls(existingImage);
    return;
  }

  if (file.size > MAX_IMAGE_BYTES) {
    input("prd-image").value = "";
    showError("That image is larger than 5 MB. Please choose a smaller one.");
    refreshImageControls(existingImage);
    return;
  }

  previewUrl = URL.createObjectURL(file);
  setPreview(previewUrl);
  input("prd-image-remove").checked = false;
  refreshImageControls(existingImage);
});

input("prd-image-remove")?.addEventListener("change", () => {
  if (input("prd-image-remove").checked) {
    setPreview(null);
  } else {
    // Unticked: show whatever the dialog opened with again.
    const original = (
      $("inv-product-dialog") as HTMLElement | null
    )?.dataset.originalImage;

    if (original) setPreview(original);
  }
});

$("prd-cancel")?.addEventListener("click", () => {
  clearPreviewUrl();
  ($("inv-product-dialog") as HTMLDialogElement)?.close();
});

$("inv-product-dialog")?.addEventListener("close", clearPreviewUrl);

$("inv-product-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(null);

  const submit = $<HTMLButtonElement>("prd-submit");
  const id = input("prd-id").value;

  const body = {
    stockNo: input("prd-stock-no").value,
    name: input("prd-name").value,
    brand: input("prd-brand").value,
    model: input("prd-model").value,
    category: input("prd-category").value,
    group: input("prd-group").value,
    unit: input("prd-unit").value,
    reorderLevel: Number(input("prd-reorder").value),
    purchasePrice: Number(input("prd-cost").value),
    salePrice: Number(input("prd-sale").value),
    mrp: Number(input("prd-mrp").value),
    description: ($("prd-description") as HTMLTextAreaElement).value,
    image: input("prd-image").files?.[0] ?? null,
    removeImage: input("prd-image-remove").checked,
  };

  if (submit) submit.disabled = true;

  try {
    if (id) {
      await updateProduct(Number(id), body);
    } else {
      await createProduct(body);
    }

    clearPreviewUrl();
    ($("inv-product-dialog") as HTMLDialogElement)?.close();

    await onSaved?.();
  } catch (error) {
    showError(describe(error));
  } finally {
    if (submit) submit.disabled = false;
  }
});
