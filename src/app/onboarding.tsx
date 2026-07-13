import { useState, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
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
import { supabase } from '../lib/supabase';
import { useSession } from '../lib/useSession';
import { getDeviceLocation, LocationCaptureError } from '../lib/location';
import { GradientFill } from '../components/GradientFill';
import { RolloverReveal } from '../components/RolloverReveal';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../theme';

const MIN_LEN = 3;
const MAX_LEN = 20;
const VALID_RE = /^[a-z0-9_]+$/;

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
type Step = 'username' | 'location';
type LocStatus = 'idle' | 'detecting' | 'detected' | 'manual';

export default function Onboarding() {
  const router = useRouter();
  const { session } = useSession();

  const [username, setUsername] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [step, setStep] = useState<Step>('username');
  const [locStatus, setLocStatus] = useState<LocStatus>('idle');
  const [locError, setLocError] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    setUsername(trimmed);
    setErrorMsg('');
    if (trimmed.length < MIN_LEN) { setCheckState('idle'); return; }
    if (trimmed.length > MAX_LEN || !VALID_RE.test(trimmed)) { setCheckState('invalid'); return; }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setCheckState('checking');
    debounceTimer.current = setTimeout(() => checkAvailability(trimmed), 600);
  };

  const checkAvailability = async (value: string) => {
    const { data, error } = await supabase
      .from('profiles').select('username').eq('username', value).maybeSingle();
    if (error) {
      // Surface the error so the user isn't left staring at a disabled button
      setCheckState('idle');
      setErrorMsg(`Could not check username: ${error.message}`);
      return;
    }
    setErrorMsg('');
    setCheckState(data ? 'taken' : 'available');
  };

  // Seed a username suggestion from the provider (Google/Apple) name — or the
  // email local-part as a fallback — sanitised to the [a-z0-9_] rules. It stays
  // fully editable; the user can keep it or type their own. Runs once on load.
  useEffect(() => {
    if (!session?.user) return;
    const meta = session.user.user_metadata as { full_name?: string; name?: string } | undefined;
    const source = meta?.full_name || meta?.name || session.user.email?.split('@')[0] || '';
    const candidate = source.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX_LEN);
    if (candidate.length >= MIN_LEN) {
      setUsername(candidate);
      setCheckState('checking');
      checkAvailability(candidate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const handleConfirm = () => {
    if (checkState !== 'available' || !session?.user) return;
    setErrorMsg('');
    setStep('location');
  };

  const useMyLocation = async () => {
    setLocStatus('detecting');
    setLocError('');
    try {
      const loc = await getDeviceLocation();
      // Save silently and go straight to the photo step — no review screen.
      await finishOnboarding({
        address: loc.address,
        city: loc.city,
        region: loc.region,
        country: loc.country,
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
    } catch (e) {
      setLocStatus('manual');
      const reason = e instanceof LocationCaptureError ? e.reason : 'unknown';
      setLocError(
        reason === 'permission-denied'
          ? 'Location access was denied — enter your city and country below.'
          : reason === 'timeout'
          ? 'Location request timed out — enter it manually below.'
          : reason === 'unavailable'
          ? 'Location unavailable — check your signal or enter it manually below.'
          : "Couldn't detect your location — enter it manually below."
      );
    }
  };

  // Editing a detected value by hand means the field no longer matches the
  // captured coords, so drop them rather than upload a mismatched pin.
  const editAddress = (v: string) => { setAddress(v); setCoords(null); };
  const editCity = (v: string) => { setCity(v); setCoords(null); };
  const editRegion = (v: string) => { setRegion(v); setCoords(null); };
  const editCountry = (v: string) => { setCountry(v); setCoords(null); };

  const finishOnboarding = async (loc: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  }) => {
    if (!session?.user) return;
    setSaving(true);
    setErrorMsg('');
    const { error } = await supabase
      .from('profiles')
      .update({ username })
      .eq('id', session.user.id);
    if (error) {
      setSaving(false);
      if (error.code === '23505') {
        setCheckState('taken');
        setStep('username');
      } else {
        setErrorMsg(error.message);
      }
      return;
    }
    // Location/address lives in its own self-only table (profile_location),
    // not on profiles — that table is readable by every authenticated user.
    const { error: locWriteError } = await supabase
      .from('profile_location')
      .upsert({ user_id: session.user.id, ...loc });
    setSaving(false);
    if (locWriteError) {
      setErrorMsg(locWriteError.message);
      return;
    }
    // Username + location saved — send them to the profile-photo step.
    router.replace('/onboarding-photo');
  };

  const confirmLocation = () => finishOnboarding({
    address: address.trim() || null,
    city: city.trim() || null,
    region: region.trim() || null,
    country: country.trim() || null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  });

  const skipLocation = () => finishOnboarding({
    address: null, city: null, region: null, country: null, latitude: null, longitude: null,
  });

  const manualComplete = address.trim().length > 0 && country.trim().length > 0;
  const locationCtaEnabled = !saving && locStatus === 'manual' && manualComplete;

  // Status pill config
  type StatusConfig = { label: string; color: string; bg: string } | null;
  const statusConfig: Record<CheckState, StatusConfig> = {
    idle: null,
    checking: { label: 'Checking…', color: colors.textMuted, bg: 'rgba(147,155,167,0.12)' },
    available: { label: '✓  Available', color: colors.success, bg: 'rgba(74,222,128,0.12)' },
    taken: { label: '✗  Already taken', color: colors.danger, bg: 'rgba(248,113,113,0.12)' },
    invalid: { label: `Letters, numbers, _ · ${MIN_LEN}–${MAX_LEN} chars`, color: colors.warning, bg: 'rgba(251,191,36,0.12)' },
  };
  const statusPill = statusConfig[checkState];
  const ctaEnabled = checkState === 'available' && !saving;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientFill colors={gradients.background} />

      <SafeAreaView style={styles.safe}>

        {step === 'username' ? (
          <>
            {/* ── Heading with cyan accent bar ────────── */}
            <RolloverReveal delay={80} duration={750}>
              <View style={styles.headingRow}>
                <View style={styles.accentBar} />
                <View style={styles.headingText}>
                  <Text style={themeText.h1}>Pick your</Text>
                  <Text style={[themeText.h1, styles.headingCyan]}>name.</Text>
                  <Text style={styles.subtitle}>
                    This is how other players see you.{'\n'}Choose wisely — it's permanent.
                  </Text>
                </View>
              </View>
            </RolloverReveal>

            {/* ── Input card ──────────────────────────── */}
            <RolloverReveal delay={260} duration={750} style={styles.inputSection}>

              {/* Floating input card */}
              <View style={[
                styles.inputCard,
                checkState === 'available' && styles.inputCardGreen,
                checkState === 'taken' && styles.inputCardRed,
              ]}>
                <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
                <View style={styles.inputRow}>
                  <Text style={styles.atSign}>@</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="your_username"
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={MAX_LEN}
                    value={username}
                    onChangeText={handleChange}
                  />
                  {checkState === 'checking' && (
                    <ActivityIndicator size="small" color={colors.textMuted} style={styles.spinner} />
                  )}
                </View>
              </View>

              {/* Status pill */}
              {statusPill && (
                <View style={[styles.statusPill, { backgroundColor: statusPill.bg }]}>
                  <Text style={[styles.statusText, { color: statusPill.color }]}>
                    {statusPill.label}
                  </Text>
                </View>
              )}

              {/* Supabase error */}
              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* CTA */}
              <Pressable
                style={({ pressed }) => [
                  styles.cta,
                  !ctaEnabled && styles.ctaDisabled,
                  pressed && ctaEnabled && styles.pressed,
                ]}
                onPress={handleConfirm}
                disabled={!ctaEnabled}
              >
                <View style={styles.ctaInner}>
                  {ctaEnabled && <GradientFill colors={gradients.button} />}
                  {saving
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={[styles.ctaText, !ctaEnabled && styles.ctaTextDim]}>
                        Let's go →
                      </Text>
                  }
                </View>
              </Pressable>

            </RolloverReveal>
          </>
        ) : (
          <>
            {/* ── Location heading ─────────────────────── */}
            <RolloverReveal delay={80} duration={750}>
              <View style={styles.headingRow}>
                <View style={styles.accentBar} />
                <View style={styles.headingText}>
                  <Text style={themeText.h1}>Where are you</Text>
                  <Text style={[themeText.h1, styles.headingCyan]}>playing from?</Text>
                </View>
              </View>
            </RolloverReveal>

            <RolloverReveal delay={260} duration={750} style={styles.inputSection}>

              {/* GPS path: tap → permission → detect → save silently → photo.
                  Hidden in manual mode (where we show the fields + Finish). */}
              {locStatus !== 'manual' && (
                <Pressable
                  style={({ pressed }) => [styles.locateBtn, pressed && styles.pressed]}
                  onPress={useMyLocation}
                  disabled={locStatus === 'detecting'}
                >
                  <View style={styles.locateBtnInner}>
                    <GradientFill colors={gradients.button} />
                    {locStatus === 'detecting'
                      ? (
                        <>
                          <ActivityIndicator color={colors.white} />
                          <Text style={styles.ctaText}>Getting location…</Text>
                        </>
                      )
                      : (
                        <>
                          <FontAwesome name="location-arrow" size={16} color={colors.white} />
                          <Text style={styles.ctaText}>Use my location</Text>
                        </>
                      )
                    }
                  </View>
                </Pressable>
              )}

              {locError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{locError}</Text>
                </View>
              ) : null}

              {locStatus === 'manual' && (
                <View style={styles.manualFields}>
                  <View style={styles.inputCard}>
                    <TextInput
                      style={styles.input}
                      placeholder="Address"
                      placeholderTextColor={colors.textFaint}
                      value={address}
                      onChangeText={editAddress}
                    />
                  </View>
                  <View style={styles.inputCard}>
                    <TextInput
                      style={styles.input}
                      placeholder="State / region (optional)"
                      placeholderTextColor={colors.textFaint}
                      value={region}
                      onChangeText={editRegion}
                    />
                  </View>
                  <View style={styles.inputCard}>
                    <TextInput
                      style={styles.input}
                      placeholder="Country"
                      placeholderTextColor={colors.textFaint}
                      value={country}
                      onChangeText={editCountry}
                    />
                  </View>
                </View>
              )}

              {locStatus === 'idle' && (
                <Pressable onPress={() => setLocStatus('manual')} hitSlop={8}>
                  <Text style={styles.linkText}>Enter location manually instead</Text>
                </Pressable>
              )}

              {errorMsg ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Finish CTA — only for manual entry; the GPS path auto-advances. */}
              {locStatus === 'manual' && (
                <Pressable
                  style={({ pressed }) => [
                    styles.cta,
                    !locationCtaEnabled && styles.ctaDisabled,
                    pressed && locationCtaEnabled && styles.pressed,
                  ]}
                  onPress={confirmLocation}
                  disabled={!locationCtaEnabled}
                >
                  <View style={styles.ctaInner}>
                    {locationCtaEnabled && <GradientFill colors={gradients.button} />}
                    {saving
                      ? <ActivityIndicator color={colors.white} />
                      : <Text style={[styles.ctaText, !locationCtaEnabled && styles.ctaTextDim]}>
                          Finish →
                        </Text>
                    }
                  </View>
                </Pressable>
              )}

              <View style={styles.locFooter}>
                <Pressable onPress={() => setStep('username')} hitSlop={8}>
                  <Text style={styles.linkText}>Back</Text>
                </Pressable>
                <Pressable onPress={skipLocation} disabled={saving} hitSlop={8}>
                  <Text style={styles.linkText}>Skip for now</Text>
                </Pressable>
              </View>

            </RolloverReveal>
          </>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg, justifyContent: 'center', gap: space.xl },

  // ── Heading
  headingRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  accentBar: {
    width: 5,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.cyan,
    marginTop: 4,
  },
  headingText: { flex: 1, gap: space.xs },
  headingCyan: { color: colors.cyan, marginTop: -8 },
  subtitle: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
    marginTop: space.sm,
  },

  // ── Input section
  inputSection: { gap: space.md },

  inputCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  inputCardGreen: { borderColor: colors.success },
  inputCardRed: { borderColor: colors.danger },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
  },
  atSign: {
    fontFamily: font.extrabold,
    fontSize: 20,
    color: colors.textFaint,
    marginRight: space.xs,
  },
  input: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    paddingVertical: space.lg,
  },
  spinner: { marginRight: space.sm },

  // Status pill
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  statusText: { fontFamily: font.bold, fontSize: 13 },

  // Error
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.10)', // colors.danger tint
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.30)',
    borderRadius: radius.sm,
    padding: space.md,
  },
  errorText: { fontFamily: font.semibold, fontSize: 14, color: colors.danger, textAlign: 'center' },

  // CTA
  cta: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.35, shadowOpacity: 0, elevation: 0 },
  ctaInner: {
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  ctaTextDim: { color: colors.textMuted },

  // Location step
  locSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  locSummaryText: { flex: 1, fontFamily: font.semibold, fontSize: 15, color: colors.text },
  locateBtn: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  locateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 18,
  },
  manualFields: { gap: space.sm },
  locFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space.xs },
  linkText: { fontFamily: font.bold, fontSize: 13, color: colors.blue, alignSelf: 'center' },

  pressed: { transform: [{ scale: 0.97 }], opacity: 0.88 },
});
