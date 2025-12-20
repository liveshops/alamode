import { Collection, useCollections } from '@/hooks/useCollections';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface AddToCollectionSheetProps {
  visible: boolean;
  productId: string;
  productName: string;
  onClose: () => void;
  onAdded?: (collectionName: string) => void;
}

export function AddToCollectionSheet({
  visible,
  productId,
  productName,
  onClose,
  onAdded,
}: AddToCollectionSheetProps) {
  const { collections, loading, createCollection, addProductToCollection } = useCollections();
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const handleAddToCollection = async (collection: Collection) => {
    setAdding(collection.id);
    const success = await addProductToCollection(collection.id, productId);
    setAdding(null);

    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onAdded?.(collection.name);
      onClose();
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newCollectionName.trim()) return;

    setCreating(true);
    const collectionId = await createCollection(newCollectionName.trim());

    if (collectionId) {
      const success = await addProductToCollection(collectionId, productId);
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onAdded?.(newCollectionName.trim());
        onClose();
      }
    }

    setCreating(false);
    setNewCollectionName('');
    setShowCreateNew(false);
  };

  const handleClose = () => {
    setShowCreateNew(false);
    setNewCollectionName('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={handleClose}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add to Collection</Text>
            <TouchableOpacity onPress={handleClose}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>

          <Text style={styles.productName} numberOfLines={1}>
            {productName}
          </Text>

          {/* Collections List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#000" />
            </View>
          ) : (
            <ScrollView
              style={styles.collectionsList}
              showsVerticalScrollIndicator={false}>
              {/* Create New Collection */}
              {showCreateNew ? (
                <View style={styles.createNewForm}>
                  <TextInput
                    style={styles.input}
                    placeholder="Collection name"
                    value={newCollectionName}
                    onChangeText={setNewCollectionName}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleCreateAndAdd}
                  />
                  <View style={styles.createButtons}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setShowCreateNew(false);
                        setNewCollectionName('');
                      }}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.createButton,
                        !newCollectionName.trim() && styles.createButtonDisabled,
                      ]}
                      onPress={handleCreateAndAdd}
                      disabled={!newCollectionName.trim() || creating}>
                      {creating ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.createButtonText}>Create & Add</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.createNewButton}
                  onPress={() => setShowCreateNew(true)}>
                  <Ionicons name="add-circle-outline" size={24} color="#000" />
                  <Text style={styles.createNewText}>Create New Collection</Text>
                </TouchableOpacity>
              )}

              {/* Existing Collections */}
              {collections.map((collection) => (
                <TouchableOpacity
                  key={collection.id}
                  style={styles.collectionItem}
                  onPress={() => handleAddToCollection(collection)}
                  disabled={adding === collection.id}>
                  <View style={styles.collectionInfo}>
                    <Text style={styles.collectionName}>{collection.name}</Text>
                    <Text style={styles.collectionCount}>
                      {collection.product_count} items
                    </Text>
                  </View>
                  {adding === collection.id ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Ionicons name="add" size={24} color="#000" />
                  )}
                </TouchableOpacity>
              ))}

              {collections.length === 0 && !showCreateNew && (
                <Text style={styles.emptyText}>
                  No collections yet. Create one to get started!
                </Text>
              )}
            </ScrollView>
          )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  productName: {
    fontSize: 14,
    color: '#666',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  collectionsList: {
    paddingHorizontal: 16,
  },
  createNewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  createNewText: {
    fontSize: 16,
    fontWeight: '500',
  },
  createNewForm: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  createButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  createButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#000',
    borderRadius: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  collectionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  collectionInfo: {
    flex: 1,
  },
  collectionName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  collectionCount: {
    fontSize: 13,
    color: '#666',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    paddingVertical: 24,
  },
});
