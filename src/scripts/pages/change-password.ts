import { getSession, changePassword, ApiError } from '../../lib/auth';

const form = document.getElementById('change-password-form') as HTMLFormElement | null;
const msg = document.getElementById('cp-message');
const sub = document.querySelector('.auth-card-sub');
const submit = form?.querySelector<HTMLButtonElement>('.auth-submit');

if (sub && getSession() && !getSession()?.mustChangePassword) {
  sub.textContent = 'You will be signed out on every device and asked to sign in with the new password.';
}

function showMsg(text: string, ok = false): void {
  if (!msg) return;
  msg.hidden = false;
  msg.textContent = text;
  msg.classList.toggle('is-ok', ok);
  msg.classList.toggle('is-err', !ok);
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!getSession()) {
    window.location.href = '/';
    return;
  }

  const data = new FormData(form);
  const current = String(data.get('current') || '');
  const next = String(data.get('next') || '');
  const confirm = String(data.get('confirm') || '');

  if (!current || !next) {
    showMsg('Please fill in all fields.');
    return;
  }
  if (next !== confirm) {
    showMsg('New passwords do not match.');
    return;
  }

  if (submit) submit.disabled = true;
  try {
    await changePassword(current, next, confirm);
    showMsg('Password updated. Please sign in again…', true);
    setTimeout(() => window.location.replace('/?notice=password-changed'), 800);
  } catch (error) {
    showMsg(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    if (submit) submit.disabled = false;
  }
});
