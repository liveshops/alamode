-- Fix signup RLS issue - Add missing INSERT policy for profiles
-- Run this in Supabase SQL Editor

-- Add INSERT policy for profiles (triggered by auth signup)
-- The trigger function has SECURITY DEFINER but this ensures it works
DROP POLICY IF EXISTS "Enable insert for service role" ON profiles;
CREATE POLICY "Enable insert for service role" ON profiles
  FOR INSERT WITH CHECK (true);

-- Also allow users to insert their own profile (backup)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Check for orphaned auth users (users without profiles) and list them
SELECT 
  au.id,
  au.email,
  au.created_at,
  au.raw_user_meta_data->>'username' as attempted_username
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- Create profiles for orphaned users
INSERT INTO public.profiles (id, username, display_name, email)
SELECT 
  au.id,
  LOWER(COALESCE(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1))) || '_' || substr(md5(au.id::text), 1, 4),
  COALESCE(au.raw_user_meta_data->>'display_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
  au.email
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
