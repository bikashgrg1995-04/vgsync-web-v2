import {
  clearSession,
  getSession,
  canSwitchBranch,
  switchActiveBranch,
  getAccessibleBranches,
} from '../lib/auth';

const root = document.documentElement;
const shell = document.getElementById('app-shell');
const sidebarToggle = document.getElementById('sidebar-toggle');
const logoutBtn = document.getElementById('sidebar-logout');
const themeChips = document.querySelectorAll<HTMLButtonElement>('[data-theme-value]');
const branchSelect = document.getElementById('branch-select') as HTMLSelectElement | null;

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
  window.location.href = '/';
});

// ——— Branch switch (HO only) ———
function refreshBranchUI(): void {
  const session = getSession();
  if (!session) return;

  const branchLabel = document.getElementById('branch-label');
  if (branchLabel) branchLabel.textContent = session.activeBranchName;

  const subEl = document.querySelector('.profile-sub');
  if (subEl) {
    subEl.textContent = `${session.roleLabel} · ${session.activeBranchName}`;
  }

  const branchInfo = document.getElementById('skeleton-branch-info');
  if (branchInfo) {
    branchInfo.textContent = `Active: ${session.activeBranchCode} — ${session.activeBranchName}`;
  }
}

if (branchSelect) {
  const session = getSession();
  if (session && canSwitchBranch(session)) {
    const branches = getAccessibleBranches(session);
    branchSelect.innerHTML = branches
      .map(
        (b) =>
          `<option value="${b.code}" ${b.code === session.activeBranchCode ? 'selected' : ''}>${b.name} (${b.code})</option>`,
      )
      .join('');

    branchSelect.addEventListener('change', () => {
      const code = branchSelect.value;
      const updated = switchActiveBranch(code);
      if (updated) {
        refreshBranchUI();
        // Later: re-fetch page data for the selected branch from Django
        // For now just update the UI context
      }
    });
  } else if (branchSelect) {
    branchSelect.style.display = 'none';
  }
}

if (!getSession()) {
  window.location.replace('/');
}
