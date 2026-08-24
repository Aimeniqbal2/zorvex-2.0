import React, { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from './auth/authStore';

const App: React.FC = () => {
  const { initialize } = useAuthStore();

  useEffect(() => {
    // Initialize authentication state from localStorage on app load
    initialize();
  }, [initialize]);

  return <RouterProvider router={router} />;
};

export default App;
