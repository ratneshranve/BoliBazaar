export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  Otp: { phone: string; e164: string; length: number; resendInSec: number };
  ProfileSetup: undefined;
  Security: undefined;
  Page: { slug: 'terms' | 'privacy' | 'support' };
  Language: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Sell: undefined;
  Auctions: undefined;
  Profile: undefined;
};
