#!/usr/bin/env node

// Direct test of Cohere Staging API
import { CohereClientV2 } from 'cohere-ai';

if (!process.env.CO_API_KEY_STAGING) {
  console.error('ERROR: CO_API_KEY_STAGING not set');
  process.exit(1);
}

console.log('Testing direct Cohere Staging API call...');
console.log('API Key length:', process.env.CO_API_KEY_STAGING.length);

console.log('Creating client with:', {
  token: process.env.CO_API_KEY_STAGING ? '[REDACTED]' : 'NOT SET',
  baseURL: 'https://stg.api.cohere.com/v2'
});

// Try with apiKey instead of token
const client = new CohereClientV2({
  apiKey: process.env.CO_API_KEY_STAGING,
  baseURL: 'https://stg.api.cohere.com/v2'
});

async function test() {
  try {
    console.log('\nMaking chat request...');
    const response = await client.chat({
      model: 'c3-sweep-ecsydrkq-690h-fp16',
      messages: [
        {
          role: 'user',
          content: 'What is 2 + 2?'
        }
      ]
    });
    
    console.log('\nResponse:', response);
    if (response.message && response.message.content) {
      console.log('\nAssistant:', response.message.content[0].text);
    }
  } catch (error) {
    console.error('\nError:', error.message);
    if (error.status) {
      console.error('Status:', error.status);
    }
    if (error.body) {
      console.error('Body:', error.body);
    }
  }
}

test();