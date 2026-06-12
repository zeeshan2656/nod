import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import Toast from '../components/Toast';

export default function AdminSettings() {
  const { user, loading: authLoading, isAdmin } = useContext(AuthContext);
  const navigate = useNavigate();

  // Settings states
  const [siteName, setSiteName] = useState('');
  const [analyticsCode, setAnalyticsCode] = useState('');
  
  // Ads states
  const [ads, setAds] = useState([]);
  const [editingAd, setEditingAd] = useState(null); // The ad placement currently being edited
  const [editingAdCode, setEditingAdCode] = useState('');
  const [editingAdActive, setEditingAdActive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingAd, setSavingAd] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });

  // Admin guard redirect
  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate('/login');
    }
  }, [user, authLoading, isAdmin, navigate]);

  // Load settings and ad placements
  useEffect(() => {
    if (user && isAdmin) {
      loadSettingsData();
    }
  }, [user, isAdmin]);

  const loadSettingsData = async () => {
    setLoading(true);
    try {
      const settingsRes = await api.get('/settings/admin');
      setSiteName(settingsRes.data.site_name || '');
      setAnalyticsCode(settingsRes.data.analytics_code || '');

      const adsRes = await api.get('/ads/admin');
      setAds(adsRes.data || []);
    } catch (err) {
      console.error('Failed to load admin settings details:', err);
      setToast({ message: 'Error loading configurations.', type: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.put('/settings', {
        site_name: siteName.trim(),
        analytics_code: analyticsCode.trim()
      });
      setToast({ message: 'Global settings saved successfully.', type: 'success' });
    } catch (err) {
      setToast({ message: 'Save settings failed.', type: 'danger' });
    } finally {
      setSavingSettings(false);
    }
  };

  const startEditAd = (ad) => {
    setEditingAd(ad);
    setEditingAdCode(ad.code);
    setEditingAdActive(ad.is_active === 1);
  };

  const handleSaveAd = async (e) => {
    e.preventDefault();
    if (!editingAd) return;

    setSavingAd(true);
    try {
      await api.put(`/ads/${editingAd.placement}`, {
        name: editingAd.name,
        code: editingAdCode,
        is_active: editingAdActive ? 1 : 0
      });

      // Update local state list
      setAds(prev => prev.map(ad => {
        if (ad.placement === editingAd.placement) {
          return { ...ad, code: editingAdCode, is_active: editingAdActive ? 1 : 0 };
        }
        return ad;
      }));

      setToast({ message: `Ad placement [${editingAd.placement}] updated.`, type: 'success' });
      setEditingAd(null);
    } catch (err) {
      console.error('Failed to save ad placement:', err);
      setToast({ message: 'Failed to update ad placement.', type: 'danger' });
    } finally {
      setSavingAd(false);
    }
  };

  if (authLoading || loading) {
    return <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-muted)' }}>Loading Settings Panel...</div>;
  }

  return (
    <div className="admin-container">
      {toast.message && <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'success' })} />}

      <div className="admin-title-row">
        <h1 style={{ fontSize: '20px', fontWeight: '700' }}>Platform Configuration & Ads</h1>
        <Link to="/admin" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '13px' }}>Dashboard</Link>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Global Settings Section */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '2px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            Global Configurations
          </h2>
          <form onSubmit={handleSaveSettings}>
            <div className="form-group">
              <label className="form-label">Platform Name</label>
              <input
                type="text"
                className="form-input"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g. UltraFast Video & Reels"
                disabled={savingSettings}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Analytics and Global Script Header Injection</label>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Paste GTM tracking script, Google Analytics Global Tag, Facebook Pixel, or other custom site tracking tags here. It will inject globally.
              </span>
              <textarea
                className="form-input"
                style={{ minHeight: '120px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                value={analyticsCode}
                onChange={(e) => setAnalyticsCode(e.target.value)}
                placeholder="<!-- Paste analytics and tracking tags here -->"
                disabled={savingSettings}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ height: '38px', marginTop: '10px' }} disabled={savingSettings}>
              {savingSettings ? 'Saving Settings...' : 'Save Settings'}
            </button>
          </form>
        </div>

        {/* Ad Placements Grid */}
        <div style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-color)', padding: '20px', borderRadius: '2px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            Ad Placements Configuration
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Table of placements */}
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Placement Identifier</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.map((ad) => (
                    <tr key={ad.id} style={{ backgroundColor: editingAd?.placement === ad.placement ? 'rgba(33, 150, 243, 0.05)' : 'transparent' }}>
                      <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{ad.placement}</td>
                      <td>{ad.name}</td>
                      <td>
                        <span style={{ 
                          fontSize: '10px', 
                          padding: '1px 5px', 
                          borderRadius: '2px',
                          backgroundColor: ad.is_active === 1 ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
                          color: ad.is_active === 1 ? 'var(--success)' : 'var(--danger)'
                        }}>
                          {ad.is_active === 1 ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '11px' }} onClick={() => startEditAd(ad)}>
                          Edit Code
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Editing form for selected ad */}
            {editingAd && (
              <div style={{ marginTop: '10px', border: '1px solid var(--accent)', padding: '16px', background: 'rgba(33, 150, 243, 0.02)' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '12px', color: 'var(--accent)' }}>
                  Editing Ad Slot: {editingAd.name} ({editingAd.placement})
                </h3>
                <form onSubmit={handleSaveAd}>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
                      <input
                        type="checkbox"
                        checked={editingAdActive}
                        onChange={(e) => setEditingAdActive(e.target.checked)}
                      />
                      Enable ad placement (Make Active)
                    </label>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ad Integration Code (HTML, JS, Google AdSense, etc.)</label>
                    <textarea
                      className="form-input"
                      style={{ minHeight: '150px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                      value={editingAdCode}
                      onChange={(e) => setEditingAdCode(e.target.value)}
                      placeholder="<!-- Paste Google AdSense script, script tag, or custom HTML/iframe banner codes here -->"
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} disabled={savingAd}>
                      {savingAd ? 'Saving Placement...' : 'Save Ad Slot'}
                    </button>
                    <button type="button" className="btn btn-secondary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => setEditingAd(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
}
