import type { Plot, Project } from '../lib/types';
import { emptyState, pageHeader } from '../components/PageHeader';
import { money } from '../lib/types';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]!);

export function projectsPage(projects: Project[], selected?: Project, plots: Plot[] = []) {
  const projectCards = projects.map((project) => `<a href="#projects/${encodeURIComponent(project.id)}" class="project-card ${selected?.id === project.id ? 'selected' : ''}"><span>${escapeHtml(project.project_code)}</span><strong>${escapeHtml(project.project_name)}</strong><small>${escapeHtml([project.village, project.district].filter(Boolean).join(', ') || 'Project location pending')}</small><b class="status ${escapeHtml(project.status.toLowerCase())}">${escapeHtml(project.status)}</b></a>`).join('') || emptyState('Create your first project to start tracking inventory.');
  const location = [selected?.village, selected?.taluka, selected?.district, selected?.state, selected?.pincode].filter(Boolean).join(', ');
  const details = selected ? `<section class="project-details"><div><span>Type</span><strong>${escapeHtml(selected.project_type || 'RESIDENTIAL')}</strong></div><div><span>Land area</span><strong>${selected.total_land_area ? `${escapeHtml(selected.total_land_area)} ${escapeHtml(selected.area_unit || 'ACRE')}` : '—'}</strong></div><div><span>Survey number</span><strong>${escapeHtml(selected.survey_number || '—')}</strong></div><div><span>Location</span><strong>${escapeHtml(location || '—')}</strong></div>${selected.description ? `<p>${escapeHtml(selected.description)}</p>` : ''}${selected.highlights?.length ? `<div class="project-highlights"><strong>Project highlights</strong><ul>${selected.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join('')}</ul></div>` : ''}</section>` : '';
  const inventory = selected ? `<div class="panel inventory-panel"><div class="panel-heading"><div><h2>${escapeHtml(selected.project_name)}</h2><p>${escapeHtml(selected.project_code)} · ${plots.length} plots</p></div><button class="secondary-button" id="new-plot">+ Add plot</button></div>${details}<div class="table-wrap"><table><thead><tr><th>Plot</th><th>Type</th><th>Area</th><th>Area (sq ft)</th><th>Dimensions</th><th>Facing</th><th>Road</th><th>Price</th><th>Status</th></tr></thead><tbody>${plots.map((plot) => `<tr><td><strong>${escapeHtml(plot.plot_number)}</strong></td><td>${escapeHtml(plot.plot_type || 'Residential')}</td><td>${plot.area_sq_yard || '—'} sq yd</td><td>${plot.area_sq_feet || '—'} sq ft</td><td>${plot.length && plot.width ? `${plot.length} × ${plot.width}` : '—'}</td><td>${escapeHtml(plot.direction || '—')}</td><td>${plot.road_width ? `${plot.road_width} ft` : '—'}</td><td>${money(plot.current_price)}</td><td><span class="status ${escapeHtml(plot.status.toLowerCase())}">${escapeHtml(plot.status)}</span></td></tr>`).join('') || '<tr><td colspan="9">No plots created for this project yet.</td></tr>'}</tbody></table></div></div>` : `<div class="panel inventory-placeholder">Select a project to view inventory, layout and plot status.</div>`;
  return `${pageHeader('Projects & inventory', 'Manage project records, plot availability and your sales-ready inventory.', '<button id="new-project" class="primary-button">+ New project</button>')}<div class="project-layout"><aside class="project-list"><div class="list-title">PROJECTS <span>${projects.length}</span></div>${projectCards}</aside>${inventory}</div>`;
}
