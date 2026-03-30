import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import BRIEFING_DATA from '../data/briefing_data.json';

interface BriefingItem {
  id: string;
  test_marker: string;
  iteration: number;
  screen: string;
  entity: string;
  action: string;
  title: string;
  text: string;
  tags: string[];
}

export default function BriefingScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams();
  const [search, setSearch] = useState((tag as string) || '');

  const data = BRIEFING_DATA as BriefingItem[];
  const allUniqueTags = Array.from(new Set(data.flatMap(item => item.tags))).sort();

  // Precision Query Parser
  const parseAndFilter = (item: BriefingItem, raw: string): boolean => {
    const q = raw.trim().toLowerCase();
    if (!q) return true;
    if (q.startsWith('screen:'))  return item.screen.toLowerCase()  === q.slice(7).trim();
    if (q.startsWith('entity:'))  return item.entity.toLowerCase()  === q.slice(7).trim();
    if (q.startsWith('action:'))  return item.action.toLowerCase()  === q.slice(7).trim();
    if (q.startsWith('#'))        return item.tags.some(t => t.toLowerCase() === q.slice(1));
    // Bare word: title + text full-text only
    return item.title.toLowerCase().includes(q) || item.text.toLowerCase().includes(q);
  };

  const filteredData = data.filter(item => parseAndFilter(item, search));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Tactical Briefing</Text>
          <Text style={styles.subTitle}>(User Guide)</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color="#64748b" style={styles.searchIcon} />
        <TextInput 
          style={styles.searchInput}
          placeholder="Search... bare word, #tag, screen:add, entity:batch"
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
        {search !== '' && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close" size={20} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      <View style={{ marginBottom: 15 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {allUniqueTags.map(t => (
            <TouchableOpacity 
              key={t} 
              onPress={() => setSearch(prev => prev === t ? '' : t)}
              style={[styles.discoveryTag, search.toLowerCase() === t.toLowerCase() && styles.discoveryTagActive]}
            >
              <Text style={[styles.discoveryTagText, search.toLowerCase() === t.toLowerCase() && styles.discoveryTagTextActive]}>
                #{t}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList 
        data={filteredData}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.card}>

            {/* Metadata Strip: screen · entity · action */}
            <View style={styles.metaStrip}>
              <TouchableOpacity style={styles.metaPill} onPress={() => setSearch(`screen:${item.screen}`)}>
                <Text style={styles.metaPillLabel}>Screen</Text>
                <Text style={styles.metaPillValue}>{item.screen}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.metaPill} onPress={() => setSearch(`entity:${item.entity}`)}>
                <Text style={styles.metaPillLabel}>Entity</Text>
                <Text style={styles.metaPillValue}>{item.entity}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.metaPill} onPress={() => setSearch(`action:${item.action}`)}>
                <Text style={styles.metaPillLabel}>Action</Text>
                <Text style={styles.metaPillValue}>{item.action}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.cardHeader}>
              <Text style={styles.marker}>{item.test_marker}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
            </View>
            <Text style={styles.description}>{item.text}</Text>
            <View style={styles.tagContainer}>
              {item.tags.map(t => (
                <TouchableOpacity key={t} onPress={() => setSearch(t)}>
                  <Text style={styles.tagBadge}>#{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="book-search-outline" size={48} color="#334155" />
            <Text style={styles.emptyText}>No matching protocols found.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  backBtn: { padding: 8, backgroundColor: '#334155', borderRadius: 20, marginRight: 15 },
  title: { fontSize: 24, color: 'white', fontWeight: 'bold' },
  subTitle: { fontSize: 14, color: '#3b82f6', fontWeight: '600', marginTop: -2 },
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1e293b', 
    borderRadius: 12, 
    paddingHorizontal: 15, 
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: 'white', paddingVertical: 12, fontSize: 16 },
  listContent: { paddingBottom: 40 },
  card: { backgroundColor: '#1e293b', padding: 20, borderRadius: 16, marginBottom: 15, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  marker: { backgroundColor: '#3b82f6', color: 'white', fontSize: 10, fontWeight: 'bold', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', marginRight: 10 },
  cardTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  description: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  tagContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 15, gap: 8 },
  tagBadge: { color: '#64748b', fontSize: 11, fontWeight: 'bold', backgroundColor: '#0f172a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334155' },
  metaStrip: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metaPill: { flex: 1, backgroundColor: '#0f172a', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  metaPillLabel: { color: '#475569', fontSize: 9, fontWeight: 'bold', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  metaPillValue: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#64748b', marginTop: 10, fontSize: 16 },
  discoveryTag: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  discoveryTagActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  discoveryTagText: { color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  discoveryTagTextActive: { color: 'white' },
});

