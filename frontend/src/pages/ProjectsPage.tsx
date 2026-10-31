import type { Plot, Project, ProjectLayout } from '../lib/types';
import { emptyState, pageHeader } from '../components/PageHeader';
import { money } from '../lib/types';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]!);

export function projectsPage(projects: Project[], selected?: Project, plots: Plot[] = [], layout?: ProjectLayout, canEditLayout = false) {
  const projectCards = projects.map((project) => `<a href="#projects/${encodeURIComponent(project.id)}" class="project-card ${selected?.id === project.id ? 'selected' : ''}"><span>${escapeHtml(project.project_code)}</span><strong>${escapeHtml(project.project_name)}</strong><small>${escapeHtml([project.village, project.district].filter(Boolean).join(', ') || 'Project location pending')}</small><b class="status ${escapeHtml(project.status.toLowerCase())}">${escapeHtml(project.status)}</b></a>`).join('') || emptyState('Create your first project to start tracking inventory.');
  const location = [selected?.village, selected?.taluka, selected?.district, selected?.state, selected?.pincode].filter(Boolean).join(', ');
  const details = selected ? `<section class="project-details"><div><span>Type</span><strong>${escapeHtml(selected.project_type || 'RESIDENTIAL')}</strong></div><div><span>Land area</span><strong>${selected.total_land_area ? `${escapeHtml(selected.total_land_area)} ${escapeHtml(selected.area_unit || 'ACRE')}` : '—'}</strong></div><div><span>Survey number</span><strong>${escapeHtml(selected.survey_number || '—')}</strong></div><div><span>Location</span><strong>${escapeHtml(location || '—')}</strong></div>${selected.description ? `<p>${escapeHtml(selected.description)}</p>` : ''}${selected.highlights?.length ? `<div class="project-highlights"><strong>Project highlights</strong><ul>${selected.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join('')}</ul></div>` : ''}</section>` : '';
  const mappedPlotIds = new Set(layout?.plots?.map((plot) => plot.plot_id) ?? []);
  const statusColor: Record<string, string> = { AVAILABLE: '#39a66c', HOLD: '#e5ad36', PENDING_APPROVAL: '#ed8a38', BOOKED: '#d95858', REGISTERED: '#647cc7', BLOCKED: '#737d83' };
  const layoutPolygons = layout?.plots?.map((item) => {
    const points = item.geometry?.coordinates?.[0];
    if (!points?.length) return '';
    const coordinates = points.map(([x, y]) => `${Number(x) * 1000},${Number(y) * 650}`).join(' ');
    const center = points.slice(0, -1);
    if (!center.length) return '';
    const x = center.reduce((sum, point) => sum + Number(point[0]) * 1000, 0) / center.length;
    const y = center.reduce((sum, point) => sum + Number(point[1]) * 650, 0) / center.length;
    return `<g data-plot-id="${escapeHtml(item.plot_id)}"><polygon points="${coordinates}" fill="${statusColor[item.status] || '#737d83'}" class="masterplan-plot"></polygon><text x="${x}" y="${y}" class="masterplan-label">${escapeHtml(item.plot_number)}</text></g>`;
  }).join('') ?? '';
  const mapPlots = plots.map((plot) => `<option value="${escapeHtml(plot.id)}">${escapeHtml(plot.plot_number)}</option>`).join('');
  const layoutControls = canEditLayout ? `<div class="masterplan-toolbar">
    ${layout?.status === 'DRAFT' ? `<span class="masterplan-version">Draft · v${layout.version_number}</span>` : layout ? `<span class="masterplan-version">Published · v${layout.version_number}</span>` : '<span class="masterplan-version">No site plan yet</span>'}
    <div class="masterplan-actions">
      ${layout?.status === 'DRAFT' ? '' : `<button class="secondary-button" id="${layout ? 'new-layout-revision' : 'new-layout'}">${layout ? 'New draft revision' : 'Create master plan'}</button>`}
      <button class="secondary-button" id="upload-layout-image">${layout?.image_url ? 'Replace plan image' : 'Upload plan image'}</button>
      ${layout?.status === 'DRAFT' ? `<select id="boundary-plot" aria-label="Select plot to map"><option value="">Select plot to map</option>${mapPlots}</select><button class="secondary-button" id="draw-boundary" ${plots.length && layout.image_url ? '' : 'disabled'}>Draw selected plot</button><button class="secondary-button" id="save-boundary" disabled>Save boundary</button><button class="secondary-button" id="cancel-boundary" hidden>Cancel drawing</button><button class="primary-button" id="publish-layout" ${plots.length && layout.image_url && plots.every((plot) => mappedPlotIds.has(plot.id)) ? '' : 'disabled'}>Publish plan</button>` : ''}
      <input id="layout-image-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
    </div>
  </div>` : `<div class="masterplan-toolbar"><span class="masterplan-version">${layout ? `${layout.status === 'PUBLISHED' ? 'Published' : layout.status} · v${layout.version_number}` : 'Master plan not published'}</span></div>`;
  const image = layout?.image_url ? `<image id="masterplan-image" x="0" y="0" width="1000" height="650" preserveAspectRatio="none"></image>` : '<rect width="1000" height="650" fill="#f3f5f2"></rect>';
  const inventory = selected ? `<div class="panel inventory-panel"><div class="panel-heading"><div><h2>${escapeHtml(selected.project_name)}</h2><p>${escapeHtml(selected.project_code)} · ${plots.length} plots · ${layout ? `${layout.plots.length} mapped` : 'no layout'}</p></div><button class="secondary-button" id="new-plot">+ Add plot</button></div>${details}<section class="masterplan-panel"><div class="masterplan-heading"><div><h3>Project master plan</h3><p>Upload a verified layout, select a plot and trace its boundary to place it on the map.</p></div></div>${layoutControls}<div class="masterplan-canvas"><svg id="masterplan-map" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-label="Project plot master plan">${image}${layoutPolygons}</svg><p id="masterplan-empty" ${layout?.image_url ? 'hidden' : ''}>Upload the verified site-plan image to trace plot boundaries.</p></div><p id="masterplan-message" class="masterplan-message" role="status"></p><div class="masterplan-legend"><span><i class="available"></i>Available</span><span><i class="hold"></i>Hold</span><span><i class="pending"></i>Pending</span><span><i class="booked"></i>Booked</span><span><i class="blocked"></i>Other</span></div></section><div class="table-wrap"><table><thead><tr><th>Plot</th><th>Type</th><th>Area</th><th>Area (sq ft)</th><th>Dimensions</th><th>Facing</th><th>Road</th><th>Price</th><th>Status</th></tr></thead><tbody>${plots.map((plot) => `<tr><td><strong>${escapeHtml(plot.plot_number)}</strong><small>${mappedPlotIds.has(plot.id) ? 'Mapped' : 'Not mapped'}</small></td><td>${escapeHtml(plot.plot_type || 'Residential')}</td><td>${plot.area_sq_yard || '—'} sq yd</td><td>${plot.area_sq_feet || '—'} sq ft</td><td>${plot.length && plot.width ? `${plot.length} × ${plot.width}` : '—'}</td><td>${escapeHtml(plot.direction || '—')}</td><td>${plot.road_width ? `${plot.road_width} ft` : '—'}</td><td>${money(plot.current_price)}</td><td><span class="status ${escapeHtml(plot.status.toLowerCase())}">${escapeHtml(plot.status)}</span></td></tr>`).join('') || '<tr><td colspan="9">No plots created for this project yet.</td></tr>'}</tbody></table></div></div>` : `<div class="panel inventory-placeholder">Select a project to view inventory, layout and plot status.</div>`;
  return `${pageHeader('Projects & inventory', 'Manage project records, plot availability and your sales-ready inventory.', '<button id="new-project" class="primary-button">+ New project</button>')}<div class="project-layout"><aside class="project-list"><div class="list-title">PROJECTS <span>${projects.length}</span></div>${projectCards}</aside>${inventory}</div>`;
}
