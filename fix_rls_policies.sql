-- Chạy đoạn mã này trong công cụ SQL Editor của Supabase để khắc phục lỗi RLS
-- Các lệnh này sẽ tạo Policy cho phép người dùng (cả authenticated và public) được quyền xem, thêm, sửa, xóa
-- Trong môi trường thực tế, bạn nên giới hạn quyền này bằng cách dùng `TO authenticated` hoặc kiểm tra quyền chi tiết.

DO $$
DECLARE
    table_name_var text;
    tables_list text[] := ARRAY[
        'inventory', 
        'shipments', 
        'movements', 
        'audit_records', 
        'outbound_records', 
        'inbound_records', 
        'profiles', 
        'app_settings',
        'deleted_items',
        'edit_history_outbound'
    ];
BEGIN
    FOREACH table_name_var IN ARRAY tables_list
    LOOP
        -- Enable RLS for table
        EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', table_name_var);

        -- Drop existing policies with these names to prevent conflict
        EXECUTE format('DROP POLICY IF EXISTS "Allow all on %s" ON %I', table_name_var, table_name_var);
        
        -- Create new policy (choosed to allow all for development ease, adjust to `TO authenticated` if needed)
        EXECUTE format('CREATE POLICY "Allow all on %s" ON %I FOR ALL USING (true)', table_name_var, table_name_var);
    END LOOP;
END $$;

