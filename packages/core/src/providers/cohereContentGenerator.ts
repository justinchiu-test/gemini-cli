/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CohereClientV2 } from 'cohere-ai';
import type { Cohere } from 'cohere-ai';
import type {
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  Content,
  Part,
  FunctionCall,
  FunctionResponse,
  UsageMetadata,
} from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';

export class CohereContentGenerator implements ContentGenerator {
  private client: CohereClientV2;
  private model: string;
  private baseURL?: string;

  constructor(config: {
    apiKey: string;
    model: string;
    baseURL?: string;
  }) {
    this.client = new CohereClientV2({
      token: config.apiKey,
      ...(config.baseURL && { baseURL: config.baseURL }),
    });
    this.model = config.model;
    this.baseURL = config.baseURL;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    // For non-streaming, we'll collect the stream and return the final result
    const stream = await this.generateContentStream(request);
    let lastResponse: GenerateContentResponse | undefined;
    
    for await (const response of stream) {
      lastResponse = response;
    }
    
    if (!lastResponse) {
      throw new Error('No response from Cohere API');
    }
    
    return lastResponse;
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.doGenerateContentStream(request);
  }

  private async *doGenerateContentStream(
    request: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    try {
      const messages = this.convertToCohereChatMessages(request);
      let tools: Cohere.ToolV2[] = [];
      if (request.config?.tools) {
        console.log('DEBUG: Raw tools from request:', JSON.stringify(request.config.tools, null, 2));
        for (const tool of request.config.tools) {
          console.log('DEBUG: Processing tool:', JSON.stringify(tool, null, 2));
          if ('functionDeclarations' in tool && Array.isArray(tool.functionDeclarations)) {
            console.log('DEBUG: Tool has functionDeclarations');
            tools.push(...tool.functionDeclarations.map(fn => this.convertToCohereTool(fn)));
          } else {
            console.log('DEBUG: Tool is direct function');
            tools.push(this.convertToCohereTool(tool));
          }
        }
        console.log('DEBUG: Final converted tools:', JSON.stringify(tools, null, 2));
      }
      
      // Build request parameters, filtering out undefined values
      const requestParams: any = {
        model: this.model,
        messages,
      };

      // Only add tools if they exist and are not empty
      // Temporarily limit to first 3 tools to test
      if (tools && tools.length > 0) {
        requestParams.tools = tools.slice(0, 3);
        console.log('DEBUG: Limited tools count to 3:', tools.length);
      }

      // Only add optional parameters if they are defined
      if (request.config?.temperature !== undefined) {
        requestParams.temperature = request.config.temperature;
      }
      if (request.config?.maxOutputTokens !== undefined) {
        requestParams.maxTokens = request.config.maxOutputTokens;
      }
      if (request.config?.stopSequences !== undefined && request.config.stopSequences.length > 0) {
        requestParams.stopSequences = request.config.stopSequences;
      }
      if (request.config?.topP !== undefined) {
        requestParams.p = request.config.topP;
      }
      if (request.config?.topK !== undefined) {
        requestParams.k = request.config.topK;
      }


      const stream = await this.client.chatStream(requestParams);

      let accumulatedText = '';
      let currentToolCalls: Cohere.ToolCallV2[] = [];
      let usageMetadata: UsageMetadata | undefined;

      for await (const event of stream) {
        switch (event.type) {
          case 'message-start':
            // Initialize usage metadata if available
            break;

          case 'content-delta':
            if (event.delta?.message?.content?.text) {
              accumulatedText += event.delta.message.content.text;
              yield this.createStreamResponse(accumulatedText, [], usageMetadata);
            }
            break;

          case 'tool-call-start':
            // Tool call started
            break;

          case 'tool-call-delta':
            // Update the arguments of the current tool call
            if (event.delta && typeof event.delta === 'object') {
              const toolCallDelta = event.delta as any;
              if (toolCallDelta.toolCall) {
                // Find or create the tool call
                const existingIndex = currentToolCalls.findIndex(tc => tc.id === toolCallDelta.toolCall.id);
                if (existingIndex >= 0) {
                  const tc = currentToolCalls[existingIndex];
                  if (tc.function && toolCallDelta.toolCall.function?.arguments) {
                    tc.function.arguments = (tc.function.arguments || '') + toolCallDelta.toolCall.function.arguments;
                  }
                } else {
                  currentToolCalls.push(toolCallDelta.toolCall);
                }
              }
            }
            break;

          case 'tool-call-end':
            // Tool call is complete, yield the response with function calls
            if (currentToolCalls.length > 0) {
              const functionCalls = currentToolCalls.map(tc => ({
                name: tc.function?.name || '',
                args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
              }));
              yield this.createStreamResponse(accumulatedText, functionCalls, usageMetadata);
            }
            break;

          case 'message-end':
            // Final usage metadata
            if (event.delta?.usage) {
              usageMetadata = this.convertUsageMetadata(event.delta.usage);
            }
            // Yield final response
            yield this.createStreamResponse(accumulatedText, 
              currentToolCalls.map(tc => ({
                name: tc.function?.name || '',
                args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
              })), 
              usageMetadata
            );
            break;
        }
      }
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Cohere doesn't have a direct token counting API
    // We'll estimate based on the response from a chat request
    try {
      const messages = this.convertToCohereChatMessages(request);

      // Make a non-streaming request to get token counts
      const response = await this.client.chat({
        model: this.model,
        messages,
        maxTokens: 1, // Minimal response to just get token counts
      });

      return {
        totalTokens: response.usage?.tokens?.inputTokens || 0,
      };
    } catch (error) {
      throw this.convertError(error);
    }
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Embedding is not currently supported for Cohere
    throw new Error('Embedding is not supported for Cohere provider');
  }

  private convertToCohereChatMessages(request: GenerateContentParameters): Cohere.ChatMessageV2[] {
    const messages: Cohere.ChatMessageV2[] = [];

    // Add system instruction if present
    if (request.config?.systemInstruction) {
      const systemText = this.extractTextFromContentUnion(request.config.systemInstruction);
      if (systemText) {
        messages.push({
          role: 'system',
          content: systemText,
        });
      }
    }

    // Convert contents to messages - contents is always Content[]
    const contents = request.contents as Content[];
    for (const content of contents) {
      const role = content.role === 'user' ? 'user' : 'assistant';
      const text = this.extractTextFromContent(content);
      
      if (text) {
        messages.push({
          role,
          content: text,
        });
      }

      // Handle function responses in content
      if (content.parts) {
        for (const part of content.parts) {
          if (typeof part === 'object' && 'functionResponse' in part && part.functionResponse) {
            messages.push({
              role: 'tool',
              toolCallId: part.functionResponse.name || 'unknown',
              content: JSON.stringify(part.functionResponse.response),
            });
          }
        }
      }
    }

    return messages;
  }

  private extractTextFromContent(content: Content): string {
    if (!content.parts) return '';
    
    return content.parts
      .map(part => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && 'text' in part) return part.text;
        return '';
      })
      .filter(text => text)
      .join(' ');
  }

  private extractTextFromContentUnion(content: any): string {
    if (typeof content === 'string') return content;
    if (content && typeof content === 'object') {
      return this.extractTextFromContent(content);
    }
    return '';
  }

  private convertToCohereTool(tool: any): Cohere.ToolV2 {
    // Handle both direct tool objects and function declarations
    const functionDecl = tool.functionDeclaration || tool.function || tool;
    
    // Convert the parameters to ensure Cohere compatibility
    const parameters = this.convertParametersForCohere(functionDecl.parameters);
    
    return {
      type: 'function',
      function: {
        name: functionDecl.name,
        description: functionDecl.description,
        parameters,
      },
    };
  }

  private convertParametersForCohere(params: any): any {
    if (!params) return params;
    
    // Recursively convert type fields from uppercase to lowercase
    const convertTypes = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(convertTypes);
      } else if (obj && typeof obj === 'object') {
        const converted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (key === 'type' && typeof value === 'string') {
            converted[key] = value.toLowerCase();
          } else {
            converted[key] = convertTypes(value);
          }
        }
        return converted;
      }
      return obj;
    };
    
    return convertTypes(params);
  }

  private createStreamResponse(
    text: string,
    functionCalls: FunctionCall[],
    usageMetadata?: UsageMetadata,
  ): GenerateContentResponse {
    const parts: Part[] = [];
    
    if (text) {
      parts.push({ text });
    }
    
    if (functionCalls.length > 0) {
      parts.push(...functionCalls.map(fc => ({ functionCall: fc })));
    }

    // Return a simple response structure that matches GenerateContentResponse
    return {
      text: text || '',
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
    } as GenerateContentResponse;
  }

  private convertUsageMetadata(cohereUsage: any): UsageMetadata {
    return {
      promptTokenCount: cohereUsage.tokens?.inputTokens || 0,
      totalTokenCount: (cohereUsage.tokens?.inputTokens || 0) + (cohereUsage.tokens?.outputTokens || 0),
    };
  }

  private convertError(error: any): Error {
    if (error.name === 'CohereError') {
      return new Error(`Cohere API Error: ${error.message}`);
    }
    if (error.name === 'CohereTimeoutError') {
      return new Error(`Cohere API Timeout: ${error.message}`);
    }
    return error;
  }
}