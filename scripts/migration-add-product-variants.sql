-- Migration: Add Product Variants Column
-- Adds the variants column to products table for storing size/color options

-- Add variants column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;

-- Add index for JSONB queries on variants
CREATE INDEX IF NOT EXISTS idx_products_variants ON products USING GIN (variants);

-- Add execution_time_seconds column to product_scrape_logs if missing
ALTER TABLE product_scrape_logs
ADD COLUMN IF NOT EXISTS execution_time_seconds INTEGER,
ADD COLUMN IF NOT EXISTS apify_dataset_id TEXT;

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('variants', 'additional_images')
ORDER BY column_name;
