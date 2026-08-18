import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function projectApiKey() {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || ''; } catch { return ''; }
}

function projectPrivilegedKey() {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default || ''; } catch { return ''; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Methode nicht erlaubt.' }, 405);

  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return response({ error: 'Zugang nicht möglich.' }, 401);
    const { password } = await request.json();
    if (typeof password !== 'string' || !password.trim()) return response({ error: 'Bitte das Zugangs-Passwort eingeben.' }, 400);

    // The platform JWT check is enabled. This second check also ensures that only
    // an anonymous session, not an old e-mail account, can receive shared access.
    const caller = createClient(Deno.env.get('SUPABASE_URL') || '', projectApiKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user || !user.is_anonymous) return response({ error: 'Bitte die Seite neu öffnen und erneut versuchen.' }, 401);

    const serviceRoleKey = projectPrivilegedKey();
    if (!serviceRoleKey) return response({ error: 'Der Zugangsdienst ist nicht vollständig eingerichtet.' }, 503);
    const admin = createClient(Deno.env.get('SUPABASE_URL') || '', serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('av_grant_shared_access', {
      p_user_id: user.id,
      p_password: password,
    });
    if (error) {
      const status = error.code === '55000' ? 503 : 403;
      return response({ error: status === 503 ? 'Das Zugangs-Passwort wurde in Supabase noch nicht eingerichtet.' : 'Zugang nicht möglich.' }, status);
    }
    const record = Array.isArray(data) ? data[0] : data;
    if (!record?.workspace_id || !record?.state) return response({ error: 'Der gemeinsame Bestand konnte nicht geöffnet werden.' }, 500);
    return response({ workspaceId: record.workspace_id, state: record.state, displayName: record.display_name }, 200);
  } catch {
    return response({ error: 'Zugang nicht möglich.' }, 400);
  }
});
