/**
 * @author eLeet Coderz (Team 3)
 * @description Starts the React app: loads the global styles, then wraps every screen in the router, the
 *   signed-in-user context and the theme / color-blindness provider.
 * @traces SE-FR-14, SE-FR-15, UC-09
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { ThemeProvider } from './app/ThemeProvider';
import { AuthProvider } from './features/auth/AuthProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
