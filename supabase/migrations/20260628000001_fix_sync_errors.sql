-- Fix 1: message_templates CHECK constraint — add 'receipt' and 'update' categories
ALTER TABLE message_templates DROP CONSTRAINT IF EXISTS message_templates_category_check;
ALTER TABLE message_templates ADD CONSTRAINT message_templates_category_check 
  CHECK (category IN ('booking', 'reminder', 'invoice', 'follow_up', 'review', 'receipt', 'update', 'custom'));

-- Fix 2: custom_items policy — drop existing before recreating (idempotent)
DROP POLICY IF EXISTS "custom_items_owner" ON custom_items;
CREATE POLICY custom_items_owner ON custom_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
