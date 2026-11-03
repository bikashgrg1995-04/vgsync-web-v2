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
  themeChips.forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.themeValue === theme);
  });
};

// Always apply saved theme (same key as login page)
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

logoutBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  clearSession();
  // Keep theme when returning to login
  window.location.href = '/';
});

function applySessionUI(): void {
  const session = getSession();
  if (!session) {
    window.location.replace('/');
    return;
  }

  const nameEl = document.querySelector('.profile-name');
  const subEl = document.querySelector('.profile-sub');
  if (nameEl) nameEl.textContent = session.displayName;
  if (subEl) {
    subEl.textContent = `${session.roleLabel} · ${session.activeBranchName}`;
  }

  const branchLabel = document.getElementById('branch-label');
  if (branchLabel) branchLabel.textContent = session.activeBranchName;

  const branchInfo = document.getElementById('skeleton-branch-info');
  if (branchInfo) {
    branchInfo.textContent = `Active: ${session.activeBranchCode} — ${session.activeBranchName}`;
  }

  const allowed = new Set(
    getNavItemsForRole(session.role as UserRole).map((i) => i.id),
  );
  document.querySelectorAll<HTMLElement>('[data-nav-id]').forEach((el) => {
    const id = el.dataset.navId;
    if (!id || id === 'settings' || id === 'logout') return;
    const li = el.closest('li');
    const target = li ?? el;
    if (!allowed.has(id)) {
      (target as HTMLElement).style.display = 'none';
    } else {
      (target as HTMLElement).style.display = '';
    }
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
