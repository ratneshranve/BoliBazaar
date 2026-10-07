/**
 * @format
 */
import 'react-native-get-random-values';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandler } from './src/services/push';

registerBackgroundHandler();

AppRegistry.registerComponent(appName, () => App);
