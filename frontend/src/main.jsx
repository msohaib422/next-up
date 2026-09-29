import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { ThemeProvider } from './context/ThemeContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <App />
          </NotificationProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              // Success toasts are short confirmations; error toasts carry a
              // message worth reading a little longer. Per-type options win
              // over the shared `duration` below.
              success: { duration: 3000 },
              error: { duration: 5000 },
              duration: 3000,
              style: {
                background: 'var(--toast-bg, #fff)',
                color: 'var(--toast-color, #1f2937)',
                // The library caps toasts at 350px, which is wider than a small
                // phone. Keeping them inside the viewport stops a toast being
                // clipped at the edge of a narrow screen.
                maxWidth: 'calc(100vw - 24px)',
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
)
