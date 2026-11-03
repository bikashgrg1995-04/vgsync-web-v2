import { clearSession, getSession } from '../lib/auth';

const root = document.documentElement;
const shell = document.getElementById('app-shell');
const sidebarToggle = document.getElementById('sidebar-toggle');
const logoutBtn = document.getElementById('sidebar-logout');
const themeChips = document.querySelectorAll<HTMLButtonElement>('[data-theme-value]');

type Theme = 'dark' | 'light';

const getCurrentTheme = (): Theme =>
  root.dataset.theme === 'light' ? 'light' : 'dark';

const setTheme = (theme: Theme): void => {
  root.dataset.theme = theme;
  try {
    localStorage.setItem('vgsync-theme', theme);
  } catch {
    // ignore
  }
  themeChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.themeValue === theme);
  });
};

// Init theme chips
setTheme(getCurrentTheme());

themeChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const value = chip.dataset.themeValue as Theme;
    if (value) setTheme(value);
  });
});

// Sidebar toggle (mobile / collapsed)
sidebarToggle?.addEventListener('click', () => {
  shell?.classList.toggle('sidebar-open');
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  if (!shell?.classList.contains('sidebar-open')) return;
  const target = e.target as Node;
  const sidebar = document.getElementById('app-sidebar');
  if (
    sidebar &&
    !sidebar.contains(target) &&
    !sidebarToggle?.contains(target)
  ) {
    shell.classList.remove('sidebar-open');
  }
});

// Logout
logoutBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  clearSession();
  window.location.href = '/';
});

// Guard: if somehow no session, kick back to login
if (!getSession()) {
  window.location.replace('/');
}
