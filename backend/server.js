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
app.use(fileUpload({
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for videos
}));
app.use('/uploads', express.static('uploads'));

// Store hazards with status (active/resolved)
const hazards = [];
const activeUsers = new Map();

// Calculate distance between coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Check for duplicate hazards
function isDuplicate(lat, lng, type) {
  const RADIUS = 0.1; // 100 meters
  const TIME_WINDOW = 300000; // 5 minutes
  const now = Date.now();
  
  return hazards.some(h => {
    if (h.status === 'resolved') return false;
    const distance = calculateDistance(h.latitude, h.longitude, lat, lng);
    const timeDiff = now - new Date(h.timestamp).getTime();
    return distance < RADIUS && h.type === type && timeDiff < TIME_WINDOW;
  });
}

// Get active nearby hazards
function getActiveNearbyHazards(userLat, userLng, radiusKm = 1) {
  return hazards
    .filter(hazard => hazard.status === 'active')
    .filter(hazard => {
      const distance = calculateDistance(userLat, userLng, hazard.latitude, hazard.longitude);
      return distance <= radiusKm;
    })
    .map(hazard => ({
      ...hazard,
      distance: calculateDistance(userLat, userLng, hazard.latitude, hazard.longitude)
    }));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Report new hazard
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
    timestamp: new Date(),
    status: 'active',
    reportedBy: deviceId,
    resolvedBy: null,
    resolvedAt: null,
    resolvedImageUrl: null
  };
  
  hazards.push(hazard);
  io.emit('hazard_alert', hazard);
  
  // Send proximity alerts
  activeUsers.forEach((user, userId) => {
    const distance = calculateDistance(user.latitude, user.longitude, latitude, longitude);
    if (distance <= 1) {
      io.to(user.socketId).emit('proximity_alert', {
        hazard,
        distance: distance.toFixed(2)
      });
      console.log(`🚨 Proximity alert sent to user ${userId} (${distance.toFixed(2)}km away)`);
    }
  });
  
  res.json({ success: true, duplicate: false, hazard });
});

// Resolve hazard with photo
app.post('/api/hazards/resolve', (req, res) => {
  const { hazardId, latitude, longitude, deviceId, imageUrl } = req.body;
  
  const hazard = hazards.find(h => h.id === parseInt(hazardId));
  
  if (!hazard) {
    return res.status(404).json({ error: 'Hazard not found' });
  }
  
  if (hazard.status === 'resolved') {
    return res.json({ 
      success: false, 
      message: 'Hazard already resolved' 
    });
  }
  
  const distance = calculateDistance(latitude, longitude, hazard.latitude, hazard.longitude);
  
  if (distance > 1) {
    return res.json({
      success: false,
      message: `You must be within 1km of the hazard to resolve it. You are ${distance.toFixed(2)}km away.`
    });
  }
  
  hazard.status = 'resolved';
  hazard.resolvedBy = deviceId;
  hazard.resolvedAt = new Date();
  hazard.resolvedImageUrl = imageUrl;
  
  console.log('✅ Hazard resolved:', hazard.id, 'by', deviceId);
  
  io.emit('hazard_resolved', {
    hazardId: hazard.id,
    resolvedAt: hazard.resolvedAt,
    resolvedBy: deviceId
  });
  
  res.json({ 
    success: true, 
    message: 'Hazard marked as resolved',
    hazard 
  });
});

// Get nearby active hazards
app.get('/api/hazards/nearby', (req, res) => {
  const { latitude, longitude, radius } = req.query;
  
  if (!latitude || !longitude) {
    return res.status(400).json({ error: 'Latitude and longitude required' });
  }
  
  const nearbyHazards = getActiveNearbyHazards(
    parseFloat(latitude), 
    parseFloat(longitude), 
    parseFloat(radius) || 1
  );
  
  res.json({ hazards: nearbyHazards });
});

// Get all hazards
app.get('/api/hazards', (req, res) => {
  const { status } = req.query;
  
  let filteredHazards = hazards;
  
  if (status === 'active') {
    filteredHazards = hazards.filter(h => h.status === 'active');
  } else if (status === 'resolved') {
    filteredHazards = hazards.filter(h => h.status === 'resolved');
  }
  
  res.json({ 
    hazards: filteredHazards.slice(-50),
    total: filteredHazards.length,
    active: hazards.filter(h => h.status === 'active').length,
    resolved: hazards.filter(h => h.status === 'resolved').length
  });
});

// Upload image/video
app.post('/api/upload', (req, res) => {
  if (!req.files || (!req.files.image && !req.files.video)) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const file = req.files.image || req.files.video;
  const fileType = req.files.image ? 'image' : 'video';
  const filename = `${Date.now()}_${file.name}`;
  const uploadPath = path.join(uploadsDir, filename);

  file.mv(uploadPath, (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    }

    const fileUrl = `/uploads/${filename}`;
    console.log(`📸 ${fileType.toUpperCase()} uploaded:`, fileUrl);
    res.json({ success: true, fileUrl, fileType });
  });
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('register_location', (data) => {
    const { userId, latitude, longitude } = data;
    activeUsers.set(userId, { socketId: socket.id, latitude, longitude });
    console.log(`📍 User ${userId} registered at ${latitude}, ${longitude}`);
    
    const nearbyHazards = getActiveNearbyHazards(latitude, longitude, 1);
    if (nearbyHazards.length > 0) {
      socket.emit('nearby_hazards', { hazards: nearbyHazards });
      console.log(`📢 Sent ${nearbyHazards.length} active nearby hazards to user ${userId}`);
    }
  });
  
  socket.on('update_location', (data) => {
    const { userId, latitude, longitude } = data;
    const user = activeUsers.get(userId);
    if (user) {
      user.latitude = latitude;
      user.longitude = longitude;
      
      const nearbyHazards = getActiveNearbyHazards(latitude, longitude, 1);
      if (nearbyHazards.length > 0) {
        socket.emit('nearby_hazards', { hazards: nearbyHazards });
      }
    }
  });
  
  socket.on('disconnect', () => {
    for (const [userId, user] of activeUsers.entries()) {
      if (user.socketId === socket.id) {
        activeUsers.delete(userId);
        console.log(`🔌 User ${userId} disconnected`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ VW Hazard Detection Server running on http://localhost:${PORT}`);
  console.log(`📡 Proximity alerts enabled (1km radius)`);
  console.log(`🗄️  Hazard persistence enabled`);
  console.log(`🎥 Image & Video upload supported`);
});