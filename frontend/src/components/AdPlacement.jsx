import React, { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

export default function AdPlacement({ placement, type }) {
  const [adCode, setAdCode] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const fetchAds = async () => {
      try {
        const response = await api.get('/ads');
        const activeAds = response.data;
        if (activeAds && activeAds[placement]) {
          setAdCode(activeAds[placement]);
        }
      } catch (err) {
        console.error(`Error loading ad placement [${placement}]:`, err);
      }
    };
    fetchAds();
  }, [placement]);

  useEffect(() => {
    if (adCode && containerRef.current) {
      // Clear previous container content
      containerRef.current.innerHTML = '';
      
      // Use Contextual Fragment to force rendering & execution of embedded JS <script> tags (like Google AdSense)
      try {
        const range = document.createRange();
        const fragment = range.createContextualFragment(adCode);
        containerRef.current.appendChild(fragment);
      } catch (err) {
        console.error(`Failed executing scripts for ad placement [${placement}]:`, err);
        containerRef.current.innerHTML = adCode; // Fallback to raw injection
      }
    }
  }, [adCode]);

  if (!adCode) {
    if (type === 'card') {
      return (
        <div className="ad-card-placeholder" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%', gap: '8px' }}>
          <span className="ad-label" style={{ fontSize: '9px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '1px' }}>Advertisement</span>
          <div style={{ color: '#444', fontSize: '12px', fontWeight: '500' }}>Ad Partner Slot</div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="ad-container">
      <span className="ad-label">Advertisement</span>
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
}
