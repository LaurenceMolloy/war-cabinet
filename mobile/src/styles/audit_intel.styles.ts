import { StyleSheet } from 'react-native';

/**
 * Audit Intel — StyleSheet
 *
 * Co-located style module for audit_intel.tsx.
 * Future: shared design tokens (colours, spacing, typography) will be
 * extracted to src/styles/theme.ts and imported here.
 */
export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20 },
  backBtn: { padding: 4 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '900', letterSpacing: 2 },

  cabinetFilterContainer: { marginBottom: 16 },
  filterLabel: { color: '#64748b', fontSize: 8, fontWeight: '900', letterSpacing: 1, marginBottom: 8, marginLeft: 16 },
  cabinetScroll: { paddingHorizontal: 16, gap: 8 },
  cabinetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  cabinetChipActive: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  cabinetChipText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold' },
  cabinetChipTextActive: { color: '#ffffff' },

  monitor: { backgroundColor: '#0f172a', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
  monitorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  transcript: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold', minHeight: 44, lineHeight: 22 },
  hint: { color: '#475569', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  downloadBtn: { backgroundColor: '#fbbf2422', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#fbbf24' },
  downloadText: { color: '#fbbf24', fontSize: 10, fontWeight: '900', textAlign: 'center' },

  fabContainer: { position: 'absolute', bottom: 40, right: 30 },
  micBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65 },
  micBtnActive: { backgroundColor: '#ef4444', transform: [{ scale: 1.1 }] },

  resultsScroll: { flex: 1, paddingHorizontal: 16 },
  resultsContainer: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { color: '#64748b', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 12 },

  resultCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: '#1e293b', minHeight: 120 },
  scoreBadge: { width: 64, height: 52, borderRadius: 8, backgroundColor: '#fbbf24', justifyContent: 'center', alignItems: 'center' },
  scoreVal: { color: '#0f172a', fontSize: 16, fontWeight: '900' },
  scoreLabel: { color: '#0f172a', fontSize: 9, fontWeight: '900' },

  cardInfo: { flex: 1 },
  cardTitle: { color: '#f8fafc', fontSize: 15, fontWeight: 'bold', marginBottom: 2 },
  cardSub: { color: '#94a3b8', fontSize: 11, marginBottom: 2 },
  cardQty: { color: '#3b82f6', fontSize: 12, fontWeight: 'bold', marginBottom: 8 },

  evidenceContainer: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 8 },
  evidenceHeader: { color: '#475569', fontSize: 7, fontWeight: 'bold', marginBottom: 4 },
  evidenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  evidenceBadge: { backgroundColor: 'rgba(59, 130, 246, 0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(59, 130, 246, 0.3)' },
  evidenceText: { color: '#3b82f6', fontSize: 8, fontWeight: 'bold' },

  noMatch: { alignItems: 'center', padding: 40, gap: 16 },
  noMatchText: { color: '#475569', fontSize: 12, fontWeight: 'bold' },

  errorBanner: { marginTop: 8, padding: 6, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 6 },
  errorText: { color: '#ef4444', fontSize: 9, fontWeight: 'bold' },

  normalizedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  normalizedText: { color: '#10b981', fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  statusText: { fontSize: 9, fontWeight: '900', letterSpacing: 1 },

  inlineRestartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e293b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#334155' },
  inlineRestartText: { color: '#94a3b8', fontSize: 8, fontWeight: 'bold' },

  historyContainer: { backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  historyText: { fontSize: 9, fontWeight: 'bold', marginBottom: 4 },
  buddyText: { color: '#3b82f6' },
  userText: { color: '#10b981' },

  facetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateLabel: { color: '#fbbf24', fontSize: 10, fontWeight: '900' },

  briefingCard: { backgroundColor: '#0f172a', marginHorizontal: 16, marginBottom: 16, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1e293b', borderLeftWidth: 4, borderLeftColor: '#fbbf24' },
  briefingHeader: { flexDirection: 'column', alignItems: 'flex-start', marginBottom: 20 },
  briefingTitle: { color: '#fbbf24', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  windowLabel: { color: '#475569', fontSize: 11, fontWeight: 'bold' },
  briefingMetrics: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20 },
  metricBlock: { alignItems: 'center' },
  metricVal: { color: '#f8fafc', fontSize: 24, fontWeight: '900' },
  metricLabel: { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  progressBarBg: { height: 8, backgroundColor: '#1e293b', borderRadius: 4, marginBottom: 16 },
  progressBarFill: { height: '100%', backgroundColor: '#fbbf24', borderRadius: 4 },
  integrityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 16 },
  integrityLabel: { color: '#475569', fontSize: 11, fontWeight: 'bold', width: '100%', marginBottom: 6 },
  integrityStat: { fontSize: 11, fontWeight: '900' },

  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#450a0a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, borderWidth: 1, borderColor: '#ef444433' },
  resetBtnText: { color: '#ef4444', fontSize: 10, fontWeight: '900' },

  rankContainer: { paddingHorizontal: 16, marginBottom: 16 },
  rankRow: { flexDirection: 'row', gap: 8 },
  rankBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  rankBtnActive: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  rankText: { color: '#94a3b8', fontSize: 8, fontWeight: '900' },
  rankTextActive: { color: '#ffffff' },

  auditedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: '#1e293b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  auditedText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  discoveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#fbbf2433',
  },
  discoveryBtnText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  reviewModalContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  reviewTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  reviewList: {
    padding: 15,
  },
  reviewCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
    alignItems: 'center',
  },
  reviewTypeIndicator: {
    width: 6,
    height: '100%',
  },
  reviewCardContent: {
    flex: 1,
    padding: 12,
  },
  reviewProductName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  reviewDetail: {
    color: '#94a3b8',
    fontSize: 12,
  },
  discardButton: {
    padding: 12,
  },
  reviewFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 12,
  },
  footerButton: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#334155',
  },
  authorizeButton: {
    backgroundColor: '#10b981',
  },
  emptyReview: {
    alignItems: 'center',
    padding: 40,
  },
  emptyReviewText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
  },
  cardImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  imageFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  reviewScroll: {
    padding: 15,
  },
  reviewItem: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewItemTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  reviewItemSubtitle: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});
