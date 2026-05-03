import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConsolidationCandidate, NewBatchData, ConsolidationStrategy, Database } from '../database';
import { SQLiteDatabase } from 'expo-sqlite';

const { width, height } = Dimensions.get('window');

interface Props {
  visible: boolean;
  db: SQLiteDatabase;
  candidates: ConsolidationCandidate[];
  newData: NewBatchData;
  unitType: string;
  onClose: () => void;
  onSuccess: (targetId: number | null) => void;
}

export const ConsolidationCarousel: React.FC<Props> = ({ 
  visible, 
  db, 
  candidates, 
  newData, 
  unitType,
  onClose, 
  onSuccess 
}) => {
  const [currentIndex, setCurrentIndex] = useState(0); // 0 = Isolation Slide, 1..N = Candidates
  const scrollViewRef = useRef<ScrollView>(null);

  const goToNext = () => {
    if (currentIndex < totalSlides - 1) {
      scrollViewRef.current?.scrollTo({ x: (currentIndex + 1) * slideWidth, animated: true });
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      scrollViewRef.current?.scrollTo({ x: (currentIndex - 1) * slideWidth, animated: true });
    }
  };

  const totalSlides = candidates.length + 1;

  const modalWidth = width * 0.9;
  const slideWidth = modalWidth - 44; // 20 padding * 2 + 2 border * 2

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleKeyDown = (e: any) => {
        if (e.key === 'ArrowRight') goToNext();
        if (e.key === 'ArrowLeft') goToPrev();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [currentIndex, totalSlides]);

  const getUnitSuffix = (ut: string) => {
    if (ut === 'weight') return 'g';
    if (ut === 'volume') return 'ml';
    return ' Units';
  };

  const handleAction = async (targetId: number | null, strategy: ConsolidationStrategy = 'NORMAL') => {
    try {
      const resultId = await Database.Consolidation.commit(db, { 
        targetId, 
        data: newData, 
        strategy 
      });
      onSuccess(Number(resultId));
    } catch (err) {
      console.error('Consolidation commit failed:', err);
    }
  };

  const renderReasons = (candidate: ConsolidationCandidate) => {
    const reasons: string[] = [];
    const dbS = candidate.supplier;
    const dbR = candidate.product_range;
    const dbI = candidate.batch_intel;
    const newS = newData.supplier;
    const newR = newData.productRange;
    const newI = newData.batchIntel;

    if (!dbS && newS) reasons.push('BRAND_EXPANSION');
    if (dbS && !newS) reasons.push('BRAND_UNDERSPECIFIED');
    if (!dbR && newR) reasons.push('RANGE_EXPANSION');
    if (dbR && !newR) reasons.push('RANGE_UNDERSPECIFIED');
    if (dbI !== newI) {
      if (!dbI && newI) reasons.push('INTEL_EXPANSION');
      else if (dbI && !newI) reasons.push('INTEL_UNDERSPECIFIED');
      else reasons.push('INTEL_CONFLICT');
    }

    return (
      <View style={{ gap: 8, marginBottom: 16 }}>
        {reasons.map(reason => {
          const isConflict = reason.includes('CONFLICT');
          const bgColor = isConflict ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)';
          const borderColor = isConflict ? '#ef4444' : '#3b82f6';
          const textColor = isConflict ? '#ef4444' : '#60a5fa';
          const subTextColor = isConflict ? '#fca5a5' : '#94a3b8';

          let detail: React.ReactNode = "";
          if (reason === 'BRAND_UNDERSPECIFIED') detail = <Text style={{ color: subTextColor, fontSize: 11, lineHeight: 15 }}>Existing batch already specifies <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>{`'${dbS}'`}</Text>. This new entry is generic.</Text>;
          if (reason === 'BRAND_EXPANSION') detail = <Text style={{ color: subTextColor, fontSize: 11, lineHeight: 15 }}>Existing batch has no value recorded for this field. New entry specifies <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>{`'${newS}'`}</Text>.</Text>;
          if (reason === 'RANGE_UNDERSPECIFIED') detail = <Text style={{ color: subTextColor, fontSize: 11, lineHeight: 15 }}>Existing batch already specifies <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>{`'${dbR}'`}</Text>. This new entry is generic.</Text>;
          if (reason === 'RANGE_EXPANSION') detail = <Text style={{ color: subTextColor, fontSize: 11, lineHeight: 15 }}>Existing batch has no value recorded for this field. New entry specifies <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>{`'${newR}'`}</Text>.</Text>;
          if (reason === 'INTEL_CONFLICT') detail = <Text style={{ color: subTextColor, fontSize: 11, lineHeight: 15 }}>Both entries specify different notes. Existing: <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>{`'${dbI}'`}</Text>. Incoming: <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>{`'${newI}'`}</Text>.</Text>;
          if (reason === 'INTEL_EXPANSION' || reason === 'INTEL_UNDERSPECIFIED') detail = <Text style={{ color: subTextColor, fontSize: 11, lineHeight: 15 }}>One entry provides more detailed tactical notes than the other.</Text>;

          return (
            <View key={reason} style={{ backgroundColor: bgColor, padding: 12, borderRadius: 8, borderWidth: 1, borderColor }}>
               <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                 <MaterialCommunityIcons name={isConflict ? "alert-outline" : "information-outline"} size={16} color={textColor} />
                 <Text style={{ color: textColor, fontWeight: 'bold', fontSize: 11 }}>{reason.replace(/_/g, ' ')}</Text>
               </View>
               {detail}
            </View>
          );
        })}
      </View>
    );
  };

  const renderCandidateBox = (candidate: ConsolidationCandidate) => {
    const reasons: string[] = [];
    const dbS = candidate.supplier;
    const dbR = candidate.product_range;
    const dbI = candidate.batch_intel;
    const newS = newData.supplier;
    const newR = newData.productRange;
    const newI = newData.batchIntel;

    if (dbS !== newS) reasons.push('BRAND');
    if (dbR !== newR) reasons.push('RANGE');
    if (dbI !== newI) reasons.push('INTEL');

    return (
      <View style={{ backgroundColor: '#0f172a', padding: 12, borderRadius: 12, marginBottom: 24, borderWidth: 1, borderColor: '#334155' }}>
        <Text style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 12 }}>CANDIDATE BATCH DETAILS</Text>
        
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b', paddingBottom: 8}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <MaterialCommunityIcons name="scale" size={14} color="#94a3b8" />
                <Text style={{color: '#f8fafc', fontWeight: 'bold', fontSize: 13}}>
                  {candidate.size}{getUnitSuffix(unitType)}
                </Text>
            </View>
            {candidate.expiry_month && (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                    <MaterialCommunityIcons name="calendar-clock" size={14} color="#94a3b8" />
                    <Text style={{color: '#f8fafc', fontWeight: 'bold', fontSize: 13}}>
                      {String(candidate.expiry_month).padStart(2, '0')}/{candidate.expiry_year}
                    </Text>
                </View>
            )}
        </View>

        <View style={[{flexDirection: 'row', marginBottom: 6, padding: 4, borderRadius: 4}, reasons.includes('BRAND') && { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderWidth: 1, borderColor: '#3b82f6' }]}>
          <Text style={{color: '#94a3b8', width: 60, fontSize: 12}}>Brand</Text>
          <Text style={{color: dbS ? '#f8fafc' : '#64748b', fontWeight: 'bold', fontSize: 12}}>{dbS ? dbS.toUpperCase() : 'NO BRAND'}</Text>
        </View>

        <View style={[{flexDirection: 'row', marginBottom: 6, padding: 4, borderRadius: 4}, reasons.includes('RANGE') && { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderWidth: 1, borderColor: '#3b82f6' }]}>
          <Text style={{color: '#94a3b8', width: 60, fontSize: 12}}>Range</Text>
          <Text style={{color: dbR ? '#f8fafc' : '#64748b', fontWeight: 'bold', fontSize: 12}}>{dbR ? dbR.toUpperCase() : 'NO RANGE'}</Text>
        </View>

        <View style={[{flexDirection: 'row', padding: 4, borderRadius: 4}, reasons.includes('INTEL') && { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderWidth: 1, borderColor: '#3b82f6' }]}>
          <Text style={{color: '#94a3b8', width: 60, fontSize: 12}}>Intel</Text>
          <Text style={{color: dbI ? '#94a3b8' : '#64748b', fontWeight: dbI ? 'normal' : 'bold', fontStyle: dbI ? 'italic' : 'normal', fontSize: 12, flex: 1}} numberOfLines={2}>{dbI ? `"${dbI}"` : 'NO UNIQUE INTEL'}</Text>
        </View>
      </View>
    );
  };

  const renderSlide = () => {
    if (currentIndex === 0) {
      // SLIDE 0: ISOLATION BASELINE
      return (
        <ScrollView style={{ width: slideWidth }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <MaterialCommunityIcons name="content-copy" size={22} color="#3b82f6" />
            <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 18 }}>POSSIBLE DUPLICATE</Text>
          </View>
          <Text style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', marginBottom: 24, lineHeight: 18 }}>
            A potentially matching batch has been found with minimally different metadata.
          </Text>

          <View style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', marginBottom: 32 }}>
            <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
              Standard action is to maintain isolation as a separate batch. Swipe to explore consolidation options.
            </Text>
          </View>

          <TouchableOpacity 
            style={{ backgroundColor: '#1e293b', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', alignItems: 'center' }} 
            onPress={() => handleAction(null)}
            testID="merge-reject-btn"
          >
            <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 14 }}>CREATE SEPARATE ENTRY</Text>
            <Text style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>SAFE BASELINE</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    } else {
      // SLIDE 1..N: CONSOLIDATION CANDIDATES
      const candidate = candidates[currentIndex - 1];
      return (
        <ScrollView style={{ width: slideWidth }} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <MaterialCommunityIcons name="layers-search" size={22} color="#3b82f6" />
            <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 18 }}>CONSOLIDATE? (#{currentIndex})</Text>
          </View>
          <Text style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
            Metadata contrast for this candidate:
          </Text>

          {renderReasons(candidate)}
          {renderCandidateBox(candidate)}

          <View style={{ gap: 10 }}>
            <TouchableOpacity 
              style={{ backgroundColor: '#1e3a8a', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#3b82f6' }} 
              onPress={() => handleAction(candidate.id, 'ADOPT')}
              testID="merge-adopt-btn"
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 14 }}>CONSOLIDATE & ADOPT</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#60a5fa" />
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>Enrich records. <Text style={{ color: '#ef4444' }}>[False attribution risk]</Text></Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={{ backgroundColor: '#0f172a', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#334155' }} 
              onPress={() => handleAction(candidate.id, 'STRIP')}
              testID="merge-strip-btn"
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 14 }}>CONSOLIDATE & STRIP</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#64748b" />
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>Sanitize to generic. <Text style={{ color: '#fb923c' }}>[Metadata loss risk]</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header Controls */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: totalSlides }).map((_, i) => (
                <View 
                  key={i} 
                  style={[styles.dot, i === currentIndex && styles.dotActive]} 
                />
              ))}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            ref={scrollViewRef}
            horizontal 
            pagingEnabled 
            style={{ flex: 1 }}
            showsHorizontalScrollIndicator={false}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const index = Math.round(x / slideWidth);
              if (index !== currentIndex) setCurrentIndex(index);
            }}
            scrollEventThrottle={16}
          >
            {Array.from({ length: totalSlides }).map((_, i) => (
              <View key={i} style={{ width: slideWidth, flex: 1 }}>
                {currentIndex === i ? renderSlide() : <View />}
              </View>
            ))}
          </ScrollView>

          {/* Navigation Controls */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <TouchableOpacity 
              onPress={goToPrev} 
              disabled={currentIndex === 0}
              style={{ padding: 10, opacity: currentIndex === 0 ? 0.3 : 1 }}
              testID="carousel-prev-btn"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="chevron-left" size={20} color="#64748b" />
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 'bold' }}>PREV</Text>
              </View>
            </TouchableOpacity>

            <Text style={{ color: '#475569', fontSize: 10, fontWeight: 'bold' }}>
              {currentIndex + 1} OF {totalSlides}
            </Text>

            <TouchableOpacity 
              onPress={goToNext} 
              disabled={currentIndex === totalSlides - 1}
              style={{ padding: 10, opacity: currentIndex === totalSlides - 1 ? 0.3 : 1 }}
              testID="carousel-next-btn"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: 'bold' }}>NEXT</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#64748b" />
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#3b82f6',
    width: width * 0.9,
    padding: 20,
    height: height * 0.75,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1e293b',
  },
  dotActive: {
    backgroundColor: '#3b82f6',
    width: 12,
  },
  closeBtn: {
    padding: 4,
  },
});
