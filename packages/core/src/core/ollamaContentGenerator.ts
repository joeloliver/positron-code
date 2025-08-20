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
  Content,
  Part,
  FinishReason,
} from '@google/genai';
import { ContentGenerator } from './contentGenerator.js';
import { UserTierId } from '../code_assist/types.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
  tool_calls?: any[];
}

interface OllamaGenerateRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
  tools?: any[];
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: any[];
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

interface OllamaEmbedRequest {
  model: string;
  input: string | string[];
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

export class OllamaContentGenerator implements ContentGenerator {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;
  public userTier?: UserTierId;

  constructor(config: {
    baseUrl: string;
    model: string;
    embeddingModel?: string;
  }) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model;
    this.embeddingModel = config.embeddingModel || 'nomic-embed-text';
    
    // Validate connection on initialization
    this.validateConnection().catch(err => {
      console.warn(`Warning: Could not connect to Ollama at ${this.baseUrl}: ${err.message}`);
      console.warn('Make sure Ollama is running and accessible.');
    });
  }

  private async validateConnection(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (!response.ok) {
        throw new Error(`Ollama server returned ${response.status}`);
      }
      
      const data = await response.json();
      const models = data.models || [];
      const modelNames = models.map((m: any) => m.name);
      
      if (!modelNames.includes(this.model)) {
        console.warn(`Warning: Model '${this.model}' not found in Ollama. Available models: ${modelNames.join(', ')}`);
        console.warn(`Pull the model with: ollama pull ${this.model}`);
      }
      
      // Connection successful
    } catch (error) {
      // Connection failed
      throw error;
    }
  }

  private convertToOllamaMessages(contents: Content[]): OllamaMessage[] {
    const messages: OllamaMessage[] = [];

    for (const content of contents) {
      const role = content.role === 'model' ? 'assistant' : content.role as 'user' | 'system';
      
      if (!content.parts || content.parts.length === 0) {
        continue;
      }

      let textContent = '';
      const images: string[] = [];
      const toolCalls: any[] = [];

      for (const part of content.parts) {
        if ('text' in part && part.text) {
          textContent += part.text;
        } else if ('inlineData' in part && part.inlineData) {
          // Convert base64 image data
          if (part.inlineData.mimeType?.startsWith('image/') && part.inlineData.data) {
            images.push(part.inlineData.data);
          }
        } else if ('functionCall' in part && part.functionCall) {
          // Convert function calls to tool calls
          toolCalls.push({
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        } else if ('functionResponse' in part && part.functionResponse) {
          // Add function response as a message
          const name = (part.functionResponse as any).name || 'unknown';
          textContent += `Function ${name} returned: ${JSON.stringify(part.functionResponse.response)}`;
        }
      }

      const message: OllamaMessage = {
        role,
        content: textContent,
      };

      if (images.length > 0) {
        message.images = images;
      }

      if (toolCalls.length > 0) {
        message.tool_calls = toolCalls;
      }

      messages.push(message);
    }

    return messages;
  }

  private convertOllamaResponse(response: OllamaGenerateResponse): GenerateContentResponse {
    const parts: Part[] = [];

    if (response.message.content) {
      parts.push({ text: response.message.content });
    }

    if (response.message.tool_calls) {
      for (const toolCall of response.message.tool_calls) {
        if (toolCall.type === 'function') {
          parts.push({
            functionCall: {
              name: toolCall.function.name,
              args: JSON.parse(toolCall.function.arguments || '{}'),
            },
          });
        }
      }
    }

    const result: any = {
      candidates: [
        {
          content: {
            parts,
            role: 'model',
          },
          finishReason: response.done ? ('STOP' as FinishReason) : undefined,
          index: 0,
          safetyRatings: [],
        },
      ],
      usageMetadata: response.eval_count
        ? {
            promptTokenCount: response.prompt_eval_count || 0,
            candidatesTokenCount: response.eval_count,
            totalTokenCount: (response.prompt_eval_count || 0) + response.eval_count,
          }
        : undefined,
      promptFeedback: {
        blockReason: undefined,
        safetyRatings: [],
      },
      // Add dummy implementations for required properties
      text: response.message.content || '',
      data: [],
      functionCalls: [],
      executableCode: [],
      codeExecutionResult: [],
    };
    
    return result as GenerateContentResponse;
  }

  private convertTools(tools?: any[]): any[] {
    if (!tools) return [];
    
    // Convert Gemini tool format to Ollama format
    return tools.map(tool => {
      if (tool.functionDeclarations) {
        return {
          type: 'function',
          function: tool.functionDeclarations[0],
        };
      }
      return tool;
    });
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const contents: Content[] = Array.isArray(request.contents) 
      ? request.contents.filter((c): c is Content => typeof c === 'object' && c !== null && 'role' in c)
      : (typeof request.contents === 'object' && request.contents !== null && 'role' in request.contents ? [request.contents as Content] : []);
    const messages = this.convertToOllamaMessages(contents);
    
    const ollamaRequest: OllamaGenerateRequest = {
      model: this.model,
      messages,
      stream: false,
      options: {
        temperature: (request as any).generationConfig?.temperature,
        top_p: (request as any).generationConfig?.topP,
        num_predict: (request as any).generationConfig?.maxOutputTokens,
        stop: (request as any).generationConfig?.stopSequences,
      },
      tools: this.convertTools((request as any).tools),
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const ollamaResponse: OllamaGenerateResponse = await response.json();
    return this.convertOllamaResponse(ollamaResponse);
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this._generateContentStreamInternal(request, userPromptId);
  }

  private async *_generateContentStreamInternal(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const contents: Content[] = Array.isArray(request.contents) 
      ? request.contents.filter((c): c is Content => typeof c === 'object' && c !== null && 'role' in c)
      : (typeof request.contents === 'object' && request.contents !== null && 'role' in request.contents ? [request.contents as Content] : []);
    const messages = this.convertToOllamaMessages(contents);
    
    const ollamaRequest: OllamaGenerateRequest = {
      model: this.model,
      messages,
      stream: true,
      options: {
        temperature: (request as any).generationConfig?.temperature,
        top_p: (request as any).generationConfig?.topP,
        num_predict: (request as any).generationConfig?.maxOutputTokens,
        stop: (request as any).generationConfig?.stopSequences,
      },
      tools: this.convertTools((request as any).tools),
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const ollamaResponse: OllamaGenerateResponse = JSON.parse(line);
            yield this.convertOllamaResponse(ollamaResponse);
          } catch (e) {
            console.error('Failed to parse Ollama response:', e);
          }
        }
      }
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // Ollama doesn't have a direct token counting endpoint
    // We'll estimate based on the content length
    const contents = Array.isArray(request.contents) 
      ? request.contents.filter((c): c is Content => typeof c === 'object' && c !== null)
      : (typeof request.contents === 'object' && request.contents !== null ? [request.contents] : []);
    let totalChars = 0;
    
    for (const content of contents) {
      if (content && typeof content === 'object' && 'parts' in content && content.parts) {
        for (const part of content.parts) {
          if (part && typeof part === 'object' && 'text' in part && part.text) {
            totalChars += part.text.length;
          }
        }
      }
    }

    // Rough estimation: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(totalChars / 4);

    return {
      totalTokens: estimatedTokens,
      cachedContentTokenCount: 0,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    const text = (request.contents && typeof request.contents === 'object' && 'parts' in request.contents && request.contents.parts?.[0] && typeof request.contents.parts[0] === 'object' && 'text' in request.contents.parts[0]) 
      ? request.contents.parts[0].text || '' 
      : '';
    
    const ollamaRequest: OllamaEmbedRequest = {
      model: this.embeddingModel,
      input: text,
    };

    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Ollama embed error: ${response.status} ${response.statusText}`);
    }

    const ollamaResponse: OllamaEmbedResponse = await response.json();
    
    return {
      embeddings: [
        {
          values: ollamaResponse.embeddings[0] || [],
        },
      ],
    };
  }

  async generateJson(
    contents: Content[],
    schema: Record<string, unknown>,
    abortSignal: AbortSignal,
    model?: string,
    config: any = {},
  ): Promise<any> {
    // Ollama doesn't support JSON schema validation, so we'll request JSON format
    // and parse it manually
    const jsonPrompt = `IMPORTANT: You must respond with valid JSON only. Do not include <think> tags, explanations, thoughts, or any other text. Only output the JSON object that follows this exact schema: ${JSON.stringify(schema)}

Original request:`;
    
    const enhancedContents: Content[] = [
      {
        role: 'system',
        parts: [{ text: 'You are a JSON-only assistant. You must only respond with valid JSON. Do not use thinking tags or any other formatting.' }],
      },
      {
        role: 'user',
        parts: [{ text: jsonPrompt }],
      },
      ...contents,
    ];

    // Make a direct request to Ollama without using the generateContent wrapper
    // to avoid thinking tags and other processing
    const messages = this.convertToOllamaMessages(enhancedContents);
    
    const ollamaRequest: OllamaGenerateRequest = {
      model: this.model,
      messages,
      stream: false,
      format: 'json', // Request JSON format from Ollama
      options: {
        temperature: config.temperature || 0,
        top_p: config.topP || 1,
        num_predict: config.maxOutputTokens,
        stop: config.stopSequences ? [...config.stopSequences, '<think>', '</think>'] : ['<think>', '</think>'],
      },
    };

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const ollamaResponse: OllamaGenerateResponse = await response.json();
    const text = ollamaResponse.message.content || '';
    
    if (!text) {
      throw new Error('API returned an empty response for generateJson.');
    }

    // Try to extract JSON from the response
    let jsonText = text.trim();
    
    // Remove thinking tags if present (multiple passes to handle nested or multiple tags)
    while (jsonText.includes('<think>')) {
      jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    }
    
    // Also try to extract content after thinking tags if the entire response starts with them
    if (text.includes('</think>')) {
      const afterThink = text.split('</think>').pop();
      if (afterThink && afterThink.trim()) {
        jsonText = afterThink.trim();
      }
    }
    
    // Remove common markdown formatting
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim();
    }

    // Try to parse the JSON
    try {
      if (jsonText && jsonText.startsWith('{') && jsonText.endsWith('}')) {
        return JSON.parse(jsonText);
      }
    } catch (parseError) {
      // Continue to fallback logic
    }
    
    // If parsing fails, try multiple strategies to find JSON
    // Strategy 1: Look for JSON object pattern
    const jsonObjectMatch = jsonText.match(/\{[^{}]*"[^"]+"\s*:[^{}]*\}/);
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]);
      } catch (e) {
        // Continue to next strategy
      }
    }
    
    // Strategy 2: Find the first complete JSON object
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      try {
        const possibleJson = jsonText.substring(jsonStart, jsonEnd + 1);
        return JSON.parse(possibleJson);
      } catch (secondParseError) {
        // Continue to fallback
      }
    }
    
    // Strategy 3: Look for JSON in the original text (before tag removal)
    const originalJsonMatch = text.match(/\{[^<]*?"next_speaker"[^<]*?\}/);
    if (originalJsonMatch) {
      try {
        return JSON.parse(originalJsonMatch[0]);
      } catch (e) {
        // Continue to fallback
      }
    }
    
    // Final fallback: Create a valid response based on the schema
    return this.createFallbackResponse(schema, text);
  }

  private createFallbackResponse(schema: Record<string, unknown>, text: string): any {
    // Special handling for next_speaker schema (from checkNextSpeaker)
    if (schema['properties'] && typeof schema['properties'] === 'object') {
      const props = schema['properties'] as Record<string, any>;
      
      // Check if this is the next_speaker schema
      if (props['next_speaker'] && props['reasoning']) {
        // Parse the text to determine who should speak next
        const lowerText = text.toLowerCase();
        
        // Check for clear indicators
        let nextSpeaker = 'user'; // Default to user
        let reasoning = 'Unable to parse response, defaulting to user turn';
        
        if (lowerText.includes('model should speak next') || 
            lowerText.includes('model continues') ||
            lowerText.includes("'model'")) {
          nextSpeaker = 'model';
          reasoning = 'Model indicated it should continue';
        } else if (lowerText.includes('user should speak next') || 
                   lowerText.includes('question to user') ||
                   lowerText.includes("'user'")) {
          nextSpeaker = 'user';
          reasoning = 'Response indicates user should speak next';
        }
        
        return {
          next_speaker: nextSpeaker,
          reasoning: reasoning
        };
      }
      
      // Generic fallback for other schemas
      const result: any = {};
      
      for (const [key, value] of Object.entries(props)) {
        if (value.type === 'string') {
          if (value.enum && Array.isArray(value.enum) && value.enum.length > 0) {
            // If there's an enum, pick the first valid option
            result[key] = value.enum[0];
          } else {
            result[key] = text.slice(0, 100); // Use part of the response text
          }
        } else if (value.type === 'boolean') {
          result[key] = text.toLowerCase().includes('true') || text.toLowerCase().includes('yes');
        } else {
          result[key] = null;
        }
      }
      
      return result;
    }
    
    // Very basic fallback
    return { response: text };
  }
}