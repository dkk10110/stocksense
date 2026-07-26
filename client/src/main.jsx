import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './app.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { ModalProvider } from './context/ModalContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <ModalProvider>
                <App />
              </ModalProvider>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
