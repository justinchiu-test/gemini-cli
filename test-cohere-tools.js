import { CohereClientV2 } from 'cohere-ai';

const client = new CohereClientV2({
  token: process.env.COHERE_API_KEY,
});

async function testWithTools() {
  try {
    console.log('Testing with a simple tool...');
    const stream = await client.chatStream({
      model: 'command-a-03-2025',
      messages: [
        {
          role: 'user',
          content: 'What is 2+2? Use the calculator tool.',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'calculator',
            description: 'Simple calculator',
            parameters: {
              type: 'object',
              properties: {
                expression: {
                  type: 'string',
                  description: 'Mathematical expression',
                },
              },
              required: ['expression'],
            },
          },
        },
      ],
    });

    for await (const event of stream) {
      console.log('Event:', event.type, event);
    }
  } catch (error) {
    console.error('Error:', error);
    console.error('Error body:', error.body);
    console.error('Error message:', error.message);
  }
}

testWithTools();