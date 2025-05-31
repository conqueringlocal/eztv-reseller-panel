
-- Insert default package ID setting
INSERT INTO system_settings (id, value, description)
VALUES (
  'default_package_id',
  '1',
  'Default IPTV package ID to use when creating accounts via webhook if no package_id is specified'
) ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description;
