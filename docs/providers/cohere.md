# Cohere Provider Integration

The Gemini CLI supports using Cohere as an alternative LLM provider, allowing you to leverage Cohere's models while maintaining all the functionality of the Gemini CLI.

## Setup

### Prerequisites

1. A Cohere API key from [Cohere Dashboard](https://dashboard.cohere.com/api-keys)
2. Node.js version 20 or higher
3. The Gemini CLI installed

### Configuration

#### Production Environment

To use Cohere's production models:

```bash
# Set your API key
export COHERE_API_KEY="your-api-key"

# Run the CLI with Cohere provider
gemini --provider cohere
```

#### Staging Environment

To use Cohere's staging environment for testing:

```bash
# Set your staging API key
export CO_API_KEY_STAGING="your-staging-key"

# Run the CLI with Cohere staging provider
gemini --provider coherestaging
```

## Supported Models

### Production Models

- **command-a-03-2025** (default): Cohere's latest command model for general-purpose tasks

### Staging Models

- **c3-sweep-ecsydrkq-690h-fp16** (default): Cohere's staging model for testing

You can specify a different model using the `--model` flag:

```bash
gemini --provider cohere --model command-a-03-2025 "Your prompt here"
```

## Features

### Streaming Responses

The Cohere integration fully supports streaming responses, providing real-time output as the model generates text:

```bash
gemini --provider cohere "Write a story about a robot"
# Text will stream in real-time
```

### Tool Usage

All standard Gemini CLI tools work seamlessly with Cohere:

```bash
# Shell commands
gemini --provider cohere "List all JavaScript files in the current directory"

# File operations
gemini --provider cohere "Create a new Python script that calculates fibonacci numbers"

# Web search
gemini --provider cohere "Search for the latest news about AI"
```

### Interactive Mode

Cohere works in interactive mode, allowing for multi-turn conversations:

```bash
gemini -i --provider cohere
# Start chatting interactively
```

### Resume Conversations

You can resume previous conversations with Cohere:

```bash
# First conversation
gemini --provider cohere "Start writing a story about space exploration"

# Resume later (use the conversation ID from the output)
gemini --provider cohere --resume <conversation-id> "Continue the story"
```

## Limitations

1. **Embedding**: The Cohere provider currently does not support embedding generation
2. **Token Counting**: Token counting is approximated using a chat API call
3. **Model-Specific Features**: Some Gemini-specific features may not be available with Cohere

## Comparison with Gemini

| Feature | Gemini | Cohere |
|---------|--------|---------|
| Streaming | ✅ | ✅ |
| Tool Usage | ✅ | ✅ |
| Interactive Mode | ✅ | ✅ |
| Resume Conversations | ✅ | ✅ |
| Embeddings | ✅ | ❌ |
| Multimodal | ✅ | ❌ |
| Token Counting | ✅ | ✅ (approximated) |

## Examples

### Basic Usage

```bash
# Simple question
gemini --provider cohere "What is 2+2?"

# Code generation
gemini --provider cohere "Write a Python function to sort a list"

# File operations
gemini --provider cohere "Read package.json and explain what this project does"
```

### Complex Tasks

```bash
# Multi-tool usage
gemini --provider cohere "Search for React best practices, then create a component following those practices"

# Code analysis
gemini --provider cohere "Analyze all TypeScript files in src/ and suggest improvements"

# Project scaffolding
gemini --provider cohere "Create a new Express.js API with authentication"
```

## Troubleshooting

### Authentication Errors

If you see authentication errors:

1. Verify your API key is set correctly:
   ```bash
   echo $COHERE_API_KEY  # For production
   echo $CO_API_KEY_STAGING  # For staging
   ```

2. Ensure your API key has the necessary permissions

### Rate Limiting

Cohere has different rate limits than Gemini. If you encounter rate limiting:

1. Reduce the frequency of requests
2. Consider upgrading your Cohere plan
3. Use the staging environment for development

### Tool Execution Issues

If tools aren't working as expected:

1. Ensure you're using the latest version of Gemini CLI
2. Check that the tool output format is compatible
3. Try the same command with the Gemini provider to isolate the issue

## Advanced Configuration

### Using Different Base URLs

For enterprise or custom deployments, you can configure different base URLs by modifying the provider configuration in the source code.

### Model-Specific Parameters

The Cohere integration supports model-specific parameters like temperature, max tokens, and top-p:

```bash
# These are passed through the standard Gemini CLI configuration
gemini config set temperature 0.7
gemini config set maxOutputTokens 2000
```

## Migration Guide

If you're switching from Gemini to Cohere:

1. **API Keys**: Replace `GEMINI_API_KEY` with `COHERE_API_KEY`
2. **Provider Flag**: Add `--provider cohere` to your commands
3. **Model Names**: Update any hardcoded model names to Cohere equivalents
4. **Features**: Review limitations above and adjust workflows accordingly

## Contributing

To contribute to the Cohere integration:

1. See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) guide
2. Cohere-specific code is in `packages/core/src/providers/cohereContentGenerator.ts`
3. Tests are in `packages/core/src/providers/cohereContentGenerator.test.ts`
4. Submit PRs with comprehensive tests for any new features