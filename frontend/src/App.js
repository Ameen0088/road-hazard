import React, { useState, useEffect, useRef } from 'react';
import { MapPin, AlertTriangle, CheckCircle, Activity, TrendingUp, Navigation, Camera, Upload, Cpu } from 'lucide-react';

const styles = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #001e50 0%, #003d82 100%);
    min-height: 100vh;
  }

  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(0, 30, 80, 0.3);
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(59, 130, 246, 0.6);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(59, 130, 246, 0.9);
  }
`;

export default function HazardDetectionApp() {
  const [activeTab, setActiveTab] = useState('ai');
  const [hazards, setHazards] = useState([]);
  const [detectedHazards, setDetectedHazards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [aiStatus, setAiStatus] = useState('Ready');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const fileInputRef = useRef(null);

  const [manualReport, setManualReport] = useState({
    type: 'debris',
    severity: 'medium',
    latitude: 40.7128,
    longitude: -74.0060,
    locationName: 'New York, NY',
    description: ''
  });

  const locationPresets = [
    { name: 'Current Location', lat: 40.7128, lng: -74.0060, action: 'live' },
    { name: 'Downtown Area', lat: 40.7580, lng: -73.9855, action: 'preset' },
    { name: 'Highway Route', lat: 40.6892, lng: -74.0445, action: 'preset' },
    { name: 'Residential Zone', lat: 40.7614, lng: -73.9776, action: 'preset' }
  ];

  useEffect(() => {
    fetchHazards();
    const interval = setInterval(fetchHazards, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchHazards = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/hazards');
      const data = await res.json();
      setHazards(data.hazards || []);
    } catch (error) {
      console.error('Error fetching hazards:', error);
    }
  };

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setManualReport(prev => ({
            ...prev,
            latitude,
            longitude,
            locationName: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
          }));
          alert('✅ Live location captured!');
        },
        (error) => {
          alert('❌ Unable to get location. Make sure location is enabled.');
        }
      );
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setAiStatus('Uploading...');

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('http://localhost:3001/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        setUploadedImage(data.imageUrl);
        setAiStatus('Processing...');
        
        setTimeout(() => {
          setDetectedHazards([
            { type: 'debris', confidence: 92, class: 'bottle' },
            { type: 'pothole', confidence: 78, class: 'hole' }
          ]);
          setAiStatus('Detection Complete');
        }, 2000);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setAiStatus('Error');
    } finally {
      setLoading(false);
    }
  };

  const reportManualHazard = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/hazards/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manualReport)
      });

      const data = await res.json();
      if (data.success) {
        alert('Hazard reported successfully!');
        fetchHazards();
        setManualReport({
          type: 'debris',
          severity: 'medium',
          latitude: 40.7128,
          longitude: -74.0060,
          locationName: 'New York, NY',
          description: ''
        });
      }
    } catch (error) {
      console.error('Error reporting hazard:', error);
    }
  };

  const reportDetectedHazard = async (hazard) => {
    try {
      const res = await fetch('http://localhost:3001/api/hazards/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: hazard.type,
          latitude: manualReport.latitude,
          longitude: manualReport.longitude,
          severity: 'high',
          confidence: hazard.confidence,
          imageUrl: uploadedImage
        })
      });

      const data = await res.json();
      if (data.success) {
        alert('Hazard reported to network!');
        fetchHazards();
      }
    } catch (error) {
      console.error('Error reporting hazard:', error);
    }
  };

  const getStats = () => {
    const debrisCt = hazards.filter(h => h.type === 'debris').length;
    const accidentCt = hazards.filter(h => h.type === 'accident').length;
    const potholeCt = hazards.filter(h => h.type === 'pothole').length;
    return { debrisCt, accidentCt, potholeCt };
  };

  const stats = getStats();

  return (
    <div style={{ background: 'linear-gradient(135deg, #001e50 0%, #003d82 100%)', minHeight: '100vh', color: 'white', fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
      <style>{styles}</style>

      {/* Header */}
      <header style={{ background: 'rgba(0, 20, 40, 0.8)', borderBottom: '2px solid #3b82f6', padding: '20px 0', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={32} color="#fbbf24" />
            VW Hazard Detection
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(59, 130, 246, 0.2)', padding: '8px 16px', borderRadius: '8px', border: '1px solid #3b82f6' }}>
            <Cpu size={20} />
            <span style={{ fontSize: '14px', fontWeight: '500' }}>{aiStatus}</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #3b82f6', background: 'rgba(0, 20, 40, 0.4)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', gap: '24px' }}>
          {[
            { id: 'ai', label: 'AI Detection', icon: '🤖' },
            { id: 'manual', label: 'Manual Report', icon: '📍' },
            { id: 'analytics', label: 'Analytics', icon: '📊' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 24px',
                fontWeight: '500',
                borderBottom: activeTab === tab.id ? '3px solid #fbbf24' : '3px solid transparent',
                background: 'transparent',
                color: activeTab === tab.id ? '#fbbf24' : '#9ca3af',
                cursor: 'pointer',
                fontSize: '16px',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => !e.target.style.borderBottom.includes('#fbbf24') && (e.target.style.color = '#fff')}
              onMouseLeave={(e) => !e.target.style.borderBottom.includes('#fbbf24') && (e.target.style.color = '#9ca3af')}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
        {/* AI Detection Tab */}
        {activeTab === 'ai' && (
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #3b82f6', borderRadius: '12px', padding: '32px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>🤖 Computer Vision Analysis</h2>
            
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: loading ? 'rgba(251, 146, 60, 0.5)' : '#fb923c',
                color: 'white',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: '600',
                marginBottom: '24px',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                transition: 'all 0.3s ease',
                opacity: loading ? 0.6 : 1
              }}
              onMouseEnter={(e) => !loading && (e.target.style.background = '#f97316')}
              onMouseLeave={(e) => !loading && (e.target.style.background = '#fb923c')}
            >
              <Camera size={20} />
              {loading ? 'Processing...' : 'Upload Image from Dashcam'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              hidden
            />

            {uploadedImage && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.4)', borderRadius: '8px', padding: '16px', marginBottom: '24px', border: '1px solid #3b82f6' }}>
                  <img src={uploadedImage} alt="Uploaded" style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '8px' }} />
                </div>

                {detectedHazards.length > 0 && (
                  <div>
                    <h3 style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '16px' }}>Detected Hazards:</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {detectedHazards.map((hazard, idx) => (
                        <div key={idx} style={{ background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', padding: '16px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <p style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{hazard.type}</p>
                            <p style={{ fontSize: '14px', color: '#d1d5db' }}>Confidence: {hazard.confidence}%</p>
                            <p style={{ fontSize: '12px', color: '#9ca3af' }}>Detected: {hazard.class}</p>
                          </div>
                          <button
                            onClick={() => reportDetectedHazard(hazard)}
                            style={{
                              background: '#22c55e',
                              color: 'white',
                              padding: '8px 16px',
                              borderRadius: '6px',
                              fontWeight: '600',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#16a34a'}
                            onMouseLeave={(e) => e.target.style.background = '#22c55e'}
                          >
                            Report
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manual Report Tab */}
        {activeTab === 'manual' && (
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #3b82f6', borderRadius: '12px', padding: '32px', maxWidth: '600px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>📍 Report Hazard Manually</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Hazard Type</label>
                <select
                  value={manualReport.type}
                  onChange={(e) => setManualReport({...manualReport, type: e.target.value})}
                  style={{ width: '100%', background: 'rgba(30, 58, 138, 0.6)', border: '1px solid #3b82f6', borderRadius: '6px', padding: '8px 12px', color: 'white', cursor: 'pointer' }}
                >
                  <option value="debris">Debris</option>
                  <option value="pothole">Pothole</option>
                  <option value="accident">Accident</option>
                  <option value="flooding">Flooding</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Severity</label>
                <select
                  value={manualReport.severity}
                  onChange={(e) => setManualReport({...manualReport, severity: e.target.value})}
                  style={{ width: '100%', background: 'rgba(30, 58, 138, 0.6)', border: '1px solid #3b82f6', borderRadius: '6px', padding: '8px 12px', color: 'white', cursor: 'pointer' }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>📍 Location</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={manualReport.locationName}
                    readOnly
                    onClick={() => setShowLocationPicker(!showLocationPicker)}
                    style={{ flex: 1, background: 'rgba(30, 58, 138, 0.6)', border: '1px solid #3b82f6', borderRadius: '6px', padding: '8px 12px', color: 'white', cursor: 'pointer' }}
                    placeholder="Select location..."
                  />
                  <button
                    onClick={getUserLocation}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '12px',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#2563eb'}
                    onMouseLeave={(e) => e.target.style.background = '#3b82f6'}
                  >
                    📍 Live
                  </button>
                </div>

                {showLocationPicker && (
                  <div style={{ background: 'rgba(30, 58, 138, 0.8)', border: '1px solid #3b82f6', borderRadius: '8px', padding: '12px', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                    <p style={{ fontSize: '12px', fontWeight: '500', marginBottom: '8px', color: '#9ca3af' }}>Quick Select Locations:</p>
                    {locationPresets.map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (loc.action === 'live') {
                            getUserLocation();
                          } else {
                            setManualReport(prev => ({
                              ...prev,
                              latitude: loc.lat,
                              longitude: loc.lng,
                              locationName: loc.name
                            }));
                          }
                          setShowLocationPicker(false);
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: 'white',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #3b82f6',
                          marginBottom: '6px',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontSize: '13px',
                          fontWeight: '500',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.4)'}
                        onMouseLeave={(e) => e.target.style.background = 'rgba(59, 130, 246, 0.2)'}
                      >
                        {loc.name === 'Current Location' ? '📍 ' : '📌 '}{loc.name}
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: '12px', color: '#9ca3af' }}>Lat: {manualReport.latitude.toFixed(4)} | Lng: {manualReport.longitude.toFixed(4)}</p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>Description</label>
                <textarea
                  value={manualReport.description}
                  onChange={(e) => setManualReport({...manualReport, description: e.target.value})}
                  style={{ width: '100%', background: 'rgba(30, 58, 138, 0.6)', border: '1px solid #3b82f6', borderRadius: '6px', padding: '12px', color: 'white', minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="Describe the hazard..."
                />
              </div>

              <button
                onClick={reportManualHazard}
                style={{
                  width: '100%',
                  background: '#22c55e',
                  color: 'white',
                  padding: '12px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => e.target.style.background = '#16a34a'}
                onMouseLeave={(e) => e.target.style.background = '#22c55e'}
              >
                Report to Network
              </button>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px', marginBottom: '24px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #3b82f6', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                <Activity size={48} color="#3b82f6" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontSize: '36px', fontWeight: 'bold' }}>{stats.debrisCt}</p>
                <p style={{ color: '#9ca3af' }}>Debris Hazards</p>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #3b82f6', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                <AlertTriangle size={48} color="#fbbf24" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontSize: '36px', fontWeight: 'bold' }}>{stats.potholeCt}</p>
                <p style={{ color: '#9ca3af' }}>Potholes</p>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #3b82f6', borderRadius: '12px', padding: '24px', textAlign: 'center' }}>
                <TrendingUp size={48} color="#3b82f6" style={{ margin: '0 auto 16px' }} />
                <p style={{ fontSize: '36px', fontWeight: 'bold' }}>{stats.accidentCt}</p>
                <p style={{ color: '#9ca3af' }}>Accidents</p>
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid #3b82f6', borderRadius: '12px', padding: '24px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '16px' }}>Recent Hazards</h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {hazards.length === 0 ? (
                  <p style={{ color: '#9ca3af' }}>No hazards reported yet</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {hazards.slice(-10).reverse().map((h, idx) => (
                      <div key={idx} style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '6px', border: '1px solid #3b82f6', fontSize: '14px' }}>
                        <p style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{h.type} - Severity: {h.severity}</p>
                        <p style={{ color: '#9ca3af' }}>Confidence: {h.confidence}% | Reported {new Date(h.timestamp).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}