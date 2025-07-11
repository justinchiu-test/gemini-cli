/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { UserTierId } from '../code_assist/types.js';
import { CohereContentGenerator } from '../providers/cohereContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  getTier?(): Promise<UserTierId | undefined>;

  /**
   * Indicates whether this content generator supports JSON mode / generateJson.
   * Optional method - if not implemented, assumed to be true for backward compatibility.
   */
  supportsJsonMode?(): boolean;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_COHERE = 'cohere-api-key',
  USE_COHERE_STAGING = 'cohere-staging-api-key',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;
  const cohereApiKey = process.env.COHERE_API_KEY || undefined;
  const cohereStagingApiKey = process.env.CO_API_KEY_STAGING || undefined;
  if (process.env.DEBUG && authType === AuthType.USE_COHERE_STAGING) {
    console.log('[DEBUG] Environment check for CO_API_KEY_STAGING:');
    console.log('  - Raw value exists:', !!process.env.CO_API_KEY_STAGING);
    console.log('  - Processed value exists:', !!cohereStagingApiKey);
  }

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
      contentGeneratorConfig.proxy,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_COHERE && cohereApiKey) {
    contentGeneratorConfig.apiKey = cohereApiKey;
    contentGeneratorConfig.vertexai = false;
    contentGeneratorConfig.model = 'command-a-03-2025';
    
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_COHERE_STAGING && cohereStagingApiKey) {
    if (process.env.DEBUG) {
      console.log('[DEBUG] Configuring Cohere Staging:');
      console.log('  - API Key available:', !!cohereStagingApiKey);
      console.log('  - API Key length:', cohereStagingApiKey.length);
      console.log('  - API Key starts with:', cohereStagingApiKey.substring(0, 10) + '...');
    }
    contentGeneratorConfig.apiKey = cohereStagingApiKey;
    contentGeneratorConfig.vertexai = false;
    contentGeneratorConfig.model = 'c3-sweep-ecsydrkq-690h-fp16';
    
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      gcConfig,
      sessionId,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_COHERE && config.apiKey) {
    return new CohereContentGenerator({
      apiKey: config.apiKey,
      model: config.model || 'command-a-03-2025',
    });
  }

  if (config.authType === AuthType.USE_COHERE_STAGING && config.apiKey) {
    if (process.env.DEBUG) {
      console.log('[DEBUG] Creating Cohere Staging Content Generator:');
      console.log('  - Base URL: https://stg.api.cohere.ai/compatibility/v1');
      console.log('  - Model:', config.model || 'c3-sweep-ecsydrkq-690h-fp16');
      console.log('  - API Key passed:', !!config.apiKey);
    }
    return new CohereContentGenerator({
      apiKey: config.apiKey,
      model: config.model || 'c3-sweep-ecsydrkq-690h-fp16',
      baseURL: 'https://stg.api.cohere.ai/compatibility/v1',
    });
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
