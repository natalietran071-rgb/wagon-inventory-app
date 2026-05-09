-- Update audit_records table with missing fields
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS approver TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS approver_email TEXT;
ALTER TABLE audit_records ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

-- Add index for performance on status and user_email
CREATE INDEX IF NOT EXISTS idx_audit_records_status ON audit_records(status);
CREATE INDEX IF NOT EXISTS idx_audit_records_user_email ON audit_records(user_email);
