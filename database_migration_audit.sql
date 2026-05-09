-- Chạy các lệnh SQL này trong công cụ SQL Editor của Supabase để cập nhật cấu trúc Database

-- 1. Thêm cột 'user_email' để lưu email của người dùng thực hiện kiểm kê thực tế
ALTER TABLE "public"."audit_records"
ADD COLUMN IF NOT EXISTS "user_email" text;

-- 2. Thêm cột 'adjustment_reason' để lưu lý do điều chỉnh khi có sai lệch
ALTER TABLE "public"."audit_records"
ADD COLUMN IF NOT EXISTS "adjustment_reason" text;

-- 3. Đánh index để hỗ trợ truy vấn các tác vụ xử lý đồng thời dựa trên ERP và Location nhanh hơn
CREATE INDEX IF NOT EXISTS "idx_audit_records_erp_location_status" ON "public"."audit_records" ("erp_code", "location", "status");
