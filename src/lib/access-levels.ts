import type { CatalogueModule } from './staff';

/**
 * Positions are edited as one choice per area (No access / View / Edit) plus a
 * few "special" permissions. This maps those choices to the permission codes the
 * server stores, so nothing about how access is enforced changes.
 */

export type Level = 'none' | 'view' | 'edit' | 'custom';

/** Special permissions per area: shown as extra checkboxes once the area has View. */
const SPECIAL: Record<string, string[]> = {
  inventory: ['view_cost', 'adjust', 'write_off', 'transfer'],
  purchases: ['pay', 'return'],
  sales: ['view_all', 'collect', 'discount', 'cancel', 'refund', 'delete'],
  finance: ['void', 'reconcile'],
  staff: ['pay_view', 'pay', 'view_audit'],
  backup: ['restore'],
};

/** Only the owner can use these now, so a position never needs them. */
const OWNER_ONLY_STAFF = new Set(['create', 'update', 'delete', 'assign_position', 'manage_positions', 'manage_permissions']);

/** What "Edit" is called for an area. */
const EDIT_LABEL: Record<string, string> = {
  reports: 'View and export',
  tasks: 'Assign and edit tasks',
  backup: 'Download backups',
};

export interface Area {
  module: string;
  label: string;
  view: string;
  edit: string[];
  special: Array<{ code: string; label: string }>;
  editLabel: string;
}

export function areasOf(catalogue: CatalogueModule[]): Area[] {
  return catalogue.map((mod) => {
    const usable = mod.actions.filter((a) => !a.reserved && !(mod.module === 'staff' && OWNER_ONLY_STAFF.has(a.action)));
    const specialSet = new Set(SPECIAL[mod.module] ?? []);
    return {
      module: mod.module,
      label: mod.label,
      view: `${mod.module}.view`,
      edit: usable.filter((a) => a.action !== 'view' && !specialSet.has(a.action)).map((a) => a.code),
      special: usable.filter((a) => specialSet.has(a.action)).map((a) => ({ code: a.code, label: a.label })),
      editLabel: EDIT_LABEL[mod.module] ?? 'Can edit',
    };
  });
}

/** The level a set of granted codes amounts to for one area. */
export function levelOf(area: Area, granted: Set<string>): Level {
  const hasView = granted.has(area.view);
  const held = area.edit.filter((c) => granted.has(c));
  if (!hasView && held.length === 0) return 'none';
  if (held.length === 0) return 'view';
  if (hasView && held.length === area.edit.length) return 'edit';
  return 'custom';
}

/** Codes held in an area that this screen has no control for; they are kept as they are. */
export function hiddenCodes(catalogue: CatalogueModule[], granted: Set<string>): string[] {
  const shown = new Set<string>();
  for (const a of areasOf(catalogue)) {
    shown.add(a.view);
    a.edit.forEach((c) => shown.add(c));
    a.special.forEach((s) => shown.add(s.code));
  }
  return [...granted].filter((c) => !shown.has(c));
}

export const LEVEL_LABEL: Record<Level, string> = {
  none: 'No access',
  view: 'View only',
  edit: 'Can edit',
  custom: 'Custom',
};

const VERB: Record<string, string> = { create: 'add', update: 'edit', delete: 'delete' };

/** "Custom" with what it holds, e.g. "View + add" for a position that can create but not edit. */
export function customLabel(area: Area, granted: Set<string>): string {
  const verbs = area.edit
    .filter((c) => granted.has(c))
    .map((c) => VERB[c.split('.')[1]] ?? c.split('.')[1].replace(/_/g, ' '));
  return `Custom: ${verbs.length ? `view + ${verbs.join(', ')}` : 'view'}`;
}
