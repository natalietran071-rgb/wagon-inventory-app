-- SQL Script to create necessary functions for User Management in Supabase
-- Run this in the SQL Editor of your Supabase project.

-- 1. Function to get all users (auth.users joined with public.profiles)
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  full_name TEXT,
  role TEXT,
  is_active BOOLEAN,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id, 
    u.email::TEXT, 
    p.username, 
    p.full_name, 
    p.role, 
    p.is_active, 
    u.last_sign_in_at, 
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON u.id = p.id
  ORDER BY u.created_at DESC;
END;
$$;

-- 2. Function to create a user (Admin only)
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_username TEXT,
  p_full_name TEXT,
  p_role TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
BEGIN
  -- Create user in auth.users
  INSERT INTO auth.users (email, password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, instance_id)
  VALUES (
    p_email, 
    crypt(p_password, gen_salt('bf')), 
    now(), 
    '{"provider":"email","providers":["email"]}', 
    jsonb_build_object('full_name', p_full_name), 
    now(), 
    now(), 
    'authenticated', 
    '00000000-0000-0000-0000-000000000000'
  )
  RETURNING id INTO new_user_id;

  -- Create profile in public.profiles
  -- Assuming public.profiles table exists and has these columns
  INSERT INTO public.profiles (id, username, full_name, role, is_active, email)
  VALUES (new_user_id, p_username, p_full_name, p_role, true, p_email);

  RETURN json_build_object('id', new_user_id, 'status', 'success');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'status', 'error');
END;
$$;

-- 3. Function to update user password
CREATE OR REPLACE FUNCTION admin_update_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('status', 'success');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'status', 'error');
END;
$$;

-- 4. Function to update user profile
CREATE OR REPLACE FUNCTION admin_update_user(
  p_user_id UUID,
  p_role TEXT,
  p_full_name TEXT,
  p_is_active BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET role = p_role,
      full_name = p_full_name,
      is_active = p_is_active,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN json_build_object('status', 'success');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'status', 'error');
END;
$$;

-- 5. Function to delete user
CREATE OR REPLACE FUNCTION admin_delete_user(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Profile is usually deleted via CASCADE or manually
  DELETE FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN json_build_object('status', 'success');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM, 'status', 'error');
END;
$$;
