-- ============================================================
--  Luniq Hub · RLS para Admin de Usuários
--  Rodar no SQL Editor do Supabase uma única vez
-- ============================================================

-- 1. Função auxiliar sem loop circular (SECURITY DEFINER bypassa RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Permissão de leitura: cada um vê o próprio perfil OU admin vê todos
DROP POLICY IF EXISTS "Leitura próprio perfil" ON public.profiles;
CREATE POLICY "Leitura próprio ou admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

-- 3. Update: cada um edita o próprio OU admin edita qualquer um
DROP POLICY IF EXISTS "Próprio usuário atualiza perfil" ON public.profiles;
CREATE POLICY "Update próprio ou admin" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- 4. Insert em profiles (admin cria perfil após signUp)
DROP POLICY IF EXISTS "Insert profile" ON public.profiles;
CREATE POLICY "Insert próprio ou admin" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR public.is_admin());

-- 5. user_panels: admin pode gerenciar todos
DROP POLICY IF EXISTS "Usuário vê próprios painéis" ON public.user_panels;
DROP POLICY IF EXISTS "Admin gerencia painéis" ON public.user_panels;

CREATE POLICY "Leitura painéis próprios ou admin" ON public.user_panels
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Insert painéis admin" ON public.user_panels
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "Delete painéis admin" ON public.user_panels
  FOR DELETE USING (public.is_admin());

-- Confirmar
SELECT 'RLS configurado com sucesso!' AS status;
