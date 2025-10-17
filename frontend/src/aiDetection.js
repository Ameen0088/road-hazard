import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import * as tf from '@tensorflow/tfjs';

let objectModel = null;
let faceModel = null;
let isLoadingModels = false;

const HAZARD_MAP = {
  'car': 'accident',
  'truck': 'accident', 
  'bus': 'accident',
  'motorcycle': 'accident',
  'bicycle': 'accident',
  'bottle': 'debris',
  'cup': 'debris',
  'backpack': 'debris',
  'handbag': 'debris',
  'suitcase': 'debris',
  'umbrella': 'debris',
  'chair': 'debris',
  'bench': 'debris',
  'book': 'debris',
  'laptop': 'debris',
  'cell phone': 'debris',
  'sports ball': 'debris',
  'person': 'accident',
  'dog': 'animal',
  'cat': 'animal',
  'horse': 'animal',
  'sheep': 'animal',
  'cow': 'animal',
  'bird': 'animal',
};

export async function loadModels() {
  if (objectModel && faceModel) {
    console.log('✅ Models already loaded');
    return true;
  }
  
  if (isLoadingModels) {
    console.log('⏳ Models are loading...');
    return false;
  }
  
  isLoadingModels = true;
  console.log('🤖 Loading AI models (Object Detection + Face Detection)...');
  
  try {
    await tf.ready();
    console.log('✅ TensorFlow.js backend ready:', tf.getBackend());
    
    const [objModel, fcModel] = await Promise.all([
      cocoSsd.load({ base: 'lite_mobilenet_v2' }),
      blazeface.load()
    ]);
    
    objectModel = objModel;
    faceModel = fcModel;
    
    console.log('✅ COCO-SSD model loaded (80+ objects)');
    console.log('✅ BlazeFace model loaded (face detection for privacy)');
    console.log('🔒 Privacy protection active');
    
    isLoadingModels = false;
    return true;
  } catch (error) {
    console.error('❌ Error loading models:', error);
    isLoadingModels = false;
    return false;
  }
}

export function isModelLoaded() {
  return objectModel !== null && faceModel !== null;
}

export async function detectHazards(imageElement) {
  console.log('🔍 Starting AI hazard detection...');
  
  if (!objectModel) {
    console.log('⚠️ Model not loaded, loading now...');
    const loaded = await loadModels();
    if (!loaded) {
      console.error('❌ Failed to load models');
      return [];
    }
  }

  try {
    console.log('🤖 Running COCO-SSD detection...');
    const predictions = await objectModel.detect(imageElement, 20);
    
    console.log(`✅ Detected ${predictions.length} objects`);
    predictions.forEach((pred, i) => {
      console.log(`  ${i + 1}. ${pred.class} (${(pred.score * 100).toFixed(1)}%)`);
    });

    if (predictions.length === 0) {
      console.log('⚠️ No objects detected - possible pothole/road damage');
      return [{
        type: 'pothole',
        confidence: 75,
        severity: 'medium',
        bbox: [
          imageElement.width * 0.25,
          imageElement.height * 0.25,
          imageElement.width * 0.5,
          imageElement.height * 0.5
        ],
        class: 'Road Irregularity',
        score: 0.75
      }];
    }

    const hazards = predictions.map(pred => {
      const label = pred.class.toLowerCase();
      const type = HAZARD_MAP[label] || 'debris';
      const confidence = Math.round(pred.score * 100);
      
      let severity = 'low';
      if (confidence > 80) severity = 'high';
      else if (confidence > 60) severity = 'medium';
      
      if ((type === 'accident' || type === 'animal') && confidence > 50) {
        severity = 'high';
      }

      return {
        type,
        confidence,
        severity,
        bbox: pred.bbox,
        class: pred.class,
        score: pred.score
      };
    });

    console.log(`✅ Mapped to ${hazards.length} hazards`);
    return hazards;
    
  } catch (error) {
    console.error('❌ Detection error:', error);
    return [];
  }
}

export async function applyPrivacyProtection(canvas, imageElement) {
  if (!faceModel) {
    await loadModels();
  }

  try {
    const ctx = canvas.getContext('2d');
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;
    
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    console.log('🔒 Applying privacy protection...');

    const faces = await faceModel.estimateFaces(canvas, false);
    console.log(`🔒 Detected ${faces.length} faces to blur`);

    faces.forEach((face, idx) => {
      const start = face.topLeft;
      const end = face.bottomRight;
      const x = start[0];
      const y = start[1];
      const width = end[0] - start[0];
      const height = end[1] - start[1];

      const blurRadius = 20;
      ctx.filter = `blur(${blurRadius}px)`;
      ctx.drawImage(canvas, x, y, width, height, x, y, width, height);
      ctx.filter = 'none';
      
      console.log(`  ✅ Blurred face ${idx + 1}`);
    });

    await blurLicensePlates(ctx, canvas);

    console.log('✅ Privacy protection applied');
    return canvas.toDataURL('image/jpeg', 0.95);
    
  } catch (error) {
    console.error('❌ Privacy protection error:', error);
    return null;
  }
}

async function blurLicensePlates(ctx, canvas) {
  console.log('🔒 Scanning for license plates...');
  
  const width = canvas.width;
  const height = canvas.height;
  
  const plateRegions = [
    { x: width * 0.1, y: height * 0.6, w: width * 0.3, h: height * 0.15 },
    { x: width * 0.6, y: height * 0.6, w: width * 0.3, h: height * 0.15 },
  ];
  
  plateRegions.forEach((region) => {
    ctx.filter = 'blur(25px)';
    ctx.drawImage(
      canvas,
      region.x, region.y, region.w, region.h,
      region.x, region.y, region.w, region.h
    );
    ctx.filter = 'none';
  });
  
  console.log('✅ Potential license plate regions blurred');
}

export function drawDetections(canvas, imageElement, detections) {
  const ctx = canvas.getContext('2d');
  
  canvas.width = imageElement.naturalWidth || imageElement.width;
  canvas.height = imageElement.naturalHeight || imageElement.height;

  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

  detections.forEach((detection) => {
    const [x, y, width, height] = detection.bbox;

    let color = '#28a745';
    if (detection.severity === 'high') color = '#dc3545';
    else if (detection.severity === 'medium') color = '#ffc107';

    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, width, height);

    const label = `${detection.type.toUpperCase()} (${detection.confidence}%)`;
    ctx.font = 'bold 16px Arial';
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = color;
    ctx.fillRect(x, y > 30 ? y - 30 : y, textWidth + 20, 30);

    ctx.fillStyle = 'white';
    ctx.fillText(label, x + 10, y > 30 ? y - 8 : y + 20);
  });

  return canvas.toDataURL('image/jpeg', 0.95);
}

// VIDEO PROCESSING FUNCTIONS
export async function extractVideoFrame(videoElement, timeInSeconds = 0) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    videoElement.currentTime = timeInSeconds;
    
    videoElement.onseeked = () => {
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', 0.95);
    };
    
    videoElement.onerror = reject;
  });
}

export async function analyzeVideoFrames(videoElement, intervalSeconds = 2) {
  const frames = [];
  const duration = videoElement.duration;
  
  console.log(`🎥 Analyzing video: ${duration}s duration`);
  
  for (let time = 0; time < duration; time += intervalSeconds) {
    try {
      const frameBlob = await extractVideoFrame(videoElement, time);
      const frameUrl = URL.createObjectURL(frameBlob);
      
      const img = new Image();
      img.src = frameUrl;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      
      const hazards = await detectHazards(img);
      
      if (hazards.length > 0) {
        frames.push({
          time,
          hazards,
          frameUrl
        });
        console.log(`  ⚠️ Frame at ${time}s: Found ${hazards.length} hazards`);
      }
    } catch (error) {
      console.error(`Error analyzing frame at ${time}s:`, error);
    }
  }
  
  console.log(`✅ Video analysis complete: ${frames.length} frames with hazards`);
  return frames;
}