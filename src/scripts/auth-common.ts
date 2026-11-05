/** Small helpers shared by the forgot-password and reset-password pages. */

const root = document.documentElement;
const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
const themeLabel = document.querySelector<HTMLElement>('#theme-toggle-label');
const sunIcon = document.querySelector<SVGElement>('#theme-sun-icon');
const moonIcon = document.querySelector<SVGElement>('#theme-moon-icon');

type Theme = 'dark' | 'light';

const currentTheme = (): Theme => (root.dataset.theme === 'light' ? 'light' : 'dark');

function paintTheme(theme: Theme): void {
  const isDark = theme === 'dark';
  sunIcon?.classList.toggle('is-hidden', isDark);
  moonIcon?.classList.toggle('is-hidden', !isDark);
  if (themeLabel) themeLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
  themeToggle?.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

paintTheme(currentTheme());

themeToggle?.addEventListener('click', () => {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  paintTheme(next);
  try {
    localStorage.setItem('vgsync-theme', next);
  } catch {
    // ignore
  }
});

document.querySelectorAll<HTMLButtonElement>('[data-toggle-password]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword ?? '') as HTMLInputElement | null;
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(show));
    input.focus();
  });
});

type MessageType = 'error' | 'success' | 'info';

export function showMessage(text: string, type: MessageType = 'info'): void {
  const el = document.getElementById('form-message');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-error', 'is-success', 'is-visible');
  el.classList.add('is-visible', `is-${type}`);
}

export function clearMessage(): void {
  const el = document.getElementById('form-message');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('is-error', 'is-success', 'is-visible');
}

export function setBusy(button: HTMLButtonElement | null, busy: boolean, busyText: string, idleText: string): void {
  if (!button) return;
  button.disabled = busy;
  const label = button.querySelector('span');
  if (label) label.textContent = busy ? busyText : idleText;
}
