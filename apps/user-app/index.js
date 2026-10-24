/**
 * The phone app runs the website's screens (frontend/src/user) — see metro.config.js.
 * @format
 */
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import App from '../../frontend/src/user/App';
import { registerBackgroundHandler } from '../../frontend/src/user/services/push';
import { NativeRoot } from './src/NativeRoot';
import { hotUpdater } from './src/hotUpdater';
import { name as appName } from './app.json';

registerBackgroundHandler();

const Root = () => (
  <NativeRoot>
    <App />
  </NativeRoot>
);

// Release builds check for an over-the-air update on start (no waiting screen: the app opens at once);
// debug builds load their code from Metro instead.
const AppRoot = __DEV__ ? Root : hotUpdater.wrap({ updateStrategy: 'appVersion', reloadOnForceUpdate: true })(Root);

AppRegistry.registerComponent(appName, () => AppRoot);
