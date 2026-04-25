import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { Database } from '../database';

export const CommandLedgerView: React.FC = () => {
  const db = useSQLiteContext();
  const [showRawEvents, setShowRawEvents] = useState(false);
  const [rawEvents, setRawEvents] = useState<any[]>([]);

  const loadRawEvents = async () => {
    try {
      const data = await Database.Ledger.getStream(db);
      setRawEvents(data);
    } catch (e) {
      console.error('Failed to load raw ledger:', e);
    }
  };

  const handleToggle = () => {
    const next = !showRawEvents;
    setShowRawEvents(next);
    if (next) loadRawEvents();
  };

  const handlePurge = () => {
    Alert.alert(
      'PURGE LEDGER',
      'Are you sure you want to delete the raw chronological stream? This will break the "Video Tape" for this session.',
      [
        { text: 'ABORT', style: 'cancel' },
        { 
          text: 'CONFIRM PURGE', 
          style: 'destructive',
          onPress: async () => {
            await Database.Ledger.purge(db);
            loadRawEvents();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.toggleBtn} 
        onPress={handleToggle}
      >
        <View style={styles.toggleInner}>
          <MaterialCommunityIcons 
            name={showRawEvents ? "eject" : "tape-measure"} 
            size={14} 
            color="#64748b" 
          />
          <Text style={styles.toggleText}>
            {showRawEvents ? 'EJECT COMMAND LEDGER' : 'ACCESS RAW COMMAND LEDGER'}
          </Text>
        </View>
      </TouchableOpacity>

      {showRawEvents && (
        <View style={styles.ledgerContent}>
          <View style={styles.terminalWindow}>
            <Text style={styles.terminalHeader}>
              [SYSTEM_LOG :: CHRONOLOGICAL_STREAM :: LIMIT_100]
            </Text>
            
            {rawEvents.length === 0 ? (
              <Text style={styles.emptyText}>No events captured in ledger.</Text>
            ) : (
              rawEvents.map((ev) => (
                <View key={ev.id} style={styles.eventRow}>
                  <View style={styles.eventMeta}>
                    <Text style={styles.timestamp}>{new Date(ev.timestamp).toLocaleTimeString()}</Text>
                    <View style={[styles.actionBadge, { backgroundColor: getActionColor(ev.action_type) }]}>
                      <Text style={styles.actionText}>{ev.action_type}</Text>
                    </View>
                    <Text style={styles.entityType}>{ev.entity_type}</Text>
                  </View>
                  <Text style={styles.entityName}>{ev.entity_name}</Text>
                  {ev.details && (
                    <Text style={styles.detailsText}>
                      {ev.details}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
          
          <TouchableOpacity 
            onPress={handlePurge}
            style={styles.purgeBtn}
          >
            <Text style={styles.purgeText}>PURGE LEDGER</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const getActionColor = (type: string) => {
  switch (type) {
    case 'ADD': return '#065f46';
    case 'DELETE': return '#7f1d1d';
    case 'UPDATE': return '#b45309';
    default: return '#1e293b';
  }
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  toggleBtn: {
    alignItems: 'center',
    padding: 10,
  },
  toggleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.3,
  },
  toggleText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  ledgerContent: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 20,
  },
  terminalWindow: {
    backgroundColor: '#000',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  terminalHeader: {
    color: '#22c55e',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 10,
    marginBottom: 10,
  },
  emptyText: {
    color: '#475569',
    fontSize: 10,
  },
  eventRow: {
    marginBottom: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    paddingLeft: 10,
  },
  eventMeta: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  timestamp: {
    color: '#64748b',
    fontSize: 9,
  },
  actionBadge: {
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  actionText: {
    color: '#f8fafc',
    fontSize: 8,
    fontWeight: 'bold',
  },
  entityType: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: 'bold',
  },
  entityName: {
    color: '#f8fafc',
    fontSize: 11,
    marginTop: 2,
  },
  detailsText: {
    color: '#3b82f6',
    fontSize: 8,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  purgeBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
  },
  purgeText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: 'bold',
  }
});
