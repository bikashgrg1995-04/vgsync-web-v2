import {
  getSession,
  refreshProfile,
  logout,
  canSwitchBranch,
  loadBranches,
  switchBranch,
} from '../lib/auth';
import { AUTH_STORAGE_KEY } from '../lib/session-store';
import { redirectToLogin } from '../lib/api';
import { getNavItemsForRole, navItemVisible, type NavViewer } from '../lib/navigation';
import { paintAvatar } from '../lib/avatar';

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

const getCurrentTheme = (): Theme =>
  root.dataset.theme === 'light' ? 'light' : 'dark';

const setTheme = (theme: Theme): void => {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }

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

let loggingOut = false;

async function doLogout(): Promise<void> {
  if (loggingOut) return;
  loggingOut = true;
  if (logoutConfirm instanceof HTMLButtonElement) logoutConfirm.disabled = true;
  // Revokes the refresh token on the server and clears this browser's session.
  await logout();
  window.location.replace('/?notice=logged-out');
}

function openLogoutDialog(): void {
  if (logoutDialog && typeof logoutDialog.showModal === 'function') {
    logoutDialog.showModal();
  } else if (window.confirm('Are you sure you want to log out of VGSync?')) {
    void doLogout();
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
logoutConfirm?.addEventListener('click', () => void doLogout());

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

  paintAvatar(initialsEl, session.userId, session.displayName);
  paintAvatar(document.getElementById('header-avatar'), session.userId, session.displayName);

  const branchInfo = document.getElementById('skeleton-branch-info');
  if (branchInfo) {
    branchInfo.textContent = `Branch: ${session.activeBranchCode} — ${session.activeBranchName}`;
  }

  const viewer: NavViewer = {
    isOwner: session.isOwner,
    permissions: session.permissions,
    companyOwner: session.isOwner && session.role === 'owner',
  };
  const allowed = new Set(
    getNavItemsForRole()
      .filter((item) => navItemVisible(item, viewer))
      .map((i) => i.id),
  );
  document.querySelectorAll<HTMLElement>('[data-nav-id]').forEach((el) => {
    const id = el.dataset.navId;
    // Settings, Help & Support and Logout are for every role.
    if (!id || id === 'settings' || id === 'help' || id === 'logout') return;
    const li = el.closest('li');
    const target = (li ?? el) as HTMLElement;

    target.style.display = allowed.has(id) ? '' : 'none';
  });

  // A section heading with nothing under it is hidden too.
  document.querySelectorAll<HTMLElement>('[data-nav-group]').forEach((label) => {
    const group = label.dataset.navGroup;
    const visible = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-nav-group-item="${group}"]`),
    ).some((li) => li.style.display !== 'none');

    label.style.display = visible ? '' : 'none';
  });

  if (branchSelect) {
    if (!canSwitchBranch(session)) {
      branchSelect.style.display = 'none';
    } else {
      branchSelect.style.display = '';
      void fillBranches(session.activeBusinessId);
    }
  }
}

async function fillBranches(activeId: number): Promise<void> {
  if (!branchSelect) return;
  try {
    const branches = await loadBranches();
    branchSelect.innerHTML = branches
      .map(
        (b) =>
          `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${escapeHtml(b.name)} (${escapeHtml(b.code)})</option>`,
      )
      .join('');
  } catch {
    // Keep whatever is shown; the user can reload to try again.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

if (branchSelect) {
  branchSelect.addEventListener('change', async () => {
    const id = Number(branchSelect.value);
    branchSelect.disabled = true;
    try {
      await switchBranch(id);
      // Pages load their data for the active branch, so reload them.
      window.location.reload();
    } catch {
      branchSelect.disabled = false;
      const current = getSession();
      if (current) void fillBranches(current.activeBusinessId);
    }
  });
}

applySessionUI();

// Check with the server that the account and branch are still valid (it may
// have been deactivated, or its password changed on another device).
if (getSession()) {
  refreshProfile()
    .then((fresh) => {
      if (fresh) applySessionUI();
    })
    .catch(() => {
      // 401s already redirect to login; other errors (offline) are ignored.
    });
}

// Signed out in another tab -> sign out here too.
window.addEventListener('storage', (event) => {
  if (event.key === AUTH_STORAGE_KEY && !getSession()) redirectToLogin('logged-out');
});
