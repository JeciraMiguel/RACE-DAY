import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { RouteError } from './RouteError';

// Every page is its own chunk (route-level code splitting); pages export `Component`.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('../pages/Home') },
      { path: 'events', lazy: () => import('../pages/Events') },
      { path: 'events/:id', lazy: () => import('../pages/EventDetail') },
      { path: 'events/:id/results', lazy: () => import('../pages/Results') },
      { path: 'login', lazy: () => import('../pages/Login') },
      { path: 'register', lazy: () => import('../pages/Register') },
      { path: 'forbidden', lazy: () => import('../pages/Forbidden') },
      {
        // Signed-in area. Role-restricted branches (organizer/admin) add <RequireAuth roles={[...]}> in later phases.
        element: <RequireAuth />,
        children: [
          {
            path: 'me',
            lazy: () => import('../pages/me/MeLayout'),
            children: [
              { index: true, element: <Navigate to="registrations" replace /> },
              { path: 'registrations', lazy: () => import('../pages/me/MyRegistrations') },
              { path: 'results', lazy: () => import('../pages/me/MyResults') },
              { path: 'profile', lazy: () => import('../pages/me/ProfilePage') },
            ],
          },
        ],
      },
      {
        // Organizer and admin area
        element: <RequireAuth roles={['Admin', 'Organizer']} />,
        children: [
          {
            path: 'manage',
            lazy: () => import('../pages/manage/ManageLayout'),
            children: [
              { index: true, lazy: () => import('../pages/manage/Dashboard') },
              { path: 'venues', lazy: () => import('../pages/manage/VenuesPage') },
              { path: 'events/new', lazy: () => import('../pages/manage/NewEvent') },
              {
                path: 'events/:id',
                lazy: () => import('../pages/manage/EventManageLayout'),
                children: [
                  { index: true, lazy: () => import('../pages/manage/DetailsTab') },
                  { path: 'categories', lazy: () => import('../pages/manage/CategoriesTab') },
                  { path: 'registrations', lazy: () => import('../pages/manage/RegistrationsTab') },
                  { path: 'results', lazy: () => import('../pages/manage/ResultsTab') },
                ],
              },
              {
                // Admin-only section
                element: <RequireAuth roles={['Admin']} />,
                children: [{ path: 'users', lazy: () => import('../pages/manage/UsersPage') }],
              },
            ],
          },
        ],
      },
      ...(import.meta.env.DEV ? [{ path: 'design', lazy: () => import('../pages/DesignSystem') }] : []),
      { path: '*', lazy: () => import('../pages/NotFound') },
    ],
  },
]);
