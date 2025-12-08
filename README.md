# a la Mode - Fashion Discovery App 👗

Fashion drops app where users discover the latest products from their favorite brands.

**Status**: Active Development | 7 brands synced | 6,285+ products

## Tech Stack

- **Frontend**: Expo React Native
- **Backend**: Supabase (PostgreSQL + Auth)
- **Scraping**: Custom Shopify scrapers
- **Platform**: iOS & Android

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and add your Supabase credentials.

### 3. Run the App
```bash
npx expo start
```

### 4. Set Up Brand Scraping
See **[SCRAPING_GUIDE.md](SCRAPING_GUIDE.md)** for complete instructions.

## Key Features

- 🔐 User authentication & profiles
- 👗 Product discovery feed
- ❤️ Like products and follow brands
- 🔍 Search products, brands, and users
- 🛍️ Brand-specific product pages
- 🤖 Automated product scraping from 7+ brands

## Documentation

**Main Guide**: [SCRAPING_GUIDE.md](SCRAPING_GUIDE.md) - Complete brand scraping guide

**Other Guides**:
- [FIXING_FOLLOWER_COUNTS.md](FIXING_FOLLOWER_COUNTS.md) - Fix follower count triggers
- [archive_docs/](archive_docs/) - Older documentation (reference only)

## Project Structure

```
/app                  # React Native screens (file-based routing)
/components           # Reusable components
/contexts             # Auth context
/scripts              # Database & scraping scripts
  /scrapers           # Brand scraping logic
/utils                # Supabase client
```

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
