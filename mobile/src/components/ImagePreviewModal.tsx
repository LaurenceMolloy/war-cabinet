import React from 'react';
import { Modal, Pressable, View, Text, Image, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface ImagePreviewModalProps {
  visible: boolean;
  imageUri: string | null;
  title: string;
  subtitle?: string;
  onClose: () => void;
}

export function ImagePreviewModal({
  visible,
  imageUri,
  title,
  subtitle,
  onClose,
}: ImagePreviewModalProps) {
  const isHq = imageUri?.includes('q70') || imageUri?.includes('_hq');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle.toUpperCase()}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Image */}
          <View style={styles.imageBody}>
            {imageUri ? (
              <View style={styles.imageWrapper}>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode="contain"
                />
                {/* Quality badge */}
                <View style={styles.qualityBadge}>
                  <MaterialCommunityIcons name="target" size={10} color="#3b82f6" />
                  <Text style={styles.qualityText}>
                    {isHq ? 'HQ' : 'STD'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.fallbackContainer}>
                <MaterialCommunityIcons name="image-off-outline" size={48} color="#334155" />
                <Text style={styles.fallbackText}>NO ASSET DATA</Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>TAP ANYWHERE TO DISMISS</Text>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '88%',
    maxWidth: 380,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  title: {
    color: '#f1f5f9',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  imageBody: {
    padding: 12,
  },
  imageWrapper: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  qualityBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  qualityText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  fallbackContainer: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#020617',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderStyle: 'dashed',
  },
  fallbackText: {
    color: '#334155',
    fontSize: 12,
    marginTop: 12,
    fontWeight: 'bold',
  },
  footer: {
    paddingBottom: 18,
    paddingTop: 4,
    alignItems: 'center',
  },
  footerText: {
    color: '#334155',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
