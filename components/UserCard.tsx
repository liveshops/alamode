import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface User {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  follower_count?: number;
}

interface UserCardProps {
  user: User;
  isFollowing: boolean;
  onPress: () => void;
  onToggleFollow: () => void;
}

export function UserCard({ user, isFollowing, onPress, onToggleFollow }: UserCardProps) {
  const displayName = user.display_name;
  
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.9}>
      {/* Avatar */}
      {user.avatar_url ? (
        <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{displayName[0].toUpperCase()}</Text>
        </View>
      )}

      {/* User Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.displayName}>{displayName}</Text>
        <Text style={styles.username}>@{user.username}</Text>
      </View>

      {/* Follow Button with Count */}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation();
          onToggleFollow();
        }}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <View
          style={[
            styles.heartBadge,
            isFollowing && styles.heartBadgeLiked,
          ]}>
          <Ionicons
            name={isFollowing ? 'heart' : 'heart-outline'}
            size={18}
            color={isFollowing ? '#fff' : '#000'}
          />
          {(user.follower_count ?? 0) >= 1 && (
            <Text
              style={[
                styles.followerCount,
                isFollowing && styles.followerCountLiked,
              ]}>
              {user.follower_count}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    color: '#666',
  },
  heartBadge: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  heartBadgeLiked: {
    backgroundColor: '#000',
  },
  followerCount: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  followerCountLiked: {
    color: '#fff',
  },
});
