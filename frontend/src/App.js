import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { AlertTriangle, Navigation, Upload, Camera, Map, Bell, CheckCircle } from 'lucide-react';
import axios from 'axios';
import io from 'socket.io-client';
import { loadModels, detectHazards, drawDetections, isModelLoaded, applyPrivacyProtection, analyzeVideoFrames } from './aiDetection';
import 'leaflet/dist/leaflet.css';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [activeTab, setActiveTab] = useState('detect');
  const [currentLocation, setCurrentLocation] = useState(null);
  const [socket, setSocket] = useState(null);
  const [hazards, setHazards] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
  
  // Image/Video Upload States
  const [uploadedImage, setUploadedImage] = useState(null);
  const [uploadedVideo, setUploadedVideo] = useState(null);
  const [detectedHazards, setDetectedHazards] = useState([]);
  const [processedImage, setProcessedImage] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Video Analysis States
  const [videoAnalyzing, setVideoAnalyzing] = useState(false);
  const [videoFramesWithHazards, setVideoFramesWithHazards] = useState([]);
  const [selectedFrame, setSelectedFrame] = useState(null);
  
  // Manual Report States
  const [formData, setFormData] = useState({
    type: 'pothole',
    severity: 'medium',
    latitude: '',
    longitude: ''
  });
  
  // Resolve Hazard States
  const [nearbyHazardsToResolve, setNearbyHazardsToResolve] = useState([]);
  const [resolvingHazard, setResolvingHazard] = useState(null);
  
  // Refs
  const imageRef = useRef();
  const canvasRef = useRef();
  const fileInputRef = useRef();
  const videoRef = useRef();
  const resolveFileInputRef = useRef();

  // Load AI models on mount
  useEffect(() => {
    loadModels().then(loaded => {
      setAiModelsLoaded(loaded);
      if (loaded) {
        console.log('✅ All AI models ready!');
      }
    });
  }, []);

  // Get user location and setup WebSocket
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(location);
          console.log('📍 Current location:', location);
        },
        (error) => {
          console.error('Location error:', error);
          alert('Please enable location access for proximity alerts');
        }
      );
    }

    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('🔌 Connected to server');
    });

    newSocket.on('hazard_alert', (hazard) => {
      console.log('🚨 New hazard alert:', hazard);
      setHazards(prev => [hazard, ...prev]);
      addNotification(`New ${hazard.type} reported nearby!`);
    });

    newSocket.on('proximity_alert', (data) => {
      console.log('⚠️ Proximity alert:', data);
      addNotification(`DANGER! ${data.hazard.type.toUpperCase()} ${data.distance}km ahead!`);
      
      if (Notification.permission === 'granted') {
        new Notification('⚠️ Road Hazard Alert', {
          body: `${data.hazard.type.toUpperCase()} detected ${data.distance}km ahead!`,
          icon: '/vw-logo.png'
        });
      }
    });

    newSocket.on('nearby_hazards', (data) => {
      console.log('📍 Nearby hazards:', data.hazards);
      setNearbyHazardsToResolve(data.hazards);
      
      if (data.hazards.length > 0) {
        const hazardList = data.hazards.map(h => 
          `• ${h.type.toUpperCase()} (${h.distance.toFixed(2)}km away - ${h.severity})`
        ).join('\n');
        
        alert(`📍 ${data.hazards.length} ACTIVE HAZARDS ON YOUR ROUTE:\n\n${hazardList}\n\nStay alert! You can resolve them from the Live Map tab.`);
      }
    });

    newSocket.on('hazard_resolved', (data) => {
      console.log('✅ Hazard resolved:', data.hazardId);
      setHazards(prev => prev.map(h => 
        h.id === data.hazardId ? { ...h, status: 'resolved' } : h
      ));
      addNotification(`Hazard ${data.hazardId} has been resolved!`);
    });

    return () => newSocket.close();
  }, []);

  // Register location with server
  useEffect(() => {
    if (socket && currentLocation) {
      socket.emit('register_location', {
        userId: 'vw-user-' + Date.now(),
        latitude: currentLocation.lat,
        longitude: currentLocation.lng
      });

      const locationInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition((position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(newLocation);
          socket.emit('update_location', {
            userId: 'vw-user-' + Date.now(),
            latitude: newLocation.lat,
            longitude: newLocation.lng
          });
        });
      }, 10000);

      return () => clearInterval(locationInterval);
    }
  }, [socket, currentLocation]);

  // Request notification permission
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const addNotification = (message) => {
    const notification = {
      id: Date.now(),
      message,
      timestamp: new Date()
    };
    setNotifications(prev => [notification, ...prev.slice(0, 9)]);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileType = file.type.startsWith('video/') ? 'video' : 'image';

    const reader = new FileReader();
    reader.onload = (event) => {
      if (fileType === 'video') {
        setUploadedVideo(event.target.result);
        setUploadedImage(null);
        setDetectedHazards([]);
        setProcessedImage(null);
        setVideoFramesWithHazards([]);
        setSelectedFrame(null);
      } else {
        setUploadedImage(event.target.result);
        setUploadedVideo(null);
        setDetectedHazards([]);
        setProcessedImage(null);
        setVideoFramesWithHazards([]);
        setSelectedFrame(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async () => {
    if (!imageRef.current || !isModelLoaded()) {
      alert('AI model is still loading. Please wait...');
      return;
    }

    setAnalyzing(true);
    try {
      console.log('🎯 Starting image analysis...');
      
      const hazards = await detectHazards(imageRef.current);
      setDetectedHazards(hazards);

      if (hazards.length > 0) {
        const withDetections = drawDetections(canvasRef.current, imageRef.current, hazards);
        
        const privacyCanvas = document.createElement('canvas');
        const privacyImage = new Image();
        privacyImage.src = withDetections;
        
        await new Promise((resolve) => {
          privacyImage.onload = async () => {
            const protectedImage = await applyPrivacyProtection(privacyCanvas, privacyImage);
            if (protectedImage) {
              setProcessedImage(protectedImage);
              console.log('✅ Privacy protection applied successfully');
            } else {
              setProcessedImage(withDetections);
              console.log('⚠️ Using image without privacy protection');
            }
            resolve();
          };
        });

        const topHazard = hazards[0];
        setFormData(prev => ({
          ...prev,
          type: topHazard.type,
          severity: topHazard.severity
        }));
        
        console.log('✅ Analysis complete! Found', hazards.length, 'hazards');
      } else {
        console.log('⚠️ No hazards detected');
        alert('No hazards detected. Try a different image or report manually.');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert('Error analyzing image: ' + error.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeVideo = async () => {
    if (!videoRef.current || !isModelLoaded()) {
      alert('AI model is still loading. Please wait...');
      return;
    }

    setVideoAnalyzing(true);
    try {
      console.log('🎥 Starting video analysis...');
      
      const framesWithHazards = await analyzeVideoFrames(videoRef.current, 2);
      
      setVideoFramesWithHazards(framesWithHazards);
      
      if (framesWithHazards.length > 0) {
        alert(`✅ Found hazards in ${framesWithHazards.length} video frames!`);
        
        setSelectedFrame(framesWithHazards[0]);
        setDetectedHazards(framesWithHazards[0].hazards);
        
        const topHazard = framesWithHazards[0].hazards[0];
        setFormData(prev => ({
          ...prev,
          type: topHazard.type,
          severity: topHazard.severity
        }));
      } else {
        alert('No hazards detected in video. Try a different video or report manually.');
      }
    } catch (error) {
      console.error('Video analysis error:', error);
      alert('Error analyzing video: ' + error.message);
    } finally {
      setVideoAnalyzing(false);
    }
  };

  const useMyLocation = () => {
    if (currentLocation) {
      setFormData(prev => ({
        ...prev,
        latitude: currentLocation.lat.toFixed(6),
        longitude: currentLocation.lng.toFixed(6)
      }));
    } else {
      alert('Location not available. Please enable location services.');
    }
  };

  const reportHazard = async () => {
    if (!formData.latitude || !formData.longitude) {
      alert('Please provide location (use "Use My Location" button)');
      return;
    }

    try {
      let imageUrl = null;

      if (processedImage) {
        const blob = await fetch(processedImage).then(r => r.blob());
        const formDataUpload = new FormData();
        formDataUpload.append('image', blob, 'hazard.jpg');

        const uploadRes = await axios.post(`${API_URL}/api/upload`, formDataUpload);
        imageUrl = uploadRes.data.fileUrl;
      }

      const response = await axios.post(`${API_URL}/api/hazards/report`, {
        type: formData.type,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        severity: formData.severity,
        deviceId: 'vw-ai-app',
        confidence: detectedHazards.length > 0 ? detectedHazards[0].confidence : 100,
        imageUrl
      });

      if (response.data.duplicate) {
        alert('⚠️ Similar hazard already reported nearby. Thank you!');
      } else {
        alert('✅ Hazard reported successfully!');
        setUploadedImage(null);
        setUploadedVideo(null);
        setDetectedHazards([]);
        setProcessedImage(null);
        setVideoFramesWithHazards([]);
        setSelectedFrame(null);
      }
    } catch (error) {
      console.error('Error reporting hazard:', error);
      alert('Failed to report hazard. Please try again.');
    }
  };

  const handleResolveHazard = async (hazardId) => {
    if (!resolveFileInputRef.current.files[0]) {
      alert('Please upload a photo showing the hazard is cleared!');
      return;
    }

    if (!currentLocation) {
      alert('Location not available');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('image', resolveFileInputRef.current.files[0]);

      const uploadRes = await axios.post(`${API_URL}/api/upload`, formData);
      const imageUrl = uploadRes.data.fileUrl;

      const response = await axios.post(`${API_URL}/api/hazards/resolve`, {
        hazardId,
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        deviceId: 'vw-ai-app',
        imageUrl
      });

      if (response.data.success) {
        alert('✅ Hazard marked as resolved! Thank you for keeping roads safe.');
        setResolvingHazard(null);
        setHazards(prev => prev.map(h => 
          h.id === hazardId ? { ...h, status: 'resolved' } : h
        ));
        setNearbyHazardsToResolve(prev => prev.filter(h => h.id !== hazardId));
      } else {
        alert(response.data.message);
      }
    } catch (error) {
      console.error('Error resolving hazard:', error);
      alert('Failed to resolve hazard');
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <img src="/vw-logo.png" alt="VW" />
          <h1>VW Hazard Detection AI</h1>
        </div>
        <div className="status">
          <div className={`status-indicator ${aiModelsLoaded ? 'active' : 'loading'}`}>
            {aiModelsLoaded ? '✅ AI Active' : '⏳ Loading AI...'}
          </div>
          <div className={`status-indicator ${currentLocation ? 'active' : 'inactive'}`}>
            {currentLocation ? '📍 GPS Active' : '📍 GPS Inactive'}
          </div>
        </div>
      </header>

       <nav className="tabs">
  <button 
    className={activeTab === 'detect' ? 'active' : ''} 
    onClick={() => setActiveTab('detect')}
  >
    <Camera size={20} />
    AI Detection
  </button>
  <button 
    className={activeTab === 'manual' ? 'active' : ''} 
    onClick={() => setActiveTab('manual')}
  >
    <Upload size={20} />
    Manual Report
  </button>
  <button 
    className={activeTab === 'map' ? 'active' : ''} 
    onClick={() => setActiveTab('map')}
  >
    <Map size={20} />
    Live Map
  </button>
  <button 
    className={activeTab === 'alerts' ? 'active' : ''} 
    onClick={() => setActiveTab('alerts')}
  >
    <Bell size={20} />
    Alerts ({notifications.length})
  </button>
</nav>


      <main className="content">
        {activeTab === 'detect' && (
          <div className="detect-view">
            <div className="upload-section">
              <h2>📸 Upload Dashcam Footage</h2>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*,video/*"
                style={{ display: 'none' }}
              />
              
              <button 
                className="upload-btn"
                onClick={() => fileInputRef.current.click()}
                disabled={!aiModelsLoaded}
              >
                <Upload size={20} />
                {aiModelsLoaded ? 'Upload Image/Video from Dashcam' : 'Loading AI Models...'}
              </button>

              {uploadedImage && (
                <div className="image-preview">
                  <h3>Uploaded Image</h3>
                  <img 
                    ref={imageRef}
                    src={uploadedImage} 
                    alt="Uploaded" 
                    onLoad={analyzeImage}
                    style={{ maxWidth: '100%', borderRadius: '10px' }}
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
              )}

              {uploadedVideo && (
                <div className="image-preview">
                  <h3>📹 Uploaded Video</h3>
                  <video 
                    ref={videoRef}
                    src={uploadedVideo}
                    controls
                    style={{ maxWidth: '100%', borderRadius: '10px' }}
                    onLoadedMetadata={analyzeVideo}
                  />
                  <p className="small">Video will be analyzed frame-by-frame for hazards</p>
                </div>
              )}

              {(analyzing || videoAnalyzing) && (
                <div className="analyzing">
                  <div className="spinner"></div>
                  <p>{videoAnalyzing ? '🎥 Analyzing video frames...' : '🤖 AI analyzing image...'}</p>
                  <p className="small">{videoAnalyzing ? 'Processing every 2 seconds of footage...' : 'Detecting hazards with TensorFlow.js...'}</p>
                </div>
              )}

              {videoFramesWithHazards.length > 0 && (
                <div className="detection-results">
                  <h3>🎬 Video Analysis Results ({videoFramesWithHazards.length} frames with hazards)</h3>
                  
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: '15px',
                    marginTop: '20px'
                  }}>
                    {videoFramesWithHazards.map((frame, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setSelectedFrame(frame);
                          setDetectedHazards(frame.hazards);
                        }}
                        style={{
                          cursor: 'pointer',
                          border: selectedFrame === frame ? '3px solid #00d4ff' : '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '12px',
                          padding: '10px',
                          background: selectedFrame === frame ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)',
                          transition: 'all 0.3s ease'
                        }}
                      >
                        <img 
                          src={frame.frameUrl} 
                          alt={`Frame at ${frame.time}s`}
                          style={{ width: '100%', borderRadius: '8px' }}
                        />
                        <p style={{ fontSize: '12px', marginTop: '8px', textAlign: 'center' }}>
                          {frame.time}s - {frame.hazards.length} hazard(s)
                        </p>
                      </div>
                    ))}
                  </div>
                  
                  {selectedFrame && (
                    <div style={{ marginTop: '20px', padding: '20px', background: 'rgba(0,212,255,0.1)', borderRadius: '12px' }}>
                      <h4 style={{ color: '#00d4ff', marginBottom: '15px' }}>
                        Selected Frame: {selectedFrame.time}s
                      </h4>
                      <div className="hazards-grid">
                        {selectedFrame.hazards.map((hazard, idx) => (
                          <div key={idx} className="detected-hazard">
                            <AlertTriangle size={24} color="#dc3545" />
                            <div>
                              <strong>{hazard.type.toUpperCase()}</strong>
                              <p>Confidence: {hazard.confidence}%</p>
                              <p className="small">Detected: {hazard.class}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {processedImage && !uploadedVideo && (
                <div className="detection-results">
                  <h3>🔍 AI Detection Results</h3>
                  <img 
                    src={processedImage} 
                    alt="Processed" 
                    style={{ maxWidth: '100%', borderRadius: '10px', marginTop: '10px' }}
                  />
                  
                  <div className="hazards-grid">
                    {detectedHazards.map((hazard, idx) => (
                      <div key={idx} className="detected-hazard">
                        <AlertTriangle size={24} color="#dc3545" />
                        <div>
                          <strong>{hazard.type.toUpperCase()}</strong>
                          <p>Confidence: {hazard.confidence}%</p>
                          <p className="small">Detected: {hazard.class}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(detectedHazards.length > 0 || uploadedImage || uploadedVideo) && (
              <div className="report-section">
                <h2>📍 Report Hazard Location</h2>
                
                <div className="form-group">
                  <label>Hazard Type</label>
                  <select 
                    value={formData.type} 
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                  >
                    <option value="pothole">Pothole</option>
                    <option value="accident">Accident</option>
                    <option value="debris">Road Debris</option>
                    <option value="animal">Animal on Road</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Severity</label>
                  <select 
                    value={formData.severity} 
                    onChange={(e) => setFormData({...formData, severity: e.target.value})}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <button className="location-btn" onClick={useMyLocation}>
                  <Navigation size={20} />
                  Use My Current Location
                </button>

                <div className="location-display">
                  <p>Latitude: {formData.latitude || 'Not set'}</p>
                  <p>Longitude: {formData.longitude || 'Not set'}</p>
                </div>

                <button 
                  className="report-btn"
                  onClick={reportHazard}
                  disabled={!formData.latitude || !formData.longitude}
                >
                  <AlertTriangle size={20} />
                  Report Hazard to Network
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'map' && currentLocation && (
          <div className="map-view">
            <MapContainer 
              center={[currentLocation.lat, currentLocation.lng]} 
              zoom={13} 
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; OpenStreetMap contributors'
              />
              
              <Marker position={[currentLocation.lat, currentLocation.lng]}>
                <Popup>📍 You are here</Popup>
              </Marker>

              <Circle
                center={[currentLocation.lat, currentLocation.lng]}
                radius={1000}
                pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
              />

              {hazards.filter(h => h.status === 'active').map((hazard) => (
                <Marker 
                  key={hazard.id}
                  position={[hazard.latitude, hazard.longitude]}
                >
                  <Popup>
                    <strong>{hazard.type.toUpperCase()}</strong>
                    <p>Severity: {hazard.severity}</p>
                    <p>Reported: {new Date(hazard.timestamp).toLocaleString()}</p>
                    {hazard.imageUrl && (
                      <img src={API_URL + hazard.imageUrl} alt="Hazard" style={{width: '100%', marginTop: '10px'}} />
                    )}
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
            
            {nearbyHazardsToResolve.length > 0 && (
              <div className="resolve-section">
                <h3>🎯 Nearby Hazards You Can Resolve ({nearbyHazardsToResolve.length})</h3>
                {nearbyHazardsToResolve.map(hazard => (
                  <div key={hazard.id} style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '15px',
                    borderRadius: '12px',
                    marginBottom: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}>
                    <strong>{hazard.type.toUpperCase()}</strong>
                    <span style={{marginLeft: '10px', color: '#999'}}>
                      {hazard.distance.toFixed(2)}km away
                    </span>
                    <p style={{fontSize: '13px', margin: '8px 0', color: '#ccc'}}>
                      Reported: {new Date(hazard.timestamp).toLocaleString()}
                    </p>
                    
                    {resolvingHazard === hazard.id ? (
                      <div>
                        <input
                          ref={resolveFileInputRef}
                          type="file"
                          accept="image/*"
                          style={{marginTop: '10px', marginBottom: '10px'}}
                        />
                        <div style={{display: 'flex', gap: '10px'}}>
                          <button 
                            className="resolve-btn"
                            onClick={() => handleResolveHazard(hazard.id)}
                          >
                            ✅ Confirm Resolution
                          </button>
                          <button 
                            className="location-btn"
                            onClick={() => setResolvingHazard(null)}
                            style={{flex: 'none', width: 'auto', padding: '12px 24px'}}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        className="resolve-btn"
                        onClick={() => setResolvingHazard(hazard.id)}
                      >
                        📸 Resolve This Hazard
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* MANUAL REPORT TAB */}
        {activeTab === 'manual' && (
          <div className="detect-view">
            <div className="report-section">
              <h2>📍 Report Hazard Manually</h2>
              <p style={{color: '#999', marginBottom: '20px'}}>
                Report a hazard without uploading an image
              </p>
              
              <div className="form-group">
                <label>Hazard Type</label>
                <select 
                  value={formData.type} 
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                >
                  <option value="pothole">Pothole</option>
                  <option value="accident">Accident</option>
                  <option value="debris">Road Debris</option>
                  <option value="animal">Animal on Road</option>
                </select>
              </div>

              <div className="form-group">
                <label>Severity</label>
                <select 
                  value={formData.severity} 
                  onChange={(e) => setFormData({...formData, severity: e.target.value})}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="form-group">
                <label>📍 Location Selection</label>
                
                {/* Quick Location Options */}
                <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
                  <button 
                    className="location-btn" 
                    onClick={useMyLocation}
                    style={{flex: '1', minWidth: '150px'}}
                  >
                    <Navigation size={20} />
                    Use GPS Location
                  </button>
                  
                  <button 
                    className="location-btn" 
                    onClick={() => {
                      const lat = prompt('Enter Latitude (e.g., 13.3409):');
                      const lng = prompt('Enter Longitude (e.g., 74.7421):');
                      if (lat && lng) {
                        setFormData(prev => ({
                          ...prev,
                          latitude: parseFloat(lat).toFixed(6),
                          longitude: parseFloat(lng).toFixed(6)
                        }));
                      }
                    }}
                    style={{flex: '1', minWidth: '150px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}
                  >
                    📝 Enter Manually
                  </button>
                </div>

                {/* Preset Locations Dropdown */}
                <div className="form-group">
                  <label style={{fontSize: '14px', color: '#999'}}>Or select a preset location:</label>
                  <select 
                    onChange={(e) => {
                      const [lat, lng] = e.target.value.split(',');
                      if (lat && lng) {
                        setFormData(prev => ({
                          ...prev,
                          latitude: parseFloat(lat).toFixed(6),
                          longitude: parseFloat(lng).toFixed(6)
                        }));
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'white',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">-- Select Preset Location --</option>
                    <option value="13.3409,74.7421">Udupi, Karnataka</option>
                    <option value="12.9716,77.5946">Bangalore, Karnataka</option>
                    <option value="13.0827,80.2707">Chennai, Tamil Nadu</option>
                    <option value="19.0760,72.8777">Mumbai, Maharashtra</option>
                    <option value="28.7041,77.1025">Delhi</option>
                    <option value="17.3850,78.4867">Hyderabad, Telangana</option>
                    <option value="22.5726,88.3639">Kolkata, West Bengal</option>
                    <option value="23.0225,72.5714">Ahmedabad, Gujarat</option>
                    <option value="26.9124,75.7873">Jaipur, Rajasthan</option>
                    <option value="11.0168,76.9558">Coimbatore, Tamil Nadu</option>
                  </select>
                </div>

                {/* Manual Input Fields */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  marginTop: '15px'
                }}>
                  <div>
                    <label style={{fontSize: '13px', color: '#999'}}>Latitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.latitude}
                      onChange={(e) => setFormData({...formData, latitude: e.target.value})}
                      placeholder="e.g., 13.3409"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{fontSize: '13px', color: '#999'}}>Longitude</label>
                    <input
                      type="number"
                      step="0.000001"
                      value={formData.longitude}
                      onChange={(e) => setFormData({...formData, longitude: e.target.value})}
                      placeholder="e.g., 74.7421"
                      style={{
                        width: '100%',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Location Display */}
              <div className="location-display" style={{
                background: 'rgba(0,212,255,0.1)',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid rgba(0,212,255,0.3)',
                marginTop: '15px'
              }}>
                <p style={{fontSize: '14px', fontWeight: 'bold', color: '#00d4ff', marginBottom: '5px'}}>
                  📍 Selected Location:
                </p>
                <p style={{fontSize: '13px'}}>
                  Latitude: {formData.latitude || 'Not set'}
                </p>
                <p style={{fontSize: '13px'}}>
                  Longitude: {formData.longitude || 'Not set'}
                </p>
              </div>

              <button 
                className="report-btn"
                onClick={reportHazard}
                disabled={!formData.latitude || !formData.longitude}
                style={{
                  marginTop: '20px',
                  opacity: (!formData.latitude || !formData.longitude) ? 0.5 : 1,
                  cursor: (!formData.latitude || !formData.longitude) ? 'not-allowed' : 'pointer'
                }}
              >
                <AlertTriangle size={20} />
                Report Hazard to Network
              </button>
            </div>
          </div>
        )}
        {activeTab === 'alerts' && (
          <div className="alerts-view">
            <h2>📢 Recent Alerts</h2>
            {notifications.length === 0 ? (
              <p className="no-alerts">No alerts yet. System is monitoring...</p>
            ) : (
              <div className="notifications-list">
                {notifications.map((notif) => (
                  <div key={notif.id} className="notification">
                    <Bell size={20} color="#00d4ff" />
                    <div>
                      <p>{notif.message}</p>
                      <p className="small">{notif.timestamp.toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 style={{marginTop: '40px'}}>🗺️ All Reported Hazards</h2>
            <div className="hazards-list">
              {hazards.slice(0, 20).map((hazard) => (
                <div key={hazard.id} className="hazard-card">
                  <AlertTriangle size={24} color={hazard.severity === 'high' ? '#dc3545' : '#ffc107'} />
                  <div>
                    <strong>{hazard.type.toUpperCase()}</strong>
                    <span className={`hazard-status ${hazard.status || 'active'}`}>
                      {hazard.status === 'resolved' ? '✅ RESOLVED' : '🚨 ACTIVE'}
                    </span>
                    <p>Severity: {hazard.severity}</p>
                    <p className="small">{new Date(hazard.timestamp).toLocaleString()}</p>
                    {hazard.imageUrl && (
                      <img 
                        src={API_URL + hazard.imageUrl} 
                        alt="Hazard" 
                        style={{width: '100%', marginTop: '10px', borderRadius: '8px'}}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;