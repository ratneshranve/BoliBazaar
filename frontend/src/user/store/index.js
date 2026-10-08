import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { configApi, meApi, authApi } from '../api/endpoints';
import { loadTokens, clearTokens, hasSession } from '../api/client';
import { kvGetJSON, kvSetJSON, KV, kv } from '../services/storage';

/* ───── app: bootstrap / maintenance / update ───── */
export const fetchBootstrap = createAsyncThunk('app/bootstrap', async () => {
  const { data } = await configApi.bootstrap();
  kvSetJSON(KV.bootstrap, data);
  return data;
});

const appSlice = createSlice({
  name: 'app',
  initialState: { status: 'booting', bootstrap: kvGetJSON(KV.bootstrap) ?? null, maintenance: null, updateDismissed: false },
  reducers: {
    maintenanceDetected(state, a) {
      state.maintenance = a.payload;
    },
    dismissUpdate(state) {
      state.updateDismissed = true;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchBootstrap.fulfilled, (state, a) => {
      state.status = 'ready';
      state.bootstrap = a.payload;
      state.maintenance = a.payload.maintenance.enabled ? a.payload.maintenance : null;
    });
    b.addCase(fetchBootstrap.rejected, (state) => {
      state.status = state.bootstrap ? 'ready' : 'offline';
    });
  },
});

/* ───── session ───── */
export const restoreSession = createAsyncThunk('session/restore', async () => {
  await loadTokens();
  if (!hasSession()) return null;
  try {
    return (await meApi.get()).data;
  } catch {
    return hasSession() ? (kvGetJSON('cache.me') ?? null) : null;
  }
});

export const logoutThunk = createAsyncThunk('session/logout', async () => {
  try {
    await authApi.logout();
  } catch {
    /* server session expires on its own; local logout proceeds */
  }
  await clearTokens();
});

const sessionSlice = createSlice({
  name: 'session',
  initialState: { status: 'unknown', me: null },
  reducers: {
    signedIn(state, a) {
      state.status = 'authenticated';
      state.me = a.payload;
      kvSetJSON('cache.me', a.payload);
    },
    meUpdated(state, a) {
      state.me = a.payload;
      kvSetJSON('cache.me', a.payload);
    },
    sessionExpired(state) {
      state.status = 'guest';
      state.me = null;
      kv.remove('cache.me');
    },
  },
  extraReducers: (b) => {
    b.addCase(restoreSession.fulfilled, (state, a) => {
      state.status = a.payload ? 'authenticated' : 'guest';
      state.me = a.payload;
    });
    b.addCase(restoreSession.rejected, (state) => {
      state.status = 'guest';
    });
    b.addCase(logoutThunk.fulfilled, (state) => {
      state.status = 'guest';
      state.me = null;
      kv.remove('cache.me');
    });
  },
});

export const { maintenanceDetected, dismissUpdate } = appSlice.actions;
export const { signedIn, meUpdated, sessionExpired } = sessionSlice.actions;

export const store = configureStore({ reducer: { app: appSlice.reducer, session: sessionSlice.reducer } });

export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
