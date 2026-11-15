/**
 * Phone layout for tables: on a narrow screen each row becomes a card, with
 * the column heading shown beside each value (so nothing needs sideways
 * scrolling). The look is in global.css; this only labels the cells.
 *
 * Pages build their tables with innerHTML, so the labels are re-applied
 * whenever the page changes. A table can opt out with data-cards="off".
 */

const QUERY = window.matchMedia('(max-width: 640px)');

function headings(table: HTMLTableElement): string[] {
  const rows = table.tHead?.rows;
  const row = rows && rows.length ? rows[rows.length - 1] : table.querySelector('tr');
  if (!row) return [];

  const labels: string[] = [];
  for (const cell of Array.from(row.cells)) {
    const text = (cell.textContent ?? '').trim();
    for (let i = 0; i < Math.max(1, cell.colSpan); i += 1) labels.push(text);
  }
  return labels;
}

function label(table: HTMLTableElement): void {
  const names = headings(table);
  table.classList.add('tc');

  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      const cells = Array.from(row.cells);
      // "Nothing here yet" rows span the table: show them as plain text.
      const note = cells.length === 1 && cells[0].colSpan > 1;
      row.classList.toggle('tc-note', note);
      if (note) continue;

      let column = 0;
      for (const cell of cells) {
        const text = names[column] ?? '';
        if (text) cell.setAttribute('data-label', text);
        else cell.removeAttribute('data-label');
        // Picture columns and empty action cells only waste a card's space.
        const bare = !text && !(cell.textContent ?? '').trim() && !cell.querySelector('button, a, input, select, img');
        cell.classList.toggle('tc-skip', bare || /^(image|photo|picture)$/i.test(text));
        column += Math.max(1, cell.colSpan);
      }
    }
  }
}

let queued = false;

function run(): void {
  queued = false;
  if (!QUERY.matches) return;
  document
    .querySelectorAll<HTMLTableElement>('table:not([data-cards="off"])')
    .forEach(label);
}

function schedule(): void {
  if (queued) return;
  queued = true;
  requestAnimationFrame(run);
}

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
QUERY.addEventListener('change', schedule);
schedule();
