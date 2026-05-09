-- SQL Schema for Inventory Audit Module

-- 1. Table for Audit Records (Centralized)
CREATE TABLE IF NOT EXISTS audit_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    erp_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    location TEXT,
    system_qty NUMERIC DEFAULT 0,
    actual_qty NUMERIC DEFAULT 0,
    difference NUMERIC GENERATED ALWAYS AS (actual_qty - system_qty) STORED,
    note TEXT,
    auditor TEXT,
    user_email TEXT,
    status TEXT DEFAULT 'Draft', -- Draft (Đang kiểm), Pending (Chờ duyệt), Approved (Đã duyệt), Rejected (Từ chối)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approver TEXT,
    approved_at TIMESTAMP WITH TIME ZONE,
    adjustment_reason TEXT
);

-- 2. RPC: Save or Update Audit Record (Đang kiểm)
CREATE OR REPLACE FUNCTION save_audit_record_v2(
    p_record_id UUID,
    p_erp_code TEXT,
    p_actual_qty NUMERIC,
    p_location TEXT,
    p_note TEXT,
    p_auditor TEXT,
    p_user_email TEXT
)
RETURNS VOID AS $$
DECLARE
    v_system_qty NUMERIC;
    v_item_name TEXT;
BEGIN
    -- Get system qty for this specific ERP and location
    SELECT end_stock, name INTO v_system_qty, v_item_name 
    FROM inventory 
    WHERE erp = p_erp_code AND pos = p_location LIMIT 1;

    -- Fallback for name/qty
    IF v_item_name IS NULL THEN
        SELECT name INTO v_item_name FROM inventory WHERE erp = p_erp_code LIMIT 1;
        v_system_qty := 0;
    END IF;

    -- If record_id is provided, update existing
    IF p_record_id IS NOT NULL THEN
        UPDATE audit_records SET
            actual_qty = p_actual_qty,
            location = p_location,
            note = p_note,
            auditor = p_auditor,
            user_email = p_user_email,
            system_qty = COALESCE(v_system_qty, 0)
        WHERE id = p_record_id;
    ELSE
        -- Check if there's already a draft record for this ERP/Location combo by this user
        -- (Optional: based on product requirement to avoid duplicates in Draft)
        INSERT INTO audit_records (
            erp_code, item_name, location, system_qty, actual_qty, note, auditor, user_email, status
        ) VALUES (
            p_erp_code, v_item_name, p_location, COALESCE(v_system_qty, 0), p_actual_qty, p_note, p_auditor, p_user_email, 'Draft'
        );
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. RPC: Approve Audit Record (Sync with Inventory)
CREATE OR REPLACE FUNCTION approve_audit_records(p_record_ids UUID[], p_approver_email TEXT)
RETURNS VOID AS $$
DECLARE
    r_record RECORD;
BEGIN
    FOR r_record IN SELECT * FROM audit_records WHERE id = ANY(p_record_ids) AND status = 'Pending' LOOP
        -- Update Inventory Stock
        -- Note: This is an UPSERT logic for the inventory
        INSERT INTO inventory (erp, name, pos, end_stock)
        VALUES (r_record.erp_code, r_record.item_name, r_record.location, r_record.actual_qty)
        ON CONFLICT (erp, pos) DO UPDATE SET
            end_stock = EXCLUDED.end_stock;

        -- Update Record Status
        UPDATE audit_records 
        SET 
            status = 'Approved',
            approver = p_approver_email,
            approved_at = NOW()
        WHERE id = r_record.id;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 4. RPC: Reject Audit Record
CREATE OR REPLACE FUNCTION reject_audit_records(p_record_ids UUID[], p_approver_email TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE audit_records 
    SET 
        status = 'Rejected',
        approver = p_approver_email,
        approved_at = NOW()
    WHERE id = ANY(p_record_ids) AND status = 'Pending';
END;
$$ LANGUAGE plpgsql;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_audit_records_status ON audit_records(status);
CREATE INDEX IF NOT EXISTS idx_audit_records_erp_loc ON audit_records(erp_code, location);
