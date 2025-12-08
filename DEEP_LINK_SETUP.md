# Deep Link Setup for Password Reset

## Current Issue
Deep links (`new1://reset-password`) don't work in Expo Go during development. They require a custom development build or production build.

## Solutions

### Option 1: Testing Without Deep Links (Development)

For immediate testing, users can reset their password by:

1. Click the reset link in email
2. Copy the URL from the error page
3. Extract the token from the URL
4. Manually navigate to the reset password screen in the app
5. The app will automatically use the session token

**Better approach**: Update Supabase email template with fallback instructions.

---

### Option 2: Use Development Build (Recommended)

Create a custom development build that supports deep links:

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Create development build
eas build --profile development --platform ios
# or for Android:
eas build --profile development --platform android
```

This creates a build with deep linking support.

---

### Option 3: Universal Links (Production)

For production, use Universal Links (iOS) and App Links (Android):

#### 1. Set up app.json
```json
{
  "expo": {
    "scheme": "new1",
    "ios": {
      "bundleIdentifier": "com.yourcompany.alamode",
      "associatedDomains": ["applinks:shopalamode.co"]
    },
    "android": {
      "package": "com.yourcompany.alamode",
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "shopalamode.co",
              "pathPrefix": "/reset-password"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

#### 2. Update Supabase redirect URL
Instead of: `new1://reset-password`
Use: `https://shopalamode.co/reset-password`

#### 3. Add Apple App Site Association (AASA) file
Host this at `https://shopalamode.co/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAMID.com.yourcompany.alamode",
        "paths": ["/reset-password"]
      }
    ]
  }
}
```

#### 4. Add Android assetlinks.json
Host this at `https://shopalamode.co/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.yourcompany.alamode",
      "sha256_cert_fingerprints": ["YOUR_APP_SHA256_FINGERPRINT"]
    }
  }
]
```

---

### Option 4: Simple Workaround (Current)

For now, use a web-based reset flow:

1. Host a simple reset page at `https://shopalamode.co/reset-password`
2. Page reads the token from URL
3. Calls Supabase API to update password
4. Shows "Password updated! Open the app to log in"
5. User manually opens app and logs in with new password

This requires a simple static website but works immediately without app changes.

---

## Recommended Approach for Now

**For Development/MVP:**
- Use web-based reset flow (Option 4)
- Quick to implement, works everywhere
- No app rebuild needed

**For Production Launch:**
- Implement Universal Links (Option 3)
- Better user experience
- Seamless app opening from email

---

## Testing Current Setup

To test password reset right now:

1. User requests password reset
2. Receives email with link
3. Clicks link (will show error)
4. Copy the full URL from browser
5. Go to: https://supabase.com/dashboard/project/oeztavlkbkbkxhcpjkdxry/auth/users
6. Find the user, manually reset their password from dashboard

Or build out the web fallback page.
