import React, { useEffect, useState } from 'react';
import api from '../utils/api';

export default function AdPlacement({ placement, type, code }) {
  const [adCode, setAdCode] = useState(code || null);

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

  const handleRef = (el) => {
    if (el && adCode) {
      if (el._lastInjectedCode === adCode) return;
      el.innerHTML = '';
      try {
        const range = document.createRange();
        const fragment = range.createContextualFragment(adCode);
        el.appendChild(fragment);
        el._lastInjectedCode = adCode;
      } catch (err) {
        console.error(`Failed executing scripts for ad placement [${placement}]:`, err);
        el.innerHTML = adCode;
        el._lastInjectedCode = adCode;
      }
    }
  };

  if (!adCode) {
    return null;
  }

  return (
    <div className="ad-container-filled" style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div ref={handleRef} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />
    </div>
  );
}
