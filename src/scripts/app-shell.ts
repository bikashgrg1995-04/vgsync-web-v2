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
const profileLogout = document.getElementById('profile-logout');
const themeChips = document.querySelectorAll<HTMLButtonElement>('[data-theme-value]');
const branchSelect = document.getElementById('branch-select') as HTMLSelectElement | null;

const profileBtn = document.getElementById('header-profile');
const profileMenu = document.getElementById('profile-menu');
const profileWrap = document.getElementById('profile-wrap');

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

logoutBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  doLogout();
});

profileLogout?.addEventListener('click', (e) => {
  e.preventDefault();
  doLogout();
});

/* —— Profile dropdown —— */
function openProfileMenu(): void {
  if (!profileMenu || !profileBtn) return;
  profileMenu.hidden = false;
  profileBtn.setAttribute('aria-expanded', 'true');
  profileWrap?.classList.add('is-open');
}

function closeProfileMenu(): void {
  if (!profileMenu || !profileBtn) return;
  profileMenu.hidden = true;
  profileBtn.setAttribute('aria-expanded', 'false');
  profileWrap?.classList.remove('is-open');
}

profileBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (profileMenu?.hidden) openProfileMenu();
  else closeProfileMenu();
});

document.addEventListener('click', (e) => {
  if (!profileWrap?.contains(e.target as Node)) {
    closeProfileMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProfileMenu();
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

  const menuName = document.getElementById('profile-menu-name');
  const menuRole = document.getElementById('profile-menu-role');
  const menuBranch = document.getElementById('profile-menu-branch');
  if (menuName) menuName.textContent = session.displayName;
  if (menuRole) menuRole.textContent = session.roleLabel;
  if (menuBranch) menuBranch.textContent = session.activeBranchName;

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
