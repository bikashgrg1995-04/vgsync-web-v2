import { ApiError, getSession, login, readRemembered } from '../lib/auth';

const root = document.documentElement;

const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
const themeLabel = document.querySelector<HTMLElement>('#theme-toggle-label');
const sunIcon = document.querySelector<SVGElement>('#theme-sun-icon');
const moonIcon = document.querySelector<SVGElement>('#theme-moon-icon');

const passwordInput = document.querySelector<HTMLInputElement>('#password');
const passwordToggle = document.querySelector<HTMLButtonElement>('#password-toggle');
const loginForm = document.querySelector<HTMLFormElement>('#login-form');
const forgotPasswordLink = document.querySelector<HTMLAnchorElement>('#forgot-password');
const submitButton = document.querySelector<HTMLButtonElement>('#login-submit');
const rememberCheckbox = document.querySelector<HTMLInputElement>('#remember-me');
const branchInput = document.querySelector<HTMLInputElement>('#branch-code');
const usernameInput = document.querySelector<HTMLInputElement>('#username');
const formMessage = document.querySelector<HTMLElement>('#form-message');

type Theme = 'dark' | 'light';

const getCurrentTheme = (): Theme =>
  root.dataset.theme === 'light' ? 'light' : 'dark';

const updateThemeUI = (theme: Theme): void => {
  const isDark = theme === 'dark';
  sunIcon?.classList.toggle('is-hidden', isDark);
  moonIcon?.classList.toggle('is-hidden', !isDark);
  if (themeLabel) themeLabel.textContent = isDark ? 'Light mode' : 'Dark mode';
  themeToggle?.setAttribute(
    'aria-label',
    isDark ? 'Switch to light mode' : 'Switch to dark mode',
  );
};

const setTheme = (theme: Theme): void => {
  root.dataset.theme = theme;
  updateThemeUI(theme);
  try {
    localStorage.setItem('vgsync-theme', theme);
  } catch {
    // ignore
  }
};

updateThemeUI(getCurrentTheme());

themeToggle?.addEventListener('click', () => {
  setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
});

passwordToggle?.addEventListener('click', () => {
  if (!passwordInput) return;
  const isPasswordHidden = passwordInput.type === 'password';
  passwordInput.type = isPasswordHidden ? 'text' : 'password';
  passwordToggle.setAttribute(
    'aria-label',
    isPasswordHidden ? 'Hide password' : 'Show password',
  );
  passwordToggle.setAttribute('aria-pressed', String(isPasswordHidden));
  passwordInput.focus();
});

type MessageType = 'error' | 'success' | 'info';

const showFormMessage = (message: string, type: MessageType = 'info'): void => {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.classList.remove('is-hidden', 'is-error', 'is-success', 'is-visible');
  formMessage.classList.add('is-visible', `is-${type}`);
};

const clearFormMessage = (): void => {
  if (!formMessage) return;
  formMessage.textContent = '';
  formMessage.classList.remove('is-visible', 'is-error', 'is-success');
};

// Already signed in -> skip the login screen.
const existing = getSession();
if (existing) {
  window.location.replace(existing.mustChangePassword ? '/dashboard/change-password' : '/dashboard');
}

// "Remember me" pre-fills the business code and username.
const remembered = readRemembered();
if (remembered) {
  if (branchInput) branchInput.value = remembered.businessCode;
  if (usernameInput) usernameInput.value = remembered.username;
  if (rememberCheckbox) rememberCheckbox.checked = true;
  document.querySelector<HTMLInputElement>('#password')?.focus();
}

// Notices sent here by other pages (?notice=...).
const NOTICES: Record<string, [string, MessageType]> = {
  expired: ['Your session has expired. Please sign in again.', 'info'],
  'password-changed': ['Password changed. Please sign in with your new password.', 'success'],
  'password-reset': ['Password reset. Please sign in with your new password.', 'success'],
  'logged-out': ['You have been signed out.', 'info'],
};
const notice = new URLSearchParams(window.location.search).get('notice');
if (notice && NOTICES[notice]) {
  showFormMessage(NOTICES[notice][0], NOTICES[notice][1]);
  window.history.replaceState(null, '', window.location.pathname);
}

let submitting = false;

loginForm?.addEventListener('submit', async (event: SubmitEvent) => {
  event.preventDefault();
  if (submitting) return;
  clearFormMessage();

  const formData = new FormData(event.currentTarget as HTMLFormElement);

  const businessCode = String(formData.get('branch_code') || '').trim();
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');
  const remember = formData.get('remember_me') === 'on';

  if (!businessCode || !username || !password) {
    showFormMessage('Please fill in all fields.', 'error');
    return;
  }

  submitting = true;
  submitButton?.setAttribute('disabled', '');
  const label = submitButton?.querySelector('span');
  if (label) label.textContent = 'Signing in…';

  try {
    const session = await login({ businessCode, username, password, remember });

    if (session.mustChangePassword) {
      showFormMessage('First login — please update your password.', 'info');
      window.location.href = '/dashboard/change-password';
      return;
    }

    showFormMessage(`Welcome, ${session.displayName}. Redirecting…`, 'success');
    window.location.href = '/dashboard';
  } catch (error) {
    showFormMessage(
      error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      'error',
    );
    submitting = false;
    submitButton?.removeAttribute('disabled');
    if (label) label.textContent = 'Sign In';
  }
});

// Carry what was typed over to the forgot-password page.
forgotPasswordLink?.addEventListener('click', () => {
  const params = new URLSearchParams();
  if (branchInput?.value.trim()) params.set('business_code', branchInput.value.trim());
  if (usernameInput?.value.trim()) params.set('username', usernameInput.value.trim());
  const query = params.toString();
  forgotPasswordLink.href = query ? `/forgot-password?${query}` : '/forgot-password';
});

loginForm?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
  input.addEventListener('input', () => clearFormMessage());
});
