# Push Notifications Setup Guide

This guide walks you through setting up push notifications for the Alamode app.

## Overview

The notification system uses:
- **Expo Notifications** - Client-side push token management
- **Supabase Edge Functions** - Server-side notification sending
- **Supabase Database Triggers** - Automatic notification triggers on events
- **Expo Push API** - Delivers notifications to iOS/Android

## Setup Steps

### 1. Run Database Migrations

Execute these SQL files in your Supabase SQL Editor in order:

```bash
# First: Create notification tables
scripts/migration-notifications.sql

# Second: Create triggers (after deploying Edge Function)
scripts/migration-notification-triggers.sql
```

### 2. Configure Database Settings

After running migrations, set your Supabase credentials in the database:

```sql
-- Replace with your actual values from Supabase Dashboard > Settings > API
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://YOUR_PROJECT_ID.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

### 3. Deploy Edge Function

Install Supabase CLI if you haven't:
```bash
npm install -g supabase
```

Login and link your project:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
```

Deploy the notification function:
```bash
supabase functions deploy send-notification
```

### 4. Configure Expo Project

Add your EAS project ID to `app.json` or `app.config.js`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-eas-project-id"
      }
    }
  }
}
```

Get your project ID from: https://expo.dev/accounts/[username]/projects/[project]

### 5. iOS Configuration (for production)

For iOS push notifications to work in production, you need:

1. Apple Developer Account
2. Push Notification capability enabled
3. Configure in `app.json`:

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    }
  }
}
```

### 6. Android Configuration

Android works out of the box with Expo Push. For custom sounds/icons:

```json
{
  "expo": {
    "android": {
      "useNextNotificationsApi": true
    }
  }
}
```

## Testing

### Test on Physical Device

Push notifications require a physical device. The simulator won't receive them.

1. Run `npx expo start`
2. Open on physical device via Expo Go
3. Login to trigger token registration
4. Check Supabase `push_tokens` table for your token

### Test Notification Manually

Use the Expo Push Tool: https://expo.dev/notifications

Or send via curl:
```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxx]",
    "title": "Test",
    "body": "Hello from Alamode!"
  }'
```

### Test via Edge Function

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/send-notification' \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "USER_UUID",
    "type": "new_followers",
    "title": "Test Notification",
    "body": "This is a test!"
  }'
```

## Notification Types

| Type | Trigger | Preference Column |
|------|---------|-------------------|
| `new_followers` | User follows another user | `new_followers` |
| `brand_products` | Brand adds new product | `brand_products` |
| `product_likes` | Product hits like milestone | `product_likes` |
| `weekly_digest` | Scheduled job (future) | `weekly_digest` |
| `price_drops` | Product price decreases (future) | `price_drops` |

## Files Created

```
hooks/usePushNotifications.ts     # Client-side push registration
contexts/NotificationContext.tsx  # React context for notifications
supabase/functions/send-notification/index.ts  # Edge Function
scripts/migration-notifications.sql            # DB tables
scripts/migration-notification-triggers.sql    # DB triggers
```

## Troubleshooting

### "No push tokens" in logs
- Ensure running on physical device
- Check notification permissions in device settings
- Verify user is logged in

### Notifications not received
- Check `push_tokens.is_active` is `true`
- Verify Edge Function is deployed: `supabase functions list`
- Check Edge Function logs: `supabase functions logs send-notification`

### Database trigger not firing
- Verify `pg_net` extension is enabled
- Check database settings are configured correctly
- Look for errors in Supabase Dashboard > Logs > Postgres

## Future Enhancements

1. **Weekly Digest** - Scheduled Edge Function with pg_cron
2. **Batching** - Avoid spam for brand_products (aggregate new products)
3. **Notification Center UI** - In-app notification list
4. **Rich Notifications** - Images, action buttons
5. **Analytics** - Track open rates, engagement
