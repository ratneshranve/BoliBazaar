import { BrowserRouter, Outlet, Route, Routes } from 'react-router-dom';
import { routes } from './routes';

/** Website: the browser address bar drives the screens. `TabsLayout` adds the bottom tab bar. */
export const Navigation = ({ TabsLayout, children }) => (
  <BrowserRouter>
    {children}
    <Routes>
      <Route
        element={
          <TabsLayout>
            <Outlet />
          </TabsLayout>
        }>
        {routes.filter((r) => r.tabs).map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
      </Route>
      {routes.filter((r) => !r.tabs).map((r) => <Route key={r.path} path={r.path} element={r.element} />)}
    </Routes>
  </BrowserRouter>
);
