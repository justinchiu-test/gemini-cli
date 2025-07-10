/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CohereContentGenerator } from './cohereContentGenerator.js';
import { CohereClientV2 } from 'cohere-ai';
import type { Cohere } from 'cohere-ai';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  Content,
  Part,
} from '@google/genai';
import { Type } from '@google/genai';

// Mock the Cohere client
vi.mock('cohere-ai', () => {
  const mockChatStream = vi.fn();
  const mockChat = vi.fn();
  
  return {
    CohereClientV2: vi.fn().mockImplementation(() => ({
      chatStream: mockChatStream,
      chat: mockChat,
    })),
  };
});

describe('CohereContentGenerator', () => {
  let generator: CohereContentGenerator;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new CohereContentGenerator({
      apiKey: 'test-api-key',
      model: 'command-a-03-2025',
      baseURL: 'https://api.cohere.ai/compatibility/v1',
    });
    
    // Get the mock instance
    mockClient = vi.mocked(CohereClientV2).mock.results[0].value;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(CohereClientV2).toHaveBeenCalledWith({
        token: 'test-api-key',
        baseURL: 'https://api.cohere.ai/compatibility/v1',
      });
    });

    it('should initialize without baseURL if not provided', () => {
      vi.clearAllMocks();
      new CohereContentGenerator({
        apiKey: 'test-api-key',
        model: 'command-a-03-2025',
      });
      
      expect(CohereClientV2).toHaveBeenCalledWith({
        token: 'test-api-key',
      });
    });
  });

  describe('generateContentStream', () => {
    it('should handle simple text response', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message-start' };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: 'Hello' } } },
          };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: ' world!' } } },
          };
          yield {
            type: 'message-end',
            delta: {
              usage: {
                tokens: {
                  inputTokens: 10,
                  outputTokens: 2,
                },
              },
            },
          };
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
        ] as Content[],
      };

      const stream = await generator.generateContentStream(request);
      const responses: GenerateContentResponse[] = [];
      
      for await (const response of stream) {
        responses.push(response);
      }

      expect(responses.length).toBeGreaterThan(0);
      expect(responses[responses.length - 1].text).toBe('Hello world!');
      expect(mockClient.chatStream).toHaveBeenCalledWith({
        model: 'command-a-03-2025',
        messages: [
          { role: 'user', content: 'Hello' },
        ],
        tools: undefined,
        temperature: undefined,
        maxTokens: undefined,
        stopSequences: undefined,
        p: undefined,
        k: undefined,
      });
    });

    it('should handle tool calls', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message-start' };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: 'I\'ll check the weather for you.' } } },
          };
          yield { type: 'tool-call-start' };
          yield {
            type: 'tool-call-delta',
            delta: {
              toolCall: {
                id: 'tool_123',
                function: {
                  name: 'get_weather',
                  arguments: '{"location": "Paris"}',
                },
              },
            },
          };
          yield { type: 'tool-call-end' };
          yield { type: 'message-end' };
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'What\'s the weather in Paris?' }] },
        ] as Content[],
        config: {
          tools: [{
            functionDeclarations: [{
              name: 'get_weather',
              description: 'Get the weather for a location',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  location: { type: Type.STRING },
                },
                required: ['location'],
              },
            }],
          }],
        },
      };

      const stream = await generator.generateContentStream(request);
      const responses: GenerateContentResponse[] = [];
      
      for await (const response of stream) {
        responses.push(response);
      }

      const lastResponse = responses[responses.length - 1];
      expect(lastResponse.functionCalls).toBeDefined();
      expect(lastResponse.functionCalls).toHaveLength(1);
      expect(lastResponse.functionCalls![0]).toEqual({
        name: 'get_weather',
        args: { location: 'Paris' },
      });
    });

    it('should handle system instructions', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message-start' };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: 'Meow!' } } },
          };
          yield { type: 'message-end' };
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
        ] as Content[],
        config: {
          systemInstruction: 'You are a helpful cat assistant. Always respond with cat sounds.',
        },
      };

      const stream = await generator.generateContentStream(request);
      const responses: GenerateContentResponse[] = [];
      
      for await (const response of stream) {
        responses.push(response);
      }

      expect(mockClient.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful cat assistant. Always respond with cat sounds.' },
            { role: 'user', content: 'Hello' },
          ],
        })
      );
    });

    it('should handle errors', async () => {
      const cohereError = new Error('Cohere API Error');
      cohereError.name = 'CohereError';
      
      mockClient.chatStream.mockRejectedValue(cohereError);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
        ] as Content[],
      };

      await expect(async () => {
        const stream = await generator.generateContentStream(request);
        for await (const _response of stream) {
          // Consume the stream
        }
      }).rejects.toThrow('Cohere API Error: Cohere API Error');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'CohereTimeoutError';
      
      mockClient.chatStream.mockRejectedValue(timeoutError);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
        ] as Content[],
      };

      await expect(async () => {
        const stream = await generator.generateContentStream(request);
        for await (const _response of stream) {
          // Consume the stream
        }
      }).rejects.toThrow('Cohere API Timeout: Request timed out');
    });
  });

  describe('generateContent', () => {
    it('should collect stream and return final response', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message-start' };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: 'Part 1' } } },
          };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: ' Part 2' } } },
          };
          yield { type: 'message-end' };
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
        ] as Content[],
      };

      const response = await generator.generateContent(request);
      
      expect(response.text).toBe('Part 1 Part 2');
    });

    it('should throw error if no response', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          // Empty stream
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
        ] as Content[],
      };

      await expect(generator.generateContent(request)).rejects.toThrow(
        'No response from Cohere API'
      );
    });
  });

  describe('countTokens', () => {
    it('should estimate tokens using chat API', async () => {
      mockClient.chat.mockResolvedValue({
        usage: {
          tokens: {
            inputTokens: 42,
            outputTokens: 10,
          },
        },
      });

      const request = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Count my tokens' }] },
        ] as Content[],
      };

      const result = await generator.countTokens(request);
      
      expect(result.totalTokens).toBe(42);
      expect(mockClient.chat).toHaveBeenCalledWith({
        model: 'command-a-03-2025',
        messages: [
          { role: 'user', content: 'Count my tokens' },
        ],
        maxTokens: 1,
      });
    });

    it('should handle errors in token counting', async () => {
      const error = new Error('Token counting failed');
      error.name = 'CohereError';
      mockClient.chat.mockRejectedValue(error);

      const request = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Count my tokens' }] },
        ] as Content[],
      };

      await expect(generator.countTokens(request)).rejects.toThrow(
        'Cohere API Error: Token counting failed'
      );
    });
  });

  describe('embedContent', () => {
    it('should throw not supported error', async () => {
      await expect(
        generator.embedContent({
          model: 'embed-english-v3.0',
          contents: ['test text'],
        })
      ).rejects.toThrow('Embedding is not supported for Cohere provider');
    });
  });

  describe('message conversion', () => {
    it('should handle function responses in content', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message-start' };
          yield {
            type: 'content-delta',
            delta: { message: { content: { text: 'The weather is sunny.' } } },
          };
          yield { type: 'message-end' };
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'What\'s the weather?' }] },
          { 
            role: 'model', 
            parts: [
              { text: 'I\'ll check the weather for you.' },
              { functionCall: { name: 'get_weather', args: { location: 'Paris' } } },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  name: 'get_weather',
                  response: { temperature: 22, condition: 'sunny' },
                },
              },
            ],
          },
        ] as Content[],
      };

      const stream = await generator.generateContentStream(request);
      for await (const _response of stream) {
        // Consume stream
      }

      expect(mockClient.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'What\'s the weather?' },
            { role: 'assistant', content: 'I\'ll check the weather for you.' },
            {
              role: 'tool',
              toolCallId: 'get_weather',
              content: '{"temperature":22,"condition":"sunny"}',
            },
          ],
        })
      );
    });

    it('should handle complex tool conversion', async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: 'message-start' };
          yield { type: 'message-end' };
        },
      };

      mockClient.chatStream.mockResolvedValue(mockStream);

      const request: GenerateContentParameters = {
        model: 'command-a-03-2025',
        contents: [
          { role: 'user', parts: [{ text: 'Test' }] },
        ] as Content[],
        config: {
          tools: [
            {
              functionDeclarations: [{
                name: 'complex_tool',
                description: 'A complex tool',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    nested: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING },
                      },
                    },
                  },
                },
              }],
            },
          ],
        },
      };

      const stream = await generator.generateContentStream(request);
      for await (const _response of stream) {
        // Consume stream
      }

      expect(mockClient.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: 'function',
              function: {
                name: 'complex_tool',
                description: 'A complex tool',
                parameters: {
                  type: Type.OBJECT,
                  properties: {
                    nested: {
                      type: Type.OBJECT,
                      properties: {
                        value: { type: Type.STRING },
                      },
                    },
                  },
                },
              },
            },
          ],
        })
      );
    });
  });
});