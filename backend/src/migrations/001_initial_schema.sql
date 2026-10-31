CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  mobile VARCHAR(20),
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('ADMIN','PROJECT_MANAGER','SALES_MANAGER','SALES_EXECUTIVE','BROKER','ACCOUNTS')),
  organization_name VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code VARCHAR(50) NOT NULL UNIQUE,
  project_name VARCHAR(200) NOT NULL,
  survey_number VARCHAR(100),
  village VARCHAR(150),
  district VARCHAR(150),
  state VARCHAR(100),
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_projects (
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  access_level VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE plots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  plot_number VARCHAR(50) NOT NULL,
  plot_type VARCHAR(50) NOT NULL DEFAULT 'RESIDENTIAL',
  area_sq_yard NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (area_sq_yard >= 0),
  area_sq_feet NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (area_sq_feet >= 0),
  length NUMERIC(12,2) CHECK (length >= 0),
  width NUMERIC(12,2) CHECK (width >= 0),
  direction VARCHAR(20),
  road_width NUMERIC(10,2) CHECK (road_width >= 0),
  base_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (base_price >= 0),
  current_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (current_price >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (status IN ('AVAILABLE','HOLD','PENDING_APPROVAL','BOOKED','REGISTERED','BLOCKED')),
  held_by UUID REFERENCES users(id),
  hold_expires_at TIMESTAMPTZ,
  assigned_sales_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, plot_number),
  CHECK ((status = 'HOLD' AND held_by IS NOT NULL AND hold_expires_at IS NOT NULL)
    OR (status <> 'HOLD' AND held_by IS NULL AND hold_expires_at IS NULL))
);
CREATE INDEX plots_project_status_idx ON plots(project_id, status);
CREATE INDEX plots_held_by_idx ON plots(held_by) WHERE held_by IS NOT NULL;

CREATE TABLE layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  layout_name VARCHAR(200) NOT NULL,
  image_url TEXT,
  image_width INTEGER CHECK (image_width > 0),
  image_height INTEGER CHECK (image_height > 0),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  created_by UUID REFERENCES users(id),
  published_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version_number)
);
CREATE UNIQUE INDEX one_published_layout_per_project ON layouts(project_id) WHERE status = 'PUBLISHED';

CREATE TABLE plot_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id UUID NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  plot_id UUID NOT NULL REFERENCES plots(id),
  geometry JSONB NOT NULL,
  label_position JSONB,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (layout_id, plot_id)
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code VARCHAR(40) UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  mobile VARCHAR(20) NOT NULL,
  alternate_mobile VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  pincode VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX customers_mobile_idx ON customers(mobile);

CREATE SEQUENCE booking_code_seq;
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code VARCHAR(40) NOT NULL UNIQUE DEFAULT
    ('BR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('booking_code_seq')::TEXT, 5, '0')),
  plot_id UUID NOT NULL REFERENCES plots(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  lead_id UUID,
  submitted_by UUID REFERENCES users(id),
  salesperson_id UUID REFERENCES users(id),
  broker_id UUID REFERENCES users(id),
  booking_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (booking_amount >= 0),
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  booking_status VARCHAR(30) NOT NULL CHECK (booking_status IN ('PENDING_APPROVAL','APPROVED','REJECTED','CANCELLED','REGISTERED')),
  source VARCHAR(30) NOT NULL DEFAULT 'CRM',
  remarks TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX unique_active_booking_per_plot ON bookings(plot_id)
  WHERE booking_status IN ('PENDING_APPROVAL','APPROVED','REGISTERED');
CREATE INDEX bookings_status_submitted_idx ON bookings(booking_status, submitted_at DESC);

CREATE TABLE booking_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  approver_id UUID NOT NULL REFERENCES users(id),
  decision VARCHAR(30) NOT NULL CHECK (decision IN ('APPROVED','REJECTED','CORRECTION_REQUESTED','CANCELLED')),
  remarks TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plot_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id UUID NOT NULL REFERENCES plots(id),
  previous_status VARCHAR(30),
  new_status VARCHAR(30) NOT NULL,
  changed_by UUID REFERENCES users(id),
  reason TEXT,
  reference_type VARCHAR(40),
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX plot_history_created_idx ON plot_status_history(plot_id, created_at DESC);

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code VARCHAR(40) NOT NULL UNIQUE DEFAULT
    ('LD-' || TO_CHAR(NOW(), 'YYYY') || '-' || SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 8)),
  customer_id UUID NOT NULL REFERENCES customers(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  interested_plot_id UUID REFERENCES plots(id),
  assigned_user_id UUID REFERENCES users(id),
  source VARCHAR(40) NOT NULL DEFAULT 'CRM',
  lead_status VARCHAR(30) NOT NULL DEFAULT 'NEW'
    CHECK (lead_status IN ('NEW','CONTACTED','QUALIFIED','SITE_VISIT','NEGOTIATION','CONVERTED','LOST')),
  broker_id UUID REFERENCES users(id),
  budget NUMERIC(14,2) CHECK (budget >= 0),
  next_followup_at TIMESTAMPTZ,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX leads_assignment_idx ON leads(assigned_user_id, lead_status);
CREATE INDEX leads_project_idx ON leads(project_id);
ALTER TABLE bookings ADD CONSTRAINT bookings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);

CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  user_id UUID REFERENCES users(id),
  activity_type VARCHAR(50) NOT NULL,
  activity_notes TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  receipt_number VARCHAR(50) NOT NULL UNIQUE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_mode VARCHAR(30) NOT NULL,
  transaction_reference VARCHAR(150),
  payment_date TIMESTAMPTZ NOT NULL,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'RECORDED'
    CHECK (payment_status IN ('RECORDED','VERIFIED','REJECTED','REFUNDED')),
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX payments_booking_idx ON payments(booking_id, payment_date);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  module VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80),
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);
