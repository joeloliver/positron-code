# Ollama Integration Setup Guide

This guide explains how to configure gemini-cli to use your local Ollama models instead of Google's Gemini API.

## Prerequisites

1. **Ollama Server**: Ensure you have Ollama installed and running on your intranet server
   - Download from: https://ollama.com/
   - Default port: 11434

2. **Models**: Pull the models you want to use
   ```bash
   # Example for your custom Qwen-based model
   ollama pull qwen3:latest
   # Or any other model like:
   ollama pull llama3.3
   ollama pull mistral
   ```

## Configuration

You can configure Ollama using either environment variables or the `settings.json` file.

### Option 1: Using settings.json (Recommended)

Add these settings to your `~/.positron/settings.json` (user-level) or `./.positron/settings.json` (project-level):

```json
{
  "selectedAuthType": "use_ollama",
  "ollamaHost": "http://server.joeloliver.com:11434",
  "ollamaModel": "positron3:8b",
  "ollamaEmbeddingModel": "nomic-embed-text",
  "ollamaToken": "your-auth-token"
}
```

**Configuration Priority (highest to lowest):**
1. **Settings file values** (`~/.positron/settings.json`)
2. **Environment variables** (`OLLAMA_HOST`, `OLLAMA_MODEL`, etc.)
3. **Default values** (`http://localhost:11434`, `llama3.3`, etc.)

This means you can mix and match - for example, set the host in settings but override the model with an environment variable.

### Option 2: Environment Variables

Create a `.env` file in your project root or set these environment variables:

#### **Linux/macOS:**
```bash
# Required: Set auth type to use Ollama
export AUTH_METHOD=ollama

# Ollama server configuration
export OLLAMA_HOST=http://server.joeloliver.com:11434  # Your remote server
export OLLAMA_MODEL=positron3:8b                       # Your custom model name
export OLLAMA_EMBEDDING_MODEL=nomic-embed-text        # Optional: embedding model
export OLLAMA_TOKEN=your-auth-token                   # Optional: Bearer token for authentication
```

#### **Windows (Command Prompt):**
```cmd
REM Required: Set auth type to use Ollama
set AUTH_METHOD=ollama

REM Ollama server configuration
set OLLAMA_HOST=http://server.joeloliver.com:11434
set OLLAMA_MODEL=positron3:8b
set OLLAMA_EMBEDDING_MODEL=nomic-embed-text
set OLLAMA_TOKEN=your-auth-token                      REM Optional: Bearer token for authentication
```

#### **Windows (PowerShell):**
```powershell
# Required: Set auth type to use Ollama
$env:AUTH_METHOD="ollama"

# Ollama server configuration
$env:OLLAMA_HOST="http://server.joeloliver.com:11434"
$env:OLLAMA_MODEL="positron3:8b"
$env:OLLAMA_EMBEDDING_MODEL="nomic-embed-text"
$env:OLLAMA_TOKEN="your-auth-token"                   # Optional: Bearer token for authentication
```

### Example .env file

```env
# Ollama Configuration
AUTH_METHOD=ollama
OLLAMA_HOST=http://server.joeloliver.com:11434
OLLAMA_MODEL=positron3:8b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_TOKEN=your-auth-token                          # Optional: Bearer token for authentication
```

## Usage

Once configured, run gemini-cli as usual:

#### **Linux/macOS:**
```bash
# Interactive mode
gemini

# Non-interactive mode
gemini "Your prompt here"
```

#### **Windows:**
```cmd
REM Interactive mode
gemini

REM Non-interactive mode
gemini "Your prompt here"
```

#### **Or build and run from source:**
```bash
# Build the project
npm run build

# Start gemini-cli
npm start
```

## Supported Models

Any model available in your Ollama server can be used. Common options:

- **Large Language Models**:
  - `qwen3:latest` (your custom model)
  - `llama3.3:latest`
  - `llama3.3:70b`
  - `mistral:latest`
  - `mixtral:latest`
  - `deepseek-coder:latest`
  - `codellama:latest`

- **Embedding Models**:
  - `nomic-embed-text`
  - `mxbai-embed-large`
  - `all-minilm`

## Verifying Your Setup

#### **Linux/macOS:**
1. **Check Ollama is running**:
   ```bash
   curl http://server.joeloliver.com:11434/api/tags
   ```

2. **Test the model**:
   ```bash
   curl http://server.joeloliver.com:11434/api/generate -d '{
     "model": "positron3:8b",
     "prompt": "Hello, world!"
   }'
   ```

#### **Windows:**
1. **Check Ollama is running**:
   ```powershell
   # Using PowerShell (if curl is available)
   curl http://server.joeloliver.com:11434/api/tags
   
   # Or using Invoke-RestMethod
   Invoke-RestMethod -Uri "http://server.joeloliver.com:11434/api/tags"
   ```

2. **Test the model**:
   ```powershell
   # Using PowerShell
   $body = @{
     model = "positron3:8b"
     prompt = "Hello, world!"
   } | ConvertTo-Json
   
   Invoke-RestMethod -Uri "http://your-server:11434/api/generate" -Method Post -Body $body -ContentType "application/json"
   ```

#### **All Platforms:**
3. **Run gemini-cli**:
   ```bash
   gemini "Test message to verify Ollama integration"
   ```

## Troubleshooting

### Connection Issues

If you get connection errors:

#### **Linux:**
1. Verify Ollama is running:
   ```bash
   systemctl status ollama  # Check service status
   ollama serve            # Manual start
   ```

#### **Windows:**
1. Verify Ollama is running:
   ```cmd
   REM Check if Ollama process is running
   tasklist | findstr ollama
   
   REM Start Ollama manually
   ollama serve
   ```

#### **All Platforms:**
2. Check firewall settings allow connections to port 11434

3. Verify the OLLAMA_HOST URL is correct and accessible:
   
   **Linux/macOS:**
   ```bash
   ping your-intranet-server
   telnet your-intranet-server 11434
   ```
   
   **Windows:**
   ```cmd
   ping your-intranet-server
   telnet your-intranet-server 11434
   
   REM Or use PowerShell to test connection
   Test-NetConnection your-intranet-server -Port 11434
   ```

### Model Not Found

If you get "model not found" errors:

1. List available models:
   ```bash
   ollama list
   ```

2. Pull the required model:
   ```bash
   ollama pull qwen3:latest
   ```

3. Ensure OLLAMA_MODEL matches exactly (case-sensitive)

### Performance Issues

For better performance:

1. Use a model appropriate for your hardware
2. Consider using quantized versions (e.g., `qwen3:7b-q4_0`)
3. Adjust context window if needed
4. Ensure adequate RAM/VRAM on the Ollama server

## Advanced Configuration

### Custom Model Parameters

You can customize model behavior by modifying the Ollama content generator options in the code:

```typescript
// In ollamaContentGenerator.ts
options: {
  temperature: 0.7,        // Creativity level (0-1)
  top_p: 0.9,             // Nucleus sampling
  num_predict: 2048,      // Max tokens to generate
  stop: ["</s>", "###"],  // Stop sequences
}
```

### Using Multiple Models

You can switch between models by changing the OLLAMA_MODEL environment variable:

```bash
# For coding tasks
export OLLAMA_MODEL=codellama:latest

# For general tasks
export OLLAMA_MODEL=qwen3:latest

# For fast responses
export OLLAMA_MODEL=llama3.3:7b
```

## Security Considerations

1. **Network Security**: Ensure your Ollama server is only accessible within your intranet
2. **Authentication**: Bearer token authentication is supported via the `OLLAMA_TOKEN` environment variable
   - If your Ollama server requires authentication, set `OLLAMA_TOKEN` to your bearer token
   - The token will be sent as `Authorization: Bearer <token>` header with all requests
   - This is optional - if no token is set, requests will be sent without authentication
3. **Data Privacy**: All data stays within your network when using Ollama

## Support

For issues specific to:
- **Ollama**: Visit https://github.com/ollama/ollama
- **This integration**: Create an issue in the gemini-cli repository