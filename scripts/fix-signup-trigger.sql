-- Fix for "Database error saving new user" signup issue
-- Run this in Supabase SQL Editor

-- Update the handle_new_user function to be more robust
-- Handles username conflicts by appending a random suffix
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  username_exists BOOLEAN;
  suffix INT := 0;
BEGIN
  -- Get the base username
  base_username := LOWER(COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  final_username := base_username;
  
  -- Check if username already exists and generate unique one if needed
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE username = final_username) INTO username_exists;
    EXIT WHEN NOT username_exists;
    suffix := suffix + 1;
    final_username := base_username || suffix::TEXT;
  END LOOP;
  
  -- Insert the profile
  INSERT INTO public.profiles (id, username, display_name, email, phone_number)
  VALUES (
    new.id,
    final_username,
    COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    COALESCE(new.raw_user_meta_data->>'phone_number', new.phone)
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name),
    phone_number = COALESCE(EXCLUDED.phone_number, profiles.phone_number);
  
  RETURN new;
EXCEPTION
  WHEN unique_violation THEN
    -- If there's still a unique violation (race condition), try with random suffix
    INSERT INTO public.profiles (id, username, display_name, email, phone_number)
    VALUES (
      new.id,
      base_username || '_' || substr(md5(random()::text), 1, 4),
      COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email,
      COALESCE(new.raw_user_meta_data->>'phone_number', new.phone)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also fix any orphaned auth users (users without profiles)
-- This creates profiles for any auth users that don't have one
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
