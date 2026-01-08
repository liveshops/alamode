-- Migration: Not Interested Feature
-- This allows users to indicate products they're not interested in,
-- which will deprioritize similar products, brands, and categories in recommendations
-- Run this in Supabase SQL Editor

-- 1. Create user_not_interested table
CREATE TABLE IF NOT EXISTS public.user_not_interested (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- 2. Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_not_interested_user_id ON public.user_not_interested(user_id);
CREATE INDEX IF NOT EXISTS idx_not_interested_brand_id ON public.user_not_interested(user_id, brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_not_interested_category_id ON public.user_not_interested(user_id, category_id) WHERE category_id IS NOT NULL;

-- 3. Enable RLS
ALTER TABLE public.user_not_interested ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
CREATE POLICY "Users can view their own not interested items"
  ON public.user_not_interested FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own not interested items"
  ON public.user_not_interested FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own not interested items"
  ON public.user_not_interested FOR DELETE
  USING (auth.uid() = user_id);

-- 5. Function to mark a product as not interested (also captures brand and category)
CREATE OR REPLACE FUNCTION public.mark_not_interested(
  p_user_id UUID,
  p_product_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_brand_id UUID;
  v_category_id UUID;
BEGIN
  -- Get product's brand and category
  SELECT brand_id, category_id INTO v_brand_id, v_category_id
  FROM public.products
  WHERE id = p_product_id;

  -- Insert not interested record
  INSERT INTO public.user_not_interested (user_id, product_id, brand_id, category_id)
  VALUES (p_user_id, p_product_id, v_brand_id, v_category_id)
  ON CONFLICT (user_id, product_id) DO NOTHING;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 6. Function to get user's not interested preferences summary
-- Returns counts by brand and category for use in deprioritization
CREATE OR REPLACE FUNCTION public.get_not_interested_summary(p_user_id UUID)
RETURNS TABLE (
  brand_id UUID,
  brand_count BIGINT,
  category_id UUID,
  category_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH brand_counts AS (
    SELECT ni.brand_id, COUNT(*) as cnt
    FROM public.user_not_interested ni
    WHERE ni.user_id = p_user_id AND ni.brand_id IS NOT NULL
    GROUP BY ni.brand_id
  ),
  category_counts AS (
    SELECT ni.category_id, COUNT(*) as cnt
    FROM public.user_not_interested ni
    WHERE ni.user_id = p_user_id AND ni.category_id IS NOT NULL
    GROUP BY ni.category_id
  )
  SELECT 
    bc.brand_id,
    bc.cnt as brand_count,
    cc.category_id,
    cc.cnt as category_count
  FROM brand_counts bc
  FULL OUTER JOIN category_counts cc ON false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 7. View to easily check not interested product IDs for a user
CREATE OR REPLACE VIEW public.user_not_interested_products AS
SELECT user_id, product_id
FROM public.user_not_interested;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Not Interested feature tables and functions created successfully!';
END $$;
