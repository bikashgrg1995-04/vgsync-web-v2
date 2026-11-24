import { getSession } from '../../lib/auth';
import { getMyPay, getMyIncentive, listMyStatement, formatNpr, niceDate } from '../../lib/payments';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const session = getSession();
if (!session) window.location.replace('/');
// The owner manages everyone's pay on the Payments screen.
else if (session.isOwner) window.location.replace('/payments');

const KIND: Record<string, string> = { salary: 'Salary', wage: 'Daily wage', bonus: 'Bonus', deduction: 'Deduction', payment: 'Payment' };
const METHOD: Record<string, string> = { cash: 'Cash', bank: 'Bank', esewa: 'eSewa', khalti: 'Khalti', cheque: 'Cheque', other: 'Other' };

async function load(): Promise<void> {
  $('mp-error').hidden = true;
  try {
    const pay = await getMyPay();
    const statement = pay ? await listMyStatement().catch(() => []) : [];
    $('mp-none').hidden = pay !== null;
    $('mp-body').hidden = pay === null;
    if (!pay) return;
    void getMyIncentive().then((inc) => {
      $('mp-incentive-card').hidden = inc.total <= 0;
      $('mp-inc-total').textContent = formatNpr(inc.total);
      $('mp-inc-lines').innerHTML = inc.lines.map((l) => `${l.name}: ${formatNpr(l.amount)}`).join('<br>');
    }).catch(() => { $('mp-incentive-card').hidden = true; });
    const b = pay.balance;
    $('mp-owed').textContent = formatNpr(b.remaining);
    $('mp-owed-sub').textContent = b.previousRemaining > 0 && pay.payType !== 'daily'
      ? `${formatNpr(b.previousRemaining)} from earlier months + ${formatNpr(b.currentRemaining)} this month` : 'Earned but not paid yet';
    const daily = pay.payType === 'daily';
    // Daily wage is not fixed: no "advance", just a credit to pay (which can include earlier amounts).
    $('mp-owed-label').textContent = daily ? 'Credit to pay' : 'Still to be paid';
    $('mp-adv-card').hidden = daily && b.advance <= 0;
    $('mp-adv-label').textContent = daily ? 'Paid ahead' : 'Advance';
    $('mp-adv-sub').textContent = daily ? 'Paid more than was earned, used against the next wage' : 'Paid ahead, used against the next salary';
    $('mp-adv').textContent = formatNpr(b.advance);
    $('mp-paid').textContent = formatNpr(b.totalPaid);
    $('mp-last').textContent = b.lastPaymentDate ? `Last paid ${b.lastPaymentDate}` : 'Nothing paid yet';
    $('mp-next').textContent = b.nextSalaryDate ?? '—';
    $('mp-type').textContent = pay.payType === 'monthly' ? 'Monthly salary' : 'Daily wage';
    // Monthly: the next salary, what an advance already covers and what is left to receive then.
    const nextAmt = b.nextSalaryAmount;
    $('mp-next-note').hidden = daily || nextAmt === null;
    if (!daily && nextAmt !== null) {
      const covered = Math.min(b.advance, nextAmt);
      $('mp-next-note').innerHTML = `Next salary ${formatNpr(nextAmt)}${b.nextSalaryDate ? ` on ${esc(b.nextSalaryDate)}` : ''}${covered > 0 ? ` · advance ${formatNpr(covered)} already covers it` : ''} · <strong>you will get ${formatNpr(nextAmt - covered)}</strong>`;
    }

    $('mp-unsettled-card').hidden = pay.unsettled.length === 0;
    // Monthly pay: money left from earlier months first, then this month.
    const unsettledRows = [...pay.unsettled].sort((a, b2) => a.date.localeCompare(b2.date));
    $('mp-unsettled').innerHTML = unsettledRows.map((u) => `<tr${u.carriedOver && pay.payType !== 'daily' ? ' class="pu-earlier"' : ''}>
      <td>${esc(niceDate(u.date))}</td><td>${esc(u.description || KIND[u.kind] || u.kind)}${u.carriedOver && pay.payType !== 'daily' ? ' <span class="pu-count">(earlier month, still unpaid)</span>' : ''}</td>
      <td class="num">${formatNpr(u.amount)}</td><td class="num">${formatNpr(u.paid)}</td><td class="num">${formatNpr(u.remaining)}</td></tr>`).join('');

    $('mp-count').textContent = `${statement.length} entries`;
    $('mp-rows').innerHTML = statement.length
      ? statement.map((r) => `<tr>
          <td>${esc(r.date)}</td><td>${esc(r.description || KIND[r.type] || r.type)}</td><td>${esc(METHOD[r.method] ?? r.method ?? '')}</td>
          <td class="num">${r.direction === 'earned' ? formatNpr(r.amount) : ''}</td>
          <td class="num">${r.direction === 'deducted' ? formatNpr(r.amount) : ''}</td>
          <td class="num">${r.direction === 'paid' ? formatNpr(r.amount) : ''}</td>
          <td class="num">${formatNpr(r.owedAfter)}</td></tr>`).join('')
      : '<tr><td colspan="7" class="pu-empty">Nothing yet.</td></tr>';
  } catch (e) {
    const box = $('mp-error');
    box.textContent = e instanceof Error && e.message ? e.message : 'Could not load your pay. Please try again.';
    box.hidden = false;
  }
}

$('mp-refresh').addEventListener('click', () => void load());
if (session && !session.isOwner) void load();
