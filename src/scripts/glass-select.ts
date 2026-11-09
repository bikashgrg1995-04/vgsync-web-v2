/**
 * Replaces the browser's native <select> popup with a glass-effect list.
 * The <select> itself stays in the page (so layout, values, forms and the
 * "change" events other scripts listen to keep working); only the popup is ours.
 */
let pop: HTMLDivElement | null = null;
let owner: HTMLSelectElement | null = null;
let items: HTMLElement[] = [];
let active = -1;

function isEnhanceable(el: EventTarget | null): el is HTMLSelectElement {
  return el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.disabled && !el.dataset.native;
}

function close(refocus = false): void {
  if (!pop) return;
  pop.remove();
  pop = null;
  owner?.setAttribute('aria-expanded', 'false');
  if (refocus) owner?.focus();
  owner = null;
  items = [];
  active = -1;
}

function setActive(i: number): void {
  if (items.length === 0) return;
  active = (i + items.length) % items.length;
  items.forEach((el, n) => el.classList.toggle('is-active', n === active));
  items[active].scrollIntoView({ block: 'nearest' });
}

function choose(select: HTMLSelectElement, index: number): void {
  const changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  close(true);
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function open(select: HTMLSelectElement): void {
  if (owner === select) return close();
  close();
  owner = select;
  select.setAttribute('aria-expanded', 'true');

  const el = document.createElement('div');
  el.className = 'gs-pop';
  el.setAttribute('role', 'listbox');
  el.tabIndex = -1;

  let group: Element | null = null;
  const addOption = (opt: HTMLOptionElement, index: number): void => {
    if (opt.hidden) return;
    const row = document.createElement('div');
    row.className = 'gs-item';
    row.setAttribute('role', 'option');
    if (opt.disabled || opt.parentElement?.matches('optgroup[disabled]')) row.classList.add('is-disabled');
    if (index === select.selectedIndex) {
      row.classList.add('is-selected');
      row.setAttribute('aria-selected', 'true');
    }
    if (group) row.classList.add('is-grouped');
    const label = document.createElement('span');
    label.textContent = opt.textContent || ' ';
    row.appendChild(label);
    row.addEventListener('mousedown', (e) => e.preventDefault());
    row.addEventListener('mousemove', () => {
      const n = items.indexOf(row);
      if (n !== -1 && n !== active) setActive(n);
    });
    row.addEventListener('click', () => {
      if (!row.classList.contains('is-disabled')) choose(select, index);
    });
    el.appendChild(row);
    items.push(row);
  };

  let index = 0;
  Array.from(select.children).forEach((child) => {
    if (child instanceof HTMLOptGroupElement) {
      const head = document.createElement('div');
      head.className = 'gs-group';
      head.textContent = child.label;
      el.appendChild(head);
      group = child;
      Array.from(child.children).forEach((o) => addOption(o as HTMLOptionElement, index++));
      group = null;
    } else if (child instanceof HTMLOptionElement) {
      addOption(child, index++);
    }
  });

  if (items.length === 0) {
    owner = null;
    return;
  }

  // Inside an open modal dialog the list must live in the dialog, or it would be hidden behind it.
  (select.closest('dialog[open]') ?? document.body).appendChild(el);
  pop = el;

  const r = select.getBoundingClientRect();
  const gap = 6;
  const below = window.innerHeight - r.bottom - gap - 10;
  const above = r.top - gap - 10;
  const natural = Math.min(el.scrollHeight, 288);
  const goUp = below < natural && above > below;
  const maxH = Math.max(120, Math.min(288, goUp ? above : below));
  el.style.maxHeight = `${maxH}px`;
  el.style.minWidth = `${Math.max(r.width, 140)}px`;
  el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 140) - 8))}px`;
  if (goUp) el.style.bottom = `${window.innerHeight - r.top + gap}px`;
  else el.style.top = `${r.bottom + gap}px`;

  const sel = items.findIndex((x) => x.classList.contains('is-selected'));
  setActive(sel === -1 ? 0 : sel);
}

document.addEventListener(
  'mousedown',
  (e) => {
    const t = e.target;
    if (pop && t instanceof Node && !pop.contains(t) && t !== owner) close();
    if (!isEnhanceable(t)) return;
    e.preventDefault();
    t.focus();
    open(t);
  },
  true,
);

document.addEventListener(
  'keydown',
  (e) => {
    const t = e.target;
    if (pop) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (owner && active > -1 && !items[active].classList.contains('is-disabled')) {
          choose(owner, optionIndexOf(owner, active));
        }
      } else if (e.key === 'Tab') close();
      return;
    }
    if (isEnhanceable(t) && (e.key === 'Enter' || e.key === ' ' || (e.altKey && e.key === 'ArrowDown'))) {
      e.preventDefault();
      open(t);
    }
  },
  true,
);

/** The popup skips hidden options, so map a row back to its real option index. */
function optionIndexOf(select: HTMLSelectElement, row: number): number {
  const visible = Array.from(select.options).map((o, i) => ({ o, i })).filter((x) => !x.o.hidden);
  return visible[row]?.i ?? select.selectedIndex;
}

window.addEventListener('resize', () => close());
window.addEventListener('scroll', (e) => { if (pop && !(e.target instanceof Node && pop.contains(e.target))) close(); }, true);
