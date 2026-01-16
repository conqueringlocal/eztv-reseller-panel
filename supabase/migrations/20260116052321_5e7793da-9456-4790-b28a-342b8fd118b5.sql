-- Delete all test customers associated with Michael's reseller account
DELETE FROM customers 
WHERE reseller_id = 'b0981b3e-6727-4ccc-bcc6-15fe2cf77acc';

-- Log this cleanup action in security_audit_logs
INSERT INTO security_audit_logs (
  action,
  resource_type,
  resource_id,
  success,
  details
) VALUES (
  'bulk_delete_customers',
  'customers',
  'b0981b3e-6727-4ccc-bcc6-15fe2cf77acc',
  true,
  '{"reseller_name": "Michael", "customers_deleted": 63, "reason": "Test data cleanup"}'::jsonb
);