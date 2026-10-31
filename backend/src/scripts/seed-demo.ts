import '../env.ts';
import { pool } from '../db.ts';

const demoCode = 'DEMO-GREEN-MEADOWS';
const previousLayoutName = 'DEMO schematic plot plan - Not for construction or sale';
const masterPlanLayoutName = 'DEMO master plan - Schematic only, not for construction or sale';
const plots = Array.from({ length: 12 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  const x = 0.08 + column * 0.23;
  const y = 0.08 + row * 0.22;
  const width = 0.18;
  const height = 0.17;
  const statuses = ['AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'AVAILABLE', 'PENDING_APPROVAL', 'BOOKED', 'BLOCKED'];
  return {
    number: String(index + 1).padStart(2, '0'),
    status: statuses[index],
    area: 150 + (index % 4) * 10,
    price: 2500000 + index * 100000,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [x, y], [x + width, y], [x + width, y + height], [x, y + height], [x, y],
      ]],
    },
  };
});

async function seedDemo() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await client.query(
      'SELECT id FROM users WHERE email = LOWER($1) AND role = $2 AND is_active = TRUE',
      [process.env.ADMIN_EMAIL?.trim() ?? '', 'ADMIN'],
    );
    if (!admin.rowCount) throw new Error('No active administrator found. Run npm run db:seed first.');
    const adminId = admin.rows[0].id;

    await client.query(
      `INSERT INTO projects
        (project_code, project_name, project_type, total_land_area, area_unit, survey_number,
         village, taluka, district, state, pincode, description, status)
       VALUES ($1,$2,'RESIDENTIAL',1.25,'ACRE','DEMO-SURVEY-001',
         'Sample Village','Demo Taluka','Sample District','Demo State','000000',
         $3,'INACTIVE')
       ON CONFLICT (project_code) DO NOTHING`,
      [
        demoCode,
        'DEMO - Green Meadows (sample data)',
        'SAMPLE DATA ONLY. Fictional project, plot areas and prices for UI testing. Not a real offering. Excluded from public APIs while inactive. Replace all sample values before operational use.',
      ],
    );
    const projectResult = await client.query('SELECT * FROM projects WHERE project_code = $1 FOR UPDATE', [demoCode]);
    const project = projectResult.rows[0];
    if (!project.description?.startsWith('SAMPLE DATA ONLY.')) {
      throw new Error(`Project code ${demoCode} is already in use by a non-demo record; no data was changed.`);
    }

    const inventory = await client.query(
      `SELECT count(DISTINCT p.id)::int AS plots,
        count(DISTINCT l.id) FILTER (WHERE l.status = 'PUBLISHED')::int AS published_layouts
       FROM projects pr
       LEFT JOIN plots p ON p.project_id = pr.id
       LEFT JOIN layouts l ON l.project_id = pr.id
       WHERE pr.id = $1`,
      [project.id],
    );
    const counts = inventory.rows[0];
    if (counts.plots || counts.published_layouts) {
      if (counts.plots === plots.length && counts.published_layouts === 1) {
        const demoLayout = await client.query(
          `SELECT l.id, l.layout_name, p.plot_number
           FROM layouts l
           JOIN plot_layouts pl ON pl.layout_id = l.id
           JOIN plots p ON p.id = pl.plot_id
           WHERE l.project_id = $1 AND l.status = 'PUBLISHED'
           ORDER BY p.plot_number`,
          [project.id],
        );
        const expectedNumbers = plots.map((plot) => plot.number).sort();
        if (demoLayout.rows.length !== plots.length
          || !demoLayout.rows.every((row, index) => row.plot_number === expectedNumbers[index])
          || ![previousLayoutName, masterPlanLayoutName].includes(demoLayout.rows[0].layout_name)) {
          throw new Error('Demo project inventory does not match the known sample layout; refusing to overwrite it.');
        }
        if (demoLayout.rows[0].layout_name === previousLayoutName) {
          for (const plot of plots) {
            await client.query(
              `UPDATE plot_layouts SET geometry = $3::jsonb
               FROM plots p
               WHERE plot_layouts.layout_id = $1
                 AND plot_layouts.plot_id = p.id
                 AND p.project_id = $2
                 AND p.plot_number = $4`,
              [demoLayout.rows[0].id, project.id, JSON.stringify(plot.geometry), plot.number],
            );
          }
          await client.query(
            'UPDATE layouts SET layout_name = $2 WHERE id = $1',
            [demoLayout.rows[0].id, masterPlanLayoutName],
          );
          console.log('Upgraded the existing fictional demo layout to the master plan; draft layouts were preserved.');
        } else {
          console.log('Demo master plan already exists; no layout changes made.');
        }
        await client.query('COMMIT');
        return;
      }
      throw new Error('Demo project contains partial or manually changed inventory; refusing to overwrite it.');
    }

    await client.query(
      `INSERT INTO user_projects (user_id, project_id, assigned_by)
       VALUES ($1,$2,$1) ON CONFLICT (user_id, project_id) DO NOTHING`,
      [adminId, project.id],
    );

    const layoutResult = await client.query(
      `INSERT INTO layouts
        (project_id, layout_name, version_number, status, created_by, published_by, published_at)
       VALUES ($1,'DEMO master plan - Schematic only, not for construction or sale',1,'PUBLISHED',$2,$2,NOW())
       RETURNING id`,
      [project.id, adminId],
    );
    const layoutId = layoutResult.rows[0].id;
    const plotIds = {};
    for (const plot of plots) {
      const area = plot.area;
      const insertedPlot = await client.query(
        `INSERT INTO plots
          (project_id, plot_number, plot_type, area_sq_yard, area_sq_feet, length, width,
           direction, road_width, base_price, current_price, status)
         VALUES ($1,$2,'RESIDENTIAL',$3,$4,45,$5,'NORTH',30,$6,$6,$7)
         RETURNING id`,
        [project.id, plot.number, area, area * 9, area * 9 / 45, plot.price, plot.status],
      );
      const plotId = insertedPlot.rows[0].id;
      plotIds[plot.number] = plotId;
      await client.query(
        `INSERT INTO plot_layouts (layout_id, plot_id, geometry, display_order)
         VALUES ($1,$2,$3::jsonb,$4)`,
        [layoutId, plotId, JSON.stringify(plot.geometry), Number(plot.number)],
      );
      await client.query(
        `INSERT INTO plot_status_history (plot_id, new_status, changed_by, reason)
         VALUES ($1,$2,$3,'Initial fictional sample inventory')`,
        [plotId, plot.status, adminId],
      );
    }

    const customers = [];
    for (const customer of [
      { name: 'Alex Sample', mobile: '9990000001', email: 'alex.sample@example.invalid' },
      { name: 'Taylor Example', mobile: '9990000002', email: 'taylor.example@example.invalid' },
    ]) {
      const result = await client.query(
        `INSERT INTO customers (full_name, mobile, email, address, city, state, pincode)
         VALUES ($1,$2,$3,'Fictional demo record','Sample City','Demo State','000000')
         RETURNING id`,
        [customer.name, customer.mobile, customer.email],
      );
      customers.push(result.rows[0].id);
    }

    const leadResult = await client.query(
      `INSERT INTO leads (customer_id, project_id, interested_plot_id, assigned_user_id, source, lead_status, budget, remarks)
       VALUES ($1,$2,$3,$4,'DEMO','NEW',3000000,'Fictional sample lead - do not contact')
       RETURNING id`,
      [customers[0], project.id, plotIds['01'], adminId],
    );

    await client.query(
      `INSERT INTO bookings
        (plot_id, customer_id, lead_id, booking_amount, total_price, booking_status, source, remarks)
       VALUES ($1,$2,$3,250000,2600000,'PENDING_APPROVAL','DEMO','Fictional sample booking')`,
      [plotIds['10'], customers[0], leadResult.rows[0].id],
    );
    const approvedBooking = await client.query(
      `INSERT INTO bookings
        (plot_id, customer_id, booking_amount, total_price, booking_status, source, remarks, approved_by, approved_at)
       VALUES ($1,$2,250000,2700000,'APPROVED','DEMO','Fictional sample booking',$3,NOW())
       RETURNING id`,
      [plotIds['11'], customers[1], adminId],
    );
    await client.query(
      `INSERT INTO booking_approvals (booking_id, approver_id, decision, remarks)
       VALUES ($1,$2,'APPROVED','Fictional demo approval')`,
      [approvedBooking.rows[0].id, adminId],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, module, entity_type, entity_id)
       VALUES ($1,'DEMO_DATA_SEEDED','projects','project',$2)`,
      [adminId, project.id],
    );
    await client.query('COMMIT');
    console.log(`Created inactive ${demoCode} with 12 sample plots, a schematic master plan, a lead, and two sample bookings.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

try {
  await seedDemo();
} catch (error) {
  console.error('Demo data seed failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
