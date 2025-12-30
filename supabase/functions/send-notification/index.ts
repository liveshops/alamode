import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  user_id: string
  type: string
  title: string
  body: string
  data?: Record<string, unknown>
}

interface ExpoPushMessage {
  to: string
  sound?: 'default' | null
  title: string
  body: string
  data?: Record<string, unknown>
  badge?: number
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const payload: NotificationPayload = await req.json()
    const { user_id, type, title, body, data } = payload

    if (!user_id || !type || !title || !body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, type, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check user's notification preferences
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user_id)
      .single()

    // Check if user has this notification type enabled
    const prefKey = type.replace(/-/g, '_') as keyof typeof prefs
    if (prefs && prefs[prefKey] === false) {
      console.log(`User ${user_id} has ${type} notifications disabled`)
      return new Response(
        JSON.stringify({ success: true, message: 'Notification disabled by user preferences' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's active push tokens
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', user_id)
      .eq('is_active', true)

    if (tokensError) {
      console.error('Error fetching push tokens:', tokensError)
      throw tokensError
    }

    if (!tokens || tokens.length === 0) {
      console.log(`No active push tokens for user ${user_id}`)
      // Still save the notification for in-app display
      await saveNotification(supabase, user_id, type, title, body, data)
      return new Response(
        JSON.stringify({ success: true, message: 'No push tokens, notification saved for in-app' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build Expo push messages
    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.expo_push_token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }))

    // Send to Expo Push API
    const expoPushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    })

    const expoPushResult = await expoPushResponse.json()
    console.log('Expo Push API response:', expoPushResult)

    // Handle any errors from Expo
    if (expoPushResult.data) {
      for (let i = 0; i < expoPushResult.data.length; i++) {
        const result = expoPushResult.data[i]
        if (result.status === 'error') {
          console.error(`Push error for token ${tokens[i].expo_push_token}:`, result.message)
          
          // Deactivate invalid tokens
          if (result.details?.error === 'DeviceNotRegistered') {
            await supabase
              .from('push_tokens')
              .update({ is_active: false })
              .eq('expo_push_token', tokens[i].expo_push_token)
          }
        }
      }
    }

    // Save notification to database for in-app display
    await saveNotification(supabase, user_id, type, title, body, data)

    return new Response(
      JSON.stringify({ success: true, sent_to: tokens.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error sending notification:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function saveNotification(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      data: data || {},
    })

  if (error) {
    console.error('Error saving notification:', error)
  }
}
