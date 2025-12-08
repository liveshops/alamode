# Authentication Testing Guide

## ✅ What We Built

1. **Auth Context** (`contexts/AuthContext.tsx`)
   - Manages user session and profile state
   - Provides `signIn`, `signUp`, `signOut` functions
   - Automatically loads user profile on login

2. **Login Screen** (`app/(auth)/login.tsx`)
   - Clean, minimal design matching your mockup
   - Email and password inputs
   - SIGN UP and LOG IN buttons
   - "Forgot password" link

3. **Sign Up Screen** (`app/(auth)/signup.tsx`)
   - Name, username, email, phone fields
   - Auto-creates profile via database trigger
   - SIGN UP button with cancel option

4. **Protected Routing**
   - `app/index.tsx` redirects based on auth state
   - Logged out → Login screen
   - Logged in → Home tab

5. **Tab Navigation**
   - Home, Shop, Favorites, Search, Profile tabs
   - Placeholder screens for now

## 🧪 How to Test

### Start the App
```bash
npm start
```

Then press:
- `i` for iOS Simulator
- `a` for Android Emulator
- Scan QR code for Expo Go on your phone

### Test Login
Use the existing test user:
- **Email**: (the email you used when creating klshumway in Supabase)
- **Password**: (the password you set)

Expected flow:
1. App loads → Shows login screen
2. Enter credentials → Tap LOG IN
3. Redirects to Home tab
4. Shows: "Welcome, klshumway!" with @username
5. Bottom tabs visible (Home, Shop, Favorites, Search, Profile)

### Test Sign Out
- Tap "Sign Out" button on home screen
- Should redirect back to login screen

### Test Sign Up (Optional)
1. Tap "SIGN UP" button on login screen
2. Fill in name, username, email
3. Tap SIGN UP
4. Check email for confirmation (if email confirmations enabled)
5. Should create new profile automatically

## 🐛 Troubleshooting

### "Missing Supabase credentials"
- Check that `.env` file exists with correct keys
- Restart Metro bundler: `r` in terminal

### Can't log in
- Verify user exists in Supabase Dashboard → Authentication
- Check password is correct
- Look at Metro bundler console for error messages

### TypeScript errors about routes
- These will resolve when dev server restarts
- Or restart with: `npm start -- --clear`

### App shows blank screen
- Check Metro bundler console for errors
- Try: `npm start -- --reset-cache`

## 📱 Expected Behavior

**First Launch:**
- Shows loading spinner briefly
- Redirects to login screen

**After Login:**
- Loading spinner while fetching profile
- Redirects to home tab
- Shows welcome message with user's name

**Navigation:**
- Bottom tabs work
- Each tab shows placeholder content
- Profile tab shows @username

## 🎨 Design Notes

The login screen matches your mockup:
- "a la Mode" app name (elegant, light font)
- Simple bordered text inputs
- SIGN UP button (outlined)
- LOG IN button (filled black)
- "Forgot your password?" link

Next steps:
- Build home feed with product grid
- Add product detail page
- Implement heart/like functionality
