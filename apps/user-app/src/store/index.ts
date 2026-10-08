import { configureStore, createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { Bootstrap, CurrentPlace, Me } from '../api/types';
import { configApi, meApi, authApi } from '../api/endpoints';
import { loadTokens, clearTokens, hasSession } from '../api/client';
import { kvGetJSON, kvSetJSON, KV, kv } from '../services/storage';

/* ───────── app (bootstrap / maintenance / update) ───────── */

type AppState = {
  status: 'booting' | 'ready' | 'offline';
  bootstrap: Bootstrap | null;
  maintenance: Bootstrap['maintenance'] | null;
  updateDismissed: boolean;
};

const initialApp: AppState = {
  status: 'booting',
  bootstrap: kvGetJSON<Bootstrap>(KV.bootstrap) ?? null,
  maintenance: null,
  updateDismissed: false,
};

export const fetchBootstrap = createAsyncThunk('app/bootstrap', async () => {
  const { data } = await configApi.bootstrap();
  kvSetJSON(KV.bootstrap, data);
  return data;
});

const appSlice = createSlice({
  name: 'app',
  initialState: initialApp,
  reducers: {
    maintenanceDetected(state, a: PayloadAction<Bootstrap['maintenance']>) {
      state.maintenance = a.payload;
    },
    dismissUpdate(state) {
      state.updateDismissed = true;
    },
  },
  extraReducers: b => {
    b.addCase(fetchBootstrap.fulfilled, (state, a) => {
      state.status = 'ready';
      state.bootstrap = a.payload;
      state.maintenance = a.payload.maintenance.enabled ? a.payload.maintenance : null;
    });
    b.addCase(fetchBootstrap.rejected, state => {
      // Use the last cached bootstrap if there is one; otherwise show the offline screen.
      state.status = state.bootstrap ? 'ready' : 'offline';
    });
  },
});

/* ───────── session ───────── */

type SessionState = {
  status: 'unknown' | 'guest' | 'authenticated';
  me: Me | null;
};

export const restoreSession = createAsyncThunk('session/restore', async () => {
  await loadTokens();
  if (!hasSession()) return null;
  try {
    const { data } = await meApi.get();
    return data;
  } catch {
    return hasSession() ? kvGetJSON<Me>('cache.me') ?? null : null;
  }
});

export const logoutThunk = createAsyncThunk('session/logout', async () => {
  const fcmToken = kv.getString(KV.fcmToken);
  try {
    if (fcmToken) await authApi.removeDevice(fcmToken);
    await authApi.logout();
  } catch {
    /* server-side session will expire; local logout proceeds */
  }
  await clearTokens();
});

const sessionSlice = createSlice({
  name: 'session',
  initialState: { status: 'unknown', me: null } as SessionState,
  reducers: {
    signedIn(state, a: PayloadAction<Me>) {
      state.status = 'authenticated';
      state.me = a.payload;
      kvSetJSON('cache.me', a.payload);
    },
    meUpdated(state, a: PayloadAction<Me>) {
      state.me = a.payload;
      kvSetJSON('cache.me', a.payload);
    },
    sessionExpired(state) {
      state.status = 'guest';
      state.me = null;
      kv.remove('cache.me');
    },
  },
  extraReducers: b => {
    b.addCase(restoreSession.fulfilled, (state, a) => {
      state.status = a.payload ? 'authenticated' : 'guest';
      state.me = a.payload;
    });
    b.addCase(restoreSession.rejected, state => {
      state.status = 'guest';
    });
    b.addCase(logoutThunk.fulfilled, state => {
      state.status = 'guest';
      state.me = null;
      kv.remove('cache.me');
    });
  },
});

/* ───────── location: the place the user is browsing from ───────── */

const LOCATION_KEY = 'loc.current';

const locationSlice = createSlice({
  name: 'location',
  initialState: { current: kvGetJSON<CurrentPlace>(LOCATION_KEY) ?? null } as { current: CurrentPlace | null },
  reducers: {
    setLocation(state, a: PayloadAction<CurrentPlace | null>) {
      state.current = a.payload;
      if (a.payload) kvSetJSON(LOCATION_KEY, a.payload);
      else kv.remove(LOCATION_KEY);
    },
  },
});

export const { setLocation } = locationSlice.actions;
export const { maintenanceDetected, dismissUpdate } = appSlice.actions;
export const { signedIn, meUpdated, sessionExpired } = sessionSlice.actions;

export const store = configureStore({
  reducer: { app: appSlice.reducer, session: sessionSlice.reducer, location: locationSlice.reducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/** Choose a place: remembered on this device and, when logged in, saved to the user's profile. */
export const chooseLocation =
  (loc: CurrentPlace) =>
  async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(setLocation({ id: loc.id, name: loc.name, path: loc.path, type: loc.type }));
    if (getState().session.status === 'authenticated') {
      try {
        const { data } = await meApi.update({ homeLocationId: loc.id });
        dispatch(meUpdated(data));
      } catch {
        /* the choice still applies on this device */
      }
    }
  };
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
