-- Update Rinda2 Bentley's Connection 2 credentials in the connection_list JSONB
-- Old credentials: username=cfa4a61e36, password=825f0083e5
-- New credentials: username=e50411d89f, password=af65a8679fee

UPDATE customers
SET connection_list = (
  SELECT jsonb_agg(
    CASE 
      WHEN (elem->>'connection_number')::int = 2 THEN 
        jsonb_set(
          jsonb_set(
            jsonb_set(
              elem,
              '{username}',
              '"e50411d89f"'
            ),
            '{password}',
            '"af65a8679fee"'
          ),
          '{m3u_url}',
          concat('"http://trexottv.com:80/get.php?username=e50411d89f&password=af65a8679fee&type=m3u_plus"')::jsonb
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements(connection_list) AS elem
)
WHERE name LIKE 'Rinda2 Bentley%'
AND connection_list IS NOT NULL
AND jsonb_array_length(connection_list) >= 2;

-- Log this update in security_audit_logs
INSERT INTO security_audit_logs (
  action,
  resource_type,
  resource_id,
  success,
  details
) VALUES (
  'update_connection_credentials',
  'customer_connection',
  (SELECT id::text FROM customers WHERE name LIKE 'Rinda2 Bentley%' LIMIT 1),
  true,
  '{"customer_name": "Rinda2 Bentley", "connection_number": 2, "old_username": "cfa4a61e36", "new_username": "e50411d89f", "reason": "Panel account expired and was recreated"}'::jsonb
);