import React, { createContext, useContext, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions, Platform, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { useSQLiteContext } from 'expo-sqlite';

/**
 * REVENUECAT STUB ARCHITECTURE
 * We use similar terminology to RC to make future migration a 'drop-in' swap.
 *
 * TIERS:
 *   Private  — Free (always)
 *   Sergeant — £2.99 one-time (unlimited inventory + Quartermaster + Backups)
 *   General  — £4.99 one-time (+ Alerts + Mess Hall) — includes all Sergeant features
 */

export type TierType = 'PRIVATE' | 'SERGEANT' | 'GENERAL' | 'TRIAL';

interface EntitlementInfo {
  isActive: boolean;
  type: TierType | 'FREE';
  expirationDate: string | null;
}

interface CustomerInfo {
  entitlements: {
    active: EntitlementInfo;
  };
}

interface BillingContextType {
  customerInfo: CustomerInfo;
  checkEntitlement: (featureName: string) => boolean;
  requestPurchase: (tier?: 'SERGEANT' | 'GENERAL') => void;
  graduateEarly: () => Promise<void>;
  isPremium: boolean;
  isSergeanOrAbove: boolean;
  isGeneralOrAbove: boolean;
  isTrialActive: boolean; // internally maps to isCadet
  isCadet: boolean;
  isPrivate: boolean;
  hasFullAccess: boolean; // lifts all scale limits (SERGEANT/GENERAL only)
  daysRemaining: number;
  trialLabel: string;
  currentTier: TierType | 'FREE';
  limits: {
    cabinets: number;
    items: number;
    freezer_cabs: number;
    freezer_cats: number;
  };
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

const TRIAL_DURATION_DAYS = 7;
const SECURE_KEY_FIRST_LAUNCH = 'war_cabinet_recon_start';
const SECURE_KEY_WELCOME_SEEN = 'war_cabinet_welcome_seen';
const SECURE_KEY_GRADUATED_EARLY = 'war_cabinet_graduated_early';

export const RANK_LIMITS = {
  CADET:   { cabinets: 2, items: 12, categories: 4, freezer_cabs: 1, freezer_items: 3 },
  PRIVATE: { cabinets: 4, items: 24, categories: 8, freezer_cabs: 0, freezer_items: 0 },
  ELITE:   { cabinets: 999, items: 999, categories: 999, freezer_cabs: 999, freezer_items: 999 }
};

// Which tier each feature requires
export const FEATURE_TIER: Record<string, 'SERGEANT' | 'GENERAL'> = {
  LOGISTICS:      'SERGEANT',
  BACKUPS:        'GENERAL',
  CABINET_LIMIT:  'SERGEANT',
  CATEGORY_LIMIT: 'SERGEANT',
  ITEM_LIMIT:     'SERGEANT',
  FREEZER_CABINET_LIMIT: 'SERGEANT',
  FREEZER:        'SERGEANT',
  FREEZER_LIMIT:  'SERGEANT',
  RECIPES:        'GENERAL',
  ALERTS:         'GENERAL',
  OPEN_CONSUMPTION: 'SERGEANT',
  SILO_ISOLATION:   'SERGEANT',
  VANGUARD_INTEGRITY: 'SERGEANT',
  ERROR_DETECTION:  'SERGEANT',
  CABINET_AUDIT:    'GENERAL',
  STOCK_ROTATION:   'SERGEANT',
  ROTATION_ALERTS:  'GENERAL',
};

// Feature lock descriptions
const FEATURE_COPY: Record<string, { title: string; desc: string; tier: 'SERGEANT' | 'GENERAL' }> = {
  LOGISTICS:      { title: 'The Quartermaster',       desc: 'Low-stock reports & shareable shopping lists.',                          tier: 'SERGEANT' },
  BACKUPS:        { title: 'Tactical Backups',         desc: 'Automated snapshots & disaster recovery.',                              tier: 'GENERAL'  },
  CABINET_LIMIT:  { title: 'Multiple Cabinets',        desc: 'Unlimited storage locations.',                                          tier: 'SERGEANT' },
  CATEGORY_LIMIT: { title: 'More Categories',          desc: 'Unlimited item categories.',                                            tier: 'SERGEANT' },
  ITEM_LIMIT:     { title: 'More Items',               desc: 'Unlimited tracked item types.',                                         tier: 'SERGEANT' },
  FREEZER_CABINET_LIMIT: { title: 'Freezer Capacity', desc: 'Unlimited freezer cabinets for deep storage.',                           tier: 'SERGEANT' },
  FREEZER:        { title: 'Freezer Cabinet Mode',     desc: 'Track how long items have been frozen instead of expiry dates.',        tier: 'SERGEANT' },
  FREEZER_LIMIT:  { title: 'Freezer Logistics',        desc: 'Unlimited freezer item specifications & storage.',                      tier: 'SERGEANT' },
  RECIPES:        { title: 'The Mess Hall',            desc: 'Waste-conscious AI recipe suggestions from what you have.',             tier: 'GENERAL'  },
  ALERTS:         { title: 'Stock & Expiry Alerts',    desc: 'Monthly push notifications for low stock and upcoming expiry dates.',   tier: 'GENERAL'  },
  OPEN_CONSUMPTION: { title: 'Open Item Intelligence', desc: 'Track partial usage & split batches for precise logistics.',            tier: 'SERGEANT' },
  SILO_ISOLATION:   { title: 'Strategic Silo Isolation',desc: 'Lock recipe generation to specific cabinets or categories.',            tier: 'SERGEANT' },
  VANGUARD_INTEGRITY: { title: 'Vanguard Integrity',    desc: 'Automated active-silence checks for inventory drift.',                  tier: 'SERGEANT' },
  ERROR_DETECTION:  { title: 'Smart Error Detection',   desc: 'Fuzzy-logic validation for entry errors and near-misses.',               tier: 'SERGEANT' },
  CABINET_AUDIT:    { title: 'Cabinet Audit Mode',      desc: 'High-speed physical inventory reconciliation flow.',                    tier: 'GENERAL'  },
  STOCK_ROTATION:   { title: 'Tactical Stock Rotation', desc: 'Manage periodic stock movement cycles for deep storage zones.',         tier: 'SERGEANT' },
  ROTATION_ALERTS:  { title: 'Rotation Reminders',      desc: 'Monthly alerts for cabinets overdue for a logistical rotation sweep.',  tier: 'GENERAL'  },
};

const TIER_PRICE: Record<'SERGEANT' | 'GENERAL', string> = {
  SERGEANT: '£2.99',
  GENERAL:  '£1.49/mo',
};

const TIER_PRICE_ANNUAL: Record<'SERGEANT' | 'GENERAL', string | null> = {
  SERGEANT: null,
  GENERAL:  '£9.99/yr',
};

const TIER_NAME: Record<'SERGEANT' | 'GENERAL', string> = {
  SERGEANT: 'Sergeant',
  GENERAL:  'General',
};

// Checks whether a given licence tier satisfies a feature's requirement
const tierSatisfies = (userTier: TierType | 'FREE', required: 'SERGEANT' | 'GENERAL'): boolean => {
  if (userTier === 'GENERAL' || userTier === 'TRIAL') return true;
  if (userTier === 'SERGEANT' && required === 'SERGEANT') return true;
  return false;
};

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const db = useSQLiteContext();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFocusTier, setPaywallFocusTier] = useState<'SERGEANT' | 'GENERAL'>('SERGEANT');
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomePage, setWelcomePage] = useState(0);
  const [showFeatureLock, setShowFeatureLock] = useState(false);
  const [showGradConfirm, setShowGradConfirm] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<string>('');
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [trialLabel, setTrialLabel] = useState('');

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    entitlements: {
      active: { isActive: false, type: 'FREE', expirationDate: null }
    }
  });

  const refreshEntitlements = async () => {
    // E2E TEST HOOK: If a test has injected __E2E_LICENCE__ via addInitScript,
    // short-circuit the DB lookup and apply that tier directly.
    // This follows the same pattern as __E2E_SKIP_SEEDS__ in sqlite.ts.
    // Valid values: 'GENERAL' | 'SERGEANT' | 'TRIAL' | 'PRIVATE'
    if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).__E2E_LICENCE__) {
      const tier = (window as any).__E2E_LICENCE__ as TierType;
      setCustomerInfo({ entitlements: { active: { isActive: true, type: tier, expirationDate: null } } });
      return;
    }

    // 1. Check for Hard Licences (most privileged first)
    const generalRes = await db.getFirstAsync<{ value: string }>('SELECT value FROM Settings WHERE key = ?', 'license_key_general');
    if (generalRes?.value) {
      setCustomerInfo({ entitlements: { active: { isActive: true, type: 'GENERAL', expirationDate: null } } });
      return;
    }
    const sergeantRes = await db.getFirstAsync<{ value: string }>('SELECT value FROM Settings WHERE key = ?', 'license_key_sergeant');
    if (sergeantRes?.value) {
      setCustomerInfo({ entitlements: { active: { isActive: true, type: 'SERGEANT', expirationDate: null } } });
      return;
    }

    // Legacy: single-tier purchase from before the split (treat as GENERAL)
    const legacyRes = await db.getFirstAsync<{ value: string }>('SELECT value FROM Settings WHERE key = ?', 'license_key');
    if (legacyRes?.value) {
      setCustomerInfo({ entitlements: { active: { isActive: true, type: 'GENERAL', expirationDate: null } } });
      return;
    }

    // 2. Check for Recon Period (Trial)
    // TEST MODE: April 9th start means trial is active today (Apr 10)
    const FORCED_START = '2026-04-09T23:22:05Z';
    if (Platform.OS === 'web') {
      localStorage.setItem(SECURE_KEY_FIRST_LAUNCH, FORCED_START);
    } else {
      await SecureStore.setItemAsync(SECURE_KEY_FIRST_LAUNCH, FORCED_START);
    }
    const firstLaunch = FORCED_START;

    const startDate = new Date(firstLaunch);
    const expDate = new Date(startDate);
    expDate.setDate(expDate.getDate() + TRIAL_DURATION_DAYS);

    const now = new Date();
    const msRemaining = expDate.getTime() - now.getTime();
    const remaining = Math.max(0, msRemaining);

    // Compute human label: days if >= 24h, else hours (rounded up)
    let label = '';
    if (remaining > 0) {
      const hoursRemaining = msRemaining / (1000 * 60 * 60);
      if (hoursRemaining >= 24) {
        const daysLeft = Math.ceil(hoursRemaining / 24);
        label = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
        setDaysRemaining(daysLeft);
      } else {
        const hoursLeft = Math.ceil(hoursRemaining);
        label = `${hoursLeft} ${hoursLeft === 1 ? 'hour' : 'hours'}`;
        setDaysRemaining(0);
      }
    } else {
      setDaysRemaining(0);
    }
    setTrialLabel(label);

    const isEarly = Platform.OS === 'web' 
        ? localStorage.getItem(SECURE_KEY_GRADUATED_EARLY) === '1'
        : (await SecureStore.getItemAsync(SECURE_KEY_GRADUATED_EARLY)) === '1';

    if (remaining > 0 && !isEarly) {
      setCustomerInfo({
        entitlements: {
          active: { isActive: true, type: 'TRIAL', expirationDate: expDate.toISOString() }
        }
      });
    } else {
      setCustomerInfo({
        entitlements: {
          active: { isActive: true, type: 'PRIVATE', expirationDate: null }
        }
      });
    }

    // 3. Show welcome modal on first install (not seen before)
    const seen = Platform.OS === 'web'
      ? localStorage.getItem(SECURE_KEY_WELCOME_SEEN)
      : await SecureStore.getItemAsync(SECURE_KEY_WELCOME_SEEN);
    if (!seen) {
      setShowWelcome(true);
    }
  };

  const dismissWelcome = async () => {
    if (Platform.OS === 'web') {
      localStorage.setItem(SECURE_KEY_WELCOME_SEEN, '1');
    } else {
      await SecureStore.setItemAsync(SECURE_KEY_WELCOME_SEEN, '1');
    }
    setShowWelcome(false);
  };

  useEffect(() => {
    refreshEntitlements();
  }, [db]);

  const currentTier = customerInfo.entitlements.active.type;
  const isCadet = currentTier === 'TRIAL';
  const isPrivate = currentTier === 'PRIVATE';
  
  const isPremium = currentTier === 'GENERAL' || currentTier === 'SERGEANT';
  const isSergeant = currentTier === 'SERGEANT';
  const isGeneral = currentTier === 'GENERAL';
  const isGeneralOrAbove = currentTier === 'GENERAL' || isCadet;
  const isSergeanOrAbove = isPremium || isCadet;
  
  const hasFullAccess = isPremium; // ONLY paid tiers lift scale limits now

  const limits = isPremium 
    ? RANK_LIMITS.ELITE 
    : (isCadet ? RANK_LIMITS.CADET : RANK_LIMITS.PRIVATE);

  const checkEntitlement = (featureName: string): boolean => {
    // Special Case: Intelligence trial for Cadets (AI, Alerts, Backups)
    // Scale limits (CABINET_LIMIT, etc.) are NOT lifted in Trial anymore
    const isIntelFeature = ['RECIPES', 'ALERTS', 'BACKUPS'].includes(featureName);
    if (isIntelFeature && isCadet) return true;

    // Special Case: Freezer Teaser (allow access to feature, specific counts handled in components)
    if (featureName === 'FREEZER' && (isCadet || isPrivate)) return true;

    // 2. Check for Rank Hierarchy
    const required = FEATURE_TIER[featureName];
    if (!required) return true;
    if (tierSatisfies(currentTier, required)) return true;
    setLockedFeature(featureName);
    setShowFeatureLock(true);
    return false;
  };

  const graduateEarly = async () => {
    setShowGradConfirm(true);
  };

  const performGraduation = async () => {
    if (Platform.OS === 'web') {
      localStorage.setItem(SECURE_KEY_GRADUATED_EARLY, '1');
    } else {
      await SecureStore.setItemAsync(SECURE_KEY_GRADUATED_EARLY, '1');
    }
    setShowGradConfirm(false);
    await refreshEntitlements();
  };

  const handleSimulatedPurchase = async (tier: 'SERGEANT' | 'GENERAL') => {
    setTimeout(async () => {
      const deviceId = Device.osBuildId || 'manual_id';
      const key = tier === 'GENERAL' ? 'license_key_general' : 'license_key_sergeant';
      await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', key, `${tier}_MOCK_${deviceId}`);
      await refreshEntitlements();
      setShowPaywall(false);
      setShowFeatureLock(false);
    }, 1500);
  };

  const featureCopy = FEATURE_COPY[lockedFeature] ?? { title: 'Premium Feature', desc: 'Upgrade to unlock this capability.', tier: 'SERGEANT' as const };
  const lockTier = featureCopy.tier;

  return (
    <BillingContext.Provider value={{
      customerInfo,
      checkEntitlement,
      requestPurchase: (tier = 'SERGEANT') => { setPaywallFocusTier(tier); setShowPaywall(true); },
      graduateEarly,
      isPremium,
      isSergeant,
      isGeneral,
      isSergeanOrAbove,
      isGeneralOrAbove,
      isTrialActive: isCadet,
      isCadet,
  isPrivate,
      hasFullAccess,
      daysRemaining,
      trialLabel,
      currentTier,
      limits,
    }}>
      {children}

      {/* ─── WELCOME MODAL — 3-page paginated onboarding ─── */}
      <Modal visible={showWelcome} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.welcomeCard}>

            {/* PAGE INDICATOR DOTS */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
              {[0, 1, 2, 3].map(i => (
                <View key={i} style={[{
                  height: 6, borderRadius: 3,
                  width: i === welcomePage ? 20 : 6,
                  backgroundColor: i === welcomePage ? '#22c55e' : '#334155'
                }]} />
              ))}
            </View>

            {/* ── PAGE 0: Your 7-Day Trial ── */}
            {welcomePage === 0 && (<>
              <MaterialCommunityIcons name="shield-check" size={40} color="#22c55e" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.welcomeTitle}>Welcome, Cadet</Text>
              <Text style={styles.welcomeSub}>
                Prepare for the <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>7-day tactical evaluation</Text> of your new 
                <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}> Swiss Army Knife</Text> for home logistics.
              </Text>
              <View style={styles.welcomeDivider} />
              <View style={styles.tierHeader}>
                <Text style={[styles.tierLabel, { color: '#fbbf24' }]}>RANK: CADET — TRAINING PHASE</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
                <Text style={styles.welcomeRowText}>AI recipe suggestions via The Mess Hall</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
                <Text style={styles.welcomeRowText}>Low-stock &amp; expiry alerts</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
                <Text style={styles.welcomeRowText}>Freezer cabinet mode (1 cabinet · 3 item types trial)</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#fbbf24" />
                <Text style={styles.welcomeRowText}>Scale limited: {RANK_LIMITS.CADET.cabinets} cabinets · {RANK_LIMITS.CADET.categories} categories · {RANK_LIMITS.CADET.items} items</Text>
              </View>
            </>)}

            {/* ── PAGE 1: After the Trial ── */}
            {welcomePage === 1 && (<>
              <Text style={styles.welcomeTitle}>After the Trial</Text>
              <Text style={styles.welcomeSub}>Your path forward — free or funded.</Text>
              <View style={styles.welcomeDivider} />
              <View style={styles.tierHeader}>
                <Text style={styles.tierLabel}>RANK: PRIVATE — EARNED PROMOTION</Text>
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic', marginBottom: 8, marginTop: -4 }}>Rock-solid basic logistics for a steady household.</Text>
              <Text style={styles.tierInheritNote}>Trial completion expands your system capacity:</Text>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="check-circle" size={16} color="#94a3b8" />
                <Text style={styles.welcomeRowText}>{RANK_LIMITS.PRIVATE.cabinets} cabinets · {RANK_LIMITS.PRIVATE.categories} categories · {RANK_LIMITS.PRIVATE.items} items</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#475569" />
                <Text style={styles.welcomeRowText}>AI recipes &amp; alerts not available at Private rank</Text>
              </View>
              <View style={styles.welcomeDivider} />
              <View style={styles.tierHeader}>
                <Text style={[styles.tierLabel, { color: '#60a5fa' }]}>SERGEANT — £2.99 ONE-TIME</Text>
              </View>
              <Text style={{ color: '#60a5fa', fontSize: 11, fontStyle: 'italic', marginBottom: 8, marginTop: -4 }}>Full operational system unlock. No limits, no subscriptions.</Text>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="infinity" size={16} color="#60a5fa" />
                <Text style={styles.welcomeRowText}>Unlimited cabinets, categories &amp; item types</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="snowflake" size={16} color="#60a5fa" />
                <Text style={styles.welcomeRowText}>Full freezer logistics — age-based tracking</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="cached" size={16} color="#60a5fa" />
                <Text style={styles.welcomeRowText}>Stock Rotation — periodic movement cycles</Text>
              </View>
              <View style={styles.welcomeDivider} />
              <View style={styles.tierHeader}>
                <Text style={[styles.tierLabel, { color: '#fbbf24' }]}>GENERAL — £1.49/MONTH OR £9.99/YEAR</Text>
              </View>
              <Text style={{ color: '#fbbf24', fontSize: 11, fontStyle: 'italic', marginBottom: 8, marginTop: -4 }}>High-Command intelligence layer. AI-powered resilience.</Text>
              <Text style={styles.tierInheritNote}>Everything in Sergeant, plus:</Text>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="bell-ring" size={16} color="#fbbf24" />
                <Text style={styles.welcomeRowText}>Automated rotation & expiry alerts</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="chef-hat" size={16} color="#fbbf24" />
                <Text style={styles.welcomeRowText}>The Mess Hall — waste-conscious AI recipes</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="file-sync" size={16} color="#fbbf24" />
                <Text style={styles.welcomeRowText}>Automated backups &amp; disaster recovery</Text>
              </View>
            </>)}

            {/* ── PAGE 2: Begin Deployment ── */}
            {welcomePage === 2 && (<>
              <MaterialCommunityIcons name="rocket-launch" size={40} color="#22c55e" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.welcomeTitle}>Ready for Deployment</Text>
              <Text style={styles.welcomeSub}>
                You have 7 days of full clearance to master every tool in this tactical Swiss Army Knife. Good luck.
              </Text>
              <View style={styles.welcomeDivider} />
              {/* ── Paragraph 1: Private ── */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: '#f8fafc', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, textAlign: 'left', marginBottom: 2 }}>RESERVE PIPELINE</Text>
                <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'left', lineHeight: 17 }}>
                  After 7 days, you will be automatically promoted to the <Text style={{ color: '#94a3b8', fontWeight: 'bold' }}>Private</Text> rank. 
                  You can also self-promote early (FREE) for an immediate capacity uplift.
                </Text>
              </View>

              {/* ── Paragraph 2: Sergeant/General ── */}
              <View style={{ marginBottom: 16 }}>
                <Text style={{ color: '#f8fafc', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, textAlign: 'left', marginBottom: 2 }}>PROMOTIONS</Text>
                <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'left', lineHeight: 17 }}>
                  Commission <Text style={{ color: '#60a5fa', fontWeight: 'bold' }}>Sergeant</Text> (One-time fee) for operational scale. 
                  Attain <Text style={{ color: '#fbbf24', fontWeight: 'bold' }}>General</Text> (Subscription) for full security clearance, adding automation and AI intelligence.
                </Text>
              </View>

              {/* ── Paragraph 3: Promotion Centre ── */}
              <View style={{ marginBottom: 20 }}>
                <Text style={{ color: '#f8fafc', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, textAlign: 'left', marginBottom: 2 }}>SERVICE RECORDS</Text>
                <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'left', lineHeight: 17 }}>
                  Manage your service records and adjust your rank at any time in the <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>Promotion Centre</Text>.
                </Text>
              </View>
            </>)}

            {/* ── PAGE 3: Message from the Developer (Allied Intel) ── */}
            {welcomePage === 3 && (<>
              <MaterialCommunityIcons name="shield-account" size={40} color="#6366f1" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={styles.welcomeTitle}>A Word from the Dev</Text>
              <Text style={styles.welcomeSub}>
                Personal thanks for downloading the app!
              </Text>
              <View style={styles.welcomeDivider} />
              <Text style={{ color: '#cbd5e1', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 }}>
                High Command wishes you luck with your deployment. 
                {"\n\n"}
                P.S. If you like the tactical precision here, you might also find <Text style={{ color: '#818cf8', fontWeight: 'bold' }}>Reestit</Text> useful—it's a sister service from my tactical lab that provides pithy AI summaries of holiday rental reviews.
              </Text>
              
              <TouchableOpacity testID="welcome-dismiss-btn" style={[styles.welcomeBtn, { marginBottom: 12 }]} onPress={dismissWelcome}>
                <Text style={styles.welcomeBtnText}>BEGIN MISSION  →</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => {  import('react-native').then(rn => rn.Linking.openURL('https://reestit.com')); }}>
                <Text style={{ color: '#6366f1', textAlign: 'center', fontSize: 12, fontWeight: 'bold' }}>VISIT REESTIT.COM</Text>
              </TouchableOpacity>
            </>)}

            {/* BACK / NEXT NAV */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
              {welcomePage > 0 ? (
                <TouchableOpacity testID="welcome-back-btn" onPress={() => setWelcomePage(p => p - 1)}>
                  <Text style={{ color: '#64748b', fontWeight: 'bold', fontSize: 13 }}>← BACK</Text>
                </TouchableOpacity>
              ) : <View />}
              {welcomePage < 3 ? (
                <TouchableOpacity testID="welcome-next-btn" onPress={() => setWelcomePage(p => p + 1)} style={{ marginLeft: 'auto' }}>
                  <Text style={{ color: '#22c55e', fontWeight: 'bold', fontSize: 13 }}>NEXT →</Text>
                </TouchableOpacity>
              ) : <View />}
            </View>

          </View>
        </View>
      </Modal>

      {/* ─── LIGHTWEIGHT FEATURE LOCK PROMPT ─── */}
      <Modal visible={showFeatureLock} transparent animationType="slide">
        <TouchableOpacity style={styles.lockOverlay} activeOpacity={1} onPress={() => setShowFeatureLock(false)}>
          <View style={styles.lockSheet}>
            <View style={styles.lockHandle} />
            <View style={styles.lockIconRow}>
              <MaterialCommunityIcons name="lock" size={22} color={lockTier === 'GENERAL' ? '#fbbf24' : '#60a5fa'} />
              <Text style={styles.lockTitle}>{featureCopy.title}</Text>
            </View>
            <Text style={styles.lockDesc}>{featureCopy.desc}</Text>
            <Text style={styles.lockHint}>
              Requires the <Text style={{ fontWeight: 'bold', color: lockTier === 'GENERAL' ? '#fbbf24' : '#60a5fa' }}>
                {TIER_NAME[lockTier]}
              </Text> rank —{lockTier === 'GENERAL' ? ' £1.49/mo or £9.99/yr' : ' a one-time £2.99 licence'}.
            </Text>
            <TouchableOpacity
              testID="feature-lock-upgrade-btn"
              style={[styles.lockUpgradeBtn, lockTier === 'GENERAL' && styles.lockUpgradeBtnGeneral]}
              onPress={() => { setShowFeatureLock(false); setPaywallFocusTier(lockTier); setShowPaywall(true); }}
            >
              <Text style={styles.lockUpgradeBtnText}>
                {lockTier === 'GENERAL'
                  ? `UPGRADE TO GENERAL — ${TIER_PRICE[lockTier]} or ${TIER_PRICE_ANNUAL[lockTier]}`
                  : `UPGRADE TO SERGEANT — ${TIER_PRICE[lockTier]} one-time`
                }
              </Text>
            </TouchableOpacity>
            <TouchableOpacity testID="feature-lock-dismiss-btn" style={styles.lockDismissBtn} onPress={() => setShowFeatureLock(false)}>
              <Text style={styles.lockDismissText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── TACTICAL GRADUATION CONFIRMATION ─── */}
      <Modal visible={showGradConfirm} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.welcomeCard, { borderLeftWidth: 4, borderLeftColor: '#fbbf24' }]}>
            <MaterialCommunityIcons name="medal" size={48} color="#fbbf24" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.welcomeTitle}>Commission Private Rank?</Text>
            <Text style={styles.welcomeSub}>
              Ending your Cadet training early will immediately expand your tactical capacity, but results in a permanent loss of High-Command support.
            </Text>

            <View style={[styles.welcomeDivider, { backgroundColor: '#334155' }]} />
            
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 }}>FORFEITED IMMEDIATELY:</Text>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#ef4444" />
                <Text style={styles.welcomeRowText}>The Mess Hall (AI Recipe Intelligence)</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="close-circle" size={16} color="#ef4444" />
                <Text style={styles.welcomeRowText}>Tactical Expiry & Stock Alerts</Text>
              </View>
            </View>

            <View style={{ marginBottom: 20 }}>
              <Text style={{ color: '#22c55e', fontSize: 10, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 }}>GAINED PERMANENTLY:</Text>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="arrow-up-bold-circle" size={16} color="#22c55e" />
                <Text style={styles.welcomeRowText}>Double Capacity (24 Item Types)</Text>
              </View>
              <View style={styles.welcomeRow}>
                <MaterialCommunityIcons name="arrow-up-bold-circle" size={16} color="#22c55e" />
                <Text style={styles.welcomeRowText}>Expanded Fleet Access (6 Cabinets)</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.welcomeBtn, { backgroundColor: '#fbbf24' }]} onPress={performGraduation}>
              <Text style={[styles.welcomeBtnText, { color: '#000' }]}>CONFIRM EARLY GRADUATION</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={{ alignSelf: 'center', marginTop: 16 }} onPress={() => setShowGradConfirm(false)}>
              <Text style={{ color: '#64748b', fontWeight: 'bold' }}>ABORT — CONTINUE TRAINING</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── FULL PAYWALL (proactive upgrade) ─── */}
      <Modal visible={showPaywall} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.paywallCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <MaterialCommunityIcons name="crown" size={40} color="#fbbf24" />
                <Text style={styles.title}>CHOOSE YOUR RANK</Text>
                {isCadet ? (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>CADET EVALUATION ACTIVE — {trialLabel} remaining</Text>
                  </View>
                ) : (
                  <Text style={styles.subtitle}>Your trial has expired. Re-establish command now.</Text>
                )}
              </View>

              {/* ── Sergeant Tier ── */}
              <View style={[styles.tierCard, paywallFocusTier === 'SERGEANT' && styles.tierCardFocused]}>
                <View style={styles.tierCardHeader}>
                  <MaterialCommunityIcons name="chevron-triple-up" size={20} color="#60a5fa" />
                  <Text style={[styles.tierCardTitle, { color: '#60a5fa' }]}>SERGEANT</Text>
                  <Text style={styles.tierCardPrice}>£2.99</Text>
                </View>
                <Text style={styles.tierCardSub}>One-time licence · No subscription</Text>
                <View style={styles.tierCardBenefits}>
                  <View style={styles.benefitRow}>
                    <MaterialCommunityIcons name="infinity" size={18} color="#60a5fa" />
                    <Text style={styles.benefitSub}>Unlimited cabinets, categories & item types</Text>
                  </View>
                  <View style={styles.benefitRow}>
                    <MaterialCommunityIcons name="snowflake" size={18} color="#60a5fa" />
                    <Text style={styles.benefitSub}>Freezer cabinet mode — age-based tracking</Text>
                  </View>
                  <View style={styles.benefitRow}>
                    <MaterialCommunityIcons name="cached" size={18} color="#60a5fa" />
                    <Text style={styles.benefitSub}>Tactical Stock Rotation — audit secondary storage</Text>
                  </View>
                </View>
                <TouchableOpacity testID="paywall-buy-sergeant-btn" style={styles.buyBtnSergeant} onPress={() => handleSimulatedPurchase('SERGEANT')}>
                  <Text style={styles.buyBtnText}>ENLIST AS SERGEANT — £2.99</Text>
                </TouchableOpacity>
              </View>

              {/* ── General Tier ── */}
              <View style={[styles.tierCard, styles.tierCardGeneral, paywallFocusTier === 'GENERAL' && styles.tierCardFocused]}>
                <View style={styles.tierCardHeader}>
                  <MaterialCommunityIcons name="star-four-points" size={20} color="#fbbf24" />
                  <Text style={[styles.tierCardTitle, { color: '#fbbf24' }]}>GENERAL</Text>
                  <Text style={styles.tierCardPrice}>£1.49<Text style={{ fontSize: 12, color: '#94a3b8' }}>/mo</Text></Text>
                </View>
                <Text style={styles.tierCardSub}>£9.99 / year · Cancel any time</Text>
                <Text style={styles.tierInheritNote}>Everything in Sergeant, plus:</Text>
                <View style={styles.tierCardBenefits}>
                  <View style={styles.benefitRow}>
                    <MaterialCommunityIcons name="file-sync" size={18} color="#fbbf24" />
                    <Text style={styles.benefitSub}>Automated backups & disaster recovery</Text>
                  </View>
                  <View style={styles.benefitRow}>
                    <MaterialCommunityIcons name="bell-ring" size={18} color="#fbbf24" />
                    <Text style={styles.benefitSub}>Low stock & expiry alerts</Text>
                  </View>
                  <View style={styles.benefitRow}>
                    <MaterialCommunityIcons name="bell-ring" size={18} color="#fbbf24" />
                    <Text style={styles.benefitSub}>Automated rotation & expiry alerts</Text>
                  </View>

                </View>
                <TouchableOpacity testID="paywall-buy-general-btn" style={styles.buyBtnGeneral} onPress={() => handleSimulatedPurchase('GENERAL')}>
                  <Text style={styles.buyBtnText}>COMMISSION AS GENERAL — £1.49/mo</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity testID="paywall-close-btn" style={styles.closeBtn} onPress={() => setShowPaywall(false)}>
                <Text style={styles.closeBtnText}>Return to base</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </BillingContext.Provider>
  );
};

export const useBilling = () => {
  const context = useContext(BillingContext);
  if (!context) throw new Error('useBilling must be used within BillingProvider');
  return context;
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },

  // Welcome modal
  welcomeCard: { backgroundColor: '#1e293b', width: width * 0.92, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#334155' },
  welcomeTitle: { color: '#f8fafc', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  welcomeSub: { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 4 },
  welcomeDivider: { height: 1, backgroundColor: '#334155', marginVertical: 14 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  tierLabel: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.2 },
  welcomeRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7, gap: 10 },
  welcomeRowText: { color: '#cbd5e1', fontSize: 13, flex: 1, lineHeight: 18 },
  welcomeBtn: { backgroundColor: '#22c55e', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  welcomeBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16, letterSpacing: 1 },
  welcomeFooter: { color: '#475569', fontSize: 11, textAlign: 'center', marginTop: 12 },
  tierInheritNote: { color: '#64748b', fontSize: 11, fontStyle: 'italic', marginBottom: 8, marginTop: 2 },

  // Feature lock bottom-sheet
  lockOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  lockSheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: '#334155' },
  lockHandle: { width: 40, height: 4, backgroundColor: '#334155', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  lockIconRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  lockTitle: { color: '#f8fafc', fontSize: 18, fontWeight: 'bold' },
  lockDesc: { color: '#94a3b8', fontSize: 14, marginBottom: 6 },
  lockHint: { color: '#475569', fontSize: 12, marginBottom: 20 },
  lockUpgradeBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  lockUpgradeBtnGeneral: { backgroundColor: '#d97706' },
  lockUpgradeBtnText: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  lockDismissBtn: { padding: 12, alignItems: 'center' },
  lockDismissText: { color: '#64748b', fontWeight: 'bold', fontSize: 13 },

  // Full paywall
  paywallCard: { backgroundColor: '#1e293b', width: width * 0.9, borderRadius: 20, padding: 24, maxHeight: '90%', borderWidth: 1, borderColor: '#334155' },
  header: { alignItems: 'center', marginBottom: 20 },
  title: { color: '#fbbf24', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginTop: 12 },
  subtitle: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 4 },
  trialBadge: { backgroundColor: '#3b82f6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, marginTop: 8 },
  trialBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },

  // Tier cards in paywall
  tierCard: { backgroundColor: '#0f172a', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#334155' },
  tierCardGeneral: { borderColor: '#44403c' },
  tierCardFocused: { borderWidth: 2, borderColor: '#3b82f6' },
  tierCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  tierCardTitle: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  tierCardPrice: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold' },
  tierCardSub: { color: '#475569', fontSize: 11, marginBottom: 12 },
  tierCardBenefits: { gap: 8, marginBottom: 14 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitSub: { color: '#94a3b8', fontSize: 13, flex: 1 },

  buyBtnSergeant: { backgroundColor: '#2563eb', padding: 14, borderRadius: 12, alignItems: 'center' },
  buyBtnGeneral:  { backgroundColor: '#d97706', padding: 14, borderRadius: 12, alignItems: 'center' },
  buyBtnText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  closeBtn: { padding: 16, alignItems: 'center' },
  closeBtnText: { color: '#64748b', fontWeight: 'bold', fontSize: 13 },
});
