import React, { useEffect } from 'react';
import api from '../utils/api';

export default function AnalyticsInjector() {
  useEffect(() => {
    const injectScripts = async () => {
      try {
        const response = await api.get('/settings');
        const publicSettings = response.data;
        
        if (publicSettings && publicSettings.analytics_code) {
          // Remove previously injected tracking code to prevent duplicate scripts on page transitions
          const existingContainer = document.getElementById('global-analytics-container');
          if (existingContainer) {
            existingContainer.remove();
          }

          // Create wrapper container
          const div = document.createElement('div');
          div.id = 'global-analytics-container';
          div.style.display = 'none';
          document.body.appendChild(div);

          // Use Range to parse and execute tracking tags (GTM, Pixel, Analytics)
          const range = document.createRange();
          const fragment = range.createContextualFragment(publicSettings.analytics_code);
          div.appendChild(fragment);
        }
      } catch (err) {
        console.error('Could not inject global analytics code:', err);
      }
    };
    
    injectScripts();
  }, []);

  return null;
}
