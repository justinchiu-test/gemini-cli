import { CohereClientV2 } from 'cohere-ai';

const client = new CohereClientV2({
  token: process.env.COHERE_API_KEY,
});

async function testNoTools() {
  try {
    console.log('Testing without tools...');
    const stream = await client.chatStream({
      model: 'command-a-03-2025',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant.'
        },
        {
          role: 'user',
          content: 'What is 2+2?',
        },
      ],
    });

    let fullResponse = '';
    for await (const event of stream) {
      if (event.type === 'content-delta') {
        process.stdout.write(event.delta?.message?.content?.text || '');
        fullResponse += event.delta?.message?.content?.text || '';
      }
    }
    console.log('\nFull response:', fullResponse);
  } catch (error) {
    console.error('Error:', error);
  }
}

testNoTools();