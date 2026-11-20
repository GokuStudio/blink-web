import { createBrowserRouter, Navigate } from 'react-router-dom';
import { DemoPage } from '@/pages/DemoPage';
import { DevicePage } from '@/pages/DevicePage';
import { InsightsPage } from '@/pages/InsightsPage';
import { JoinPage } from '@/pages/JoinPage';

export const router = createBrowserRouter([
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
    path: '*',
    element: <Navigate to="/demo" replace />,
  },
]);
