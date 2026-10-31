import type { User } from '../lib/types';
import { roleLabel } from '../lib/types';

export type View = 'dashboard' | 'projects' | 'leads' | 'bookings' | 'team' | 'settings';
const nav: Array<[View, string, string]> = [
  ['dashboard', 'Overview', '⌂'], ['projects', 'Projects & inventory', '▦'], ['leads', 'Leads & customers', '◌'], ['bookings', 'Booking approvals', '✓'], ['team', 'Team access', '♙'], ['settings', 'Workspace settings', '⚙'],
];

export function appShell(user: User, active: View, body: string) {
  const allowed = (view: View) => view !== 'team' || user.role === 'ADMIN';
  return `<div class="shell"><aside class="sidebar"><a class="brand" href="#dashboard"><span class="brand-mark">E</span><span>estate<strong>desk</strong><small>PROPERTY CRM</small></span></a><div class="workspace-label">WORKSPACE</div><nav>${nav.filter(([view]) => allowed(view)).map(([view, label, icon]) => `<a class="nav-link ${active === view ? 'is-active' : ''}" href="#${view}"><i>${icon}</i>${label}${view === 'bookings' ? '<b id="pending-count"></b>' : ''}</a>`).join('')}</nav><div class="sidebar-footer"><div class="sync-state"><i></i><span>Secure workspace<small>Role-aware access</small></span></div><button id="sign-out" class="text-button">↪ Sign out</button></div></aside><main><header class="topbar"><button id="mobile-menu" aria-label="Open navigation">☰</button><div class="breadcrumb">Workspace <span>/</span> ${nav.find(([view]) => view === active)?.[1]}</div><div class="profile"><span>${user.full_name.slice(0, 1).toUpperCase()}</span><div><strong>${user.full_name}</strong><small>${roleLabel(user.role)}</small></div></div></header><div id="toast" class="toast" role="status"></div><section class="content">${body}</section></main></div>`;
}
