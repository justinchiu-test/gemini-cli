#!/usr/bin/env node

import { CohereClientV2 } from 'cohere-ai';

if (!process.env.CO_API_KEY_STAGING) {
  console.error('CO_API_KEY_STAGING not set');
  process.exit(1);
}

console.log('Testing with token parameter...');
try {
  const client1 = new CohereClientV2({
    token: process.env.CO_API_KEY_STAGING,
    baseURL: 'https://stg.api.cohere.ai'
  });
  const response1 = await client1.chat({
    model: 'c3-sweep-ecsydrkq-690h-fp16',
    messages: [{ role: 'user', content: 'Hi' }]
  });
  console.log('✅ Success with token:', response1.message?.content?.[0]?.text);
} catch (error) {
  console.log('❌ Failed with token:', error.status, error.message);
}

console.log('\nTesting with apiKey parameter...');
try {
  const client2 = new CohereClientV2({
    apiKey: process.env.CO_API_KEY_STAGING,
    baseURL: 'https://stg.api.cohere.ai'
  });
  const response2 = await client2.chat({
    model: 'c3-sweep-ecsydrkq-690h-fp16',
    messages: [{ role: 'user', content: 'Hi' }]
  });
  console.log('✅ Success with apiKey:', response2.message?.content?.[0]?.text);
} catch (error) {
  console.log('❌ Failed with apiKey:', error.status, error.message);
}
