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
        -- start_stock: stock BEFORE p_from_date
        (i.end_stock - COALESCE((SELECT sum(qty) FROM inbound_records WHERE erp_code = i.erp AND (p_from_date IS NULL OR date >= p_from_date)), 0) + COALESCE((SELECT sum(qty) FROM outbound_records WHERE erp_code = i.erp AND (p_from_date IS NULL OR date >= p_from_date)), 0))::bigint as start_stock,
        COALESCE(mi.total_in, 0)::bigint as in_period,
        COALESCE(mo.total_out, 0)::bigint as out_period,
        -- end_stock: stock at current time (because we are not filtering end_stock by p_to_date here to match the UI behavior usually, but if we wanted historical, it would be different. However, the requirement says "Export exactly what user is seeing")
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
