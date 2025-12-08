# Bluehost Deployment Guide - shop-alamode.com

## ✅ Clean One-Page Password Reset Setup

### Step 1: Upload HTML File to Bluehost

1. **Log into Bluehost cPanel**
   - Go to: https://my.bluehost.com/
   - Click "Advanced" → "cPanel"

2. **Open File Manager**
   - Find "File Manager" under the "Files" section
   - Click to open

3. **Navigate to Your Domain Folder**
   - Look for `public_html/shop-alamode.com` folder
   - If it doesn't exist, you may see just `public_html` (that's fine)

4. **Upload the HTML File**
   - Click "Upload" button at the top
   - Select `/Users/imacpro/new1/password-reset-page.html`
   - Upload it

5. **Rename to index.html**
   - Right-click the uploaded file
   - Select "Rename"
   - Change to: `index.html`
   
   **This makes it accessible at**: `https://shop-alamode.com`

### Step 2: Update Supabase Settings

Go to Supabase Dashboard → Authentication → URL Configuration

**Site URL:**
```
https://shop-alamode.com
```

**Redirect URLs (add these):**
```
https://shop-alamode.com
https://shop-alamode.com/**
new1://auth/callback
new1://
```

Click **Save**

### Step 3: Test the Setup

1. **Visit the page directly:**
   - Go to: `https://shop-alamode.com`
   - You should see the "Create New Password" page

2. **Request a password reset from the app:**
   - Open your app
   - Go to Login → "Forgot Password"
   - Enter test email
   - Check email

3. **Click the reset link:**
   - Link should go to: `https://shop-alamode.com#access_token=...`
   - Page should load WITHOUT "Invalid reset link" error
   - Form should be enabled
   - Enter new password
   - Should show success message
   - App should attempt to open

### Alternative: Custom Path (Optional)

If you want to keep it at a specific path like `/reset-password`:

1. Upload the file as `reset-password.html`
2. Use URL: `https://shop-alamode.com/reset-password.html`
3. Update `AuthContext.tsx` redirectTo to match
4. Update Supabase Site URL and Redirect URLs to match

### Troubleshooting

**If the page shows a Bluehost parking page:**
- Make sure DNS is pointing to Bluehost
- Wait 24-48 hours for DNS propagation
- Check that file is in the correct folder

**If you get a 404 error:**
- Make sure the file is named `index.html`
- Check it's in the right folder (`public_html/shop-alamode.com` or `public_html`)

**If the domain doesn't load:**
- Check domain DNS settings in Bluehost
- Make sure the domain is properly added to your hosting plan
- Contact Bluehost support to verify domain is active

### After Deployment Checklist

- [ ] HTML file uploaded to Bluehost as `index.html`
- [ ] Page loads at `https://shop-alamode.com`
- [ ] Supabase Site URL updated to `https://shop-alamode.com`
- [ ] Supabase Redirect URLs include `https://shop-alamode.com` and `https://shop-alamode.com/**`
- [ ] Tested password reset from app
- [ ] Email link redirects to correct URL
- [ ] Page loads with tokens in URL hash
- [ ] Password update works successfully
- [ ] Rebuild and redeploy app with updated `AuthContext.tsx`

### Next Build

When you rebuild your app for TestFlight:
- The new domain `https://shop-alamode.com` will be used automatically
- Users will get password reset emails with the correct link
- No more iframe issues!

---

## Why This Works Better

**Before:** GoDaddy Website Builder wrapped your HTML in an iframe
- Hash fragments (#access_token=...) don't pass into iframes
- JavaScript couldn't access the tokens
- Always showed "Invalid reset link"

**Now:** Direct HTML file on Bluehost
- ✅ No iframe wrapper
- ✅ JavaScript runs in the main window
- ✅ Can access URL hash directly
- ✅ Tokens are extracted correctly
- ✅ Password reset works!

---

## File Location Reference

**Local file:** `/Users/imacpro/new1/password-reset-page.html`

**Bluehost path:** `public_html/index.html` (or `public_html/shop-alamode.com/index.html`)

**Live URL:** `https://shop-alamode.com`

**Updated in code:**
- ✅ `/Users/imacpro/new1/contexts/AuthContext.tsx` (line 144)
