-- 1. Add required_date to outbound_records
ALTER TABLE outbound_records ADD COLUMN IF NOT EXISTS required_date DATE;

-- 2. Update trigger to only deduct stock when status is 'Đã Xuất'
CREATE OR REPLACE FUNCTION update_inventory_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_TABLE_NAME = 'inbound_records') THEN
    IF (TG_OP = 'INSERT') THEN
      UPDATE inventory 
      SET 
        in_qty = in_qty + NEW.qty,
        end_stock = end_stock + NEW.qty
      WHERE erp = NEW.erp_code;
    END IF;
  ELSIF (TG_TABLE_NAME = 'outbound_records') THEN
    IF (TG_OP = 'INSERT' AND NEW.status = 'Đã Xuất') THEN
      UPDATE inventory 
      SET 
        out_qty = out_qty + NEW.qty,
        end_stock = end_stock - NEW.qty
      WHERE erp = NEW.erp_code;
    ELSIF (TG_OP = 'UPDATE' AND OLD.status != 'Đã Xuất' AND NEW.status = 'Đã Xuất') THEN
      UPDATE inventory 
      SET 
        out_qty = out_qty + NEW.qty,
        end_stock = end_stock - NEW.qty
      WHERE erp = NEW.erp_code;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Recreate trigger to fire on UPDATE as well
DROP TRIGGER IF EXISTS trg_update_inventory_outbound ON outbound_records;
CREATE TRIGGER trg_update_inventory_outbound
AFTER INSERT OR UPDATE ON outbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement();
