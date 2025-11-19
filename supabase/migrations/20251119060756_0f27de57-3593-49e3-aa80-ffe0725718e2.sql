-- Add expiration_date to each connection in connection_list for existing customers
UPDATE customers
SET connection_list = (
  SELECT jsonb_agg(
    conn || jsonb_build_object('expiration_date', expiration_date::text)
  )
  FROM jsonb_array_elements(connection_list) conn
)
WHERE connection_list IS NOT NULL 
AND jsonb_array_length(connection_list) > 0
AND NOT (connection_list @> '[{"expiration_date": ""}]'::jsonb);

-- Create helper function to get the earliest expiration date from connection_list
CREATE OR REPLACE FUNCTION public.get_earliest_expiration(connection_list_param jsonb)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  earliest_date date := NULL;
  conn jsonb;
BEGIN
  IF connection_list_param IS NULL OR jsonb_array_length(connection_list_param) = 0 THEN
    RETURN NULL;
  END IF;
  
  FOR conn IN SELECT * FROM jsonb_array_elements(connection_list_param)
  LOOP
    IF earliest_date IS NULL OR (conn->>'expiration_date')::date < earliest_date THEN
      earliest_date := (conn->>'expiration_date')::date;
    END IF;
  END LOOP;
  
  RETURN earliest_date;
END;
$$;