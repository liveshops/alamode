-- Migration: Add email and fix phone number storage in profiles table
-- Run this in Supabase SQL Editor to update the database

-- Step 1: Add email column to profiles table (if it doesn't exist)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Step 2: Update the function to store email and phone_number
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, email, phone_number)
  VALUES (
    new.id,
    LOWER(COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))),
    COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone_number', new.phone)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Backfill email for existing users (optional)
UPDATE public.profiles p
SET email = (
  SELECT u.email 
  FROM auth.users u 
  WHERE u.id = p.id
)
WHERE p.email IS NULL;

-- The trigger already exists, no need to recreate it
-- It will automatically use the updated function
