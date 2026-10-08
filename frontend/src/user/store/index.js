import { configureStore, createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { configApi, meApi, authApi, notificationsApi, chatApi } from '../api/endpoints';
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

/* ───── inbox: unread counters for the bell and Messages ───── */
export const fetchUnread = createAsyncThunk('inbox/fetch', async () => {
  const [n, c] = await Promise.all([notificationsApi.unread(), chatApi.unread()]);
  return { notifications: n.data.count, chats: c.data.count };
});

const inboxSlice = createSlice({
  name: 'inbox',
  initialState: { notifications: 0, chats: 0 },
  reducers: {
    notificationArrived(state) {
      state.notifications += 1;
    },
    notificationsRead(state, a) {
      state.notifications = a.payload;
    },
    chatUnreadChanged(state, a) {
      state.chats = Math.max(0, state.chats + a.payload);
    },
    chatUnreadSet(state, a) {
      state.chats = a.payload;
    },
  },
  extraReducers: (b) => {
    b.addCase(fetchUnread.fulfilled, (state, a) => Object.assign(state, a.payload));
    b.addCase(logoutThunk.fulfilled, (state) => Object.assign(state, { notifications: 0, chats: 0 }));
    b.addCase(sessionSlice.actions.sessionExpired, (state) => Object.assign(state, { notifications: 0, chats: 0 }));
  },
});

/* ───── location: the place the user is browsing from ───── */
const LOCATION_KEY = 'loc.current';

const locationSlice = createSlice({
  name: 'location',
  initialState: { current: kvGetJSON(LOCATION_KEY) ?? null },
  reducers: {
    setLocation(state, a) {
      state.current = a.payload;
      if (a.payload) kvSetJSON(LOCATION_KEY, a.payload);
      else kv.remove(LOCATION_KEY);
    },
  },
});

export const { setLocation } = locationSlice.actions;

/**
 * Choose where you are (a map point + label) and how far to look around it (`scope`).
 * Remembered on this device and, when logged in, the place is saved to the profile.
 * current = { label, name, lat, lng, placeId, address, scope: { type: 'radius', km } | { type: 'district'|'state'|'country'|'worldwide' } }
 */
export const chooseLocation = (place) => async (dispatch, getState) => {
  dispatch(setLocation(place));
  if (getState().session.status === 'authenticated') {
    try {
      const { data } = await meApi.update({
        homeLocation: { label: place.label, name: place.name, placeId: place.placeId, lat: place.lat, lng: place.lng, address: place.address },
      });
      dispatch(meUpdated(data));
    } catch {
      /* the choice still applies on this device */
    }
  }
};

export const { maintenanceDetected, dismissUpdate } = appSlice.actions;
export const { signedIn, meUpdated, sessionExpired } = sessionSlice.actions;
export const { notificationArrived, notificationsRead, chatUnreadChanged, chatUnreadSet } = inboxSlice.actions;

export const store = configureStore({ reducer: { app: appSlice.reducer, session: sessionSlice.reducer, location: locationSlice.reducer, inbox: inboxSlice.reducer } });

export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;
