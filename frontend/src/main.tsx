import './styles/app.css';
import { api, isAuthorized, login, logout } from './lib/api';
import type { Booking, Dashboard, Lead, Plot, Project, User } from './lib/types';
import { appShell, type View } from './components/AppShell';
import { loginPage } from './pages/LoginPage';
import { dashboardPage } from './pages/DashboardPage';
import { projectsPage } from './pages/ProjectsPage';
import { leadsPage } from './pages/LeadsPage';
import { bookingsPage } from './pages/BookingsPage';
import { teamPage } from './pages/TeamPage';
import { settingsPage } from './pages/SettingsPage';

const root = document.querySelector<HTMLDivElement>('#root')!;
let currentUser: User | null = null;
let projects: Project[] = [];

const showToast = (message: string, error = false) => { const toast = document.querySelector('#toast'); if (!toast) return; toast.textContent = message; toast.className = `toast show ${error ? 'error' : ''}`; window.setTimeout(() => { toast.className = 'toast'; }, 3500); };
const viewFromHash = (): View => { const view = location.hash.split('/')[0].replace('#', ''); return ['dashboard', 'projects', 'leads', 'bookings', 'team', 'settings'].includes(view) ? view as View : 'dashboard'; };
const can = (permission: string) => currentUser?.permissions.includes('*') || currentUser?.permissions.includes(permission);

async function renderApp() {
  if (!currentUser) return renderLogin();
  const view = viewFromHash();
  let body = '';
  try {
    if (view === 'dashboard') body = dashboardPage(await api<Dashboard>('/dashboard'));
    if (view === 'projects') {
      projects = await api<Project[]>('/projects');
      const selectedId = location.hash.split('/')[1] || projects[0]?.id;
      const selected = projects.find((project) => project.id === selectedId);
      const plots = selected ? await api<Plot[]>(`/projects/${selected.id}/plots`) : [];
      body = projectsPage(projects, selected, plots);
    }
    if (view === 'leads') body = leadsPage(await api<Lead[]>('/leads'));
    if (view === 'bookings') body = bookingsPage(await api<Booking[]>('/bookings'), Boolean(can('bookings:approve')));
    if (view === 'team') { if (currentUser.role !== 'ADMIN') { location.hash = '#dashboard'; return; } projects = await api<Project[]>('/projects'); body = teamPage(await api<User[]>('/users'), projects); }
    if (view === 'settings') body = settingsPage();
  } catch (error) { body = `<div class="error-panel"><h2>Unable to load this page</h2><p>${error instanceof Error ? error.message : 'Please refresh and try again.'}</p></div>`; }
  root.innerHTML = appShell(currentUser, view, body);
  bindShell();
  bindPageActions();
}

function renderLogin(error = '') {
  root.innerHTML = loginPage(error);
  document.querySelector<HTMLFormElement>('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { currentUser = await login(String(form.get('email')), String(form.get('password'))); location.hash = '#dashboard'; await renderApp(); }
    catch (reason) { renderLogin(reason instanceof Error ? reason.message : 'Sign in failed.'); }
  });
}

function bindShell() {
  document.querySelector('#sign-out')?.addEventListener('click', async () => { await logout(); currentUser = null; renderLogin(); });
  document.querySelector('#mobile-menu')?.addEventListener('click', () => document.querySelector('.sidebar')?.classList.toggle('open'));
}

function bindPageActions() {
  document.querySelectorAll<HTMLButtonElement>('[data-booking]').forEach((button) => button.addEventListener('click', async () => {
    const decision = button.dataset.decision; if (!decision || !confirm(`Are you sure you want to ${decision} this booking?`)) return;
    try { await api(`/bookings/${button.dataset.booking}/${decision}`, { method: 'POST', body: JSON.stringify({ reason: '' }) }); showToast(`Booking ${decision}d.`); renderApp(); } catch (error) { showToast(error instanceof Error ? error.message : 'Could not update booking.', true); }
  }));
  document.querySelector('#new-project')?.addEventListener('click', showProjectForm);
  document.querySelector('#new-plot')?.addEventListener('click', showPlotForm);
  document.querySelector('#new-lead')?.addEventListener('click', showLeadForm);
  document.querySelector('#invite-user')?.addEventListener('click', showUserForm);
}

function openDialog(title: string, fields: string, submit: (form: FormData) => Promise<void>) {
  document.querySelector('.dialog-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="dialog-backdrop"><form class="dialog" id="workspace-form"><div class="dialog-heading"><h2>${title}</h2><button type="button" class="close-dialog" aria-label="Close">×</button></div>${fields}<p class="dialog-error"></p><div class="dialog-actions"><button type="button" class="secondary-button close-dialog">Cancel</button><button class="primary-button">Save changes</button></div></form></div>`);
  const close = () => document.querySelector('.dialog-backdrop')?.remove();
  document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', close));
  document.querySelector<HTMLFormElement>('#workspace-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const submitButton = event.currentTarget.querySelector<HTMLButtonElement>('.primary-button')!; submitButton.disabled = true;
    try { await submit(form); close(); showToast('Saved successfully.'); renderApp(); }
    catch (error) { const target = event.currentTarget.querySelector('.dialog-error')!; target.textContent = error instanceof Error ? error.message : 'Could not save changes.'; submitButton.disabled = false; }
  });
}

function showProjectForm() {
  if (!can('projects:write')) return showToast('You do not have permission to create projects.', true);
  openDialog('Create project', `<label>Project name<input required name="project_name" maxlength="200" placeholder="e.g. Sunrise Meadows" /></label><label>Project code<input required name="project_code" maxlength="50" placeholder="e.g. SM-01" /></label><label>Village / locality<input name="village" maxlength="150" placeholder="Location" /></label><label>Project type<select name="project_type"><option>RESIDENTIAL</option><option>COMMERCIAL</option><option>PLOTTING</option></select></label>`, async (form) => api('/projects', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }));
}

function showPlotForm() {
  if (!can('inventory:write')) return showToast('You do not have permission to add inventory.', true);
  const projectId = location.hash.split('/')[1] || projects[0]?.id;
  if (!projectId) return showToast('Create a project before adding plots.', true);
  openDialog('Add plot', `<label>Plot number<input required name="plot_number" maxlength="50" placeholder="e.g. A-101" /></label><label>Plot type<input name="plot_type" placeholder="Residential" /></label><label>Area (sq yd)<input name="area_sq_yard" type="number" min="0" step="0.01" /></label><label>Current price (₹)<input name="current_price" type="number" min="0" step="1" /></label>`, async (form) => api(`/projects/${projectId}/plots`, { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }));
}

function showLeadForm() {
  if (!can('leads:write')) return showToast('You do not have permission to create leads.', true);
  const options = projects.map((project) => `<option value="${project.id}">${project.project_name}</option>`).join('');
  openDialog('Add lead', `<label>Customer name<input required name="full_name" maxlength="150" /></label><label>Mobile number<input required name="mobile" maxlength="20" /></label><label>Email <input name="email" type="email" maxlength="255" /></label><label>Project<select required name="project_id">${options}</select></label><label class="full-width">Notes<input name="remarks" maxlength="1000" /></label><input type="hidden" name="source" value="CRM" />`, async (form) => api('/leads', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }));
}

function showUserForm() {
  if (currentUser?.role !== 'ADMIN') return showToast('Only administrators can invite team members.', true);
  const options = projects.map((project) => `<option value="${project.id}">${project.project_name}</option>`).join('');
  openDialog('Invite team member', `<label>Full name<input required name="full_name" maxlength="150" /></label><label>Work email<input required name="email" type="email" maxlength="255" /></label><label>Temporary password<input required name="password" type="password" minlength="12" /></label><label>Role<select name="role"><option value="SALES_EXECUTIVE">Sales executive</option><option value="SALES_MANAGER">Sales manager</option><option value="PROJECT_MANAGER">Project manager</option><option value="BROKER">Broker</option><option value="ACCOUNTS">Accounts</option><option value="ADMIN">Administrator</option></select></label><label class="full-width">Assigned projects<select name="project_ids" multiple size="3">${options}</select></label>`, async (form) => { const data = Object.fromEntries(form); data.project_ids = form.getAll('project_ids'); return api('/users', { method: 'POST', body: JSON.stringify(data) }); });
}

window.addEventListener('hashchange', () => { if (currentUser) renderApp(); });
async function start() { if (!isAuthorized()) return renderLogin(); try { currentUser = await api<User>('/auth/me'); if (!location.hash) location.hash = '#dashboard'; await renderApp(); } catch { await logout(); renderLogin('Your session has expired. Please sign in again.'); } }
start();
