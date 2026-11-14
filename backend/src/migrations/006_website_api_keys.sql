CREATE TABLE website_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES projects(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE website_lead_receipts (
  api_key_id UUID NOT NULL REFERENCES website_api_keys(id),
  external_id VARCHAR(150) NOT NULL,
  lead_id UUID NOT NULL REFERENCES leads(id),
  PRIMARY KEY (api_key_id, external_id)
);
