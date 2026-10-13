import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import * as repo from '@/db/repository';
import { dictionaryFor, resolveLanguage } from '@/i18n';
import { thresholdsFor, type ThresholdSet } from '@/domain/classification';
import type { NewReading, Profile, Reading, Settings } from '@/domain/types';
import { deletePhoto } from '@/services/scan';

interface AppStateValue {
  ready: boolean;
  error: string | null;
  settings: Settings;
  profile: Profile;
  profiles: Profile[];
  /** Every reading for the active profile, newest first. */
  readings: Reading[];
  /**
   * The category boundaries in force, already resolved from the chosen scale.
   *
   * Screens take this rather than the scale's name so that "which numbers does
   * `custom` mean" is answered once, here, instead of at every call site --
   * and so a scale that is missing or unusable falls back in one place.
   */
  thresholds: ThresholdSet;
  refresh: () => Promise<void>;
  addReading: (input: NewReading) => Promise<Reading>;
  editReading: (reading: Reading) => Promise<void>;
  removeReading: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  addProfile: (name: string) => Promise<Profile>;
  editProfile: (profile: Profile) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;
  selectProfile: (id: string) => Promise<void>;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/**
 * Startup status, published separately from the app state itself.
 *
 * The two are split because the splash screen can only be dismissed by something
 * that renders, and the app state is not available until the database has
 * opened. Gating every child on the state meant that a slow or failed open left
 * the user staring at the splash forever, with the error captured but nothing
 * mounted to show it.
 */
export interface Bootstrap {
  ready: boolean;
  error: string | null;
  retry: () => void;
}

const BootstrapContext = createContext<Bootstrap>({
  ready: false,
  error: null,
  retry: () => {},
});

export function useBootstrap(): Bootstrap {
  return useContext(BootstrapContext);
}

/** How long startup may take before it is reported as a failure. */
const BOOTSTRAP_TIMEOUT_MS = 15_000;

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);

  const load = useCallback(async () => {
    // Read the language preference first: on a fresh install `loadSettings`
    // creates the default profile, and it should be named in the user's language.
    const saved = (await repo.getSetting('language')) as Settings['language'] | null;
    const dictionary = dictionaryFor(resolveLanguage(saved ?? 'de'));

    // Sequential, and it has to be.
    //
    // These used to run in a `Promise.all`, which is wrong in a way that only
    // shows on a device that has never run the app: `loadSettings` is what
    // *creates* the first profile, via `ensureProfile`. Listing profiles
    // alongside it queues its SELECT before that INSERT lands, so a fresh
    // install came back with a valid `activeProfileId` and zero profiles.
    // Everything downstream then had no `profile`, and the app sat on its
    // splash screen forever. The parallelism saved perhaps a millisecond.
    const loadedSettings = await repo.loadSettings(dictionary.profiles.defaultName);
    const loadedProfiles = await repo.listProfiles();
    const active =
      loadedProfiles.find((p) => p.id === loadedSettings.activeProfileId) ??
      loadedProfiles[0];
    const loadedReadings = active
      ? await repo.listReadings({ profileId: active.id })
      : [];

    setSettings({ ...loadedSettings, activeProfileId: active?.id ?? loadedSettings.activeProfileId });
    setProfiles(loadedProfiles);
    setReadings(loadedReadings);
  }, []);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        /**
         * Bounded, because startup must never be able to hang silently.
         *
         * `load` opens SQLite and runs any outstanding migrations. If that
         * settles -- either way -- the screens below take over. If it never
         * settles, nothing else in the app ever runs: `BootGate` holds the
         * splash until `ready`, so the app sits on its launch image forever
         * with no error, no retry and nothing on screen to explain it. That is
         * the worst failure an app can have, because it looks like a crash and
         * leaves nothing to report.
         *
         * Observed for real: a release build on a *fresh install* stopped here
         * and never came back. A promise that neither resolves nor rejects has
         * no stack to inspect, so the fix is to stop waiting on it and say so.
         * Fifteen seconds is far longer than opening a database and creating
         * four tables can legitimately take, even on a cold, slow device.
         */
        await Promise.race([
          load(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Timed out while opening the database.')),
              BOOTSTRAP_TIMEOUT_MS,
            );
          }),
        ]);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not open the database.');
        }
      } finally {
        if (timer) clearTimeout(timer);
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load, attempt]);

  // Back to the splash before trying again. Reset here, in the handler, rather
  // than at the top of the effect: the first attempt already starts that way.
  const retry = useCallback(() => {
    setReady(false);
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  const profile = useMemo(
    () => profiles.find((p) => p.id === settings?.activeProfileId) ?? profiles[0],
    [profiles, settings?.activeProfileId],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  const addReading = useCallback(
    async (input: NewReading) => {
      const created = await repo.insertReading(input);
      setReadings((prev) =>
        [created, ...prev].sort((a, b) => b.measuredAt - a.measuredAt),
      );
      return created;
    },
    [],
  );

  const editReading = useCallback(async (reading: Reading) => {
    await repo.updateReading(reading);
    setReadings((prev) =>
      prev
        .map((r) => (r.id === reading.id ? { ...reading, updatedAt: Date.now() } : r))
        .sort((a, b) => b.measuredAt - a.measuredAt),
    );
  }, []);

  const removeReading = useCallback(async (id: string) => {
    // Read the row first so the photo can be cleaned up too; orphaned images
    // would otherwise accumulate in app storage forever.
    const existing = await repo.getReading(id);
    await repo.deleteReading(id);
    await deletePhoto(existing?.imageUri ?? null);
    setReadings((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      for (const [key, value] of Object.entries(patch)) {
        // Objects are stored as JSON. `String(value)` on one writes
        // "[object Object]", which parses back as nothing -- the setting would
        // appear to save and be gone on the next launch.
        const stored =
          value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
        await repo.setSetting(key, stored);
      }
      setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
      if (patch.activeProfileId) {
        const next = await repo.listReadings({ profileId: patch.activeProfileId });
        setReadings(next);
      }
    },
    [],
  );

  const addProfile = useCallback(async (name: string) => {
    const created = await repo.createProfile(name);
    setProfiles((prev) => [...prev, created]);
    return created;
  }, []);

  const editProfile = useCallback(async (next: Profile) => {
    await repo.updateProfile(next);
    setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }, []);

  const selectProfile = useCallback(
    async (id: string) => {
      await repo.setSetting('activeProfileId', id);
      setSettings((prev) => (prev ? { ...prev, activeProfileId: id } : prev));
      setReadings(await repo.listReadings({ profileId: id }));
    },
    [],
  );

  const removeProfile = useCallback(
    async (id: string) => {
      await repo.deleteProfile(id);
      const remaining = profiles.filter((p) => p.id !== id);
      setProfiles(remaining);
      if (settings?.activeProfileId === id && remaining[0]) {
        await selectProfile(remaining[0].id);
      }
    },
    [profiles, settings?.activeProfileId, selectProfile],
  );

  const thresholds = useMemo(
    () =>
      thresholdsFor(
        settings?.classificationScale ?? 'esh',
        settings?.customThresholds ?? null,
      ),
    [settings?.classificationScale, settings?.customThresholds],
  );

  const value = useMemo<AppStateValue | null>(() => {
    if (!settings || !profile) return null;
    return {
      ready,
      error,
      settings,
      profile,
      profiles,
      readings,
      thresholds,
      refresh,
      addReading,
      editReading,
      removeReading,
      updateSettings,
      addProfile,
      editProfile,
      removeProfile,
      selectProfile,
    };
  }, [
    ready,
    error,
    settings,
    profile,
    profiles,
    readings,
    thresholds,
    refresh,
    addReading,
    editReading,
    removeReading,
    updateSettings,
    addProfile,
    editProfile,
    removeProfile,
    selectProfile,
  ]);

  const bootstrap = useMemo<Bootstrap>(() => {
    /**
     * "Loaded but with no state" is a failure, not a ready app: the screens
     * below assume a profile exists.
     *
     * The failure is computed once and used for both fields, which is the
     * whole point. Previously `ready` tested the raw `error` state while
     * `error` reported a *derived* message, so a load that succeeded and
     * produced nothing left `ready` false and the message unreachable --
     * a permanent spinner behind the splash, describing a problem it could
     * never show. A guard that cannot report the case it guards against is
     * worse than no guard, because it looks like one.
     */
    const failure =
      error ?? (ready && value === null ? 'Could not load your data.' : null);
    return {
      ready: ready && (value !== null || failure !== null),
      error: failure,
      retry,
    };
  }, [ready, value, error, retry]);

  return (
    <BootstrapContext.Provider value={bootstrap}>
      <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
    </BootstrapContext.Provider>
  );
}

export function useAppState(): AppStateValue {
  const value = useContext(AppStateContext);
  if (!value) {
    throw new Error('useAppState must be used inside <AppStateProvider>');
  }
  return value;
}

/** Theme preference, readable before the rest of the state has loaded. */
export function useThemePreference(): Settings['theme'] {
  const value = useContext(AppStateContext);
  return value?.settings.theme ?? 'system';
}

/** Language preference, readable before the rest of the state has loaded. */
export function useLanguagePreference(): Settings['language'] {
  const value = useContext(AppStateContext);
  return value?.settings.language ?? 'de';
}
