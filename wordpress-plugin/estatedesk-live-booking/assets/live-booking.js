(() => {
  const config = window.EDLB || {};
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { AVAILABLE: 'Available', HOLD: 'On hold', PENDING_APPROVAL: 'Request pending', BOOKED: 'Booked', REGISTERED: 'Registered', BLOCKED: 'Unavailable' };
  const statusClass = status => ({ AVAILABLE: 'available', HOLD: 'hold', PENDING_APPROVAL: 'pending' }[status] || 'booked');
  const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
  const api = async (path, options = {}) => {
    const response = await fetch(`${config.restUrl}${path}`, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'The live inventory could not be loaded.');
    return data;
  };

  document.querySelectorAll('.edlb-widget').forEach(root => {
    const state = { projectId: root.dataset.projectId, data: null, selected: null };
    const el = selector => root.querySelector(selector);
    const error = message => { const target = el('.edlb-error'); target.textContent = message; target.hidden = !message; };
    const renderMap = () => {
      const svg = el('[data-edlb-map]'); svg.replaceChildren();
      const geometries = new Map((state.data.layout.plots || []).map(item => [item.plot_id, item.geometry?.coordinates?.[0]]));
      const ns = 'http://www.w3.org/2000/svg';
      state.data.inventory.plots.forEach(plot => {
        const points = geometries.get(plot.id);
        if (!Array.isArray(points) || !points.length) return;
        const polygon = document.createElementNS(ns, 'polygon');
        polygon.setAttribute('points', points.map(point => `${Number(point[0]) * 1000},${Number(point[1]) * 650}`).join(' '));
        polygon.setAttribute('class', `edlb-plot ${statusClass(plot.status)}${state.selected?.id === plot.id ? ' selected' : ''}`);
        polygon.setAttribute('tabindex', '0'); polygon.setAttribute('role', 'button'); polygon.setAttribute('aria-label', `Plot ${plot.plot_number}: ${labels[plot.status] || 'Unavailable'}`);
        polygon.addEventListener('click', () => select(plot.id));
        polygon.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(plot.id); } });
        svg.append(polygon);
      });
    };
    const renderDetails = () => {
      const target = el('[data-edlb-detail]'); const plot = state.selected;
      if (!plot) { target.innerHTML = '<h3>Select a plot</h3><p>Choose a plot on the map or in the register to review its current status.</p>'; return; }
      const canRequest = plot.status === 'AVAILABLE';
      target.innerHTML = `<span class="edlb-status ${statusClass(plot.status)}">${labels[plot.status] || 'Unavailable'}</span><h3>Plot ${escapeHtml(plot.plot_number)}</h3><strong>${money(plot.price)}</strong><dl><div><dt>Type</dt><dd>${escapeHtml(plot.plot_type || 'Residential')}</dd></div><div><dt>Area</dt><dd>${escapeHtml(plot.area_sq_yard || '—')} sq yd</dd></div><div><dt>Facing</dt><dd>${escapeHtml(plot.direction || 'Not specified')}</dd></div><div><dt>Road width</dt><dd>${escapeHtml(plot.road_width || '—')} ft</dd></div></dl>${canRequest ? '<button class="edlb-action" data-edlb-request>Request this plot</button>' : '<p>This plot is not available for a new request.</p>'}`;
      target.querySelector('[data-edlb-request]')?.addEventListener('click', openDialog);
    };
    const renderList = () => {
      const search = el('[data-edlb-search]').value.trim().toLowerCase();
      const plots = state.data.inventory.plots.filter(plot => plot.plot_number.toLowerCase().includes(search));
      el('[data-edlb-plots]').innerHTML = plots.map(plot => `<button class="edlb-row${state.selected?.id === plot.id ? ' selected' : ''}" data-plot="${escapeHtml(plot.id)}"><span><b>Plot ${escapeHtml(plot.plot_number)}</b><small>${escapeHtml(plot.plot_type || 'Residential')} · ${escapeHtml(plot.area_sq_yard || '—')} sq yd</small></span><span><em class="edlb-status ${statusClass(plot.status)}">${labels[plot.status] || 'Unavailable'}</em><strong>${money(plot.price)}</strong></span></button>`).join('') || '<p>No plots match your search.</p>';
      el('[data-edlb-plots]').querySelectorAll('[data-plot]').forEach(button => button.addEventListener('click', () => select(button.dataset.plot)));
    };
    const select = id => { state.selected = state.data.inventory.plots.find(plot => plot.id === id) || null; renderMap(); renderDetails(); renderList(); };
    const openDialog = () => { const dialog = el('[data-edlb-dialog]'); el('[data-edlb-booking-plot]').textContent = `Plot ${state.selected.plot_number} · ${money(state.selected.price)}`; el('[data-edlb-form-error]').textContent = ''; dialog.showModal(); };
    const render = () => {
      const { project, inventory } = state.data;
      el('[data-edlb-project]').textContent = project.project_name; el('[data-edlb-location]').textContent = [project.village, project.district, project.state].filter(Boolean).join(', ');
      el('[data-edlb-available]').textContent = inventory.available; el('[data-edlb-total]').textContent = inventory.total_plots;
      el('.edlb-summary').hidden = false; el('.edlb-grid').hidden = false; el('.edlb-register').hidden = false; el('.edlb-updated').textContent = `Updated ${new Date(state.data.synced_at).toLocaleTimeString()}`;
      renderMap(); renderDetails(); renderList();
    };
    const load = async () => { if (!state.projectId) { error('Set a CRM project UUID in the shortcode or WordPress settings.'); return; } try { error(''); state.data = await api(`inventory/${state.projectId}?refresh=1`); state.selected = state.data.inventory.plots.find(plot => plot.id === state.selected?.id) || null; render(); } catch (reason) { error(reason.message); } };
    el('[data-edlb-search]').addEventListener('input', renderList);
    el('[data-edlb-close]').addEventListener('click', () => el('[data-edlb-dialog]').close());
    el('[data-edlb-booking-form]').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity() || !state.selected) return;
      const body = new FormData(form); const button = form.querySelector('button[type="submit"]'); button.disabled = true;
      try { const response = await api('booking', { method: 'POST', body: JSON.stringify({ project_id: state.projectId, plot_id: state.selected.id, customer: { name: body.get('name'), mobile: body.get('mobile'), email: body.get('email') }, message: body.get('message'), consent: body.get('consent') === 'on', website: body.get('website') }) }); form.reset(); el('[data-edlb-form-error]').textContent = `Request received: ${response.request_id}. Our team will contact you.`; await load(); } catch (reason) { el('[data-edlb-form-error]').textContent = reason.message; } finally { button.disabled = false; }
    });
    load(); window.setInterval(load, 15000);
  });
})();
