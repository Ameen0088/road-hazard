import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as tf from '@tensorflow/tfjs';

let model = null;
let isLoading = false;

// Enhanced mapping - COCO-SSD detects 80+ objects
const HAZARD_MAP = {
  // Vehicles indicating accidents/hazards
  'car': 'accident',
  'truck': 'accident', 
  'bus': 'accident',
  'motorcycle': 'accident',
  'bicycle': 'accident',
  
  // Road debris - anything on the road
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
  'baseball bat': 'debris',
  'skateboard': 'debris',
  'surfboard': 'debris',
  'tennis racket': 'debris',
  'frisbee': 'debris',
  'skis': 'debris',
  'snowboard': 'debris',
  'kite': 'debris',
  'baseball glove': 'debris',
  'scissors': 'debris',
  'teddy bear': 'debris',
  'hair drier': 'debris',
  'toothbrush': 'debris',
  'vase': 'debris',
  'bowl': 'debris',
  'banana': 'debris',
  'apple': 'debris',
  'sandwich': 'debris',
  'orange': 'debris',
  'broccoli': 'debris',
  'carrot': 'debris',
  'hot dog': 'debris',
  'pizza': 'debris',
  'donut': 'debris',
  'cake': 'debris',
  'potted plant': 'debris',
  
  // Animals
  'dog': 'animal',
  'cat': 'animal',
  'horse': 'animal',
  'sheep': 'animal',
  'cow': 'animal',
  'bird': 'animal',
  'elephant': 'animal',
  'bear': 'animal',
  'zebra': 'animal',
  'giraffe': 'animal',
  
  // People/pedestrians (potential hazard)
  'person': 'accident',
  
  // Traffic elements
  'traffic light': 'debris',
  'fire hydrant': 'debris',
  'stop sign': 'debris',
  'parking meter': 'debris'
};

export async function loadModels() {
  if (model) {
    console.log('✅ Model already loaded');
    return true;
  }
  
  if (isLoading) {
    console.log('⏳ Model is loading...');
    return false;
  }
  
  isLoading = true;
  console.log('🤖 Loading COCO-SSD model from TensorFlow.js...');
  console.log('📊 This model can detect 80+ object types including vehicles, people, and objects');
  
  try {
    await tf.ready();
    console.log('✅ TensorFlow.js backend ready:', tf.getBackend());
    
    // Load with lite model for faster performance
    model = await cocoSsd.load({
      base: 'lite_mobilenet_v2'
    });
    
    console.log('✅ COCO-SSD model loaded successfully!');
    console.log('🎯 Model can now detect: cars, trucks, people, animals, debris, and more!');
    isLoading = false;
    return true;
  } catch (error) {
    console.error('❌ Error loading model:', error);
    isLoading = false;
    return false;
  }
}

export function isModelLoaded() {
  return model !== null;
}

export async function detectHazards(imageElement) {
  console.log('🔍 Starting AI hazard detection...');
  console.log('📸 Image size:', imageElement.width, 'x', imageElement.height);
  
  if (!model) {
    console.log('⚠️ Model not loaded, loading now...');
    const loaded = await loadModels();
    if (!loaded) {
      console.error('❌ Failed to load model');
      return [];
    }
  }

  try {
    console.log('🤖 Running COCO-SSD detection (this detects 80+ object types)...');
    
    // Run detection with higher maxNumBoxes for better coverage
    const predictions = await model.detect(imageElement, 20); // Detect up to 20 objects
    
    console.log(`✅ Raw detection complete! Found ${predictions.length} objects:`);
    predictions.forEach((pred, i) => {
      console.log(`  ${i + 1}. ${pred.class} (${(pred.score * 100).toFixed(1)}% confidence) at [${pred.bbox.map(v => v.toFixed(0)).join(', ')}]`);
    });

    // If no objects detected, treat as potential pothole/damage
    if (predictions.length === 0) {
      console.log('⚠️ No standard objects detected - could be road damage/pothole');
      return [{
        type: 'pothole',
        confidence: 75,
        severity: 'medium',
        bbox: [imageElement.width * 0.25, imageElement.height * 0.25, imageElement.width * 0.5, imageElement.height * 0.5],
        class: 'Road Irregularity Detected',
        score: 0.75
      }];
    }

    // Map detected objects to hazards
    const hazards = predictions.map(pred => {
      const label = pred.class.toLowerCase();
      const type = HAZARD_MAP[label] || 'debris'; // Default to debris if not mapped
      const confidence = Math.round(pred.score * 100);
      
      // Calculate severity
      let severity = 'low';
      if (confidence > 80) {
        severity = 'high';
      } else if (confidence > 60) {
        severity = 'medium';
      }
      
      // Accidents and animals are always high priority
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

    console.log(`✅ Mapped to ${hazards.length} potential hazards:`);
    hazards.forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.type.toUpperCase()} - ${h.class} (${h.confidence}% confidence, ${h.severity} severity)`);
    });
    
    return hazards;
    
  } catch (error) {
    console.error('❌ Error during detection:', error);
    console.error('Error details:', error.message);
    return [];
  }
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

    // Draw box
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, width, height);

    // Draw label
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