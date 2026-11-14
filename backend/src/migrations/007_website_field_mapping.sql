ALTER TABLE website_api_keys ADD COLUMN field_mapping JSONB NOT NULL DEFAULT '{}'::jsonb;
