# TestFlight Deployment Guide

## Prerequisites Checklist

Before building for TestFlight, make sure you have:

- [ ] Apple Developer Account ($99/year)
  - Sign up at: https://developer.apple.com/programs/
  - Must be enrolled to distribute on TestFlight
  
- [ ] Expo Account (Free)
  - Sign up at: https://expo.dev/signup
  
- [ ] App Store Connect Access
  - Access at: https://appstoreconnect.apple.com
  
- [ ] All app assets ready:
  - [ ] App icon (1024x1024px)
  - [ ] Splash screen
  - [ ] Screenshots for App Store (optional for TestFlight)

---

## Step 1: Configure EAS

### 1.1 Login to Expo
```bash
npx eas-cli login
```

### 1.2 Initialize EAS (if not done)
```bash
npx eas-cli init
```
This will:
- Create a project on Expo
- Add project ID to your app.json
- Create eas.json configuration file

### 1.3 Verify eas.json

Your `eas.json` should look like this:
```json
{
  "cli": {
    "version": ">= 16.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## Step 2: Create App in App Store Connect

### 2.1 Create App Record
1. Go to: https://appstoreconnect.apple.com
2. Click **"My Apps"** → **"+"** → **"New App"**
3. Fill in:
   - **Platform**: iOS
   - **Name**: a la Mode
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: Select `com.shopalamode.app` (will be created during build)
   - **SKU**: alamode-ios (unique identifier)
   - **User Access**: Full Access

### 2.2 App Information
Fill in required fields:
- **Privacy Policy URL**: (You'll need to create one)
- **Category**: Shopping or Lifestyle
- **Content Rights**: Check if you have rights

---

## Step 3: Build for iOS

### 3.1 First Build
```bash
npx eas-cli build --platform ios --profile production
```

This will:
- Prompt you to log into your Apple Developer account
- Create necessary certificates and provisioning profiles
- Build your app in the cloud (~15-20 minutes)
- Generate an `.ipa` file

**Important**: You'll be asked several questions:
- **Apple ID**: Your Apple Developer account email
- **Apple ID Password**: Use app-specific password if 2FA enabled
- **Bundle Identifier**: Already set to `com.shopalamode.app`
- **Generate credentials**: Yes (for first build)

### 3.2 Monitor Build
```bash
npx eas-cli build:list
```

Or check: https://expo.dev/accounts/[your-account]/projects/new1/builds

---

## Step 4: Submit to TestFlight

### Option A: Automatic Submission (Recommended)
```bash
npx eas-cli submit --platform ios --latest
```

EAS will automatically upload to TestFlight.

### Option B: Manual Submission
1. Download the `.ipa` from your EAS build
2. Open **Xcode** → **Window** → **Organizer**
3. Drag `.ipa` to Archives
4. Click **Distribute App** → **App Store Connect** → **Upload**

---

## Step 5: Configure TestFlight

### 5.1 Set Up Test Information
1. Go to **App Store Connect** → **TestFlight** tab
2. Click on your build (may take 5-10 mins to process)
3. Add **Test Information**:
   - Beta App Description
   - Feedback Email
   - Marketing URL (optional)
   - Privacy Policy URL

### 5.2 Add Internal Testers
1. Go to **App Store Connect Users and Access**
2. Add team members with "Admin" or "App Manager" role
3. They'll get invited automatically

### 5.3 Add External Testers
1. Go to **TestFlight** → **External Testing**
2. Create a test group
3. Add testers by email (up to 10,000 emails)
4. Submit for Beta App Review (required for external testers)
   - Usually approved within 24-48 hours

---

## Step 6: Install TestFlight

### For Testers:
1. Download **TestFlight** app from App Store
2. Accept invitation email
3. Open TestFlight → Install "a la Mode"
4. Launch app!

---

## Updating the App

### When you need to push updates:

1. **Increment version number** in `app.json`:
   ```json
   "version": "1.0.1"
   ```

2. **Build new version**:
   ```bash
   npx eas-cli build --platform ios --profile production
   ```

3. **Submit to TestFlight**:
   ```bash
   npx eas-cli submit --platform ios --latest
   ```

4. **Testers get auto-updated** (if auto-update is enabled)

---

## Deep Linking Configuration

For password reset to work, update Supabase:

1. Go to Supabase **Authentication** → **URL Configuration**
2. Update **Redirect URLs** to:
   ```
   new1://
   new1://reset-password
   ```

The app scheme `new1://` will now work on real devices!

---

## Troubleshooting

### Build Failed?
- Check EAS build logs
- Common issues:
  - Missing Apple Developer account enrollment
  - Expired credentials
  - Invalid bundle identifier

### TestFlight Not Showing Build?
- Wait 5-10 minutes for processing
- Check for email from Apple about compliance issues
- Verify export compliance in App Store Connect

### Deep Links Not Working?
- Make sure you're testing on a physical device or TestFlight build
- Verify app scheme in app.json matches Supabase URLs
- Check device is running iOS 13+

---

## Estimated Timeline

- **Initial Setup**: 30 minutes
- **First Build**: 15-20 minutes
- **TestFlight Processing**: 5-10 minutes
- **Internal Testers**: Immediate access
- **External Beta Review**: 24-48 hours

**Total to first internal test**: ~1 hour
**Total to external testers**: 1-3 days

---

## Costs

- **Expo EAS**: Free tier (limited builds/month)
  - Paid: $29/month for more builds
- **Apple Developer**: $99/year (required)
- **Domain (shopalamode.co)**: Already purchased
- **Resend**: Current free tier is sufficient

---

## Next Steps After TestFlight

1. **Gather feedback** from testers
2. **Fix bugs** and iterate
3. **Prepare App Store listing**:
   - Screenshots (multiple sizes)
   - App Preview video (optional)
   - Description and keywords
   - Privacy policy
   - Age rating questionnaire
4. **Submit for App Store Review**
5. **Launch! 🚀**

---

## Useful Commands

```bash
# Login to Expo
npx eas-cli login

# Check build status
npx eas-cli build:list

# View credentials
npx eas-cli credentials

# Build for iOS (production)
npx eas-cli build --platform ios --profile production

# Submit to TestFlight
npx eas-cli submit --platform ios --latest

# Build for Android (future)
npx eas-cli build --platform android --profile production
```

---

## Support Resources

- **EAS Docs**: https://docs.expo.dev/build/introduction/
- **TestFlight Docs**: https://developer.apple.com/testflight/
- **App Store Connect**: https://appstoreconnect.apple.com
- **Expo Dashboard**: https://expo.dev

---

**You're ready to ship! 🎉**
