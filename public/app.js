import { API_BASE_URL } from './api-config.js';

const apiUrl = (path) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const state = {
  token: localStorage.getItem('crm-token'),
  user: null,
  projects: [],
  projectId: null,
  plots: [],
  layouts: [],
  selectedPlot: null,
  layout: null,
  drawing: false,
  points: [],
  source: null,
  imageObjectUrl: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const statusClass = (status) => `status-${String(status ?? '').toLowerCase().replaceAll('_', '-')}`;
const statusLabel = (status) => String(status ?? '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const formatNumber = (value) => Number(value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const formatDate = (value) => value ? new Date(value).toLocaleDateString() : '—';
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

async function request(path, options = {}) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...options.headers };
  let response;
  try {
    response = await fetch(apiUrl(`/api/v1${path}`), { ...options, headers });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the CRM server. Make sure it is running, then refresh this page.');
    }
    throw error;
  }
  if (response.status === 401 && !path.includes('/auth/login')) {
    clearSession();
    $('#login-error').textContent = 'Your session expired. Sign in again.';
    throw new Error('Your session expired. Sign in again.');
  }
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'The request could not be completed.');
  return body.data;
}

function notify(message, error = false) {
  const notice = $('#notice');
  notice.textContent = message;
  notice.classList.toggle('error', error);
  notice.classList.remove('hidden');
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => notice.classList.add('hidden'), 3600);
}

function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}

function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
  $('#user-name').textContent = state.user.full_name;
  $('#user-role').textContent = statusLabel(state.user.role);
  $('#avatar').textContent = state.user.full_name?.trim().charAt(0).toUpperCase() ?? 'U';
  $('[data-view="users"]').classList.toggle('hidden', !can('*'));
}

function clearSession() {
  localStorage.removeItem('crm-token');
  state.token = null;
  state.user = null;
  state.source?.close();
  showLogin();
}

async function logout() {
  let message = '';
  if (state.token) {
    try {
      const response = await fetch(apiUrl('/api/v1/auth/logout'), { method: 'POST', headers: { Authorization: `Bearer ${state.token}` } });
      if (!response.ok && response.status !== 401) throw new Error(`Session revocation failed (${response.status}).`);
      if (response.status === 401) message = 'Signed out locally; the server session had already expired.';
    } catch (error) {
      message = `Signed out locally, but the server session could not be revoked: ${error.message}`;
    }
  }
  clearSession();
  if (message) $('#login-error').textContent = message;
}

function can(permission) {
  return state.user?.permissions?.includes('*') || state.user?.permissions?.includes(permission);
}

function pageHeading(title, subtitle, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">ESTATEDESK CRM</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

function cardStat(label, value, note, icon) {
  return `<article class="card stat-card"><span class="stat-icon">${icon}</span><div class="stat-label">${label}</div><div class="stat-value">${formatNumber(value)}</div><div class="stat-note">${note}</div></article>`;
}

function setView(view) {
  $$('.page-view').forEach((section) => section.classList.toggle('hidden', section.id !== `view-${view}`));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === view));
  const labels = { overview: 'Overview', inventory: 'Projects & inventory', leads: 'Leads & customers', bookings: 'Booking approvals', users: 'Team access' };
  $('.breadcrumbs').innerHTML = `Workspace <span>/</span> ${labels[view]}`;
  if (view === 'overview') loadDashboard();
  if (view === 'inventory') loadProjects();
  if (view === 'leads') loadLeads();
  if (view === 'bookings') loadBookings();
  if (view === 'users') loadUsers();
}

async function loadDashboard() {
  const root = $('#view-overview');
  const firstName = escapeHTML(state.user.full_name.split(' ')[0]);
  root.innerHTML = `${pageHeading(`Good day, ${firstName}`, 'Here’s what’s happening across your real estate portfolio.')}<div class="stat-grid" id="dashboard-stats"></div><div class="dashboard-grid"><div class="card section-card"><div class="section-title"><h2>Project portfolio</h2><button class="button button-secondary button-small" data-open-inventory>View inventory →</button></div><div id="dashboard-projects"></div></div><div class="card section-card"><div class="section-title"><h2>Recent activity</h2><span>Latest updates</span></div><div id="dashboard-activity"></div></div></div>`;
  try {
    const [summary, projects] = await Promise.all([request('/dashboard'), request('/projects')]);
    state.projects = projects;
    root.querySelector('#dashboard-stats').innerHTML = [
      cardStat('Total projects', summary.projects, 'Across your portfolio', '⌂'),
      cardStat('Total plots', summary.total, 'Centralized inventory', '⌗'),
      cardStat('Available plots', summary.available, 'Ready for sale', '✓'),
      cardStat('Pending approvals', summary.pending_bookings, 'Awaiting manager review', '◷'),
    ].join('');
    root.querySelector('#dashboard-projects').innerHTML = projects.length
      ? projects.map((project) => `<div class="project-row"><span class="project-icon">⌂</span><div class="project-row-main"><strong>${escapeHTML(project.project_name)}${project.project_code.startsWith('DEMO-') ? ' <span class="demo-tag">SAMPLE</span>' : ''}</strong><small>${escapeHTML([project.village, project.taluka, project.district, project.state].filter(Boolean).join(', ') || project.project_code)} · ${escapeHTML(statusLabel(project.project_type))}</small></div><span class="project-count">${project.available_plots}/${project.total_plots} available</span></div>`).join('')
      : '<div class="empty-state">No projects yet. Create your first project from the inventory screen.</div>';
    root.querySelector('#dashboard-activity').innerHTML = summary.recent_activity.length
      ? summary.recent_activity.map((activity) => `<div class="activity-row"><i class="activity-dot"></i><div><p><strong>${escapeHTML(activity.full_name ?? 'System')}</strong> · ${escapeHTML(activity.action.replaceAll('_', ' ').toLowerCase())}</p><small>${escapeHTML(activity.module)} · ${formatDate(activity.created_at)}</small></div></div>`).join('')
      : '<div class="empty-state">Your recent project and inventory updates will appear here.</div>';
    const pending = summary.pending_bookings;
    $('#pending-badge').textContent = pending;
    $('#pending-badge').classList.toggle('hidden', !pending);
    bind('[data-open-inventory]', () => setView('inventory'), root);
  } catch (error) {
    root.insertAdjacentHTML('beforeend', `<p class="form-error">${escapeHTML(error.message)}</p>`);
  }
}

async function loadProjects() {
  const root = $('#view-inventory');
  root.innerHTML = `${pageHeading('Projects & inventory', 'Manage project layouts, plot information and live availability.', can('*') ? '<button id="new-project-button" class="button button-primary">＋ New project</button>' : '')}<div class="toolbar"><select id="project-select" class="select project-select" aria-label="Select a project"></select><div class="action-row">${can('projects:write') ? '<button id="edit-project-button" class="button button-secondary">Edit project details</button>' : ''}${can('inventory:write') ? '<button id="new-plot-button" class="button button-secondary">＋ Add plot</button>' : ''}</div></div><div id="project-form-container"></div><div id="inventory-container"></div>`;
  try {
    state.projects = await request('/projects');
    const select = $('#project-select');
    if (!state.projects.length) {
      $('#inventory-container').innerHTML = '<div class="card empty-state">No projects are assigned to your account.</div>';
      return;
    }
    if (!state.projectId || !state.projects.some((project) => project.id === state.projectId)) state.projectId = state.projects[0].id;
    select.innerHTML = state.projects.map((project) => `<option value="${project.id}" ${project.id === state.projectId ? 'selected' : ''}>${escapeHTML(project.project_name)}</option>`).join('');
    select.addEventListener('change', () => { state.projectId = select.value; loadInventory(); });
    $('#new-project-button')?.addEventListener('click', showProjectForm);
    $('#edit-project-button')?.addEventListener('click', () => showProjectForm(state.projectId));
    $('#new-plot-button')?.addEventListener('click', showPlotForm);
    await loadInventory();
  } catch (error) {
    $('#inventory-container').innerHTML = `<div class="card empty-state">${escapeHTML(error.message)}</div>`;
  }
}

function bind(selector, handler, root = document) {
  root.querySelectorAll(selector).forEach((element) => element.addEventListener('click', handler));
}

function showProjectForm(projectId = null) {
  const project = state.projects.find((item) => item.id === projectId);
  const value = (key) => escapeHTML(project?.[key] ?? '');
  const editing = Boolean(project);
  const demo = project?.project_code.startsWith('DEMO-') ?? false;
  const statusOptions = demo
    ? '<option value="INACTIVE" selected>Inactive (hidden from public API)</option>'
    : `<option value="ACTIVE" ${!project || project.status === 'ACTIVE' ? 'selected' : ''}>Active</option><option value="INACTIVE" ${project?.status === 'INACTIVE' ? 'selected' : ''}>Inactive (hidden from public API)</option><option value="ARCHIVED" ${project?.status === 'ARCHIVED' ? 'selected' : ''}>Archived</option>`;
  $('#project-form-container').innerHTML = `<form id="project-form" class="card section-card project-edit-form" style="margin-bottom:14px"><div class="section-title"><div><h2>${editing ? 'Edit project details' : 'Create a project'}</h2><span>Project location, land area, survey, and publication status</span></div><button type="button" class="button button-secondary button-small" id="close-project-form">Close</button></div><div class="form-grid"><div class="form-field"><label>Project code<input class="input" name="project_code" required maxlength="50" value="${value('project_code')}" placeholder="RATANPUR-01" ${demo ? 'disabled' : ''}></label></div><div class="form-field"><label>Project name<input class="input" name="project_name" required maxlength="200" value="${value('project_name')}" placeholder="Residential project name"></label></div><div class="form-field"><label>Project type<select class="select" name="project_type"><option value="RESIDENTIAL" ${project?.project_type === 'RESIDENTIAL' ? 'selected' : ''}>Residential</option><option value="COMMERCIAL" ${project?.project_type === 'COMMERCIAL' ? 'selected' : ''}>Commercial</option><option value="MIXED_USE" ${project?.project_type === 'MIXED_USE' ? 'selected' : ''}>Mixed use</option></select></label></div><div class="form-field"><label>Status<select class="select" name="status">${statusOptions}</select></label></div><div class="form-field"><label>Total land area<input class="input" name="total_land_area" type="number" min="0" step="0.01" value="${value('total_land_area')}" placeholder="e.g. 2.50"></label></div><div class="form-field"><label>Area unit<select class="select" name="area_unit">${['ACRE', 'HECTARE', 'SQ_YARD', 'SQ_FT'].map((unit) => `<option value="${unit}" ${(project?.area_unit ?? 'ACRE') === unit ? 'selected' : ''}>${statusLabel(unit)}</option>`).join('')}</select></label></div><div class="form-field"><label>Survey number<input class="input" name="survey_number" value="${value('survey_number')}" placeholder="Survey number"></label></div><div class="form-field"><label>Village<input class="input" name="village" value="${value('village')}"></label></div><div class="form-field"><label>Taluka / Tehsil<input class="input" name="taluka" value="${value('taluka')}"></label></div><div class="form-field"><label>District<input class="input" name="district" value="${value('district')}"></label></div><div class="form-field"><label>State<input class="input" name="state" value="${value('state')}"></label></div><div class="form-field"><label>PIN code<input class="input" name="pincode" maxlength="10" value="${value('pincode')}"></label></div><div class="form-field"><label>Latitude<input class="input" name="latitude" type="number" min="-90" max="90" step="0.0000001" value="${value('latitude')}" placeholder="Optional"></label></div><div class="form-field"><label>Longitude<input class="input" name="longitude" type="number" min="-180" max="180" step="0.0000001" value="${value('longitude')}" placeholder="Optional"></label></div><div class="form-field full"><label>Project description<textarea class="textarea" name="description" rows="3" maxlength="5000" placeholder="Project overview and notes">${value('description')}</textarea></label></div><div class="form-field full"><button class="button button-primary" type="submit">${editing ? 'Save project details' : 'Create project'}</button></div></div></form>`;
  $('#close-project-form').addEventListener('click', () => { $('#project-form-container').innerHTML = ''; });
  $('#project-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const data = Object.fromEntries(formData);
    for (const key of ['total_land_area', 'latitude', 'longitude']) if (data[key] === '') delete data[key];
    try {
      if (data.latitude !== undefined && data.longitude === undefined) throw new Error('Enter both coordinates, or leave both empty.');
      if (data.longitude !== undefined && data.latitude === undefined) throw new Error('Enter both coordinates, or leave both empty.');
      const project = await request(editing ? `/projects/${projectId}` : '/projects', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(data) });
      state.projectId = project.id;
      notify(editing ? 'Project details updated.' : 'Project created.');
      await loadProjects();
    } catch (error) { notify(error.message, true); }
  });
}

function showPlotForm() {
  if (!state.projectId) return;
  $('#project-form-container').innerHTML = `<form id="plot-form" class="card section-card" style="margin-bottom:14px"><div class="section-title"><h2>Add a plot</h2><button type="button" class="button button-secondary button-small" id="close-plot-form">Close</button></div><div class="form-grid"><div class="form-field"><label>Plot number<input class="input" name="plot_number" required placeholder="01"></label></div><div class="form-field"><label>Plot category<select class="select" name="plot_type"><option value="RESIDENTIAL">Residential</option><option value="COMMERCIAL">Commercial</option></select></label></div><div class="form-field"><label>Area (sq. yards)<input class="input" name="area_sq_yard" type="number" min="0" step="0.01" value="0"></label></div><div class="form-field"><label>Area (sq. feet)<input class="input" name="area_sq_feet" type="number" min="0" step="0.01" value="0"></label></div><div class="form-field"><label>Length<input class="input" name="length" type="number" min="0" step="0.01"></label></div><div class="form-field"><label>Width<input class="input" name="width" type="number" min="0" step="0.01"></label></div><div class="form-field"><label>Direction<input class="input" name="direction" placeholder="North"></label></div><div class="form-field"><label>Price (₹)<input class="input" name="current_price" type="number" min="0" step="0.01" value="0"></label></div><div class="form-field full"><button class="button button-primary" type="submit">Add plot</button></div></div></form>`;
  $('#close-plot-form').addEventListener('click', () => { $('#project-form-container').innerHTML = ''; });
  $('#plot-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of ['area_sq_yard', 'area_sq_feet', 'length', 'width', 'current_price']) if (!data[key]) delete data[key];
    try {
      await request(`/projects/${state.projectId}/plots`, { method: 'POST', body: JSON.stringify(data) });
      notify('Plot added to inventory.');
      $('#project-form-container').innerHTML = '';
      await loadInventory();
    } catch (error) { notify(error.message, true); }
  });
}

async function loadInventory() {
  const root = $('#inventory-container');
  try {
    const [plots, layouts] = await Promise.all([
      request(`/projects/${state.projectId}/plots`),
      request(`/projects/${state.projectId}/layouts`),
    ]);
    state.plots = plots;
    state.layouts = layouts;
    state.layout = layouts[0] ?? null;
    state.selectedPlot = plots.find((plot) => plot.id === state.selectedPlot?.id) ?? plots[0] ?? null;
    renderInventory();
    connectLiveUpdates();
  } catch (error) { root.innerHTML = `<div class="card empty-state">${escapeHTML(error.message)}</div>`; }
}

function renderInventory() {
  const root = $('#inventory-container');
  const canEdit = can('inventory:write');
  const project = state.projects.find((item) => item.id === state.projectId);
  const projectPlace = [project?.village, project?.taluka, project?.district, project?.state].filter(Boolean).join(', ');
  const projectDetails = project ? `<div class="card project-overview-card"><div class="project-overview-heading"><div><p class="eyebrow">${project.project_code.startsWith('DEMO-') ? 'DEMO PROJECT' : 'PROJECT OVERVIEW'}</p><h2>${escapeHTML(project.project_name)}</h2><p>${escapeHTML(projectPlace || 'Project location not entered')}${project.pincode ? ` · ${escapeHTML(project.pincode)}` : ''}</p></div><div class="project-status"><span class="status-pill ${project.status === 'ACTIVE' ? 'status-available' : 'status-blocked'}">${statusLabel(project.status)}</span><span class="status-pill project-type-pill">${statusLabel(project.project_type)}</span></div></div><div class="project-facts"><div><small>Survey number</small><strong>${escapeHTML(project.survey_number || '—')}</strong></div><div><small>Land area</small><strong>${project.total_land_area ? `${formatNumber(project.total_land_area)} ${escapeHTML(statusLabel(project.area_unit))}` : '—'}</strong></div><div><small>Location</small><strong>${escapeHTML(projectPlace || '—')}</strong></div><div><small>Plot inventory</small><strong>${formatNumber(state.plots.length)} plots</strong></div></div>${project.description ? `<p class="project-description">${escapeHTML(project.description)}</p>` : ''}${project.project_code.startsWith('DEMO-') ? '<div class="demo-notice"><strong>Sample data only.</strong> Project details, plot values, customers, and bookings are fictional for testing. This project remains inactive and is hidden from public APIs. Create a separate project for real inventory.</div>' : ''}</div>` : '';
  const layout = state.layout;
  const statusColor = { AVAILABLE: '#75c99a', HOLD: '#e9bd50', PENDING_APPROVAL: '#efa35a', BOOKED: '#db7773', REGISTERED: '#7889d9', BLOCKED: '#8b9490' };
  const layoutControls = canEdit
    ? `${layout?.status === 'PUBLISHED'
      ? '<button id="create-layout-revision" class="button button-secondary button-small">✎ Edit layout</button>'
      : layout?.status === 'DRAFT'
        ? '<button id="draw-boundary" class="button button-secondary button-small">✎ Draw boundary</button><button id="publish-layout" class="button button-secondary button-small">Publish draft</button>'
        : '<button id="create-layout-revision" class="button button-secondary button-small">＋ Create layout</button>'}<label for="layout-image" class="button button-secondary button-small">↑ Upload layout</label><input id="layout-image" class="file-input" type="file" accept="image/png,image/jpeg,image/webp">`
    : '';
  const layoutStatus = layout ? ` · v${layout.version_number} ${statusLabel(layout.status)}` : '';
  root.innerHTML = `${projectDetails}<div class="inventory-layout"><div class="inventory-main"><div class="card map-card"><div class="map-header"><strong>${escapeHTML(layout?.layout_name ?? 'Interactive plot layout')}${escapeHTML(layoutStatus)}</strong><div class="action-row">${layoutControls}</div></div><div id="map-canvas" class="map-canvas"><svg id="plot-map" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-label="${project?.project_code === 'DEMO-GREEN-MEADOWS' ? 'Fictional schematic master plan with plots, roads, clubhouse, park, and utilities' : 'Interactive project plot map'}"></svg><div id="map-empty" class="map-empty ${layout?.image_url || state.plots.length ? 'hidden' : ''}">${state.plots.length ? 'Upload the verified project layout image to trace plot boundaries.' : 'Add plot records, then upload the verified layout to draw plot boundaries.'}</div></div><div class="legend"><span><i style="background:#75c99a"></i>Available</span><span><i style="background:#e9bd50"></i>Hold</span><span><i style="background:#efa35a"></i>Booking pending</span><span><i style="background:#db7773"></i>Booked</span><span><i style="background:#7889d9"></i>Registered</span><span><i style="background:#8b9490"></i>Blocked</span></div></div><div class="card plot-list-card"><div class="list-header"><strong>Plot inventory <span class="muted">(${state.plots.length})</span></strong><input id="plot-search" class="input" style="max-width:180px;min-height:29px" placeholder="Search plots"></div><div class="table-wrap"><table><thead><tr><th>Plot</th><th>Area</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody id="plot-rows"></tbody></table></div></div></div><aside class="card plot-detail" id="plot-detail"></aside></div><div id="layout-editor-note" class="editor-note" style="margin-top:9px"></div>`;
  const svg = $('#plot-map');
  if (project?.project_code === 'DEMO-GREEN-MEADOWS') drawDemoMasterPlan(svg);
  if (layout?.image_url) {
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    image.id = 'layout-background';
    image.setAttribute('x', '0'); image.setAttribute('y', '0'); image.setAttribute('width', '1000'); image.setAttribute('height', '650');
    svg.append(image);
    if (state.imageObjectUrl) URL.revokeObjectURL(state.imageObjectUrl);
    fetch(apiUrl(layout.image_url), { headers: state.token ? { Authorization: `Bearer ${state.token}` } : {} })
      .then((response) => {
        if (!response.ok) throw new Error('The layout image could not be loaded.');
        return response.blob();
      })
      .then((blob) => {
        if (!svg.isConnected || !$('#layout-background', svg)) return;
        state.imageObjectUrl = URL.createObjectURL(blob);
        $('#layout-background', svg).setAttribute('href', state.imageObjectUrl);
      })
      .catch((error) => notify(error.message, true));
  }
  const publishedLayout = state.layouts.find((item) => item.status === 'PUBLISHED');
  state.plots.forEach((plot) => {
    const mapped = layout?.plots?.find((item) => item.plot_id === plot.id)
      ?? publishedLayout?.plots?.find((item) => item.plot_id === plot.id);
    if (!mapped?.geometry?.coordinates?.[0]) return;
    const points = mapped.geometry.coordinates[0];
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.map(([x, y]) => `${x * 1000},${y * 650}`).join(' '));
    polygon.setAttribute('fill', statusColor[plot.status] ?? '#aaa');
    polygon.setAttribute('class', `plot-polygon${plot.id === state.selectedPlot?.id ? ' selected' : ''}`);
    polygon.dataset.plotId = plot.id;
    svg.append(polygon);
    const xs = points.map(([x]) => x); const ys = points.map(([, y]) => y);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', String((Math.min(...xs) + Math.max(...xs)) * 500));
    label.setAttribute('y', String((Math.min(...ys) + Math.max(...ys)) * 325));
    label.setAttribute('class', 'plot-label'); label.textContent = plot.plot_number; svg.append(label);
  });
  svg.addEventListener('click', onMapClick);
  renderPlotRows();
  renderPlotDetail();
  if (canEdit) {
    $('#draw-boundary')?.addEventListener('click', startDrawing);
    $('#create-layout-revision')?.addEventListener('click', createLayoutRevision);
    $('#publish-layout')?.addEventListener('click', publishLayout);
    $('#layout-image').addEventListener('change', uploadLayout);
  }
  $('#plot-search').addEventListener('input', renderPlotRows);
}

function drawDemoMasterPlan(svg) {
  const ns = 'http://www.w3.org/2000/svg';
  const add = (name, attributes, text) => {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text) element.textContent = text;
    svg.append(element);
    return element;
  };
  const addRect = (x, y, width, height, fill, extra = {}) => add('rect', {
    x, y, width, height, fill, ...extra,
  });
  const addText = (x, y, text, extra = {}) => add('text', {
    x, y, fill: '#45624f', 'font-size': 14, 'font-family': 'Segoe UI, sans-serif',
    'font-weight': 700, 'text-anchor': 'middle', ...extra,
  }, text);

  addRect(0, 0, 1000, 650, '#edf2e8');
  addRect(43, 35, 914, 580, '#dedfd2', { rx: 12 });
  addRect(63, 54, 874, 542, '#f4f0e2', { rx: 8, stroke: '#c4c6b7', 'stroke-width': 2 });

  const road = '#c9c9c1';
  const roadEdge = '#b7b9b1';
  for (const x of [260, 490]) {
    addRect(x, 54, 34, 542, road, { stroke: roadEdge, 'stroke-width': 1 });
    addRect(x + 16, 54, 2, 542, '#f3f1e8');
  }
  for (const y of [162, 305, 448]) {
    addRect(63, y, 674, 32, road, { stroke: roadEdge, 'stroke-width': 1 });
    addRect(63, y + 15, 674, 2, '#f3f1e8');
  }
  addRect(737, 54, 42, 542, '#bfc3bb', { stroke: roadEdge, 'stroke-width': 1 });
  addRect(757, 54, 2, 542, '#f3f1e8');
  addRect(737, 575, 42, 40, '#bfc3bb', { stroke: roadEdge, 'stroke-width': 1 });
  addText(758, 605, 'ENTRANCE', { 'font-size': 10, fill: '#68756a' });

  addRect(800, 70, 120, 115, '#e8dfc9', { rx: 8, stroke: '#cbbb96', 'stroke-width': 2 });
  addText(860, 119, 'CLUBHOUSE', { 'font-size': 13 });
  addText(860, 140, 'Community hall', { 'font-size': 10, 'font-weight': 500, fill: '#748073' });
  addRect(800, 220, 120, 175, '#d6e8cb', { rx: 8, stroke: '#aac499', 'stroke-width': 2 });
  addRect(819, 241, 82, 133, 'none', { rx: 38, stroke: '#91b982', 'stroke-width': 4, 'stroke-dasharray': '7 6' });
  addRect(847, 292, 26, 26, '#a7ca91', { rx: 13 });
  addText(860, 211, 'CENTRAL PARK', { 'font-size': 12 });
  addText(860, 362, 'Lawn · walking loop', { 'font-size': 9, 'font-weight': 500, fill: '#607b5e' });
  addRect(800, 430, 120, 112, '#e4e6df', { rx: 8, stroke: '#c3c8bf', 'stroke-width': 2 });
  addText(860, 477, 'UTILITY', { 'font-size': 13 });
  addText(860, 497, 'Services area', { 'font-size': 10, 'font-weight': 500, fill: '#748073' });
  addText(860, 570, 'SCHEMATIC', { 'font-size': 11, fill: '#7c887b', 'letter-spacing': 2 });
  addText(31, 326, 'N', { 'font-size': 16, fill: '#435c4b' });
  addText(31, 343, '↑', { 'font-size': 16, fill: '#435c4b' });
}

function renderPlotRows() {
  const search = $('#plot-search')?.value.trim().toLowerCase() ?? '';
  const rows = state.plots.filter((plot) => plot.plot_number.toLowerCase().includes(search));
  $('#plot-rows').innerHTML = rows.length ? rows.map((plot) => `<tr data-plot-id="${plot.id}"><td><strong>${escapeHTML(plot.plot_number)}</strong></td><td>${formatNumber(plot.area_sq_yard)} sq yd</td><td>₹${formatNumber(plot.current_price)}</td><td><span class="status-pill ${statusClass(plot.status)}">${statusLabel(plot.status)}</span></td><td><button class="button button-secondary button-small" data-select-plot="${plot.id}">View</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No plots match your search.</td></tr>';
  $$('[data-select-plot]', $('#plot-rows')).forEach((button) => button.addEventListener('click', () => selectPlot(button.dataset.selectPlot)));
}

function selectPlot(plotId) {
  state.selectedPlot = state.plots.find((plot) => plot.id === plotId) ?? null;
  $$('.plot-polygon').forEach((polygon) => polygon.classList.toggle('selected', polygon.dataset.plotId === plotId));
  renderPlotRows();
  renderPlotDetail();
}

function renderPlotDetail() {
  const root = $('#plot-detail');
  const plot = state.selectedPlot;
  if (!plot) {
    root.innerHTML = '<div class="empty-state">Select a plot on the map or in the inventory list to see details.</div>';
    return;
  }
  const mapped = state.layout?.plots?.some((item) => item.plot_id === plot.id);
  const editable = can('inventory:write');
  let actions = '';
  if (plot.status === 'AVAILABLE' && editable) actions += '<button id="hold-plot" class="button button-secondary">Place 30-minute hold</button>';
  if (plot.status === 'HOLD' && editable) actions += `<button id="release-hold" class="button button-secondary">${plot.held_by === state.user.id ? 'Release my hold' : 'Release hold'}</button>`;
  if (['AVAILABLE', 'HOLD'].includes(plot.status) && can('bookings:write')) actions += '<button id="book-plot" class="button button-primary">Submit booking request</button>';
  if (editable && state.layout?.status === 'DRAFT' && !mapped) actions += '<button id="map-plot" class="button button-secondary">Draw plot boundary</button>';
  root.innerHTML = `<h2>Plot ${escapeHTML(plot.plot_number)}</h2><p>${escapeHTML(state.projects.find((item) => item.id === state.projectId)?.project_name ?? '')}</p><span class="status-pill ${statusClass(plot.status)}">${statusLabel(plot.status)}</span><div class="detail-grid"><div class="detail-item"><small>Plot area</small><strong>${formatNumber(plot.area_sq_yard)} sq yd</strong></div><div class="detail-item"><small>Area in sq ft</small><strong>${formatNumber(plot.area_sq_feet)} sq ft</strong></div><div class="detail-item"><small>Price</small><strong>₹${formatNumber(plot.current_price)}</strong></div><div class="detail-item"><small>Category</small><strong>${escapeHTML(statusLabel(plot.plot_type))}</strong></div><div class="detail-item"><small>Direction</small><strong>${escapeHTML(plot.direction || '—')}</strong></div><div class="detail-item"><small>Road width</small><strong>${formatNumber(plot.road_width)} ft</strong></div><div class="detail-item"><small>Dimensions</small><strong>${formatNumber(plot.length)} × ${formatNumber(plot.width)}</strong></div><div class="detail-item"><small>Hold expires</small><strong>${plot.hold_expires_at ? new Date(plot.hold_expires_at).toLocaleTimeString() : '—'}</strong></div></div><div class="detail-actions">${actions || '<span class="editor-note">No actions are available for this plot in its current state.</span>'}</div>`;
  $('#hold-plot')?.addEventListener('click', () => plotAction(`/plots/${plot.id}/hold`, 'Plot held for 30 minutes.'));
  $('#release-hold')?.addEventListener('click', () => plotAction(`/plots/${plot.id}/release-hold`, 'Plot hold released.'));
  $('#book-plot')?.addEventListener('click', () => submitBooking(plot));
  $('#map-plot')?.addEventListener('click', startDrawing);
}

async function plotAction(path, message) {
  try { await request(path, { method: 'POST', body: '{}' }); notify(message); await loadInventory(); }
  catch (error) { notify(error.message, true); }
}

async function submitBooking(plot) {
  const root = $('#plot-detail');
  const project = state.projects.find((item) => item.id === state.projectId);
  root.innerHTML = `<form id="crm-booking-form" class="crm-booking-form"><div class="section-title"><div><h2>Booking request · Plot ${escapeHTML(plot.plot_number)}</h2><span>${escapeHTML(project?.project_name ?? '')} · ${formatNumber(plot.area_sq_yard)} sq yd · ₹${formatNumber(plot.current_price)}</span></div><button id="cancel-booking-form" class="button button-secondary button-small" type="button">Cancel</button></div><p class="booking-form-note">The plot price is shown for reference. A booking amount entered here is a proposed amount for manager review, not a payment receipt.</p><div class="form-field"><label>Customer full name<input class="input" name="full_name" autocomplete="name" maxlength="150" required></label></div><div class="form-field"><label>Mobile number<input class="input" name="mobile" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" pattern="[+()0-9 -]{7,20}" required></label></div><div class="form-field"><label>Email address <span class="muted">(optional)</span><input class="input" name="email" type="email" autocomplete="email" maxlength="255"></label></div><div class="form-field"><label>Proposed booking amount (₹)<input class="input" name="booking_amount" type="number" min="0" step="0.01" value="0" required></label></div><div class="form-field"><label>Remarks <span class="muted">(optional)</span><textarea class="textarea" name="remarks" rows="3" maxlength="1000" placeholder="Payment plan or customer notes"></textarea></label></div><p id="crm-booking-error" class="form-error" role="alert"></p><button class="button button-primary" type="submit">Submit for manager approval</button></form>`;
  $('#cancel-booking-form').addEventListener('click', renderPlotDetail);
  $('#crm-booking-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = Object.fromEntries(new FormData(form));
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    try {
      await request('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          plot_id: plot.id,
          customer: {
            full_name: values.full_name,
            mobile: values.mobile,
            email: values.email || undefined,
            booking_amount: values.booking_amount,
          },
          remarks: values.remarks || '',
        }),
      });
      notify('Booking request submitted for manager approval.');
      await Promise.all([loadInventory(), loadDashboard()]);
    } catch (error) {
      $('#crm-booking-error').textContent = error.message;
      submit.disabled = false;
    }
  });
}

function startDrawing() {
  if (state.drawing) {
    saveBoundary();
    return;
  }
  if (!state.layout || state.layout.status !== 'DRAFT') {
    notify('Create a draft layout revision before drawing boundaries.', true);
    return;
  }
  if (!state.selectedPlot) {
    notify('Select a plot before drawing its boundary.', true);
    return;
  }
  state.drawing = true;
  state.points = [];
  $('#map-canvas').classList.add('drawing-active');
  $('#draw-boundary').textContent = 'Save boundary';
  $('#layout-editor-note').textContent = `Drawing plot ${state.selectedPlot.plot_number}: click at least 3 boundary points, then choose Save boundary.`;
}

function onMapClick(event) {
  if (!state.drawing) {
    const polygon = event.target.closest('[data-plot-id]');
    if (polygon) selectPlot(polygon.dataset.plotId);
    return;
  }
  const rect = event.currentTarget.getBoundingClientRect();
  const point = [Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)), Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))];
  state.points.push(point);
  renderDrawing();
}

function renderDrawing() {
  const svg = $('#plot-map');
  svg.querySelector('#draft-boundary')?.remove();
  if (!state.points.length) return;
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.id = 'draft-boundary';
  poly.setAttribute('class', 'draw-line');
  poly.setAttribute('points', state.points.map(([x, y]) => `${x * 1000},${y * 650}`).join(' '));
  svg.append(poly);
  if (state.points.length >= 3) $('#layout-editor-note').textContent = `${state.points.length} points added. Choose Save boundary to finish.`;
}

async function saveBoundary() {
  if (state.points.length < 3 || !state.layout || !state.selectedPlot) return;
  const coords = [...state.points, state.points[0]];
  try {
    await request(`/layouts/${state.layout.id}/plots/${state.selectedPlot.id}`, { method: 'PUT', body: JSON.stringify({ geometry: { type: 'Polygon', coordinates: [coords] } }) });
    state.drawing = false;
    state.points = [];
    $('#map-canvas').classList.remove('drawing-active');
    notify(`Boundary saved for plot ${state.selectedPlot.plot_number}.`);
    await loadInventory();
  } catch (error) { notify(error.message, true); }
}

async function uploadLayout(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const data = new FormData();
  data.append('image', file);
  data.append('layout_name', file.name.replace(/\.[^.]+$/, ''));
  try {
    state.layout = await request(`/projects/${state.projectId}/layouts/upload`, { method: 'POST', body: data });
    notify('Layout image uploaded. Start tracing plot boundaries.');
    await loadInventory();
  } catch (error) { notify(error.message, true); }
}

async function publishLayout() {
  if (state.layout?.status !== 'DRAFT') {
    notify('Create a draft layout before publishing.', true);
    return;
  }
  try {
    await request(`/layouts/${state.layout.id}/publish`, { method: 'POST', body: '{}' });
    notify('Layout published.');
    await loadInventory();
  } catch (error) { notify(error.message, true); }
}

async function createLayoutRevision() {
  try {
    const name = state.layout?.layout_name ?? 'Project layout';
    await request(`/projects/${state.projectId}/layouts/revisions`, { method: 'POST', body: JSON.stringify({ layout_name: name }) });
    notify('Draft layout created. Published boundaries were copied for editing.');
    await loadInventory();
  } catch (error) { notify(error.message, true); }
}

function connectLiveUpdates() {
  state.source?.close();
  if (!state.projectId || state.projects.find((project) => project.id === state.projectId)?.status !== 'ACTIVE') return;
  state.source = new EventSource(apiUrl(`/api/v1/public/projects/${state.projectId}/inventory/stream`));
  for (const event of ['plot.created', 'plot.updated', 'plot.hold.created', 'plot.hold.expired', 'plot.status.updated', 'booking.submitted', 'booking.approved', 'booking.rejected']) {
    state.source.addEventListener(event, () => loadInventory());
  }
}

async function loadBookings() {
  const root = $('#view-bookings');
  root.innerHTML = `${pageHeading('Booking approvals', 'Review booking requests and keep every inventory decision auditable.')}<div class="card section-card"><div class="section-title"><h2>Booking queue</h2><div class="filter-row"><select id="booking-filter" class="select"><option value="PENDING_APPROVAL">Pending approval</option><option value="">All bookings</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></div></div><div id="booking-list"></div></div>`;
  await renderBookings();
  $('#booking-filter').addEventListener('change', renderBookings);
}

async function renderBookings() {
  const list = $('#booking-list');
  try {
    const status = $('#booking-filter').value;
    const bookings = await request(`/bookings${status ? `?status=${status}` : ''}`);
    $('#pending-badge').textContent = bookings.filter((item) => item.booking_status === 'PENDING_APPROVAL').length;
    $('#pending-badge').classList.toggle('hidden', !bookings.some((item) => item.booking_status === 'PENDING_APPROVAL'));
    list.innerHTML = bookings.length ? bookings.map((booking) => `<div class="booking-row"><div class="booking-info"><strong>${escapeHTML(booking.booking_code)} · ${escapeHTML(booking.project_name)} · Plot ${escapeHTML(booking.plot_number)}</strong><small>${escapeHTML(booking.customer_name)} · ${escapeHTML(booking.customer_mobile)} · Proposed booking amount ₹${formatNumber(booking.booking_amount)} · Total price ₹${formatNumber(booking.total_price)} · ${escapeHTML(statusLabel(booking.source))} · ${formatDate(booking.submitted_at)}</small></div><div class="action-row"><span class="status-pill ${statusClass(booking.booking_status)}">${statusLabel(booking.booking_status)}</span>${booking.booking_status === 'PENDING_APPROVAL' && can('bookings:approve') ? `<button class="button button-primary button-small" data-approve="${booking.id}">Approve</button><button class="button button-danger button-small" data-reject="${booking.id}">Reject</button>` : ''}</div></div>`).join('') : '<div class="empty-state">There are no bookings in this queue.</div>';
    $$('[data-approve]', list).forEach((button) => button.addEventListener('click', () => decideBooking(button.dataset.approve, 'approve')));
    $$('[data-reject]', list).forEach((button) => button.addEventListener('click', () => decideBooking(button.dataset.reject, 'reject')));
  } catch (error) { list.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`; }
}

async function decideBooking(id, decision) {
  const reason = decision === 'reject' ? window.prompt('Reason for rejection') : '';
  if (decision === 'reject' && reason === null) return;
  try {
    await request(`/bookings/${id}/${decision}`, { method: 'POST', body: JSON.stringify({ reason: reason ?? '' }) });
    notify(`Booking ${decision === 'approve' ? 'approved' : 'rejected'}.`);
    await Promise.all([renderBookings(), loadDashboard()]);
  } catch (error) { notify(error.message, true); }
}

async function loadLeads() {
  const root = $('#view-leads');
  if (!state.projects.length) {
    try { state.projects = await request('/projects'); } catch { state.projects = []; }
  }
  root.innerHTML = `${pageHeading('Leads & customers', 'Keep enquiries organized and follow every opportunity through to a booking.', can('leads:write') ? '<button id="new-lead-button" class="button button-primary">＋ Add lead</button>' : '')}<div id="lead-form-container"></div><div class="card plot-list-card"><div class="list-header"><strong>Lead pipeline</strong><span class="muted">Recent enquiries and follow-ups</span></div><div class="table-wrap"><table><thead><tr><th>Customer</th><th>Project</th><th>Source</th><th>Status</th><th>Created</th></tr></thead><tbody id="lead-rows"></tbody></table></div></div>`;
  $('#new-lead-button')?.addEventListener('click', showLeadForm);
  try {
    const leads = await request('/leads');
    $('#lead-rows').innerHTML = leads.length ? leads.map((lead) => `<tr><td><strong>${escapeHTML(lead.customer_name)}</strong><br><span class="muted">${escapeHTML(lead.mobile)}</span></td><td>${escapeHTML(lead.project_name)}</td><td>${escapeHTML(statusLabel(lead.source))}</td><td><span class="status-pill status-available">${statusLabel(lead.lead_status)}</span></td><td>${formatDate(lead.created_at)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No leads yet. Add a lead or connect your website enquiry form.</td></tr>';
  } catch (error) { $('#lead-rows').innerHTML = `<tr><td colspan="5">${escapeHTML(error.message)}</td></tr>`; }
}

async function loadUsers() {
  const root = $('#view-users');
  root.innerHTML = `${pageHeading('Team access', 'Create employee and broker accounts and scope access to assigned projects.')}<div id="user-create-form"></div><div class="card section-card"><div class="section-title"><h2>Team members</h2><span>Project access is enforced by the API</span></div><div id="user-list"></div></div>`;
  try {
    const [users, projects] = await Promise.all([request('/users'), request('/projects')]);
    state.projects = projects;
    const projectOptions = (assigned = []) => projects.map((project) => `<option value="${project.id}" ${assigned.includes(project.id) ? 'selected' : ''}>${escapeHTML(project.project_name)}</option>`).join('');
    $('#user-create-form').innerHTML = `<form id="create-user-form" class="card section-card" style="margin-bottom:14px"><div class="section-title"><h2>Create a team account</h2><span>Passwords must be at least 12 characters</span></div><div class="form-grid"><div class="form-field"><label>Full name<input class="input" name="full_name" required></label></div><div class="form-field"><label>Email<input class="input" name="email" type="email" required></label></div><div class="form-field"><label>Mobile<input class="input" name="mobile"></label></div><div class="form-field"><label>Temporary password<input class="input" name="password" type="password" minlength="12" required></label></div><div class="form-field"><label>Role<select class="select" name="role"><option value="PROJECT_MANAGER">Project manager</option><option value="SALES_MANAGER">Sales manager</option><option value="SALES_EXECUTIVE">Sales executive</option><option value="BROKER">Broker</option><option value="ACCOUNTS">Accounts</option><option value="ADMIN">Administrator</option></select></label></div><div class="form-field"><label>Assigned projects<select class="select" name="project_ids" multiple size="3">${projectOptions()}</select></label></div><div class="form-field full"><button class="button button-primary">Create account</button></div></div></form>`;
    $('#create-user-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const data = Object.fromEntries(form);
      data.project_ids = form.getAll('project_ids');
      try {
        await request('/users', { method: 'POST', body: JSON.stringify(data) });
        notify('Team account created.');
        await loadUsers();
      } catch (error) { notify(error.message, true); }
    });
    $('#user-list').innerHTML = users.length ? users.map((user) => `<form class="team-member-form" data-user-id="${user.id}"><div class="team-member"><div class="team-member-info"><strong>${escapeHTML(user.full_name)}</strong><small>${escapeHTML(user.email)}${user.mobile ? ` · ${escapeHTML(user.mobile)}` : ''}</small></div><label class="team-role"><span>Role</span><select name="role" class="select">${['PROJECT_MANAGER','SALES_MANAGER','SALES_EXECUTIVE','BROKER','ACCOUNTS','ADMIN'].map((role) => `<option value="${role}" ${role === user.role ? 'selected' : ''}>${statusLabel(role)}</option>`).join('')}</select></label><label class="team-projects"><span>Assigned projects</span><select name="project_ids" class="select" multiple size="2">${projectOptions(user.project_ids)}</select></label><label class="team-active"><input type="checkbox" name="is_active" ${user.is_active ? 'checked' : ''}> Active</label><button class="button button-secondary button-small">Save</button></div></form>`).join('') : '<div class="empty-state">No team accounts created yet.</div>';
    $$('.team-member-form', $('#user-list')).forEach((form) => form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      data.project_ids = new FormData(form).getAll('project_ids');
      data.is_active = $('input[name="is_active"]', form).checked;
      try {
        await request(`/users/${form.dataset.userId}`, { method: 'PATCH', body: JSON.stringify(data) });
        notify('Team access updated.');
        await loadUsers();
      } catch (error) { notify(error.message, true); }
    }));
  } catch (error) { $('#user-list').innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`; }
}

function showLeadForm() {
  const container = $('#lead-form-container');
  container.innerHTML = `<form id="lead-form" class="card section-card" style="margin-bottom:14px"><div class="section-title"><h2>Record an enquiry</h2><button id="close-lead-form" type="button" class="button button-secondary button-small">Close</button></div><div class="form-grid"><div class="form-field"><label>Customer name<input class="input" name="full_name" required></label></div><div class="form-field"><label>Mobile<input class="input" name="mobile" required></label></div><div class="form-field"><label>Email<input class="input" name="email" type="email"></label></div><div class="form-field"><label>Project<select class="select" name="project_id" required>${state.projects.map((p) => `<option value="${p.id}">${escapeHTML(p.project_name)}</option>`).join('')}</select></label></div><div class="form-field full"><label>Notes<input class="input" name="remarks"></label><input name="source" type="hidden" value="CRM"></div><div class="form-field full"><button class="button button-primary">Save lead</button></div></div></form>`;
  $('#close-lead-form').addEventListener('click', () => { container.innerHTML = ''; });
  $('#lead-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await request('/leads', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      notify('Lead saved.');
      await loadLeads();
    } catch (error) { notify(error.message, true); }
  });
}

$('#toggle-password').addEventListener('click', () => {
  const password = $('#login-password');
  const isVisible = password.type === 'text';
  password.type = isVisible ? 'password' : 'text';
  $('#toggle-password').setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
  $('#toggle-password').setAttribute('aria-pressed', String(!isVisible));
  $('.eye-open', $('#toggle-password')).classList.toggle('hidden', !isVisible);
  $('.eye-closed', $('#toggle-password')).classList.toggle('hidden', isVisible);
});

$('#login-form').addEventListener('input', () => {
  $('#login-error').textContent = '';
});

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#login-submit');
  const label = $('.login-submit-label', button);
  if (!form.reportValidity()) return;
  button.disabled = true;
  button.classList.add('is-loading');
  button.setAttribute('aria-busy', 'true');
  label.textContent = 'Signing in';
  try {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))), headers: {} });
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('crm-token', state.token);
    showApp();
    setView('overview');
  } catch (error) {
    $('#login-error').textContent = error.message;
    $('#login-password').focus();
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
    label.textContent = 'Sign in';
  }
});

$('#logout-button').addEventListener('click', logout);
$$('.nav-item').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));

if (state.token) {
  try {
    const user = await request('/auth/me');
    state.user = user;
    showApp();
    setView('overview');
  } catch { clearSession(); }
} else {
  showLogin();
}
