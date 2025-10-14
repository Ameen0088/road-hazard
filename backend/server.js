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

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use('/uploads', express.static('uploads'));

// Store reported hazards to prevent duplicates
const reportedHazards = [];

// Helper function to check for duplicate hazards
function isDuplicate(lat, lng, type) {
  const RADIUS = 0.001; // ~100 meters
  const TIME_WINDOW = 300000; // 5 minutes
  const now = Date.now();
  
  return reportedHazards.some(h => {
    const distance = Math.sqrt(
      Math.pow(h.latitude - lat, 2) + 
      Math.pow(h.longitude - lng, 2)
    );
    const timeDiff = now - new Date(h.timestamp).getTime();
    
    return distance < RADIUS && 
           h.type === type && 
           timeDiff < TIME_WINDOW;
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.post('/api/hazards/report', (req, res) => {
  const { type, latitude, longitude, severity, deviceId, confidence, imageUrl } = req.body;
  
  // Check for duplicates
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
  
  // Emit to all connected clients
  io.emit('hazard_alert', hazard);
  
  res.json({ success: true, duplicate: false, hazard });
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
  res.json({ hazards: reportedHazards.slice(-50) }); // Last 50 hazards
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);
  
  socket.on('register_location', (data) => {
    console.log('📍 Location registered:', data);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`✅ VW Hazard Detection Server running on http://localhost:${PORT}`);
});
