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
  private recentToolResponses: Map<string, string> = new Map();

  constructor(config: {
    apiKey: string;
    model: string;
    baseURL?: string;
  }) {
    if (process.env.DEBUG) {
      console.log('[DEBUG] CohereContentGenerator constructor:');
      console.log('  - API Key received:', !!config.apiKey);
      console.log('  - API Key length:', config.apiKey.length);
      console.log('  - API Key:', config.apiKey);
      console.log('  - Base URL:', config.baseURL || 'default (https://api.cohere.com)');
      console.log('  - Model:', config.model);
    }
    
    const clientConfig: any = {
      token: config.apiKey,
    };
    
    if (config.baseURL) {
      clientConfig.environment = config.baseURL;
    }
    
    if (process.env.DEBUG) {
      console.log('[DEBUG] Creating CohereClientV2 with config:', clientConfig);
    }
    
    this.client = new CohereClientV2(clientConfig);
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
    // Safety check for Cohere: ensure we don't have orphaned tool calls
    // Check in the original Gemini format before conversion
    const contents = request.contents as Content[];
    if (this.checkForOrphanedToolCallsInContents(contents)) {
      console.error('Blocking API call due to orphaned tool calls in original contents');
      throw new Error(
        'Cannot make API call: Previous tool calls do not have matching responses. ' +
        'This usually indicates a timing issue in interactive mode. ' +
        'Please ensure tool responses are added to the conversation history before continuing.'
      );
    }
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


      if (process.env.DEBUG) {
        console.log('[DEBUG] Making Cohere API call:');
        console.log('  - Base URL:', this.baseURL || 'default');
        console.log('  - Model:', requestParams.model);
        console.log('  - Messages count:', requestParams.messages.length);
        console.log('  - Has tools:', !!requestParams.tools);
      }
      
      const stream = await this.client.chatStream(requestParams);

      let accumulatedText = '';
      let currentToolCalls: Cohere.ToolCallV2[] = [];
      let usageMetadata: UsageMetadata | undefined;
      let lastToolCallContent: string | undefined;

      for await (const event of stream) {
        // console.log('DEBUG: Event type:', event.type);
        switch (event.type) {
          case 'message-start':
            // Initialize usage metadata if available
            break;

          case 'content-delta':
            if (event.delta?.message?.content?.text) {
              const deltaText = event.delta.message.content.text;
              
              // Check if we should filter this text
              if (!this.isToolResultEcho(accumulatedText + deltaText)) {
                accumulatedText += deltaText;
                // Yield only the delta text, not accumulated
                yield this.createStreamResponse(deltaText, [], usageMetadata);
              } else {
                // This is an echo of tool results, skip it
                if (process.env.DEBUG) {
                  console.log('[DEBUG] Filtered tool result echo from Cohere response');
                }
              }
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
              // Use the ID from Cohere's response
              const toolId = toolCall.id || `tool_${event.index}`;
              currentToolCalls[event.index] = {
                id: toolId,
                function: {
                  name: toolCall.function?.name || '',
                  arguments: ''
                }
              };
              // console.log(`DEBUG: Tool call started with ID: ${toolId} for function: ${toolCall.function?.name}`);
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
              const functionCalls = currentToolCalls.map(tc => {
                let args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
                
                // Special handling for shell tool - normalize directory parameter
                if (tc.function?.name === 'run_shell_command' && args.directory) {
                  // If Cohere provides an absolute path but it's within the current directory,
                  // convert it to a relative path
                  const dir = args.directory;
                  if (dir.startsWith('/') && process.cwd && dir.startsWith(process.cwd())) {
                    // Convert absolute path to relative
                    args.directory = dir.substring(process.cwd().length + 1);
                  } else if (dir === process.cwd()) {
                    // If it's exactly the current directory, remove it
                    delete args.directory;
                  }
                }
                
                const fc = {
                  id: tc.id,  // Include the ID for proper tool response matching
                  name: tc.function?.name || '',
                  args: args,
                };
                // console.log('DEBUG: Yielding function call with ID:', fc.id, 'name:', fc.name);
                return fc;
              });
              // console.log('DEBUG: Tool calls completed:', JSON.stringify(functionCalls, null, 2));
              // Don't include accumulated text with function calls - just the function calls
              yield this.createStreamResponse('', functionCalls, usageMetadata);
            }
            break;

          case 'message-end':
            // Final usage metadata
            if (event.delta?.usage) {
              usageMetadata = this.convertUsageMetadata(event.delta.usage);
              // Only yield usage metadata update, not duplicate content
              yield this.createStreamResponse('', [], usageMetadata);
            }
            // Clear recent tool responses after message completes
            // Keep them for a bit in case there are multiple messages
            if (this.recentToolResponses.size > 10) {
              this.recentToolResponses.clear();
            }
            break;
        }
      }
    } catch (error) {
      if (process.env.DEBUG) {
        console.log('[DEBUG] Cohere API Error:');
        console.log('  - Error type:', error?.constructor?.name);
        console.log('  - Error message:', (error as any)?.message);
        console.log('  - Error details:', JSON.stringify(error, null, 2));
      }
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

  supportsJsonMode(): boolean {
    // Cohere doesn't support JSON mode / generateJson
    return false;
  }

  async getTier(): Promise<undefined> {
    // Cohere doesn't have user tiers like Google's API
    return undefined;
  }

  private isToolResultEcho(text: string): boolean {
    // Check if this text is just echoing a recent tool response
    const trimmedText = text.trim();
    
    // Check for code block wrappers that Cohere often adds
    const codeBlockPattern = /^```[\s\S]*?```$|^<pre><code>[\s\S]*?<\/code><\/pre>$/;
    let innerContent = trimmedText;
    
    if (codeBlockPattern.test(trimmedText)) {
      // Extract content from code blocks
      innerContent = trimmedText
        .replace(/^```[a-z]*\n?/, '')
        .replace(/\n?```$/, '')
        .replace(/^<pre><code>/, '')
        .replace(/<\/code><\/pre>$/, '')
        .trim();
    }
    
    // Check if this matches any recent tool response
    for (const [_, response] of this.recentToolResponses) {
      if (response.trim() === innerContent || response.trim().includes(innerContent)) {
        return true;
      }
    }
    
    return false;
  }

  private checkForOrphanedToolCalls(messages: Cohere.ChatMessageV2[]): boolean {
    const toolCallIds = new Set<string>();
    const toolResponseIds = new Set<string>();
    
    for (const msg of messages) {
      if (msg.role === 'assistant' && (msg as any).toolCalls) {
        const toolCalls = (msg as any).toolCalls;
        for (const tc of toolCalls) {
          toolCallIds.add(tc.id);
        }
      } else if (msg.role === 'tool') {
        const toolResponseId = (msg as any).toolCallId;
        toolResponseIds.add(toolResponseId);
      }
    }
    
    // Check if any tool calls don't have responses
    for (const tcId of toolCallIds) {
      if (!toolResponseIds.has(tcId)) {
        console.warn(`Orphaned tool call detected: ${tcId} has no matching response`);
        return true;
      }
    }
    
    return false;
  }

  private checkForOrphanedToolCallsInContents(contents: Content[]): boolean {
    // Check if the last model message has function calls but no subsequent function responses
    let lastModelMessageIndex = -1;
    let lastModelHasFunctionCalls = false;
    
    // Find the last model message and check if it has function calls
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'model') {
        lastModelMessageIndex = i;
        const parts = contents[i].parts;
        if (parts) {
          for (const part of parts) {
            if (typeof part === 'object' && 'functionCall' in part && part.functionCall) {
              lastModelHasFunctionCalls = true;
              break;
            }
          }
        }
        break;
      }
    }
    
    // If last model message has function calls, check if there are any function responses after it
    if (lastModelHasFunctionCalls && lastModelMessageIndex >= 0) {
      let hasSubsequentFunctionResponse = false;
      
      for (let i = lastModelMessageIndex + 1; i < contents.length; i++) {
        const parts = contents[i].parts;
        if (parts) {
          for (const part of parts) {
            if (typeof part === 'object' && 'functionResponse' in part && part.functionResponse) {
              hasSubsequentFunctionResponse = true;
              break;
            }
          }
        }
        if (hasSubsequentFunctionResponse) break;
      }
      
      if (!hasSubsequentFunctionResponse) {
        console.warn('Orphaned tool calls detected: Last model message has function calls but no subsequent responses');
        return true;
      }
    }
    
    return false;
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
    
    // Debug: Log raw contents structure
    // if (contents.length > 1) {
    //   console.log('\nDEBUG: Raw conversation history from Gemini:');
    //   contents.forEach((content, idx) => {
    //     const partTypes = content.parts?.map(part => {
    //       if (typeof part === 'string') return 'text';
    //       if ('text' in part) return 'text';
    //       if ('functionCall' in part && part.functionCall) return `functionCall(${part.functionCall.name})`;
    //       if ('functionResponse' in part && part.functionResponse) return `functionResponse(${part.functionResponse.name})`;
    //       return 'unknown';
    //     }).join(', ') || 'no parts';
    //     console.log(`  ${idx}. ${content.role}: [${partTypes}]`);
    //   });
    // }
    
    // First pass: collect all messages and tool responses
    const tempMessages: Array<{type: 'message' | 'tool_response', data: any}> = [];
    
    contents.forEach((content, contentIdx) => {
      const role = content.role === 'user' ? 'user' : 'assistant';
      
      // Check if this content has function calls
      let hasFunctionCalls = false;
      let toolCalls: any[] = [];
      let hasFunctionResponses = false;
      let functionResponses: any[] = [];
      
      if (content.parts) {
        content.parts.forEach((part, partIdx) => {
          if (typeof part === 'object' && 'functionCall' in part && part.functionCall) {
            hasFunctionCalls = true;
            // Generate a stable ID based on content index and part index
            const toolCallId = part.functionCall.id || `${part.functionCall.name}_${contentIdx}_${partIdx}`;
            toolCalls.push({
              id: toolCallId,
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args || {})
              }
            });
          } else if (typeof part === 'object' && 'functionResponse' in part && part.functionResponse) {
            hasFunctionResponses = true;
            const toolCallId = part.functionResponse.id || part.functionResponse.name || 'unknown';
            if (process.env.DEBUG) {
              console.log('DEBUG: Processing function response with ID:', toolCallId, 'name:', part.functionResponse.name);
              console.log('DEBUG: Full functionResponse object:', JSON.stringify(part.functionResponse, null, 2));
            }
            let responseContent = '';
            if (part.functionResponse.response) {
              if (typeof part.functionResponse.response === 'string') {
                responseContent = part.functionResponse.response;
              } else if (part.functionResponse.response.output) {
                responseContent = String(part.functionResponse.response.output);
              } else if (part.functionResponse.response.error) {
                responseContent = `Error: ${part.functionResponse.response.error}`;
              } else {
                responseContent = JSON.stringify(part.functionResponse.response);
              }
            }
            functionResponses.push({
              role: 'tool',
              toolCallId: toolCallId,
              content: responseContent,
            });
            // Track this tool response to filter echoes later
            this.recentToolResponses.set(toolCallId, responseContent);
          }
        });
      }
      
      // Handle different content types
      if (hasFunctionResponses) {
        // This is a user message containing function responses
        // Add them as tool messages
        for (const resp of functionResponses) {
          tempMessages.push({ type: 'tool_response', data: resp });
        }
      } else if (role === 'assistant' && hasFunctionCalls) {
        // Assistant message with tool calls
        tempMessages.push({
          type: 'message',
          data: {
            role: 'assistant',
            toolCalls: toolCalls
          }
        });
      } else {
        // Regular message
        const text = this.extractTextFromContent(content);
        if (text) {
          tempMessages.push({
            type: 'message',
            data: {
              role,
              content: text,
            }
          });
        }
      }
    });

    // Second pass: Build final message array with proper ordering
    // Track which tool responses have been added
    const addedToolResponses = new Set<string>();
    
    for (let i = 0; i < tempMessages.length; i++) {
      const current = tempMessages[i];
      
      if (current.type === 'message') {
        messages.push(current.data);
        
        // If this is an assistant message with tool calls, we MUST add tool responses immediately
        if (current.data.role === 'assistant' && current.data.toolCalls) {
          const toolCallIds = current.data.toolCalls.map((tc: any) => tc.id);
          
          // Find ALL matching tool responses in the entire message list
          for (const tcId of toolCallIds) {
            let found = false;
            // Search through all temp messages for this tool response
            for (let j = 0; j < tempMessages.length; j++) {
              const candidate = tempMessages[j];
              if (candidate.type === 'tool_response' && 
                  candidate.data.toolCallId === tcId &&
                  !addedToolResponses.has(tcId)) {
                messages.push(candidate.data);
                addedToolResponses.add(tcId);
                found = true;
                break; // Found the response for this ID
              }
            }
            if (!found) {
              console.log(`WARNING: No tool response found for tool call ID: ${tcId}`);
              // Additional debug info
              if (process.env.DEBUG) {
                console.log('Available tool responses:');
                tempMessages.forEach((msg, idx) => {
                  if (msg.type === 'tool_response') {
                    console.log(`  - Index ${idx}: ${msg.data.toolCallId}`);
                  }
                });
              }
            }
          }
        }
      } else if (current.type === 'tool_response') {
        // Only add if not already added
        if (!addedToolResponses.has(current.data.toolCallId)) {
          messages.push(current.data);
          addedToolResponses.add(current.data.toolCallId);
        }
      }
    }

    // Debug logging for conversation history issues
    if (contents.length > 1 && process.env.DEBUG) {
      console.log('\n=== COHERE CONVERSATION HISTORY DEBUG ===');
      console.log('Raw Gemini contents:', contents.length, 'items');
      
      // Log raw contents structure
      contents.forEach((content, idx) => {
        const partTypes = content.parts?.map(part => {
          if (typeof part === 'string') return 'text';
          if ('text' in part) return 'text';
          if ('functionCall' in part && part.functionCall) return `functionCall(${part.functionCall.name})`;
          if ('functionResponse' in part && part.functionResponse) return `functionResponse(${part.functionResponse.name})`;
          return 'unknown';
        }).join(', ') || 'no parts';
        console.log(`  Gemini[${idx}] ${content.role}: [${partTypes}]`);
      });
      
      console.log('\nConverted Cohere messages:');
      // Check for orphaned tool calls
      const assistantToolCalls = new Map<string, number>();
      const toolResponses = new Set<string>();
      
      messages.forEach((msg, idx) => {
        if (msg.role === 'assistant' && (msg as any).toolCalls) {
          const toolIds = (msg as any).toolCalls.map((tc: any) => tc.id);
          console.log(`  Cohere[${idx}] Assistant with tool_calls: ${toolIds.join(', ')}`);
          toolIds.forEach((id: string) => assistantToolCalls.set(id, idx));
        } else if (msg.role === 'tool') {
          const toolId = (msg as any).toolCallId;
          console.log(`  Cohere[${idx}] Tool response for: ${toolId}`);
          toolResponses.add(toolId);
        } else if (msg.role !== 'system') {
          const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
          console.log(`  Cohere[${idx}] ${msg.role}: ${contentStr ? contentStr.substring(0, 50) + '...' : 'no content'}`);
        }
      });
      
      // Check for missing responses
      console.log('\nTool call analysis:');
      assistantToolCalls.forEach((idx, toolId) => {
        if (!toolResponses.has(toolId)) {
          console.log(`  ❌ MISSING RESPONSE for tool call: ${toolId} at position ${idx}`);
        } else {
          console.log(`  ✓ Found response for: ${toolId}`);
        }
      });
      console.log('=== END DEBUG ===\n');
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
    if (process.env.DEBUG) {
      console.log('[DEBUG] Converting error:');
      console.log('  - Error name:', error?.name);
      console.log('  - Error message:', error?.message);
      console.log('  - Error status:', error?.status);
      console.log('  - Error statusCode:', error?.statusCode);
      console.log('  - Error response:', error?.response);
      console.log('  - Full error:', error);
    }
    
    if (error.name === 'CohereError') {
      return new Error(`Cohere API Error: ${error.message}`);
    }
    if (error.name === 'CohereTimeoutError') {
      return new Error(`Cohere API Timeout: ${error.message}`);
    }
    return error;
  }
}
