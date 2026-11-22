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
import './table-cards';
import './skeleton';
import './boot-loader';
import { warmUp } from '../lib/warmup';
import { firstLoad } from '../lib/first-load';

const root = document.documentElement;
const shell = document.getElementById('app-shell');
const sidebarToggle = document.getElementById('sidebar-toggle');
const logoutBtn = document.getElementById('sidebar-logout');
const themeToggle = document.getElementById('theme-toggle');
const branchSelect = document.getElementById('branch-select') as HTMLSelectElement | null;
const branchSwitcher = document.getElementById('branch-switcher');
const branchTrigger = document.getElementById('branch-trigger');
const branchTriggerLabel = document.getElementById('branch-trigger-label');
const branchDropdown = document.getElementById('branch-dropdown');
const branchSearch = document.getElementById('branch-search') as HTMLInputElement | null;
const branchList = document.getElementById('branch-list');

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

  const path = window.location.pathname.replace(/\/+$/, '');
  if (session.mustChangePassword && path !== '/change-password') {
    window.location.replace('/change-password');
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
  // Typing the address of a page the menu hides does not open it.
  const here = window.location.pathname.replace(/\/+$/, '');
  const blocked = getNavItemsForRole().find(
    (i) => !allowed.has(i.id) && i.href.split('#')[0] === here && !i.href.includes('#'),
  );
  if (blocked && here !== '/dashboard') {
    window.location.replace('/dashboard');
    return;
  }

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

  setupMenuGroups();

  if (branchSwitcher || branchSelect) {
    if (!canSwitchBranch(session)) {
      if (branchSwitcher) branchSwitcher.style.display = 'none';
      if (branchSelect) branchSelect.style.display = 'none';
    } else {
      if (branchSwitcher) branchSwitcher.style.display = '';
      if (branchSelect) branchSelect.style.display = 'none'; // keep native hidden
      void fillBranches(session.activeBusinessId);
    }
  }
}

let cachedBranches: { id: number; name: string; code: string }[] = [];

function branchIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('all') || n.includes('every')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>`;
  }
  if (n.includes('head') || n.includes('office')) {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>`;
  }
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`;
}

function renderBranchList(activeId: number, filter = ''): void {
  if (!branchList) return;
  const q = filter.trim().toLowerCase();
  const items = cachedBranches.filter(
    (b) => !q || b.name.toLowerCase().includes(q) || b.code.toLowerCase().includes(q),
  );

  if (items.length === 0) {
    branchList.innerHTML = `<li class="branch-option-empty">No branches found</li>`;
    return;
  }

  branchList.innerHTML = items
    .map((b) => {
      const active = b.id === activeId;
      return `<li>
        <button type="button" class="branch-option${active ? ' is-active' : ''}" data-branch-id="${b.id}" role="option" aria-selected="${active}">
          <span class="branch-option-icon">${branchIcon(b.name)}</span>
          <span>${escapeHtml(b.name)}</span>
          ${active ? `<svg class="branch-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>` : ''}
        </button>
      </li>`;
    })
    .join('');
}

async function fillBranches(activeId: number): Promise<void> {
  if (!branchSelect && !branchList) return;
  try {
    const branches = await loadBranches();
    cachedBranches = branches.map((b) => ({ id: b.id, name: b.name, code: b.code }));

    // Keep hidden native select in sync (fallback / accessibility)
    if (branchSelect) {
      branchSelect.innerHTML = branches
        .map(
          (b) =>
            `<option value="${b.id}" ${b.id === activeId ? 'selected' : ''}>${escapeHtml(b.name)} (${escapeHtml(b.code)})</option>`,
        )
        .join('');
    }

    const current = branches.find((b) => b.id === activeId);
    if (branchTriggerLabel && current) {
      branchTriggerLabel.textContent = current.name;
    }

    renderBranchList(activeId);
  } catch {
    // Keep whatever is shown; the user can reload to try again.
  }
}

function openBranchDropdown(): void {
  if (!branchDropdown || !branchTrigger) return;
  branchDropdown.hidden = false;
  branchTrigger.setAttribute('aria-expanded', 'true');
  branchSearch?.focus();
}

function closeBranchDropdown(): void {
  if (!branchDropdown || !branchTrigger) return;
  branchDropdown.hidden = true;
  branchTrigger.setAttribute('aria-expanded', 'false');
  if (branchSearch) branchSearch.value = '';
  const session = getSession();
  if (session) renderBranchList(session.activeBusinessId);
}

async function handleBranchPick(id: number): Promise<void> {
  closeBranchDropdown();
  if (branchTrigger) branchTrigger.setAttribute('disabled', 'true');
  try {
    await switchBranch(id);
    window.location.reload();
  } catch {
    if (branchTrigger) branchTrigger.removeAttribute('disabled');
    const current = getSession();
    if (current) void fillBranches(current.activeBusinessId);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Custom branch dropdown interactions
if (branchTrigger) {
  branchTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (branchDropdown?.hidden) openBranchDropdown();
    else closeBranchDropdown();
  });
}

branchList?.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-branch-id]') as HTMLElement | null;
  if (!btn) return;
  const id = Number(btn.dataset.branchId);
  if (!Number.isFinite(id)) return;
  void handleBranchPick(id);
});

branchSearch?.addEventListener('input', () => {
  const session = getSession();
  if (session) renderBranchList(session.activeBusinessId, branchSearch.value);
});

document.addEventListener('click', (e) => {
  if (!branchSwitcher) return;
  if (!branchSwitcher.contains(e.target as Node)) {
    closeBranchDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeBranchDropdown();
});

// Fallback: native select change (kept for accessibility tools)
if (branchSelect) {
  branchSelect.addEventListener('change', async () => {
    const id = Number(branchSelect.value);
    void handleBranchPick(id);
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
import './notification-bell';


// ---- Collapsible menu sections ----------------------------------------
// Sections start folded; the one holding the open page is unfolded, and so
// is anything the person unfolded earlier (kept in the browser, best effort).
const OPEN_GROUPS_KEY = 'vgsync.menu.open';

function readOpenGroups(): Set<string> {
  try {
    const raw = window.localStorage.getItem(OPEN_GROUPS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveOpenGroups(open: Set<string>): void {
  try {
    window.localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify([...open]));
  } catch {
    // Not saving is fine.
  }
}

function setGroupOpen(group: string, open: boolean): void {
  document
    .querySelectorAll<HTMLElement>(`[data-nav-group-item="${group}"]`)
    .forEach((li) => li.classList.toggle('is-folded', !open));
  document
    .querySelector<HTMLElement>(`[data-group-toggle="${group}"]`)
    ?.setAttribute('aria-expanded', String(open));
}

export function refreshMenuGroups(): void {
  setupMenuGroups();
}

function setupMenuGroups(): void {
  const stored = readOpenGroups();
  const groups = Array.from(document.querySelectorAll<HTMLElement>('[data-group-toggle]'));

  for (const toggle of groups) {
    const group = toggle.dataset.groupToggle!;
    const holdsPage = !!document.querySelector(`[data-nav-group-item="${group}"] .sidebar-link.is-active`);

    setGroupOpen(group, holdsPage || stored.has(group));

    if (toggle.dataset.bound) continue;
    toggle.dataset.bound = '1';
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      const now = readOpenGroups();

      setGroupOpen(group, open);
      if (open) now.add(group);
      else now.delete(group);
      saveOpenGroups(now);
    });
  }
}

// ---- Offline bar + background warm-up ------------------------------------------
{
  let bar: HTMLElement | null = null;
  const show = (offline: boolean) => {
    if (offline && !bar) {
      bar = document.createElement('div');
      bar.className = 'offline-bar';
      bar.setAttribute('role', 'status');
      bar.textContent = "You're offline. Showing saved data; saving is turned off until you're back online.";
      document.body.appendChild(bar);
    } else if (!offline && bar) {
      bar.remove();
      bar = null;
    }
  };
  window.addEventListener('offline', () => show(true));
  window.addEventListener('online', () => {
    show(false);
    window.dispatchEvent(new Event('vg:data-changed')); // look for anything new
  });
  window.addEventListener('vg:reach', (e) => show((e as CustomEvent<boolean>).detail === false));
  if (navigator.onLine === false) show(true);

  void warmUp(firstLoad);
}

// Keep the app's pages and files on the device so it opens without internet.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
