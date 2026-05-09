
-- Missing RPCs for Audit Module
CREATE OR REPLACE FUNCTION get_audit_item_detail(p_erp TEXT, p_session_id UUID DEFAULT '00000000-0000-0000-0000-000000000000')
RETURNS JSON AS $$
DECLARE
    v_total_stock NUMERIC;
    v_positions JSON;
BEGIN
    -- Get total stock
    SELECT SUM(end_stock) INTO v_total_stock FROM inventory WHERE erp = p_erp;
    
    -- Get positions
    SELECT json_agg(json_build_object('pos', pos, 'end_stock', end_stock)) 
    INTO v_positions 
    FROM inventory 
    WHERE erp = p_erp;

    RETURN json_build_object(
        'total_stock', COALESCE(v_total_stock, 0),
        'positions', COALESCE(v_positions, '[]'::json)
    );
END;
$$ LANGUAGE plpgsql;

-- Ensure audit_locations table has some data
INSERT INTO audit_locations (name)
SELECT DISTINCT pos FROM inventory WHERE pos IS NOT NULL AND pos != ''
ON CONFLICT (name) DO NOTHING;
