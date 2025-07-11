#!/usr/bin/env node

// Test with different auth methods
import fetch from 'node-fetch';

if (!process.env.CO_API_KEY_STAGING) {
  console.error('ERROR: CO_API_KEY_STAGING not set');
  process.exit(1);
}

async function testWithFetch() {
  console.log('Testing with direct fetch (like curl)...');
  
  try {
    const response = await fetch('https://stg.api.cohere.com/v2/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CO_API_KEY_STAGING}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'c3-sweep-ecsydrkq-690h-fp16',
        messages: [{ role: 'user', content: 'What is 2 + 2?' }]
      })
    });
    
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testWithFetch();