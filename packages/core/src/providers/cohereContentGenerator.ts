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
  FinishReason,
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
        for (const tool of request.config.tools) {
          if ('functionDeclarations' in tool && Array.isArray(tool.functionDeclarations)) {
            tools.push(...tool.functionDeclarations.map(fn => this.convertToCohereTool(fn)));
          } else {
            tools.push(this.convertToCohereTool(tool));
          }
        }
      }
      
      // Build request parameters, filtering out undefined values
      const requestParams: any = {
        model: this.model,
        messages,
      };

      // Only add tools if they exist and are not empty
      if (tools && tools.length > 0) {
        requestParams.tools = tools;
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
        // console.log('DEBUG: Event type:', event.type);
        switch (event.type) {
          case 'message-start':
            // Initialize usage metadata if available
            break;

          case 'content-delta':
            if (event.delta?.message?.content?.text) {
              const deltaText = event.delta.message.content.text;
              accumulatedText += deltaText;
              // Yield only the delta text, not accumulated
              yield this.createStreamResponse(deltaText, [], usageMetadata);
            }
            break;

          case 'tool-plan-delta':
            // Cohere sends a natural language plan before tool calls
            if (event.delta?.message?.toolPlan) {
              const planText = event.delta.message.toolPlan;
              accumulatedText += planText;
              yield this.createStreamResponse(planText, [], usageMetadata);
            }
            break;

          case 'tool-call-start':
            // console.log('DEBUG: Tool call started:', JSON.stringify(event, null, 2));
            // Initialize tool call from start event
            if (event.index !== undefined && event.delta?.message?.toolCalls) {
              const toolCall = event.delta.message.toolCalls;
              currentToolCalls[event.index] = {
                id: toolCall.id || `tool_${event.index}`,
                function: {
                  name: toolCall.function?.name || '',
                  arguments: ''
                }
              };
            }
            break;

          case 'tool-call-delta':
            // Update the arguments of the current tool call
            // console.log('DEBUG: Tool call delta:', JSON.stringify(event, null, 2));
            if (event.delta && typeof event.delta === 'object') {
              const toolCallDelta = event.delta as any;
              if (toolCallDelta.message?.toolCalls) {
                // Process the tool calls from the delta
                const deltaToolCall = toolCallDelta.message.toolCalls;
                if (deltaToolCall.id || deltaToolCall.function) {
                  // Find or create the tool call
                  const existingIndex = currentToolCalls.findIndex(tc => tc.id === (deltaToolCall.id || currentToolCalls[event.index || 0]?.id));
                  if (existingIndex >= 0) {
                    const tc = currentToolCalls[existingIndex];
                    if (tc.function && deltaToolCall.function?.arguments) {
                      tc.function.arguments = (tc.function.arguments || '') + deltaToolCall.function.arguments;
                    }
                  } else if (event.index !== undefined) {
                    // Initialize the tool call at the given index
                    if (!currentToolCalls[event.index]) {
                      currentToolCalls[event.index] = {
                        id: deltaToolCall.id || `tool_${event.index}`,
                        function: {
                          name: deltaToolCall.function?.name || '',
                          arguments: deltaToolCall.function?.arguments || ''
                        }
                      };
                    } else {
                      // Update existing tool call
                      const tc = currentToolCalls[event.index];
                      if (tc.function) {
                        if (deltaToolCall.function?.name) {
                          tc.function.name = deltaToolCall.function.name;
                        }
                        if (deltaToolCall.function?.arguments) {
                          tc.function.arguments = (tc.function.arguments || '') + deltaToolCall.function.arguments;
                        }
                      }
                    }
                  }
                }
              }
            }
            break;

          case 'tool-call-end':
            // Tool call is complete, yield the response with function calls
            if (currentToolCalls.length > 0) {
              const functionCalls = currentToolCalls.map(tc => ({
                id: tc.id,  // Include the ID for proper tool response matching
                name: tc.function?.name || '',
                args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
              }));
              // console.log('DEBUG: Tool calls completed:', JSON.stringify(functionCalls, null, 2));
              yield this.createStreamResponse(accumulatedText, functionCalls, usageMetadata);
            }
            break;

          case 'message-end':
            // Final usage metadata
            if (event.delta?.usage) {
              usageMetadata = this.convertUsageMetadata(event.delta.usage);
              // Only yield usage metadata update, not duplicate content
              yield this.createStreamResponse('', [], usageMetadata);
            }
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
      
      // Check if this content has function calls
      let hasFunctionCalls = false;
      let toolCalls: any[] = [];
      
      if (content.parts) {
        for (const part of content.parts) {
          if (typeof part === 'object' && 'functionCall' in part && part.functionCall) {
            hasFunctionCalls = true;
            toolCalls.push({
              id: part.functionCall.id || `${part.functionCall.name}_${Date.now()}`,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {})
              }
            });
          }
        }
      }
      
      // If this is an assistant message with tool calls, format it properly
      if (role === 'assistant' && hasFunctionCalls) {
        const text = this.extractTextFromContent(content);
        // For Cohere V2, assistant messages with tool calls should not have content
        messages.push({
          role: 'assistant',
          toolCalls: toolCalls
        });
      } else {
        // Regular message
        const text = this.extractTextFromContent(content);
        if (text) {
          messages.push({
            role,
            content: text,
          });
        }
      }

      // Handle function responses in content
      if (content.parts) {
        for (const part of content.parts) {
          if (typeof part === 'object' && 'functionResponse' in part && part.functionResponse) {
            // console.log('DEBUG: Converting function response:', JSON.stringify(part.functionResponse, null, 2));
            // Cohere expects tool responses to reference the original tool call ID
            // The functionResponse should have an id that matches the original tool call
            const toolCallId = part.functionResponse.id || part.functionResponse.name || 'unknown';
            // Extract the output or error from the response
            let content = '';
            if (part.functionResponse.response) {
              if (typeof part.functionResponse.response === 'string') {
                content = part.functionResponse.response;
              } else if (part.functionResponse.response.output) {
                content = String(part.functionResponse.response.output);
              } else if (part.functionResponse.response.error) {
                content = `Error: ${part.functionResponse.response.error}`;
              } else {
                content = JSON.stringify(part.functionResponse.response);
              }
            }
            
            messages.push({
              role: 'tool',
              toolCallId: toolCallId,
              content: content,
            });
          }
        }
      }
    }

    // console.log('DEBUG: Converted messages:', JSON.stringify(messages, null, 2));
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
    
    // Recursively convert and clean parameters for Cohere compatibility
    const convertTypes = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(convertTypes);
      } else if (obj && typeof obj === 'object') {
        const converted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          // Skip properties that Cohere doesn't support
          if (key === 'minLength' || key === 'minItems' || key === 'default') {
            continue;
          }
          
          if (key === 'type' && typeof value === 'string') {
            // Convert types to lowercase
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

    // Return a GenerateContentResponse with all required properties
    const response: GenerateContentResponse = {
      candidates: [{
        content: {
          role: 'model',
          parts: parts
        },
        finishReason: 'STOP' as FinishReason,
        index: 0
      }],
      text: text || '',
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      data: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
      usageMetadata: usageMetadata
    };
    
    return response;
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