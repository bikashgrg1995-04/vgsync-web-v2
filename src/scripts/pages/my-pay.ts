import { getSession } from '../../lib/auth';
import { getMyPay, getMyIncentive, listMyStatement, formatNpr } from '../../lib/payments';

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
    $('mp-owed-sub').textContent = b.previousRemaining > 0
      ? `${formatNpr(b.previousRemaining)} from earlier, ${formatNpr(b.currentRemaining)} this month` : 'Earned but not paid yet';
    $('mp-adv').textContent = formatNpr(b.advance);
    $('mp-paid').textContent = formatNpr(b.totalPaid);
    $('mp-last').textContent = b.lastPaymentDate ? `Last paid ${b.lastPaymentDate}` : 'Nothing paid yet';
    $('mp-next').textContent = b.nextSalaryDate ?? '—';
    $('mp-type').textContent = pay.payType === 'monthly' ? 'Monthly salary' : 'Daily wage';

    $('mp-unsettled-card').hidden = pay.unsettled.length === 0;
    $('mp-unsettled').innerHTML = pay.unsettled.map((u) => `<tr>
      <td>${esc(u.date)}</td><td>${esc(u.description || KIND[u.kind] || u.kind)}${u.carriedOver ? ' <span class="pu-count">(carried over)</span>' : ''}</td>
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
