import { AddToCollectionSheet } from '@/components/AddToCollectionSheet';
import { BrandRowCard } from '@/components/BrandRowCard';
import { ProductCard } from '@/components/ProductCard';
import { UserCard } from '@/components/UserCard';
import { useAuth } from '@/contexts/AuthContext';
import { Product } from '@/hooks/useProducts';
import { RecommendedProduct } from '@/hooks/useRecommendations';
import { getOptimizedImageUrl } from '@/utils/imageUtils';
import { buildSearchFilter } from '@/utils/searchUtils';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BrandWithProducts {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  follower_count: number;
  products: Product[];
}

interface User {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  follower_count: number;
}

type TabType = 'products' | 'brands' | 'users';
type SortType = 'followed_brands' | 'all_brands';
type FilterType = 'for_you' | 'newest' | 'most_liked';
type TimeRangeType = '7d' | '30d' | '90d';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const searchInputRef = useRef<TextInput>(null);

  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [sortType, setSortType] = useState<SortType>('all_brands');
  const [filterType, setFilterType] = useState<FilterType>('for_you');
  const [timeRange, setTimeRange] = useState<TimeRangeType>('30d');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [forYouProducts, setForYouProducts] = useState<RecommendedProduct[]>([]);
  const [brands, setBrands] = useState<BrandWithProducts[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [followedBrandIds, setFollowedBrandIds] = useState<Set<string>>(new Set());
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collectionSheetVisible, setCollectionSheetVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [forYouOffset, setForYouOffset] = useState(0);
  const [forYouHasMore, setForYouHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newestOffset, setNewestOffset] = useState(0);
  const [newestHasMore, setNewestHasMore] = useState(true);
  const [mostLikedOffset, setMostLikedOffset] = useState(0);
  const [mostLikedHasMore, setMostLikedHasMore] = useState(true);
  const [brandsOffset, setBrandsOffset] = useState(0);
  const [brandsHasMore, setBrandsHasMore] = useState(true);
  const [loadingMoreBrands, setLoadingMoreBrands] = useState(false);
  const BRANDS_PER_PAGE = 10;
  const PRODUCTS_PER_PAGE = 50;

  // Scroll position refs for each tab
  const productsListRef = useRef<FlatList>(null);
  const brandsListRef = useRef<FlatList>(null);
  const usersListRef = useRef<FlatList>(null);
  const productsScrollRef = useRef(0);
  const brandsScrollRef = useRef(0);
  const usersScrollRef = useRef(0);
  const shouldRestoreScroll = useRef<TabType | null>(null);
  const prefetchedUrls = useRef<Set<string>>(new Set());

  // Prefetch images for upcoming products
  const prefetchImages = useCallback((startIndex: number, productList: any[]) => {
    const PREFETCH_COUNT = 20;
    const endIndex = Math.min(startIndex + PREFETCH_COUNT, productList.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const product = productList[i];
      if (product?.image_url && !prefetchedUrls.current.has(product.image_url)) {
        prefetchedUrls.current.add(product.image_url);
        Image.prefetch(getOptimizedImageUrl(product.image_url, 400));
      }
    }
  }, []);

  const onProductsViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) {
      const lastVisibleIndex = Math.max(...viewableItems.map(item => item.index ?? 0));
      prefetchImages(lastVisibleIndex + 4, forYouProducts);
    }
  }, [prefetchImages, forYouProducts]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 100,
  }).current;

  // Handle search submit (when user presses return)
  const handleSearchSubmit = () => {
    setDebouncedQuery(searchQuery);
  };

  useFocusEffect(
    useCallback(() => {
      // Mark which tab needs scroll restoration
      if (activeTab === 'products' && productsScrollRef.current > 0) {
        shouldRestoreScroll.current = 'products';
      } else if (activeTab === 'brands' && brandsScrollRef.current > 0) {
        shouldRestoreScroll.current = 'brands';
      } else if (activeTab === 'users' && usersScrollRef.current > 0) {
        shouldRestoreScroll.current = 'users';
      }
      fetchData();
    }, [user, debouncedQuery, activeTab, sortType, filterType, timeRange])
  );

  const fetchData = async () => {
    if (!user) {
      setProducts([]);
      setBrands([]);
      setUsers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch user's followed brands and users
      const [followedBrandsRes, followedUsersRes] = await Promise.all([
        supabase
          .from('user_follows_brands')
          .select('brand_id')
          .eq('user_id', user.id),
        supabase
          .from('user_follows_users')
          .select('following_id')
          .eq('follower_id', user.id),
      ]);

      const followedBrandIdsSet = new Set(
        followedBrandsRes.data?.map((f) => f.brand_id) || []
      );
      const followedUserIdsSet = new Set(
        followedUsersRes.data?.map((f) => f.following_id) || []
      );

      setFollowedBrandIds(followedBrandIdsSet);
      setFollowedUserIds(followedUserIdsSet);

      if (activeTab === 'products') {
        await fetchProductsWithFilters(followedBrandIdsSet);
      } else if (activeTab === 'brands') {
        await fetchBrands();
      } else if (activeTab === 'users') {
        await fetchUsers();
      }
    } catch (err) {
      console.error('Error fetching search data:', err);
    } finally {
      setLoading(false);
      // Restore scroll after data loads
      if (shouldRestoreScroll.current) {
        setTimeout(() => {
          switch (shouldRestoreScroll.current) {
            case 'products':
              productsListRef.current?.scrollToOffset({
                offset: productsScrollRef.current,
                animated: false,
              });
              break;
            case 'brands':
              brandsListRef.current?.scrollToOffset({
                offset: brandsScrollRef.current,
                animated: false,
              });
              break;
            case 'users':
              usersListRef.current?.scrollToOffset({
                offset: usersScrollRef.current,
                animated: false,
              });
              break;
          }
          shouldRestoreScroll.current = null;
        }, 300);
      }
    }
  };

  const fetchProductsWithFilters = async (followedBrandIdsSet: Set<string>, reset = true) => {
    try {
      const offset = reset ? 0 : forYouOffset;
      let productsData: any[] = [];

      // Determine time range for most_liked filter
      const getTimeRangeDays = () => {
        switch (timeRange) {
          case '7d': return 7;
          case '30d': return 30;
          case '90d': return 90;
          default: return 30;
        }
      };

      if (filterType === 'for_you') {
        // For You - personalized recommendations
        if (debouncedQuery) {
          // Search with optional brand filter - with pagination
          const currentOffset = reset ? 0 : forYouOffset;
          if (reset) {
            setForYouOffset(0);
          }

          let query = supabase
            .from('products')
            .select(`
              id, name, price, sale_price, image_url, product_url, like_count, taxonomy_category_name, description,
              brand:brands(id, name, slug)
            `)
            .or(buildSearchFilter(debouncedQuery))
            .eq('is_available', true)
            .order('like_count', { ascending: false })
            .range(currentOffset, currentOffset + PRODUCTS_PER_PAGE - 1);

          // Apply brand filter if "Followed Brands" is selected
          if (sortType === 'followed_brands' && followedBrandIdsSet.size > 0) {
            query = query.in('brand_id', Array.from(followedBrandIdsSet));
          }

          const { data: searchData, error: searchError } = await query;
          if (searchError) throw searchError;

          let products = searchData || [];
          if (user && products.length > 0) {
            const { data: likedData } = await supabase
              .from('user_likes_products')
              .select('product_id')
              .eq('user_id', user.id)
              .in('product_id', products.map((p: any) => p.id));

            const likedIds = new Set(likedData?.map(l => l.product_id) || []);
            products = products.map((p: any) => ({ 
              ...p, 
              is_liked: likedIds.has(p.id),
              brand: p.brand || { id: p.brand_id, name: p.brand_name, slug: p.brand_slug },
            }));
          }
          productsData = products;
          
          if (!reset) {
            // Filter out duplicates when appending - use functional setState to avoid race conditions
            setForYouProducts(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newProducts = productsData.filter(p => !existingIds.has(p.id));
              return [...prev, ...newProducts];
            });
            setForYouOffset(currentOffset + PRODUCTS_PER_PAGE);
          } else {
            setForYouProducts(productsData);
            setForYouOffset(PRODUCTS_PER_PAGE);
          }
          setForYouHasMore(products.length === PRODUCTS_PER_PAGE);

          // Record impressions for search results
          if (user && productsData.length > 0) {
            const productIds = productsData.map(p => p.id);
            supabase.rpc('record_product_impressions', {
              p_user_id: user.id,
              p_product_ids: productIds,
            }).then(({ error }) => {
              if (error) console.log('Search impression tracking skipped:', error.message);
            });
          }
        } else {
          // Personalized recommendations
          const { data, error } = await supabase.rpc('get_recommendations', {
            target_user_id: user!.id,
            result_limit: 20,
            offset_val: offset,
          });

          if (error) throw error;

          const mappedProducts: RecommendedProduct[] = (data || []).map((item: any) => ({
            ...item,
            id: item.product_id,
            is_liked: item.is_liked_by_user,
            brand: {
              id: item.brand_id,
              name: item.brand_name,
              slug: item.brand_slug,
            },
          }));

          // Filter by followed brands if needed
          const filteredProducts = sortType === 'followed_brands' && followedBrandIdsSet.size > 0
            ? mappedProducts.filter(p => followedBrandIdsSet.has(p.brand.id))
            : mappedProducts;

          if (reset) {
            setForYouProducts(filteredProducts);
            setForYouOffset(20);
          } else {
            // Filter out duplicates when appending - use functional setState
            setForYouProducts(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newProducts = filteredProducts.filter(p => !existingIds.has(p.id));
              return [...prev, ...newProducts];
            });
            setForYouOffset(prev => prev + 20);
          }
          setForYouHasMore(mappedProducts.length === 20);
        }
      } else if (filterType === 'newest') {
        // Newest products with pagination
        const currentOffset = reset ? 0 : newestOffset;
        if (reset) {
          setNewestOffset(0);
        }

        let query = supabase
          .from('products')
          .select(`
            id, name, price, sale_price, image_url, product_url, like_count, taxonomy_category_name, created_at, description,
            brand:brands(id, name, slug)
          `)
          .eq('is_available', true)
          .order('created_at', { ascending: false })
          .range(currentOffset, currentOffset + PRODUCTS_PER_PAGE - 1);

        if (debouncedQuery) {
          query = query.or(buildSearchFilter(debouncedQuery));
        }

        if (sortType === 'followed_brands' && followedBrandIdsSet.size > 0) {
          query = query.in('brand_id', Array.from(followedBrandIdsSet));
        }

        const { data, error } = await query;
        if (error) throw error;

        let products = data || [];
        if (user && products.length > 0) {
          const { data: likedData } = await supabase
            .from('user_likes_products')
            .select('product_id')
            .eq('user_id', user.id)
            .in('product_id', products.map((p: any) => p.id));

          const likedIds = new Set(likedData?.map(l => l.product_id) || []);
          products = products.map((p: any) => ({ 
            ...p, 
            is_liked: likedIds.has(p.id),
            brand: p.brand || { id: null, name: 'Unknown', slug: '' },
          }));
        }

        if (!reset) {
          // Filter out duplicates when appending - use functional setState
          setForYouProducts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newProducts = products.filter(p => !existingIds.has(p.id));
            return [...prev, ...newProducts as any];
          });
          setNewestOffset(currentOffset + PRODUCTS_PER_PAGE);
        } else {
          setForYouProducts(products as any);
          setNewestOffset(PRODUCTS_PER_PAGE);
        }
        setNewestHasMore(products.length === PRODUCTS_PER_PAGE);

        // Record impressions for newest products
        if (user && products.length > 0) {
          const productIds = products.map((p: any) => p.id);
          supabase.rpc('record_product_impressions', {
            p_user_id: user.id,
            p_product_ids: productIds,
          }).then(({ error }) => {
            if (error) console.log('Newest impression tracking skipped:', error.message);
          });
        }
      } else if (filterType === 'most_liked') {
        // Most liked with time range and pagination
        const days = getTimeRangeDays();
        const dateThreshold = new Date();
        dateThreshold.setDate(dateThreshold.getDate() - days);
        const currentOffset = reset ? 0 : mostLikedOffset;
        if (reset) {
          setMostLikedOffset(0);
        }

        let query = supabase
          .from('products')
          .select(`
            id, name, price, sale_price, image_url, product_url, like_count, taxonomy_category_name, description,
            brand:brands(id, name, slug)
          `)
          .eq('is_available', true)
          .gte('created_at', dateThreshold.toISOString())
          .order('like_count', { ascending: false })
          .range(currentOffset, currentOffset + PRODUCTS_PER_PAGE - 1);

        if (debouncedQuery) {
          query = query.or(buildSearchFilter(debouncedQuery));
        }

        if (sortType === 'followed_brands' && followedBrandIdsSet.size > 0) {
          query = query.in('brand_id', Array.from(followedBrandIdsSet));
        }

        const { data, error } = await query;
        if (error) throw error;

        let products = data || [];
        if (user && products.length > 0) {
          const { data: likedData } = await supabase
            .from('user_likes_products')
            .select('product_id')
            .eq('user_id', user.id)
            .in('product_id', products.map((p: any) => p.id));

          const likedIds = new Set(likedData?.map(l => l.product_id) || []);
          products = products.map((p: any) => ({ 
            ...p, 
            is_liked: likedIds.has(p.id),
            brand: p.brand || { id: null, name: 'Unknown', slug: '' },
          }));
        }

        if (!reset) {
          // Filter out duplicates when appending - use functional setState
          setForYouProducts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const newProducts = products.filter(p => !existingIds.has(p.id));
            return [...prev, ...newProducts as any];
          });
          setMostLikedOffset(currentOffset + PRODUCTS_PER_PAGE);
        } else {
          setForYouProducts(products as any);
          setMostLikedOffset(PRODUCTS_PER_PAGE);
        }
        setMostLikedHasMore(products.length === PRODUCTS_PER_PAGE);

        // Record impressions for most liked products
        if (user && products.length > 0) {
          const productIds = products.map((p: any) => p.id);
          supabase.rpc('record_product_impressions', {
            p_user_id: user.id,
            p_product_ids: productIds,
          }).then(({ error }) => {
            if (error) console.log('Most liked impression tracking skipped:', error.message);
          });
        }
      }
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const loadMoreProducts = async () => {
    if (filterType === 'for_you') {
      if (loadingMore || !forYouHasMore) return;
    } else if (filterType === 'newest') {
      if (loadingMore || !newestHasMore) return;
    } else if (filterType === 'most_liked') {
      if (loadingMore || !mostLikedHasMore) return;
    }
    
    setLoadingMore(true);
    await fetchProductsWithFilters(followedBrandIds, false);
    setLoadingMore(false);
  };

  const fetchBrands = async (reset = true) => {
    try {
      const currentOffset = reset ? 0 : brandsOffset;

      let brandsData: any[] = [];

      // If searching, query brands directly with server-side filter
      if (debouncedQuery) {
        const { data: searchData, error: searchError } = await supabase
          .from('brands')
          .select('id, name, slug, logo_url, follower_count')
          .ilike('name', `%${debouncedQuery}%`)
          .order('follower_count', { ascending: false })
          .limit(50);

        if (searchError) throw searchError;

        // For searched brands, fetch their products separately
        const brandsWithProducts = await Promise.all(
          (searchData || []).map(async (brand: any) => {
            const { data: productsData } = await supabase
              .from('products')
              .select(`
                id, name, price, sale_price, currency, image_url, product_url, like_count,
                brand:brands(id, name, slug, logo_url)
              `)
              .eq('brand_id', brand.id)
              .eq('is_available', true)
              .order('like_count', { ascending: false })
              .limit(6);

            // Check which products are liked
            let products = productsData || [];
            if (user && products.length > 0) {
              const { data: likedData } = await supabase
                .from('user_likes_products')
                .select('product_id')
                .eq('user_id', user.id)
                .in('product_id', products.map(p => p.id));

              const likedIds = new Set(likedData?.map(l => l.product_id) || []);
              products = products.map(p => ({ ...p, is_liked: likedIds.has(p.id) }));
            }

            return { ...brand, products };
          })
        );

        brandsData = brandsWithProducts;
        setBrands(brandsData);
        setBrandsHasMore(false); // No pagination for search results
      } else {
        // No search - use optimized paginated function
        const { data, error } = await supabase
          .rpc('get_shop_brands', {
            p_user_id: user!.id,
            p_products_per_brand: 6,
            p_limit: BRANDS_PER_PAGE,
            p_offset: currentOffset
          });

        if (error) throw error;

        brandsData = data || [];

        // Process brands data
        const brandsWithProducts: BrandWithProducts[] = brandsData.map((brand: any) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          logo_url: brand.logo_url,
          follower_count: brand.follower_count,
          products: brand.products || [],
        }));

        if (reset) {
          setBrands(brandsWithProducts);
          setBrandsOffset(BRANDS_PER_PAGE);
        } else {
          // Filter out duplicates
          setBrands(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const newBrands = brandsWithProducts.filter(b => !existingIds.has(b.id));
            return [...prev, ...newBrands];
          });
          setBrandsOffset(prev => prev + BRANDS_PER_PAGE);
        }

        setBrandsHasMore(brandsWithProducts.length === BRANDS_PER_PAGE);
      }
    } catch (err) {
      console.error('Error fetching brands:', err);
    } finally {
      setLoadingMoreBrands(false);
    }
  };

  const loadMoreBrands = async () => {
    if (loadingMoreBrands || !brandsHasMore) return;
    setLoadingMoreBrands(true);
    await fetchBrands(false);
  };

  const fetchUsers = async () => {
    try {
      let query = supabase.from('profiles').select('id, display_name, username, avatar_url, follower_count');

      // Apply search filter if there's a query
      if (debouncedQuery) {
        query = query.or(
          `display_name.ilike.%${debouncedQuery}%,username.ilike.%${debouncedQuery}%`
        );
      }

      // Order by popularity (follower count) and limit results
      query = query
        .neq('id', user!.id)
        .order('follower_count', { ascending: false })
        .limit(50);

      const { data, error } = await query;

      if (error) throw error;

      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleProductPress = useCallback((productId: string) => {
    router.push(`/product/${productId}`);
  }, [router]);

  const handleBrandPress = useCallback((brandSlug: string) => {
    router.push(`/brand/${brandSlug}`);
  }, [router]);

  const handleToggleLikeProduct = async (productId: string) => {
    if (!user) return;

    // Check both product lists
    const product = products.find((p) => p.id === productId);
    const forYouProduct = forYouProducts.find((p) => p.id === productId);
    const targetProduct = product || forYouProduct;
    if (!targetProduct) return;

    const wasLiked = targetProduct.is_liked ?? false;
    const newLikedState = !wasLiked;
    const newLikeCount = wasLiked ? Math.max(0, targetProduct.like_count - 1) : targetProduct.like_count + 1;

    // Optimistic update for both lists
    if (product) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, is_liked: newLikedState, like_count: newLikeCount }
            : p
        )
      );
    }
    if (forYouProduct) {
      setForYouProducts((prev) =>
        prev.map((p): RecommendedProduct =>
          p.id === productId
            ? { ...p, is_liked: newLikedState, is_liked_by_user: newLikedState, like_count: newLikeCount }
            : p
        )
      );
    }

    try {
      if (wasLiked) {
        await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
      } else {
        const { error } = await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: productId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert on error
      const revertLikeCount = wasLiked ? targetProduct.like_count + 1 : Math.max(0, targetProduct.like_count - 1);
      if (product) {
        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId
              ? { ...p, is_liked: wasLiked, like_count: revertLikeCount }
              : p
          )
        );
      }
      if (forYouProduct) {
        setForYouProducts((prev) =>
          prev.map((p): RecommendedProduct =>
            p.id === productId
              ? { ...p, is_liked: wasLiked, is_liked_by_user: wasLiked, like_count: revertLikeCount }
              : p
          )
        );
      }
    }
  };

  const handleToggleLikeProductInBrand = async (productId: string) => {
    if (!user) return;

    // Find the product in brands
    let product: Product | undefined;
    let brandId: string | undefined;

    for (const brand of brands) {
      const foundProduct = brand.products.find((p) => p.id === productId);
      if (foundProduct) {
        product = foundProduct;
        brandId = brand.id;
        break;
      }
    }

    if (!product || !brandId) return;

    const wasLiked = product.is_liked;

    // Optimistic update
    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId
          ? {
              ...b,
              products: b.products.map((p) =>
                p.id === productId
                  ? {
                      ...p,
                      is_liked: !wasLiked,
                      like_count: wasLiked ? Math.max(0, p.like_count - 1) : p.like_count + 1,
                    }
                  : p
              ),
            }
          : b
      )
    );

    try {
      if (wasLiked) {
        await supabase
          .from('user_likes_products')
          .delete()
          .eq('user_id', user.id)
          .eq('product_id', productId);
      } else {
        const { error } = await supabase
          .from('user_likes_products')
          .upsert(
            { user_id: user.id, product_id: productId },
            { onConflict: 'user_id,product_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling like:', err);
      // Revert on error
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brandId
            ? {
                ...b,
                products: b.products.map((p) =>
                  p.id === productId
                    ? {
                        ...p,
                        is_liked: wasLiked,
                        like_count: wasLiked ? p.like_count + 1 : Math.max(0, p.like_count - 1),
                      }
                    : p
                ),
              }
            : b
        )
      );
    }
  };

  const handleToggleFollowBrand = async (brandId: string) => {
    if (!user) return;

    const wasFollowing = followedBrandIds.has(brandId);

    // Optimistic update
    setFollowedBrandIds((prev) => {
      const newSet = new Set(prev);
      if (wasFollowing) {
        newSet.delete(brandId);
      } else {
        newSet.add(brandId);
      }
      return newSet;
    });

    setBrands((prev) =>
      prev.map((b) =>
        b.id === brandId
          ? {
              ...b,
              follower_count: wasFollowing ? b.follower_count - 1 : b.follower_count + 1,
            }
          : b
      )
    );

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_brands')
          .delete()
          .eq('user_id', user.id)
          .eq('brand_id', brandId);
      } else {
        const { error } = await supabase
          .from('user_follows_brands')
          .upsert(
            { user_id: user.id, brand_id: brandId },
            { onConflict: 'user_id,brand_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setFollowedBrandIds((prev) => {
        const newSet = new Set(prev);
        if (wasFollowing) {
          newSet.add(brandId);
        } else {
          newSet.delete(brandId);
        }
        return newSet;
      });

      setBrands((prev) =>
        prev.map((b) =>
          b.id === brandId
            ? {
                ...b,
                follower_count: wasFollowing ? b.follower_count + 1 : b.follower_count - 1,
              }
            : b
        )
      );
    }
  };

  const handleToggleFollowUser = async (userId: string) => {
    if (!user) return;

    const wasFollowing = followedUserIds.has(userId);

    // Optimistic update
    setFollowedUserIds((prev) => {
      const newSet = new Set(prev);
      if (wasFollowing) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_users')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
      } else {
        const { error } = await supabase
          .from('user_follows_users')
          .upsert(
            { follower_id: user.id, following_id: userId },
            { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
          );

        if (error) throw error;
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setFollowedUserIds((prev) => {
        const newSet = new Set(prev);
        if (wasFollowing) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    }
  };

  const renderProductsList = () => (
    <FlatList
      ref={productsListRef}
      key="products-grid"
      data={forYouProducts}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.productRow}
      contentContainerStyle={styles.productListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        productsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      maxToRenderPerBatch={10}
      windowSize={5}
      removeClippedSubviews={true}
      initialNumToRender={10}
      updateCellsBatchingPeriod={50}
      onViewableItemsChanged={onProductsViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {debouncedQuery
              ? "We couldn't find any products"
              : 'Follow some brands to see products here'}
          </Text>
          {debouncedQuery && (
            <Text style={styles.emptySubtext}>
              Try searching for something else or browse our popular products
            </Text>
          )}
        </View>
      }
      onEndReached={loadMoreProducts}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color="#000" />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={styles.productCardWrapper}>
          <ProductCard
            product={item as any}
            onPress={() => handleProductPress(item.id)}
            onLike={() => handleToggleLikeProduct(item.id)}
            onBrandPress={() => handleBrandPress(item.brand.slug)}
            onLongPress={() => {
              setSelectedProduct({ id: item.id, name: item.name });
              setCollectionSheetVisible(true);
            }}
          />
        </View>
      )}
    />
  );

  const renderBrandsList = () => (
    <FlatList
      ref={brandsListRef}
      key="brands-list"
      data={brands}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.brandListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        brandsScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      onEndReached={loadMoreBrands}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListFooterComponent={
        loadingMoreBrands ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color="#000" />
          </View>
        ) : null
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {debouncedQuery ? "No brands match your search" : 'No brands available yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {debouncedQuery 
                ? 'Try a different search term'
                : 'Check out the Shop tab to discover brands'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <BrandRowCard
          brandName={item.name}
          brandSlug={item.slug}
          isFollowing={followedBrandIds.has(item.id)}
          followerCount={item.follower_count}
          products={item.products}
          onBrandPress={() => handleBrandPress(item.slug)}
          onToggleFollow={() => handleToggleFollowBrand(item.id)}
          onProductPress={handleProductPress}
          onToggleLike={handleToggleLikeProductInBrand}
        />
      )}
    />
  );

  const renderUsersList = () => (
    <FlatList
      ref={usersListRef}
      key="users-list"
      data={users}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.userListContent}
      showsVerticalScrollIndicator={false}
      onScroll={(e) => {
        usersScrollRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
      }
      ListEmptyComponent={
        loading ? null : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {debouncedQuery ? "No users match your search" : 'No users to show yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {debouncedQuery 
                ? 'Try a different name or username'
                : 'Be the first to invite your friends!'}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => (
        <UserCard
          user={item}
          isFollowing={followedUserIds.has(item.id)}
          onPress={() => router.push(`/user/${item.id}`)}
          onToggleFollow={() => handleToggleFollowUser(item.id)}
        />
      )}
    />
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Search */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setDebouncedQuery('');
                searchInputRef.current?.blur();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Level 1 Tabs: Products, Brands, Users */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'products' && styles.tabActive]}
          onPress={() => setActiveTab('products')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'products' && styles.tabTextActive]}>
            Products
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'brands' && styles.tabActive]}
          onPress={() => setActiveTab('brands')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'brands' && styles.tabTextActive]}>
            Brands
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.7}>
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Users
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sort/Filter options - only show when Products tab is active */}
      {activeTab === 'products' && (
        <View style={styles.sortFilterContainer}>
          {/* Sort Column */}
          <View style={styles.sortFilterColumn}>
            <Text style={styles.sortFilterLabel}>Sort:</Text>
            <TouchableOpacity onPress={() => setSortType('followed_brands')} activeOpacity={0.7}>
              <Text style={[styles.sortFilterOption, sortType === 'followed_brands' && styles.sortFilterOptionActive]}>
                Followed Brands
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSortType('all_brands')} activeOpacity={0.7}>
              <Text style={[styles.sortFilterOption, sortType === 'all_brands' && styles.sortFilterOptionActive]}>
                All Brands
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filter Column */}
          <View style={styles.sortFilterColumn}>
            <Text style={styles.sortFilterLabel}>Filter:</Text>
            <TouchableOpacity onPress={() => setFilterType('for_you')} activeOpacity={0.7}>
              <Text style={[styles.sortFilterOption, filterType === 'for_you' && styles.sortFilterOptionActive]}>
                For You
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFilterType('newest')} activeOpacity={0.7}>
              <Text style={[styles.sortFilterOption, filterType === 'newest' && styles.sortFilterOptionActive]}>
                Newest
              </Text>
            </TouchableOpacity>
            <View style={styles.mostLikedRow}>
              <TouchableOpacity onPress={() => setFilterType('most_liked')} activeOpacity={0.7}>
                <Text style={[styles.sortFilterOption, filterType === 'most_liked' && styles.sortFilterOptionActive]}>
                  Most Liked
                </Text>
              </TouchableOpacity>
              {filterType === 'most_liked' && (
                <View style={styles.timeRangeContainer}>
                  <TouchableOpacity onPress={() => setTimeRange('7d')} activeOpacity={0.7}>
                    <Text style={[styles.timeRangeOption, timeRange === '7d' && styles.timeRangeOptionActive]}>
                      7d
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setTimeRange('30d')} activeOpacity={0.7}>
                    <Text style={[styles.timeRangeOption, timeRange === '30d' && styles.timeRangeOptionActive]}>
                      30d
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setTimeRange('90d')} activeOpacity={0.7}>
                    <Text style={[styles.timeRangeOption, timeRange === '90d' && styles.timeRangeOptionActive]}>
                      90d
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Content */}
      {activeTab === 'products'
        ? renderProductsList()
        : activeTab === 'brands'
        ? renderBrandsList()
        : renderUsersList()}

      {/* Add to Collection Sheet */}
      {selectedProduct && (
        <AddToCollectionSheet
          visible={collectionSheetVisible}
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onClose={() => {
            setCollectionSheetVisible(false);
            setSelectedProduct(null);
          }}
          onAdded={() => {}}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  cancelText: {
    fontSize: 16,
    color: '#007AFF',
    marginLeft: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#000',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '600',
  },
  productListContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  productRow: {
    justifyContent: 'space-between',
  },
  productCardWrapper: {
    flex: 1,
    maxWidth: '48%',
    marginBottom: 4,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  brandListContent: {
    paddingTop: 16,
  },
  userListContent: {
    paddingTop: 8,
  },
  emptyContainer: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  sortFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  sortFilterColumn: {
    flex: 1,
  },
  sortFilterLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  sortFilterOption: {
    fontSize: 16,
    color: '#666',
    paddingVertical: 2,
  },
  sortFilterOptionActive: {
    color: '#000',
    fontWeight: '700',
  },
  mostLikedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    marginLeft: 8,
    alignItems: 'center',
  },
  timeRangeOption: {
    fontSize: 14,
    color: '#666',
    marginHorizontal: 4,
  },
  timeRangeOptionActive: {
    color: '#000',
    fontWeight: '700',
  },
});
