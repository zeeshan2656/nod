import React, { Suspense, lazy, useContext, useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate, useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import AnalyticsInjector from './components/AnalyticsInjector';
import AdPlacement from './components/AdPlacement';

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
      {/* Mobile Slide-out Sidebar Menu */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '280px',
        height: '100%',
        backgroundColor: 'var(--bg-color, #0f0f0f)',
        borderRight: '1px solid var(--border-color, #2f2f2f)',
        zIndex: 10000,
        transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(0,0,0,0.8)',
        padding: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>Menu</span>
          <button 
            type="button" 
            onClick={() => setIsSidebarOpen(false)}
            style={{ fontSize: '22px', color: 'var(--text-muted, #aaa)', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            ✕
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <NavLink 
            to="/" 
            onClick={() => setIsSidebarOpen(false)} 
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            style={{ fontSize: '15px', fontWeight: '600', padding: '10px 14px', borderRadius: '4px', display: 'block', color: 'var(--text-color, #fff)' }}
          >
            Home
          </NavLink>
          <NavLink 
            to="/reels" 
            onClick={() => setIsSidebarOpen(false)} 
            className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
            style={{ fontSize: '15px', fontWeight: '600', padding: '10px 14px', borderRadius: '4px', display: 'block', color: 'var(--text-color, #fff)' }}
          >
            Reels
          </NavLink>
          <NavLink 
            to="/" 
            onClick={() => setIsSidebarOpen(false)} 
            className="sidebar-nav-item"
            style={{ fontSize: '15px', fontWeight: '600', padding: '10px 14px', borderRadius: '4px', display: 'block', color: 'var(--text-muted, #aaa)' }}
          >
            Categories
          </NavLink>
          <NavLink 
            to="/" 
            onClick={() => setIsSidebarOpen(false)} 
            className="sidebar-nav-item"
            style={{ fontSize: '15px', fontWeight: '600', padding: '10px 14px', borderRadius: '4px', display: 'block', color: 'var(--text-muted, #aaa)' }}
          >
            Trending
          </NavLink>
        </nav>
      </div>

      {/* Sidebar Backdrop Overlay */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(2px)',
            zIndex: 9999
          }}
        />
      )}
    
      {isReelsPage ? (
        /* Reels Overlay Back Button always visible fixed top-left */
        <div className="reels-navigation-overlay" style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          zIndex: 2000
        }}>
          <Link to="/" className="reels-back-btn" style={{
            color: '#fff',
            fontSize: '28px',
            cursor: 'pointer',
            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            display: 'inline-block',
            lineHeight: 1
          }}>
            ←
          </Link>
        </div>
      ) : (
        /* Top navbar on Home/other pages, bottom navbar on Watch page */
        <header className={isWatchPage ? 'header-bottom' : 'header-top'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
          
          {/* Mobile Hamburger Toggle Menu Button */}
          {!isMobileSearchExpanded && (
            <button 
              type="button" 
              className="mobile-menu-toggle"
              onClick={() => setIsSidebarOpen(true)}
              style={{
                fontSize: '22px',
                color: '#fff',
                cursor: 'pointer',
                display: 'none', // Block on mobile in CSS
                padding: '6px 12px',
                background: 'none',
                border: 'none',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          )}

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
            {/* Reels Icon on Mobile Landing Page */}
            {location.pathname === '/' && (
              <Link 
                to="/reels" 
                className="mobile-reels-trigger" 
                style={{ display: 'none', color: '#fff' }} // Block on mobile in CSS
                title="Watch Reels"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                  <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
                  <line x1="7" y1="2" x2="7" y2="22"></line>
                  <line x1="17" y1="2" x2="17" y2="22"></line>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <line x1="2" y1="7" x2="7" y2="7"></line>
                  <line x1="2" y1="17" x2="7" y2="17"></line>
                  <line x1="17" y1="17" x2="22" y2="17"></line>
                  <line x1="17" y1="7" x2="22" y2="7"></line>
                </svg>
              </Link>
            )}

            {/* Mobile Search Icon trigger */}
            <button
              type="button"
              className="mobile-search-trigger"
              onClick={() => setIsMobileSearchExpanded(true)}
              style={{ color: '#fff' }}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
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
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div className="footer-ad-desktop" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <AdPlacement placement="footer_desktop" />
          </div>
          <div className="footer-ad-mobile" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <AdPlacement placement="footer_mobile" />
          </div>
          <div>
            © {new Date().getFullYear()} UltraFast Video Platform. Designed for performance.
          </div>
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
