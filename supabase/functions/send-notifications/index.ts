// Supabase Edge Function: send-notifications
// Polls for reminders and Sends Expo Push Notifications

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import postgres from "https://deno.land/x/postgresjs@v3.3.3/mod.js"

const sql = postgres(Deno.env.get('DATABASE_URL')!, { ssl: 'require' })

serve(async (req) => {
  try {
    // 1. Find reminders due now (that haven't been sent)
    const dueReminders = await sql`
      SELECT r.id, r.event_name, p.push_token 
      FROM reminders r
      JOIN profiles p ON r.user_id = p.id
      WHERE r.scheduled_for <= NOW() 
      AND r.reminded_at IS NULL
      AND p.push_token IS NOT NULL
    `;

    const notifications = [];
    for (const reminder of dueReminders) {
      notifications.push({
        to: reminder.push_token,
        sound: 'default',
        title: 'Flow Guru Reminder',
        body: `Your ${reminder.event_name} is in 30 minutes`,
        data: { id: reminder.id },
      });
    }

    if (notifications.length > 0) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(notifications),
      });
      
      const result = await response.json();
      console.log('Push Sent:', result);

      // 2. Mark as reminded
      const reminderIds = dueReminders.map(r => r.id);
      await sql`
        UPDATE reminders 
        SET reminded_at = NOW() 
        WHERE id IN ${sql(reminderIds)}
      `;
    }

    return new Response(JSON.stringify({ sent: notifications.length }), { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
