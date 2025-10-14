const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const socketIo = require('socket.io');
const http = require('http');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.post('/api/hazards/report', (req, res) => {
  const { type, latitude, longitude, severity, deviceId } = req.body;
  console.log('Hazard reported:', { type, latitude, longitude });
  
  io.emit('hazard_alert', {
    id: Date.now(),
    type,
    latitude,
    longitude,
    severity,
    timestamp: new Date()
  });
  
  res.json({ success: true });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('register_location', (data) => {
    console.log('Location registered:', data);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
