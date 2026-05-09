-- Supabase SQL Schema for Inventory Hub Warehouse Management
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Inventory Table
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_zh TEXT,
  category TEXT,
  description TEXT,
  spec TEXT,
  unit TEXT,
  pos TEXT,
  start_stock INTEGER DEFAULT 0,
  in_qty INTEGER DEFAULT 0,
  out_qty INTEGER DEFAULT 0,
  end_stock INTEGER DEFAULT 0,
  price NUMERIC DEFAULT 0,
  critical BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Shipments Table
CREATE TABLE shipments (
  id TEXT PRIMARY KEY, -- Using custom ID like SHP-2024-001
  partner TEXT NOT NULL,
  items_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'In-Transit',
  expected_date DATE,
  received BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Movements Table (for Dashboard)
CREATE TABLE movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT CHECK (type IN ('IN', 'OUT')),
  item_name TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  user_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Audit Table
CREATE TABLE audit_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  location TEXT,
  system_qty NUMERIC,
  actual_qty NUMERIC,
  difference NUMERIC,
  auditor TEXT,
  status TEXT DEFAULT 'Draft', -- Draft, Approved
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Outbound Table
CREATE TABLE outbound_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  outbound_id TEXT NOT NULL, -- Custom ID like OUT-2023-8821
  erp_code TEXT NOT NULL,
  partner TEXT NOT NULL,
  location TEXT,
  initials TEXT,
  qty NUMERIC NOT NULL,
  status TEXT DEFAULT 'Chờ Duyệt',
  status_color TEXT,
  dot_color TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Inbound Table
CREATE TABLE inbound_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id TEXT NOT NULL,
  erp_code TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  unit TEXT,
  location TEXT,
  status TEXT DEFAULT 'Stocked',
  date DATE DEFAULT CURRENT_DATE,
  time TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Profiles Table (User Roles)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7.1 Admin Functions (RPCs)
-- Function to get all users including auth information
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    username TEXT,
    full_name TEXT,
    role TEXT,
    is_active BOOLEAN,
    last_sign_in_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
) 
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin') THEN
        RAISE EXCEPTION 'Only admins can perform this action';
    END IF;

    RETURN QUERY
    SELECT 
        u.id, 
        u.email::TEXT, 
        p.username, 
        p.full_name, 
        p.role, 
        p.is_active, 
        u.last_sign_in_at, 
        p.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON u.id = p.id;
END;
$$ LANGUAGE plpgsql;

-- Function to create a user (Admin only)
CREATE OR REPLACE FUNCTION admin_create_user(
    p_email TEXT,
    p_password TEXT,
    p_username TEXT,
    p_full_name TEXT,
    p_role TEXT
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    new_user_id UUID;
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN json_build_object('status', 'error', 'error', 'Only admins can create users');
    END IF;

    -- Create user in auth.users
    INSERT INTO auth.users (email, password, email_confirmed_at, raw_user_meta_data)
    VALUES (p_email, crypt(p_password, gen_salt('bf')), now(), json_build_object('full_name', p_full_name))
    RETURNING id INTO new_user_id;

    -- Profile is usually created by a trigger on auth.users, 
    -- but we can manually update it here to ensure role/username are set
    UPDATE public.profiles 
    SET 
        username = p_username,
        full_name = p_full_name,
        role = p_role
    WHERE id = new_user_id;

    RETURN json_build_object('status', 'success', 'user_id', new_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('status', 'error', 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to update a user (Admin only)
CREATE OR REPLACE FUNCTION admin_update_user(
    p_user_id UUID,
    p_email TEXT,
    p_username TEXT,
    p_full_name TEXT,
    p_role TEXT,
    p_is_active BOOLEAN,
    p_password TEXT DEFAULT NULL
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN json_build_object('status', 'error', 'error', 'Only admins can update users');
    END IF;

    -- Update auth.users email
    UPDATE auth.users SET email = p_email WHERE id = p_user_id;

    -- Update password if provided
    IF p_password IS NOT NULL AND p_password <> '' THEN
        UPDATE auth.users SET password = crypt(p_password, gen_salt('bf')) WHERE id = p_user_id;
    END IF;

    -- Update profile
    UPDATE public.profiles
    SET 
        username = p_username,
        full_name = p_full_name,
        role = p_role,
        is_active = p_is_active,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN json_build_object('status', 'success');
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('status', 'error', 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to update password (Admin only)
CREATE OR REPLACE FUNCTION admin_update_password(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS JSON
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN json_build_object('status', 'error', 'error', 'Only admins can update passwords');
    END IF;

    UPDATE auth.users 
    SET password = crypt(p_new_password, gen_salt('bf'))
    WHERE id = p_user_id;

    RETURN json_build_object('status', 'success');
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('status', 'error', 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- Function to delete user (Admin only)
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id UUID)
RETURNS JSON
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN json_build_object('status', 'error', 'error', 'Only admins can delete users');
    END IF;

    -- Auth user deletion cascades to profile thanks to REFERENCES ON DELETE CASCADE
    DELETE FROM auth.users WHERE id = p_user_id;

    RETURN json_build_object('status', 'success');
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('status', 'error', 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- 8. App Settings Table
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_name TEXT DEFAULT 'Cong ty Wagon - Inventory Hub',
  warehouse_id TEXT DEFAULT 'WGN-HUB-001',
  location TEXT DEFAULT 'Binh Duong Industrial Park, Vietnam',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8.1 Inventory History and Deleted Items
CREATE TABLE edit_history_inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp_code TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  edited_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE deleted_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  erp TEXT NOT NULL,
  name TEXT NOT NULL,
  reason TEXT,
  deleted_by TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8.2 Inventory RPCs
CREATE OR REPLACE FUNCTION get_inventory_stats_by_date(
    p_from_date date DEFAULT NULL, 
    p_to_date date DEFAULT NULL,
    p_search text DEFAULT '',
    p_category text DEFAULT 'All',
    p_location text DEFAULT 'All'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tong_sku bigint;
    v_sku_co_nhap bigint;
    v_tong_nhap numeric;
    v_tong_xuat numeric;
    v_tong_ton numeric;
BEGIN
    -- Total SKU and Total Stock calculated based on filtered inventory
    SELECT count(*), COALESCE(sum(end_stock), 0)
    INTO v_tong_sku, v_tong_ton
    FROM inventory
    WHERE (p_search = '' OR (erp ILIKE '%' || p_search || '%' OR name ILIKE '%' || p_search || '%'))
      AND (p_category = 'All' OR category = p_category)
      AND (p_location = 'All' OR pos ILIKE p_location || '%');

    -- SKU with movement in date range (and filters)
    SELECT count(DISTINCT erp_code) INTO v_sku_co_nhap 
    FROM (
        SELECT erp_code FROM inbound_records WHERE (p_from_date IS NULL OR date >= p_from_date) AND (p_to_date IS NULL OR date <= p_to_date)
        UNION
        SELECT erp_code FROM outbound_records WHERE (p_from_date IS NULL OR date >= p_from_date) AND (p_to_date IS NULL OR date <= p_to_date)
    ) as movements
    WHERE erp_code IN (
        SELECT erp FROM inventory 
        WHERE (p_search = '' OR (erp ILIKE '%' || p_search || '%' OR name ILIKE '%' || p_search || '%'))
          AND (p_category = 'All' OR category = p_category)
          AND (p_location = 'All' OR pos ILIKE p_location || '%')
    );

    -- Total Inbound Qty (filtered)
    SELECT COALESCE(sum(qty), 0) INTO v_tong_nhap 
    FROM inbound_records 
    WHERE (p_from_date IS NULL OR date >= p_from_date) 
      AND (p_to_date IS NULL OR date <= p_to_date)
      AND erp_code IN (
        SELECT erp FROM inventory 
        WHERE (p_search = '' OR (erp ILIKE '%' || p_search || '%' OR name ILIKE '%' || p_search || '%'))
          AND (p_category = 'All' OR category = p_category)
          AND (p_location = 'All' OR pos ILIKE p_location || '%')
      );

    -- Total Outbound Qty (filtered)
    SELECT COALESCE(sum(qty), 0) INTO v_tong_xuat 
    FROM outbound_records 
    WHERE (p_from_date IS NULL OR date >= p_from_date) 
      AND (p_to_date IS NULL OR date <= p_to_date)
      AND erp_code IN (
        SELECT erp FROM inventory 
        WHERE (p_search = '' OR (erp ILIKE '%' || p_search || '%' OR name ILIKE '%' || p_search || '%'))
          AND (p_category = 'All' OR category = p_category)
          AND (p_location = 'All' OR pos ILIKE p_location || '%')
      );

    RETURN json_build_object(
        'tong_sku', v_tong_sku,
        'sku_co_nhap', v_sku_co_nhap,
        'tong_nhap', v_tong_nhap,
        'tong_xuat', v_tong_xuat,
        'tong_ton', v_tong_ton,
        'generated_at', now()
    );
END;
$$;

-- Function to get detailed item history (Consolidated In/Out)
CREATE OR REPLACE FUNCTION get_item_history(
    p_erp text,
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL,
    p_type text DEFAULT 'all'
)
RETURNS TABLE (
    loai text,
    ma_phieu text,
    ngay date,
    so_luong numeric,
    don_vi text,
    vi_tri text,
    trang_thai text,
    doi_tac text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM (
        -- Inbound Records
        SELECT 
            'Nhập'::text as loai,
            i.order_id as ma_phieu,
            i.date as ngay,
            i.qty as so_luong,
            i.unit as don_vi,
            i.location as vi_tri,
            i.status as trang_thai,
            '-'::text as doi_tac,
            i.created_at
        FROM inbound_records i
        WHERE i.erp_code = p_erp
          AND (p_type = 'all' OR p_type = 'inbound')
          AND (p_from_date IS NULL OR i.date >= p_from_date)
          AND (p_to_date IS NULL OR i.date <= p_to_date)
        
        UNION ALL
        
        -- Outbound Records
        SELECT 
            'Xuất'::text as loai,
            o.outbound_id as ma_phieu,
            o.date as ngay,
            o.qty as so_luong,
            inv.unit as don_vi,
            o.location as vi_tri,
            o.status as trang_thai,
            o.partner as doi_tac,
            o.created_at
        FROM outbound_records o
        LEFT JOIN inventory inv ON o.erp_code = inv.erp
        WHERE o.erp_code = p_erp
          AND (p_type = 'all' OR p_type = 'outbound')
          AND (p_from_date IS NULL OR o.date >= p_from_date)
          AND (p_to_date IS NULL OR o.date <= p_to_date)
    ) as history
    ORDER BY ngay DESC, created_at DESC;
END;
$$;

-- Function to get unique location prefixes
CREATE OR REPLACE FUNCTION get_location_list()
RETURNS TABLE (location_prefix text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT 
        trim(split_part(pos, '-', 1))
    FROM inventory
    WHERE pos IS NOT NULL AND pos <> ''
    ORDER BY 1;
END;
$$;

-- Function to cleanup old history (Admin only)
CREATE OR REPLACE FUNCTION cleanup_old_history()
RETURNS JSON
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    deleted_history_count INTEGER;
    deleted_items_count INTEGER;
BEGIN
    -- Check if caller is admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
        RETURN json_build_object('status', 'error', 'error', 'Only admins can perform history cleanup');
    END IF;

    -- Delete from edit_history_inventory older than 30 days
    DELETE FROM public.edit_history_inventory
    WHERE created_at < NOW() - INTERVAL '30 days'
    RETURNING count(*) INTO deleted_history_count;

    -- Delete from deleted_items older than 30 days
    DELETE FROM public.deleted_items
    WHERE deleted_at < NOW() - INTERVAL '30 days'
    RETURNING count(*) INTO deleted_items_count;

    RETURN json_build_object(
        'status', 'success', 
        'deleted_history', COALESCE(deleted_history_count, 0),
        'deleted_items', COALESCE(deleted_items_count, 0)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('status', 'error', 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_inventory_by_date(
    p_from_date date, 
    p_to_date date, 
    p_search text DEFAULT '', 
    p_location text DEFAULT '', 
    p_limit int DEFAULT 50, 
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    erp text,
    name text,
    name_zh text,
    spec text,
    category text,
    unit text,
    pos text,
    min_stock int,
    critical boolean,
    start_stock bigint,
    in_period bigint,
    out_period bigint,
    end_stock bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH movements_in AS (
        SELECT ir.erp_code, sum(ir.qty) as total_in
        FROM inbound_records ir
        WHERE (p_from_date IS NULL OR ir.date >= p_from_date)
          AND (p_to_date IS NULL OR ir.date <= p_to_date)
        GROUP BY ir.erp_code
    ),
    movements_out AS (
        SELECT orr.erp_code, sum(orr.qty) as total_out
        FROM outbound_records orr
        WHERE (p_from_date IS NULL OR orr.date >= p_from_date)
          AND (p_to_date IS NULL OR orr.date <= p_to_date)
        GROUP BY orr.erp_code
    ),
    target_skus AS (
        SELECT DISTINCT erp_code FROM movements_in
        UNION
        SELECT DISTINCT erp_code FROM movements_out
    )
    SELECT 
        i.erp,
        i.name,
        i.name_zh,
        i.spec,
        i.category,
        i.unit,
        i.pos,
        COALESCE(i.min_stock, 0) as min_stock,
        i.critical,
        -- start_stock: stock strictly BEFORE p_from_date
        (i.end_stock - COALESCE((SELECT sum(qty) FROM inbound_records WHERE erp_code = i.erp AND date >= p_from_date), 0) + COALESCE((SELECT sum(qty) FROM outbound_records WHERE erp_code = i.erp AND date >= p_from_date), 0))::bigint as start_stock,
        COALESCE(mi.total_in, 0)::bigint as in_period,
        COALESCE(mo.total_out, 0)::bigint as out_period,
        -- end_stock: stock at the end of p_to_date
        (i.end_stock - COALESCE((SELECT sum(qty) FROM inbound_records WHERE erp_code = i.erp AND date > p_to_date), 0) + COALESCE((SELECT sum(qty) FROM outbound_records WHERE erp_code = i.erp AND date > p_to_date), 0))::bigint as end_stock
    FROM inventory i
    JOIN target_skus ts ON i.erp = ts.erp_code
    LEFT JOIN movements_in mi ON i.erp = mi.erp_code
    LEFT JOIN movements_out mo ON i.erp = mo.erp_code
    WHERE (p_search = '' OR i.erp ILIKE '%' || p_search || '%' OR i.name ILIKE '%' || p_search || '%')
      AND (p_location = '' OR i.pos ILIKE p_location || '%')
    ORDER BY i.erp ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Initial Settings
INSERT INTO app_settings (warehouse_name, warehouse_id, location)
VALUES ('Cong ty Wagon - Inventory Hub', 'WGN-HUB-001', 'Binh Duong Industrial Park, Vietnam')
ON CONFLICT DO NOTHING;

-- 9. Automatic Inventory Update Function
CREATE OR REPLACE FUNCTION update_inventory_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_TABLE_NAME = 'inbound_records') THEN
    UPDATE inventory 
    SET 
      in_qty = in_qty + NEW.qty,
      end_stock = end_stock + NEW.qty
    WHERE erp = NEW.erp_code;
  ELSIF (TG_TABLE_NAME = 'outbound_records') THEN
    UPDATE inventory 
    SET 
      out_qty = out_qty + NEW.qty,
      end_stock = end_stock - NEW.qty
    WHERE erp = NEW.erp_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 10. Triggers
CREATE TRIGGER trg_update_inventory_inbound
AFTER INSERT ON inbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement();

CREATE TRIGGER trg_update_inventory_outbound
AFTER INSERT ON outbound_records
FOR EACH ROW EXECUTE FUNCTION update_inventory_on_movement();

-- 11. Seed Data (Optional - Example items)
INSERT INTO inventory (erp, name, category, unit, pos, start_stock, end_stock, price)
VALUES 
('MTL-882-BLUE', 'Thép Tấm SS400', 'Metal', 'Pcs', 'Zone A-04', 100, 100, 1500000),
('PRT-112-GEN', 'Bulong M12 x 50', 'Parts', 'Box', 'Zone C-11', 2000, 2000, 5000),
('SKU-29384-A', 'Động Cơ Diesel D24', 'Engine', 'Pcs', 'Zone B-01', 10, 10, 45000000)
ON CONFLICT (erp) DO NOTHING;

-- Enable Real-time for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE shipments;
ALTER PUBLICATION supabase_realtime ADD TABLE movements;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_records;
ALTER PUBLICATION supabase_realtime ADD TABLE outbound_records;
ALTER PUBLICATION supabase_realtime ADD TABLE inbound_records;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;

-- RPC for Inventory Export
CREATE OR REPLACE FUNCTION export_inventory(
    p_search text DEFAULT '',
    p_location text DEFAULT '',
    p_category text DEFAULT 'All',
    p_filter text DEFAULT 'all',
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL
)
RETURNS TABLE (
    erp text,
    name text,
    name_zh text,
    spec text,
    category text,
    unit text,
    pos text,
    min_stock int,
    critical boolean,
    start_stock bigint,
    in_period bigint,
    out_period bigint,
    end_stock bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH movements_in AS (
        SELECT ir.erp_code, sum(ir.qty) as total_in
        FROM inbound_records ir
        WHERE (p_from_date IS NULL OR ir.date >= p_from_date)
          AND (p_to_date IS NULL OR ir.date <= p_to_date)
        GROUP BY ir.erp_code
    ),
    movements_out AS (
        SELECT orr.erp_code, sum(orr.qty) as total_out
        FROM outbound_records orr
        WHERE (p_from_date IS NULL OR orr.date >= p_from_date)
          AND (p_to_date IS NULL OR orr.date <= p_to_date)
        GROUP BY orr.erp_code
    )
    SELECT 
        i.erp,
        i.name,
        i.name_zh,
        i.spec,
        i.category,
        i.unit,
        i.pos,
        i.min_stock,
        i.critical,
        (i.end_stock - COALESCE((SELECT sum(qty) FROM inbound_records WHERE erp_code = i.erp AND (p_from_date IS NULL OR date >= p_from_date)), 0) + COALESCE((SELECT sum(qty) FROM outbound_records WHERE erp_code = i.erp AND (p_from_date IS NULL OR date >= p_from_date)), 0))::bigint as start_stock,
        COALESCE(mi.total_in, 0)::bigint as in_period,
        COALESCE(mo.total_out, 0)::bigint as out_period,
        i.end_stock::bigint
    FROM inventory i
    LEFT JOIN movements_in mi ON i.erp = mi.erp_code
    LEFT JOIN movements_out mo ON i.erp = mo.erp_code
    WHERE (p_search = '' OR (i.erp ILIKE '%' || p_search || '%' OR i.name ILIKE '%' || p_search || '%'))
      AND (p_category = 'All' OR i.category = p_category)
      AND (p_location = '' OR i.pos ILIKE p_location || '%')
      AND (
          CASE p_filter
              WHEN 'negative' THEN i.end_stock < 0
              WHEN 'critical' THEN i.critical = true
              WHEN 'missing' THEN (i.name IS NULL OR i.name = '')
              ELSE true
          END
      )
    ORDER BY i.erp ASC;
END;
$$;

-- RPC for Inbound Export
CREATE OR REPLACE FUNCTION export_inbound(
    p_search text DEFAULT '',
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    order_id text,
    erp_code text,
    qty numeric,
    unit text,
    location text,
    status text,
    date date,
    time text,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM inbound_records
    WHERE (p_search = '' OR (order_id ILIKE '%' || p_search || '%' OR erp_code ILIKE '%' || p_search || '%' OR location ILIKE '%' || p_search || '%'))
      AND (p_from_date IS NULL OR date >= p_from_date)
      AND (p_to_date IS NULL OR date <= p_to_date)
    ORDER BY date DESC, created_at DESC;
END;
$$;

-- RPC for Outbound Export
CREATE OR REPLACE FUNCTION export_outbound(
    p_search text DEFAULT '',
    p_status text DEFAULT 'all',
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    outbound_id text,
    erp_code text,
    partner text,
    location text,
    initials text,
    qty numeric,
    status text,
    status_color text,
    dot_color text,
    date date,
    required_date date,
    created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM outbound_records
    WHERE (p_search = '' OR (outbound_id ILIKE '%' || p_search || '%' OR erp_code ILIKE '%' || p_search || '%' OR partner ILIKE '%' || p_search || '%'))
      AND (p_status = 'all' OR status = p_status)
      AND (p_from_date IS NULL OR date >= p_from_date)
      AND (p_to_date IS NULL OR date <= p_to_date)
    ORDER BY date DESC, created_at DESC;
END;
$$;

-- RPC for Audit Export
CREATE OR REPLACE FUNCTION export_audit(
    p_search text DEFAULT '',
    p_status text DEFAULT 'all',
    p_from_date date DEFAULT NULL,
    p_to_date date DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    erp_code text,
    item_name text,
    location text,
    system_qty numeric,
    actual_qty numeric,
    difference numeric,
    auditor text,
    approver text,
    status text,
    note text,
    adjustment_reason text,
    session_id uuid,
    created_at timestamptz,
    approved_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ar.id,
        ar.erp_code,
        ar.item_name,
        ar.location,
        ar.system_qty,
        ar.actual_qty,
        ar.difference,
        ar.auditor,
        ar.approver,
        ar.status,
        ar.note,
        ar.adjustment_reason,
        ar.session_id,
        ar.created_at,
        ar.approved_at
    FROM audit_records ar
    WHERE (p_search = '' OR (ar.erp_code ILIKE '%' || p_search || '%' OR ar.item_name ILIKE '%' || p_search || '%' OR ar.location ILIKE '%' || p_search || '%'))
      AND (p_status = 'all' OR ar.status = p_status)
      AND (p_from_date IS NULL OR (ar.approved_at::date >= p_from_date OR ar.created_at::date >= p_from_date))
      AND (p_to_date IS NULL OR (ar.approved_at::date <= p_to_date OR ar.created_at::date <= p_to_date))
    ORDER BY ar.created_at DESC;
END;
$$;
