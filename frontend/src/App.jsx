import React, { Suspense, lazy, useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import AnalyticsInjector from './components/AnalyticsInjector';

// Lazy-loaded pages (Code-splitting to reduce initial bundle footprint, boosting PageSpeed score)
const Home = lazy(() => import('./pages/Home'));
const Watch = lazy(() => import('./pages/Watch'));
const Reels = lazy(() => import('./pages/Reels'));
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUpload = lazy(() => import('./pages/AdminUpload'));
const AdminEditVideo = lazy(() => import('./pages/AdminEditVideo'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));

// Header and Shell Navigation
function AppLayout() {
  const { user, logout, isAdmin } = useContext(AuthContext);

  return (
    <>
      <header>
        <Link to="/" className="logo">
          <div className="logo-dot" />
          <span>UltraFast</span>
        </Link>

        <nav className="nav-links">
          <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Home
          </NavLink>
          <NavLink to="/reels" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Reels
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Admin
            </NavLink>
          )}
          {user ? (
            <button onClick={logout} className="nav-item" style={{ cursor: 'pointer', border: 'none', background: 'none' }}>
              Sign Out
            </button>
          ) : (
            <NavLink to="/login" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              Sign In
            </NavLink>
          )}
        </nav>
      </header>

      <main style={{ padding: '0 0' }}>
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/watch/:id" element={<Watch />} />
            <Route path="/reels" element={<Reels />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/upload" element={<AdminUpload />} />
            <Route path="/admin/edit-video/:id" element={<AdminEditVideo />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <footer style={{ 
        padding: '16px', 
        borderTop: '1px solid var(--border-color)', 
        textAlign: 'center', 
        fontSize: '11px', 
        color: 'var(--text-muted)',
        marginTop: 'auto' 
      }}>
        © {new Date().getFullYear()} UltraFast Video Platform. Designed for performance.
      </footer>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AnalyticsInjector />
        <AppLayout />
      </Router>
    </AuthProvider>
  );
}
