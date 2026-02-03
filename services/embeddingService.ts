
import { pipeline } from '@xenova/transformers';

let embedder: any = null;

export const initModel = async (onProgress?: (progress: number) => void) => {
  if (embedder) return;
  
  // Feature extraction pipeline with the requested model
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    progress_callback: (data: any) => {
      if (data.status === 'progress' && onProgress) {
        onProgress(data.progress);
      }
    }
  });
};

export const getEmbedding = async (text: string): Promise<Float32Array> => {
  if (!embedder) await initModel();
  
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return output.data;
};

export const calculateDifference = (vecA: Float32Array, vecB: Float32Array): Float32Array => {
  const diff = new Float32Array(vecA.length);
  for (let i = 0; i < vecA.length; i++) {
    diff[i] = vecB[i] - vecA[i];
  }
  return diff;
};
