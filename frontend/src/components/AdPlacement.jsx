import React, { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

export default function AdPlacement({ placement, type, code }) {
  const [adCode, setAdCode] = useState(code || null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (code !== undefined) {
      setAdCode(code);
      return;
    }
    const fetchAds = async () => {
      try {
        const response = await api.get('/ads');
        const activeAds = response.data;
        if (activeAds && activeAds[placement]) {
          setAdCode(activeAds[placement]);
        } else {
          setAdCode(null);
        }
      } catch (err) {
        console.error(`Error loading ad placement [${placement}]:`, err);
      }
    };
    fetchAds();
  }, [placement, code]);

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
    return null;
  }

  return (
    <div className="ad-container-filled" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    </div>
  );
}
