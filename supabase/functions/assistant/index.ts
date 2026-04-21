// Supabase Edge Function: assistant (Neon Edition)
// Handles Natural Language Planning, Tool Execution, and Contextual Memory + Reminders

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import postgres from "https://deno.land/x/postgresjs@v3.3.3/mod.js"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DATABASE_URL = Deno.env.get('DATABASE_URL');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!DATABASE_URL) {
      return new Response(JSON.stringify({ error: "DATABASE_URL not set in Supabase Secrets." }), { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
      })
  }

  const sql = postgres(DATABASE_URL, { ssl: 'require' })

  try {
    const { message, userId: rawUserId } = await req.json()
    
    // Ensure we have a valid UUID. If mobile doesn't send one (anonymous), 
    // we use a consistent "demo" UUID so the database doesn't crash on type validation.
    const DEMO_UUID = "00000000-0000-0000-0000-000000000000";
    const userId = (rawUserId && rawUserId !== 'anonymous') ? rawUserId : DEMO_UUID;

    // 1. Ensure User exists
    try {
        await sql.begin(async (tx) => {
            await tx`INSERT INTO profiles (id) VALUES (${userId}) ON CONFLICT (id) DO NOTHING`
            await tx`INSERT INTO user_memory (user_id) VALUES (${userId}) ON CONFLICT (user_id) DO NOTHING`
        })
    } catch (dbError) {
        console.error("DB Error:", dbError);
        return new Response(JSON.stringify({ error: `Database Error: ${dbError.message}` }), { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
        })
    }

    const [memoryRow] = await sql`SELECT memory FROM user_memory WHERE user_id = ${userId}`
    let memory = memoryRow?.memory || {}

    // 2. Fetch from real Flow Guru Brain (Vercel)
    const VERCEL_API_URL = "https://flow-guru-web.vercel.app/api/trpc/assistant.send";
    
    const vercelResponse = await fetch(VERCEL_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message,
            userId: userId, // Pass through the ID for memory lookup
        })
    });

    if (!vercelResponse.ok) {
        const errText = await vercelResponse.text();
        throw new Error(`Vercel Brain Error: ${errText}`);
    }

    const { result } = await vercelResponse.json();
    const reply = result?.data?.reply || "I'm here, but I'm having trouble thinking clearly right now.";
    const actionResult = result?.data?.actionResult || null;

    // 3. Persist to Supabase for mobile history
    await sql`INSERT INTO conversations (user_id, role, content) VALUES (${userId}, 'user', ${message})`
    await sql`INSERT INTO conversations (user_id, role, content) VALUES (${userId}, 'assistant', ${reply})`

    return new Response(JSON.stringify({ reply, actionResult }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
    })
  }
})
