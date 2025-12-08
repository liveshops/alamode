-- Temporarily disable RLS on storage.objects for avatars bucket
-- This is for testing only - we'll re-enable it later with proper policies

-- First, drop all existing policies for avatars
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;

-- Create a simple permissive policy for avatars bucket (no restrictions)
CREATE POLICY "Public access to avatars bucket"
ON storage.objects
FOR ALL
TO public
USING (bucket_id = 'avatars')
WITH CHECK (bucket_id = 'avatars');
