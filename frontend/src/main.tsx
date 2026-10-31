import './styles/app.css';
import './styles/project-forms.css';
import { api, apiAsset, isAuthorized, login, logout } from './lib/api';
import type { Booking, Dashboard, Lead, Plot, Project, ProjectLayout, User } from './lib/types';
import { appShell, type View } from './components/AppShell';
import { loginPage } from './pages/LoginPage';
import { dashboardPage } from './pages/DashboardPage';
import { projectsPage } from './pages/ProjectsPage';
import { leadsPage } from './pages/LeadsPage';
import { bookingsPage } from './pages/BookingsPage';
import { teamPage } from './pages/TeamPage';
import { settingsPage } from './pages/SettingsPage';

const root = document.querySelector<HTMLDivElement>('#root')!;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]!);
let currentUser: User | null = null;
let projects: Project[] = [];
let currentPlots: Plot[] = [];
let currentLayout: ProjectLayout | undefined;
let masterplanDrawing = false;
let masterplanPoints: [number, number][] = [];
let masterplanImageObjectUrl: string | null = null;

const showToast = (message: string, error = false) => { const toast = document.querySelector('#toast'); if (!toast) return; toast.textContent = message; toast.className = `toast show ${error ? 'error' : ''}`; window.setTimeout(() => { toast.className = 'toast'; }, 3500); };
const viewFromHash = (): View => { const view = location.hash.split('/')[0].replace('#', ''); return ['dashboard', 'projects', 'leads', 'bookings', 'team', 'settings'].includes(view) ? view as View : 'dashboard'; };
const can = (permission: string) => currentUser?.permissions.includes('*') || currentUser?.permissions.includes(permission);

async function renderApp() {
  if (!currentUser) return renderLogin();
  const view = viewFromHash();
  let body = '';
  let layoutImagePath: string | undefined;
  try {
    if (view === 'dashboard') body = dashboardPage(await api<Dashboard>('/dashboard'));
    if (view === 'projects') {
      projects = await api<Project[]>('/projects');
      const selectedId = location.hash.split('/')[1] || projects[0]?.id;
      const selected = projects.find((project) => project.id === selectedId);
      const plots: Plot[] = selected ? await api<Plot[]>(`/projects/${selected.id}/plots`) : [];
      const layouts: ProjectLayout[] = selected ? await api<ProjectLayout[]>(`/projects/${selected.id}/layouts`) : [];
      currentPlots = plots;
      currentLayout = layouts.find((layout) => layout.status === 'DRAFT') ?? layouts.find((layout) => layout.status === 'PUBLISHED');
      body = projectsPage(projects, selected, plots, currentLayout, currentUser.role === 'ADMIN' || currentUser.role === 'PROJECT_MANAGER');
      layoutImagePath = currentLayout?.image_url;
    }
    if (view === 'leads') body = leadsPage(await api<Lead[]>('/leads'));
    if (view === 'bookings') body = bookingsPage(await api<Booking[]>('/bookings'), Boolean(can('bookings:approve')));
    if (view === 'team') { if (currentUser.role !== 'ADMIN') { location.hash = '#dashboard'; return; } projects = await api<Project[]>('/projects'); body = teamPage(await api<User[]>('/users'), projects); }
    if (view === 'settings') body = settingsPage();
  } catch (error) { body = `<div class="error-panel"><h2>Unable to load this page</h2><p>${error instanceof Error ? error.message : 'Please refresh and try again.'}</p></div>`; }
  root.innerHTML = appShell(currentUser, view, body);
  if (layoutImagePath) void loadMasterplanImage(layoutImagePath);
  else {
    if (masterplanImageObjectUrl) URL.revokeObjectURL(masterplanImageObjectUrl);
    masterplanImageObjectUrl = null;
  }
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
  document.querySelector('#edit-project')?.addEventListener('click', () => {
    const projectId = projectIdFromHash();
    const project = projects.find((item) => item.id === projectId);
    if (project) showProjectForm(project);
  });
  document.querySelector('#new-plot')?.addEventListener('click', showPlotForm);
  document.querySelector('#new-layout')?.addEventListener('click', () => createLayout(false));
  document.querySelector('#new-layout-revision')?.addEventListener('click', () => createLayout(true));
  document.querySelector('#upload-layout-image')?.addEventListener('click', () => document.querySelector<HTMLInputElement>('#layout-image-file')?.click());
  document.querySelector<HTMLInputElement>('#layout-image-file')?.addEventListener('change', uploadLayoutImage);
  document.querySelector('#draw-boundary')?.addEventListener('click', beginMasterplanDrawing);
  document.querySelector<HTMLSelectElement>('#boundary-plot')?.addEventListener('change', (event) => {
    const drawButton = document.querySelector<HTMLButtonElement>('#draw-boundary');
    if (drawButton) {
      drawButton.disabled = !(event.currentTarget as HTMLSelectElement).value;
      const selectedPlot = currentPlots.find((plot) => plot.id === (event.currentTarget as HTMLSelectElement).value);
      document.querySelector<HTMLElement>('#masterplan-message')!.textContent = selectedPlot
        ? `Selected plot ${selectedPlot.plot_number} · ${selectedPlot.status}`
        : '';
    }
  });
  document.querySelector('#save-boundary')?.addEventListener('click', saveMasterplanBoundary);
  document.querySelector('#cancel-boundary')?.addEventListener('click', cancelMasterplanDrawing);
  document.querySelector('#publish-layout')?.addEventListener('click', publishMasterplan);
  document.querySelector<SVGSVGElement>('#masterplan-map')?.addEventListener('click', handleMasterplanClick);
  document.querySelector('#new-lead')?.addEventListener('click', showLeadForm);
  document.querySelector('#invite-user')?.addEventListener('click', showUserForm);
}

async function loadMasterplanImage(imagePath: string) {
  const mapImage = document.querySelector<SVGImageElement>('#masterplan-image');
  if (!mapImage) return;
  try {
    const blob = await apiAsset(imagePath);
    if (!mapImage.isConnected) return;
    if (masterplanImageObjectUrl) URL.revokeObjectURL(masterplanImageObjectUrl);
    masterplanImageObjectUrl = URL.createObjectURL(blob);
    mapImage.setAttribute('href', masterplanImageObjectUrl);
  } catch (error) {
    const message = document.querySelector<HTMLElement>('#masterplan-message');
    if (message) message.textContent = error instanceof Error ? error.message : 'The layout image could not be loaded.';
  }
}

function projectIdFromHash() {
  return location.hash.split('/')[1] || projects[0]?.id;
}

async function createLayout(revision: boolean) {
  const projectId = projectIdFromHash();
  if (!projectId) return showToast('Create a project before adding its master plan.', true);
  try {
    await api(`/projects/${projectId}/layouts${revision ? '/revisions' : ''}`, {
      method: 'POST',
      body: JSON.stringify({ layout_name: `${projects.find((project) => project.id === projectId)?.project_name ?? 'Project'} master plan` }),
    });
    showToast(revision ? 'Draft revision created.' : 'Master plan created. Upload its image to start mapping plots.');
    await renderApp();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not create the master plan.', true);
  }
}

async function uploadLayoutImage(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  const projectId = projectIdFromHash();
  if (!file || !projectId) return;
  const data = new FormData();
  data.append('image', file);
  data.append('layout_name', file.name.replace(/\.[^.]+$/, ''));
  try {
    await api(`/projects/${projectId}/layouts/upload`, { method: 'POST', body: data });
    showToast('Master plan image uploaded. Select a plot to trace its boundary.');
    await renderApp();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not upload the master plan image.', true);
  } finally {
    input.value = '';
  }
}

function beginMasterplanDrawing() {
  const plotId = document.querySelector<HTMLSelectElement>('#boundary-plot')?.value;
  if (!plotId) return showToast('Select the plot you want to draw on the master plan.', true);
  masterplanDrawing = true;
  masterplanPoints = [];
  document.querySelector<HTMLButtonElement>('#draw-boundary')!.disabled = true;
  document.querySelector<HTMLButtonElement>('#cancel-boundary')!.hidden = false;
  document.querySelector<HTMLElement>('#masterplan-message')!.textContent = 'Click at least three points around this plot, then save its boundary.';
  document.querySelector<SVGSVGElement>('#masterplan-map')?.classList.add('is-drawing');
}

function handleMasterplanClick(event: MouseEvent) {
  const map = event.currentTarget as SVGSVGElement;
  if (masterplanDrawing) {
    const bounds = map.getBoundingClientRect();
    masterplanPoints.push([
      Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    ]);
    renderMasterplanDraft();
    document.querySelector<HTMLButtonElement>('#save-boundary')!.disabled = masterplanPoints.length < 3;
    return;
  }
  const plotGroup = (event.target as Element).closest<SVGGElement>('[data-plot-id]');
  if (!plotGroup) return;
  const picker = document.querySelector<HTMLSelectElement>('#boundary-plot');
  if (picker) picker.value = plotGroup.dataset.plotId ?? '';
}

function renderMasterplanDraft() {
  const map = document.querySelector<SVGSVGElement>('#masterplan-map');
  map?.querySelector('#masterplan-draft')?.remove();
  if (!map || !masterplanPoints.length) return;
  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  polygon.id = 'masterplan-draft';
  polygon.setAttribute('points', masterplanPoints.map(([x, y]) => `${x * 1000},${y * 650}`).join(' '));
  map.append(polygon);
}

function cancelMasterplanDrawing() {
  masterplanDrawing = false;
  masterplanPoints = [];
  document.querySelector('#masterplan-draft')?.remove();
  document.querySelector<SVGSVGElement>('#masterplan-map')?.classList.remove('is-drawing');
  const drawButton = document.querySelector<HTMLButtonElement>('#draw-boundary');
  if (drawButton) drawButton.disabled = !document.querySelector<HTMLSelectElement>('#boundary-plot')?.value;
  const saveButton = document.querySelector<HTMLButtonElement>('#save-boundary');
  if (saveButton) saveButton.disabled = true;
  const cancelButton = document.querySelector<HTMLButtonElement>('#cancel-boundary');
  if (cancelButton) cancelButton.hidden = true;
  const message = document.querySelector<HTMLElement>('#masterplan-message');
  if (message) message.textContent = '';
}

async function saveMasterplanBoundary() {
  const projectId = projectIdFromHash();
  const plotId = document.querySelector<HTMLSelectElement>('#boundary-plot')?.value;
  if (!currentLayout || !projectId || !plotId || masterplanPoints.length < 3) return;
  const coordinates = [...masterplanPoints, masterplanPoints[0]];
  try {
    await api(`/layouts/${currentLayout.id}/plots/${plotId}`, {
      method: 'PUT',
      body: JSON.stringify({ geometry: { type: 'Polygon', coordinates: [coordinates] } }),
    });
    showToast('Plot boundary saved.');
    cancelMasterplanDrawing();
    await renderApp();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not save this boundary.', true);
  }
}

async function publishMasterplan() {
  if (!currentLayout) return;
  try {
    await api(`/layouts/${currentLayout.id}/publish`, { method: 'POST', body: JSON.stringify({}) });
    showToast('Master plan published to the public booking page.');
    await renderApp();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Could not publish the master plan.', true);
  }
}

function openDialog(title: string, fields: string, submit: (form: FormData) => Promise<void>, className = '', submitLabel = 'Save changes', successMessage = 'Saved successfully.') {
  document.querySelector('.dialog-backdrop')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="dialog-backdrop"><form class="dialog ${className}" id="workspace-form"><div class="dialog-heading"><h2>${title}</h2><button type="button" class="close-dialog" aria-label="Close">×</button></div>${fields}<p class="dialog-error"></p><div class="dialog-actions"><button type="button" class="secondary-button close-dialog">Cancel</button><button class="primary-button">${submitLabel}</button></div></form></div>`);
  const close = () => document.querySelector('.dialog-backdrop')?.remove();
  document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', close));
  document.querySelector<HTMLFormElement>('#workspace-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const submitButton = event.currentTarget.querySelector<HTMLButtonElement>('.primary-button')!; submitButton.disabled = true;
    try { await submit(form); close(); showToast(successMessage); renderApp(); }
    catch (error) { const target = event.currentTarget.querySelector('.dialog-error')!; target.textContent = error instanceof Error ? error.message : 'Could not save changes.'; submitButton.disabled = false; }
  });
}

function showProjectForm(project?: Project) {
  if (!can('projects:write')) return showToast('You do not have permission to manage projects.', true);
  const value = (input: unknown) => escapeHtml(input ?? '');
  const selected = (field: keyof Project, option: string, fallback = '') => (project?.[field] ?? fallback) === option ? 'selected' : '';
  openDialog(project ? 'Edit project' : 'Create project', `
    <div class="dialog-section"><h3>Project details</h3><p>Enter verified project information. An active project appears in public booking after its layout is published.</p></div>
    <label>Project name<input required name="project_name" maxlength="200" placeholder="e.g. Sunrise Meadows" value="${value(project?.project_name)}"></label>
    <label>Project code<input required name="project_code" maxlength="50" placeholder="e.g. SM-01" value="${value(project?.project_code)}"></label>
    <label>Project type<select name="project_type"><option value="RESIDENTIAL" ${selected('project_type', 'RESIDENTIAL', 'RESIDENTIAL')}>Residential</option><option value="PLOTTING" ${selected('project_type', 'PLOTTING')}>Plotting</option><option value="COMMERCIAL" ${selected('project_type', 'COMMERCIAL')}>Commercial</option><option value="MIXED_USE" ${selected('project_type', 'MIXED_USE')}>Mixed use</option></select></label>
    <label>Status<select name="status"><option value="ACTIVE" ${selected('status', 'ACTIVE', 'ACTIVE')}>Active</option><option value="INACTIVE" ${selected('status', 'INACTIVE')}>Inactive</option><option value="ARCHIVED" ${selected('status', 'ARCHIVED')}>Archived</option></select></label>
    <label>Total land area<input name="total_land_area" type="number" min="0" step="0.01" placeholder="e.g. 2.50" value="${value(project?.total_land_area)}"></label>
    <label>Land area unit<select name="area_unit"><option value="ACRE" ${selected('area_unit', 'ACRE', 'ACRE')}>Acres</option><option value="HECTARE" ${selected('area_unit', 'HECTARE')}>Hectares</option><option value="SQ_YARD" ${selected('area_unit', 'SQ_YARD')}>Square yards</option><option value="SQ_FT" ${selected('area_unit', 'SQ_FT')}>Square feet</option></select></label>
    <div class="dialog-section"><h3>Location and legal details</h3></div>
    <label>Survey number<input name="survey_number" maxlength="100" value="${value(project?.survey_number)}"></label>
    <label>Village / locality<input name="village" maxlength="150" value="${value(project?.village)}"></label>
    <label>Taluka / Tehsil<input name="taluka" maxlength="150" value="${value(project?.taluka)}"></label>
    <label>District<input name="district" maxlength="150" value="${value(project?.district)}"></label>
    <label>State<input name="state" maxlength="100" value="${value(project?.state)}"></label>
    <label>PIN code<input name="pincode" maxlength="10" inputmode="numeric" value="${value(project?.pincode)}"></label>
    <label>Latitude<input name="latitude" type="number" min="-90" max="90" step="0.0000001" placeholder="Optional" value="${value(project?.latitude)}"></label>
    <label>Longitude<input name="longitude" type="number" min="-180" max="180" step="0.0000001" placeholder="Optional" value="${value(project?.longitude)}"></label>
    <label class="full-width">Project description<textarea name="description" rows="3" maxlength="5000" placeholder="Project overview and verified details">${value(project?.description)}</textarea></label>
    <label class="full-width">Project highlights<textarea name="highlights" rows="4" maxlength="4000" placeholder="One highlight per line; each highlight is limited to 180 characters, up to 20 items">${value(project?.highlights?.join('\n'))}</textarea></label>
    ${project ? '' : `<div class="dialog-section inventory-form-heading"><div><h3>Initial plot inventory</h3><p>Optional. Add plot dimensions, facing, road width and price; add more plots later.</p></div><button type="button" id="add-initial-plot" class="secondary-button">+ Add plot</button></div><div id="initial-plots" class="initial-plots full-width"></div>`}
  `, async (form) => {
    const data: Record<string, unknown> = Object.fromEntries(form);
    if (!project) {
      for (const key of ['project_code', 'project_name', 'project_type', 'status', 'area_unit', 'survey_number', 'village', 'taluka', 'district', 'state', 'pincode', 'description']) {
        if (data[key] === '') delete data[key];
      }
    }
    for (const key of ['total_land_area', 'latitude', 'longitude']) {
      if (data[key] === '') delete data[key];
      else if (data[key] !== undefined) data[key] = Number(data[key]);
    }
    const initialPlots = [...document.querySelectorAll<HTMLElement>('.initial-plot-row')].map((row) => {
      const plot: Record<string, unknown> = {};
      row.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-plot-field]').forEach((input) => {
        const key = input.dataset.plotField!;
        if (input.value === '') return;
        plot[key] = input.type === 'number' ? Number(input.value) : input.value.trim();
      });
      return plot;
    });
    data.highlights = String(form.get('highlights') ?? '').split(/\r?\n/).map((highlight) => highlight.trim()).filter(Boolean);
    if (!project) data.initial_plots = initialPlots;
    await api(project ? `/projects/${project.id}` : '/projects', {
      method: project ? 'PATCH' : 'POST',
      body: JSON.stringify(data),
    });
  }, 'project-dialog', project ? 'Update project' : 'Create project', project ? 'Project updated.' : 'Project created.');

  if (project) return;
  const plotContainer = document.querySelector<HTMLDivElement>('#initial-plots')!;
  const addPlotButton = document.querySelector<HTMLButtonElement>('#add-initial-plot')!;
  addPlotButton.addEventListener('click', () => {
    if (plotContainer.children.length >= 500) return showToast('A project can start with up to 500 plots.', true);
    const row = document.createElement('fieldset');
    row.className = 'initial-plot-row';
    row.innerHTML = `
      <legend>Initial plot ${plotContainer.children.length + 1}</legend>
      <button type="button" class="remove-initial-plot" aria-label="Remove plot">Remove</button>
      <label>Plot number<input data-plot-field="plot_number" required maxlength="50" placeholder="e.g. A-101"></label>
      <label>Plot type<input data-plot-field="plot_type" maxlength="50" value="RESIDENTIAL"></label>
      <label>Area (sq yd)<input data-plot-field="area_sq_yard" type="number" min="0" step="0.01"></label>
      <label>Area (sq ft)<input data-plot-field="area_sq_feet" type="number" min="0" step="0.01"></label>
      <label>Length<input data-plot-field="length" type="number" min="0" step="0.01"></label>
      <label>Width<input data-plot-field="width" type="number" min="0" step="0.01"></label>
      <label>Facing / direction<input data-plot-field="direction" maxlength="20" placeholder="North"></label>
      <label>Road width<input data-plot-field="road_width" type="number" min="0" step="0.01"></label>
      <label>North boundary<input data-plot-field="north_boundary" maxlength="100" placeholder="Plot no. 5 / Road"></label>
      <label>South boundary<input data-plot-field="south_boundary" maxlength="100"></label>
      <label>East boundary<input data-plot-field="east_boundary" maxlength="100"></label>
      <label>West boundary<input data-plot-field="west_boundary" maxlength="100"></label>
      <label>Price (₹)<input data-plot-field="current_price" type="number" min="0" step="1"></label>
    `;
    row.querySelector('.remove-initial-plot')?.addEventListener('click', () => row.remove());
    plotContainer.append(row);
  });
}

function showPlotForm() {
  if (!can('inventory:write')) return showToast('You do not have permission to add inventory.', true);
  const projectId = location.hash.split('/')[1] || projects[0]?.id;
  if (!projectId) return showToast('Create a project before adding plots.', true);
  openDialog('Add plot', `
    <label>Plot number<input required name="plot_number" maxlength="50" placeholder="e.g. A-101"></label>
    <label>Plot type<input name="plot_type" maxlength="50" value="RESIDENTIAL"></label>
    <label>Area (sq yd)<input name="area_sq_yard" type="number" min="0" step="0.01"></label>
    <label>Area (sq ft)<input name="area_sq_feet" type="number" min="0" step="0.01"></label>
    <label>Length<input name="length" type="number" min="0" step="0.01"></label>
    <label>Width<input name="width" type="number" min="0" step="0.01"></label>
    <label>Facing / direction<input name="direction" maxlength="20" placeholder="North"></label>
    <label>Road width<input name="road_width" type="number" min="0" step="0.01"></label>
    <label>North boundary<input name="north_boundary" maxlength="100" placeholder="Plot no. 5 / Road"></label>
    <label>South boundary<input name="south_boundary" maxlength="100"></label>
    <label>East boundary<input name="east_boundary" maxlength="100"></label>
    <label>West boundary<input name="west_boundary" maxlength="100"></label>
    <label class="full-width">Current price (₹)<input name="current_price" type="number" min="0" step="1"></label>
  `, async (form) => {
    const data: Record<string, unknown> = Object.fromEntries(form);
    for (const key of ['area_sq_yard', 'area_sq_feet', 'length', 'width', 'road_width', 'current_price']) {
      if (data[key] === '') delete data[key];
      else if (data[key] !== undefined) data[key] = Number(data[key]);
    }
    for (const key of ['direction', 'north_boundary', 'south_boundary', 'east_boundary', 'west_boundary']) {
      if (data[key] === '') delete data[key];
    }
    await api(`/projects/${projectId}/plots`, { method: 'POST', body: JSON.stringify(data) });
  }, 'plot-dialog', 'Add plot', 'Plot added.');
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
