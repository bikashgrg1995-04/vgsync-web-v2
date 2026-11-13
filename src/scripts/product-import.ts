import { ApiError } from '../lib/api';
import {
  downloadImportTemplate,
  importProducts,
  type ImportResult,
} from '../lib/inventory';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const COPY = {
  products: {
    title: 'Import products',
    help:
      'Add your product list from Excel. Columns: Stock No, Name, Brand, Model, Category, Group, Unit, MRP, Purchase Price, Sale Price, Reorder Level, Quantity (opening stock). Products already in the list are updated; their stock is not changed.',
  },
  prices: {
    title: 'Update MRP',
    help:
      'Change prices in bulk. The file needs Stock No and MRP; Purchase Price and Sale Price are optional. Use Export to get the current list, edit the prices, and upload it again. Names and stock are not changed.',
  },
} as const;

let mode: 'products' | 'prices' = 'products';
let onSaved: () => void = () => {};

function reset(): void {
  ($('imp-file') as HTMLInputElement).value = '';
  $('imp-result')!.hidden = true;
  $('imp-error')!.hidden = true;
  ($('imp-apply') as HTMLButtonElement).disabled = true;
}

function showError(message: string): void {
  const el = $('imp-error')!;
  el.textContent = message;
  el.hidden = false;
}

function show(result: ImportResult): void {
  const box = $('imp-result')!;
  const lines: string[] = [];

  if (result.errors.length) {
    lines.push(`<strong>${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}. Nothing is saved until the file is fixed.</strong>`);
    lines.push(
      '<ul style="margin:6px 0 0;padding-left:18px;max-height:180px;overflow:auto">' +
        result.errors.slice(0, 50).map((e) => `<li>Row ${e.row}: ${esc(e.message)}</li>`).join('') +
        (result.errors.length > 50 ? `<li>…and ${result.errors.length - 50} more</li>` : '') +
        '</ul>',
    );
  } else if (result.applied) {
    lines.push(`<strong>Saved.</strong> ${summary(result)}`);
  } else {
    lines.push(`<strong>File is fine.</strong> ${summary(result)} Press Save to apply.`);
  }

  box.innerHTML = lines.join('');
  box.hidden = false;
  ($('imp-apply') as HTMLButtonElement).disabled = result.applied || result.errors.length > 0;
}

function summary(r: ImportResult): string {
  const parts: string[] = [];
  if (mode === 'products') parts.push(`${r.created} new`);
  parts.push(`${r.updated} changed`, `${r.unchanged} already up to date`);
  return parts.join(' · ') + '.';
}

async function send(apply: boolean): Promise<void> {
  const file = ($('imp-file') as HTMLInputElement).files?.[0];
  $('imp-error')!.hidden = true;

  if (!file) {
    showError('Choose a file first.');
    return;
  }

  const buttons = [$('imp-check'), $('imp-apply')] as HTMLButtonElement[];
  buttons.forEach((b) => (b.disabled = true));

  try {
    const result = await importProducts(file, mode, apply);
    show(result);
    if (result.applied) onSaved();
  } catch (error) {
    showError(error instanceof ApiError ? error.message : 'Could not read this file.');
  } finally {
    ($('imp-check') as HTMLButtonElement).disabled = false;
  }
}

export function openProductImport(which: 'products' | 'prices', saved: () => void): void {
  mode = which;
  onSaved = saved;
  $('imp-title')!.textContent = COPY[which].title;
  $('imp-help')!.textContent = COPY[which].help;
  reset();
  ($('inv-import-dialog') as HTMLDialogElement).showModal();
}

$('imp-cancel')?.addEventListener('click', () => ($('inv-import-dialog') as HTMLDialogElement).close());
$('imp-check')?.addEventListener('click', () => void send(false));
$('imp-file')?.addEventListener('change', () => {
  $('imp-result')!.hidden = true;
  ($('imp-apply') as HTMLButtonElement).disabled = true;
});
$('imp-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  void send(true);
});
$('imp-template')?.addEventListener('click', () => {
  downloadImportTemplate().catch((e) => showError(e instanceof ApiError ? e.message : 'Download failed.'));
});
