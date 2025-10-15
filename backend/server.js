const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const socketIo = require('socket.io');
const http = require('http');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use('/uploads', express.static('uploads'));

// Store reported hazards and active users
const reportedHazards = [];
const activeUsers = new Map(); // userId -> {socketId, latitude, longitude}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

// Check for duplicate hazards
function isDuplicate(lat, lng, type) {
  const RADIUS = 0.1; // 100 meters in km
  const TIME_WINDOW = 300000; // 5 minutes
  const now = Date.now();
  
  return reportedHazards.some(h => {
    const distance = calculateDistance(h.latitude, h.longitude, lat, lng);
    const timeDiff = now - new Date(h.timestamp).getTime();
    return distance < RADIUS && h.type === type && timeDiff < TIME_WINDOW;
  });
}

// Get nearby hazards for a user
function getNearbyHazards(userLat, userLng, radiusKm = 1) {
  return reportedHazards.filter(hazard => {
    const distance = calculateDistance(userLat, userLng, hazard.latitude, hazard.longitude);
    return distance <= radiusKm;
  }).map(hazard => ({
    ...hazard,
    distance: calculateDistance(userLat, userLng, hazard.latitude, hazard.longitude)
  }));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.post('/api/hazards/report', (req, res) => {
  const { type, latitude, longitude, severity, deviceId, confidence, imageUrl } = req.body;
  
  if (isDuplicate(latitude, longitude, type)) {
    console.log('⚠️  Duplicate hazard detected, skipping...');
    return res.json({ 
      success: true, 
      duplicate: true,
      message: 'Similar hazard already reported nearby' 
    });
  }
  
  console.log('✅ New hazard reported:', { type, latitude, longitude, confidence });
  
  const hazard = {
    id: Date.now(),
    type,
    latitude,
    longitude,
    severity,
    confidence: confidence || 100,
    imageUrl: imageUrl || null,
    timestamp: new Date()
  };
  
  reportedHazards.push(hazard);
  
  // Broadcast to all connected clients
  io.emit('hazard_alert', hazard);
  
  // Send proximity alerts to nearby users
  activeUsers.forEach((user, userId) => {
    const distance = calculateDistance(user.latitude, user.longitude, latitude, longitude);
    if (distance <= 1) { // Within 1km
      io.to(user.socketId).emit('proximity_alert', {
        hazard,
        distance: distance.toFixed(2)
      });
      console.log(`🚨 Proximity alert sent to user ${userId} (${distance.toFixed(2)}km away)`);
    }
  });
  
  res.json({ success: true, duplicate: false, hazard });
});

app.get('/api/hazards/nearby', (req, res) => {
  const { latitude, longitude, radius } = req.query;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude and longitude required' });
  }
  
  const nearbyHazards = getNearbyHazards(
    parseFloat(latitude), 
    parseFloat(longitude), 
    parseFloat(radius) || 1
  );
  
  res.json({ hazards: nearbyHazards });
});

app.post('/api/upload', (req, res) => {
  if (!req.files || !req.files.image) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const image = req.files.image;
  const filename = `${Date.now()}_${image.name}`;
  const uploadPath = path.join(uploadsDir, filename);

  image.mv(uploadPath, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    }

    const imageUrl = `/uploads/${filename}`;
    console.log('📸 Image uploaded:', imageUrl);
    res.json({ success: true, imageUrl });
  });
});

app.get('/api/hazards', (req, res) => {
  res.json({ hazards: reportedHazards.slice(-50) });
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  // Register user location
  socket.on('register_location', (data) => {
    const { userId, latitude, longitude } = data;
    activeUsers.set(userId, { socketId: socket.id, latitude, longitude });
    console.log(`📍 User ${userId} registered at ${latitude}, ${longitude}`);
    
    // Send nearby hazards immediately
    const nearbyHazards = getNearbyHazards(latitude, longitude, 1);
    if (nearbyHazards.length > 0) {
      socket.emit('nearby_hazards', { hazards: nearbyHazards });
      console.log(`📢 Sent ${nearbyHazards.length} nearby hazards to user ${userId}`);
    }
  });
  
  // Update user location in real-time
  socket.on('update_location', (data) => {
    const { userId, latitude, longitude } = data;
    const user = activeUsers.get(userId);
    if (user) {
      user.latitude = latitude;
      user.longitude = longitude;
      
      // Check for nearby hazards
      const nearbyHazards = getNearbyHazards(latitude, longitude, 1);
      if (nearbyHazards.length > 0) {
        socket.emit('nearby_hazards', { hazards: nearbyHazards });
      }
    }
  });
  
  socket.on('disconnect', () => {
    // Remove user from active users
    for (const [userId, user] of activeUsers.entries()) {
      if (user.socketId === socket.id) {
        activeUsers.delete(userId);
        console.log(`🔌 User ${userId} disconnected`);
        break;
      }
    }
    console.log('🔌 Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ VW Hazard Detection Server running on http://localhost:${PORT}`);
  console.log(`📡 Proximity alerts enabled (1km radius)`);
});