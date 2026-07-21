import * as Location from 'expo-location';

export type DeviceLocation = {
  address: string | null;   // street-level ("12 Marina St") when available
  city: string | null;
  region: string | null;    // state / region
  country: string | null;
  latitude: number;
  longitude: number;
};

export type LocationErrorReason = 'permission-denied' | 'timeout' | 'unavailable' | 'unknown';

/** Thrown by getDeviceLocation with a `reason` callers can switch on for a specific message. */
export class LocationCaptureError extends Error {
  reason: LocationErrorReason;
  constructor(reason: LocationErrorReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

// expo-location has no built-in timeout for a single reading (unlike the web
// Geolocation API) — race it ourselves so a weak GPS signal fails fast
// instead of leaving the user staring at a spinner.
const POSITION_TIMEOUT_MS = 12_000;

// Native errors surface with a `.code` inferred from the underlying
// CodedException class name (e.g. LocationUnavailableException -> ERR_LOCATION_UNAVAILABLE).
const UNAVAILABLE_CODES = new Set([
  'ERR_LOCATION_UNAVAILABLE',
  'ERR_CURRENT_LOCATION_IS_UNAVAILABLE',
  'ERR_LOCATION_SETTINGS_UNSATISFIED',
  'ERR_LOCATION_UNKNOWN',
]);

/**
 * Requests foreground location permission, takes a single reading, and
 * reverse-geocodes it to a city/region/country (plus the raw lat/lon, for
 * future proximity matching). Throws a LocationCaptureError with a `reason`
 * if permission is denied, the position can't be read, or nothing is found —
 * callers should fall back to manual entry.
 */
export async function getDeviceLocation(): Promise<DeviceLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new LocationCaptureError('permission-denied', 'Location permission was denied.');
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const position = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new LocationCaptureError('timeout', 'Location request timed out.')), POSITION_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timeoutId)).catch((e) => {
    if (e instanceof LocationCaptureError) throw e;
    if (UNAVAILABLE_CODES.has(e?.code)) {
      throw new LocationCaptureError('unavailable', 'Location is unavailable — check that location services are turned on.');
    }
    throw new LocationCaptureError('unknown', 'Could not get your location.');
  });

  const [place] = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  }).catch(() => {
    throw new LocationCaptureError('unknown', 'Could not determine your location from GPS.');
  });

  if (!place) {
    throw new LocationCaptureError('unknown', 'Could not determine your location.');
  }

  const address =
    [place.streetNumber, place.street].filter(Boolean).join(' ').trim() ||
    place.name ||
    null;

  return {
    address,
    city: place.city ?? null,
    region: place.region ?? null,
    country: place.country ?? null,
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}
