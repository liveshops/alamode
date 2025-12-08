# Resend Email Setup Guide

## Configure Supabase to Use Resend for Emails

Follow these steps to set up Resend as your email provider for all Supabase authentication emails.

### Step 1: Get Resend SMTP Credentials

Resend provides SMTP access that works perfectly with Supabase.

**SMTP Server Details:**
- **Host:** `smtp.resend.com`
- **Port:** `465` (SSL) or `587` (TLS)
- **Username:** `resend`
- **Password:** Your Resend API Key: `re_FpJrG73Q_QD4bLh7zvaYcHphBjZfvv1RK`

### Step 2: Configure Supabase SMTP Settings

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/oeztavlkbkbkxhcpjkdxry

2. Navigate to: **Project Settings** → **Authentication**

3. Scroll down to **SMTP Settings**

4. Toggle **Enable Custom SMTP** to ON

5. Fill in the following details:
   ```
   Sender email: noreply@yourdomain.com
   Sender name: a la Mode
   Host: smtp.resend.com
   Port: 465
   Username: resend
   Password: re_FpJrG73Q_QD4bLh7zvaYcHphBjZfvv1RK
   ```

6. Click **Save**

### Step 3: Verify Your Sender Domain (Important!)

By default, Resend only allows sending from verified domains. You have two options:

#### Option A: Use Resend's Test Domain (Development Only)
- Send from: `onboarding@resend.dev`
- Limited to 100 emails per day
- Good for testing

#### Option B: Verify Your Custom Domain (Recommended for Production)
1. Go to: https://resend.com/domains
2. Add your domain (e.g., `alamode.com`)
3. Add the DNS records Resend provides
4. Once verified, update Supabase sender email to: `noreply@yourdomain.com`

### Step 4: Configure Redirect URLs in Supabase

1. Go to: **Authentication** → **URL Configuration**
2. Add these redirect URLs:
   ```
   new1://reset-password
   ```
3. Set Site URL to: `new1://`
4. Click **Save**

### Step 5: Customize Email Templates (Optional)

1. Go to: **Authentication** → **Email Templates**
2. Customize the templates for:
   - **Confirm Signup**: Welcome email with verification link
   - **Magic Link**: Passwordless login
   - **Reset Password**: Password reset instructions
   - **Change Email Address**: Email change confirmation

### Step 6: Test the Setup

1. Try the "Forgot Password" flow in your app
2. Check Resend Dashboard for sent emails: https://resend.com/emails
3. Check spam folder if email doesn't arrive
4. Verify email arrives within seconds

### Troubleshooting

**No emails arriving?**
- Check Resend dashboard for delivery status
- Verify sender domain is configured correctly
- Check Supabase logs: **Logs** → **Auth Logs**
- Make sure SMTP settings are saved properly

**Emails going to spam?**
- Set up SPF, DKIM, and DMARC records for your domain
- Use a verified custom domain instead of resend.dev
- Warm up your domain by gradually increasing send volume

**Rate limits:**
- Resend free tier: 3,000 emails/month, 100/day
- Upgrade as needed: https://resend.com/pricing

### Email Types That Will Use Resend

Once configured, these emails will automatically use Resend:
- ✉️ Sign up confirmation emails
- ✉️ Password reset emails
- ✉️ Email change confirmation
- ✉️ Magic link login emails

### Next Steps

After basic setup works:
1. Set up custom email templates with your branding
2. Verify your custom domain
3. Monitor email delivery in Resend dashboard
4. Set up webhooks for tracking opens/clicks (optional)

---

## Quick Reference

- **Resend Dashboard**: https://resend.com/
- **Resend Docs**: https://resend.com/docs
- **Supabase SMTP Docs**: https://supabase.com/docs/guides/auth/auth-smtp
