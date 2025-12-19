import { UserCard } from '@/components/UserCard';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/utils/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface User {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  follower_count: number;
}

export default function UserFollowersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [userName, setUserName] = useState('');
  const [followers, setFollowers] = useState<User[]>([]);
  const [myFollowedUserIds, setMyFollowedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollPositionRef = useRef(0);
  const shouldRestoreScroll = useRef(false);

  useFocusEffect(
    useCallback(() => {
      shouldRestoreScroll.current = scrollPositionRef.current > 0;
      fetchFollowers();
    }, [id, user])
  );

  const fetchFollowers = async () => {
    if (!id || !user) return;

    try {
      setLoading(true);

      // Fetch user's display name
      const { data: userData } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', id)
        .single();

      if (userData) {
        setUserName(userData.display_name);
      }

      // Fetch users who follow this user
      const { data: followersData, error: followersError } = await supabase
        .from('user_follows_users')
        .select(
          `
          follower_id,
          profiles!user_follows_users_follower_id_fkey (
            id,
            display_name,
            username,
            avatar_url,
            follower_count
          )
        `
        )
        .eq('following_id', id);

      if (followersError) throw followersError;

      const users = (followersData || [])
        .map((item: any) => {
          const profile = item.profiles;
          if (!profile) return null;
          return {
            id: profile.id,
            display_name: profile.display_name,
            username: profile.username,
            avatar_url: profile.avatar_url,
            follower_count: profile.follower_count,
          };
        })
        .filter(Boolean) as User[];

      setFollowers(users);

      // Fetch current user's followed users
      if (user) {
        const { data: myFollowingData } = await supabase
          .from('user_follows_users')
          .select('following_id')
          .eq('follower_id', user.id);

        const followedIds = new Set(myFollowingData?.map((f) => f.following_id) || []);
        setMyFollowedUserIds(followedIds);
      }
    } catch (err) {
      console.error('Error fetching followers:', err);
    } finally {
      setLoading(false);
      // Restore scroll after data loads
      if (shouldRestoreScroll.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToOffset({
            offset: scrollPositionRef.current,
            animated: false,
          });
          shouldRestoreScroll.current = false;
        }, 300);
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFollowers();
    setRefreshing(false);
  };

  const handleToggleFollow = async (userId: string) => {
    if (!user) return;

    // Don't allow following yourself
    if (userId === user.id) return;

    const wasFollowing = myFollowedUserIds.has(userId);

    // Optimistic update
    setMyFollowedUserIds((prev) => {
      const newSet = new Set(prev);
      if (wasFollowing) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });

    // Update follower count optimistically
    setFollowers((prev) =>
      prev.map((u) =>
        u.id === userId
          ? {
              ...u,
              follower_count: wasFollowing
                ? Math.max(0, u.follower_count - 1)
                : u.follower_count + 1,
            }
          : u
      )
    );

    try {
      if (wasFollowing) {
        await supabase
          .from('user_follows_users')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
      } else {
        await supabase.from('user_follows_users').upsert(
          { follower_id: user.id, following_id: userId },
          { onConflict: 'follower_id,following_id', ignoreDuplicates: true }
        );
      }
    } catch (err) {
      console.error('Error toggling follow:', err);
      // Revert on error
      setMyFollowedUserIds((prev) => {
        const newSet = new Set(prev);
        if (wasFollowing) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
      setFollowers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                follower_count: wasFollowing
                  ? u.follower_count + 1
                  : Math.max(0, u.follower_count - 1),
              }
            : u
        )
      );
    }
  };

  const handleUserPress = (userId: string) => {
    if (userId === user?.id) {
      router.push('/(tabs)/profile');
    } else {
      router.push(`/user/${userId}`);
    }
  };

  if (loading && followers.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {userName ? `${userName}'s Followers` : 'Followers'}
        </Text>
        <View style={styles.backButton} />
      </View>

      <FlatList
        ref={flatListRef}
        data={followers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollPositionRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#000" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {userName ? `${userName} doesn't have any followers yet` : 'No followers found'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <UserCard
            user={item}
            isFollowing={myFollowedUserIds.has(item.id)}
            onPress={() => handleUserPress(item.id)}
            onToggleFollow={() => handleToggleFollow(item.id)}
          />
        )}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    width: 40,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
  },
});
