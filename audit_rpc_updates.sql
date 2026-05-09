
-- 1. RPC: get_audit_items
CREATE OR REPLACE FUNCTION get_audit_items(
  p_session_id UUID,
  p_search TEXT DEFAULT '',
  p_location TEXT DEFAULT '',
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  erp TEXT,
  name TEXT,
  pos TEXT,
  end_stock NUMERIC,
  last_audit DATE,
  movement_qty NUMERIC,
  already_audited BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH movement_data AS (
    SELECT 
      i.erp,
      i.pos,
      COALESCE((SELECT SUM(qty) FROM inbound_records WHERE erp_code = i.erp AND date >= p_from_date AND date <= p_to_date), 0) +
      COALESCE((SELECT SUM(qty) FROM outbound_records WHERE erp_code = i.erp AND date >= p_from_date AND date <= p_to_date), 0) as total_movement
    FROM inventory i
  )
  SELECT 
    i.erp,
    i.name,
    i.pos,
    i.end_stock,
    (SELECT MAX(created_at::date) FROM audit_records WHERE erp_code = i.erp AND location = i.pos AND status = 'Approved') as last_audit,
    m.total_movement as movement_qty,
    EXISTS (
      SELECT 1 FROM audit_records 
      WHERE erp_code = i.erp 
      AND location = i.pos 
      AND session_id = p_session_id
      AND status IN ('Draft', 'Pending')
    ) as already_audited
  FROM inventory i
  JOIN movement_data m ON i.erp = m.erp AND i.pos = m.pos
  WHERE 
    -- Search filter
    (p_search = '' OR i.erp ILIKE '%' || p_search || '%' OR i.name ILIKE '%' || p_search || '%')
    -- Location filter
    AND (p_location = '' OR i.pos ILIKE '%' || p_location || '%')
    -- Logic: If searching specifically, show all records matching search
    -- If NOT searching, only show records with movement in the period
    AND (
      (p_search <> '' OR p_location <> '') OR 
      (m.total_movement > 0)
    )
  ORDER BY m.total_movement DESC, i.erp ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. RPC: count_audit_items
CREATE OR REPLACE FUNCTION count_audit_items(
  p_session_id UUID,
  p_search TEXT DEFAULT '',
  p_location TEXT DEFAULT '',
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM inventory i
  WHERE 
    (p_search = '' OR i.erp ILIKE '%' || p_search || '%' OR i.name ILIKE '%' || p_search || '%')
    AND (p_location = '' OR i.pos ILIKE '%' || p_location || '%')
    AND (
      (p_search <> '' OR p_location <> '') OR
      (
        COALESCE((SELECT SUM(qty) FROM inbound_records WHERE erp_code = i.erp AND date >= p_from_date AND date <= p_to_date), 0) +
        COALESCE((SELECT SUM(qty) FROM outbound_records WHERE erp_code = i.erp AND date >= p_from_date AND date <= p_to_date), 0) > 0
      )
    );
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 3. RPC: get_audited_items
CREATE OR REPLACE FUNCTION get_audited_items(
  p_session_id UUID,
  p_status TEXT DEFAULT 'Draft'
)
RETURNS TABLE (
  id UUID,
  erp_code TEXT,
  name TEXT,
  location TEXT,
  system_qty NUMERIC,
  actual_qty NUMERIC,
  difference NUMERIC,
  note TEXT,
  created_at TIMESTAMPTZ,
  auditor TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ar.id,
    ar.erp_code,
    i.name,
    ar.location,
    ar.system_qty,
    ar.actual_qty,
    ar.difference,
    ar.note,
    ar.created_at,
    ar.auditor
  FROM audit_records ar
  JOIN inventory i ON ar.erp_code = i.erp
  WHERE ar.session_id = p_session_id 
    AND ar.status = p_status
  ORDER BY ar.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC: submit_audit_session
CREATE OR REPLACE FUNCTION submit_audit_session(
  p_session_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE audit_records 
  SET status = 'Pending'
  WHERE session_id = p_session_id 
    AND status = 'Draft';
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: check_audit_duplicate
CREATE OR REPLACE FUNCTION check_audit_duplicate(
  p_erp_code TEXT,
  p_location TEXT,
  p_session_id UUID
)
RETURNS TABLE (
  duplicate BOOLEAN,
  auditor TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE as duplicate,
    ar.auditor
  FROM audit_records ar
  WHERE ar.erp_code = p_erp_code 
    AND ar.location = p_location 
    AND ar.session_id = p_session_id
    AND ar.status IN ('Draft', 'Pending')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
