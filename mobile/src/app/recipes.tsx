import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Animated, LayoutAnimation, Platform, UIManager, Linking, Switch } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { RECIPE_PROMPT_TEMPLATE, AUTHENTIC_MODE_SUB_TEMPLATES, LOGISTICS_MODE_SUB_TEMPLATES } from '../data/recipe_template';
import CHEFS_DATA from '../data/chefs.json';
import FRIDGE_INGREDIENTS from '../data/fridge_ingredients.json';
import { useBilling } from '../context/BillingContext';
import { Database } from '../database';

function getLevenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

const NearMissIcon = () => (
  <View style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}>
    <MaterialCommunityIcons name="bullseye-arrow" size={38} color="#475569" />
    <View style={{ position: 'absolute', bottom: 1, right: 1 }}>
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: -1, left: -1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: -1, left: 1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: 1, left: -1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#000000" style={{ position: 'absolute', top: 1, left: 1 }} />
      <MaterialCommunityIcons name="help" size={26} color="#f59e0b" />
    </View>
  </View>
);

const DIETARY_CHOICES = ["Meat", "Pescetarian", "Vegetarian", "Vegan", "Don't Mind"];
const ALLERGENS = [
  "Celery", "Cereals (Gluten)", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", 
  "Molluscs", "Mustard", "Tree Nuts", "Peanuts", "Sesame", "Soya", "Sulphites"
];

const MEDICAL_GUIDELINES = [
  "Hypertension (Low Sodium)",
  "Diabetes (Low GI/Carb)",
  "IBS (Low FODMAP)",
  "Heart Disease (Low Fat)",
  "Kidney Disease (Renal)"
];

const HEALTH_GOALS = [
  "Weight Loss",
  "High Protein",
  "Mediterranean",
  "Keto / Low Carb",
  "High Fiber",
  "Gut Health",
  "Sugar-Free"
];

const FRIDGE_STAPLES_PRESETS = []; // Rule 1: Must start empty

export default function RecipesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { checkEntitlement } = useBilling();

  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [selectedAllergens, setSelectedAllergens] = useState<string[]>([]);
  const [expiringList, setExpiringList] = useState<{name: string, cabinetType: string}[]>([]);
  const [pantryList, setPantryList] = useState<string[]>([]);
  const [freezerList, setFreezerList] = useState<string[]>([]);
  const [excludedExpiring, setExcludedExpiring] = useState<string[]>([]);
  const [excludedPantry, setExcludedPantry] = useState<string[]>([]);
  const [excludedFreezer, setExcludedFreezer] = useState<string[]>([]);
  const [preferred, setPreferred] = useState("");
  const [avoid, setAvoid] = useState("");
  const [extraRequests, setExtraRequests] = useState("");
  const [selectedMedical, setSelectedMedical] = useState<string[]>([]);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [recipeMode, setRecipeMode] = useState<"experimental" | "inspired" | "authentic">("experimental");
  const [selectedChef, setSelectedChef] = useState("Gordon Ramsay");
  const [lastCustomChef, setLastCustomChef] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  
  const [selectedStaples, setSelectedStaples] = useState<string[]>([]);
  const [persistentStaples, setPersistentStaples] = useState<string[]>(FRIDGE_STAPLES_PRESETS);
  const [staplesInput, setStaplesInput] = useState("");

  const [customExpInput, setCustomExpInput] = useState("");
  const [sessionCustomExp, setSessionCustomExp] = useState<string[]>([]);
  const [historyExp, setHistoryExp] = useState<string[]>([]);
  const [fridgeSuggestions, setFridgeSuggestions] = useState<string[]>([]);
  const [siloCabinetId, setSiloCabinetId] = useState<number | null>(null);
  const [cabinets, setCabinets] = useState<any[]>([]);

  // --- LOGISTICAL REFS (to prevent onBlur race conditions with suggestions) ---
  const customInputRef = useRef("");
  const staplesInputRef = useRef("");
  const customExpInputRef = useRef("");

  useEffect(() => { customInputRef.current = customInput; }, [customInput]);
  useEffect(() => { staplesInputRef.current = staplesInput; }, [staplesInput]);
  useEffect(() => { customExpInputRef.current = customExpInput; }, [customExpInput]);
  const chefs = [
    "BBC Good Food", "Gordon Ramsay", "Ina Garten", "Jamie Oliver", "Nigella Lawson", "Ottolenghi", "Rachael Ray",
    "Clinical Dietician", "Sports Nutritionist", "Gut-Health Guru"
  ];

  const CHEF_PHILOSOPHIES: Record<string, string> = {
    "BBC Good Food": "Dependable, triple-tested classics focused on accessibility and foolproof results.",
    "Gordon Ramsay": "Elite precision and bold flavors, respecting ingredients through refined technique.",
    "Ina Garten": "Elegant, foolproof home cooking that emphasizes high-quality ingredients and classic hospitality.",
    "Jamie Oliver": "Rebelliously simple cooking that celebrates fresh produce and vibrant, rustic flavors.",
    "Nigella Lawson": "Home-style comfort that prioritizes the pure pleasure of eating over technical perfection.",
    "Ottolenghi": "Vibrant, Middle-Eastern-inspired fusion celebrating bold spices and abundant vegetables.",
    "Rachael Ray": "High-speed, practical '30-minute' meals focused on big flavor and common supermarket finds.",
    "Clinical Dietician": "Prioritizes strict adherence to medical thresholds and safety over culinary flair. Explains the 'why' behind ingredient choices.",
    "Sports Nutritionist": "Focuses on high-performance fueling, optimal macro-balancing, and protein-centric recovery meals.",
    "Gut-Health Guru": "Specializes in probiotics, fiber-rich produce, and gentle digestion for microbiome optimization."
  };
  const [wildcardChef, setWildcardChef] = useState<string | null>(null);
  const [suggestedChefs, setSuggestedChefs] = useState<string[]>([]);
  const [stapleSuggestions, setStapleSuggestions] = useState<string[]>([]);
  const [hideDeployGuide, setHideDeployGuide] = useState(false);
  const [showDeployGuide, setShowDeployGuide] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const [deployStations, setDeployStations] = useState<{name: string, url: string}[]>([
    { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { name: 'Gemini', url: 'https://gemini.google.com/' },
    { name: 'Claude', url: 'https://claude.ai/' }
  ]);
  const [renderedPrompt, setRenderedPrompt] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [usageStats, setUsageStats] = useState<Record<string, number>>({});
  
  // --- FUZZY MODAL STATE ---
  const [showIngredientFuzzyModal, setShowIngredientFuzzyModal] = useState(false);
  const [fuzzyIngredientMatches, setFuzzyIngredientMatches] = useState<string[]>([]);
  const [pendingIngredientVal, setPendingIngredientVal] = useState("");
  const [pendingIngredientSegment, setPendingIngredientSegment] = useState<'staple' | 'addon'>('staple');
  const [ignoredFuzzyIngredients, setIgnoredFuzzyIngredients] = useState<Set<string>>(new Set());

  const [showChefFuzzyModal, setShowChefFuzzyModal] = useState(false);
  const [fuzzyChefMatches, setFuzzyChefMatches] = useState<string[]>([]);
  const [pendingChefVal, setPendingChefVal] = useState("");
  const [ignoredFuzzyChefs, setIgnoredFuzzyChefs] = useState<Set<string>>(new Set());

  // --- SAFETY WAIVER STATE ---
  const [showSafetyWaiver, setShowSafetyWaiver] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);

  const statusAnim = React.useRef(new Animated.Value(0)).current;

  type AccordionSection = "mode" | "core" | "optional" | "protocols" | "deploy" | null;
  const [activeAccordion, setActiveAccordion] = useState<AccordionSection>("core");

  const modeAnim = useRef(new Animated.Value(0)).current;
  const coreAnim = useRef(new Animated.Value(1)).current;
  const protocolsAnim = useRef(new Animated.Value(0)).current;
  const deployAnim = useRef(new Animated.Value(0)).current;
  const optionalAnim = useRef(new Animated.Value(0)).current;

  const toggleAccordion = (panel: NonNullable<AccordionSection>) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const nextActive = activeAccordion === panel ? null : panel;
    setActiveAccordion(nextActive);
    savePref('recipe_active_accordion', nextActive || 'none');
    
    Animated.parallel([
      Animated.timing(modeAnim, { toValue: nextActive === 'mode' ? 1 : 0, duration: 280, useNativeDriver: true }),
      Animated.timing(coreAnim, { toValue: nextActive === 'core' ? 1 : 0, duration: 280, useNativeDriver: true }),
      Animated.timing(optionalAnim, { toValue: nextActive === 'optional' ? 1 : 0, duration: 280, useNativeDriver: true }),
      Animated.timing(protocolsAnim, { toValue: nextActive === 'protocols' ? 1 : 0, duration: 280, useNativeDriver: true }),
      Animated.timing(deployAnim, { toValue: nextActive === 'deploy' ? 1 : 0, duration: 280, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    async function load() {
      let tempCustomChefs: string[] = [];
      const cabs = await Database.Cabinets.getAll(db);
      setCabinets(cabs);

      const rows = await db.getAllAsync<{key: string, value: string}>('SELECT * FROM Settings WHERE key LIKE ? OR key IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        'recipe_deploy_%', 'dietary_pref', 'recipe_preferred', 'recipe_avoided', 'recipe_allergens', 'recipe_medical', 'recipe_goals', 'recipe_excluded_expiring', 'recipe_excluded_pantry', 'recipe_excluded_freezer', 'recipe_extra', 'recipe_mode', 'recipe_chef', 'recipe_hide_deploy_guide', 'recipe_custom_chefs', 'recipe_fridge_staples_selected', 'recipe_fridge_staples_persistent', 'recipe_active_accordion', 'recipe_expiring_history', 'recipe_silo_cabinet'
      );
      rows.forEach(r => {
        if (r.key === 'recipe_expiring_history') {
          try {
            const parsed = JSON.parse(r.value);
            setHistoryExp(Array.isArray(parsed) ? parsed : []);
          } catch (e) {
            setHistoryExp(r.value.split(',').filter(Boolean));
          }
        }
        if (r.key === 'dietary_pref' && r.value) setSelectedDietary([r.value]);
        if (r.key === 'recipe_dietary') setSelectedDietary(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_preferred') setPreferred(r.value);
        if (r.key === 'recipe_avoided') setAvoid(r.value);
        if (r.key === 'recipe_extra') setExtraRequests(r.value);
        if (r.key === 'recipe_mode') setRecipeMode(r.value as any);
        if (r.key === 'recipe_chef') setSelectedChef(r.value);
        if (r.key === 'recipe_item_usage_stats') {
           try { setUsageStats(JSON.parse(r.value)); } catch(e) {}
        }
        if (r.key === 'recipe_hide_deploy_guide') setHideDeployGuide(r.value === 'true');
        if (r.key === 'recipe_custom_chefs') {
          tempCustomChefs = r.value.split(',').filter(Boolean);
          setLastCustomChef(tempCustomChefs[tempCustomChefs.length - 1] || null);
        }
        if (r.key === 'recipe_allergens') setSelectedAllergens(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_medical') setSelectedMedical(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_goals') setSelectedGoals(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_excluded_expiring') setExcludedExpiring(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_excluded_pantry') setExcludedPantry(r.value ? r.value.split(',') : []);
        if (r.key === 'recipe_excluded_freezer') setExcludedFreezer(r.value ? r.value.split(',') : []);
        
        if (r.key === 'recipe_fridge_staples_selected') setSelectedStaples(r.value ? r.value.split(',').filter(x => x) : []);
        if (r.key === 'recipe_fridge_staples_persistent') {
          const loaded = r.value ? r.value.split(',').filter(x => x) : [];
          if (loaded.length > 0) setPersistentStaples([...new Set([...FRIDGE_STAPLES_PRESETS, ...loaded])]);
        }
        if (r.key === 'recipe_active_accordion') {
          const panel = r.value === 'none' ? null : (r.value as AccordionSection);
          setActiveAccordion(panel);
          modeAnim.setValue(panel === 'mode' ? 1 : 0);
          coreAnim.setValue(panel === 'core' ? 1 : 0);
          optionalAnim.setValue(panel === 'optional' ? 1 : 0);
          protocolsAnim.setValue(panel === 'protocols' ? 1 : 0);
          deployAnim.setValue(panel === 'deploy' ? 1 : 0);
        }
        
        if (r.key === 'recipe_silo_cabinet') setSiloCabinetId(r.value ? Number(r.value) : null);
        
        for (let i = 1; i <= 3; i++) {
          if (r.key === `recipe_deploy_${i}_name`) {
            setDeployStations(prev => {
                const s = [...prev];
                s[i-1].name = r.value || s[i-1].name;
                return s;
            });
          }
          if (r.key === `recipe_deploy_${i}_url`) {
            setDeployStations(prev => {
                const s = [...prev];
                s[i-1].url = r.value || s[i-1].url;
                return s;
            });
          }
        }
      });

      const now = new Date();
      const currentTotalMonths = now.getFullYear() * 12 + (now.getMonth() + 1);
      const thresholdMonths = currentTotalMonths + 1;

      const allStockRows = await db.getAllAsync<any>(`
        SELECT DISTINCT i.name, cab.cabinet_type,
               inv.expiry_month, inv.expiry_year, 
               inv.entry_month, inv.entry_year,
               i.freeze_months
        FROM Inventory inv
        JOIN ItemTypes i ON i.id = inv.item_type_id
        JOIN Categories c ON c.id = i.category_id
        JOIN Cabinets cab ON cab.id = inv.cabinet_id
        WHERE c.is_mess_hall = 1
        ${siloCabinetId ? `AND inv.cabinet_id = ${siloCabinetId}` : ''}
      `);

      const expSet = new Set<string>();
      const expDetails: {name: string, cabinetType: string}[] = [];
      const pantrySet = new Set<string>();
      const freezerSet = new Set<string>();

      allStockRows.forEach(row => {
        let effMonth = row.expiry_month;
        let effYear = row.expiry_year;
        const isFreezerRow = row.cabinet_type === 'freezer';
        if (isFreezerRow && row.entry_month && row.entry_year) {
          const limit = row.freeze_months ?? 6;
          let m = row.entry_month + limit;
          let y = row.entry_year;
          while (m > 12) { m -= 12; y += 1; }
          effMonth = m;
          effYear = y;
        }

        const stamp = (effYear && effMonth) ? (effYear * 12 + effMonth) : null;
        if (stamp && stamp <= thresholdMonths) {
          if (!expSet.has(row.name)) {
            expSet.add(row.name);
            expDetails.push({ name: row.name, cabinetType: row.cabinet_type });
          } else if (isFreezerRow) {
            const idx = expDetails.findIndex(d => d.name === row.name);
            if (idx !== -1) expDetails[idx].cabinetType = 'freezer';
          }
        } else if (isFreezerRow) {
          freezerSet.add(row.name);
        } else {
          pantrySet.add(row.name);
        }
      });

      const finalExp = expDetails.sort((a,b) => a.name.localeCompare(b.name));
      const finalPantry = Array.from(pantrySet).filter(n => !expSet.has(n)).sort();
      const finalFreezer = Array.from(freezerSet).filter(n => !expSet.has(n)).sort();

      setExpiringList(finalExp);
      setPantryList(finalPantry);
      setFreezerList(finalFreezer);

      // Initialize wildcard (ensure no duplicates and only authentic-ready chefs)
      const allChefNames = Object.keys(CHEFS_DATA);
      const pool = allChefNames.filter(name => 
        !chefs.includes(name) && 
        name !== tempCustomChefs[tempCustomChefs.length - 1] &&
        (CHEFS_DATA[name as keyof typeof CHEFS_DATA] as any).authentic === true
      );
      if (pool.length > 0) {
        const random = pool[Math.floor(Math.random() * pool.length)];
        setWildcardChef(random);
      }
    }
    load();
  }, [db, siloCabinetId]);

  const savePref = async (key: string, val: string) => {
    await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', key, val);
  };

  const updateStation = (index: number, key: 'name' | 'url', val: string) => {
    setDeployStations(prev => {
        const updated = [...prev];
        updated[index][key] = val;
        return updated;
    });
    savePref(`recipe_deploy_${index + 1}_${key}`, val);
  };

  const handleDeploy = (stationUrl: string) => {
    if (!renderedPrompt) return;
    
    if (hideDeployGuide) {
      Clipboard.setStringAsync(renderedPrompt);
      Linking.openURL(stationUrl);
    } else {
      setPendingUrl(stationUrl);
      setShowDeployGuide(true);
    }
  };

  const confirmDeploy = () => {
    if (pendingUrl && renderedPrompt) {
      Clipboard.setStringAsync(renderedPrompt);
      Linking.openURL(pendingUrl);
      setShowDeployGuide(false);
      setPendingUrl(null);
    }
  };

  const toggleDietary = (c: string) => {
    // Dietary preferences should be mutually exclusive (single select)
    const next = selectedDietary.includes(c) ? [] : [c];
    setSelectedDietary(next);
    savePref('recipe_dietary', next.join(','));
  };

  const toggleAllergen = (a: string) => {
    const next = selectedAllergens.includes(a) 
      ? selectedAllergens.filter(x => x !== a)
      : [...selectedAllergens, a];
    setSelectedAllergens(next);
    savePref('recipe_allergens', next.join(','));
  };

  const toggleMedical = (m: string) => {
    const next = selectedMedical.includes(m) 
      ? selectedMedical.filter(x => x !== m)
      : [...selectedMedical, m];
    setSelectedMedical(next);
    savePref('recipe_medical', next.join(','));
  };

  const toggleGoal = (g: string) => {
    const next = selectedGoals.includes(g) 
      ? selectedGoals.filter(x => x !== g)
      : [...selectedGoals, g];
    setSelectedGoals(next);
    savePref('recipe_goals', next.join(','));
  };

  const toggleExpiring = (name: string) => {
    const next = excludedExpiring.includes(name)
      ? excludedExpiring.filter(x => x !== name)
      : [...excludedExpiring, name];
    setExcludedExpiring(next);
    savePref('recipe_excluded_expiring', next.join(','));
  };

  const togglePantry = (name: string) => {
    const next = excludedPantry.includes(name)
      ? excludedPantry.filter(x => x !== name)
      : [...excludedPantry, name];
    setExcludedPantry(next);
    savePref('recipe_excluded_pantry', next.join(','));
  };

  const toggleFreezer = (name: string) => {
    const next = excludedFreezer.includes(name)
      ? excludedFreezer.filter(x => x !== name)
      : [...excludedFreezer, name];
    setExcludedFreezer(next);
    savePref('recipe_excluded_freezer', next.join(','));
  };

  const toggleStaple = (s: string) => {
    const next = selectedStaples.includes(s)
      ? selectedStaples.filter(x => x !== s)
      : [...selectedStaples, s];
    setSelectedStaples(next);
    savePref('recipe_fridge_staples_selected', next.join(','));
  };

  const purgeStaple = (val: string) => {
    setSelectedStaples(prev => prev.filter(s => s !== val));
    setPersistentStaples(prev => {
      const next = prev.filter(s => s !== val);
      savePref('recipe_fridge_staples_persistent', next.join(','));
      return next;
    });
  };

  const handleAddStaple = (val: string, segment: 'selectedStaples' | 'selectedAddons' = 'selectedStaples') => {
    const cleaned = val.trim();
    if (!cleaned) return;
    
    // FUZZY CHECK BEFORE COMMIT
    if (handleIngredientFuzzyCheck(cleaned, segment === 'selectedStaples' ? 'staple' : 'addon')) return;

    // Auto-select and commit immediately (Rule 2 & 6)
    if (segment === 'selectedStaples') {
        setSelectedStaples(prev => {
            const next = prev.includes(cleaned) ? prev : [...prev, cleaned];
            savePref('recipe_fridge_staples_selected', next.join(','));
            return next;
        });
    } else {
        setSessionCustomExp(prev => {
            const next = prev.includes(cleaned) ? prev : [...prev, cleaned];
            // Briefing prompt uses sessionCustomExp as Add-ons
            return next;
        });
    }
    
    // Add to persistent vocabulary (Rule 6)
    setPersistentStaples(prev => {
      if (prev.includes(cleaned) || FRIDGE_INGREDIENTS.includes(cleaned)) return prev;
      const next = [...prev, cleaned];
      savePref('recipe_fridge_staples_persistent', next.join(','));
      return next;
    });

    trackUsage(cleaned);
    
    setStaplesInput("");
    setCustomExpInput("");
    setStapleSuggestions([]);
    setFridgeSuggestions([]);
  };

  const handlePurgeVocabulary = (val: string) => {
    // Rule 7: Remove from both selection and vocabulary
    setSelectedStaples(prev => {
        const next = prev.filter(s => s !== val);
        savePref('recipe_fridge_staples_selected', next.join(','));
        return next;
    });
    setSessionCustomExp(prev => prev.filter(s => s !== val));
    setPersistentStaples(prev => {
       const next = prev.filter(s => s !== val);
       savePref('recipe_fridge_staples_persistent', next.join(','));
       return next;
    });
  };

  const trackUsage = (item: string) => {
    setUsageStats(prev => {
      const next = { ...prev, [item]: (prev[item] || 0) + 1 };
      savePref('recipe_item_usage_stats', JSON.stringify(next));
      return next;
    });
  };

  const handleStaplesBlur = () => {
    setStapleSuggestions([]);
  };

  const handleFridgeBlur = () => {
    setFridgeSuggestions([]);
  };

  const handleChefBlur = () => {
    setSuggestedChefs([]);
  };

  const handleIngredientFuzzyCheck = (val: string, segment: 'staple' | 'addon'): boolean => {
    if (!checkEntitlement('ERROR_DETECTION')) return false;
    const v = val.trim();
    if (!v || v.length < 2 || ignoredFuzzyIngredients.has(v.toLowerCase())) return false;

    // Build current vocabulary
    const coreNormalized = new Map(FRIDGE_INGREDIENTS.map((n: string) => [n.toLowerCase(), n]));
    const combined = [...FRIDGE_INGREDIENTS];
    for (const s of persistentStaples) {
      if (!coreNormalized.has(s.toLowerCase())) combined.push(s);
    }

    // Exact match?
    if (combined.some(i => i.toLowerCase() === v.toLowerCase())) return false;

    const matches = combined
      .map(i => {
        const lowerI = i.toLowerCase();
        return {
          name: i,
          dist: getLevenshteinDistance(v.toLowerCase(), lowerI),
          startsWith: lowerI.startsWith(v.toLowerCase()[0])
        };
      })
      .filter(m => m.dist >= 1 && m.dist <= 2)
      .sort((a, b) => {
        if (a.startsWith && !b.startsWith) return -1;
        if (!a.startsWith && b.startsWith) return 1;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 3)
      .map(m => m.name);

    if (matches.length > 0) {
      setPendingIngredientVal(v);
      setPendingIngredientSegment(segment);
      setFuzzyIngredientMatches(matches);
      setShowIngredientFuzzyModal(true);
      return true;
    }
    return false;
  };

  const handleChefFuzzyCheck = (val: string) => {
    if (!checkEntitlement('ERROR_DETECTION')) return;
    const v = val.trim();
    if (!v || v.length < 2 || ignoredFuzzyChefs.has(v.toLowerCase())) return;

    const allChefNames = Object.keys(CHEFS_DATA);
    // Exact match?
    if (allChefNames.some(c => c.toLowerCase() === v.toLowerCase())) return;

    const matches = allChefNames
      .map(c => {
        const lowerC = c.toLowerCase();
        return {
          name: c,
          dist: getLevenshteinDistance(v.toLowerCase(), lowerC),
          startsWith: lowerC.startsWith(v.toLowerCase()[0])
        };
      })
      .filter(m => m.dist >= 1 && m.dist <= 2)
      .sort((a, b) => {
        if (a.startsWith && !b.startsWith) return -1;
        if (!a.startsWith && b.startsWith) return 1;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 3)
      .map(m => m.name);

    if (matches.length > 0) {
      setPendingChefVal(v);
      setFuzzyChefMatches(matches);
      setShowChefFuzzyModal(true);
    }
  };

  const massActionPantry = (include: boolean) => {
    if (include) {
      setExcludedPantry([]);
      savePref('recipe_excluded_pantry', "");
    } else {
      setExcludedPantry([...pantryList]);
      savePref('recipe_excluded_pantry', pantryList.join(','));
    }
  };

  const massActionFreezer = (include: boolean) => {
    if (include) {
      setExcludedFreezer([]);
      savePref('recipe_excluded_freezer', "");
    } else {
      setExcludedFreezer([...freezerList]);
      savePref('recipe_excluded_freezer', freezerList.join(','));
    }
  };

  const massActionExpiring = (include: boolean) => {
    if (include) {
      setExcludedExpiring([]);
      savePref('recipe_excluded_expiring', "");
    } else {
      const allNames = expiringList.map(item => item.name);
      setExcludedExpiring(allNames);
      savePref('recipe_excluded_expiring', allNames.join(','));
    }
  };

  const massActionStaples = (include: boolean) => {
    if (include) {
      setSelectedStaples([...persistentStaples]);
      savePref('recipe_fridge_staples_selected', persistentStaples.join(','));
    } else {
      setSelectedStaples([]);
      savePref('recipe_fridge_staples_selected', "");
    }
  };

  const triggerStatus = (msg: string) => {
    setMissionStatus(msg);
    statusAnim.setValue(0);
    Animated.sequence([
      Animated.timing(statusAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2000),
      Animated.timing(statusAnim, { toValue: 0, duration: 500, useNativeDriver: true })
    ]).start(() => setMissionStatus(null));
  };

  const generatePromptString = async () => {
    const now = new Date();
    const currentTotalMonths = now.getFullYear() * 12 + (now.getMonth() + 1);
    const thresholdMonths = currentTotalMonths + 1;

    const allStockRows = await db.getAllAsync<any>(`
      SELECT i.name, cab.cabinet_type,
             inv.expiry_month, inv.expiry_year, 
             inv.entry_month, inv.entry_year,
             i.freeze_months, i.unit_type, i.default_size,
             inv.batch_intel, inv.supplier, inv.product_range
      FROM Inventory inv
      JOIN ItemTypes i ON i.id = inv.item_type_id
      JOIN Categories c ON c.id = i.category_id
      JOIN Cabinets cab ON cab.id = inv.cabinet_id
      WHERE c.is_mess_hall = 1
      ${siloCabinetId ? `AND inv.cabinet_id = ${siloCabinetId}` : ''}
    `);

    const expItems: any[] = [];
    const pantryItems: any[] = [];
    const freezerItems: any[] = [];
    const expSet = new Set<string>();

    allStockRows.forEach(row => {
      let effMonth = row.expiry_month;
      let effYear = row.expiry_year;
      if (row.cabinet_type === 'freezer' && row.entry_month && row.entry_year) {
        const limit = row.freeze_months ?? 6;
        let m = row.entry_month + limit;
        let y = row.entry_year;
        while (m > 12) { m -= 12; y += 1; }
        effMonth = m;
        effYear = y;
      }

      const stamp = (effYear && effMonth) ? (effYear * 12 + effMonth) : null;
      if (stamp && stamp <= thresholdMonths) {
        expSet.add(row.name);
        expItems.push(row);
      } else if (row.cabinet_type === 'freezer') {
        freezerItems.push(row);
      } else {
        pantryItems.push(row);
      }
    });

    const activeExpiringFiltered = expItems.filter(it => !excludedExpiring.includes(it.name));
    const activePantryFiltered = pantryItems.filter(it => !excludedPantry.includes(it.name) && !expSet.has(it.name));
    const activeFreezerFiltered = freezerItems.filter(it => !excludedFreezer.includes(it.name) && !expSet.has(it.name));


    const formatIngredientList = (items: any[], forceCategory?: string) => {
      if (items.length === 0) return "None recorded.";
      // De-duplicate names for the prompt list
      const uniqueNames = new Set();
      const uniqueItems: any[] = [];
      items.forEach(it => {
        if (!uniqueNames.has(it.name)) {
          uniqueNames.add(it.name);
          uniqueItems.push(it);
        }
      });

      return uniqueItems.map(item => {
        let sizePart = "";
        if (item.default_size) {
           const num = parseFloat(item.default_size);
           if (!isNaN(num)) {
             if (num >= 1000) {
               if (item.unit_type === 'weight') sizePart = ` (${num / 1000}kg)`;
               else if (item.unit_type === 'volume') sizePart = ` (${num / 1000}l)`;
               else sizePart = ` (${num})`;
             } else {
               const suffix = item.unit_type === 'volume' ? 'ml' : item.unit_type === 'weight' ? 'g' : '';
               sizePart = ` (${num}${suffix})`;
             }
           } else {
             sizePart = ` (${item.default_size})`;
           }
        }
        let intelPart = "";
        if (item.supplier || item.product_range || item.batch_intel) {
          const parts = [item.supplier, item.product_range, item.batch_intel].filter(Boolean);
          intelPart = ` [${parts.join(', ')}]`;
        }
        return `- ${item.name}${sizePart}${intelPart}`;
      }).join('\n');
    };

    const pantryListPrompt = formatIngredientList(activePantryFiltered);
    const freezerListPrompt = formatIngredientList(activeFreezerFiltered);

    const formatCsvList = (csv: string) => {
      if (!csv) return "None recorded.";
      const items = csv.split(',').map(s => s.trim()).filter(s => s.length > 0);
      return items.length > 0 ? items.map(s => `- ${s}`).join('\n') : "None recorded.";
    };

    const activeExpiringCount = activeExpiringFiltered.length;
    let mandateRule = "at least 2 expiring ingredients";

    if (activeExpiringCount === 1) {
      mandateRule = "the mandatory expiring ingredient";
    } else if (activeExpiringCount === 0) {
      mandateRule = "any expiring ingredients where relevant (none mandated)";
    }

    let genTaskDescription = "";
    let modeSpecificConstraints = "";
    let dynamicOutputFormat = "";

    if (recipeMode === "authentic") {
      genTaskDescription = AUTHENTIC_MODE_SUB_TEMPLATES.TASK.replace(/\[CHEF_NAME\]/g, selectedChef);
      modeSpecificConstraints = AUTHENTIC_MODE_SUB_TEMPLATES.CONSTRAINTS.replace(/\[CHEF_NAME\]/g, selectedChef);
      dynamicOutputFormat = AUTHENTIC_MODE_SUB_TEMPLATES.OUTPUT
        .replace(/\[CHEF_NAME\]/g, selectedChef)
        .replace(/\[GOOGLE_SEARCH_QUERY\]/g, encodeURIComponent(`${selectedChef} recipe`));
    } else {
      genTaskDescription = LOGISTICS_MODE_SUB_TEMPLATES.TASK;
      modeSpecificConstraints = LOGISTICS_MODE_SUB_TEMPLATES.CONSTRAINTS.replace(/\[MANDATE_RULE\]/g, mandateRule);
      
      const chefNote = recipeMode === "experimental" ? "" : `### Chef's Note\n[1-3 sentences in the style of ${selectedChef} explaining a key technique, flavour decision, or cooking principle used in this specific recipe].`;
      dynamicOutputFormat = LOGISTICS_MODE_SUB_TEMPLATES.OUTPUT.replace(/\[CHEF_NOTE_SECTION\]/g, chefNote);
    }

    const activeExpiringList = expiringList.filter(item => !excludedExpiring.includes(item.name));
    const allExpiringString = [
        ...activeExpiringList.map(item => {
          let tag = 'non-perishable';
          if (item.cabinetType === 'freezer') tag = 'fresh/frozen';
          if (item.cabinetType === 'fridge') tag = 'fresh';
          return `- ${item.name} (${tag})`;
        }),
        ...sessionCustomExp.map(name => `- ${name} (fresh)`)
    ].join('\n');

    return RECIPE_PROMPT_TEMPLATE
      .replace('[DIETARY_PREF]', selectedDietary.join(', ') || "None recorded.")
      .replace('[LIST_ALLERGENS]', selectedAllergens.length > 0 ? '\n' + selectedAllergens.map(a => `- ${a}`).sort().join('\n') : "None declared.")
      .replace('[LIST_STAPLES]', selectedStaples.length > 0 ? '\n' + selectedStaples.sort().map(s => `- ${s}`).join('\n') : "No fresh staples defined.")
      .replace('[LIST_EXPIRING]', allExpiringString ? '\n' + allExpiringString : "No mandatory supplies found in inventory.")
      .replace('[LIST_PANTRY]', pantryListPrompt ? '\n' + pantryListPrompt : "None recorded.")
      .replace('[LIST_FREEZER]', freezerListPrompt ? '\n' + freezerListPrompt : "None recorded.")
      .replace('[LIST_PREFERRED]', preferred ? '\n' + formatCsvList(preferred) : "None recorded.")
      .replace('[LIST_AVOID]', avoid ? '\n' + formatCsvList(avoid) : "None recorded.")
      .replace('[MEDICAL_GUIDELINES]', selectedMedical.length > 0 ? selectedMedical.join(', ') : "None mandated.")
      .replace('[HEALTH_GOALS]', selectedGoals.length > 0 ? selectedGoals.join(', ') : "None specified.")
      .replace('[EXTRA_REQUESTS]', extraRequests ? '\n- ' + extraRequests : "None recorded.")
      .replace('[RECIPE_MODE]', recipeMode.toUpperCase())
      .replace('[CHEF_STRATEGY_LINE]', (selectedChef && (CHEF_PHILOSOPHIES[selectedChef] || (CHEFS_DATA[selectedChef as keyof typeof CHEFS_DATA] as any)?.philosophy)) 
        ? `**Chef Strategy:** ${CHEF_PHILOSOPHIES[selectedChef] || (CHEFS_DATA[selectedChef as keyof typeof CHEFS_DATA] as any)?.philosophy}` 
        : "")
      .replace('[GEN_TASK_DESCRIPTION]', genTaskDescription)
      .replace('[MODE_SPECIFIC_CONSTRAINTS]', modeSpecificConstraints)
      .replace('[DYNAMIC_OUTPUT_FORMAT]', dynamicOutputFormat);
  };

  const handleView = async () => {
    const prefNorm = preferred.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    const avoidNorm = avoid.split(',').map(s => s.trim().toLowerCase()).filter(s => s.length > 0);
    const allergenNorm = selectedAllergens.map(a => a.toLowerCase());

    for (const p of prefNorm) {
      if (allergenNorm.some(a => a === p || a.includes(p) || p.includes(a))) {
        triggerStatus(`SAFETY CONFLICT: ${p.toUpperCase()} IS A SELECTED ALLERGEN!`);
        return;
      }
    }

    for (const p of prefNorm) {
      if (avoidNorm.includes(p)) {
        triggerStatus(`LOGIC CONFLICT: ${p.toUpperCase()} IS BOTH PREFERRED AND FORBIDDEN!`);
        return;
      }
    }

    const activeExpiringList = expiringList.filter(item => !excludedExpiring.includes(item.name));

    // Handle Custom Chef Memory
    if (selectedChef && !chefs.includes(selectedChef) && selectedChef !== wildcardChef) {
      setLastCustomChef(selectedChef);
      savePref('recipe_custom_chefs', selectedChef);
    }

    // AUTHENTIC MODE ENFORCEMENT
    const isAuthenticIdentity = chefs.includes(selectedChef) || (CHEFS_DATA[selectedChef as keyof typeof CHEFS_DATA] as any)?.authentic === true;
    if (recipeMode === 'authentic' && !isAuthenticIdentity) {
      triggerStatus("IDENTITY REJECTED: AUTHENTIC MODE REQUIRES A HIGH-VOLUME DATA SOURCE.");
      return;
    }

    // We no longer auto-add half-typed items to session/history during submission,
    // they must be explicitly added by the + button, Enter, or suggested chip.

    const hasHealthConstraints = selectedAllergens.length > 0 || selectedMedical.length > 0;
    if (hasHealthConstraints && !waiverAccepted) {
      setShowSafetyWaiver(true);
      return;
    }

    if (activeExpiringList.length === 0 && sessionCustomExp.length === 0 && !showConfirm) {
      setShowConfirm(true);
    } else {
      if (!checkEntitlement('RECIPES')) return;
      const prompt = await generatePromptString();
      setRenderedPrompt(prompt);
      setShowConfirm(false);
    }
  };

  const toggleManualExp = (val: string) => {
    setSessionCustomExp(prev => {
      if (prev.includes(val)) {
        return prev.filter(item => item !== val);
      }
      return [...prev, val];
    });
  };

  const purgeManualExp = (val: string) => {
    setSessionCustomExp(prev => prev.filter(item => item !== val));
    setHistoryExp(prev => {
      const next = prev.filter(item => item !== val);
      savePref('recipe_expiring_history', JSON.stringify(next));
      return next;
    });
  };

  const massActionManualExp = (include: boolean) => {
    const allItems = Array.from(new Set([...historyExp, ...sessionCustomExp]));
    if (include) {
      setSessionCustomExp(allItems);
    } else {
      setSessionCustomExp([]);
    }
  };

  const handleAddCustomExp = (val: string) => {
    const cleaned = val.trim();
    if (!cleaned) return;
    if (!sessionCustomExp.includes(cleaned)) {
        setSessionCustomExp(prev => [...prev, cleaned]);
    }
    setHistoryExp(prev => {
        const filtered = prev.filter(x => x !== cleaned);
        const next = [cleaned, ...filtered].slice(0, 4);
        savePref('recipe_expiring_history', JSON.stringify(next));
        return next;
    });
    setCustomExpInput("");
    setFridgeSuggestions([]);
  };

  const renderStatus = () => (
    missionStatus && (
      <Animated.View style={[styles.statusBanner, { opacity: statusAnim }]} testID="feedback-banner">
        <Text style={styles.statusText}>{missionStatus}</Text>
      </Animated.View>
    )
  );

  if (showDeployGuide) {
    return (
      <View style={[styles.container, {justifyContent: 'center', padding: 20}]}>
          <View style={[styles.panelBase, styles.card]}>
              <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="information-outline" size={24} color="#38bdf8" style={{marginRight: 10}} />
                  <Text style={[styles.textHighlightTitle, { fontSize: 13, marginTop: 0, marginBottom: 0, letterSpacing: 0 }]}>DEPLOYMENT BRIEFING</Text>
              </View>
              <Text style={styles.textSecondary}>
                  The system will now copy the tactical briefing to your clipboard and launch your chosen AI command center.
                  {"\n\n"}
                  <Text style={{fontWeight: 'bold', color: 'white'}}>INSTRUCTIONS:</Text>
                  {"\n"}
                  1. Wait for the AI page to load.
                  {"\n"}
                  2. Tap the message field.
                  {"\n"}
                  3. <Text style={{color: '#fbbf24', fontWeight: 'bold'}}>PASTE</Text> the briefing manually.
                  {"\n\n"}
                  <Text style={{fontWeight: 'bold', color: 'white'}}>WHY THE MANUAL PASTE?</Text>
                  {"\n"}
                  To keep this service 100% free! Sending data automatically would require expensive server fees. This "Copy & Launch" method gives you elite AI power without any costs to you.
              </Text>
              
              <TouchableOpacity 
                style={{flexDirection: 'row', alignItems: 'center', marginTop: 20}}
                onPress={() => {
                    const next = !hideDeployGuide;
                    setHideDeployGuide(next);
                    savePref('recipe_hide_deploy_guide', next ? 'true' : 'false');
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: hideDeployGuide }}
              >
                  <MaterialCommunityIcons name={hideDeployGuide ? "checkbox-marked" : "checkbox-blank-outline"} size={20} color="#38bdf8" />
                  <Text style={{color: '#94a3b8', fontSize: 13, marginLeft: 8}}>Don't show this briefing again.</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.btnBase, styles.btnPrimary, styles.btnLarge, {marginTop: 30}]} 
                onPress={confirmDeploy}
                accessibilityRole="button"
              >
                  <Text style={styles.btnTextPrimary}>PROCEED TO DEPLOYMENT</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={{alignItems: 'center', marginTop: 15}} 
                onPress={() => setShowDeployGuide(false)}
                accessibilityRole="button"
              >
                  <Text style={{color: '#64748b', fontWeight: 'bold'}}>CANCEL</Text>
              </TouchableOpacity>
          </View>
          {renderStatus()}
      </View>
    );
  }

  if (renderedPrompt) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
           <TouchableOpacity accessibilityRole="button" onPress={() => setRenderedPrompt(null)} style={styles.backBtn}>
             <MaterialCommunityIcons name="chevron-left" size={28} color="#f8fafc" />
           </TouchableOpacity>
           <View style={{flex: 1, marginLeft: 16}}>
             <Text style={styles.title}>Recipe Briefing</Text>
             <Text style={[styles.textMuted, { fontSize: 13, marginTop: 2 }]}>Ready for AI station transmission</Text>
           </View>
        </View>
        {/* ANCHORED COMMAND PANEL */}
        <View style={styles.anchoredPanel}>
          <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold', marginBottom: 8, textAlign: 'center'}}>DEPLOY DIRECT TO AI PORTAL:</Text>
          <View style={{flexDirection: 'row', gap: 8}}>
            {deployStations && deployStations.map((s, idx) => (
                <TouchableOpacity 
                  key={idx}
                  style={[styles.actionBtn, {flex: 1, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', padding: 10, alignItems: 'center', borderRadius: 8}]} 
                  onPress={() => handleDeploy(s.url)}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons name="rocket-launch-outline" size={16} color="#38bdf8" />
                  <Text style={{color: 'white', fontSize: 10, fontWeight: 'bold', marginTop: 4}} numberOfLines={1}>{s.name.toUpperCase()}</Text>
                </TouchableOpacity>
            ))}
          </View>
        </View>

        <KeyboardAwareScrollView style={{flex: 1, padding: 16}} contentContainerStyle={{paddingBottom: 60}} testID="prompt-text">
           <Markdown style={markdownStyles}>
             {renderedPrompt}
           </Markdown>
        </KeyboardAwareScrollView>
        {renderStatus()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerColumn}>
        {/* ROW 1: COMMANDS */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerSideCol}>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
              <MaterialCommunityIcons name="arrow-left" size={20} color="#f8fafc" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.headerCenterCol}>
            <View style={{ paddingLeft: 12 }}>
              <Text style={styles.title}>Mess Hall</Text>
            </View>
          </View>

          <View style={[styles.headerSideCol, { alignItems: 'flex-end', width: 80 }]}>
            {!showConfirm && (
              <TouchableOpacity 
                style={[styles.btnBase, {backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20}]} 
                onPress={handleView} 
                testID="generate-prompt-btn"
              >
                <Text style={{color: 'white', fontWeight: 'bold', fontSize: 11}}>GENERATE</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ROW 2: SCOPE */}
        <View style={styles.headerSubRow}>
          <View style={styles.headerSideCol} />
          <View style={styles.headerCenterCol}>
            <View style={{ paddingLeft: 12 }}>
              <Text style={styles.subtitle}>Waste-conscious recipe suggestions</Text>
            </View>
          </View>
          <View style={[styles.headerSideCol, { width: 80 }]} />
        </View>
      </View>

      {/* â”€â”€ COMMAND DECK (Top-Anchored) â”€â”€ */}
      {showConfirm && (
        <View style={styles.anchoredPanel}>
          <View style={{alignItems: 'center'}}>
            <Text style={[styles.textHighlightTitle, {fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18}]}>NO MANDATORY SUPPLIES SELECTED. PROCEED?</Text>
            <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
              <TouchableOpacity accessibilityRole="button" style={[styles.btnBase, styles.btnSecondary, {flex: 1, padding: 12}]} onPress={() => setShowConfirm(false)}>
                <Text style={[styles.btnTextSecondary, {fontSize: 13}]}>BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={[styles.btnBase, styles.btnPrimary, {flex: 1, padding: 12}]} onPress={() => { setShowConfirm(false); handleView(); }}>
                <Text style={[styles.btnTextPrimary, {fontSize: 13}]}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* --- SAFETY WAIVER MODAL (HUMAN-CENTRIC) --- */}
      {showSafetyWaiver && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxWidth: 420, backgroundColor: '#0f172a', borderColor: '#3b82f6', borderWidth: 2 }]}>
            <View style={[styles.cardHeader, { borderBottomWidth: 1, borderBottomColor: '#334155', pb: 10, mb: 16 }]}>
              <MaterialCommunityIcons name="heart-pulse" size={24} color="#3b82f6" style={{ marginRight: 10 }} />
              <Text style={[styles.textHighlightTitle, { fontSize: 16, marginTop: 0, marginBottom: 0, color: '#3b82f6' }]}>SAFETY & HEALTH NOTICE</Text>
            </View>
            
            <View style={{ marginBottom: 20 }}>
              <Text style={[styles.textSecondary, { fontSize: 14, lineHeight: 20 }]}>
                Because you have <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Allergies</Text> or <Text style={{ color: '#3b82f6', fontWeight: 'bold' }}>Medical Guidelines</Text> active, we need to ensure you're aware of how this feature works.
                {"\n\n"}
                This recipe briefing is generated by an AI. While it tries to be helpful, it is <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>NOT a substitute</Text> for professional medical advice or a doctor's care.
                {"\n\n"}
                Please use your own best judgment and consult a healthcare professional before making significant changes to your diet.
              </Text>
            </View>

            <TouchableOpacity 
              activeOpacity={0.7}
              style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                backgroundColor: '#111827', 
                padding: 16, 
                borderRadius: 8, 
                marginBottom: 24, 
                borderWidth: 1, 
                borderColor: waiverAccepted ? '#3b82f6' : '#334155' 
              }}
              onPress={() => setWaiverAccepted(!waiverAccepted)}
              testID="waiver-checkbox"
            >
              <MaterialCommunityIcons 
                name={waiverAccepted ? "checkbox-marked-circle-outline" : "checkbox-blank-circle-outline"} 
                size={24} 
                color={waiverAccepted ? "#3b82f6" : "#64748b"} 
              />
              <Text style={{ color: '#cbd5e1', fontSize: 13, marginLeft: 12, flex: 1, fontWeight: '500' }}>
                I understand that I use this guidance at my own risk.
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity 
                style={[styles.btnBase, { flex: 1, backgroundColor: '#1e293b', padding: 14, borderWidth: 1, borderColor: '#334155' }]} 
                onPress={() => setShowSafetyWaiver(false)}
              >
                <Text style={[styles.textMuted, { fontWeight: 'bold', fontSize: 13 }]}>GO BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                disabled={!waiverAccepted}
                style={[styles.btnBase, styles.btnPrimary, { flex: 2, padding: 14, backgroundColor: waiverAccepted ? '#fbbf24' : '#334155', opacity: waiverAccepted ? 1 : 0.5 }]} 
                onPress={() => { setShowSafetyWaiver(false); handleView(); }}
              >
                <Text style={[styles.btnTextPrimary, { fontSize: 14 }]}>I UNDERSTAND, PROCEED</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <KeyboardAwareScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={182}
        extraHeight={182}
      >
        <View>
          <View style={[styles.panelBase, styles.card]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="chef-hat" size={20} color="#fbbf24" style={{marginRight: 8}} />
              <Text style={[styles.textHighlightTitle, { fontSize: 13, marginTop: 0, marginBottom: 0, letterSpacing: 0 }]}>MESS HALL MISSION</Text>
            </View>
            <Text style={styles.textSecondary}>
              Turn your expiring ingredients into elite recipes. Select your mode, define your ingredient preferences, hit generate, and deploy to your favourite AI.
            </Text>
          </View>

          {/* â”€â”€ TIER 0: RECIPE MODE & CHEF (collapsible) â”€â”€ */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => toggleAccordion('mode')}
            style={styles.protocolRibbon}
            testID="mode-ribbon"
          >
            <View style={{flex: 1}}>
              <Text style={styles.textHighlightTitle}>RECIPE MODE & CHEF</Text>
              <Text style={[styles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
                {[
                  recipeMode === 'experimental' ? 'Experimental' : `${recipeMode === 'inspired' ? 'Inspired' : 'Authentic'} (${selectedChef || 'No Chef'})`,
                  extraRequests.split(',').filter(s => s.trim().length > 0).length > 0 ? `${extraRequests.split(',').filter(s => s.trim().length > 0).length} Directive${extraRequests.split(',').filter(s => s.trim().length > 0).length === 1 ? '' : 's'}` : null,
                ].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: modeAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#64748b" />
            </Animated.View>
          </TouchableOpacity>

          {activeAccordion === 'mode' && (
            <View style={styles.protocolBody}>
              <View style={{marginTop: 16, marginBottom: 24}}>
                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>RECIPE MODE <Text style={styles.textMutedItalic}>(choose your approach)</Text></Text>
                <View style={styles.modeTabs}>
                  {(['experimental', 'inspired', 'authentic'] as const).map(mode => (
                    <TouchableOpacity 
                      accessibilityRole="tab"
                      key={mode} 
                      style={[styles.modeTab, recipeMode === mode && styles.modeTabActive]} 
                      onPress={() => { setRecipeMode(mode); savePref('recipe_mode', mode); }}
                      testID={`mode-tab-${mode}`}
                    >
                      <Text style={[styles.modeTabText, recipeMode === mode && styles.modeTabTextActive]}>
                        {mode.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.textMuted, {fontSize: 12, marginTop: 8}]}>
                  {recipeMode === 'experimental' ? "Pure AI improvisation focused on zero-waste utility." : 
                  recipeMode === 'inspired' ? "AI improvisation adopting the seasoning, style, and voice of your chosen chef." : 
                  "Robust archive search for real, published recipes verified by the AI."}
                </Text>
              </View>

              {(recipeMode === "inspired" || recipeMode === "authentic") && (
                <View style={{marginBottom: 24}}>
                  <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>LEGENDARY CHEF INTEL <Text style={styles.textMutedItalic}>(adopt an identity)</Text></Text>
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8}}>
                    {chefs.map(chef => (
                      <TouchableOpacity 
                        accessibilityRole="button"
                        key={chef} 
                        style={[styles.chipBase, styles.chefChip, selectedChef === chef && styles.chipActiveBlue]} 
                        onPress={() => { setSelectedChef(chef); savePref('recipe_chef', chef); setCustomInput(""); }}
                        testID={`chef-chip-${chef.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Text style={[styles.textChip, selectedChef === chef && styles.textChipActive]}>{chef}</Text>
                      </TouchableOpacity>
                    ))}

                    {wildcardChef && (
                      <TouchableOpacity 
                        accessibilityRole="button"
                        key="wildcard" 
                        style={[styles.chipBase, styles.chefChip, selectedChef === wildcardChef && styles.chipActiveBlue]} 
                        onPress={() => { setSelectedChef(wildcardChef); savePref('recipe_chef', wildcardChef); setCustomInput(""); }}
                        testID="wildcard-chef-chip"
                      >
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <MaterialCommunityIcons name="satellite-variant" size={13} color={selectedChef === wildcardChef ? "black" : "#fbbf24"} style={{marginRight: 6}} />
                          <Text style={[styles.textChip, selectedChef === wildcardChef && styles.textChipActive]}>{wildcardChef}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    
                    {lastCustomChef && (
                      <TouchableOpacity 
                        accessibilityRole="button"
                        key="last-custom" 
                        style={[
                          styles.chipBase, styles.chefChip, 
                          selectedChef === lastCustomChef && styles.chipActiveBlue,
                          (recipeMode === 'authentic' && !(CHEFS_DATA[lastCustomChef as keyof typeof CHEFS_DATA] as any)?.authentic) && {opacity: 0.4}
                        ]} 
                        onPress={() => { 
                          const isAuth = (CHEFS_DATA[lastCustomChef as keyof typeof CHEFS_DATA] as any)?.authentic;
                          if (recipeMode === 'authentic' && !isAuth) {
                            triggerStatus("IDENTITY INCOMPATIBLE WITH AUTHENTIC PROTOCOL.");
                            return;
                          }
                          setSelectedChef(lastCustomChef); 
                          savePref('recipe_chef', lastCustomChef); 
                          setCustomInput(""); 
                        }}
                        testID="last-custom-chef-chip"
                      >
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                          <MaterialCommunityIcons name="account-circle-outline" size={13} color={selectedChef === lastCustomChef ? "black" : "#94a3b8"} style={{marginRight: 6}} />
                          <Text style={[styles.textChip, selectedChef === lastCustomChef && styles.textChipActive]}>{lastCustomChef}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{height: 58, paddingHorizontal: 4, paddingVertical: 2, justifyContent: 'center'}}>
                    <Text style={{color: '#94a3b8', fontSize: 12, fontStyle: 'italic', lineHeight: 18}} numberOfLines={3}>
                      {(selectedChef && (CHEF_PHILOSOPHIES[selectedChef] || (CHEFS_DATA[selectedChef as keyof typeof CHEFS_DATA] as any)?.philosophy))
                        ? (CHEF_PHILOSOPHIES[selectedChef] || (CHEFS_DATA[selectedChef as keyof typeof CHEFS_DATA] as any)?.philosophy)
                        : ''}
                    </Text>
                  </View>

                  <View style={{flexDirection: 'row', gap: 15, marginTop: 12, marginBottom: 4, paddingHorizontal: 4}}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <MaterialCommunityIcons name="satellite-variant" size={14} color="#fbbf24" style={{marginRight: 4}} />
                        <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>WILDCARD CHEF</Text>
                    </View>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <MaterialCommunityIcons name="account-circle-outline" size={14} color="#94a3b8" style={{marginRight: 4}} />
                        <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>USER SUGGESTED</Text>
                    </View>
                  </View>

                  <View style={{marginTop: 10}}>
                    <TextInput 
                      style={[styles.input, {minHeight: 45, height: 45, fontSize: 14, marginBottom: 4}]} 
                      placeholder="e.g. Marco Pierre White"
                      placeholderTextColor="#475569"
                      value={customInput}
                      onChangeText={(val) => {
                        setCustomInput(val);
                        setSelectedChef(val);
                        savePref('recipe_chef', val);
                        
                        if (val.trim().length > 1) {
                          const query = val.toLowerCase();
                          const allChefNames = Object.keys(CHEFS_DATA);
                          const scored = allChefNames.map(name => {
                            const lowerN = name.toLowerCase();
                            let score = 3;
                            if (lowerN === query) score = 0;
                            else if (lowerN.startsWith(query)) score = 0.5;
                            else if (lowerN.includes(query)) score = 0.8;
                            else {
                              const prefixToScan = lowerN.substring(0, query.length + 1);
                              const prefixDist = getLevenshteinDistance(query, prefixToScan);
                              if (prefixDist <= 1) score = 0.9;
                              else {
                                const fullDist = getLevenshteinDistance(query, lowerN);
                                if (fullDist <= 2) score = 1.0 + (fullDist * 0.2);
                              }
                            }
                            return { name, score };
                          });

                          let matches = scored
                            .filter(item => {
                              if (recipeMode === 'authentic') {
                                return item.score <= 2 && (CHEFS_DATA[item.name as keyof typeof CHEFS_DATA] as any).authentic === true;
                              }
                              return item.score <= 2;
                            })
                            .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
                            .slice(0, 3)
                            .map(item => item.name);

                          setSuggestedChefs(matches);
                        } else {
                          setSuggestedChefs([]);
                        }
                      }}
                      onSubmitEditing={() => handleChefFuzzyCheck(customInput)}
                      autoCorrect={false}
                      spellCheck={false}
                      testID="custom-chef-input"
                    />
                    <View style={{height: 24, justifyContent: 'center'}}>
                      <View style={{flexDirection: 'row', gap: 6}}>
                        {suggestedChefs.map(chef => (
                          <TouchableOpacity 
                            key={chef}
                            onPress={() => {
                              setCustomInput(chef);
                              setSelectedChef(chef);
                              savePref('recipe_chef', chef);
                              setSuggestedChefs([]);
                            }}
                            style={{backgroundColor: '#334155', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}
                          >
                            <Text style={{color: '#fbbf24', fontSize: 9, fontWeight: 'bold'}}>{chef.toUpperCase()}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              )}

              <View style={{marginBottom: 24}}>
                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>MISSION DIRECTIVES <Text style={styles.textMutedItalic}>(custom rules)</Text></Text>
                <Text style={[styles.textMuted, {fontSize: 12, marginTop: -5, marginBottom: 10}]}>Additional constraints or requests.</Text>
                <TextInput 
                  style={[styles.input, {minHeight: 45, height: 45, fontSize: 14}]} 
                  placeholder='e.g. "Under 30 minutes", "Kid friendly"'
                  placeholderTextColor="#475569"
                  value={extraRequests}
                  onChangeText={(val) => { setExtraRequests(val); savePref('recipe_extra', val); }}
                  autoCorrect={false}
                  spellCheck={false}
                  testID="extra-requests-input"
                />
              </View>
            </View>
          )}

          <TouchableOpacity
          accessibilityRole="button"
          onPress={() => toggleAccordion('core')}
            style={styles.protocolRibbon}
            testID="core-ribbon"
          >
            <View style={{flex: 1}}>
              <Text style={styles.textHighlightTitle}>CORE INGREDIENTS</Text>
              <Text style={[styles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
                {(() => {
                  const activeExpiring = expiringList.filter(it => !excludedExpiring.includes(it.name));
                  const mustUseCount = activeExpiring.length + sessionCustomExp.length;
                  if (mustUseCount === 0) {
                    return <Text style={{color: '#ef4444', fontWeight: 'bold'}}>No mandatory supplies</Text>;
                  }
                  
                  const pantryCount = activeExpiring.filter(it => it.cabinetType === 'pantry').length;
                  const freezerCount = activeExpiring.filter(it => it.cabinetType === 'freezer').length;
                  const fridgeCount = activeExpiring.filter(it => it.cabinetType === 'fridge').length + sessionCustomExp.length;
                  
                  const breakdown = [];
                  if (pantryCount > 0) breakdown.push(`${pantryCount} Pantry`);
                  if (freezerCount > 0) breakdown.push(`${freezerCount} Freezer`);
                  if (fridgeCount > 0) breakdown.push(`${fridgeCount} Fridge`);
                  
                  const breakdownStr = breakdown.length > 0 ? ` (${breakdown.join(', ')})` : '';
                  return <Text>{`${mustUseCount} Must-Use${breakdownStr}`}</Text>;
                })()}
                {preferred.split(',').filter(s => s.trim().length > 0).length > 0 
                  ? `  ·  ${preferred.split(',').filter(s => s.trim().length > 0).length} Preferred` 
                  : null}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: coreAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#64748b" />
            </Animated.View>
          </TouchableOpacity>

          {activeAccordion === 'core' && (
            <View style={styles.protocolBody}>
              <View style={{marginTop: 16, marginBottom: 24}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                  <Text style={[styles.textHighlightTitle, {marginBottom: 0, marginTop: 0}]}>MUST-USE INGREDIENTS <Text style={styles.textMutedItalic}>(expiring stock)</Text></Text>
                  {expiringList.length > 0 && (
                    <View style={{flexDirection: 'row', gap: 10}}>
                      <TouchableOpacity onPress={() => massActionExpiring(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => massActionExpiring(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                    </View>
                  )}
                </View>
                <Text style={[styles.textMuted, { fontSize: 12, marginTop: -10, marginBottom: 15 }]}>Tap to de-select any items you don't wish to use for this mission.</Text>
                
                {expiringList.length > 0 ? (
                  <View style={styles.allergenGrid}>
                    {expiringList.map(item => (
                      <TouchableOpacity 
                        accessibilityRole="button"
                        key={item.name} 
                        style={[styles.chipBase, styles.allergenChip, !excludedExpiring.includes(item.name) && styles.chipActiveBlue, { flexDirection: 'row', alignItems: 'center' }]} 
                        onPress={() => toggleExpiring(item.name)}
                        testID={`stock-chip-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {item.cabinetType === 'freezer' && <MaterialCommunityIcons name="snowflake" size={12} color={!excludedExpiring.includes(item.name) ? "white" : "#64748b"} style={{ marginRight: 6 }} />}
                        <Text style={[styles.textChip, !excludedExpiring.includes(item.name) && styles.textChipActive]}>{item.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={{borderWidth: 1, borderColor: '#475569', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 20, alignItems: 'center', marginVertical: 8}}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={28} color="#64748b" />
                    <Text style={{color: '#94a3b8', fontSize: 13, marginTop: 8, fontWeight: 'bold'}}>NO EXPIRING STOCK</Text>
                    <Text style={{color: '#64748b', fontSize: 11, marginTop: 4}}>Items nearing expiry will appear here</Text>
                  </View>
                )}

                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12}}>
                  <MaterialCommunityIcons name="snowflake" size={14} color="#38bdf8" />
                  <Text style={{color: '#94a3b8', fontSize: 13, marginLeft: 6, fontStyle: 'italic'}}>Items marked with ❄️ are currently frozen.</Text>
                </View>

                {/* Fridge Add-Ons */}
                <View style={{marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#334155'}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap'}}>
                    <Text style={[styles.textHighlightTitle, {marginBottom: 0, marginTop: 0}]}>FRIDGE ADD-ONS <Text style={styles.textMutedItalic}>(items going off)</Text></Text>
                    <TouchableOpacity 
                        onPress={() => { setSessionCustomExp([]); triggerStatus("CORE ADD-ONS CLEARED."); }}
                        testID="clear-all-addons-btn"
                    >
                      <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>CLEAR ALL</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10}}>
                    {sessionCustomExp.sort().map(item => (
                      <View key={item} testID={`fridge-addon-chip-${item.toLowerCase().replace(/\s+/g, '-')}`} style={[styles.chipBase, styles.allergenChip, styles.chipActiveBlue, { flexDirection: 'row', alignItems: 'center' }]}>
                          <Text style={[styles.textChip, styles.textPrimary]}>{item}</Text>
                          <TouchableOpacity onPress={() => setSessionCustomExp(prev => prev.filter(x => x !== item))} style={{marginLeft: 8}} testID={`remove-addon-${item.toLowerCase().replace(/\s+/g, '-')}`}>
                            <MaterialCommunityIcons name="close-circle" size={14} color="white" />
                          </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  <View style={{flexDirection: 'row', gap: 10}}>
                      <TextInput
                        style={[styles.input, {flex: 1, height: 44, minHeight: 44, paddingVertical: 8, fontSize: 14}]}
                        placeholder="Add fresh item (e.g. Avocado)"
                        placeholderTextColor="#475569"
                        value={customExpInput}
                        testID="fridge-addons-input"
                        onChangeText={(val) => {
                          setCustomExpInput(val);
                          if (val.trim().length > 1) {
                              const query = val.toLowerCase();
                              const coreNormalized = new Map(FRIDGE_INGREDIENTS.map((n: string) => [n.toLowerCase(), n]));
                              const combined = [...FRIDGE_INGREDIENTS];
                              for (const s of persistentStaples) {
                                if (!coreNormalized.has(s.toLowerCase())) combined.push(s);
                              }

                              const scored = combined.map(name => {
                                const lowerN = name.toLowerCase();
                                let score = 3;
                                if (lowerN === query) score = 0;
                                else if (lowerN.startsWith(query)) score = 0.5;
                                else if (lowerN.includes(query)) score = 0.8;
                                else {
                                  const prefixToScan = lowerN.substring(0, query.length + 1);
                                  const prefixDist = getLevenshteinDistance(query, prefixToScan);
                                  if (prefixDist <= 1) score = 0.9;
                                  else {
                                    const fullDist = getLevenshteinDistance(query, lowerN);
                                    if (fullDist <= 2) score = 1.0 + (fullDist * 0.2);
                                  }
                                }
                                return { name, score, usage: usageStats[name] || 0 };
                              });

                              const matches = scored
                                .filter(item => item.score <= 2)
                                .sort((a, b) => {
                                    if (a.score !== b.score) return a.score - b.score;
                                    if (a.usage !== b.usage) return b.usage - a.usage;
                                    return a.name.localeCompare(b.name);
                                })
                                .slice(0, 3)
                                .map(item => item.name);
                              setFridgeSuggestions(matches);
                          } else {
                              setFridgeSuggestions([]);
                          }
                        }}
                        onBlur={handleFridgeBlur}
                        onSubmitEditing={() => handleAddStaple(customExpInput, 'selectedAddons')}
                      />
                      <TouchableOpacity 
                        style={{backgroundColor: '#334155', borderRadius: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}} 
                        onPress={() => handleAddStaple(customExpInput, 'selectedAddons')}
                        testID="fridge-addons-add-btn"
                      >
                        <MaterialCommunityIcons name="plus" size={24} color="#fbbf24" />
                      </TouchableOpacity>
                  </View>

                  <View style={{height: 24, justifyContent: 'center', marginTop: 4, zIndex: 10}}>
                        <View style={{flexDirection: 'row', gap: 6}}>
                          {fridgeSuggestions.map(item => {
                            const isCustom = persistentStaples.includes(item) && !FRIDGE_INGREDIENTS.includes(item);
                            return (
                              <View key={item} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#334155', paddingLeft: 8, paddingRight: 4, paddingVertical: 4, borderRadius: 4, gap: 4}}>
                                <TouchableOpacity onPress={() => handleAddStaple(item, 'selectedAddons')} testID={`addon-suggestion-${item.toLowerCase().replace(/\s+/g, '-')}`}>
                                  <Text style={{color: '#38bdf8', fontSize: 9, fontWeight: 'bold'}}>{item.toUpperCase()}</Text>
                                </TouchableOpacity>
                                {isCustom && (
                                  <TouchableOpacity onPress={() => handlePurgeVocabulary(item)} testID={`purge-vocab-${item.toLowerCase().replace(/\s+/g, '-')}`}>
                                    <MaterialCommunityIcons name="trash-can-outline" size={12} color="#f43f5e" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            );
                          })}
                        </View>
                  </View>
                </View>
              </View>

              <View style={{marginBottom: 24}}>
                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>PREFERRED INGREDIENTS <Text style={styles.textMutedItalic}>(favourites)</Text></Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. Lemon, Garlic, Pasta"
                  placeholderTextColor="#475569"
                  value={preferred}
                  onChangeText={(val) => { setPreferred(val); savePref('recipe_preferred', val); }}
                  multiline
                  spellCheck={false}
                  autoCorrect={false}
                  data-gramm={false}
                  testID="fav-ingredients-input"
                />
              </View>

              <View style={{marginBottom: 24}}>
                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>AVOIDED INGREDIENTS <Text style={styles.textMutedItalic}>(dislikes)</Text></Text>
                <TextInput 
                  style={styles.input} 
                  placeholder="e.g. Olives, Anchovies, Liver"
                  placeholderTextColor="#475569"
                  value={avoid}
                  onChangeText={(val) => { setAvoid(val); savePref('recipe_avoided', val); }}
                  multiline
                  spellCheck={false}
                  autoCorrect={false}
                  data-gramm={false}
                  testID="avoid-ingredients-input"
                />
              </View>
            </View>
          )}

          {/* â”€â”€ TIER 2: OPTIONAL INGREDIENTS (collapsible) â”€â”€ */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => toggleAccordion('optional')}
            style={styles.protocolRibbon}
            testID="optional-ribbon"
          >
            <View style={{flex: 1}}>
              <Text style={styles.textHighlightTitle}>OPTIONAL INGREDIENTS</Text>
              <Text style={[styles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
                {[
                  selectedStaples.length > 0 ? `${selectedStaples.length} Fridge` : null,
                  pantryList.length > 0 ? `${pantryList.length - excludedPantry.length} Pantry` : null,
                  freezerList.length > 0 ? `${freezerList.length - excludedFreezer.length} Freezer` : null,
                ].filter(Boolean).join('  ·  ') || 'No optional items'}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: optionalAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#64748b" />
            </Animated.View>
          </TouchableOpacity>

          {activeAccordion === 'optional' && (
            <View style={styles.protocolBody}>
              <View style={{marginTop: 16, marginBottom: 24}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                    <Text style={[styles.textHighlightTitle, {marginBottom: 0, marginTop: 0}]} testID="fridge-staples-title">FRIDGE STAPLES <Text style={styles.textMutedItalic}>(select to include)</Text></Text>
                    <View style={{flexDirection: 'row', gap: 10}}>
                      <TouchableOpacity 
                        onPress={() => {
                            setSelectedStaples([]);
                            savePref('recipe_fridge_staples_selected', "");
                            triggerStatus("FRIDGE STAPLES CLEARED.");
                        }}
                        testID="clear-all-staples-btn"
                      >
                        <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>CLEAR ALL</Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12}}>
                    {selectedStaples.sort().map(s => (
                       <View key={s} testID={`fridge-staple-chip-${s.toLowerCase().replace(/\s+/g, '-')}`} style={[styles.chipBase, styles.allergenChip, styles.chipActiveBlue, { flexDirection: 'row', alignItems: 'center' }]}>
                        <Text style={[styles.textChip, styles.textPrimary]}>{s}</Text>
                        <TouchableOpacity onPress={() => toggleStaple(s)} style={{marginLeft: 8}} testID={`remove-staple-${s.toLowerCase().replace(/\s+/g, '-')}`}>
                          <MaterialCommunityIcons name="close-circle" size={14} color="white" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>

                  <View style={{flexDirection: 'row', gap: 10}}>
                    <TextInput 
                      style={[styles.input, {flex: 1, height: 44, minHeight: 44, paddingVertical: 8, fontSize: 14}]}
                      placeholder="e.g. Eggs, Milk, Cheese"
                      placeholderTextColor="#475569"
                      value={staplesInput}
                      testID="fridge-staples-input"
                      onChangeText={(val) => {
                        setStaplesInput(val);
                        if (val.trim().length > 1) {
                            const query = val.toLowerCase();
                            const coreNormalized = new Map(FRIDGE_INGREDIENTS.map((n: string) => [n.toLowerCase(), n]));
                            const combined = [...FRIDGE_INGREDIENTS];
                            for (const s of persistentStaples) {
                                if (!coreNormalized.has(s.toLowerCase())) combined.push(s);
                            }

                            const scored = combined.map(name => {
                                const lowerN = name.toLowerCase();
                                let score = 3;
                                if (lowerN === query) score = 0;
                                else if (lowerN.startsWith(query)) score = 0.5;
                                else if (lowerN.includes(query)) score = 0.8;
                                else {
                                    const prefixToScan = lowerN.substring(0, query.length + 1);
                                    const prefixDist = getLevenshteinDistance(query, prefixToScan);
                                    if (prefixDist <= 1) score = 0.9;
                                    else {
                                        const fullDist = getLevenshteinDistance(query, lowerN);
                                        if (fullDist <= 2) score = 1.0 + (fullDist * 0.2);
                                    }
                                }
                                return { name, score, usage: usageStats[name] || 0 };
                            });

                            const matches = scored
                                .filter(item => item.score <= 2)
                                .sort((a, b) => {
                                    if (a.score !== b.score) return a.score - b.score;
                                    if (a.usage !== b.usage) return b.usage - a.usage;
                                    return a.name.localeCompare(b.name);
                                })
                                .slice(0, 3)
                                .map(item => item.name);
                            setStapleSuggestions(matches);
                        } else {
                            setStapleSuggestions([]);
                        }
                      }}
                      onBlur={handleStaplesBlur}
                      onSubmitEditing={() => handleAddStaple(staplesInput, 'selectedStaples')}
                    />
                    <TouchableOpacity 
                      style={{backgroundColor: '#334155', borderRadius: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}} 
                      onPress={() => handleAddStaple(staplesInput, 'selectedStaples')}
                      testID="fridge-staples-add-btn"
                    >
                      <MaterialCommunityIcons name="plus" size={24} color="#fbbf24" />
                    </TouchableOpacity>
                  </View>

                  <View style={{height: 24, justifyContent: 'center', marginTop: 4, zIndex: 10}}>
                    <View style={{flexDirection: 'row', gap: 6}}>
                      {stapleSuggestions.map(item => {
                        const isCustom = persistentStaples.includes(item) && !FRIDGE_INGREDIENTS.includes(item);
                        return (
                          <View key={item} testID={`staple-suggestion-${item.toLowerCase().replace(/\s+/g, '-')}`} style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#334155', paddingLeft: 8, paddingRight: 4, paddingVertical: 4, borderRadius: 4, gap: 4}}>
                            <TouchableOpacity onPress={() => handleAddStaple(item, 'selectedStaples')}>
                              <Text style={{color: '#38bdf8', fontSize: 9, fontWeight: 'bold'}}>{item.toUpperCase()}</Text>
                            </TouchableOpacity>
                            {isCustom && (
                              <TouchableOpacity onPress={() => handlePurgeVocabulary(item)} testID={`purge-vocab-${item.toLowerCase().replace(/\s+/g, '-')}`}>
                                <MaterialCommunityIcons name="trash-can-outline" size={12} color="#f43f5e" />
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={{marginBottom: 24}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                    <Text style={[styles.textHighlightTitle, {marginBottom: 0, marginTop: 0}]}>PANTRY STOCK <Text style={styles.textMutedItalic}>(room temp)</Text></Text>
                    {pantryList.length > 0 && (
                      <View style={{flexDirection: 'row', gap: 10}}>
                        <TouchableOpacity onPress={() => massActionPantry(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => massActionPantry(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.textMuted, { fontSize: 12, marginTop: -10, marginBottom: 15 }]}>Tap to include/exclude pantry items from the briefing.</Text>
                  <View style={styles.allergenGrid}>
                    {pantryList.length > 0 ? pantryList.sort().map(name => (
                      <TouchableOpacity 
                        key={name}
                        style={[styles.chipBase, styles.allergenChip, !excludedPantry.includes(name) && styles.chipActiveBlue]}
                        onPress={() => togglePantry(name)}
                      >
                        <Text style={[styles.textChip, !excludedPantry.includes(name) && styles.textChipActive]}>{name}</Text>
                      </TouchableOpacity>
                    )) : (
                      <View style={{borderWidth: 1, borderColor: '#475569', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 20, alignItems: 'center', marginVertical: 8, width: '100%'}}>
                        <MaterialCommunityIcons name="package-variant" size={28} color="#64748b" />
                        <Text style={{color: '#94a3b8', fontSize: 13, marginTop: 8, fontWeight: 'bold'}}>PANTRY EMPTY</Text>
                        <Text style={{color: '#64748b', fontSize: 11, marginTop: 4}}>No room-temperature items in inventory</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={{marginBottom: 24}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                    <Text style={[styles.textHighlightTitle, {marginBottom: 0, marginTop: 0}]}>FREEZER STOCK <Text style={styles.textMutedItalic}>(long term)</Text></Text>
                    {freezerList.length > 0 && (
                      <View style={{flexDirection: 'row', gap: 10}}>
                        <TouchableOpacity onPress={() => massActionFreezer(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                        <TouchableOpacity onPress={() => massActionFreezer(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.textMuted, { fontSize: 12, marginTop: -10, marginBottom: 15 }]}>Tap to include/exclude freezer items from the briefing.</Text>
                  <View style={styles.allergenGrid}>
                    {freezerList.length > 0 ? freezerList.sort().map(name => (
                      <TouchableOpacity 
                        key={name}
                        style={[styles.chipBase, styles.allergenChip, !excludedFreezer.includes(name) && styles.chipActiveBlue]}
                        onPress={() => toggleFreezer(name)}
                      >
                        <Text style={[styles.textChip, !excludedFreezer.includes(name) && styles.textChipActive]}>{name}</Text>
                      </TouchableOpacity>
                    )) : (
                      <View style={{borderWidth: 1, borderColor: '#475569', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 20, alignItems: 'center', marginVertical: 8, width: '100%'}}>
                        <MaterialCommunityIcons name="snowflake" size={28} color="#64748b" />
                        <Text style={{color: '#94a3b8', fontSize: 13, marginTop: 8, fontWeight: 'bold'}}>FREEZER EMPTY</Text>
                        <Text style={{color: '#64748b', fontSize: 11, marginTop: 4}}>No frozen items in inventory</Text>
                      </View>
                    )}
                  </View>
                </View>
            </View>
          )}

          {/* â”€â”€ TIER 3: DIETARY & SAFETY (collapsible) â”€â”€ */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => toggleAccordion('protocols')}
            style={styles.protocolRibbon}
            testID="protocols-ribbon"
          >
            <View style={{flex: 1}}>
              <Text style={styles.textHighlightTitle}>HEALTH & DIETARY PROFILE</Text>
              <Text style={[styles.textSecondary, { fontSize: 12, marginTop: 4 }]}>
                {[
                  selectedDietary.length > 0 ? `${selectedDietary.length} Diet` : null,
                  selectedAllergens.length > 0 ? `${selectedAllergens.length} Allergens` : null,
                  selectedMedical.length > 0 ? `${selectedMedical.length} Medical` : null,
                  selectedGoals.length > 0 ? `${selectedGoals.length} Goals` : null,
                ].filter(Boolean).join('  ·  ') || 'Standard Protocols'}
              </Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: protocolsAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#64748b" />
            </Animated.View>
          </TouchableOpacity>

           {activeAccordion === 'protocols' && (
            <View style={styles.protocolBody}>
              <View style={{marginTop: 16, marginBottom: 24}}>
                    {/* --- STRATEGIC SILO ISOLATION (SERGEANT GATED) --- */}
                    <View style={{ marginBottom: 24 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 }}>
                        <Text style={[styles.textHighlightTitle, { marginTop: 0 }]}>STRATEGIC SILO ISOLATION</Text>
                        <MaterialCommunityIcons name="shield-lock" size={14} color="#60a5fa" />
                      </View>
                      
                      <View style={[styles.panelBase, { padding: 12, backgroundColor: '#111827' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <MaterialCommunityIcons name="office-building-marker" size={18} color={siloCabinetId ? '#fbbf24' : '#64748b'} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: '#f8fafc', fontSize: 13, fontWeight: 'bold' }}>Cabinet Lockdown</Text>
                            <Text style={{ color: '#94a3b8', fontSize: 11 }}>Restrict intelligence search to a single storage site.</Text>
                          </View>
                          <Switch
                            value={!!siloCabinetId}
                            onValueChange={() => {
                              if (!checkEntitlement('SILO_ISOLATION')) return;
                              if (siloCabinetId) {
                                setSiloCabinetId(null);
                                savePref('recipe_silo_cabinet', "");
                              } else if (cabinets.length > 0) {
                                setSiloCabinetId(cabinets[0].id);
                                savePref('recipe_silo_cabinet', cabinets[0].id.toString());
                              }
                            }}
                            trackColor={{ false: '#334155', true: '#1e3a5f' }}
                            thumbColor={siloCabinetId ? '#fbbf24' : '#64748b'}
                          />
                        </View>

                        {siloCabinetId && (
                           <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                             {cabinets.map(cab => (
                               <TouchableOpacity
                                 key={cab.id}
                                 onPress={() => {
                                   setSiloCabinetId(cab.id);
                                   savePref('recipe_silo_cabinet', cab.id.toString());
                                 }}
                                 style={[
                                   styles.chipBase,
                                   { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: siloCabinetId === cab.id ? '#1e3a5f' : '#1e293b', borderColor: siloCabinetId === cab.id ? '#3b82f6' : '#334155' }
                                 ]}
                               >
                                 <Text style={{ color: siloCabinetId === cab.id ? '#f8fafc' : '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>
                                   {cab.name.toUpperCase()}
                                 </Text>
                               </TouchableOpacity>
                             ))}
                           </View>
                        )}
                      </View>
                    </View>
                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>DIETARY PREFERENCES <Text style={styles.textMutedItalic}>(global rules)</Text></Text>
                <View style={styles.allergenGrid}>
                  {DIETARY_CHOICES.map(c => (
                    <TouchableOpacity 
                      key={c}
                      style={[styles.chipBase, styles.allergenChip, selectedDietary.includes(c) && styles.chipActiveRed]}
                      onPress={() => toggleDietary(c)}
                      testID={`dietary-chip-${c.toLowerCase()}`}
                    >
                      <Text style={[styles.textChip, selectedDietary.includes(c) && styles.textChipActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>ALLERGEN FORBIDDEN LIST <Text style={styles.textMutedItalic}>(strict exclusion)</Text></Text>
                <View style={styles.allergenGrid}>
                  {ALLERGENS.map(a => (
                    <TouchableOpacity 
                      key={a}
                      style={[styles.chipBase, styles.allergenChip, selectedAllergens.includes(a) && styles.chipActiveRed]}
                      onPress={() => toggleAllergen(a)}
                      testID={`allergen-chip-${a.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Text style={[styles.textChip, selectedAllergens.includes(a) && styles.textChipActive]}>{a}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>MEDICAL GUIDELINES <Text style={styles.textMutedItalic}>(doctor's orders)</Text></Text>
                <View style={styles.allergenGrid}>
                  {MEDICAL_GUIDELINES.map(m => (
                    <TouchableOpacity 
                      key={m}
                      style={[styles.chipBase, styles.allergenChip, selectedMedical.includes(m) && styles.chipActiveRed]}
                      onPress={() => toggleMedical(m)}
                      testID={`medical-chip-${m.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Text style={[styles.textChip, selectedMedical.includes(m) && styles.textChipActive]}>{m}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.textHighlightTitle, { marginBottom: 15, marginTop: 10 }]}>HEALTH & LIFESTYLE GOALS <Text style={styles.textMutedItalic}>(optimise for)</Text></Text>
                <View style={styles.allergenGrid}>
                  {HEALTH_GOALS.map(g => (
                    <TouchableOpacity 
                      key={g}
                      style={[styles.chipBase, styles.allergenChip, selectedGoals.includes(g) && styles.chipActiveBlue]}
                      onPress={() => toggleGoal(g)}
                      testID={`goal-chip-${g.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <Text style={[styles.textChip, selectedGoals.includes(g) && styles.textChipActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {/* â”€â”€ TIER 4: DEPLOYMENT STATIONS (collapsible) â”€â”€ */}
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => toggleAccordion('deploy')}
            style={styles.protocolRibbon}
            testID="deploy-ribbon"
          >
            <View style={{flex: 1}}>
              <Text style={styles.textHighlightTitle}>DEPLOYMENT STATIONS</Text>
              <Text style={[styles.textSecondary, { fontSize: 12, marginTop: 4 }]}>3 Active Launchpads</Text>
            </View>
            <Animated.View style={{ transform: [{ rotate: deployAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
              <MaterialCommunityIcons name="chevron-down" size={20} color="#64748b" />
            </Animated.View>
          </TouchableOpacity>

          {activeAccordion === 'deploy' && (
            <View style={styles.protocolBody}>
              <View style={{marginTop: 16, marginBottom: 24}}>
                <Text style={[styles.textSecondary, {marginBottom: 16, marginTop: 0}]}>Configure three AI command centers for one-click briefing transmission.</Text>
                
                {deployStations && deployStations.map((s, idx) => (
                  <View key={idx} style={{marginBottom: 24}}>
                    <Text style={[styles.textHighlightTitle, { marginBottom: 15 }]}>STATION {idx + 1}</Text>
                    
                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
                      <Text style={[styles.textSecondary, { fontSize: 13, fontWeight: 'bold', width: 55 }]}>Name</Text>
                      <TextInput 
                        style={[styles.input, {flex: 1, minHeight: 40, height: 40, fontSize: 14}]}
                        placeholder="e.g. ChatGPT"
                        placeholderTextColor="#475569"
                        value={s.name}
                        onChangeText={(val) => updateStation(idx, 'name', val)}
                      />
                    </View>

                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <Text style={[styles.textSecondary, { fontSize: 13, fontWeight: 'bold', width: 55 }]}>URL</Text>
                      <TextInput 
                        style={[styles.input, {flex: 1, minHeight: 40, height: 40, fontSize: 13, color: '#94a3b8'}]}
                        placeholder="e.g. https://chatgpt.com"
                        placeholderTextColor="#475569"
                        value={s.url}
                        onChangeText={(val) => updateStation(idx, 'url', val)}
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{height: 100}} /> 
        </View>
      </KeyboardAwareScrollView>

      {/* --- INGREDIENT HARMONIZER MODAL --- */}
      {showIngredientFuzzyModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '90%', maxWidth: 400 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <NearMissIcon />
              <Text style={styles.modalTitle}>NEAR MISS DETECTED</Text>
            </View>
            <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
              <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>{pendingIngredientVal}</Text> appears to be a possible near miss. Align this <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>ingredient</Text> entry with the established vocabulary for this field?
            </Text>
            <View style={{ marginBottom: 10, gap: 8 }}>
              {fuzzyIngredientMatches.map(match => (
                <TouchableOpacity 
                  key={match}
                  style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  onPress={() => {
                    handleAddStaple(match, pendingIngredientSegment === 'staple' ? 'selectedStaples' : 'selectedAddons');
                    setShowIngredientFuzzyModal(false);
                  }}
                >
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color="#3b82f6" />
                  <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>{match.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#334155', padding: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => {
                  setIgnoredFuzzyIngredients(prev => new Set(prev).add(pendingIngredientVal.toLowerCase()));
                  handleAddStaple(pendingIngredientVal, pendingIngredientSegment === 'staple' ? 'selectedStaples' : 'selectedAddons');
                  setShowIngredientFuzzyModal(false);
                }}
              >
                <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>IGNORE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#1e293b', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#475569' }}
                onPress={() => setShowIngredientFuzzyModal(false)}
              >
                <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>EDIT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* --- CHEF HARMONIZER MODAL --- */}
      {showChefFuzzyModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: '#f59e0b', borderWidth: 2, width: '90%', maxWidth: 400 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <NearMissIcon />
              <Text style={styles.modalTitle}>NEAR MISS DETECTED</Text>
            </View>
            <Text style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 18, marginBottom: 20 }}>
              <Text style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 15 }}>{pendingChefVal}</Text> appears to be a possible near miss. Align this <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>chef</Text> entry with the established vocabulary for this field?
            </Text>
            <View style={{ marginBottom: 10, gap: 8 }}>
              {fuzzyChefMatches.map(match => (
                <TouchableOpacity 
                  key={match}
                  style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#334155', flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  onPress={() => {
                    setSelectedChef(match);
                    setCustomInput(match);
                    savePref('recipe_chef', match);
                    setShowChefFuzzyModal(false);
                  }}
                >
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color="#3b82f6" />
                  <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>{match.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#334155', padding: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => {
                  setIgnoredFuzzyChefs(prev => new Set(prev).add(pendingChefVal.toLowerCase()));
                  setSelectedChef(pendingChefVal);
                  setCustomInput(pendingChefVal);
                  savePref('recipe_chef', pendingChefVal);
                  setShowChefFuzzyModal(false);
                }}
              >
                <Text style={{ color: '#cbd5e1', fontWeight: 'bold' }}>IGNORE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#1e293b', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#475569' }}
                onPress={() => setShowChefFuzzyModal(false)}
              >
                <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>EDIT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {renderStatus()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  headerColumn: { 
    backgroundColor: '#1e293b', 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#334155' 
  },
  headerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16, 
    paddingTop: Platform.OS === 'ios' ? 40 : 10, 
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  headerTopRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 16,
    marginBottom: 2
  },
  headerSubRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  headerSideCol: { width: 32 },
  headerCenterCol: { flex: 1 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc' },
  subtitle: { color: '#94a3b8', fontSize: 11, textAlign: 'left' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#334155', borderRadius: 16 },
  rankPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: '#334155' },
  rankPillText: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },
  scrollContent: { padding: 20 },

  /* --- TYPOGRAPHY --- */
  textPrimary: { color: '#f8fafc', fontSize: 14 },
  textSecondary: { color: '#cbd5e1', fontSize: 13, lineHeight: 20 },
  textMuted: { color: '#94a3b8', fontSize: 11 },
  textMutedItalic: { color: '#94a3b8', fontSize: 11, fontStyle: 'italic' },
  textHighlightTitle: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5 },
  textChip: { color: '#cbd5e1', fontSize: 13, fontWeight: 'bold' },
  textChipActive: { color: '#f8fafc' },

  /* --- CONTAINERS & PANELS --- */
  panelBase: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 12 },
  card: { padding: 16, marginBottom: 24 },
  prefGroup: { padding: 12, marginBottom: 24 },
  anchoredPanel: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155', backgroundColor: '#1e293b' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },

  /* --- CHIPS --- */
  chipBase: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, marginVertical: 4, marginHorizontal: 4 },
  allergenChip: { backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  chefChip: { backgroundColor: '#111827', borderColor: '#374151', borderRadius: 99, paddingHorizontal: 16, paddingVertical: 10, minWidth: 80, justifyContent: 'center' },
  chipActiveBlue: { backgroundColor: '#3b82f6', borderColor: '#60a5fa' },
  chipActiveRed: { backgroundColor: '#ef4444', borderColor: '#ef4444' },

  /* --- BUTTONS --- */
  btnBase: { borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: '#fbbf24' },
  btnSecondary: { backgroundColor: '#334155' },
  btnTextPrimary: { color: '#0f172a', fontWeight: 'bold', fontSize: 16 },
  btnTextSecondary: { color: 'white', fontWeight: 'bold', fontSize: 16 },
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
  protocolBody: { overflow: 'hidden', paddingHorizontal: 16 },
  
  /* --- MODALS --- */
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(2, 6, 23, 0.9)', justifyContent: 'center', alignItems: 'center', padding: 20, zIndex: 1000 },
  modalContent: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24, width: '100%', borderWidth: 1, borderColor: '#334155' },
  modalTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
});


const markdownStyles = StyleSheet.create({
  body: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  heading1: { color: '#f8fafc', marginTop: 16, marginBottom: 8, fontSize: 24, fontWeight: 'bold' },
  heading2: { color: '#fbbf24', marginTop: 16, marginBottom: 8, fontSize: 20, fontWeight: 'bold' },
  heading3: { color: '#3b82f6', marginTop: 16, marginBottom: 8, fontSize: 18, fontWeight: 'bold' },
  hr: { backgroundColor: '#334155', height: 1, marginVertical: 16 },
  strong: { color: '#f8fafc', fontWeight: 'bold' },
  em: { color: '#94a3b8', fontStyle: 'italic' },
  code_inline: { backgroundColor: '#1e293b', color: '#fbbf24', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  table: { borderColor: '#334155', borderWidth: 1, borderRadius: 8, marginVertical: 10 },
  tr: { borderBottomWidth: 1, borderBottomColor: '#334155', flexDirection: 'row' },
  th: { flex: 1, padding: 8, backgroundColor: '#111827', color: '#f8fafc', fontWeight: 'bold' },
  td: { flex: 1, padding: 8, color: '#cbd5e1' },
});
