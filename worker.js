import { createClient } from '@supabase/supabase-js'

function getSupabase(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_KEY)
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function handleData(env) {
  const supabase = getSupabase(env)
  const [{ data: parts }, { data: res }, { data: pays }, { data: metas }, { data: bonuses }, { data: snap }] = await Promise.all([
    supabase.from('participants_ligabotellines').select('*'),
    supabase.from('results_ligabotellines').select('*').eq('id', 'main').single(),
    supabase.from('payments_ligabotellines').select('*'),
    supabase.from('meta_ligabotellines').select('*').eq('id', 'main').single(),
    supabase.from('bonus_ligabotellines').select('*'),
    supabase.from('snapshots_ligabotellines').select('*').eq('id', 'main').single(),
  ])

  const participantsMap = {}
  for (const p of (parts || [])) {
    participantsMap[p.email] = { nombre: p.nombre, email: p.email, ...(p.data || {}) }
  }

  const paymentsMap = {}
  for (const p of (pays || [])) {
    if (p.pagado) paymentsMap[p.email] = { pagado: true, fecha: p.fecha }
  }

  const bonusMap = {}
  for (const b of (bonuses || [])) {
    bonusMap[b.email] = b.pts
  }

  return json({
    participants: participantsMap,
    results: res?.data || {},
    payments: paymentsMap,
    bonus: bonusMap,
    snapshot: snap?.data || [],
    meta: { cuota: parseInt(metas?.cuota || '10'), locked: metas?.locked || false },
  })
}

async function handleParticipant(request, env) {
  const supabase = getSupabase(env)
  const body = await request.json()

  if (request.method === 'DELETE') {
    const { email } = body
    if (!email) return json({ error: 'Missing email' }, 400)
    await supabase.from('participants_ligabotellines').delete().eq('email', email)
    return json({ ok: true })
  }

  if (request.method === 'POST') {
    const { email, nombre, data } = body
    if (!email || !nombre) return json({ error: 'Missing email or nombre' }, 400)
    const { error } = await supabase.from('participants_ligabotellines').upsert(
      { email, nombre, data: data || {}, updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    )
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

async function handleResults(request, env) {
  const supabase = getSupabase(env)
  const { data } = await request.json()
  const { error } = await supabase.from('results_ligabotellines').upsert(
    { id: 'main', data: data || {}, updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function handlePayment(request, env) {
  const supabase = getSupabase(env)
  const { email, paid, fecha } = await request.json()
  if (!email) return json({ error: 'Missing email' }, 400)
  if (!paid) {
    await supabase.from('payments_ligabotellines').delete().eq('email', email)
  } else {
    const { error } = await supabase.from('payments_ligabotellines').upsert(
      { email, pagado: true, fecha: fecha || null, updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    )
    if (error) return json({ error: error.message }, 500)
  }
  return json({ ok: true })
}

async function handleMeta(request, env) {
  const supabase = getSupabase(env)
  const body = await request.json()
  const updates = { id: 'main', updated_at: new Date().toISOString() }
  if (typeof body.locked === 'boolean') updates.locked = body.locked
  if (body.cuota !== undefined) updates.cuota = String(body.cuota)
  const { error } = await supabase.from('meta_ligabotellines').upsert(updates, { onConflict: 'id' })
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

async function handleBonus(request, env) {
  const supabase = getSupabase(env)
  const { email, pts } = await request.json()
  if (!email) return json({ error: 'Missing email' }, 400)
  if (pts === 0) {
    await supabase.from('bonus_ligabotellines').delete().eq('email', email)
  } else {
    const { error } = await supabase.from('bonus_ligabotellines').upsert(
      { email, pts: parseInt(pts) || 0, updated_at: new Date().toISOString() },
      { onConflict: 'email' }
    )
    if (error) return json({ error: error.message }, 500)
  }
  return json({ ok: true })
}

async function handleSnapshot(request, env) {
  const supabase = getSupabase(env)
  const { snapshot } = await request.json()
  const { error } = await supabase.from('snapshots_ligabotellines').upsert(
    { id: 'main', data: snapshot || [], updated_at: new Date().toISOString() },
    { onConflict: 'id' }
  )
  if (error) return json({ error: error.message }, 500)
  return json({ ok: true })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === '/api/data' && request.method === 'GET') return handleData(env)
    if (path === '/api/participant') return handleParticipant(request, env)
    if (path === '/api/results' && request.method === 'POST') return handleResults(request, env)
    if (path === '/api/payment' && request.method === 'POST') return handlePayment(request, env)
    if (path === '/api/lock' && request.method === 'POST') return handleMeta(request, env)
    if (path === '/api/meta' && request.method === 'POST') return handleMeta(request, env)
    if (path === '/api/bonus' && request.method === 'POST') return handleBonus(request, env)
    if (path === '/api/snapshot' && request.method === 'POST') return handleSnapshot(request, env)

    return env.ASSETS.fetch(request)
  }
}
