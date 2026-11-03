import { findDemoUser, saveSession } from '../lib/auth';

const root = document.documentElement;

const themeToggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
const themeLabel = document.querySelector<HTMLElement>('#theme-toggle-label');
const sunIcon = document.querySelector<SVGElement>('#theme-sun-icon');
const moonIcon = document.querySelector<SVGElement>('#theme-moon-icon');

const passwordInput = document.querySelector<HTMLInputElement>('#password');
const passwordToggle = document.querySelector<HTMLButtonElement>('#password-toggle');
const loginForm = document.querySelector<HTMLFormElement>('#login-form');
const forgotPasswordButton = document.querySelector<HTMLButtonElement>('#forgot-password');
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

loginForm?.addEventListener('submit', (event: SubmitEvent) => {
  event.preventDefault();
  clearFormMessage();

  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);

  const branchCode = String(formData.get('branch_code') || '').trim();
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  if (!branchCode || !username || !password) {
    showFormMessage('Please fill in all fields.', 'error');
    return;
  }

  const user = findDemoUser(branchCode, username, password);

  if (!user) {
    showFormMessage('Invalid branch code, username or password.', 'error');
    return;
  }

  const session = saveSession(user);

  if (session.mustChangePassword) {
    showFormMessage('First login — please update your password.', 'info');
    setTimeout(() => {
      window.location.href = '/dashboard/change-password';
    }, 400);
    return;
  }

  showFormMessage(`Welcome, ${user.displayName}. Redirecting…`, 'success');
  setTimeout(() => {
    window.location.href = '/dashboard';
  }, 450);
});

forgotPasswordButton?.addEventListener('click', () => {
  clearFormMessage();
  showFormMessage('Please contact the owner to reset your password.', 'info');
});

loginForm?.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
  input.addEventListener('input', () => clearFormMessage());
});
