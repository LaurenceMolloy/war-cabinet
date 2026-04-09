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
  isPremium: boolean;
  isSergeanOrAbove: boolean;
  isGeneralOrAbove: boolean;
  isTrialActive: boolean;
  hasFullAccess: boolean; // true during trial OR any paid tier — lifts all limits
  daysRemaining: number;
  trialLabel: string;
  currentTier: TierType | 'FREE';
}

const BillingContext = createContext<BillingContextType | undefined>(undefined);

const TRIAL_DURATION_DAYS = 7;
const SECURE_KEY_FIRST_LAUNCH = 'war_cabinet_recon_start';
const SECURE_KEY_WELCOME_SEEN = 'war_cabinet_welcome_seen';

// Which tier each feature requires
export const FEATURE_TIER: Record<string, 'SERGEANT' | 'GENERAL'> = {
  LOGISTICS:      'SERGEANT',
  BACKUPS:        'GENERAL',
  CABINET_LIMIT:  'SERGEANT',
  CATEGORY_LIMIT: 'SERGEANT',
  ITEM_LIMIT:     'SERGEANT',
  FREEZER:        'SERGEANT',
  RECIPES:        'GENERAL',
  ALERTS:         'GENERAL',
};

// Feature lock descriptions
const FEATURE_COPY: Record<string, { title: string; desc: string; tier: 'SERGEANT' | 'GENERAL' }> = {
  LOGISTICS:      { title: 'The Quartermaster',       desc: 'Low-stock reports & shareable shopping lists.',                          tier: 'SERGEANT' },
  BACKUPS:        { title: 'Tactical Backups',         desc: 'Automated snapshots & disaster recovery.',                              tier: 'SERGEANT' },
  CABINET_LIMIT:  { title: 'Multiple Cabinets',        desc: 'Unlimited storage locations.',                                          tier: 'SERGEANT' },
  CATEGORY_LIMIT: { title: 'More Categories',          desc: 'Unlimited item categories.',                                            tier: 'SERGEANT' },
  ITEM_LIMIT:     { title: 'More Items',               desc: 'Unlimited tracked item types.',                                         tier: 'SERGEANT' },
  FREEZER:        { title: 'Freezer Cabinet Mode',     desc: 'Track how long items have been frozen instead of expiry dates.',        tier: 'SERGEANT' },
  RECIPES:        { title: 'The Mess Hall',            desc: 'Waste-conscious AI recipe suggestions from what you have.',             tier: 'GENERAL'  },
  ALERTS:         { title: 'Stock & Expiry Alerts',    desc: 'Monthly push notifications for low stock and upcoming expiry dates.',   tier: 'GENERAL'  },
};

const TIER_PRICE: Record<'SERGEANT' | 'GENERAL', string> = {
  SERGEANT: '£2.99',
  GENERAL:  '£4.99',
};

const TIER_NAME: Record<'SERGEANT' | 'GENERAL', string> = {
  SERGEANT: 'Sergeant',
  GENERAL:  'General',
};

// Checks whether a given licence tier satisfies a feature's requirement
const tierSatisfies = (userTier: TierType | 'FREE', required: 'SERGEANT' | 'GENERAL'): boolean => {
  if (userTier === 'TRIAL') return true;
  if (userTier === 'GENERAL') return true;
  if (userTier === 'SERGEANT' && required === 'SERGEANT') return true;
  return false;
};

export const BillingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const db = useSQLiteContext();
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFocusTier, setPaywallFocusTier] = useState<'SERGEANT' | 'GENERAL'>('SERGEANT');
  const [showWelcome, setShowWelcome] = useState(false);
  const [showFeatureLock, setShowFeatureLock] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<string>('');
  const [daysRemaining, setDaysRemaining] = useState(0);
  const [trialLabel, setTrialLabel] = useState('');

  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    entitlements: {
      active: { isActive: false, type: 'FREE', expirationDate: null }
    }
  });

  const refreshEntitlements = async () => {
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
    // TEST MODE: force start date so trial expires ~24h15m from 2026-04-08T23:07:05Z
    const FORCED_START = '2026-04-02T23:22:05Z';
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

    if (remaining > 0) {
      setCustomerInfo({
        entitlements: {
          active: { isActive: true, type: 'TRIAL', expirationDate: expDate.toISOString() }
        }
      });
    } else {
      setCustomerInfo({
        entitlements: {
          active: { isActive: false, type: 'FREE', expirationDate: null }
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
  const isTrialActive = currentTier === 'TRIAL' && customerInfo.entitlements.active.isActive;
  const isGeneralOrAbove = currentTier === 'GENERAL' || isTrialActive;
  const isSergeanOrAbove = isGeneralOrAbove || currentTier === 'SERGEANT';
  const isPremium = currentTier === 'GENERAL' || currentTier === 'SERGEANT';
  const hasFullAccess = isSergeanOrAbove; // trial OR any paid tier lifts limits

  const checkEntitlement = (featureName: string): boolean => {
    const required = FEATURE_TIER[featureName] ?? 'SERGEANT';
    if (tierSatisfies(currentTier, required)) return true;
    setLockedFeature(featureName);
    setShowFeatureLock(true);
    return false;
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
      isPremium,
      isSergeanOrAbove,
      isGeneralOrAbove,
      isTrialActive,
      hasFullAccess,
      daysRemaining,
      trialLabel,
      currentTier,
    }}>
      {children}

      {/* ─── WELCOME MODAL (first install only) ─── */}
      <Modal visible={showWelcome} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.welcomeCard}>
            <MaterialCommunityIcons name="shield-check" size={48} color="#22c55e" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.welcomeTitle}>Welcome to War Cabinet</Text>
            <Text style={styles.welcomeSub}>
              Everything is unlocked for your first{' '}
              <Text style={{ color: '#f8fafc', fontWeight: 'bold' }}>7 days</Text>
              {' '}— no card required. Explore at your own pace.
            </Text>

            {/* ── Private (Free) ── */}
            <View style={styles.welcomeDivider} />
            <View style={styles.tierHeader}>
              <MaterialCommunityIcons name="dog-side" size={14} color="#94a3b8" />
              <Text style={styles.tierLabel}>PRIVATE — FREE</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
              <Text style={styles.welcomeRowText}>Stock tracking — unlimited batches & expiry dates</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#22c55e" />
              <Text style={styles.welcomeRowText}>1 cabinet · 6 categories · 20 item types</Text>
            </View>

            {/* ── Sergeant (£2.99) ── */}
            <View style={styles.welcomeDivider} />
            <View style={styles.tierHeader}>
              <MaterialCommunityIcons name="chevron-triple-up" size={14} color="#60a5fa" />
              <Text style={[styles.tierLabel, { color: '#60a5fa' }]}>SERGEANT — £2.99 ONE-TIME</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="star-circle" size={16} color="#60a5fa" />
              <Text style={styles.welcomeRowText}>Unlimited cabinets, categories & items</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="snowflake" size={16} color="#60a5fa" />
              <Text style={styles.welcomeRowText}>Freezer cabinet mode — track age, not expiry</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="star-circle" size={16} color="#60a5fa" />
              <Text style={styles.welcomeRowText}>The Quartermaster — low-stock reports & sharing</Text>
            </View>

            {/* ── General (£4.99) ── */}
            <View style={styles.welcomeDivider} />
            <View style={styles.tierHeader}>
              <MaterialCommunityIcons name="star-four-points" size={14} color="#fbbf24" />
              <Text style={[styles.tierLabel, { color: '#fbbf24' }]}>GENERAL — £4.99 ONE-TIME</Text>
            </View>
            <Text style={styles.tierInheritNote}>Everything in Sergeant, plus:</Text>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="star-circle" size={16} color="#fbbf24" />
              <Text style={styles.welcomeRowText}>Automated backups & disaster recovery</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="star-circle" size={16} color="#fbbf24" />
              <Text style={styles.welcomeRowText}>Low stock & expiry alerts</Text>
            </View>
            <View style={styles.welcomeRow}>
              <MaterialCommunityIcons name="star-circle" size={16} color="#fbbf24" />
              <Text style={styles.welcomeRowText}>The Mess Hall — AI-powered recipe suggestions</Text>
            </View>

            <View style={styles.welcomeDivider} />

            <TouchableOpacity style={styles.welcomeBtn} onPress={dismissWelcome}>
              <Text style={styles.welcomeBtnText}>LET'S GO  →</Text>
            </TouchableOpacity>
            <Text style={styles.welcomeFooter}>You can upgrade any time from the settings screen.</Text>
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
              </Text> rank — a one-time licence.
            </Text>
            <TouchableOpacity
              style={[styles.lockUpgradeBtn, lockTier === 'GENERAL' && styles.lockUpgradeBtnGeneral]}
              onPress={() => { setShowFeatureLock(false); setPaywallFocusTier(lockTier); setShowPaywall(true); }}
            >
              <Text style={styles.lockUpgradeBtnText}>
                UPGRADE TO {TIER_NAME[lockTier].toUpperCase()} — {TIER_PRICE[lockTier]} one-time
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.lockDismissBtn} onPress={() => setShowFeatureLock(false)}>
              <Text style={styles.lockDismissText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── FULL PAYWALL (proactive upgrade) ─── */}
      <Modal visible={showPaywall} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.paywallCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <MaterialCommunityIcons name="crown" size={40} color="#fbbf24" />
                <Text style={styles.title}>CHOOSE YOUR RANK</Text>
                {isTrialActive ? (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>TRIAL ACTIVE — {trialLabel} remaining</Text>
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
                    <MaterialCommunityIcons name="truck-delivery" size={18} color="#60a5fa" />
                    <Text style={styles.benefitSub}>The Quartermaster — low-stock reports & sharing</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.buyBtnSergeant} onPress={() => handleSimulatedPurchase('SERGEANT')}>
                  <Text style={styles.buyBtnText}>ENLIST AS SERGEANT — £2.99</Text>
                </TouchableOpacity>
              </View>

              {/* ── General Tier ── */}
              <View style={[styles.tierCard, styles.tierCardGeneral, paywallFocusTier === 'GENERAL' && styles.tierCardFocused]}>
                <View style={styles.tierCardHeader}>
                  <MaterialCommunityIcons name="star-four-points" size={20} color="#fbbf24" />
                  <Text style={[styles.tierCardTitle, { color: '#fbbf24' }]}>GENERAL</Text>
                  <Text style={styles.tierCardPrice}>£4.99</Text>
                </View>
                <Text style={styles.tierCardSub}>One-time licence · No subscription</Text>
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
                    <MaterialCommunityIcons name="chef-hat" size={18} color="#fbbf24" />
                    <Text style={styles.benefitSub}>The Mess Hall — AI-powered recipe suggestions</Text>
                  </View>

                </View>
                <TouchableOpacity style={styles.buyBtnGeneral} onPress={() => handleSimulatedPurchase('GENERAL')}>
                  <Text style={styles.buyBtnText}>COMMISSION AS GENERAL — £4.99</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setShowPaywall(false)}>
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
