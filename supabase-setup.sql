-- 1. Create User Table (Public Profile)
CREATE TABLE IF NOT EXISTS public."User" (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  full_name TEXT,
  nome TEXT,
  display_name TEXT,
  username TEXT,
  nome_completo TEXT,
  is_approved INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user',
  accessible_modules TEXT[] DEFAULT ARRAY['cablefill', 'capitolato']
);

-- 2. Create Project Table
CREATE TABLE IF NOT EXISTS public."Project" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  structure TEXT NOT NULL,
  "projectCables" TEXT NOT NULL,
  "lastSaved" TEXT NOT NULL,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Project" ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for User Table
-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view own profile" ON public."User";
DROP POLICY IF EXISTS "Admins can view all profiles" ON public."User";
DROP POLICY IF EXISTS "Admins can update profiles" ON public."User";
DROP POLICY IF EXISTS "Admins can delete profiles" ON public."User";

-- Users can read their own profile
CREATE POLICY "Users can view own profile" 
ON public."User" FOR SELECT 
USING (auth.uid() = id);

-- Create a function to check if a user is an admin without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  _role TEXT;
BEGIN
  SELECT role INTO _role FROM public."User" WHERE id = auth.uid();
  RETURN _role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" 
ON public."User" FOR SELECT 
USING (public.is_admin());

-- Admins can update profiles (approve, change role)
CREATE POLICY "Admins can update profiles" 
ON public."User" FOR UPDATE 
USING (public.is_admin());

-- Admins can delete profiles
CREATE POLICY "Admins can delete profiles" 
ON public."User" FOR DELETE 
USING (public.is_admin());

-- 5. Create RLS Policies for Project Table
-- Users can do everything with their own projects
CREATE POLICY "Users can manage own projects" 
ON public."Project" FOR ALL 
USING (auth.uid() = "userId");

-- 6. Create Trigger to automatically create User profile on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public."User" (id, email, is_approved, role, name, full_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    0, -- 0 = pending approval
    CASE WHEN NEW.email = 'rafael123@cablefill.com' OR NEW.email = 'rafael@teste.com' OR NEW.email = 'rafael.azevedo.93@live.com' THEN 'admin' ELSE 'user' END,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to avoid errors on re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Sync existing users (if you already had users before creating this table)
INSERT INTO public."User" (id, email, is_approved, role, name, full_name)
SELECT 
  id, 
  email, 
  1, -- Automatically approve existing users
  CASE 
    WHEN email = 'rafael123@cablefill.com' OR email = 'rafael@teste.com' OR email = 'rafael.azevedo.93@live.com' THEN 'admin' 
    ELSE 'user' 
  END,
  COALESCE(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', email),
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email)
FROM auth.users
WHERE id NOT IN (SELECT id FROM public."User");

-- 8. Create Cable Table
CREATE TABLE IF NOT EXISTS public."Cable" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  size TEXT,
  type TEXT NOT NULL,
  diameter NUMERIC NOT NULL,
  weight NUMERIC,
  "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE,
  "INDICE" INTEGER DEFAULT 0
);

-- 9. Create Structure Table
CREATE TABLE IF NOT EXISTS public."Structure" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  width NUMERIC NOT NULL,
  height NUMERIC NOT NULL,
  "fillLimit" NUMERIC NOT NULL,
  "userId" UUID REFERENCES public."User"(id) ON DELETE CASCADE
);

-- 10. Enable RLS for Cable and Structure
ALTER TABLE public."Cable" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Structure" ENABLE ROW LEVEL SECURITY;

-- 11. RLS Policies for Cable
-- Users can manage their own cables
CREATE POLICY "Users can manage own cables" ON public."Cable" FOR ALL USING (auth.uid() = "userId");
-- Everyone can read cables (optional, if you want shared library)
-- CREATE POLICY "Everyone can read cables" ON public."Cable" FOR SELECT USING (true);

-- 12. RLS Policies for Structure
-- Users can manage their own structures
CREATE POLICY "Users can manage own structures" ON public."Structure" FOR ALL USING (auth.uid() = "userId");
