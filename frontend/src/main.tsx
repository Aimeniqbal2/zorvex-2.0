import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/variables.css';
import './styles/themes.css';
import './styles/globals.css';
import './styles/desktop.css';
import './styles/app-launcher.css';
import './styles/workspace.css';
import './styles/ui.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
