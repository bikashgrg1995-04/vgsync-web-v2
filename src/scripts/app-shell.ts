import {
  clearSession,
  getSession,
  canSwitchBranch,
  switchActiveBranch,
  getAccessibleBranches,
  type UserRole,
} from '../lib/auth';
import { getNavItemsForRole } from '../lib/navigation';

const root = document.documentElement;
const shell = document.getElementById('app-shell');
const sidebarToggle = document.getElementById('sidebar-toggle');
const logoutBtn = document.getElementById('sidebar-logout');
const themeToggle = document.getElementById('theme-toggle');
const branchSelect = document.getElementById('branch-select') as HTMLSelectElement | null;

const logoutDialog = document.getElementById('logout-dialog') as HTMLDialogElement | null;
const logoutCancel = document.getElementById('logout-cancel');
const logoutConfirm = document.getElementById('logout-confirm');

type Theme = 'dark' | 'light';
const THEME_KEY = 'vgsync-theme';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const getCurrentTheme = (): Theme =>
  root.dataset.theme === 'light' ? 'light' : 'dark';

const setTheme = (theme: Theme): void => {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }

  // Keep legacy chip UI in sync if present (settings page)
  document.querySelectorAll<HTMLElement>('[data-theme-value]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.themeValue === theme);
  });
  document.querySelectorAll<HTMLElement>('[data-set-theme]').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('data-set-theme') === theme);
  });

  if (themeToggle) {
    themeToggle.setAttribute(
      'aria-label',
      theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    );
    themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    themeToggle.classList.toggle('is-dark', theme === 'dark');
    themeToggle.classList.toggle('is-light', theme === 'light');
  }
};

setTheme(getCurrentTheme());

themeToggle?.addEventListener('click', () => {
  setTheme(getCurrentTheme() === 'dark' ? 'light' : 'dark');
});

// Settings page theme buttons
document.querySelectorAll<HTMLElement>('[data-set-theme]').forEach((el) => {
  el.addEventListener('click', () => {
    const t = el.getAttribute('data-set-theme') as Theme | null;
    if (t === 'light' || t === 'dark') setTheme(t);
  });
});

sidebarToggle?.addEventListener('click', () => {
  shell?.classList.toggle('sidebar-open');
});

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

function doLogout(): void {
  clearSession();
  window.location.href = '/';
}

function openLogoutDialog(): void {
  if (logoutDialog && typeof logoutDialog.showModal === 'function') {
    logoutDialog.showModal();
  } else if (window.confirm('Are you sure you want to log out of VGSync?')) {
    doLogout();
  }
}

function closeLogoutDialog(): void {
  logoutDialog?.close();
}

logoutBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  openLogoutDialog();
});

logoutCancel?.addEventListener('click', () => closeLogoutDialog());
logoutConfirm?.addEventListener('click', () => doLogout());

logoutDialog?.addEventListener('click', (e) => {
  if (e.target === logoutDialog) closeLogoutDialog();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLogoutDialog();
});

function applySessionUI(): void {
  const session = getSession();
  if (!session) {
    window.location.replace('/');
    return;
  }

  const path = window.location.pathname;
  if (session.mustChangePassword && path !== '/dashboard/change-password') {
    window.location.replace('/dashboard/change-password');
    return;
  }

  const nameEl = document.getElementById('sidebar-profile-name');
  const roleEl = document.getElementById('sidebar-profile-role');
  const branchNameEl = document.querySelector('.sidebar-branch-name');
  const initialsEl = document.getElementById('sidebar-profile-initials');

  if (nameEl) nameEl.textContent = session.displayName;
  if (roleEl) roleEl.textContent = session.roleLabel;
  if (branchNameEl) branchNameEl.textContent = session.activeBranchName;
  if (initialsEl) initialsEl.textContent = getInitials(session.displayName);

  const branchInfo = document.getElementById('skeleton-branch-info');
  if (branchInfo) {
    branchInfo.textContent = `Branch: ${session.activeBranchCode} — ${session.activeBranchName}`;
  }

  const allowed = new Set(
    getNavItemsForRole(session.role as UserRole).map((i) => i.id),
  );
  document.querySelectorAll<HTMLElement>('[data-nav-id]').forEach((el) => {
    const id = el.dataset.navId;
    if (!id || id === 'settings' || id === 'logout') return;
    const li = el.closest('li');
    const target = (li ?? el) as HTMLElement;
    target.style.display = allowed.has(id) ? '' : 'none';
  });

  if (branchSelect) {
    if (!canSwitchBranch(session)) {
      branchSelect.style.display = 'none';
    } else {
      branchSelect.style.display = '';
      const branches = getAccessibleBranches(session);
      const current = session.activeBranchCode;
      branchSelect.innerHTML = branches
        .map(
          (b) =>
            `<option value="${b.code}" ${b.code === current ? 'selected' : ''}>${b.name} (${b.code})</option>`,
        )
        .join('');
    }
  }
}

if (branchSelect) {
  branchSelect.addEventListener('change', () => {
    const code = branchSelect.value;
    const updated = switchActiveBranch(code);
    if (updated) applySessionUI();
  });
}

applySessionUI();
