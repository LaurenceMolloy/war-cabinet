import re

with open('src/app/recipes.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_styles = """const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#1e293b', 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    paddingBottom: 15, 
    paddingHorizontal: 16, 
    borderBottomWidth: 1, 
    borderBottomColor: '#334155' 
  },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  backBtn: { padding: 10, backgroundColor: '#334155', borderRadius: 24 },
  scrollContent: { padding: 20 },

  /* --- TYPOGRAPHY --- */
  textPrimary: { color: '#f8fafc', fontSize: 14 },
  textSecondary: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  textMuted: { color: '#94a3b8', fontSize: 11 },
  textMutedItalic: { color: '#94a3b8', fontSize: 11, fontStyle: 'italic' },
  textHighlightTitle: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  textChip: { color: '#cbd5e1', fontSize: 13, fontWeight: 'bold' },

  /* --- CONTAINERS & PANELS --- */
  panelBase: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12 },
  card: { padding: 16, marginBottom: 24 },
  prefGroup: { padding: 12, marginBottom: 24 },
  anchoredPanel: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', backgroundColor: '#1e293b' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },

  /* --- CHIPS --- */
  chipBase: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, margin: 4 },
  allergenChip: { backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chefChip: { backgroundColor: '#111827', borderColor: '#374151', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10 },
  chipActiveBlue: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  chipActiveRed: { backgroundColor: '#ef4444', borderColor: '#ef4444' },

  /* --- BUTTONS --- */
  btnBase: { borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#fbbf24' },
  btnSecondary: { backgroundColor: '#334155' },
  btnLarge: { padding: 18 },
  btnAction: { paddingHorizontal: 12, paddingVertical: 10 },

  /* --- MISC --- */
  modeTabs: { flexDirection: 'row', backgroundColor: '#111827', borderRadius: 12, padding: 2, marginTop: 10, borderWidth: 1, borderColor: '#374151' },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  modeTabActive: { backgroundColor: '#334155' },
  modeTabText: { color: '#475569', fontSize: 12, fontWeight: 'bold' },
  modeTabTextActive: { color: '#f8fafc' },
  input: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, color: 'white', fontSize: 15, borderWidth: 1, borderColor: '#334155', minHeight: 80, textAlignVertical: 'top' },
  allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24, marginHorizontal: -4 },
  statusBanner: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fbbf24' },
  protocolRibbon: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 10, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4, marginTop: 8 },
  protocolBody: { overflow: 'hidden' },
});
"""

styles_start = content.find("const styles = StyleSheet.create({")
styles_end = content.find("});\n\nconst markdownStyles") + 3

if styles_start != -1 and styles_end != -1:
    content = content[:styles_start] + new_styles + content[styles_end:]

# Typography
content = re.sub(r'style=\{styles\.headerSubtitle\}', r'style={[styles.textMuted, { fontSize: 13, marginTop: 2 }]}', content)
content = re.sub(r'style=\{styles\.cardTitle\}', r'style={[styles.textHighlightTitle, { fontSize: 13, marginTop: 0, marginBottom: 0, letterSpacing: 0 }]}', content)
content = re.sub(r'style=\{styles\.cardBody\}', r'style={styles.textSecondary}', content)
content = re.sub(r'style=\{styles\.sectionTitle\}', r'style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}', content)
content = re.sub(r'style=\{styles\.sectionInlineSubtitle\}', r'style={styles.textMutedItalic}', content)
content = re.sub(r'style=\{styles\.sectionSubtitle\}', r'style={[styles.textMuted, { fontSize: 12, marginTop: -10, marginBottom: 15 }]}', content)
content = re.sub(r'style=\{styles\.protocolRibbonSummary\}', r'style={[styles.textSecondary, { fontSize: 12, marginTop: 4 }]}', content)
content = re.sub(r'style=\{styles\.protocolRibbonTitle\}', r'style={styles.textHighlightTitle}', content)
content = content.replace("style={[styles.sectionTitle, {marginBottom: 0, marginTop: 0}]}", "style={[styles.textHighlightTitle, {marginBottom: 0, marginTop: 0}]}")

# Containers
content = re.sub(r'style=\{styles\.card\}', r'style={[styles.panelBase, styles.card]}', content)
content = re.sub(r'style=\{styles\.prefGroup\}', r'style={[styles.panelBase, styles.prefGroup]}', content)

# Buttons
content = re.sub(r'style=\{styles\.generateBtn\}', r'style={[styles.btnBase, styles.btnPrimary, styles.btnLarge]}', content)
content = re.sub(r'style=\{styles\.actionBtn\}', r'style={[styles.btnBase, styles.btnPrimary, styles.btnAction]}', content)
content = re.sub(r'style=\{styles\.copyBtn\}', r'style={[styles.btnBase, styles.btnPrimary, styles.btnAction]}', content)

# Button specific matching
content = content.replace("style={[styles.generateBtn, {flex: 1, backgroundColor: '#334155', padding: 12}]}", "style={[styles.btnBase, styles.btnSecondary, {flex: 1, padding: 12}]}")
content = content.replace("style={[styles.generateBtn, {flex: 1, padding: 12}]}", "style={[styles.btnBase, styles.btnPrimary, {flex: 1, padding: 12}]}")
content = content.replace("style={[styles.generateBtn, {marginTop: 30}]}", "style={[styles.btnBase, styles.btnPrimary, styles.btnLarge, {marginTop: 30}]}")

# Chips
# Prevent matching `styles.chefChipText` when searching for `styles.chefChip`
content = re.sub(r'styles\.allergenChip\b', r'styles.chipBase, styles.allergenChip', content)
content = re.sub(r'styles\.chefChip\b', r'styles.chipBase, styles.chefChip', content)
content = re.sub(r'styles\.allergenChipActive\b', r'styles.chipActiveRed', content)
content = re.sub(r'styles\.stockChipActive\b', r'styles.chipActiveBlue', content)
content = re.sub(r'styles\.chefChipActive\b', r'styles.chipActiveBlue', content)

# Text inside chips explicitly mapped to textChip
content = re.sub(r'styles\.allergenChipTextActive\b', r'styles.textPrimary', content)
content = re.sub(r'styles\.allergenChipText\b', r'styles.textChip', content)
content = re.sub(r'styles\.chefChipTextActive\b', r'styles.textPrimary', content)
content = re.sub(r'styles\.chefChipText\b', r'styles.textChip', content)

# But wait, since we appended styling to allergenChip with a comma within array block, 
# it's possible some array constructs were nested or duplicated.
# Example: style={[styles.allergenChip, selected && styles.chipActive]} 
# replacing styles.allergenChip gives: style={[styles.chipBase, styles.allergenChip, selected && styles.chipActive]} which is correct!

with open('src/app/recipes.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Refactor complete.")
