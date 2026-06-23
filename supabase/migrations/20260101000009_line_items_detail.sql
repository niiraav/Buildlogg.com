-- Add optional detail column to line_items
-- This is sub-text shown under the item description on quotes (e.g. "Includes 2 hours fitting and waste removal")
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS detail text;
