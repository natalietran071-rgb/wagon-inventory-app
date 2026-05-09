
-- Final Fix for Audit and Inventory Sync
-- 1. Ensure inventory supports multi-location unique records
DO $$
BEGIN
    -- Drop the restrictive erp unique constraint if it exists
    ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_erp_key;
    
    -- Ensure pos is never null to make unique constraint reliable
    UPDATE inventory SET pos = 'MAIN' WHERE pos IS NULL OR pos = '';
    ALTER TABLE inventory ALTER COLUMN pos SET DEFAULT 'MAIN';
    ALTER TABLE inventory ALTER COLUMN pos SET NOT NULL;

    -- Add composite unique constraint
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idx_inventory_erp_pos') THEN
        ALTER TABLE inventory ADD CONSTRAINT idx_inventory_erp_pos UNIQUE (erp, pos);
    END IF;
END $$;

-- 2. Update movement triggers to be location-aware
CREATE OR REPLACE FUNCTION update_inventory_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_TABLE_NAME = 'inbound_records') THEN
    INSERT INTO inventory (erp, name, pos, in_qty, end_stock)
    VALUES (NEW.erp_code, '', COALESCE(NEW.location, 'MAIN'), NEW.qty, NEW.qty)
    ON CONFLICT (erp, pos) DO UPDATE SET
      in_qty = inventory.in_qty + EXCLUDED.in_qty,
      end_stock = inventory.end_stock + EXCLUDED.in_qty;
  ELSIF (TG_TABLE_NAME = 'outbound_records') THEN
    UPDATE inventory 
    SET 
      out_qty = out_qty + NEW.qty,
      end_stock = end_stock - NEW.qty
    WHERE erp = NEW.erp_code AND pos = COALESCE(NEW.location, 'MAIN');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Fix Approve RPC to only update audit_records status
CREATE OR REPLACE FUNCTION approve_audit_records(p_record_ids UUID[], p_approver_email TEXT)
RETURNS JSONB AS $$
BEGIN
    UPDATE audit_records 
    SET 
        status = 'Approved',
        approver = p_approver_email,
        approved_at = NOW()
    WHERE id = ANY(p_record_ids) AND status = 'Pending';
    
    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 4. Fix Reject RPC (if needed, but undo is preferred now)
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

-- 5. Undo Audit Record RPC
CREATE OR REPLACE FUNCTION undo_audit_records(p_record_ids UUID[], p_approver_email TEXT)
RETURNS JSONB AS $$
BEGIN
    -- If it was Approved, move back to Pending
    -- If it was Pending, move back to Draft
    
    -- Case 1: Was Approved -> Pending
    UPDATE audit_records 
    SET 
        status = 'Pending',
        approver = NULL,
        approved_at = NULL
    WHERE id = ANY(p_record_ids) AND status = 'Approved';

    -- Case 2: Was Pending -> Draft
    UPDATE audit_records 
    SET 
        status = 'Draft',
        approver = NULL,
        approved_at = NULL
    WHERE id = ANY(p_record_ids) AND status = 'Pending';

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
