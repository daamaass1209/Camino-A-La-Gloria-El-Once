/* ---------- Conexión con Supabase (guardado en la nube) ----------
   Se carga DESPUÉS de script.js. Usa S, save(), toast(), fixtures() y render() de script.js.
   La clave "anon" puede ir aquí; la "service_role" NUNCA. */

const SUPABASE_URL = 'PEGA_AQUI_TU_PROJECT_URL';
const SUPABASE_KEY = 'PEGA_AQUI_TU_ANON_KEY';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cloudId = localStorage.getItem('fm-cloud-id');   // id de la partida en Supabase

/* ---------- Cuenta ---------- */
async function registrar(email, password, username) {
  const { error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
  if (error) return toast(error.message);
  toast('Cuenta creada. Revisa tu correo si te pide confirmar.');
}

async function entrar(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  toast('Sesión iniciada');
}

async function salir() {
  await sb.auth.signOut();
  toast('Sesión cerrada');
}

/* ---------- Guardar / cargar ---------- */
async function guardarNube() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !S.teams) return;                       // sin sesión o sin partida: no hace nada

  const { tab, fx, ...estado } = S;                    // tab y fx no se guardan
  const { data, error } = await sb.rpc('save_game', { p_state: estado, p_save_id: cloudId });
  if (error) { console.error(error); return toast('No se pudo guardar en la nube'); }

  cloudId = data;
  localStorage.setItem('fm-cloud-id', cloudId);
}

async function listarPartidas() {
  const { data, error } = await sb
    .from('saves')
    .select('id, league_index, season, matchday, updated_at')
    .order('updated_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data;
}

async function cargarNube(id) {
  const { data, error } = await sb.rpc('load_game', { p_save_id: id });
  if (error || !data) { console.error(error); return toast('No se pudo cargar la partida'); }

  S = { ...data, tab: 'partido', fx: fixtures(data.teams.length) };   // fx se vuelve a calcular
  cloudId = id;
  localStorage.setItem('fm-cloud-id', id);
  save();                                              // copia local
  render();
}

async function borrarPartida(id) {
  const { error } = await sb.from('saves').delete().eq('id', id);
  if (error) return toast('No se pudo borrar');
  if (id === cloudId) { cloudId = null; localStorage.removeItem('fm-cloud-id'); }
}