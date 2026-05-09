-- Nếu bạn muốn tính năng sửa (update) và xóa (delete) phiếu nhập tự động tính lại tồn kho (in_qty và end_stock), hãy chạy các lệnh SQL sau trong bảng SQL Editor của Supabase:

-- 1. Inventory Updates logic:
CREATE OR REPLACE FUNCTION update_inventory_on_movement_update()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_TABLE_NAME = 'inbound_records') THEN
    UPDATE inventory 
    SET 
      in_qty = in_qty - OLD.qty + NEW.qty,
      end_stock = end_stock - OLD.qty + NEW.qty
    WHERE erp = NEW.erp_code;
  ELSIF (TG_TABLE_NAME = 'outbound_records') THEN
    UPDATE inventory 
    SET 
      out_qty = out_qty - OLD.qty + NEW.qty,
      end_stock = end_stock + OLD.qty - NEW.qty
    WHERE erp = NEW.erp_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inventory_inbound_update ON inbound_records;
CREATE TRIGGER trg_update_inventory_inbound_update
AFTER UPDATE ON inbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement_update();

DROP TRIGGER IF EXISTS trg_update_inventory_outbound_update ON outbound_records;
CREATE TRIGGER trg_update_inventory_outbound_update
AFTER UPDATE ON outbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement_update();

CREATE OR REPLACE FUNCTION update_inventory_on_movement_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_TABLE_NAME = 'inbound_records') THEN
    UPDATE inventory 
    SET 
      in_qty = in_qty - OLD.qty,
      end_stock = end_stock - OLD.qty
    WHERE erp = OLD.erp_code;
  ELSIF (TG_TABLE_NAME = 'outbound_records') THEN
    UPDATE inventory 
    SET 
      out_qty = out_qty - OLD.qty,
      end_stock = end_stock + OLD.qty
    WHERE erp = OLD.erp_code;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_inventory_inbound_delete ON inbound_records;
CREATE TRIGGER trg_update_inventory_inbound_delete
AFTER DELETE ON inbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement_delete();

DROP TRIGGER IF EXISTS trg_update_inventory_outbound_delete ON outbound_records;
CREATE TRIGGER trg_update_inventory_outbound_delete
AFTER DELETE ON outbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement_delete();

-- 2. Audit & Deleted Items Table
CREATE TABLE IF NOT EXISTS deleted_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp TEXT NOT NULL,
  name TEXT NOT NULL,
  deleted_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- 3. Edit History Outbound Table
CREATE TABLE IF NOT EXISTS edit_history_outbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outbound_id TEXT NOT NULL,
  erp_code TEXT NOT NULL,
  partner TEXT NOT NULL,
  old_qty NUMERIC,
  new_qty NUMERIC,
  reason TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Edit History Inbound Table
CREATE TABLE IF NOT EXISTS edit_history_inbound (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT NOT NULL,
  erp_code TEXT NOT NULL,
  old_qty NUMERIC,
  new_qty NUMERIC,
  reason TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Edit History Inventory Table
CREATE TABLE IF NOT EXISTS edit_history_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp_code TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bật tính năng Real-time cho table edit_history_outbound, edit_history_inbound và edit_history_inventory
ALTER PUBLICATION supabase_realtime ADD TABLE edit_history_outbound;
ALTER PUBLICATION supabase_realtime ADD TABLE edit_history_inbound;
ALTER PUBLICATION supabase_realtime ADD TABLE edit_history_inventory;
