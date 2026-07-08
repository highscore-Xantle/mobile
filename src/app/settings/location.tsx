import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GradientFill } from '../../components/GradientFill';
import { canonicalizeCountry, isValidCountry, suggestCountries } from '../../lib/countries';
import { getDeviceLocation, LocationCaptureError } from '../../lib/location';
import { goBackOr } from '../../lib/navigation';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../lib/useSession';
import { colors, font, gradients, radius, shadow, space, text as themeText } from '../../theme';

export default function LocationSettings() {
  const router = useRouter();
  const { session } = useSession();

  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  // city + coords ride along with the GPS path only; manual edits drop them so
  // we never store a pin/city that contradicts the typed fields (same rule as
  // onboarding).
  const [city, setCity] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [hasSaved, setHasSaved] = useState(false); // profile already has a location

  const [countrySuggestions, setCountrySuggestions] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [detectedNote, setDetectedNote] = useState('');

  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!session?.user?.id) return;
    let active = true;
    setLoadError(false);
    setLoading(true);
    supabase
      .from('profiles')
      .select('address, city, region, country, latitude, longitude')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          // Surface the failure instead of silently rendering a blank form the
          // user might mistake for "my location was lost" and then overwrite.
          setLoadError(true);
          setLoading(false);
          return;
        }
        if (data) {
          setAddress(data.address ?? '');
          setRegion(data.region ?? '');
          setCountry(data.country ?? '');
          setCity(data.city ?? null);
          setCoords(
            data.latitude != null && data.longitude != null
              ? { latitude: data.latitude, longitude: data.longitude }
              : null,
          );
          // Include coords so a GPS-only row (all text null) still shows "Remove".
          setHasSaved(!!(data.address || data.city || data.region || data.country
            || data.latitude != null || data.longitude != null));
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [session?.user?.id, reloadKey]);

  const editAddress = (v: string) => { setAddress(v); setCity(null); setCoords(null); setDetectedNote(''); };
  const editRegion = (v: string) => { setRegion(v); setCity(null); setCoords(null); setDetectedNote(''); };
  const editCountry = (v: string) => {
    setCountry(v);
    setCity(null);
    setCoords(null);
    setDetectedNote('');
    setCountrySuggestions(suggestCountries(v));
  };
  const pickCountry = (c: string) => { setCountry(c); setCountrySuggestions([]); };

  const useMyLocation = async () => {
    setDetecting(true);
    setErrorMsg('');
    setDetectedNote('');
    try {
      const loc = await getDeviceLocation();
      setAddress(loc.address ?? '');
      setRegion(loc.region ?? '');
      setCountry(loc.country ?? '');
      setCity(loc.city ?? null);
      setCoords({ latitude: loc.latitude, longitude: loc.longitude });
      setCountrySuggestions([]);
      setDetectedNote('Location detected — tap Save to confirm.');
    } catch (e) {
      const reason = e instanceof LocationCaptureError ? e.reason : 'unknown';
      setErrorMsg(
        reason === 'permission-denied'
          ? 'Location access was denied — allow it in your device settings, or fill the fields in manually.'
          : reason === 'timeout'
          ? 'Location request timed out — try again or enter it manually.'
          : reason === 'unavailable'
          ? 'Location unavailable — check your signal or enter it manually.'
          : "Couldn't detect your location — enter it manually.",
      );
    } finally {
      setDetecting(false);
    }
  };

  const saveLocation = async (loc: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  }) => {
    if (!session?.user) return false;
    setSaving(true);
    setErrorMsg('');
    const { error } = await supabase.from('profiles').update(loc).eq('id', session.user.id);
    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    const ok = await saveLocation({
      address: address.trim() || null,
      city,
      region: region.trim() || null,
      // Store the canonical name, not the typed casing/alias.
      country: canonicalizeCountry(country),
      latitude: coords?.latitude ?? null,
      longitude: coords?.longitude ?? null,
    });
    if (ok) {
      Alert.alert('Location updated');
      goBackOr(router, '/settings');
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove location',
      'This clears your saved location from your profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const ok = await saveLocation({
              address: null, city: null, region: null, country: null, latitude: null, longitude: null,
            });
            if (ok) {
              Alert.alert('Location removed');
              goBackOr(router, '/settings');
            }
          },
        },
      ],
    );
  };

  const countryValid = isValidCountry(country);
  const countryInvalid = country.trim().length > 0 && !countryValid;
  // Country is the only required field (address optional) — matches onboarding and
  // avoids blocking Save when GPS returns no street address.
  const canSave = !saving && !detecting && countryValid;

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <GradientFill colors={gradients.background} />
        <ActivityIndicator color={colors.blue} size="large" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.root}>
        <GradientFill colors={gradients.background} />
        <SafeAreaView style={[styles.safe, styles.center]}>
          <Text style={themeText.body}>Couldn't load your location.</Text>
          <Pressable
            style={({ pressed }) => [styles.cta, { marginTop: space.lg, alignSelf: 'stretch' }, pressed && styles.pressed]}
            onPress={() => setReloadKey(k => k + 1)}
          >
            <View style={styles.ctaInner}>
              <GradientFill colors={gradients.button} />
              <Text style={styles.ctaText}>Retry</Text>
            </View>
          </Pressable>
          <Pressable style={{ marginTop: space.md }} onPress={() => goBackOr(router, '/settings')} hitSlop={8}>
            <Text style={styles.removeText}>Back to settings</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <GradientFill colors={gradients.background} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => goBackOr(router, '/settings')}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <Text style={themeText.h2}>Location</Text>
          <View style={styles.backBtn} />
        </View>

        {/* keyboardShouldPersistTaps so country suggestions are tappable while typing */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Pressable
            style={({ pressed }) => [styles.locateBtn, pressed && styles.pressed]}
            onPress={useMyLocation}
            disabled={detecting || saving}
          >
            <View style={styles.locateBtnInner}>
              <GradientFill colors={gradients.button} />
              {detecting ? (
                <>
                  <ActivityIndicator color={colors.white} />
                  <Text style={styles.ctaText}>Getting location…</Text>
                </>
              ) : (
                <>
                  <FontAwesome name="location-arrow" size={16} color={colors.white} />
                  <Text style={styles.ctaText}>Use my location</Text>
                </>
              )}
            </View>
          </Pressable>

          {detectedNote ? <Text style={styles.detectedNote}>{detectedNote}</Text> : null}

          {errorMsg ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>ADDRESS</Text>
            <View style={styles.inputCard}>
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <TextInput
                style={styles.input}
                placeholder="Street, area, or neighborhood"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="words"
                autoCorrect={false}
                value={address}
                onChangeText={editAddress}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>STATE / REGION (OPTIONAL)</Text>
            <View style={styles.inputCard}>
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Lagos"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="words"
                autoCorrect={false}
                value={region}
                onChangeText={editRegion}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>COUNTRY</Text>
            <View style={styles.inputCard}>
              <GradientFill colors={[colors.surface, colors.surfaceAlt]} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Nigeria"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="words"
                autoCorrect={false}
                value={country}
                onChangeText={editCountry}
                onBlur={() => setTimeout(() => setCountrySuggestions([]), 150)}
              />
            </View>
            {countrySuggestions.length > 0 && (
              <View style={styles.suggestionsCard}>
                {countrySuggestions.map((c, i) => (
                  <Pressable
                    key={c}
                    style={[styles.suggestionRow, i < countrySuggestions.length - 1 && styles.suggestionRowDivider]}
                    onPress={() => pickCountry(c)}
                  >
                    <Text style={styles.suggestionText}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {countryInvalid && countrySuggestions.length === 0 && (
              <Text style={styles.fieldError}>Pick a country from the list.</Text>
            )}
          </View>

          <Pressable
            style={({ pressed }) => [styles.cta, !canSave && styles.ctaDisabled, pressed && canSave && styles.pressed]}
            onPress={handleSave}
            disabled={!canSave}
          >
            <View style={styles.ctaInner}>
              {canSave && <GradientFill colors={gradients.button} />}
              {saving
                ? <ActivityIndicator color={colors.white} />
                : <Text style={[styles.ctaText, !canSave && styles.ctaTextDim]}>Save</Text>}
            </View>
          </Pressable>

          {hasSaved && (
            <Pressable onPress={handleRemove} disabled={saving} hitSlop={8} style={styles.removeBtn}>
              <Text style={styles.removeText}>Remove location</Text>
            </Pressable>
          )}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1, paddingHorizontal: space.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { gap: space.md, paddingBottom: space.xl },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.sm,
    paddingBottom: space.xl,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  backGlyph: { color: colors.text, fontSize: 22, marginTop: -2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },

  locateBtn: { borderRadius: radius.lg, overflow: 'hidden', ...shadow.blueGlow },
  locateBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: 18,
  },
  detectedNote: { fontFamily: font.semibold, fontSize: 13, color: colors.success, textAlign: 'center' },

  fieldGroup: { gap: space.xs },
  fieldLabel: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1, color: colors.textFaint, marginLeft: 2 },
  fieldError: { fontFamily: font.semibold, fontSize: 12, color: colors.danger, marginLeft: 2 },
  inputCard: {
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadow.card,
  },
  // No flex:1 — inside a column card it collapses the input height (see onboarding).
  input: {
    fontFamily: font.semibold,
    fontSize: 18,
    color: colors.text,
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },

  suggestionsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginTop: space.xs,
    ...shadow.card,
  },
  suggestionRow: { paddingVertical: space.sm, paddingHorizontal: space.md },
  suggestionRowDivider: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  suggestionText: { fontFamily: font.semibold, fontSize: 15, color: colors.text },

  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: radius.sm,
    padding: space.md,
  },
  errorText: { color: colors.danger, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },

  cta: { borderRadius: radius.lg, overflow: 'hidden', marginTop: space.sm, ...shadow.blueGlow },
  ctaDisabled: { opacity: 0.35, shadowOpacity: 0, elevation: 0 },
  ctaInner: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  ctaText: { fontFamily: font.extrabold, fontSize: 17, color: colors.white, letterSpacing: 0.4 },
  ctaTextDim: { color: colors.textMuted },

  removeBtn: { alignSelf: 'center', paddingVertical: space.sm },
  removeText: { fontFamily: font.semibold, fontSize: 14, color: colors.danger },
});
