import { API_BASE_URL } from './api-config.js';

const apiUrl = (path) => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const state = {
  projects: [],
  project: null,
  inventory: null,
  layout: null,
  selectedPlot: null,
  eventSource: null,
  refreshTimer: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const statusNames = {
  AVAILABLE: 'Available',
  HOLD: 'On hold',
  PENDING_APPROVAL: 'Request pending',
  BOOKED: 'Booked',
  REGISTERED: 'Registered',
  BLOCKED: 'Unavailable',
};
const statusClass = {
  AVAILABLE: 'available',
  HOLD: 'hold',
  PENDING_APPROVAL: 'pending',
  BOOKED: 'unavailable',
  REGISTERED: 'unavailable',
  BLOCKED: 'unavailable',
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatArea(value, unit = 'sq yd') {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)} ${unit}` : '—';
}

async function getData(path) {
  let response;
  try {
    response = await fetch(apiUrl(`/api/v1${path}`), { headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Unable to connect to the project inventory. Please try again in a moment.');
    throw error;
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message ?? 'The inventory could not be loaded.');
  return body.data;
}

function showError(message) {
  const error = $('#page-error');
  error.textContent = message;
  error.classList.remove('hidden');
}

function hideError() {
  $('#page-error').textContent = '';
  $('#page-error').classList.add('hidden');
}

function setConnection(connected) {
  $('#connection-label').textContent = connected ? 'Live availability' : 'Reconnecting to inventory';
  $('#connection-label').parentElement.classList.toggle('is-offline', !connected);
}

async function initialize() {
  try {
    state.projects = await getData('/public/projects');
    if (!state.projects.length) {
      $('#empty-projects').classList.remove('hidden');
      setConnection(true);
      return;
    }

    const projectSelect = $('#project-select');
    projectSelect.innerHTML = state.projects.map((project) => `<option value="${escapeHTML(project.id)}">${escapeHTML(project.project_name)}</option>`).join('');
    $('#project-picker').classList.remove('hidden');
    projectSelect.addEventListener('change', () => loadProject(projectSelect.value));

    const requestedProject = new URLSearchParams(location.search).get('project');
    const selected = state.projects.find((project) => project.id === requestedProject) ?? state.projects[0];
    projectSelect.value = selected.id;
    await loadProject(selected.id);
  } catch (error) {
    showError(error.message);
    setConnection(false);
  }
}

async function loadProject(projectId, preserveSelection = false) {
  const previousPlotId = preserveSelection ? state.selectedPlot?.id : null;
  hideError();
  try {
    const [project, inventory, layout] = await Promise.all([
      getData(`/public/projects/${projectId}`),
      getData(`/public/projects/${projectId}/plots`),
      getData(`/public/projects/${projectId}/layout`),
    ]);
    state.project = project;
    state.inventory = inventory;
    state.layout = layout;
    state.selectedPlot = inventory.plots.find((plot) => plot.id === previousPlotId) ?? null;
    renderProject();
    connectLiveUpdates(projectId);
    setConnection(true);
    $('#inventory-content').classList.remove('hidden');
  } catch (error) {
    showError(error.message);
    setConnection(false);
  }
}

function renderProject() {
  const { project, inventory, layout } = state;
  $('#project-name').textContent = project.project_name;
  $('#project-code').textContent = project.project_code;
  $('#project-location').textContent = [project.village, project.taluka, project.district, project.state].filter(Boolean).join(', ') || 'Location details available from our project team';
  $('#project-type').textContent = project.project_type || '—';
  $('#project-land-area').textContent = project.total_land_area
    ? `${formatArea(project.total_land_area, project.area_unit || 'ACRE')}`
    : '—';
  $('#project-survey').textContent = project.survey_number || '—';
  $('#project-pincode').textContent = project.pincode || '—';
  $('#project-overview').classList.toggle('hidden', !project.description && !project.highlights?.length
    && !project.project_type && !project.total_land_area && !project.survey_number && !project.pincode);
  const description = $('#project-description');
  description.textContent = project.description || '';
  description.classList.toggle('hidden', !project.description);
  const highlights = Array.isArray(project.highlights) ? project.highlights : [];
  const highlightsSection = $('#project-highlights');
  $('#project-highlights-list').replaceChildren(...highlights.map((highlight) => {
    const item = document.createElement('li');
    item.textContent = highlight;
    return item;
  }));
  highlightsSection.classList.toggle('hidden', highlights.length === 0);
  $('#available-count').textContent = inventory.available;
  $('#total-count').textContent = inventory.total_plots;
  $('#plan-version').textContent = `Version ${layout.version_number}`;
  renderMap();
  renderPlots();
  renderSelectedPlot();
}

function renderMap() {
  const svg = $('#public-map');
  svg.replaceChildren();
  const plotsWithGeometry = state.inventory.plots.flatMap((plot) => {
    const boundary = state.layout.plots.find((item) => item.plot_id === plot.id)?.geometry?.coordinates?.[0];
    return boundary?.length ? [{ plot, boundary }] : [];
  });
  const mapEmpty = $('#map-empty');
  const hasPlanImage = Boolean(state.layout.image_url);
  mapEmpty.classList.toggle('hidden', plotsWithGeometry.length > 0);
  svg.classList.toggle('hidden', plotsWithGeometry.length === 0 && !hasPlanImage);
  if (!plotsWithGeometry.length && !hasPlanImage) return;

  const ns = 'http://www.w3.org/2000/svg';
  const fragment = document.createDocumentFragment();
  if (hasPlanImage) {
    const image = document.createElementNS(ns, 'image');
    image.setAttribute('href', apiUrl(state.layout.image_url));
    image.setAttribute('width', '1000');
    image.setAttribute('height', '650');
    image.setAttribute('preserveAspectRatio', 'none');
    fragment.append(image);
  } else {
    const background = document.createElementNS(ns, 'rect');
    background.setAttribute('width', '1000');
    background.setAttribute('height', '650');
    background.setAttribute('fill', '#f4f3ea');
    fragment.append(background);
  }

  for (const { plot, boundary } of plotsWithGeometry) {
    if (!boundary.every((point) => Array.isArray(point) && point.length === 2
      && point.every((coordinate) => Number.isFinite(Number(coordinate)) && Number(coordinate) >= 0 && Number(coordinate) <= 1))) continue;
    const polygon = document.createElementNS(ns, 'polygon');
    polygon.setAttribute('points', boundary.map(([x, y]) => `${Number(x) * 1000},${Number(y) * 650}`).join(' '));
    const mapStatus = { AVAILABLE: 'available', HOLD: 'hold', PENDING_APPROVAL: 'pending', BOOKED: 'booked', REGISTERED: 'registered', BLOCKED: 'blocked' }[plot.status] ?? 'blocked';
    polygon.setAttribute('class', `site-plot plot-${mapStatus}${state.selectedPlot?.id === plot.id ? ' is-selected' : ''}`);
    polygon.setAttribute('tabindex', '0');
    polygon.setAttribute('role', 'button');
    polygon.setAttribute('aria-label', `Plot ${plot.plot_number}, ${statusNames[plot.status] ?? 'Unavailable'}${plot.status === 'AVAILABLE' ? ', select to request booking' : ''}`);
    polygon.dataset.plotId = plot.id;
    polygon.addEventListener('pointerenter', (event) => showMapTooltip(plot, event));
    polygon.addEventListener('pointermove', (event) => positionMapTooltip(event));
    polygon.addEventListener('pointerleave', hideMapTooltip);
    polygon.addEventListener('focus', () => showMapTooltip(plot));
    polygon.addEventListener('blur', hideMapTooltip);
    polygon.addEventListener('click', () => {
      selectPlot(plot.id);
      if (plot.status === 'AVAILABLE') openBookingForm();
    });
    polygon.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectPlot(plot.id);
        if (plot.status === 'AVAILABLE') openBookingForm();
      }
    });
    fragment.append(polygon);

    const center = boundary.slice(0, -1);
    if (!center.length) continue;
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(center.reduce((sum, point) => sum + Number(point[0]) * 1000, 0) / center.length));
    label.setAttribute('y', String(center.reduce((sum, point) => sum + Number(point[1]) * 650, 0) / center.length));
    label.setAttribute('class', 'site-plot-label');
    label.textContent = plot.plot_number;
    fragment.append(label);
  }
  svg.append(fragment);
}

function showMapTooltip(plot, event) {
  const tooltip = $('#map-tooltip');
  const details = [
    ['Status', statusNames[plot.status] ?? 'Unavailable'],
    ['Plot', plot.plot_number],
    ['Area', formatArea(plot.area_sq_yard)],
    ['Area (sq. ft.)', formatArea(plot.area_sq_feet, 'sq ft')],
    ['Dimensions', plot.length && plot.width ? `${formatArea(plot.length, 'ft')} × ${formatArea(plot.width, 'ft')}` : '—'],
    ['Road width', formatArea(plot.road_width, 'ft')],
    ['Facing', plot.direction || '—'],
    ['North', plot.north_boundary || '—'],
    ['South', plot.south_boundary || '—'],
    ['East', plot.east_boundary || '—'],
    ['West', plot.west_boundary || '—'],
    ...(plot.client ? [['Client', plot.client]] : []),
    ['Price', formatCurrency(plot.price)],
  ];
  tooltip.innerHTML = `<strong>Plot ${escapeHTML(plot.plot_number)}</strong>${details.map(([label, value]) => `<span><b>${escapeHTML(label)}</b><span>${escapeHTML(value)}</span></span>`).join('')}${plot.status === 'AVAILABLE' ? '<small>Click to request this plot</small>' : ''}`;
  tooltip.hidden = false;
  if (event) positionMapTooltip(event);
  else {
    tooltip.style.left = '50%';
    tooltip.style.top = '50%';
  }
}

function positionMapTooltip(event) {
  const tooltip = $('#map-tooltip');
  const bounds = $('#public-map').getBoundingClientRect();
  tooltip.style.left = `${Math.max(8, Math.min(event.clientX - bounds.left + 12, bounds.width - tooltip.offsetWidth - 8))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(event.clientY - bounds.top + 12, bounds.height - tooltip.offsetHeight - 8))}px`;
}

function hideMapTooltip() {
  $('#map-tooltip').hidden = true;
}

function renderPlots() {
  const search = $('#plot-search').value.trim().toLowerCase();
  const plots = state.inventory.plots.filter((plot) => plot.plot_number.toLowerCase().includes(search));
  const rows = $('#plot-rows');
  if (!plots.length) {
    rows.innerHTML = `<tr><td colspan="6" class="no-results">${search ? 'No plots match that search.' : 'No plot records are available yet.'}</td></tr>`;
    return;
  }
  rows.innerHTML = plots.map((plot) => {
    const selectable = plot.status === 'AVAILABLE';
    const status = statusNames[plot.status] ?? 'Unavailable';
    return `<tr class="${state.selectedPlot?.id === plot.id ? 'selected-row' : ''}">
      <td><strong>Plot ${escapeHTML(plot.plot_number)}</strong></td>
      <td>${escapeHTML(plot.plot_type || 'Residential')}</td>
      <td>${formatArea(plot.area_sq_yard)}</td>
      <td>${formatCurrency(plot.price)}</td>
      <td><span class="status-badge status-${statusClass[plot.status] ?? 'unavailable'}">${status}</span></td>
      <td><button class="row-action" type="button" data-plot-id="${escapeHTML(plot.id)}">${selectable ? 'View & request' : 'View details'} <span aria-hidden="true">→</span></button></td>
    </tr>`;
  }).join('');
  rows.querySelectorAll('[data-plot-id]').forEach((button) => {
    button.addEventListener('click', () => selectPlot(button.dataset.plotId));
  });
}

function selectPlot(plotId) {
  state.selectedPlot = state.inventory.plots.find((plot) => plot.id === plotId) ?? null;
  renderMap();
  renderPlots();
  renderSelectedPlot();
  $('#plot-heading').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSelectedPlot() {
  const plot = state.selectedPlot;
  const info = $('#plot-information');
  const placeholder = $('#plot-placeholder');
  const button = $('#request-booking');
  if (!plot) {
    info.classList.add('hidden');
    placeholder.classList.remove('hidden');
    $('#plot-heading').textContent = 'Choose a plot';
    $('#plot-status').textContent = 'Not selected';
    $('#plot-status').className = 'status-badge status-none';
    button.disabled = true;
    button.textContent = 'Choose an available plot';
    return;
  }
  const name = statusNames[plot.status] ?? 'Unavailable';
  const canRequest = plot.status === 'AVAILABLE';
  placeholder.classList.add('hidden');
  info.classList.remove('hidden');
  $('#plot-heading').textContent = `Plot ${plot.plot_number}`;
  $('#plot-status').textContent = name;
  $('#plot-status').className = `status-badge status-${statusClass[plot.status] ?? 'unavailable'}`;
  $('#plot-price').textContent = formatCurrency(plot.price);
  $('#detail-number').textContent = plot.plot_number;
  $('#detail-type').textContent = plot.plot_type || 'Residential';
  $('#detail-area').textContent = formatArea(plot.area_sq_yard);
  $('#detail-area-feet').textContent = formatArea(plot.area_sq_feet, 'sq ft');
  $('#detail-dimensions').textContent = plot.length && plot.width
    ? `${formatArea(plot.length, 'ft')} × ${formatArea(plot.width, 'ft')}`
    : '—';
  $('#detail-road').textContent = formatArea(plot.road_width, 'ft');
  $('#detail-direction').textContent = plot.direction || 'Not specified';
  button.disabled = !canRequest;
  button.textContent = canRequest ? 'Request this plot' : 'Currently unavailable';
}

function connectLiveUpdates(projectId) {
  state.eventSource?.close();
  state.eventSource = new EventSource(apiUrl(`/api/v1/public/projects/${projectId}/inventory/stream`));
  state.eventSource.addEventListener('connected', () => setConnection(true));
  for (const event of ['plot.created', 'plot.updated', 'plot.hold.created', 'plot.hold.expired', 'plot.status.updated', 'booking.submitted', 'booking.approved', 'booking.rejected', 'layout.published']) {
    state.eventSource.addEventListener(event, () => loadProject(projectId, true));
  }
  state.eventSource.onerror = () => setConnection(false);
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => loadProject(projectId, true), 30_000);
}

function openBookingForm() {
  const plot = state.selectedPlot;
  if (!plot || plot.status !== 'AVAILABLE') return;
  $('#booking-form').reset();
  $('#booking-error').textContent = '';
  $('#booking-form-body').classList.remove('hidden');
  $('#booking-success').classList.add('hidden');
  $('#booking-subtitle').textContent = state.project.project_name;
  $('#booking-plot').textContent = `Plot ${plot.plot_number}`;
  $('#booking-price').textContent = formatCurrency(plot.price);
  $('#booking-dialog').showModal();
  $('#booking-form [name="name"]').focus();
}

async function submitBooking(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#submit-booking');
  if (!form.reportValidity() || !state.selectedPlot || state.selectedPlot.status !== 'AVAILABLE') return;
  const formData = new FormData(form);
  const payload = {
    project_id: state.project.id,
    plot_id: state.selectedPlot.id,
    customer: {
      name: formData.get('name'),
      mobile: formData.get('mobile'),
      email: formData.get('email') || undefined,
    },
    message: formData.get('message') || undefined,
    consent: formData.get('consent') === 'on',
    website: formData.get('website') || '',
  };
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Sending request…';
  $('#booking-error').textContent = '';
  try {
    const response = await fetch(apiUrl('/api/v1/public/booking-requests'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message ?? 'Your request could not be submitted. Please try again.');
    $('#booking-form-body').classList.add('hidden');
    $('#booking-success').classList.remove('hidden');
    $('#success-copy').textContent = 'Your request has been sent to the project team. It is not a confirmed booking; a team member will contact you to discuss the next steps.';
    $('#success-reference').textContent = body.data.request_id;
    await loadProject(state.project.id, true);
  } catch (error) {
    $('#booking-error').textContent = error instanceof TypeError
      ? 'Unable to send your request right now. Please try again in a moment.'
      : error.message;
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = 'Send booking request <span aria-hidden="true">→</span>';
  }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 4200);
}

$('#plot-search').addEventListener('input', renderPlots);
$('#request-booking').addEventListener('click', openBookingForm);
$('#booking-form').addEventListener('submit', submitBooking);
$('#close-booking').addEventListener('click', () => $('#booking-dialog').close());
$('#finish-booking').addEventListener('click', () => $('#booking-dialog').close());
$('#booking-dialog').addEventListener('click', (event) => {
  if (event.target === $('#booking-dialog')) $('#booking-dialog').close();
});
$('#mobile-menu').addEventListener('click', (event) => {
  const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
  event.currentTarget.setAttribute('aria-expanded', String(!expanded));
  $('.site-nav').classList.toggle('nav-open', !expanded);
});
window.addEventListener('beforeunload', () => {
  state.eventSource?.close();
  clearInterval(state.refreshTimer);
});
window.addEventListener('error', (event) => showToast(event.message || 'An unexpected page error occurred.'));

initialize();
