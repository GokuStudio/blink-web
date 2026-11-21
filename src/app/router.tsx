import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DemoPage } from '@/pages/DemoPage';
import { DevicePage } from '@/pages/DevicePage';
import { InsightsPage } from '@/pages/InsightsPage';
import { JoinPage } from '@/pages/JoinPage';
import { DevHarnessPage } from '@/pages/DevHarnessPage';
import { HeyBlinkPage } from '@/pages/HeyBlinkPage';

const routes = [
  {
    path: '/',
    element: <Navigate to="/demo" replace />,
  },
  {
    path: '/demo',
    element: <DemoPage />,
  },
  {
    path: '/device',
    element: <DevicePage />,
  },
  {
    path: '/insights',
    element: <InsightsPage />,
  },
  {
    path: '/join/:roomCode',
    element: <JoinPage />,
  },
  {
    path: '/hey-blink',
    element: <HeyBlinkPage />,
  },
  ...(import.meta.env.DEV
    ? [
        {
          path: '/dev-harness',
          element: <DevHarnessPage />,
        },
      ]
    : []),
  {
    path: '*',
    element: <Navigate to="/demo" replace />,
  },
];

export const router = createBrowserRouter(routes);
