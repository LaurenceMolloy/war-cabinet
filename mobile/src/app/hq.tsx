import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Alert, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { SEEDER_SCENARIOS } from '../services/SeederService';

export default function SecretHQScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);

  const handleLogin = () => {
    if (username.toUpperCase() === 'COMMANDER' && password.toLowerCase() === 'eagle-eye') {
      setIsAuthenticated(true);
    } else {
      Alert.alert('ACCESS DENIED', 'INVALID COMMANDER CREDENTIALS');
    }
  };

  const runScenario = async (id: string) => {
    Alert.alert(
      'CONFIRM SEED',
      `This will WIPE your current local database and deploy the '${id}' scenario. Are you sure?`,
      [
        { text: 'ABORT', style: 'cancel' },
        { 
          text: 'DEPLOY', 
          style: 'destructive',
          onPress: async () => {
            setIsSeeding(true);
            try {
              await SEEDER_SCENARIOS[id].apply(db);
              Alert.alert('DEPLOYMENT SUCCESSFUL', 'Tactical environment re-initialized.', [
                { text: 'RELOAD APP', onPress: () => router.replace('/') }
              ]);
            } catch (e: any) {
              Alert.alert('DEPLOYMENT FAILURE', e.message);
            } finally {
              setIsSeeding(false);
            }
          }
        }
      ]
    );
  };

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.loginCard}>
          <MaterialCommunityIcons name="shield-lock" size={48} color="#3b82f6" style={{ marginBottom: 16 }} />
          <Text style={styles.title}>COMMANDER ACCESS</Text>
          <Text style={styles.subtitle}>ENTER AUTHORIZATION CODE</Text>
          
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="USERNAME..."
            placeholderTextColor="#475569"
            autoCapitalize="characters"
          />
          
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="CODEWORD..."
            placeholderTextColor="#475569"
            secureTextEntry
            autoCapitalize="none"
          />
          
          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginBtnText}>AUTHENTICATE</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={{ marginTop: 20 }} onPress={() => router.back()}>
            <Text style={{ color: '#64748b', fontWeight: 'bold' }}>ABORT MISSION</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={24} color="#3b82f6" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>TACTICAL OVERRIDE</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.infoBox}>
          <MaterialCommunityIcons name="information" size={20} color="#3b82f6" style={{ marginRight: 10 }} />
          <Text style={styles.infoText}>
            Select a database scenario to inject. This is for testing logistical flows and UI states.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>TACTICAL ACTIONS</Text>

        <TouchableOpacity 
          style={[styles.scenarioCard, { borderColor: '#ef4444' }]}
          onPress={() => {
            Alert.alert(
              'NUCLEAR WIPE',
              'This will completely ERASE the local database. This cannot be undone. Confirm tactical reset?',
              [
                { text: 'CANCEL', style: 'cancel' },
                { 
                  text: 'ERASE ALL', 
                  style: 'destructive',
                  onPress: async () => {
                    setIsSeeding(true);
                    try {
                      await db.execAsync('DELETE FROM TacticalLogs');
                      await db.execAsync('DELETE FROM Inventory');
                      await db.execAsync('DELETE FROM ItemTypes');
                      await db.execAsync('DELETE FROM Categories');
                      await db.execAsync('DELETE FROM Cabinets');
                      await db.execAsync('DELETE FROM Missions');
                      await db.execAsync("DELETE FROM Settings");
                      await db.execAsync("DELETE FROM sqlite_sequence");
                      Alert.alert('DATABASE WIPED', 'Environment is now empty.', [
                        { text: 'RELOAD APP', onPress: () => router.replace('/') }
                      ]);
                    } catch (e: any) {
                      Alert.alert('WIPE FAILURE', e.message);
                    } finally {
                      setIsSeeding(false);
                    }
                  }
                }
              ]
            );
          }}
          disabled={isSeeding}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.scenarioId, { color: '#ef4444' }]}>NUCLEAR WIPE</Text>
            <Text style={styles.scenarioRank}>ERASE ALL LOCAL DATA</Text>
          </View>
          <MaterialCommunityIcons name="nuke" size={24} color="#ef4444" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.scenarioCard, { borderColor: '#fbbf24', marginTop: 12 }]}
          onPress={() => router.push('/voice_poc')}
          disabled={isSeeding}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.scenarioId, { color: '#fbbf24' }]}>VOICE INTEL POC</Text>
            <Text style={styles.scenarioRank}>TEST ACOUSTIC-TO-SEMANTIC MAPPING</Text>
          </View>
          <MaterialCommunityIcons name="microphone" size={24} color="#fbbf24" />
        </TouchableOpacity>

        <View style={{ height: 24 }} />

        <Text style={styles.sectionTitle}>SEEDER SCENARIOS</Text>
        
        {Object.entries(SEEDER_SCENARIOS).map(([id, scenario]) => (
          <View key={id} style={styles.scenarioCardContainer}>
            <TouchableOpacity 
              style={styles.scenarioCard}
              onPress={() => runScenario(id)}
              disabled={isSeeding}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.scenarioId}>{id.toUpperCase().replace(/_/g, ' ')}</Text>
                <Text style={styles.scenarioRank}>REQUIRED RANK: {scenario.rank}</Text>
              </View>
              <MaterialCommunityIcons name="database-import" size={24} color="#22c55e" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.infoBtn}
              onPress={() => Alert.alert(id.toUpperCase().replace(/_/g, ' '), scenario.description)}
            >
              <MaterialCommunityIcons name="information-outline" size={20} color="#3b82f6" />
            </TouchableOpacity>
          </View>
        ))}

        {isSeeding && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>INJECTING DATA...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', justifyContent: 'center' },
  loginCard: { margin: 24, padding: 32, backgroundColor: '#0f172a', borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', letterSpacing: 1 },
  subtitle: { color: '#64748b', fontSize: 11, fontWeight: 'bold', marginTop: 4, marginBottom: 24 },
  input: { width: '100%', backgroundColor: '#020617', borderRadius: 8, padding: 16, color: 'white', borderWidth: 1, borderColor: '#334155', marginBottom: 16, textAlign: 'center', fontWeight: 'bold', letterSpacing: 2 },
  loginBtn: { width: '100%', backgroundColor: '#3b82f6', padding: 16, borderRadius: 8, alignItems: 'center' },
  loginBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerTitle: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold', letterSpacing: 2 },
  backBtn: { padding: 8 },
  
  scrollContent: { padding: 20 },
  infoBox: { flexDirection: 'row', backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: 16, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  infoText: { flex: 1, color: '#3b82f6', fontSize: 13, lineHeight: 18 },
  sectionTitle: { color: '#64748b', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12 },
  scenarioCardContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 },
  scenarioCard: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
  infoBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#1e293b' },
  scenarioId: { color: '#f8fafc', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  scenarioRank: { color: '#64748b', fontSize: 10, fontWeight: 'bold' },
  
  loadingOverlay: { marginTop: 20, alignItems: 'center' },
  loadingText: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold', marginTop: 10, letterSpacing: 1 }
});
