import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

/**
 * One Vite app, two front-ends on the same port:
 *   /admin/*  → admin panel   (src/admin)
 *   everything else → user app (src/user), shown in a phone-sized column
 * Each is loaded on demand so the other's code and styles are never pulled in.
 */
const isAdmin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
const root = createRoot(document.getElementById('root'));

if (isAdmin) {
  import('./admin/app/App').then(({ default: AdminApp }) =>
    root.render(
      <StrictMode>
        <AdminApp />
      </StrictMode>
    )
  );
} else {
  document.body.classList.add('user-shell');
  Promise.all([import('./user/user.css'), import('./user/i18n'), import('./user/App')]).then(([, , { default: UserApp }]) =>
    root.render(
      <StrictMode>
        <div id="phone">
          <UserApp />
        </div>
      </StrictMode>
    )
  );
}
