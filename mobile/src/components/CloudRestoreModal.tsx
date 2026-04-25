import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  Modal, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BackupService } from '../services/BackupService';
import { SQLiteDatabase } from 'expo-sqlite';

interface CloudRestoreModalProps {
  visible: boolean;
  accessToken: string;
  db: SQLiteDatabase;
  onClose: () => void;
  onSuccess: () => void;
}

export const CloudRestoreModal: React.FC<CloudRestoreModalProps> = ({ 
  visible, 
  accessToken, 
  db,
  onClose, 
  onSuccess 
}) => {
  const [backups, setBackups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (visible && accessToken) {
      loadCloudBackups();
    }
  }, [visible, accessToken]);

  const loadCloudBackups = async () => {
    setLoading(true);
    try {
      const list = await BackupService.listCloudBackups(accessToken);
      setBackups(list);
    } catch (e) {
      console.error(e);
      Alert.alert('Cloud Error', 'Failed to retrieve logistical mirrors from Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (file: any) => {
    Alert.alert(
      'INITIATE WORLD STATE RESET?',
      `This will overwrite your entire current database with the state from "${file.description || file.name}".\n\nThis action cannot be undone.`,
      [
        { text: 'ABORT', style: 'cancel' },
        { 
          text: 'CONFIRM RESTORE', 
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              const jsonData = await BackupService.downloadFromCloud(accessToken, file.id);
              
              // PGR RULE #6: Restore Exception Acknowledgement
              // Restore operations use direct SQL populating within BackupService.restore
              // thus bypassing the Ledger and Proactive Backup triggers.
              const success = await BackupService.restore(db, jsonData);
              
              if (success) {
                Alert.alert('RESTORE COMPLETE', 'Logistical network has been reset to the selected recovery point.');
                onSuccess();
                onClose();
              }
            } catch (e) {
              console.error(e);
              Alert.alert('Restore Failed', 'Failed to apply the cloud mirror to the local database.');
            } finally {
              setRestoring(false);
            }
          }
        }
      ]
    );
  };

  const renderBackupItem = ({ item }: { item: any }) => {
    const isBunker = item.name.includes('bunker');
    const date = new Date(item.createdTime).toLocaleString();
    const summary = item.appProperties?.summary || 'No summary available';
    const label = item.description || 'System Archive';

    return (
      <TouchableOpacity 
        style={[styles.itemCard, isBunker && styles.bunkerCard]}
        onPress={() => handleRestore(item)}
      >
        <View style={styles.itemHeader}>
          <MaterialCommunityIcons 
            name={isBunker ? "shield-home" : "history"} 
            size={20} 
            color={isBunker ? "#fbbf24" : "#3b82f6"} 
          />
          <Text style={[styles.itemLabel, isBunker && styles.bunkerLabel]}>
            {label.toUpperCase()}
          </Text>
          {isBunker && (
            <View style={styles.bunkerTag}>
              <Text style={styles.bunkerTagText}>BUNKER</Text>
            </View>
          )}
        </View>

        <Text style={styles.itemSummary}>{summary}</Text>
        
        <View style={styles.itemFooter}>
          <Text style={styles.itemDate}>{date}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color="#475569" />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>CLOUD RECOVERY CENTER</Text>
              <Text style={styles.subtitle}>SELECT ARCHIVE FOR DEPLOYMENT</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>FETCHING TACTICAL MIRRORS...</Text>
            </View>
          ) : (
            <FlatList
              data={(() => {
                // Deduplicate: If a bunker exists, don't show the regular backup with the same timestamp
                const bunkerTs = new Set(backups.filter(f => f.name.includes('bunker')).map(f => f.appProperties?.timestamp));
                const filteredBackups = backups.filter(f => f.name.includes('bunker') || !bunkerTs.has(f.appProperties?.timestamp));

                return [
                  ...(filteredBackups.filter(f => f.name.includes('bunker')).length > 0 ? [{ id: 'header-bunker', type: 'header', title: 'BUNKER ARCHIVE (PINNED)' }] : []),
                  ...filteredBackups.filter(f => f.name.includes('bunker')),
                  ...(filteredBackups.filter(f => !f.name.includes('bunker')).length > 0 ? [{ id: 'header-backups', type: 'header', title: 'TACTICAL MIRRORS (AUTO/MANUAL)' }] : []),
                  ...filteredBackups.filter(f => !f.name.includes('bunker')),
                ];
              })()}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                if (item.type === 'header') {
                  return (
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionHeaderTitle}>{item.title}</Text>
                      <View style={styles.sectionHeaderLine} />
                    </View>
                  );
                }
                return renderBackupItem({ item });
              }}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.center}>
                  <MaterialCommunityIcons name="cloud-off-outline" size={48} color="#334155" />
                  <Text style={styles.emptyText}>NO CLOUD MIRRORS DETECTED</Text>
                </View>
              }
            />
          )}

          {restoring && (
            <View style={styles.restoringOverlay}>
              <ActivityIndicator size="large" color="#fbbf24" />
              <Text style={styles.restoringText}>RE-INITIALIZING LOGISTICS...</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#1e293b',
    borderRadius: 20,
  },
  list: {
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
    gap: 12,
  },
  sectionHeaderTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  itemCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bunkerCard: {
    borderColor: '#fbbf24',
    backgroundColor: '#1c1917',
    borderWidth: 2,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemLabel: {
    color: '#3b82f6',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  bunkerLabel: {
    color: '#fbbf24',
  },
  bunkerTag: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  bunkerTagText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  itemSummary: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  itemDate: {
    color: '#64748b',
    fontSize: 11,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    color: '#64748b',
    marginTop: 16,
    fontSize: 12,
    letterSpacing: 1,
  },
  emptyText: {
    color: '#475569',
    marginTop: 16,
    fontSize: 14,
  },
  restoringOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 24,
  },
  restoringText: {
    color: '#fbbf24',
    marginTop: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
