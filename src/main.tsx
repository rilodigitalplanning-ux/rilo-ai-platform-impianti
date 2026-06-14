import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { ProjectProvider } from './context/ProjectContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppProvider>
        <ProjectProvider>
          <App />
        </ProjectProvider>
      </AppProvider>
    </AuthProvider>
  </StrictMode>,
);
