/**
 * Example: Using the Image Optimization API
 */

import https from 'https';
import fs from 'fs';
import FormData from 'form-data';

const API_BASE = 'http://localhost:3000';

/**
 * Upload and optimize image to WebP
 */
async function uploadAndOptimize(imagePath: string): Promise<void> {
  const form = new FormData();
  form.append('image', fs.createReadStream(imagePath));

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/images/upload?width=1200&quality=85&format=webp',
      method: 'POST',
      headers: form.getHeaders(),
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync('optimized.webp', buffer);
        console.log('Image optimized and saved to optimized.webp');
        resolve();
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

/**
 * Proxy and optimize existing image
 */
async function proxyImage(imagePath: string, width: number): Promise<void> {
  const url = new URL(`${API_BASE}/api/images/proxy`);
  url.searchParams.append('path', imagePath);
  url.searchParams.append('width', width.toString());
  url.searchParams.append('format', 'webp');
  url.searchParams.append('quality', '80');

  return new Promise((resolve, reject) => {
    https.get(url.toString(), (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync('proxied.webp', buffer);
        console.log('Image proxied and saved to proxied.webp');
        resolve();
      });
    }).on('error', reject);
  });
}

/**
 * Get cache statistics
 */
async function getCacheStats(): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(`${API_BASE}/api/images/cache/size`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const stats = JSON.parse(data);
        console.log('Cache Statistics:', stats);
        resolve();
      });
    }).on('error', reject);
  });
}

/**
 * Clear cache
 */
async function clearCache(): Promise<void> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/images/cache',
      method: 'DELETE',
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        console.log('Cache cleared:', JSON.parse(data));
        resolve();
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Run examples
async function main(): Promise<void> {
  try {
    console.log('Image Optimization Examples\n');

    // Example 1: Get cache stats
    console.log('1. Getting cache statistics...');
    await getCacheStats();

    // Example 2: Proxy image
    console.log('\n2. Proxying and optimizing image...');
    await proxyImage('images/sample.jpg', 1200);

    // Example 3: Get cache stats again
    console.log('\n3. Getting cache statistics after optimization...');
    await getCacheStats();

    console.log('\nExamples completed!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
