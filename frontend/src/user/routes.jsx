import { useNavigate } from 'react-router-dom';
import { LanguageScreen } from './screens/GateScreens';
import { LoginScreen, OtpScreen, ProfileSetupScreen } from './screens/AuthScreens';
import { ProfileScreen } from './screens/TabScreens';
import { AuctionsScreen, AuctionDetailScreen, MyAuctionsScreen, DealsScreen, DealScreen } from './screens/AuctionScreens';
import { SellScreen } from './screens/SellScreen';
import { SearchScreen } from './screens/SearchScreen';
import { ListingDetailScreen } from './screens/ListingDetailScreen';
import { MyListingsScreen, FavouritesScreen } from './screens/MyListingsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ExploreScreen } from './screens/ExploreScreen';
import { LocationScreen, AddressMapScreen } from './screens/LocationScreen';
import { SecurityScreen } from './screens/SecurityScreen';
import { PageScreen } from './screens/PageScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { LeadsScreen } from './screens/LeadsScreen';
import { PayScreen, PromoteScreen, PlansScreen, PaymentsScreen } from './screens/PaymentScreens';
import { SavedSearchesScreen, SavedSearchRedirect, SellerScreen } from './screens/GrowthScreens';
import { HelpScreen, NewCaseScreen, CaseScreen, MyReportsScreen, VerificationScreen, AccountScreen } from './screens/TrustScreens';
import { ChatsScreen, ChatScreen } from './screens/ChatScreens';
import { BlockedScreen } from './screens/BlockedScreen';
import { AccountStatusScreen, BannedScreen } from './screens/FirstRunScreens';

/** Change language later from Profile (same list as the first-run chooser) */
const LanguageRoute = () => {
  const navigate = useNavigate();
  return <LanguageScreen onDone={() => navigate(-1)} onBack={() => navigate(-1)} />;
};

/**
 * Every screen of the user app, by address. The website and the phone app use this same list;
 * `tabs` screens show the bottom tab bar.
 */
export const routes = [
  { path: '/', element: <HomeScreen />, tabs: true },
  { path: '/explore', element: <ExploreScreen />, tabs: true },
  { path: '/explore/:id', element: <ExploreScreen />, tabs: true },
  { path: '/sell', element: <SellScreen />, tabs: true },
  { path: '/sell/:id', element: <SellScreen />, tabs: true },
  { path: '/auctions', element: <AuctionsScreen />, tabs: true },
  { path: '/profile', element: <ProfileScreen />, tabs: true },
  { path: '/login', element: <LoginScreen /> },
  { path: '/otp', element: <OtpScreen /> },
  { path: '/profile-setup', element: <ProfileSetupScreen /> },
  { path: '/security', element: <SecurityScreen /> },
  { path: '/page/:slug', element: <PageScreen /> },
  { path: '/language', element: <LanguageRoute /> },
  { path: '/location', element: <LocationScreen /> },
  { path: '/location/new', element: <AddressMapScreen /> },
  { path: '/location/:id/edit', element: <AddressMapScreen /> },
  { path: '/search', element: <SearchScreen /> },
  { path: '/listing/:id', element: <ListingDetailScreen /> },
  { path: '/my-listings', element: <MyListingsScreen /> },
  { path: '/favourites', element: <FavouritesScreen /> },
  { path: '/notifications', element: <NotificationsScreen /> },
  { path: '/chats', element: <ChatsScreen />, tabs: true },
  { path: '/chat/:id', element: <ChatScreen /> },
  { path: '/auctions/:id', element: <AuctionDetailScreen /> },
  { path: '/auctions/:auctionId/edit', element: <SellScreen /> },
  { path: '/my-auctions', element: <MyAuctionsScreen /> },
  { path: '/deals', element: <DealsScreen /> },
  { path: '/pay', element: <PayScreen /> },
  { path: '/promote/:id', element: <PromoteScreen /> },
  { path: '/plans', element: <PlansScreen /> },
  { path: '/payments', element: <PaymentsScreen /> },
  { path: '/saved-searches', element: <SavedSearchesScreen /> },
  { path: '/saved-searches/:id', element: <SavedSearchRedirect /> },
  { path: '/u/:publicId', element: <SellerScreen /> },
  { path: '/help', element: <HelpScreen /> },
  { path: '/help/new', element: <NewCaseScreen /> },
  { path: '/help/cases/:id', element: <CaseScreen /> },
  { path: '/reports', element: <MyReportsScreen /> },
  { path: '/verification', element: <VerificationScreen /> },
  { path: '/account', element: <AccountScreen /> },
  { path: '/account-status', element: <AccountStatusScreen /> },
  { path: '/blocked', element: <BlockedScreen /> },
  { path: '/banned', element: <BannedScreen /> },
  { path: '/deals/:id', element: <DealScreen /> },
  { path: '/leads/received', element: <LeadsScreen initial="received" /> },
  { path: '/leads/sent', element: <LeadsScreen initial="sent" /> },
];

export { TAB_ROOTS } from './tabRoots';
