import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Animated, LayoutAnimation, Platform, UIManager, Linking } from 'react-native';
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

const DIETARY_CHOICES = ["Meat", "Pescetarian", "Vegetarian", "Vegan", "Don't Mind"];
const ALLERGENS = [
  "Celery", "Cereals (Gluten)", "Crustaceans", "Eggs", "Fish", "Lupin", "Milk", 
  "Molluscs", "Mustard", "Tree Nuts", "Peanuts", "Sesame", "Soya", "Sulphites"
];

const FRIDGE_STAPLES_PRESETS = ["Butter", "Carrots", "Eggs", "Leeks", "Milk", "Peppers"];

import { useBilling } from '../context/BillingContext';

export default function RecipesScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { checkEntitlement } = useBilling();

  const [dietary, setDietary] = useState("Meat");
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
  const chefs = [
    "BBC Good Food", "Gordon Ramsay", "Ina Garten", "Jamie Oliver", "Nigella Lawson", "Ottolenghi", "Rachael Ray"
  ];

  const CHEF_PHILOSOPHIES: Record<string, string> = {
    "BBC Good Food": "Dependable, triple-tested classics focused on accessibility and foolproof results.",
    "Gordon Ramsay": "Elite precision and bold flavors, respecting ingredients through refined technique.",
    "Ina Garten": "Elegant, foolproof home cooking that emphasizes high-quality ingredients and classic hospitality.",
    "Jamie Oliver": "Rebelliously simple cooking that celebrates fresh produce and vibrant, rustic flavors.",
    "Nigella Lawson": "Home-style comfort that prioritizes the pure pleasure of eating over technical perfection.",
    "Ottolenghi": "Vibrant, Middle-Eastern-inspired fusion celebrating bold spices and abundant vegetables.",
    "Rachael Ray": "High-speed, practical '30-minute' meals focused on big flavor and common supermarket finds."
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
      const rows = await db.getAllAsync<{key: string, value: string}>('SELECT * FROM Settings WHERE key LIKE ? OR key IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
        'recipe_deploy_%', 'dietary_pref', 'recipe_preferred', 'recipe_avoided', 'recipe_allergens', 'recipe_excluded_expiring', 'recipe_excluded_pantry', 'recipe_excluded_freezer', 'recipe_extra', 'recipe_mode', 'recipe_chef', 'recipe_hide_deploy_guide', 'recipe_custom_chefs', 'recipe_fridge_staples_selected', 'recipe_fridge_staples_persistent', 'recipe_active_accordion', 'recipe_expiring_history'
      );
      rows.forEach(r => {
        if (r.key === 'recipe_expiring_history') {
          try {
            const parsed = JSON.parse(r.value);
            setHistoryExp(Array.isArray(parsed) ? parsed : []);
          } catch (e) {
            // Fallback for legacy CSV format
            setHistoryExp(r.value.split(',').filter(Boolean));
          }
        }
        if (r.key === 'dietary_pref') setDietary(r.value);
        if (r.key === 'recipe_preferred') setPreferred(r.value);
        if (r.key === 'recipe_avoided') setAvoid(r.value);
        if (r.key === 'recipe_extra') setExtraRequests(r.value);
        if (r.key === 'recipe_mode') setRecipeMode(r.value as any);
        if (r.key === 'recipe_chef') setSelectedChef(r.value);
        if (r.key === 'recipe_hide_deploy_guide') setHideDeployGuide(r.value === 'true');
        if (r.key === 'recipe_custom_chefs') {
          tempCustomChefs = r.value.split(',').filter(Boolean);
          setLastCustomChef(tempCustomChefs[tempCustomChefs.length - 1] || null);
        }
        if (r.key === 'recipe_fridge_staples_selected') setSelectedStaples(r.value.split(',').filter(Boolean));
        if (r.key === 'recipe_fridge_staples_persistent') setPersistentStaples(r.value.split(',').filter(Boolean));
        if (r.key === 'recipe_active_accordion' && r.value !== 'none') {
           setActiveAccordion(r.value as AccordionSection);
           if (r.value === 'mode') modeAnim.setValue(1);
           if (r.value === 'core') coreAnim.setValue(1);
           if (r.value === 'optional') optionalAnim.setValue(1);
           if (r.value === 'protocols') protocolsAnim.setValue(1);
           if (r.value === 'deploy') deployAnim.setValue(1);
        }
        if (r.key === 'recipe_allergens') setSelectedAllergens(r.value ? r.value.split(',') : []);
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
        JOIN Cabinets cab ON cab.id = inv.cabinet_id
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
  }, [db]);

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

  const handleAddStaple = (val: string) => {
    const cleaned = val.trim();
    if (!cleaned) return;
    
    // Auto-select it
    if (!selectedStaples.includes(cleaned)) {
      setSelectedStaples(prev => [...prev, cleaned]);
    }
    
    // Add to persistent if not there
    if (!persistentStaples.includes(cleaned)) {
      const next = [...persistentStaples, cleaned];
      setPersistentStaples(next);
      savePref('recipe_fridge_staples_persistent', next.join(','));
    }
    
    setStaplesInput("");
    setStapleSuggestions([]);
  };

  const handleStaplesBlur = () => {
    setStapleSuggestions([]);
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
             i.freeze_months, i.unit_type, i.default_size
      FROM Inventory inv
      JOIN ItemTypes i ON i.id = inv.item_type_id
      JOIN Cabinets cab ON cab.id = inv.cabinet_id
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
        return `- ${item.name}${sizePart}`;
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
      .replace('[DIETARY_PREF]', dietary)
      .replace('[LIST_ALLERGENS]', selectedAllergens.length > 0 ? selectedAllergens.map(a => `- ${a}`).sort().join('\n') : "None declared.")
      .replace('[LIST_STAPLES]', selectedStaples.length > 0 ? selectedStaples.sort().map(s => `- ${s}`).join('\n') : "No fresh staples defined.")
      .replace('[LIST_EXPIRING]', allExpiringString || "No mandatory supplies found in inventory.")
      .replace('[LIST_PANTRY]', pantryListPrompt)
      .replace('[LIST_FREEZER]', freezerListPrompt)
      .replace('[LIST_PREFERRED]', formatCsvList(preferred))
      .replace('[LIST_AVOID]', formatCsvList(avoid))
      .replace('[EXTRA_REQUESTS]', extraRequests ? extraRequests : "None declared.")
      .replace('[RECIPE_MODE]', recipeMode.toUpperCase())
      .replace('[CHEF_STRATEGY_LINE]', 
        recipeMode === "experimental" ? "- **Influence:** No specific influence. Focus on zero-waste improvisation." : 
        (recipeMode === "authentic" ? `- **Target Source:** ${selectedChef}` : `- **Chef Influence:** Adopt the culinary philosophy, seasoning style, and voice of ${selectedChef}.`)
      )
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
          <View style={styles.card}>
              <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="information-outline" size={24} color="#38bdf8" style={{marginRight: 10}} />
                  <Text style={styles.cardTitle}>DEPLOYMENT BRIEFING</Text>
              </View>
              <Text style={styles.cardBody}>
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
                style={[styles.generateBtn, {marginTop: 30}]} 
                onPress={confirmDeploy}
                accessibilityRole="button"
              >
                  <Text style={styles.generateText}>PROCEED TO DEPLOYMENT</Text>
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
             <Text style={styles.headerSubtitle}>Ready for AI station transmission</Text>
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
      <View style={styles.headerRow}>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={styles.backBtn} testID="back-btn">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#f8fafc" />
        </TouchableOpacity>
        <View style={{flex: 1, marginLeft: 16}}>
          <Text style={styles.title}>The Mess Hall</Text>
          <Text style={styles.headerSubtitle}>Waste-conscious recipe suggestions</Text>
        </View>
      </View>

      {/* ── COMMAND DECK (Top-Anchored) ── */}
      <View style={styles.anchoredPanel}>
        {showConfirm ? (
          <View style={{alignItems: 'center'}}>
            <Text style={[styles.confirmText, {marginBottom: 10}]}>NO MANDATORY SUPPLIES SELECTED. PROCEED?</Text>
            <View style={{flexDirection: 'row', gap: 10, width: '100%'}}>
              <TouchableOpacity accessibilityRole="button" style={[styles.generateBtn, {flex: 1, backgroundColor: '#334155', padding: 12}]} onPress={() => setShowConfirm(false)}>
                <Text style={[styles.generateText, {color: 'white', fontSize: 13}]}>BACK</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={[styles.generateBtn, {flex: 1, padding: 12}]} onPress={() => { setShowConfirm(false); handleView(); }}>
                <Text style={[styles.generateText, {fontSize: 13}]}>CONTINUE</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity accessibilityRole="button" style={styles.generateBtn} onPress={handleView} testID="generate-prompt-btn">
            <MaterialCommunityIcons name="auto-fix" size={20} color="#0f172a" />
            <View style={{marginLeft: 12, alignItems: 'flex-start'}}>
              <Text style={[styles.generateText, {fontSize: 14}]}>GENERATE MISSION BRIEFING</Text>
              <Text style={{color: '#0f172a', fontSize: 9, fontWeight: 'bold', opacity: 0.7}}>ANALYZE INVENTORY & DEPLOY PROMPT</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      <KeyboardAwareScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={182}
        extraHeight={182}
      >
        <View style={styles.card}>
          <View style={styles.cardHeader}>
             <MaterialCommunityIcons name="chef-hat" size={20} color="#fbbf24" style={{marginRight: 8}} />
             <Text style={styles.cardTitle}>MESS HALL MISSION</Text>
          </View>
          <Text style={styles.cardBody}>
            Turn your expiring ingredients into elite recipes. Select your mode, define your ingredient preferences, hit generate, and deploy to your favourite AI.
          </Text>
        </View>

        {/* ── TIER 0: RECIPE MODE & CHEF (collapsible) ── */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => toggleAccordion('mode')}
          style={styles.protocolRibbon}
          testID="mode-ribbon"
        >
          <View style={{flex: 1}}>
            <Text style={styles.protocolRibbonTitle}>RECIPE MODE & CHEF</Text>
            <Text style={styles.protocolRibbonSummary}>
              {[
                recipeMode === 'experimental' ? 'Experimental' : `${recipeMode === 'inspired' ? 'Inspired' : 'Authentic'} (${selectedChef || 'No Chef'})`,
                extraRequests.split(',').filter(s => s.trim().length > 0).length > 0 ? `${extraRequests.split(',').filter(s => s.trim().length > 0).length} Directive${extraRequests.split(',').filter(s => s.trim().length > 0).length === 1 ? '' : 's'}` : null,
              ].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
          <Animated.View style={{ transform: [{ rotate: modeAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Text style={styles.protocolChevron}>⌄</Text>
          </Animated.View>
        </TouchableOpacity>

        {activeAccordion === 'mode' && (
          <View style={styles.protocolBody}>
          <View style={{marginTop: 16, marginBottom: 24}}>
             <Text style={styles.sectionTitle}>RECIPE MODE <Text style={styles.sectionInlineSubtitle}>(choose your approach)</Text></Text>
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
             <Text style={[styles.sectionSubtitle, {marginTop: 8}]}>
                {recipeMode === 'experimental' ? "Pure AI improvisation focused on zero-waste utility." : 
                 recipeMode === 'inspired' ? "AI improvisation adopting the seasoning, style, and voice of your chosen chef." : 
                 "Robust archive search for real, published recipes verified by the AI."}
             </Text>
          </View>

          {(recipeMode === "inspired" || recipeMode === "authentic") && (
            <View style={{marginBottom: 24}}>
              <Text style={styles.sectionTitle}>LEGENDARY CHEF INTEL <Text style={styles.sectionInlineSubtitle}>(adopt an identity)</Text></Text>
              <View style={styles.allergenGrid}>
                {chefs.map(chef => (
                  <TouchableOpacity 
                    accessibilityRole="button"
                    key={chef} 
                    style={[styles.chefChip, selectedChef === chef && styles.chefChipActive]} 
                    onPress={() => { setSelectedChef(chef); savePref('recipe_chef', chef); setCustomInput(""); }}
                    testID={`chef-chip-${chef.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Text style={[styles.chefChipText, selectedChef === chef && styles.chefChipTextActive]}>{chef}</Text>
                  </TouchableOpacity>
                ))}

                {wildcardChef && (
                  <TouchableOpacity 
                    accessibilityRole="button"
                    key="wildcard" 
                    style={[styles.chefChip, selectedChef === wildcardChef && styles.chefChipActive]} 
                    onPress={() => { setSelectedChef(wildcardChef); savePref('recipe_chef', wildcardChef); setCustomInput(""); }}
                    testID="wildcard-chef-chip"
                  >
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                      <MaterialCommunityIcons name="satellite-variant" size={13} color={selectedChef === wildcardChef ? "black" : "#fbbf24"} style={{marginRight: 6}} />
                      <Text style={[styles.chefChipText, selectedChef === wildcardChef && styles.chefChipTextActive]}>{wildcardChef}</Text>
                    </View>
                  </TouchableOpacity>
                )}
                
                {lastCustomChef && (
                  <TouchableOpacity 
                    accessibilityRole="button"
                    key="last-custom" 
                    style={[
                      styles.chefChip, 
                      selectedChef === lastCustomChef && styles.chefChipActive,
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
                      <Text style={[styles.chefChipText, selectedChef === lastCustomChef && styles.chefChipTextActive]}>{lastCustomChef}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{flexDirection: 'row', gap: 15, marginTop: 8, marginBottom: 4, paddingHorizontal: 4}}>
                 <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <MaterialCommunityIcons name="satellite-variant" size={10} color="#fbbf24" style={{marginRight: 4}} />
                    <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>WILDCARD CHEF</Text>
                 </View>
                 <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <MaterialCommunityIcons name="account-circle-outline" size={10} color="#94a3b8" style={{marginRight: 4}} />
                    <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>USER SUGGESTED</Text>
                 </View>
              </View>

              {selectedChef ? (
                <View style={{marginTop: 12, padding: 12, backgroundColor: '#0f172a', borderRadius: 8}}>
                  <Text style={{color: '#94a3b8', fontSize: 12, fontStyle: 'italic', lineHeight: 18}}>
                    {CHEF_PHILOSOPHIES[selectedChef] || 
                     (CHEFS_DATA[selectedChef as keyof typeof CHEFS_DATA] as any)?.philosophy || 
                     "User suggested chef - no character intel available"}
                  </Text>
                </View>
              ) : null}

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
                      const matches = Object.keys(CHEFS_DATA)
                        .filter(name => {
                          const isMatch = name.toLowerCase().startsWith(val.toLowerCase());
                          if (recipeMode === 'authentic') {
                            return isMatch && (CHEFS_DATA[name as keyof typeof CHEFS_DATA] as any).authentic === true;
                          }
                          return isMatch;
                        })
                        .sort((a, b) => a.length - b.length || a.localeCompare(b))
                        .slice(0, 3);
                      setSuggestedChefs(matches);
                    } else {
                      setSuggestedChefs([]);
                    }
                  }}
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
             <Text style={styles.sectionTitle}>MISSION DIRECTIVES <Text style={styles.sectionInlineSubtitle}>(custom rules)</Text></Text>
             <Text style={[styles.sectionSubtitle, {marginTop: -5, marginBottom: 10}]}>Additional constraints or requests (e.g. "under 30 mins", "spicy", "one pan").</Text>
             <TextInput 
               style={[styles.input, {minHeight: 45, height: 45, fontSize: 14}]} 
               placeholder='e.g. "Under 30 minutes", "Kid friendly"'
               placeholderTextColor="#475569"
               value={extraRequests}
               onChangeText={(val) => { setExtraRequests(val); savePref('recipe_extra', val); }}
               testID="extra-requests-input"
             />
          </View>
          </View>
        )}

        {/* ── TIER 1: CORE INGREDIENTS (collapsible) ── */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => toggleAccordion('core')}
          style={styles.protocolRibbon}
          testID="core-ribbon"
        >
          <View style={{flex: 1}}>
            <Text style={styles.protocolRibbonTitle}>CORE INGREDIENTS</Text>
            <Text style={styles.protocolRibbonSummary}>
              {expiringList.length === 0 ? (
                 <Text style={{color: '#ef4444', fontWeight: 'bold'}}>No expiring ingredients</Text>
              ) : (
                 `${expiringList.length - excludedExpiring.length} Must-Use`
              )}
              {preferred.split(',').filter(s => s.trim().length > 0).length > 0 
                ? `  ·  ${preferred.split(',').filter(s => s.trim().length > 0).length} Preferred` 
                : null}
            </Text>
          </View>
          <Animated.View style={{ transform: [{ rotate: coreAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Text style={styles.protocolChevron}>⌄</Text>
          </Animated.View>
        </TouchableOpacity>

        {activeAccordion === 'core' && (
          <View style={styles.protocolBody}>
          <View style={{marginTop: 16, marginBottom: 24}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                <Text style={[styles.sectionTitle, {marginBottom: 0, marginTop: 0}]}>MUST-USE INGREDIENTS <Text style={styles.sectionInlineSubtitle}>(expiring stock)</Text></Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                  <TouchableOpacity onPress={() => massActionExpiring(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => massActionExpiring(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                </View>
              </View>
            <Text style={styles.sectionSubtitle}>Tap to de-select any items you don't wish to use for this mission.</Text>
            {expiringList.length > 0 ? (
              <View style={styles.allergenGrid}>
                   {expiringList.map(item => (
                    <TouchableOpacity 
                      accessibilityRole="button"
                      key={item.name} 
                      style={[styles.allergenChip, !excludedExpiring.includes(item.name) && styles.stockChipActive, { flexDirection: 'row', alignItems: 'center' }]} 
                      onPress={() => toggleExpiring(item.name)}
                      testID={`stock-chip-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {item.cabinetType === 'freezer' && <MaterialCommunityIcons name="snowflake" size={12} color={!excludedExpiring.includes(item.name) ? "white" : "#64748b"} style={{ marginRight: 6 }} />}
                      <Text style={[styles.allergenChipText, !excludedExpiring.includes(item.name) && styles.allergenChipTextActive]}>{item.name}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            ) : (
              <Text style={styles.sectionSubtitle}>No stock items are due to expire soon.</Text>
            )}
            <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 12}}>
              <MaterialCommunityIcons name="snowflake" size={12} color="#38bdf8" />
              <Text style={{color: '#64748b', fontSize: 10, marginLeft: 6}}>Items marked with ❄️ are currently frozen.</Text>
            </View>

            {/* Custom Expiring Additions */}
            <View style={{marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#334155'}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap'}}>
                 <Text style={{color: '#94a3b8', fontSize: 10, fontWeight: 'bold'}}>FRIDGE ADD-ONS <Text style={styles.sectionInlineSubtitle}>(items going off)</Text></Text>
                 <View style={{flexDirection: 'row', gap: 10}}>
                   <TouchableOpacity onPress={() => massActionManualExp(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                   <TouchableOpacity onPress={() => massActionManualExp(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                 </View>
              </View>
              
              <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10}}>
                 {/* Show all history items + any unique session items */}
                 {Array.from(new Set([...historyExp, ...sessionCustomExp])).sort().map(item => {
                   const isActive = sessionCustomExp.includes(item);
                   return (
                     <TouchableOpacity 
                       key={item} 
                       style={[styles.allergenChip, isActive && styles.stockChipActive, {flexDirection: 'row', alignItems: 'center'}]} 
                       onPress={() => toggleManualExp(item)}
                     >
                        <Text style={[styles.allergenChipText, isActive && styles.allergenChipTextActive]}>{item}</Text>
                        
                        <TouchableOpacity 
                          onPress={() => purgeManualExp(item)}
                          style={{marginLeft: 8, padding: 2}}
                          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                        >
                          <MaterialCommunityIcons 
                            name="close-circle" 
                            size={14} 
                            color={isActive ? "rgba(255,255,255,0.6)" : "#64748b"} 
                          />
                        </TouchableOpacity>
                     </TouchableOpacity>
                   );
                 })}
              </View>

              <View style={{flexDirection: 'row', gap: 10}}>
                 <TextInput
                   style={[styles.input, {flex: 1, height: 44, minHeight: 44, paddingVertical: 8, fontSize: 14}]}
                   placeholder="Add fresh item (e.g. Avocado)"
                   placeholderTextColor="#475569"
                   value={customExpInput}
                   onChangeText={(val) => {
                      setCustomExpInput(val);
                      if (val.trim().length > 1) {
                         const matches = FRIDGE_INGREDIENTS
                           .filter(name => name.toLowerCase().startsWith(val.toLowerCase()))
                           .sort((a, b) => a.length - b.length || a.localeCompare(b))
                           .slice(0, 3);
                         setFridgeSuggestions(matches);
                      } else {
                         setFridgeSuggestions([]);
                      }
                   }}
                   onSubmitEditing={() => handleAddCustomExp(customExpInput)}
                 />
                 <TouchableOpacity style={{backgroundColor: '#334155', borderRadius: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}} onPress={() => handleAddCustomExp(customExpInput)}>
                    <MaterialCommunityIcons name="plus" size={24} color="#fbbf24" />
                 </TouchableOpacity>
              </View>

              <View style={{height: 24, justifyContent: 'center', marginTop: 4}}>
                   <View style={{flexDirection: 'row', gap: 6}}>
                     {fridgeSuggestions.map(item => (
                       <TouchableOpacity 
                         key={item}
                         onPress={() => handleAddCustomExp(item)}
                         style={{backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4}}
                       >
                         <Text style={{color: '#fbbf24', fontSize: 9, fontWeight: 'bold'}}>{item.toUpperCase()}</Text>
                       </TouchableOpacity>
                     ))}
                   </View>
              </View>
            </View>
          </View>

          <View style={{marginBottom: 24}}>
             <Text style={styles.sectionTitle}>PREFERRED INGREDIENTS <Text style={styles.sectionInlineSubtitle}>(favourites)</Text></Text>
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
          </View>
        )}

        {/* ── TIER 2: OPTIONAL INGREDIENTS (collapsible) ── */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => toggleAccordion('optional')}
          style={styles.protocolRibbon}
          testID="optional-ribbon"
        >
          <View style={{flex: 1}}>
            <Text style={styles.protocolRibbonTitle}>OPTIONAL INGREDIENTS</Text>
            <Text style={styles.protocolRibbonSummary}>
              {[
                selectedStaples.length > 0 ? `${selectedStaples.length} Fridge` : null,
                pantryList.length > 0 ? `${pantryList.length - excludedPantry.length} Pantry` : null,
                freezerList.length > 0 ? `${freezerList.length - excludedFreezer.length} Freezer` : null,
              ].filter(Boolean).join('  ·  ') || 'No optional items'}
            </Text>
          </View>
          <Animated.View style={{ transform: [{ rotate: optionalAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Text style={styles.protocolChevron}>⌄</Text>
          </Animated.View>
        </TouchableOpacity>

        {activeAccordion === 'optional' && (
          <View style={styles.protocolBody}>
          <View style={{marginTop: 16, marginBottom: 24}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                <Text style={[styles.sectionTitle, {marginBottom: 0, marginTop: 0}]} testID="fridge-staples-title">FRIDGE STAPLES <Text style={styles.sectionInlineSubtitle}>(select to include)</Text></Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                  <TouchableOpacity onPress={() => massActionStaples(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => massActionStaples(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>Select as many as you like or add your own.</Text>
              <View style={styles.allergenGrid}>
                {persistentStaples.sort().map(s => {
                  const isActive = selectedStaples.includes(s);
                  return (
                    <TouchableOpacity 
                      accessibilityRole="button"
                      key={s} 
                      style={[styles.allergenChip, isActive && styles.allergenChipActive, {flexDirection: 'row', alignItems: 'center'}]} 
                      onPress={() => toggleStaple(s)}
                      testID={`fridge-staple-chip-${s.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                       <Text style={[styles.allergenChipText, isActive && styles.allergenChipTextActive]}>{s}</Text>
                       <TouchableOpacity 
                          onPress={() => purgeStaple(s)}
                          style={{marginLeft: 8, padding: 2}}
                          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                        >
                          <MaterialCommunityIcons 
                            name="close-circle" 
                            size={14} 
                            color={isActive ? "rgba(255,255,255,0.6)" : "#64748b"} 
                          />
                        </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={{marginTop: 15}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <View style={{flex: 1}}>
                      <TextInput 
                        style={[styles.input, {minHeight: 44, height: 44, fontSize: 14}]} 
                        placeholder="Add custom staple (e.g. Garlic)"
                        placeholderTextColor="#475569"
                        value={staplesInput}
                        onChangeText={(val) => {
                          setStaplesInput(val);
                          if (val.trim().length > 1) {
                            const query = val.toLowerCase();
                            const matches = FRIDGE_INGREDIENTS
                              .filter(item => item.toLowerCase().includes(query))
                              .sort((a, b) => a.length - b.length || a.localeCompare(b))
                              .slice(0, 3);
                            setStapleSuggestions(matches);
                          } else {
                            setStapleSuggestions([]);
                          }
                        }}
                        onSubmitEditing={() => handleAddStaple(staplesInput)}
                        onBlur={handleStaplesBlur}
                        testID="fridge-staples-input"
                      />
                    </View>
                    <TouchableOpacity 
                      style={{backgroundColor: '#334155', borderRadius: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center'}} 
                      onPress={() => handleAddStaple(staplesInput)}
                    >
                       <MaterialCommunityIcons name="plus" size={24} color="white" />
                    </TouchableOpacity>
                  </View>
                  <View style={{height: 24, justifyContent: 'center'}}>
                    <View style={{flexDirection: 'row', gap: 6}}>
                      {stapleSuggestions.map(item => (
                        <TouchableOpacity 
                          key={item}
                          onPress={() => handleAddStaple(item)}
                          style={{backgroundColor: '#334155', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4}}
                        >
                          <Text style={{color: '#38bdf8', fontSize: 9, fontWeight: 'bold'}}>{item.toUpperCase()}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
              </View>
          </View>
          
          <View style={{marginBottom: 24}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                <Text style={[styles.sectionTitle, {marginBottom: 0, marginTop: 0}]}>PANTRY STOCK <Text style={styles.sectionInlineSubtitle}>(room temp)</Text></Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                  <TouchableOpacity onPress={() => massActionPantry(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => massActionPantry(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>Tap to include/exclude pantry items from the briefing.</Text>
              <View style={styles.allergenGrid}>
                {pantryList.length > 0 ? pantryList.sort().map(name => (
                  <TouchableOpacity 
                    key={name}
                    style={[styles.allergenChip, !excludedPantry.includes(name) && styles.stockChipActive]}
                    onPress={() => togglePantry(name)}
                  >
                     <Text style={[styles.allergenChipText, !excludedPantry.includes(name) && styles.allergenChipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={styles.sectionSubtitle}>No additional pantry stock available.</Text>
                )}
              </View>
          </View>

          <View style={{marginBottom: 24}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15, marginTop: 10}}>
                <Text style={[styles.sectionTitle, {marginBottom: 0, marginTop: 0}]}>FREEZER STOCK <Text style={styles.sectionInlineSubtitle}>(cold store)</Text></Text>
                <View style={{flexDirection: 'row', gap: 10}}>
                  <TouchableOpacity onPress={() => massActionFreezer(true)}><Text style={{color: '#3b82f6', fontSize: 10, fontWeight: 'bold'}}>INCLUDE ALL</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => massActionFreezer(false)}><Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold'}}>EXCLUDE ALL</Text></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.sectionSubtitle}>Tap to include/exclude freezer items from the briefing.</Text>
              <View style={styles.allergenGrid}>
                {freezerList.length > 0 ? freezerList.sort().map(name => (
                  <TouchableOpacity 
                    key={name}
                    style={[styles.allergenChip, !excludedFreezer.includes(name) && styles.stockChipActive, { flexDirection: 'row', alignItems: 'center' }]}
                    onPress={() => toggleFreezer(name)}
                  >
                     <MaterialCommunityIcons name="snowflake" size={12} color={!excludedFreezer.includes(name) ? "white" : "#64748b"} style={{ marginRight: 6 }} />
                     <Text style={[styles.allergenChipText, !excludedFreezer.includes(name) && styles.allergenChipTextActive]}>{name}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={styles.sectionSubtitle}>No additional freezer stock available.</Text>
                )}
              </View>
              <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 10}}>
                <MaterialCommunityIcons name="snowflake" size={12} color="#38bdf8" />
                <Text style={{color: '#64748b', fontSize: 10, marginLeft: 6}}>Frozen stores (fresh-frozen, raw or pre-prepared).</Text>
              </View>
          </View>
          </View>
        )}

        {/* ── TIER 3: STRICT PROTOCOLS (collapsible) ── */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => toggleAccordion('protocols')}
          style={styles.protocolRibbon}
          testID="protocols-ribbon"
        >
          <View style={{flex: 1}}>
            <Text style={styles.protocolRibbonTitle}>STRICT PROTOCOLS</Text>
            <Text style={styles.protocolRibbonSummary}>
              {[
                dietary !== "Don't Mind" ? dietary : null,
                selectedAllergens.length > 0 ? `${selectedAllergens.length} ${selectedAllergens.length === 1 ? 'Allergy' : 'Allergies'}` : null,
                avoid.split(',').filter(s => s.trim().length > 0).length > 0 ? `${avoid.split(',').filter(s => s.trim().length > 0).length} ${avoid.split(',').filter(s => s.trim().length > 0).length === 1 ? 'Dislike' : 'Dislikes'}` : null,
              ].filter(Boolean).join('  ·  ') || 'No constraints active'}
            </Text>
          </View>
          <Animated.View style={{ transform: [{ rotate: protocolsAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Text style={styles.protocolChevron}>⌄</Text>
          </Animated.View>
        </TouchableOpacity>

        {activeAccordion === 'protocols' && (
          <View style={styles.protocolBody}>

        <Text style={styles.sectionTitle}>DIETARY DOCTRINE <Text style={styles.sectionInlineSubtitle}>(base restrictions)</Text></Text>
        <View style={styles.prefGroup}>
          {DIETARY_CHOICES.map(c => (
            <TouchableOpacity 
              accessibilityRole="radio"
              key={c} 
              style={styles.radioRow} 
              onPress={() => { setDietary(c); savePref('dietary_pref', c); }}
              testID={`dietary-chip-${c.toLowerCase()}`}
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

        <Text style={styles.sectionTitle}>ALLERGEN PROTOCOL <Text style={styles.sectionInlineSubtitle}>(medical overrides)</Text></Text>
        <View style={styles.allergenGrid}>
          {ALLERGENS.map(a => (
            <TouchableOpacity 
              accessibilityRole="button"
              key={a} 
              style={[styles.allergenChip, selectedAllergens.includes(a) && styles.allergenChipActive]} 
              onPress={() => toggleAllergen(a)}
              testID={`allergen-chip-${a.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Text style={[styles.allergenChipText, selectedAllergens.includes(a) && styles.allergenChipTextActive]}>{a}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.inputGroup}>
           <Text style={[styles.sectionTitle, {color: '#ef4444'}]}>FORBIDDEN INGREDIENTS <Text style={[styles.sectionInlineSubtitle, {color: '#ef4444'}]}>(dislikes)</Text></Text>
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

          </View>
        )}
        {/* ── END STRICT PROTOCOLS ── */}

        {/* ── AI DEPLOYMENT STATIONS (collapsible) ── */}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => toggleAccordion('deploy')}
          style={styles.protocolRibbon}
          testID="deploy-ribbon"
        >
          <View style={{flex: 1}}>
            <Text style={styles.protocolRibbonTitle}>DEPLOYMENT STATIONS</Text>
            <Text style={styles.protocolRibbonSummary}>Configure AI command centers</Text>
          </View>
          <Animated.View style={{ transform: [{ rotate: deployAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}>
            <Text style={styles.protocolChevron}>⌄</Text>
          </Animated.View>
        </TouchableOpacity>

        {activeAccordion === 'deploy' && (
          <View style={styles.protocolBody}>
          <Text style={{color: '#94a3b8', fontSize: 11, marginBottom: 10, marginTop: 10}}>Configure three AI command centers for one-click briefing transmission.</Text>
          
          {deployStations && deployStations.map((s, idx) => (
              <View key={idx} style={{backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#38bdf8'}}>
                  <Text style={{color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 5}}>STATION {idx + 1}</Text>
                  <TextInput 
                    style={[styles.input, {marginBottom: 8, height: 35, fontSize: 12, minHeight: 40}]}
                    placeholder="Name (e.g. ChatGPT)"
                    placeholderTextColor="#475569"
                    value={s.name}
                    onChangeText={(val) => updateStation(idx, 'name', val)}
                  />
                  <TextInput 
                    style={[styles.input, {height: 35, fontSize: 10, color: '#94a3b8', minHeight: 40}]}
                    placeholder="URL (https://...)"
                    placeholderTextColor="#475569"
                    value={s.url}
                    onChangeText={(val) => updateStation(idx, 'url', val)}
                    autoCapitalize="none"
                  />
              </View>
          ))}
          </View>
        )}

        <View style={{height: 100}} /> 
      </KeyboardAwareScrollView>

      {renderStatus()}
    </View>
  );
}

const styles = StyleSheet.create({
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
  headerSubtitle: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  backBtn: { padding: 10, backgroundColor: '#334155', borderRadius: 24 },
  scrollContent: { padding: 20 },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { color: '#3b82f6', fontSize: 13, fontWeight: 'bold' },
  cardBody: { color: '#cbd5e1', fontSize: 14, lineHeight: 20 },
  chefChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#111827',
    borderRadius: 99,
    borderWidth: 1,
    borderColor: '#374151',
    margin: 4,
  },
  chefChipActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#60a5fa',
  },
  chefChipText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  chefChipTextActive: {
    color: '#ffffff',
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 2,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeTabActive: {
    backgroundColor: '#334155',
  },
  modeTabText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modeTabTextActive: {
    color: '#f8fafc',
  },
  sectionTitle: { color: '#fbbf24', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 15, marginTop: 10 },
  sectionInlineSubtitle: { color: '#94a3b8', fontSize: 11, fontWeight: 'normal', letterSpacing: 0, fontStyle: 'italic' },
  prefGroup: { backgroundColor: '#1e293b', borderRadius: 12, padding: 12, marginBottom: 24, borderWidth: 1, borderColor: '#334155' },
  radioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
  radioText: { color: '#94a3b8', fontSize: 16, marginLeft: 12 },
  inputGroup: { marginBottom: 20 },
  input: { backgroundColor: '#0f172a', borderRadius: 8, padding: 12, color: 'white', fontSize: 15, borderWidth: 1, borderColor: '#334155', minHeight: 80, textAlignVertical: 'top' },
  allergenGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 24, marginHorizontal: -4 },
  allergenChip: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, margin: 4 },
  allergenChipActive: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  stockChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  allergenChipText: { color: '#94a3b8', fontSize: 13 },
  allergenChipTextActive: { color: 'white' },
  sectionSubtitle: { color: '#94a3b8', fontSize: 12, marginTop: -10, marginBottom: 15 },
  footer: { padding: 20, backgroundColor: '#1e293b', borderBottomWidth: 1, borderBottomColor: '#334155' },
  generateBtn: { backgroundColor: '#fbbf24', borderRadius: 8, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  generateText: { color: '#0f172a', fontWeight: 'bold', fontSize: 16 },
  copyBtn: { backgroundColor: '#fbbf24', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  actionBtn: { backgroundColor: '#fbbf24', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  confirmBlock: { alignItems: 'center' },
  confirmText: { color: '#fbbf24', fontSize: 13, textAlign: 'center', marginBottom: 20, lineHeight: 18 },
  confirmActions: { flexDirection: 'row', gap: 10, width: '100%' },
  cancelBtnInline: { flex: 1, backgroundColor: '#334155', borderRadius: 8, padding: 16, alignItems: 'center' },
  confirmBtnInline: { flex: 1, backgroundColor: '#fbbf24', borderRadius: 8, padding: 16, alignItems: 'center' },
  cancelBtnText: { color: 'white', fontWeight: 'bold' },
  confirmBtnText: { color: '#0f172a', fontWeight: 'bold' },
  anchoredPanel: {
    backgroundColor: '#1e293b',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  statusBanner: { position: 'absolute', bottom: 100, left: 20, right: 20, backgroundColor: '#1e293b', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#fbbf24' },
  statusText: { color: '#fbbf24', fontWeight: 'bold', fontSize: 13, letterSpacing: 1, textAlign: 'center', width: '100%' },
  protocolRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
    marginTop: 8,
  },
  protocolRibbonTitle: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  protocolRibbonSummary: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  protocolChevron: {
    color: '#64748b',
    fontSize: 20,
    lineHeight: 22,
    marginLeft: 8,
  },
  protocolBody: {
    overflow: 'hidden',
  },
  fab: { position: 'absolute', bottom: 30, right: 20, backgroundColor: '#fbbf24', borderRadius: 30, paddingLeft: 18, paddingRight: 22, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  fabTextContainer: { marginLeft: 10, alignItems: 'flex-start' },
  fabText: { color: '#0f172a', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  fabSubText: { color: '#0f172a', fontWeight: 'bold', fontSize: 10, letterSpacing: 1.5, marginTop: -2 },
  fabConfirmBlock: { position: 'absolute', bottom: 30, left: 20, right: 20, backgroundColor: '#1e293b', padding: 20, borderRadius: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 10, borderWidth: 1, borderColor: '#334155' },
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
