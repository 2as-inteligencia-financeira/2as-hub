-- Rodar uma vez no SQL Editor do Supabase do hub (fxjrknvaqioabykebibi).
-- Remove acessos ao painel "aulas" e atualiza o CHECK para slugs atuais do hub.

delete from public.user_panels where panel = 'aulas';

alter table public.user_panels
  drop constraint if exists user_panels_panel_check;

alter table public.user_panels
  add constraint user_panels_panel_check
  check (panel in ('painel', 'financas', 'admissao', 'brand', 'direcao', 'cancelamentos', 'orcamento'));
