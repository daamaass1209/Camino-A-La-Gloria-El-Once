-- =====================================================
-- FÚTBOL MANAGER - Esquema Supabase adaptado al script.js
-- Guárdalo en: supabase/migrations/20261027172800_futbol_manager.sql
-- Sustituye a los archivos anteriores (init_juego y modo_carrera).
-- =====================================================

-- (Solo si ya ejecutaste el archivo anterior "modo_carrera", quita los
--  dos guiones de estas líneas para borrar sus tablas de prueba)
-- drop view  if exists public.standings;
-- drop function if exists public.start_career(text, text, int);
-- drop table if exists public.transfers, public.fixtures, public.career_players,
--                      public.careers, public.players, public.teams cascade;

-- 1) PERFILES -----------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 20),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 6))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) PARTIDAS GUARDADAS ---------------------------------------------------
-- Equivale al objeto S de script.js (menos tab, fx y teams, que van aparte)
create table public.saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  league_index smallint not null check (league_index >= 0),   -- S.li
  my_team_idx  smallint not null check (my_team_idx  >= 0),   -- S.me
  matchday     int      not null default 0 check (matchday >= 0), -- S.J
  season       int      not null default 1 check (season >= 1),   -- S.season
  budget       numeric(8,1) not null default 15,               -- S.budget (en M)
  last_result  text not null default '',                       -- S.last
  champions    text[] not null default '{}',                   -- S.champs
  market       jsonb not null default '[]'::jsonb,             -- S.market (8 jugadores)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index saves_user_idx on public.saves (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger saves_updated_at
  before update on public.saves
  for each row execute function public.set_updated_at();

-- 3) EQUIPOS DE CADA PARTIDA ---------------------------------------------------
create table public.save_teams (
  id bigint generated always as identity primary key,
  save_id uuid not null references public.saves(id) on delete cascade,
  idx smallint not null,                       -- posición en S.teams (0..7)
  name text not null,                          -- n
  played int not null default 0,               -- pj
  goals_for int not null default 0,            -- gf
  goals_against int not null default 0,        -- gc
  points int not null default 0,               -- pts
  unique (save_id, idx)
);

-- 4) JUGADORES DE CADA EQUIPO -----------------------------------------------------
create table public.save_players (
  id bigint generated always as identity primary key,
  save_id uuid not null references public.saves(id) on delete cascade,
  team_id bigint not null references public.save_teams(id) on delete cascade,
  slot smallint not null,                      -- orden dentro de sq (lo usa el JS por índice)
  pos text not null check (pos in ('POR','DEF','MED','DEL')),
  name text not null,                          -- n
  overall smallint not null check (overall between 40 and 95)  -- o
);

create index save_teams_save_idx   on public.save_teams (save_id);
create index save_players_team_idx on public.save_players (team_id);
create index save_players_save_idx on public.save_players (save_id);

-- 5) FUNCIÓN: GUARDAR PARTIDA ------------------------------------------------------
-- Recibe el estado S de JavaScript (como JSON) y lo guarda en las tablas.
-- Sin p_save_id crea una partida nueva; con p_save_id actualiza esa partida.
create or replace function public.save_game(p_state jsonb, p_save_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := p_save_id;
  v_team record;
  v_team_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para guardar en la nube';
  end if;

  if v_id is null then
    insert into public.saves
      (user_id, league_index, my_team_idx, matchday, season, budget, last_result, champions, market)
    values (
      auth.uid(),
      (p_state->>'li')::int,
      (p_state->>'me')::int,
      (p_state->>'J')::int,
      (p_state->>'season')::int,
      (p_state->>'budget')::numeric,
      coalesce(p_state->>'last', ''),
      array(select jsonb_array_elements_text(p_state->'champs')),
      coalesce(p_state->'market', '[]'::jsonb)
    )
    returning id into v_id;
  else
    update public.saves set
      league_index = (p_state->>'li')::int,
      my_team_idx  = (p_state->>'me')::int,
      matchday     = (p_state->>'J')::int,
      season       = (p_state->>'season')::int,
      budget       = (p_state->>'budget')::numeric,
      last_result  = coalesce(p_state->>'last', ''),
      champions    = array(select jsonb_array_elements_text(p_state->'champs')),
      market       = coalesce(p_state->'market', '[]'::jsonb)
    where id = v_id and user_id = auth.uid();

    if not found then
      raise exception 'Partida no encontrada';
    end if;

    -- Se borran los equipos (y sus jugadores en cascada) y se vuelven a insertar
    delete from public.save_teams where save_id = v_id;
  end if;

  for v_team in
    select t.value as team, (t.ord - 1)::int as idx
    from jsonb_array_elements(p_state->'teams') with ordinality as t(value, ord)
  loop
    insert into public.save_teams (save_id, idx, name, played, goals_for, goals_against, points)
    values (
      v_id,
      v_team.idx,
      v_team.team->>'n',
      (v_team.team->>'pj')::int,
      (v_team.team->>'gf')::int,
      (v_team.team->>'gc')::int,
      (v_team.team->>'pts')::int
    )
    returning id into v_team_id;

    insert into public.save_players (save_id, team_id, slot, pos, name, overall)
    select v_id, v_team_id, (p.ord - 1)::int, p.value->>'pos', p.value->>'n', (p.value->>'o')::int
    from jsonb_array_elements(v_team.team->'sq') with ordinality as p(value, ord);
  end loop;

  return v_id;
end;
$$;

-- 6) FUNCIÓN: CARGAR PARTIDA ------------------------------------------------------
-- Devuelve un JSON con la misma forma que el objeto S de script.js
create or replace function public.load_game(p_save_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'li',     s.league_index,
    'me',     s.my_team_idx,
    'J',      s.matchday,
    'season', s.season,
    'budget', s.budget,
    'last',   s.last_result,
    'champs', to_jsonb(s.champions),
    'market', s.market,
    'teams', (
      select jsonb_agg(
        jsonb_build_object(
          'n',   t.name,
          'pj',  t.played,
          'gf',  t.goals_for,
          'gc',  t.goals_against,
          'pts', t.points,
          'sq', (
            select coalesce(
              jsonb_agg(
                jsonb_build_object('pos', p.pos, 'n', p.name, 'o', p.overall)
                order by p.slot
              ), '[]'::jsonb)
            from public.save_players p
            where p.team_id = t.id
          )
        ) order by t.idx
      )
      from public.save_teams t
      where t.save_id = s.id
    )
  )
  from public.saves s
  where s.id = p_save_id;
$$;

-- 7) SEGURIDAD (RLS): cada usuario solo ve y toca sus partidas ------------------------
alter table public.profiles     enable row level security;
alter table public.saves        enable row level security;
alter table public.save_teams   enable row level security;
alter table public.save_players enable row level security;

create policy "Perfiles visibles" on public.profiles
  for select using (true);

create policy "Editar mi perfil" on public.profiles
  for update using ((select auth.uid()) = id);

create policy "Mis partidas" on public.saves
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Mis equipos" on public.save_teams
  for all
  using (exists (select 1 from public.saves s
                 where s.id = save_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.saves s
                      where s.id = save_id and s.user_id = (select auth.uid())));

create policy "Mis jugadores" on public.save_players
  for all
  using (exists (select 1 from public.saves s
                 where s.id = save_id and s.user_id = (select auth.uid())))
  with check (exists (select 1 from public.saves s
                      where s.id = save_id and s.user_id = (select auth.uid())));