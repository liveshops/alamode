# Recommendation System

## Overview

The recommendation system provides personalized product recommendations using a **content-based + rule-based hybrid algorithm**. It powers:

1. **"For You" tab** in the Search screen - personalized product feed
2. **"Similar Products"** on product detail pages - related items

## Algorithm Weights

| Signal | Weight | Description |
|--------|--------|-------------|
| **Brand Affinity** | 40% | Products from followed brands and brands of liked items |
| **Category Match** | 35% | Products in same taxonomy category as liked items |
| **Freshness + Popularity** | 20% | New arrivals and trending items |
| **Price Range** | 5% | Products within user's typical spending range |

## Database Components

### Tables

**`user_preferences`** - Aggregated user behavior signals
```sql
user_id UUID PRIMARY KEY
preferred_brands JSONB      -- {brand_id: score, ...}
preferred_categories JSONB  -- {taxonomy_id: score, ...}
price_range_min DECIMAL
price_range_max DECIMAL
avg_price DECIMAL
total_likes INTEGER
total_follows INTEGER
updated_at TIMESTAMP
```

### Functions

**`get_recommendations(user_id, limit, offset)`**
- Returns personalized product recommendations
- Computes user preferences on-demand
- Includes `recommendation_reason` for each product

**`get_similar_products(product_id, limit)`**
- Returns products similar to a given product
- Matches on brand, category, and price range
- Includes `similarity_reason` for each product

**`compute_user_preferences(user_id)`**
- Aggregates user behavior into preference scores
- Called automatically by `get_recommendations`
- Weights recent activity higher (last 7 days = 3x, last 30 days = 2x)

## Setup

### 1. Run the Migration

In Supabase SQL Editor, run:
```sql
-- Run the full migration file
\i scripts/migration-add-recommendation-system.sql
```

Or copy/paste the contents of `scripts/migration-add-recommendation-system.sql`.

### 2. Verify Installation

```sql
-- Check tables created
SELECT * FROM user_preferences LIMIT 1;

-- Test recommendations (replace with real user ID)
SELECT * FROM get_recommendations('your-user-uuid-here', 10, 0);

-- Test similar products (replace with real product ID)
SELECT * FROM get_similar_products('your-product-uuid-here', 5);
```

## Frontend Integration

### Hooks

**`useRecommendations(limit)`** - For You feed
```typescript
import { useRecommendations } from '@/hooks/useRecommendations';

const { products, loading, error, refetch, loadMore, toggleLike } = useRecommendations(20);

// Each product includes:
// - recommendation_score: number
// - recommendation_reason: 'Perfect match' | 'From brands you love' | 'Similar to items you liked' | 'Trending now' | 'New arrival' | 'Popular pick'
```

**`useSimilarProducts(productId, limit)`** - Product detail page
```typescript
import { useSimilarProducts } from '@/hooks/useRecommendations';

const { products, loading, error, refetch } = useSimilarProducts(productId, 6);

// Each product includes:
// - similarity_score: number
// - similarity_reason: 'Same brand & style' | 'Similar style' | 'More from this brand' | 'You might also like' | 'Similar price range'
```

### Where It's Used

1. **`app/(tabs)/search.tsx`** - "For You" tab uses `get_recommendations`
2. **`app/product/[id].tsx`** - "You Might Also Like" section uses `get_similar_products`

## How Scoring Works

### For Personalized Recommendations

```
Score = (Brand Score × 4.0) + (Category Score × 3.5) + (Freshness/Popularity × 1.0) + (Price Score × 0.5) + Sale Bonus

Brand Score:
- Followed brand: +5 base
- Each liked product from brand: +1 to +3 (weighted by recency)

Category Score:
- Each liked product in same category: +1 to +3 (weighted by recency)

Freshness/Popularity:
- Last 24 hours: +10
- Last 3 days: +8
- Last 7 days: +6
- Last 14 days: +4
- Last 30 days: +2
- Plus: min(like_count, 10)

Price Score:
- Within user's typical range: +5
- Close to average: +3
- Outside range: 0

Sale Bonus: +2 if on sale
```

### For Similar Products

```
Score = Brand Match + Category Match + Price Match + Popularity

Brand Match: +30 if same brand
Category Match: +40 if exact category, +20 if parent category
Price Match: 0-20 based on price proximity
Popularity: min(like_count, 10)
```

## Cold Start Handling

For new users with no activity:
- Returns products sorted by freshness + popularity
- No brand/category personalization applied
- "Popular pick" and "New arrival" labels shown

As users like products and follow brands, recommendations become increasingly personalized.

## Recommendation Reasons

The system provides human-readable explanations:

| Reason | Trigger |
|--------|---------|
| "Perfect match" | High brand + category score |
| "From brands you love" | High brand score only |
| "Similar to items you liked" | High category score only |
| "Trending now" | High freshness/popularity score |
| "New arrival" | Product added in last 7 days |
| "Popular pick" | Default fallback |

## Performance Considerations

1. **Preferences are computed on-demand** - First request may be slower
2. **Triggers mark preferences stale** - On like/follow, preferences flagged for refresh
3. **Results are not cached** - Always fresh but consider caching for scale
4. **Limit results** - Default 50, use pagination for more

## Future Enhancements

1. **Collaborative filtering** - "Users like you also liked..."
2. **View history tracking** - Implicit interest signals
3. **A/B testing** - Test different weight configurations
4. **ML embeddings** - Vector similarity for deeper matching
5. **Precomputed recommendations** - Nightly batch for faster reads
