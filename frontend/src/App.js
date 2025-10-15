import React, { useState, useEffect, useRef } from 'react';
import { MapPin, AlertTriangle, CheckCircle, Activity, TrendingUp, Navigation, Camera, Upload, Cpu } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import io from 'socket.io-client';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import { loadModels, detectHazards, drawDetections, isModelLoaded } from './aiDetection';

const API_URL = 'http://localhost:3001';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const SEVERITY_COLORS = ['#28a745', '#ffc107', '#dc3545'];

function App() {
  const [hazards, setHazards] = useState([]);
  const [connected, setConnected] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [activeTab, setActiveTab] = useState('ai');
  const [aiModelsLoaded, setAiModelsLoaded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [detectedHazards, setDetectedHazards] = useState([]);
  const [processedImage, setProcessedImage] = useState(null);
  const [formData, setFormData] = useState({
    type: 'pothole',
    latitude: '',
    longitude: '',
    severity: 'medium'
  });

  const imageRef = useRef();
  const canvasRef = useRef();
  const fileInputRef = useRef();

  useEffect(() => {
    const socket = io(API_URL);
    const userId = 'user_' + Date.now();
    
    socket.on('connect', () => {
      setConnected(true);
      console.log('✅ Connected to server');
    });

    socket.on('hazard_alert', (hazard) => {
      setHazards(prev => [hazard, ...prev]);
    });
    
    // NEW: Proximity Alert Listener
    socket.on('proximity_alert', (data) => {
      const { hazard, distance } = data;
      console.log('🚨 PROXIMITY ALERT:', hazard, 'Distance:', distance, 'km');
      
      // Browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('⚠️ Road Hazard Ahead!', {
          body: `${hazard.type.toUpperCase()} detected ${distance}km ahead. Severity: ${hazard.severity.toUpperCase()}`,
          icon: '/logo192.png',
          tag: `hazard-${hazard.id}`,
          requireInteraction: true
        });
      }
      
      // In-app alert
      alert(`🚨 HAZARD ALERT!\n\n${hazard.type.toUpperCase()} detected ${distance}km ahead!\n\nSeverity: ${hazard.severity.toUpperCase()}\n\nDrive carefully!`);
    });
    
    // NEW: Nearby Hazards Listener
    socket.on('nearby_hazards', (data) => {
      console.log('📍 Nearby hazards:', data.hazards);
      
      if (data.hazards.length > 0) {
        const hazardList = data.hazards.map(h => 
          `• ${h.type.toUpperCase()} (${h.distance.toFixed(2)}km away - ${h.severity})`
        ).join('\n');
        
        alert(`📍 ${data.hazards.length} HAZARDS ON YOUR ROUTE:\n\n${hazardList}\n\nStay alert!`);
      }
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('Notification permission:', permission);
      });
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(location);
          setFormData(prev => ({
            ...prev,
            latitude: location.lat.toFixed(6),
            longitude: location.lng.toFixed(6)
          }));
          
          // Register location with server
          socket.emit('register_location', {
            userId,
            latitude: location.lat,
            longitude: location.lng
          });
        },
        () => {
          const defaultLocation = { lat: 13.3409, lng: 74.7421 };
          setCurrentLocation(defaultLocation);
          setFormData(prev => ({
            ...prev,
            latitude: defaultLocation.lat.toFixed(6),
            longitude: defaultLocation.lng.toFixed(6)
          }));
          
          // Register default location
          socket.emit('register_location', {
            userId,
            latitude: defaultLocation.lat,
            longitude: defaultLocation.lng
          });
        }
      );
    }

    loadModels().then(loaded => {
      setAiModelsLoaded(loaded);
    });
    
    // Update location every 10 seconds
    const locationInterval = setInterval(() => {
      if (navigator.geolocation && socket.connected) {
        navigator.geolocation.getCurrentPosition((position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          setCurrentLocation(newLocation);
          
          socket.emit('update_location', {
            userId,
            latitude: newLocation.lat,
            longitude: newLocation.lng
          });
        });
      }
    }, 10000);

    return () => {
      clearInterval(locationInterval);
      socket.disconnect();
    };
  }, []);
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImage(event.target.result);
      setDetectedHazards([]);
      setProcessedImage(null);
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
        const processed = drawDetections(canvasRef.current, imageRef.current, hazards);
        setProcessedImage(processed);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post(`${API_URL}/api/hazards/report`, {
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        deviceId: 'vw-ai-app',
        confidence: detectedHazards.length > 0 ? detectedHazards[0].confidence : 100
      });

      if (response.data.duplicate) {
        alert('⚠️ Similar hazard already reported nearby!');
      } else {
        alert('✅ Hazard reported successfully!');
      }
      
      // Reset form
      setFormData(prev => ({
        type: 'pothole',
        latitude: prev.latitude,
        longitude: prev.longitude,
        severity: 'medium'
      }));
      
      // Only clear AI-related data if on AI tab
      if (activeTab === 'ai') {
        setUploadedImage(null);
        setDetectedHazards([]);
        setProcessedImage(null);
      }
    } catch (error) {
      console.error('Error reporting hazard:', error);
      alert('❌ Failed to report hazard');
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const useMyLocation = () => {
    if (currentLocation) {
      setFormData({
        ...formData,
        latitude: currentLocation.lat.toFixed(6),
        longitude: currentLocation.lng.toFixed(6)
      });
    } else {
      alert('Location not available. Please enable location services.');
    }
  };

  const hazardTypeData = Object.entries(
    hazards.reduce((acc, h) => {
      acc[h.type] = (acc[h.type] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

  const severityData = Object.entries(
    hazards.reduce((acc, h) => {
      acc[h.severity] = (acc[h.severity] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value }));

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-left">
          <div className="vw-logo">VW</div>
          <h1>AI Road Hazard Detection</h1>
        </div>
        <div className="header-right">
          <div className={`ai-status ${aiModelsLoaded ? 'loaded' : 'loading'}`}>
            <Cpu size={16} />
            {aiModelsLoaded ? 'AI Ready' : 'Loading AI...'}
          </div>
          <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <Camera size={18} /> AI Detection
        </button>
        <button 
          className={`tab ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => setActiveTab('manual')}
        >
          <MapPin size={18} /> Manual Report
        </button>
        <button 
          className={`tab ${activeTab === 'map' ? 'active' : ''}`}
          onClick={() => setActiveTab('map')}
        >
          <Navigation size={18} /> Live Map
        </button>
        <button 
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <Activity size={18} /> Analytics
        </button>
      </div>

      <main className="container">
        {activeTab === 'ai' && (
          <div className="ai-view">
            <div className="ai-upload-section">
              <h2>📸 AI-Powered Hazard Detection</h2>
              <p className="subtitle">Upload dashcam footage or phone images for automatic hazard detection</p>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                style={{ display: 'none' }}
              />
              
              <button 
                className="upload-btn"
                onClick={() => fileInputRef.current.click()}
                disabled={!aiModelsLoaded}
              >
                <Upload size={20} />
                {aiModelsLoaded ? 'Upload Image from Dashcam' : 'Loading AI Models...'}
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

              {analyzing && (
                <div className="analyzing">
                  <div className="spinner"></div>
                  <p>🤖 AI analyzing image...</p>
                  <p className="small">Detecting hazards with TensorFlow.js (80+ object types)...</p>
                </div>
              )}

              {detectedHazards.length > 0 && (
                <div className="detection-results">
                  <h3>✅ Detected Hazards ({detectedHazards.length})</h3>
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

              {processedImage && (
                <div className="image-preview">
                  <h3>🔍 Analyzed Image</h3>
                  <p className="small">Hazards marked with bounding boxes</p>
                  <img 
                    src={processedImage} 
                    alt="Processed" 
                    style={{ maxWidth: '100%', borderRadius: '10px' }}
                  />
                </div>
              )}
            </div>

            {detectedHazards.length > 0 && (
              <div className="report-section">
                <h2>Report Detected Hazard</h2>
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label>Hazard Type (Auto-detected):</label>
                    <select name="type" value={formData.type} onChange={handleChange}>
                      <option value="pothole">🕳️ Pothole</option>
                      <option value="debris">🪨 Debris</option>
                      <option value="flooding">💧 Flooding</option>
                      <option value="accident">🚗 Accident</option>
                      <option value="animal">🐕 Animal</option>
                    </select>
                  </div>

                  <div className="location-row">
                    <div className="form-group">
                      <label>Latitude:</label>
                      <input
                        type="number"
                        step="any"
                        name="latitude"
                        value={formData.latitude}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Longitude:</label>
                      <input
                        type="number"
                        step="any"
                        name="longitude"
                        value={formData.longitude}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <button type="button" className="location-btn" onClick={useMyLocation}>
                    <Navigation size={16} /> Use My Location
                  </button>

                  <div className="form-group">
                    <label>Severity (Auto-detected):</label>
                    <select name="severity" value={formData.severity} onChange={handleChange}>
                      <option value="low">🟢 Low</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="high">🔴 High</option>
                    </select>
                  </div>

                  <button type="submit" className="submit-btn">
                    Report to Network
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTab === 'manual' && (
          <div className="ai-view">
            <div className="report-section">
              <h2>📍 Manual Hazard Report</h2>
              <p className="subtitle">Report road hazards manually with your current location</p>
              
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Hazard Type:</label>
                  <select name="type" value={formData.type} onChange={handleChange}>
                    <option value="pothole">🕳️ Pothole</option>
                    <option value="debris">🪨 Debris</option>
                    <option value="flooding">💧 Flooding</option>
                    <option value="accident">🚗 Accident</option>
                    <option value="animal">🐕 Animal on Road</option>
                  </select>
                </div>

                <div className="location-row">
                  <div className="form-group">
                    <label>Latitude:</label>
                    <input
                      type="number"
                      step="any"
                      name="latitude"
                      value={formData.latitude}
                      onChange={handleChange}
                      placeholder="13.3409"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Longitude:</label>
                    <input
                      type="number"
                      step="any"
                      name="longitude"
                      value={formData.longitude}
                      onChange={handleChange}
                      placeholder="74.7421"
                      required
                    />
                  </div>
                </div>

                <button type="button" className="location-btn" onClick={useMyLocation}>
                  <Navigation size={16} /> Use My Current Location
                </button>

                <div className="form-group">
                  <label>Severity Level:</label>
                  <select name="severity" value={formData.severity} onChange={handleChange}>
                    <option value="low">🟢 Low - Minor issue</option>
                    <option value="medium">🟡 Medium - Requires attention</option>
                    <option value="high">🔴 High - Dangerous</option>
                  </select>
                </div>

                <button type="submit" className="submit-btn">
                  📢 Report Hazard
                </button>
              </form>
            </div>

            <div className="report-section">
              <h2>Recent Reports ({hazards.length})</h2>
              {hazards.length === 0 ? (
                <p className="no-data">No hazards reported yet</p>
              ) : (
                <div className="hazards-list" style={{maxHeight: '600px', overflowY: 'auto'}}>
                  {hazards.slice(0, 10).map((hazard) => (
                    <div key={hazard.id} className={`detected-hazard`} style={{
                      background: hazard.severity === 'high' ? 'rgba(220, 53, 69, 0.1)' : 
                                 hazard.severity === 'medium' ? 'rgba(255, 193, 7, 0.1)' : 
                                 'rgba(40, 167, 69, 0.1)',
                      border: `1px solid ${hazard.severity === 'high' ? '#dc3545' : 
                                          hazard.severity === 'medium' ? '#ffc107' : 
                                          '#28a745'}`,
                      marginBottom: '12px',
                      padding: '16px',
                      borderRadius: '12px'
                    }}>
                      <AlertTriangle size={24} color={
                        hazard.severity === 'high' ? '#dc3545' : 
                        hazard.severity === 'medium' ? '#ffc107' : 
                        '#28a745'
                      } />
                      <div>
                        <strong>{hazard.type.toUpperCase()}</strong>
                        {hazard.confidence && <p>AI Confidence: {hazard.confidence}%</p>}
                        <p className="small">Location: {hazard.latitude.toFixed(4)}, {hazard.longitude.toFixed(4)}</p>
                        <p className="small">Severity: {hazard.severity.toUpperCase()}</p>
                        <p className="small">{new Date(hazard.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              />
              
              <Circle
                center={[currentLocation.lat, currentLocation.lng]}
                radius={100}
                pathOptions={{ color: '#00d4ff', fillColor: '#00d4ff', fillOpacity: 0.3 }}
              />

              {hazards.map((hazard) => (
                <Marker 
                  key={hazard.id} 
                  position={[hazard.latitude, hazard.longitude]}
                >
                  <Popup>
                    <div>
                      <h4>{hazard.type.toUpperCase()}</h4>
                      <p><strong>Severity:</strong> {hazard.severity}</p>
                      {hazard.confidence && (
                        <p><strong>AI Confidence:</strong> {hazard.confidence}%</p>
                      )}
                      <p><strong>Reported:</strong> {new Date(hazard.timestamp).toLocaleString()}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-view">
            <div className="stats-grid">
              <div className="stat-card">
                <AlertTriangle size={32} color="#00d4ff" />
                <h3>{hazards.length}</h3>
                <p>Total Hazards</p>
              </div>
              <div className="stat-card">
                <TrendingUp size={32} color="#dc3545" />
                <h3>{hazards.filter(h => h.severity === 'high').length}</h3>
                <p>High Severity</p>
              </div>
              <div className="stat-card">
                <Cpu size={32} color="#00d4ff" />
                <h3>{hazards.filter(h => h.confidence).length}</h3>
                <p>AI Detected</p>
              </div>
            </div>

            <div className="charts-grid">
              <div className="chart-card">
                <h3>Hazards by Type</h3>
                {hazardTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={hazardTypeData}>
                      <XAxis dataKey="name" stroke="#fff" />
                      <YAxis stroke="#fff" />
                      <Tooltip contentStyle={{background: '#1a1f3a', border: 'none'}} />
                      <Bar dataKey="value" fill="#00d4ff" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="no-data">No data yet</p>
                )}
              </div>

              <div className="chart-card">
                <h3>Severity Distribution</h3>
                {severityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={severityData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        dataKey="value"
                      >
                        {severityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[index % SEVERITY_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{background: '#1a1f3a', border: 'none'}} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="no-data">No data yet</p>
                )}
              </div>
            </div>

            <div className="insights-card">
              <h3>🚗 VW Integration & Key Features</h3>
              <ul>
                <li>✅ <strong>Computer Vision:</strong> Real TensorFlow.js detecting 80+ object types</li>
                <li>✅ <strong>Duplicate Prevention:</strong> Smart filtering within 100m radius</li>
                <li>✅ <strong>Near Real-Time:</strong> WebSocket alerts under 200ms</li>
                <li>✅ <strong>Auto-Classification:</strong> AI determines hazard type & severity</li>
                <li>✅ <strong>Manual Override:</strong> Drivers can report hazards instantly</li>
                <li>✅ <strong>Geolocation:</strong> Precise hazard mapping with GPS</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;