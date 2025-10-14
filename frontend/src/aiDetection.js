import * as cocoSsd from '@tensorflow-models/coco-ssd';
import * as blazeface from '@tensorflow-models/blazeface';
import '@tensorflow/tfjs';

let model = null;
let faceModel = null;

// Hazard keywords that map to our hazard types
const HAZARD_KEYWORDS = {
  pothole: ['pothole', 'hole'],
  debris: ['bottle', 'cup', 'backpack', 'handbag', 'suitcase', 'umbrella'],
  accident: ['car', 'truck', 'bus', 'motorcycle'],
  flooding: ['water']
};

export async function loadModels() {
  console.log('🤖 Loading AI models...');
  try {
    model = await cocoSsd.load();
    faceModel = await blazeface.load();
    console.log('✅ AI models loaded successfully');
    return true;
  } catch (error) {
    console.error('❌ Error loading models:', error);
    return false;
  }
}

export async function detectHazards(imageElement) {
  if (!model) {
    await loadModels();
  }

  try {
    const predictions = await model.detect(imageElement);
    console.log('🔍 Detected objects:', predictions);

    // Filter for hazards
    const hazards = predictions.filter(pred => {
      const label = pred.class.toLowerCase();
      return Object.values(HAZARD_KEYWORDS).some(keywords => 
        keywords.some(keyword => label.includes(keyword))
      );
    });

    return hazards.map(hazard => {
      let type = 'debris';
      for (const [hazardType, keywords] of Object.entries(HAZARD_KEYWORDS)) {
        if (keywords.some(keyword => hazard.class.toLowerCase().includes(keyword))) {
          type = hazardType;
          break;
        }
      }

      return {
        type,
        confidence: Math.round(hazard.score * 100),
        bbox: hazard.bbox,
        class: hazard.class
      };
    });
  } catch (error) {
    console.error('Error detecting hazards:', error);
    return [];
  }
}

export async function blurPrivacy(canvas, imageElement) {
  if (!faceModel) {
    await loadModels();
  }

  try {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

    // Detect faces
    const faces = await faceModel.estimateFaces(canvas, false);
    console.log(`🔒 Detected ${faces.length} faces to blur`);

    // Blur detected faces
    faces.forEach(face => {
      const [x, y] = face.topLeft;
      const [x2, y2] = face.bottomRight;
      const width = x2 - x;
      const height = y2 - y;

      // Apply blur effect
      ctx.filter = 'blur(20px)';
      ctx.drawImage(canvas, x, y, width, height, x, y, width, height);
      ctx.filter = 'none';
    });

    return canvas.toDataURL('image/jpeg');
  } catch (error) {
    console.error('Error blurring privacy:', error);
    return null;
  }
}
