/**
 * Onboarding — 3-step profile completion flow.
 *
 * Steps:
 *   1. Username  (existing logic, unchanged behaviour)
 *   2. Avatar    (Cloudinary upload via cloudinary.ts)
 *   3. Country   (searchable ISO list)
 *
 * For NEW users: all 3 steps are shown in order.
 * For RETURNING users (partial profile): the screen detects which fields
 *   are already saved and starts at the first missing field, skipping
 *   completed steps entirely.
 *
 * Each step saves to Supabase before advancing, so partial progress
 * survives app restarts. The user only lands on /home after all 3 fields
 * are confirmed in the database.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { pickImage, uploadImage, CloudinaryError } from '../lib/cloudinary';
import { COUNTRIES, type Country } from '../lib/countries';
import { GradientFill } from '../components/GradientFill';
import { colors, font, gradients, radius, shadow, space } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'loading' | 'username' | 'avatar' | 'country';

const MIN_LEN  = 3;
const MAX_LEN  = 20;
const VALID_RE = /^[a-z0-9_]+$/;
type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_ORDER: Step[] = ['username', 'avatar', 'country'];

function StepDots({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <View style={dotStyles.row} accessibilityLabel={`Step ${idx + 1} of 3`}>
      {STEP_ORDER.map((s, i) => (
        <View
          key={s}
          style={[dotStyles.dot, i === idx && dotStyles.dotActive, i < idx && dotStyles.dotDone]}
        />
      ))}
    </View>
  );
}
const dotStyles = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: space.xl },
  dot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hairline },
  dotActive:{ width: 22, backgroundColor: colors.cyan },
  dotDone:  { backgroundColor: colors.cyan + '60' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function Onboarding() {
  const router  = useRouter();
  const { session } = useSession();
  const [step, setStep] = useState<Step>('loading');

  // ── Step 1: Username state ─────────────────────────────────────────────────
  const [username,    setUsername]    = useState('');
  const [checkState,  setCheckState]  = useState<CheckState>('idle');
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [usernameErr,  setUsernameErr]  = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Step 2: Avatar state ───────────────────────────────────────────────────
  const [avatarUri,     setAvatarUri]     = useState<string | null>(null);
  const [avatarUrl,     setAvatarUrl]     = useState<string | null>(null);  // Cloudinary URL
  const [uploadState,   setUploadState]   = useState<'idle' | 'picking' | 'uploading' | 'done'>('idle');
  const [uploadErr,     setUploadErr]     = useState('');
  const [avatarBusy,    setAvatarBusy]    = useState(false);

  // ── Step 3: Country state ──────────────────────────────────────────────────
  const [country,      setCountry]      = useState<Country | null>(null);
  const [countryQuery, setCountryQuery] = useState('');
  const [countrySaving,setCountrySaving]= useState('');
  const [countryErr,   setCountryErr]   = useState('');

  // ── Determine starting step from existing profile ─────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    supabase
      .from('profiles')
      .select('username, avatar_url, country')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!data) { setStep('username'); return; }
        // All complete — nothing to do here
        if (data.username && data.avatar_url && data.country) {
          router.replace('/home');
          return;
        }
        // Populate already-saved data into state
        if (data.username)   setUsername(data.username);
        if (data.avatar_url) { setAvatarUrl(data.avatar_url); setAvatarUri(data.avatar_url); setUploadState('done'); }
        // Land on first missing step
        if (!data.username)   { setStep('username'); }
        else if (!data.avatar_url) { setStep('avatar'); }
        else { setStep('country'); }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  // ── USERNAME helpers ───────────────────────────────────────────────────────
  const handleUsernameChange = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    setUsername(trimmed);
    setUsernameErr('');
    if (trimmed.length < MIN_LEN) { setCheckState('idle'); return; }
    if (trimmed.length > MAX_LEN || !VALID_RE.test(trimmed)) { setCheckState('invalid'); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCheckState('checking');
    debounceRef.current = setTimeout(() => checkUsernameAvailability(trimmed), 600);
  };

  const checkUsernameAvailability = async (value: string) => {
    const { data, error } = await supabase
      .from('profiles').select('username').eq('username', value).maybeSingle();
    if (error) { setCheckState('idle'); setUsernameErr(`Could not check: ${error.message}`); return; }
    setCheckState(data ? 'taken' : 'available');
  };

  const saveUsername = async () => {
    if (checkState !== 'available' || !session?.user) return;
    setUsernameBusy(true);
    const { error } = await supabase.from('profiles').update({ username }).eq('id', session.user.id);
    setUsernameBusy(false);
    if (error) {
      if (error.code === '23505') setCheckState('taken');
      else setUsernameErr(error.message);
      return;
    }
    setStep('avatar');
  };

  // ── AVATAR helpers ─────────────────────────────────────────────────────────
  const handlePickAndUpload = async () => {
    setUploadErr('');
    try {
      setUploadState('picking');
      const uri = await pickImage();
      if (!uri) { setUploadState('idle'); return; }
      setAvatarUri(uri);
      setUploadState('uploading');
      const result = await uploadImage(uri);
      setAvatarUrl(result.secureUrl);
      setUploadState('done');
    } catch (e) {
      const msg = e instanceof CloudinaryError ? e.message : 'Upload failed. Please try again.';
      setUploadErr(msg);
      setUploadState('idle');
    }
  };

  const saveAvatar = async () => {
    if (!avatarUrl || !session?.user) return;
    setAvatarBusy(true);
    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', session.user.id);
    setAvatarBusy(false);
    if (error) { setUploadErr(error.message); return; }
    setStep('country');
  };

  // ── COUNTRY helpers ────────────────────────────────────────────────────────
  const filteredCountries = useMemo(() => {
    if (!countryQuery.trim()) return COUNTRIES;
    const q = countryQuery.toLowerCase();
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [countryQuery]);

  const saveCountry = async () => {
    if (!country || !session?.user) return;
    setCountrySaving('saving');
    setCountryErr('');
    const { error } = await supabase
      .from('profiles')
      .update({ country: country.code })
      .eq('id', session.user.id);
    if (error) { setCountryErr(error.message); setCountrySaving(''); return; }
    router.replace('/home');
  };

  // ── Render guards ─────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <View style={s.root}>
        <GradientFill colors={gradients.background} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.blue} />
        </View>
      </View>
    );
  }

  // ── Status pill config (username step) ────────────────────────────────────
  type PillCfg = { label: string; color: string; bg: string } | null;
  const pillMap: Record<CheckState, PillCfg> = {
    idle:      null,
    checking:  { label: 'Checking…',         color: colors.textMuted, bg: 'rgba(147,155,167,0.12)' },
    available: { label: '✓  Available',       color: colors.success,   bg: 'rgba(74,222,128,0.12)'  },
    taken:     { label: '✗  Already taken',   color: colors.danger,    bg: 'rgba(248,113,113,0.12)' },
    invalid:   { label: `Letters, numbers, _ · ${MIN_LEN}–${MAX_LEN} chars`, color: colors.warning, bg: 'rgba(251,191,36,0.12)' },
  };
  const pill = pillMap[checkState];

  const renderCountryItem = useCallback(({ item }: { item: Country }) => {
    const selected = country?.code === item.code;
    return (
      <Pressable
        style={({ pressed }) => [cs.item, selected && cs.itemSelected, pressed && cs.itemPressed]}
        onPress={() => setCountry(item)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Text style={cs.flag}>{item.flag}</Text>
        <Text style={[cs.name, selected && cs.nameSelected]}>{item.name}</Text>
        {selected && <FontAwesome name="check" size={14} color={colors.cyan} />}
      </Pressable>
    );
  }, [country]);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={s.safe}>

        {/* ── Step dots ───────────────────────────────────────────────────── */}
        <StepDots current={step} />

        {/* ── STEP 1: Username ─────────────────────────────────────────────── */}
        {step === 'username' && (
          <Animated.View entering={FadeInRight.springify().damping(16)} style={s.stepWrap}>
            <View style={s.headingRow}>
              <View style={s.accentBar} />
              <View style={s.headingText}>
                <Text style={s.h1}>Pick your</Text>
                <Text style={[s.h1, s.cyan]}>name.</Text>
                <Text style={s.sub}>How other players see you.{'\n'}Choose wisely — it's permanent.</Text>
              </View>
            </View>

            <View style={s.inputSection}>
              <View style={[s.inputCard, checkState === 'available' && s.cardGreen, checkState === 'taken' && s.cardRed]}>
                <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
                <View style={s.inputRow}>
                  <Text style={s.atSign}>@</Text>
                  <TextInput
                    style={s.input}
                    placeholder="your_username"
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={MAX_LEN}
                    value={username}
                    onChangeText={handleUsernameChange}
                    accessibilityLabel="Username input"
                  />
                  {checkState === 'checking' && <ActivityIndicator size="small" color={colors.textMuted} style={{ marginRight: space.sm }} />}
                </View>
              </View>

              {pill && (
                <View style={[s.pill, { backgroundColor: pill.bg }]}>
                  <Text style={[s.pillText, { color: pill.color }]}>{pill.label}</Text>
                </View>
              )}
              {usernameErr ? <Text style={s.errorText}>{usernameErr}</Text> : null}

              <Pressable
                style={({ pressed }) => [s.cta, checkState !== 'available' && s.ctaDisabled, pressed && checkState === 'available' && s.ctaPressed]}
                onPress={saveUsername}
                disabled={checkState !== 'available' || usernameBusy}
                accessibilityLabel="Continue to avatar step"
              >
                <View style={s.ctaInner}>
                  {checkState === 'available' && <GradientFill colors={gradients.button} />}
                  {usernameBusy
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={[s.ctaText, checkState !== 'available' && s.ctaDim]}>Continue →</Text>
                  }
                </View>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* ── STEP 2: Avatar ───────────────────────────────────────────────── */}
        {step === 'avatar' && (
          <Animated.View entering={FadeInRight.springify().damping(16)} style={s.stepWrap}>
            <View style={s.headingRow}>
              <View style={s.accentBar} />
              <View style={s.headingText}>
                <Text style={s.h1}>Add your</Text>
                <Text style={[s.h1, s.cyan]}>photo.</Text>
                <Text style={s.sub}>A face to match the name.</Text>
              </View>
            </View>

            <View style={s.avatarSection}>
              {/* Avatar preview */}
              <Pressable
                style={({ pressed }) => [s.avatarRing, pressed && { opacity: 0.8 }]}
                onPress={handlePickAndUpload}
                disabled={uploadState === 'uploading' || uploadState === 'picking'}
                accessibilityLabel="Choose a profile photo"
                accessibilityRole="button"
              >
                {avatarUri && uploadState === 'done' ? (
                  <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                ) : (
                  <View style={s.avatarPlaceholder}>
                    {uploadState === 'uploading' || uploadState === 'picking'
                      ? <ActivityIndicator size="large" color={colors.blue} />
                      : <FontAwesome name="camera" size={32} color={colors.textMuted} />
                    }
                  </View>
                )}
                {/* Overlay badge */}
                {uploadState !== 'uploading' && uploadState !== 'picking' && (
                  <View style={s.cameraBadge}>
                    <FontAwesome name="camera" size={11} color={colors.white} />
                  </View>
                )}
              </Pressable>

              <Text style={s.avatarHint}>
                {uploadState === 'done'   ? 'Looking great! Tap to change.' :
                 uploadState === 'picking'  ? 'Opening library…' :
                 uploadState === 'uploading'? 'Uploading…' :
                 'Tap to choose a photo'}
              </Text>

              {uploadErr ? (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{uploadErr}</Text>
                  <Pressable onPress={handlePickAndUpload} style={s.retryBtn}>
                    <Text style={s.retryText}>Retry</Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                style={({ pressed }) => [s.cta, uploadState !== 'done' && s.ctaDisabled, pressed && uploadState === 'done' && s.ctaPressed]}
                onPress={saveAvatar}
                disabled={uploadState !== 'done' || avatarBusy}
                accessibilityLabel="Continue to country step"
              >
                <View style={s.ctaInner}>
                  {uploadState === 'done' && <GradientFill colors={gradients.button} />}
                  {avatarBusy
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={[s.ctaText, uploadState !== 'done' && s.ctaDim]}>Continue →</Text>
                  }
                </View>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {/* ── STEP 3: Country ──────────────────────────────────────────────── */}
        {step === 'country' && (
          <Animated.View entering={FadeInRight.springify().damping(16)} style={[s.stepWrap, { flex: 1 }]}>
            <View style={s.headingRow}>
              <View style={s.accentBar} />
              <View style={s.headingText}>
                <Text style={s.h1}>Where are</Text>
                <Text style={[s.h1, s.cyan]}>you from?</Text>
              </View>
            </View>

            {/* Search */}
            <View style={s.searchCard}>
              <FontAwesome name="search" size={14} color={colors.textFaint} style={{ marginRight: space.xs }} />
              <TextInput
                style={s.searchInput}
                placeholder="Search countries…"
                placeholderTextColor={colors.textFaint}
                value={countryQuery}
                onChangeText={setCountryQuery}
                autoCorrect={false}
                accessibilityLabel="Search for your country"
              />
              {countryQuery.length > 0 && (
                <Pressable onPress={() => setCountryQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <FontAwesome name="times-circle" size={15} color={colors.textFaint} />
                </Pressable>
              )}
            </View>

            {/* List */}
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={renderCountryItem}
              style={cs.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={s.center}>
                  <Text style={s.sub}>No countries found for "{countryQuery}"</Text>
                </View>
              }
            />

            {countryErr ? <Text style={[s.errorText, { marginTop: space.sm }]}>{countryErr}</Text> : null}

            <Pressable
              style={({ pressed }) => [s.cta, !country && s.ctaDisabled, pressed && !!country && s.ctaPressed]}
              onPress={saveCountry}
              disabled={!country || countrySaving === 'saving'}
              accessibilityLabel="Finish onboarding"
            >
              <View style={s.ctaInner}>
                {country && <GradientFill colors={gradients.button} />}
                {countrySaving === 'saving'
                  ? <ActivityIndicator color={colors.white} />
                  : <Text style={[s.ctaText, !country && s.ctaDim]}>
                      {country ? `Let's go → (${country.flag} ${country.name})` : 'Select a country'}
                    </Text>
                }
              </View>
            </Pressable>
          </Animated.View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.bg },
  safe:    { flex: 1, paddingHorizontal: space.lg, paddingBottom: space.lg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stepWrap:{ gap: space.xl },

  headingRow:  { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  accentBar:   { width: 5, height: 88, borderRadius: radius.pill, backgroundColor: colors.cyan, marginTop: 4 },
  headingText: { flex: 1, gap: space.xs },
  h1:    { fontFamily: font.extrabold, fontSize: 28, color: colors.text },
  cyan:  { color: colors.cyan, marginTop: -8 },
  sub:   { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, lineHeight: 21, marginTop: space.sm },

  inputSection: { gap: space.md },
  inputCard: {
    borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.hairline, overflow: 'hidden', ...shadow.card,
  },
  cardGreen: { borderColor: colors.success },
  cardRed:   { borderColor: colors.danger },
  inputRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md },
  atSign:    { fontFamily: font.extrabold, fontSize: 20, color: colors.textFaint, marginRight: space.xs },
  input:     { flex: 1, fontFamily: font.semibold, fontSize: 18, color: colors.text, paddingVertical: space.lg },

  pill:     { alignSelf: 'flex-start', paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
  pillText: { fontFamily: font.bold, fontSize: 13 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)', borderRadius: radius.sm, padding: space.md, gap: space.sm, alignItems: 'center' },
  errorText:{ fontFamily: font.semibold, fontSize: 14, color: colors.danger, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.surface, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline },
  retryText:{ fontFamily: font.bold, fontSize: 13, color: colors.blue },

  // Avatar step
  avatarSection: { alignItems: 'center', gap: space.lg },
  avatarRing: {
    width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: colors.cyan,
    overflow: 'hidden', ...shadow.blueGlow,
  },
  avatarImg:         { width: 140, height: 140 },
  avatarPlaceholder: { width: 140, height: 140, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: {
    position: 'absolute', bottom: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  avatarHint: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted, textAlign: 'center' },

  // Country search
  searchCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.hairline, ...shadow.card,
  },
  searchInput: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },

  // CTA
  cta:      { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled:{ opacity: 0.35, shadowOpacity: 0, elevation: 0 },
  ctaPressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
  ctaInner: { paddingVertical: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  ctaText:  { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  ctaDim:   { color: colors.textMuted },
});

const cs = StyleSheet.create({
  list: { flex: 1, marginTop: space.sm },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: 13, paddingHorizontal: space.sm,
    borderBottomWidth: 1, borderBottomColor: colors.hairline,
  },
  itemSelected: { backgroundColor: `${colors.cyan}14` },
  itemPressed:  { backgroundColor: colors.surfaceAlt },
  flag:         { fontSize: 22 },
  name:         { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },
  nameSelected: { fontFamily: font.bold, color: colors.cyan },
});
