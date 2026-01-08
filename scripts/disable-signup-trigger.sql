-- Disable the problematic signup trigger
-- The app will handle profile creation instead
-- Run this in Supabase SQL Editor

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Verify trigger is gone
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
