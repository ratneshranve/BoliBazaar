import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTranslation } from 'react-i18next';
import { TabBar } from '../components/TabBar';
import { HomeScreen, ExploreScreen, SellScreen, AuctionsScreen, ProfileScreen } from '../screens/TabScreens';
import { LoginScreen, OtpScreen, ProfileSetupScreen } from '../screens/AuthScreens';
import { SecurityScreen } from '../screens/SecurityScreen';
import { useAppSelector } from '../store';
import type { MainTabParamList, RootStackParamList } from './types';

export const navRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const Main = () => {
  const loggedIn = useAppSelector(s => s.session.status === 'authenticated');
  return (
    <Tabs.Navigator tabBar={p => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Explore" component={ExploreScreen} />
      <Tabs.Screen
        name="Sell"
        component={SellScreen}
        listeners={({ navigation }) => ({
          tabPress: e => {
            // Selling needs an account: send guests to login, then they return here.
            if (!loggedIn) {
              e.preventDefault();
              navigation.getParent()?.navigate('Login');
            }
          },
        })}
      />
      <Tabs.Screen name="Auctions" component={AuctionsScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
};

export const RootNavigator = () => {
  const { t } = useTranslation();
  return (
    <NavigationContainer ref={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Main} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="Otp" component={OtpScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Security" component={SecurityScreen} options={{ headerShown: true, title: t('security.title') }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
