import { CohereClientV2 } from 'cohere-ai';

const client = new CohereClientV2({
  token: process.env.COHERE_API_KEY,
});

async function testBasicChat() {
  try {
    console.log('Testing basic chat...');
    const stream = await client.chatStream({
      model: 'command-a-03-2025',
      messages: [
        {
          role: 'user',
          content: 'What is 2+2?',
        },
      ],
    });

    for await (const event of stream) {
      if (event.type === 'content-delta') {
        console.log('Delta:', event.delta?.message?.content?.text);
      } else if (event.type === 'message-end') {
        console.log('Message end:', event);
      }
    }
  } catch (error) {
    console.error('Error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error body:', error.body);
  }
}

testBasicChat();