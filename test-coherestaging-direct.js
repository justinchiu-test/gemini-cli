#!/usr/bin/env node

// Direct test of Cohere Staging API
const { CohereClientV2 } = require('cohere-ai');

if (!process.env.CO_API_KEY_STAGING) {
  console.error('ERROR: CO_API_KEY_STAGING not set');
  process.exit(1);
}

console.log('Testing direct Cohere Staging API call...');
console.log('API Key length:', process.env.CO_API_KEY_STAGING.length);

const client = new CohereClientV2({
  token: process.env.CO_API_KEY_STAGING,
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
    console.error('\nError:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

test();