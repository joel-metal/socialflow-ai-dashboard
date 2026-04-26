/**
 * Example: Using the Streaming Export API
 *
 * This demonstrates how to export large datasets using the streaming API
 * without loading everything into memory.
 */

import fs from 'fs';
import https from 'https';

// Configuration
const API_BASE = 'http://localhost:3000';
const ORGANIZATION_ID = 'org-123';
const START_DATE = '2025-09-25T00:00:00Z';
const END_DATE = '2026-03-25T23:59:59Z';

/**
 * Export analytics as CSV
 */
async function exportAnalyticsCSV(): Promise<void> {
  const url = new URL(`${API_BASE}/api/exports/analytics`);
  url.searchParams.append('organizationId', ORGANIZATION_ID);
  url.searchParams.append('format', 'csv');
  url.searchParams.append('startDate', START_DATE);
  url.searchParams.append('endDate', END_DATE);

  const file = fs.createWriteStream('analytics.csv');

  return new Promise((resolve, reject) => {
    https
      .get(url.toString(), (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Analytics CSV exported successfully');
          resolve();
        });
      })
      .on('error', reject);
  });
}

/**
 * Export analytics as JSON Lines
 */
async function exportAnalyticsJSON(): Promise<void> {
  const url = new URL(`${API_BASE}/api/exports/analytics`);
  url.searchParams.append('organizationId', ORGANIZATION_ID);
  url.searchParams.append('format', 'json');
  url.searchParams.append('startDate', START_DATE);
  url.searchParams.append('endDate', END_DATE);

  const file = fs.createWriteStream('analytics.jsonl');

  return new Promise((resolve, reject) => {
    https
      .get(url.toString(), (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Analytics JSONL exported successfully');
          resolve();
        });
      })
      .on('error', reject);
  });
}

/**
 * Export posts as CSV
 */
async function exportPostsCSV(): Promise<void> {
  const url = new URL(`${API_BASE}/api/exports/posts`);
  url.searchParams.append('organizationId', ORGANIZATION_ID);
  url.searchParams.append('format', 'csv');
  url.searchParams.append('startDate', START_DATE);
  url.searchParams.append('endDate', END_DATE);

  const file = fs.createWriteStream('posts.csv');

  return new Promise((resolve, reject) => {
    https
      .get(url.toString(), (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Posts CSV exported successfully');
          resolve();
        });
      })
      .on('error', reject);
  });
}

/**
 * Process JSON Lines stream line-by-line
 */
async function processAnalyticsStream(): Promise<void> {
  const url = new URL(`${API_BASE}/api/exports/analytics`);
  url.searchParams.append('organizationId', ORGANIZATION_ID);
  url.searchParams.append('format', 'json');
  url.searchParams.append('startDate', START_DATE);
  url.searchParams.append('endDate', END_DATE);

  return new Promise((resolve, reject) => {
    https
      .get(url.toString(), (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        let buffer = '';

        response.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');

          // Process complete lines
          for (let i = 0; i < lines.length - 1; i++) {
            if (lines[i].trim()) {
              const record = JSON.parse(lines[i]);
              console.log('Processed record:', record.id);
            }
          }

          // Keep incomplete line in buffer
          buffer = lines[lines.length - 1];
        });

        response.on('end', () => {
          if (buffer.trim()) {
            const record = JSON.parse(buffer);
            console.log('Processed record:', record.id);
          }
          console.log('Stream processing complete');
          resolve();
        });

        response.on('error', reject);
      })
      .on('error', reject);
  });
}

// Run examples
async function main(): Promise<void> {
  try {
    console.log('Starting export examples...\n');

    console.log('1. Exporting analytics as CSV...');
    await exportAnalyticsCSV();

    console.log('\n2. Exporting analytics as JSON Lines...');
    await exportAnalyticsJSON();

    console.log('\n3. Exporting posts as CSV...');
    await exportPostsCSV();

    console.log('\n4. Processing analytics stream line-by-line...');
    await processAnalyticsStream();

    console.log('\nAll exports completed successfully!');
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

main();
