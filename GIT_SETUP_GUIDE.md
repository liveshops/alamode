# Git Setup Guide for Your Project

## Your Current Git Status ✅

### Where You're Storing It Now

✅ **Local Git Repository**: `/Users/imacpro/new1`
- You have Git initialized
- 2 commits made
- On `main` branch
- **NOT backed up to GitHub yet** ⚠️

### What You've Committed

Your last 2 commits:
1. "Add Supabase environment variables to production build"
2. "Initial commit"

### What's NOT Committed Yet

**A LOT of new work!** Including all the scraping system we just built:
- Modified files: 8 files
- New files: 21 files (scrapers, guides, SQL scripts, etc.)

---

## Should You Upload to GitHub? **YES! 100%** 🚨

### Why You NEED GitHub Backup:

1. **Disaster Recovery** 🔥
   - If your Mac crashes, ALL your work is gone
   - Right now you have ZERO backups

2. **Version History** 📚
   - See what changed and when
   - Roll back if something breaks

3. **Collaboration** 👥
   - Share with team members
   - Get help from others

4. **Professional Standard** 💼
   - All serious projects use version control
   - Shows you know best practices

---

## Setting Up GitHub (5 minutes)

### Step 1: Create GitHub Repository

1. Go to https://github.com
2. Sign in (or create account if needed)
3. Click **"New"** repository button
4. Repository settings:
   - **Name**: `alamode-fashion-app` (or whatever you want)
   - **Description**: "Fashion discovery app with brand scraping"
   - **Private**: ✅ CHECK THIS (keep it private)
   - **Don't** initialize with README (you already have files)
5. Click **"Create repository"**

### Step 2: Update .gitignore (IMPORTANT!)

We need to add `.env.production` to your `.gitignore` to keep secrets safe:

```bash
echo ".env.production" >> .gitignore
```

Run this in your terminal!

### Step 3: Commit Your Work

```bash
# Stage all your new work
git add .

# Commit it
git commit -m "Add complete brand scraping system with 22+ brands

- Add Shopify and custom scrapers
- Add brand seeding and migration scripts
- Add testing and sync utilities
- Add comprehensive documentation
- Fix follower count triggers
- Add 9 working brands (Edikted, Miaou, Doen, etc.)"

# See your commits
git log --oneline
```

### Step 4: Push to GitHub

After creating the repo on GitHub, they'll show you commands like:

```bash
# Add GitHub as remote (replace YOUR_USERNAME and REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/alamode-fashion-app.git

# Push your code
git push -u origin main
```

**Enter your GitHub credentials when prompted**

---

## What Gets Backed Up

### ✅ WILL be backed up (safe to share):
- All your code files
- Documentation
- SQL scripts
- Package.json
- Configuration files
- `.env.example` (if you create one)

### ❌ WON'T be backed up (kept private):
- `.env` (secrets)
- `.env.production` (after we add to .gitignore)
- `node_modules/` (too large)
- Build files

---

## Quick Reference

### Daily Git Workflow

```bash
# See what changed
git status

# Stage your changes
git add .

# Commit with message
git commit -m "Your descriptive message here"

# Push to GitHub
git push

# Pull latest from GitHub
git pull
```

### Check Your Backups

```bash
# See all commits
git log

# See remote repositories
git remote -v

# Check what branch you're on
git branch
```

---

## Security Checklist

### ⚠️ NEVER commit these:

- [ ] `.env` file (main secrets)
- [ ] `.env.production` (production secrets)
- [ ] Database passwords
- [ ] API keys (except public ones)
- [ ] Service role keys (Supabase admin key)

### ✅ Safe to commit:

- [x] `.env.example` (template without real values)
- [x] `EXPO_PUBLIC_SUPABASE_URL` (public URL)
- [x] `EXPO_PUBLIC_SUPABASE_ANON_KEY` (public anon key - it's meant to be public)
- [x] All code and documentation

---

## Create .env.example Template

Create a safe template for others:

```bash
cat > .env.example << 'EOF'
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Optional: Apify (for custom scrapers)
APIFY_API_TOKEN=your-apify-token-here
EOF

git add .env.example
git commit -m "Add environment template"
```

---

## GitHub Repository Settings

After pushing to GitHub, configure these settings:

### 1. Make it Private
- Settings → General → Danger Zone → Change visibility → **Private**

### 2. Add README Badge (optional but cool)
Add this to your README.md:
```markdown
# a la Mode - Fashion Discovery App

![Status](https://img.shields.io/badge/status-active-success)
![Platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android-blue)
```

### 3. Add Branch Protection (when ready)
- Settings → Branches → Add rule
- Protect `main` branch from force pushes

---

## Troubleshooting

### "Authentication failed"
→ Use a Personal Access Token instead of password:
1. GitHub → Settings → Developer settings → Personal access tokens
2. Generate new token (classic)
3. Use token as password when pushing

### "Repository not found"
→ Check the remote URL:
```bash
git remote -v
# If wrong, update it:
git remote set-url origin https://github.com/USERNAME/REPO.git
```

### "Accidentally committed secrets"
→ **DANGER!** You need to:
1. Change all passwords/keys immediately
2. Remove from Git history (complex)
3. Force push (use with caution)

---

## Next Steps

1. **Right now**: Update .gitignore and commit your work
2. **Today**: Create GitHub repo and push
3. **Going forward**: Commit after each feature/fix
4. **Weekly**: Review your commits

---

## Commands to Run NOW

```bash
# 1. Update .gitignore to exclude .env.production
echo ".env.production" >> .gitignore

# 2. Create environment template
cat > .env.example << 'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
APIFY_API_TOKEN=your-apify-token-here
EOF

# 3. Stage everything
git add .

# 4. Commit
git commit -m "Add complete brand scraping system

- Shopify & custom scrapers for 22+ brands
- Database migrations and seeding
- Testing and sync utilities
- Comprehensive documentation
- Fix follower count triggers"

# 5. Create GitHub repo (do this on github.com)

# 6. Add remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/alamode-fashion-app.git

# 7. Push to GitHub
git push -u origin main
```

---

## Summary

**Current State**: 
- ❌ Only stored locally (risky!)
- ❌ Not backed up (one crash = everything lost)
- ✅ Git initialized and tracking files

**After Setup**:
- ✅ Backed up to GitHub (safe!)
- ✅ Version history preserved
- ✅ Can work from multiple computers
- ✅ Professional standard met

**Time Required**: ~5-10 minutes
**Importance**: 🚨 CRITICAL

---

Get this set up today! Your future self will thank you. 💪
