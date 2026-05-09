-- 1. Audit Sessions Table
CREATE TABLE IF NOT EXISTS audit_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_name TEXT NOT NULL,
  audit_date DATE DEFAULT CURRENT_DATE,
  auditor TEXT NOT NULL,
  auditor_email TEXT NOT NULL,
  approver TEXT,
  approver_email TEXT,
  status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending', 'Approved', 'Rejected')),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Update Audit Records Table
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES audit_sessions(id) ON DELETE CASCADE;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS approver TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS approver_email TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- 3. Audit Locations Table
CREATE TABLE IF NOT EXISTS audit_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed audit_locations from inventory
INSERT INTO audit_locations (name)
SELECT DISTINCT pos FROM inventory WHERE pos IS NOT NULL AND pos != ''
ON CONFLICT (name) DO NOTHING;

-- 4. RPC: get_inventory_with_movement
CREATE OR REPLACE FUNCTION get_inventory_with_movement(
  p_from_date DATE,
  p_to_date DATE,
  p_search TEXT DEFAULT '',
  p_type TEXT DEFAULT 'all'
)
RETURNS TABLE (
  erp TEXT,
  name TEXT,
  pos TEXT,
  start_stock INTEGER,
  in_qty NUMERIC,
  out_qty NUMERIC,
  end_stock NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH inbound_sums AS (
    SELECT erp_code, SUM(qty) as total_in
    FROM inbound_records
    WHERE date >= p_from_date AND date <= p_to_date
    GROUP BY erp_code
  ),
  outbound_sums AS (
    SELECT erp_code, SUM(qty) as total_out
    FROM outbound_records
    WHERE date >= p_from_date AND date <= p_to_date
    GROUP BY erp_code
  )
  SELECT 
    i.erp,
    i.name,
    i.pos,
    i.start_stock,
    COALESCE(ins.total_in, 0) as in_qty,
    COALESCE(outs.total_out, 0) as out_qty,
    (i.start_stock + COALESCE(ins.total_in, 0) - COALESCE(outs.total_out, 0)) as end_stock
  FROM inventory i
  LEFT JOIN inbound_sums ins ON i.erp = ins.erp_code
  LEFT JOIN outbound_sums outs ON i.erp = outs.erp_code
  WHERE 
    (p_search = '' OR i.erp ILIKE '%' || p_search || '%' OR i.name ILIKE '%' || p_search || '%' OR i.pos ILIKE '%' || p_search || '%')
    AND (
      p_type = 'all' 
      OR (p_type = 'inbound' AND COALESCE(ins.total_in, 0) > 0)
      OR (p_type = 'outbound' AND COALESCE(outs.total_out, 0) > 0)
      OR (p_type = 'movement' AND (COALESCE(ins.total_in, 0) > 0 OR COALESCE(outs.total_out, 0) > 0))
    );
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: submit_audit_session
CREATE OR REPLACE FUNCTION submit_audit_session(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE audit_sessions
  SET status = 'Pending'
  WHERE id = p_session_id AND status = 'Draft';

  UPDATE audit_records
  SET status = 'Pending'
  WHERE session_id = p_session_id AND status = 'Draft';
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: approve_audit_session
CREATE OR REPLACE FUNCTION approve_audit_session(
  p_session_id UUID,
  p_approver_email TEXT,
  p_action TEXT -- 'approve' or 'reject'
)
RETURNS VOID AS $$
DECLARE
  v_approver_name TEXT;
  v_new_status TEXT;
BEGIN
  SELECT full_name INTO v_approver_name FROM profiles WHERE email = p_approver_email;
  
  IF p_action = 'approve' THEN
    v_new_status := 'Approved';
  ELSE
    v_new_status := 'Rejected';
  END IF;

  UPDATE audit_sessions
  SET 
    status = v_new_status,
    approver = v_approver_name,
    approver_email = p_approver_email,
    approved_at = NOW()
  WHERE id = p_session_id;

  UPDATE audit_records
  SET 
    status = v_new_status,
    approver = v_approver_name,
    approver_email = p_approver_email,
    approved_at = NOW()
  WHERE session_id = p_session_id;
  
  -- If approved, we could also trigger the stock sync here, 
  -- but usually it's a separate step "Sync Stock" in the UI for safety.
END;
$$ LANGUAGE plpgsql;

-- Enable Real-time
ALTER PUBLICATION supabase_realtime ADD TABLE audit_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_locations;
