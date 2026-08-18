import React, { useState, useEffect, useContext } from 'react';
import { UploadQueueContext } from '../context/UploadQueueContext';

// Helper to format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to format duration
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function UploadDetailsModal() {
  const { activeDetailsItem, setActiveDetailsItem, updateMetadata } = useContext(UploadQueueContext);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync state with selected item
  useEffect(() => {
    if (activeDetailsItem) {
      setTitle(activeDetailsItem.title || '');
      setDescription(activeDetailsItem.description || '');
    }
  }, [activeDetailsItem]);

  if (!activeDetailsItem) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMetadata(activeDetailsItem.uploadId, title, description);
      setActiveDetailsItem(null); // Close modal
    } catch (err) {
      console.error('Failed to update metadata:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}
      onClick={() => setActiveDetailsItem(null)}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '680px',
          backgroundColor: '#161616',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.8)',
          color: '#ffffff',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Video Upload Details</h2>
          <button 
            type="button" 
            onClick={() => setActiveDetailsItem(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#aaaaaa',
              fontSize: '20px',
              cursor: 'pointer',
              padding: 0
            }}
          >
            ✕
          </button>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: 0 }}>
          <div style={{
            padding: '24px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              {/* Left Side: Inputs */}
              <div style={{ flex: '1 1 350px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#aaaaaa', fontWeight: '600' }}>Title</label>
                  <input 
                    type="text" 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="Enter video title"
                    style={{
                      backgroundColor: '#222222',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', color: '#aaaaaa', fontWeight: '600' }}>Description</label>
                  <textarea 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder="Tell viewers about your video..."
                    style={{
                      backgroundColor: '#222222',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '10px 12px',
                      color: '#ffffff',
                      fontSize: '14px',
                      resize: 'none',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)'}
                  />
                </div>
              </div>

              {/* Right Side: Media Diagnostics card */}
              <div style={{ 
                flex: '1 1 200px', 
                backgroundColor: 'rgba(255, 255, 255, 0.02)', 
                border: '1px solid rgba(255, 255, 255, 0.05)', 
                borderRadius: '8px', 
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                alignSelf: 'flex-start'
              }}>
                <div style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#111', borderRadius: '4px', overflow: 'hidden' }}>
                  {activeDetailsItem.thumbnailUrl ? (
                    <img 
                      src={activeDetailsItem.thumbnailUrl} 
                      alt="Thumbnail Preview" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                      No preview
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#888' }}>File size</span>
                    <span style={{ color: '#fff', fontWeight: '500' }}>{formatBytes(activeDetailsItem.fileSize)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#888' }}>Duration</span>
                    <span style={{ color: '#fff', fontWeight: '500' }}>{formatDuration(activeDetailsItem.duration)}</span>
                  </div>
                  {activeDetailsItem.width > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#888' }}>Resolution</span>
                      <span style={{ color: '#fff', fontWeight: '500' }}>{activeDetailsItem.width}x{activeDetailsItem.height}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#888' }}>Filename</span>
                    <span 
                      style={{ color: '#fff', fontWeight: '500', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} 
                      title={activeDetailsItem.fileName}
                    >
                      {activeDetailsItem.fileName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#888' }}>Format</span>
                    <span style={{ color: '#fff', fontWeight: '500' }}>Video</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div style={{
            padding: '16px 24px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px'
          }}>
            <button 
              type="button" 
              onClick={() => setActiveDetailsItem(null)}
              disabled={saving}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                padding: '8px 16px',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
              onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={saving}
              style={{
                backgroundColor: '#3b82f6',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 20px',
                color: '#ffffff',
                fontSize: '13.5px',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.target.style.backgroundColor = '#2563eb'}
              onMouseOut={(e) => e.target.style.backgroundColor = '#3b82f6'}
            >
              {saving ? 'Saving...' : 'Save Details'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
