import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';

const googleAIApiKey = Deno.env.get('GOOGLE_AI_API_KEY');

console.log('=== Google AI Studio Function Starting ===');
console.log('API Key exists:', !!googleAIApiKey);

serve(async (req) => {
  console.log('🚀 Function called with method:', req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Processing POST request');
    
    const requestBody = await req.json();
    console.log('📋 Request received:', Object.keys(requestBody));
    
    const { swaggerSpec } = requestBody;

    if (!swaggerSpec) {
      console.log('❌ No swagger spec provided');
      return new Response(JSON.stringify({ error: 'Swagger specification is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!googleAIApiKey) {
      console.log('❌ No Google AI API key configured');
      return new Response(JSON.stringify({ error: 'Google AI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Validations passed');
    console.log('🔑 API Key (first 8 chars):', googleAIApiKey.substring(0, 8));

    const prompt = `You are a Senior QA Analyst specializing in API testing for Lovable-generated applications.
You will be given a Swagger/OpenAPI specification.
Your task is to analyze the Swagger specification ONLY and generate comprehensive test cases based strictly on the documented API contract.

Core Principle: Generate test cases ONLY based on what is explicitly defined in the Swagger specification. Do not assume or add test scenarios not documented in the API spec.

Swagger Specification:
${JSON.stringify(swaggerSpec, null, 2)}

## Test Coverage Requirements (Swagger-Driven):

### 1. Schema-Based Functional Tests
- Extract from Swagger: All endpoints, HTTP methods, parameters, and schemas
- Happy path tests using valid data types as defined in Swagger schemas
- Negative tests for each required field marked in the specification
- Optional field tests based on Swagger's "required" array
- Enum validation using exact enum values from Swagger definitions
- Data type validation based on Swagger type definitions (string, integer, boolean, array, object)
- Format validation based on Swagger format specifications (email, date-time, uuid, etc.)

### 2. Swagger-Defined Boundary Tests
- String constraints: minLength, maxLength from Swagger schema
- Numeric constraints: minimum, maximum, multipleOf from Swagger
- Array constraints: minItems, maxItems from Swagger definitions
- Pattern validation: regex patterns defined in Swagger
- Null/empty tests only for fields not marked as required in Swagger

### 3. Request Body Generation (Schema-Based)
- Parse Swagger schemas to generate realistic JSON payloads
- For each endpoint with requestBody:
  - Valid payload using Swagger example or schema-compliant data
  - Invalid payload violating each schema constraint
  - Missing required fields based on Swagger "required" array
  - Wrong data types based on Swagger type definitions
- Content-Type validation using mediaType from Swagger requestBody

### 4. Response Validation (Swagger Contract)
- Status codes exactly as defined in Swagger responses section
- Response schema validation against Swagger response definitions
- Error response testing for each documented error status code
- Response headers as specified in Swagger response headers

### 5. Parameter Testing (Swagger Parameters)
- Path parameters: Extract from Swagger path definitions
- Query parameters: Use Swagger parameter definitions (required, type, format)
- Header parameters: Based on Swagger parameter specifications
- Parameter constraints: Apply Swagger-defined validation rules

### 6. Authentication/Security (Swagger Security Schemes)
- Extract security requirements from Swagger securitySchemes
- Test authentication methods as defined in Swagger (bearer, apiKey, oauth2)
- Security scope testing if OAuth2 scopes are defined
- Endpoint security based on Swagger security requirements per operation

### 7. HTTP Method Validation
- Supported methods only as documented in Swagger for each path
- Unsupported method testing (405 Method Not Allowed)
- Method-specific behavior as described in Swagger operation definitions

### 8. Edge Cases from Swagger Constraints
- Boundary values from min/max constraints in Swagger
- Invalid formats against Swagger format specifications
- Schema violations for complex object structures
- Array validation against Swagger array item schemas

Generate test cases in this exact format (pipe-separated):
Test_ID | Endpoint | HTTP_Method | Test_Category | Test_Scenario | Swagger_Constraint_Reference | Request_Headers | Path_Params | Query_Params | Request_Body | Expected_Status | Expected_Response_Schema | Test_Type | Priority

Requirements:
1. Generate 25-35 comprehensive test cases
2. Reference the specific Swagger section for each test case
3. Use only data types, constraints, and examples from Swagger
4. Ensure every test case maps to a Swagger specification element
5. Include realistic but Swagger-compliant test data
6. Cover all endpoints, methods, and documented constraints

Return only the pipe-separated data, no additional text.`;

    const googleAIUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${googleAIApiKey}`;
    console.log('🌐 Google AI URL configured');
    
    console.log('📤 Sending request to Google AI Studio...');
    
    const response = await fetch(googleAIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        }
      }),
    });

    console.log('📨 Google AI response status:', response.status);
    console.log('📨 Google AI response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Google AI error:', response.status);
      console.error('❌ Error details:', errorText);
      
      return new Response(JSON.stringify({ 
        error: `Google AI API error: ${response.status}`, 
        details: errorText,
        apiKeyPrefix: googleAIApiKey.substring(0, 8)
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    console.log('✅ Google AI response received');
    console.log('📋 Response keys:', Object.keys(data));

    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('❌ Invalid response structure');
      return new Response(JSON.stringify({ 
        error: 'Invalid response from Google AI',
        details: 'Missing candidates in response',
        responseKeys: Object.keys(data)
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = data.candidates[0].content.parts[0].text || 'No content received';
    console.log('✅ AI Response length:', aiResponse.length);
    console.log('📝 AI Response preview:', aiResponse.substring(0, 200));

    // Parse CSV response into array format
    const csvLines = aiResponse.trim().split('\n');
    const csvData = csvLines.map(line => {
      // Simple CSV parsing - split by pipe (|) or comma and handle quoted values
      const fields = [];
      let current = '';
      let inQuotes = false;
      const delimiter = line.includes('|') ? '|' : ',';
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i-1] === delimiter)) {
          inQuotes = true;
        } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === delimiter)) {
          inQuotes = false;
        } else if (char === delimiter && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());
      return fields.map(field => field.replace(/^"|"$/g, '')); // Remove surrounding quotes
    });

    const postmanCollection = {
      info: {
        name: 'Generated Test Collection',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: [
        {
          name: 'Create Pet Test',
          request: {
            method: 'POST',
            url: '{{baseUrl}}/pet',
            body: {
              mode: 'raw',
              raw: '{"name":"Buddy","status":"available"}'
            }
          }
        }
      ]
    };

    console.log('✅ Sending successful response');

    return new Response(JSON.stringify({
      success: true,
      csvData: csvData,
      postmanCollection: postmanCollection,
      rawResponse: aiResponse,
      debug: {
        googleAIUrl: googleAIUrl,
        apiKeyPrefix: googleAIApiKey.substring(0, 8),
        responseStatus: response.status
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('💥 Function error:', error.message);
    console.error('💥 Error stack:', error.stack);
    
    return new Response(JSON.stringify({
      error: 'Failed to generate test cases',
      details: error.message,
      stack: error.stack,
      debug: {
        hasApiKey: !!googleAIApiKey,
        apiKeyPrefix: googleAIApiKey?.substring(0, 8)
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});