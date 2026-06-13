import React, { Suspense, lazy, useContext, useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
  const debounceTimeoutRef = useRef(null);

  const isWatchPage = location.pathname.startsWith('/watch/');
  const isReelsPage = location.pathname.startsWith('/reels');

  // Sync search input with search param in URL
  useEffect(() => {
    setSearchTerm(searchParams.get('search') || '');
  }, [searchParams]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      if (location.pathname !== '/') {
        navigate(value ? `/?search=${encodeURIComponent(value)}` : '/');
      } else {
        setSearchParams(value ? { search: value } : {});
      }
    }, 300);
  };

  return (
    <>
      {isReelsPage ? (
        /* Reels Overlay Back/Home Buttons always visible fixed top-left */
        <div className="reels-navigation-overlay" style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Link to="/" className="reels-back-btn" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            border: '1px solid #2f2f2f',
            padding: '8px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
          }}>
            <span>←</span> Back
          </Link>
          <Link to="/" className="reels-home-btn" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            color: '#fff',
            border: '1px solid #2f2f2f',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '15px',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
          }} title="Home">
            🏠
          </Link>
        </div>
      ) : (
        /* Top navbar on Home/other pages, bottom navbar on Watch page */
        <header className={isWatchPage ? 'header-bottom' : 'header-top'}>
          <Link to="/" className={`logo ${isMobileSearchExpanded ? 'mobile-hidden' : ''}`}>
            <div className="logo-dot" />
            <span>UltraFast</span>
          </Link>

          {/* Search bar wrapper */}
          <div className={`header-search-container ${isMobileSearchExpanded ? 'expanded' : ''}`}>
            <input
              type="text"
              placeholder="Search videos..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="header-search-input"
            />
            {isMobileSearchExpanded && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileSearchExpanded(false);
                  setSearchTerm('');
                  setSearchParams({});
                  if (location.pathname !== '/') {
                    navigate('/');
                  }
                }}
                className="header-search-close-btn"
              >
                ✕
              </button>
            )}
          </div>

          <nav className={`nav-links ${isMobileSearchExpanded ? 'mobile-hidden' : ''}`}>
            {/* Mobile Search Icon trigger */}
            <button
              type="button"
              className="mobile-search-trigger"
              onClick={() => setIsMobileSearchExpanded(true)}
            >
              🔍
            </button>

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
      )}

      <main className={isReelsPage ? 'main-reels' : (isWatchPage ? 'main-bottom' : 'main-top')} style={{ padding: '0 0' }}>
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

      {!isReelsPage && (
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
      )}
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
