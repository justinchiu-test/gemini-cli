/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Cohere model definitions
export const DEFAULT_COHERE_MODEL = 'command-a-03-2025';
export const DEFAULT_COHERE_STAGING_MODEL = 'c3-sweep-ecsydrkq-690h-fp16';
export const DEFAULT_COHERE_EMBEDDING_MODEL = 'embed-english-v3.0';

export const COHERE_MODELS = {
  'command-a-03-2025': {
    name: 'Command A (Production)',
    maxTokens: 4096,
    contextWindow: 128000,
  },
  'c3-sweep-ecsydrkq-690h-fp16': {
    name: 'C3 Sweep (Staging)',
    maxTokens: 4096,
    contextWindow: 128000,
  },
  'embed-english-v3.0': {
    name: 'Embed English v3',
    dimensions: 1024,
  },
};
