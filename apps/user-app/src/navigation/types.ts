import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Explore: { categoryId?: string } | undefined;
  Sell: undefined;
  Auctions: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Login: undefined;
  Otp: { phone: string; e164: string; length: number; resendInSec: number };
  ProfileSetup: undefined;
  Security: undefined;
  Page: { slug: 'terms' | 'privacy' | 'support' };
  Language: undefined;
  Location: undefined;
};
