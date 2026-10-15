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
import { name as appName } from './app.json';

registerBackgroundHandler();

const Root = () => (
  <NativeRoot>
    <App />
  </NativeRoot>
);

AppRegistry.registerComponent(appName, () => Root);
