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
const themeChips = document.querySelectorAll<HTMLButtonElement>('[data-theme-value]');
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
};

setTheme(getCurrentTheme());

themeChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const value = chip.dataset.themeValue as Theme;
    if (value) setTheme(value);
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

  const nameEl = document.getElementById('sidebar-profile-name');
  const roleEl = document.getElementById('sidebar-profile-role');
  const branchNameEl = document.querySelector('.sidebar-branch-name');
  if (nameEl) nameEl.textContent = session.displayName;
  if (roleEl) roleEl.textContent = session.roleLabel;
  if (branchNameEl) branchNameEl.textContent = session.activeBranchName;

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
