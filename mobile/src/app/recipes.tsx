import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { RECIPE_PROMPT_TEMPLATE } from '../data/recipe_template';

const DIETARY_CHOICES = ["Meat", "Pescetarian", "Vegetarian", "Vegan", "Don't Mind"];
const ALLERGENS = [
  "Celery", "Cereals (Gluten)", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", 
  "Molluscs", "Mustard", "Tree Nuts", "Peanuts", "Sesame", "Soya", "Sulphites"
];

export default function RecipesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [dietary, setDietary] = useState("Meat");
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [expiringList, setExpiringList] = useState<string[]>([]);
  const [excludedExpiring, setExcludedExpiring] = useState<string[]>([]);
  const [preferred, setPreferred] = useState("");
  const [avoid, setAvoid] = useState("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [renderedPrompt, setRenderedPrompt] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const feedbackAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function load() {
      const rows = await db.getAllAsync<{key: string, value: string}>('SELECT * FROM Settings WHERE key IN (?, ?, ?, ?, ?, ?)', 'dietary_pref', 'recipe_preferred', 'recipe_avoided', 'recipe_allergens', 'recipe_excluded_expiring');
      rows.forEach(r => {
        if (r.key === 'dietary_pref') setDietary(r.value);
        if (r.key === 'recipe_preferred') setPreferred(r.value);
        if (r.key === 'recipe_avoided') setAvoid(r.value);
        if (r.key === 'recipe_allergens') setSelectedAllergens(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_excluded_expiring') setExcludedExpiring(r.value ? r.value.split(',') : []);
      });

      const now = new Date();
      const currentTotalMonths = now.getFullYear() * 12 + (now.getMonth() + 1);
      const thresholdMonths = currentTotalMonths + 1;
      const expiringQuery = `
        SELECT DISTINCT i.name
        FROM Inventory inv
        JOIN ItemTypes i ON i.id = inv.item_type_id
        WHERE inv.expiry_year IS NOT NULL
          AND (inv.expiry_year * 12 + inv.expiry_month) <= ${thresholdMonths}
      `;
      const expiringItems = await db.getAllAsync<{name: string}>(expiringQuery);
      setExpiringList(expiringItems.map(it => it.name));
    }
    load();
  }, [db]);

  const savePref = async (key: string, val: string) => {
    await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', key, val);
  };

  const toggleAllergen = (a: string) => {
    const next = selectedAllergens.includes(a) 
      ? selectedAllergens.filter(x => x !== a)
      : [...selectedAllergens, a];
    setSelectedAllergens(next);
    savePref('recipe_allergens', next.join(','));
  };

  const toggleExpiring = (name: string) => {
    const next = excludedExpiring.includes(name)
      ? excludedExpiring.filter(x => x !== name)
      : [...excludedExpiring, name];
    setExcludedExpiring(next);
    savePref('recipe_excluded_expiring', next.join(','));
  };

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    Animated.sequence([
      Animated.timing(feedbackAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 500, useNativeDriver: true })
    ]).start(() => setFeedback(null));
  };

  const generatePromptString = async () => {
    const now = new Date();
    const currentTotalMonths = now.getFullYear() * 12 + (now.getMonth() + 1);
    const thresholdMonths = currentTotalMonths + 1;

    const expiringQuery = `
      SELECT DISTINCT i.name
      FROM Inventory inv
      JOIN ItemTypes i ON i.id = inv.item_type_id
      WHERE inv.expiry_year IS NOT NULL
        AND (inv.expiry_year * 12 + inv.expiry_month) <= ${thresholdMonths}
    `;
    const expiringItems = await db.getAllAsync<{name: string}>(expiringQuery);
    const expiringNames = expiringItems.map(it => it.name);
    
    const allQuery = `
      SELECT DISTINCT i.name
      FROM Inventory inv
      JOIN ItemTypes i ON i.id = inv.item_type_id
    `;
    const allItems = await db.getAllAsync<{name: string}>(allQuery);
    const allStockedNames = allItems.map(it => it.name);

    const activeExpiring = expiringList.filter(name => !excludedExpiring.includes(name));
    const availableNames = allStockedNames.filter(name => !activeExpiring.includes(name));

    const activeExpiringList = activeExpiring.length > 0 
      ? activeExpiring.map(name => `- ${name}`).join('\n')
      : "None recorded.";

    const availableList = availableNames.length > 0
      ? availableNames.map(name => `- ${name}`).join('\n')
      : "None recorded.";

    const formatCsvList = (csv: string) => {
      const items = csv.split(',').map(s => s.trim()).filter(s => s.length > 0);
      return items.length > 0 ? items.map(s => `- ${s}`).join('\n') : "None recorded.";
    };

    const activeExpiringCount = activeExpiring.length;
    let mandateRule = "at least 2 expiring ingredients meaningfully";
    let mandateShort = "≥2 expiring ingredients";

    if (activeExpiringCount === 1) {
      mandateRule = "the mandatory expiring ingredient";
      mandateShort = "the mandatory ingredient";
    } else if (activeExpiringCount === 0) {
      mandateRule = "any expiring ingredients where relevant (none mandated)";
      mandateShort = "available ingredients";
    }

    return RECIPE_PROMPT_TEMPLATE
      .replace('[DIETARY_PREF]', dietary)
      .replace('[LIST_ALLERGENS]', selectedAllergens.length > 0 ? selectedAllergens.map(a => `- ${a}`).join('\n') : "None declared.")
      .replace('[LIST_EXPIRING]', activeExpiringList)
      .replace('[LIST_AVAILABLE]', availableList)
      .replace('[LIST_PREFERRED]', formatCsvList(preferred))
      .replace('[LIST_AVOID]', formatCsvList(avoid))
      .replace('[MANDATORY_COUNT_RULE]', mandateRule)
      .replace('[MANDATORY_COUNT_RULE_SHORT]', mandateShort);
  };

  const handleCopy = async () => {
    const prompt = await generatePromptString();
    await Clipboard.setStringAsync(prompt);
    triggerFeedback("PROMPT COPIED TO CLIPBOARD!");
  };

  const handleView = async () => {
    // 1. Logic & Safety Audits
    const prefNorm = preferred.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    const avoidNorm = avoid.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    const allergenNorm = selectedAllergens.map(a => a.toLowerCase());

    // Check Allergen vs Preferred
    for (const p of prefNorm) {
      if (allergenNorm.some(a => a === p || a.includes(p) || p.includes(a))) {
        triggerFeedback(`SAFETY CONFLICT: ${p.toUpperCase()} IS A SELECTED ALLERGEN!`);
        return;
      }
    }

    // Check Preferred vs Avoid
    for (const p of prefNorm) {
      if (avoidNorm.includes(p)) {
        triggerFeedback(`LOGIC CONFLICT: ${p.toUpperCase()} IS BOTH PREFERRED AND FORBIDDEN!`);
        return;
      }
    }

    // 2. Strategic Quantity Audit
    const activeExpiringCount = expiringList.filter(name => !excludedExpiring.includes(name)).length;

    if (activeExpiringCount === 0 && !showConfirm) {
      setShowConfirm(true);
    } else {
      const prompt = await generatePromptString();
      setRenderedPrompt(prompt);
      setShowConfirm(false);
    }
  };

  if (renderedPrompt) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
           <View style={{flexDirection: 'row', alignItems: 'center'}}>
             <TouchableOpacity onPress={() => setRenderedPrompt(null)} style={styles.backBtn}>
               <MaterialCommunityIcons name="chevron-left" size={28} color="#f8fafc" />
             </TouchableOpacity>
             <Text style={styles.title}>Recipe Briefing</Text>
           </View>
        </View>
        <ScrollView style={{flex: 1, padding: 16}} contentContainerStyle={{paddingBottom: 60}}>
           <Markdown style={markdownStyles}>
             {renderedPrompt}
           </Markdown>
        </ScrollView>
        <View style={styles.footer}>
           <TouchableOpacity style={styles.generateBtn} onPress={async () => {
               await Clipboard.setStringAsync(renderedPrompt);
               triggerFeedback("PROMPT COPIED TO CLIPBOARD!");
           }}>
              <MaterialCommunityIcons name="clipboard-text" size={24} color="black" style={{marginRight: 10}} />
              <Text style={styles.generateText}>COPY TO CLIPBOARD</Text>
           </TouchableOpacity>
        </View>
        {feedback && (
          <Animated.View style={[styles.feedbackBanner, { opacity: feedbackAnim }]} testID="feedback-banner">
            <Text style={styles.feedbackText}>{feedback}</Text>
          </Animated.View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
         <View style={{flexDirection: 'row', alignItems: 'center'}}>
           <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
             <MaterialCommunityIcons name="chevron-left" size={28} color="#f8fafc" />
           </TouchableOpacity>
             <Text style={styles.title}>Mess Hall Recipes</Text>
         </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
             <MaterialCommunityIcons name="chef-hat" size={20} color="#fbbf24" style={{marginRight: 8}} />
             <Text style={styles.cardTitle}>MESS HALL MISSION</Text>
          </View>
          <Text style={styles.cardBody}>
            Turn your soon-to-expire ingredients into something worth eating. This tool translates your current inventory and any dietary requirements into a <Text style={{fontWeight: 'bold', color: '#f8fafc'}}>precision AI prompt</Text> designed to minimize waste. Simply generate the prompt, paste it into a free AI tool like ChatGPT or Claude, and get recipe suggestions that actually match both your cupboard stock and ingredient preferences.
            {"\n\n"}
            <Text style={{color: '#22c55e', fontWeight: 'bold'}}>STRATEGIC BENEFITS</Text>
            {"\n"}
            • <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>100% Offline</Text>: Your data never leaves this device.
            {"\n"}
            • <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>Model Choice</Text>: Use ChatGPT, Claude, or any LLM.
            {"\n"}
            • <Text style={{color: '#f8fafc', fontWeight: 'bold'}}>Always Free</Text>: No subscriptions or expensive API keys.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>DIETARY DOCTRINE</Text>
        <View style={styles.prefGroup}>
          {DIETARY_CHOICES.map(c => (
            <TouchableOpacity 
              key={c} 
              style={styles.radioRow} 
              onPress={() => { setDietary(c); savePref('dietary_pref', c); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: dietary === c }}
              accessibilityLabel={c}
            >
               <MaterialCommunityIcons 
                 name={dietary === c ? "radiobox-marked" : "radiobox-blank"} 
                 size={22} 
                 color={dietary === c ? "#fbbf24" : "#64748b"} 
               />
               <Text style={[styles.radioText, dietary === c && {color: '#f8fafc', fontWeight: 'bold'}]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>ALLERGEN PROTOCOL</Text>
        <View style={styles.allergenGrid}>
          {ALLERGENS.map(a => (
            <TouchableOpacity 
              key={a} 
              style={[styles.allergenChip, selectedAllergens.includes(a) && styles.allergenChipActive]} 
              onPress={() => toggleAllergen(a)}
              testID={`allergen-chip-${a.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Text style={[styles.allergenChipText, selectedAllergens.includes(a) && styles.allergenChipTextActive]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{marginTop: 10, marginBottom: 24}}>
          <Text style={styles.sectionTitle}>MUST-USE INGREDIENTS (EXPIRING STOCK)</Text>
          {expiringList.length > 0 ? (
            <>
              <Text style={styles.sectionSubtitle}>Deselect items to remove them from the mandatory use list.</Text>
              <View style={styles.allergenGrid}>
                {expiringList.map(name => (
                  <TouchableOpacity 
                    key={name} 
                    style={[styles.allergenChip, !excludedExpiring.includes(name) && styles.stockChipActive]} 
                    onPress={() => toggleExpiring(name)}
                    testID={`stock-chip-${name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Text style={[styles.allergenChipText, !excludedExpiring.includes(name) && styles.allergenChipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.sectionSubtitle}>No stock items are due to expire soon.</Text>
          )}
        </View>

        <View style={styles.inputGroup}>
           <Text style={styles.sectionTitle}>PREFERRED INGREDIENTS (FAVOURITES)</Text>
           <TextInput 
             style={styles.input} 
             placeholder="e.g. Lemon, Garlic, Pasta"
             placeholderTextColor="#475569"
             value={preferred}
             onChangeText={(val) => { setPreferred(val); savePref('recipe_preferred', val); }}
             multiline
             testID="fav-ingredients-input"
           />
        </View>

        <View style={styles.inputGroup}>
           <Text style={[styles.sectionTitle, {color: '#ef4444'}]}>FORBIDDEN INGREDIENTS (DISLIKES)</Text>
           <TextInput 
             style={[styles.input, {borderColor: '#ef4444'}]} 
             placeholder="e.g. Olives, Coriander, Tofu"
             placeholderTextColor="#475569"
             value={avoid}
             onChangeText={(val) => { setAvoid(val); savePref('recipe_avoided', val); }}
             multiline
             testID="avoid-ingredients-input"
           />
        </View>
        
        <View style={{height: 40}} />
      </ScrollView>

      <View style={styles.footer}>
         {showConfirm ? (
           <View style={styles.confirmBlock}>
             <MaterialCommunityIcons name="alert" size={24} color="#fbbf24" style={{marginBottom: 10}} />
             <Text style={styles.confirmText}>
               No Mandatory Supplies. The AI is likely to treat this as having no mandatory ingredients and will base recipes on available and preferred items only.
             </Text>
             <View style={styles.confirmActions}>
                <TouchableOpacity style={styles.cancelBtnInline} onPress={() => setShowConfirm(false)}>
                  <Text style={styles.cancelBtnText}>GO BACK</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtnInline} onPress={handleView}>
                  <Text style={styles.confirmBtnText}>CONTINUE ANYWAY</Text>
                </TouchableOpacity>
             </View>
           </View>
         ) : (
           <TouchableOpacity style={styles.generateBtn} onPress={handleView} testID="generate-prompt-btn">
              <MaterialCommunityIcons name="auto-fix" size={24} color="black" style={{marginRight: 10}} />
              <Text style={styles.generateText}>GENERATE PROMPT</Text>
           </TouchableOpacity>
         )}
      </View>

      {feedback && (
        <Animated.View style={[styles.feedbackBanner, { opacity: feedbackAnim }]}>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerRow: { backgroundColor: '#1e293b', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginLeft: 8 },
  backBtn: { padding: 4 },
  scrollContent: { padding: 20 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#3b82f6', fontSize: 13, fontWeight: 'bold' },
  cardBody: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  sectionTitle: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 15, marginTop: 10 },
  prefGroup: { backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  radioText: { color: '#94a3b8', fontSize: 16, marginLeft: 12 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginBottom: 8 },
  input: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, color: 'white', fontSize: 15, borderWidth: 1, borderColor: '#334155', minHeight: 80, textAlignVertical: 'top' },
  allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24, marginHorizontal: -4 },
  allergenChip: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, margin: 4 },
  allergenChipActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  stockChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  allergenChipText: { color: '#94a3b8', fontSize: 13 },
  allergenChipTextActive: { color: 'white', fontWeight: 'bold' },
  sectionSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: -10, marginBottom: 15 },
  footer: { padding: 20, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155' },
  generateBtn: { backgroundColor: '#fbbf24', borderRadius: 8, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  generateText: { color: '#0f172a', fontWeight: 'bold', fontSize: 16 },
  confirmBlock: { alignItems: 'center' },
  confirmText: { color: '#fbbf24', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtnInline: { flex: 1, backgroundColor: '#334155', borderRadius: 8, padding: 16, alignItems: 'center' },
  confirmBtnInline: { flex: 1, backgroundColor: '#fbbf24', borderRadius: 8, padding: 16, alignItems: 'center' },
  cancelBtnText: { color: 'white', fontWeight: 'bold' },
  confirmBtnText: { color: '#0f172a', fontWeight: 'bold' },
  feedbackBanner: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fbbf24' },
  feedbackText: { color: '#fbbf24', fontWeight: 'bold', fontSize: 13, letterSpacing: 1, textAlign: 'center', width: '100%' }
});

const markdownStyles = StyleSheet.create({
  body: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#f8fafc', marginTop: 16, marginBottom: 8, fontSize: 24, fontWeight: 'bold' },
  heading2: { color: '#fbbf24', marginTop: 16, marginBottom: 8, fontSize: 20, fontWeight: 'bold' },
  heading3: { color: '#3b82f6', marginTop: 16, marginBottom: 8, fontSize: 18, fontWeight: 'bold' },
  hr: { backgroundColor: '#334155', height: 1, marginVertical: 16 },
  strong: { color: '#f8fafc', fontWeight: 'bold' },
  em: { color: '#94a3b8', fontStyle: 'italic' },
  code_inline: { backgroundColor: '#1e293b', color: '#fbbf24', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, fontFamily: 'monospace' },
  code_block: { backgroundColor: '#1e293b', color: '#fbbf24', borderRadius: 8, padding: 12, fontFamily: 'monospace' },
  fence: { backgroundColor: '#1e293b', color: '#fbbf24', borderRadius: 8, padding: 12, fontFamily: 'monospace' },
  blockquote: { backgroundColor: '#1e293b', borderLeftColor: '#3b82f6', borderLeftWidth: 4, padding: 12, borderRadius: 4 },
  table: { borderColor: '#334155', borderWidth: 1, borderRadius: 8 },
  tr: { borderBottomWidth: 1, borderBottomColor: '#334155' },
});
