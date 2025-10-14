import React, { useState, useEffect } from 'react';
import { MapPin, AlertTriangle, CheckCircle } from 'lucide-react';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:3001';

function App() {
  const [hazards, setHazards] = useState([]);
  const [connected, setConnected] = useState(false);
  const [formData, setFormData] = useState({
    type: 'pothole',
    latitude: '',
    longitude: '',
    severity: 'medium'
  });

  useEffect(() => {
    const socket = io(API_URL);
    
    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    socket.on('hazard_alert', (hazard) => {
      console.log('New hazard received:', hazard);
      setHazards(prev => [hazard, ...prev].slice(0, 10));
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    return () => socket.disconnect();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      await axios.post(`${API_URL}/api/hazards/report`, {
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        deviceId: 'web-app'
      });
      
      setFormData({
        type: 'pothole',
        latitude: '',
        longitude: '',
        severity: 'medium'
      });
      
      alert('Hazard reported successfully!');
    } catch (error) {
      console.error('Error reporting hazard:', error);
      alert('Failed to report hazard');
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1><MapPin /> Road Hazard Detection System</h1>
        <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
          {connected ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      <main className="container">
        <div className="report-section">
          <h2>Report a Hazard</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Hazard Type:</label>
              <select name="type" value={formData.type} onChange={handleChange}>
                <option value="pothole">Pothole</option>
                <option value="debris">Debris</option>
                <option value="flooding">Flooding</option>
                <option value="accident">Accident</option>
              </select>
            </div>

            <div className="form-group">
              <label>Latitude:</label>
              <input
                type="number"
                step="any"
                name="latitude"
                value={formData.latitude}
                onChange={handleChange}
                placeholder="e.g., 13.3409"
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
                placeholder="e.g., 74.7421"
                required
              />
            </div>

            <div className="form-group">
              <label>Severity:</label>
              <select name="severity" value={formData.severity} onChange={handleChange}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <button type="submit" className="submit-btn">Report Hazard</button>
          </form>
        </div>

        <div className="hazards-section">
          <h2>Recent Hazards</h2>
          {hazards.length === 0 ? (
            <p className="no-hazards">No hazards reported yet</p>
          ) : (
            <div className="hazards-list">
              {hazards.map((hazard) => (
                <div key={hazard.id} className={`hazard-card severity-${hazard.severity}`}>
                  <div className="hazard-header">
                    <AlertTriangle size={20} />
                    <h3>{hazard.type.toUpperCase()}</h3>
                  </div>
                  <p><strong>Location:</strong> {hazard.latitude}, {hazard.longitude}</p>
                  <p><strong>Severity:</strong> {hazard.severity}</p>
                  <p className="timestamp">{new Date(hazard.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
