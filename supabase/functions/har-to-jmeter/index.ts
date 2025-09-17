import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadConfig {
  threadCount: number;
  rampUpTime: number;
  duration: number;
  loopCount: number;
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
  };
  time: number;
  startedDateTime: string;
}

interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { harContent, loadConfig, testPlanName = "HAR Performance Test", aiProvider = 'openai' } = await req.json();
    
    console.log('Processing HAR file with OpenAI...');
    
    // Parse HAR content
    const harData: HarFile = typeof harContent === 'string' ? JSON.parse(harContent) : harContent;
    const entries = harData.log.entries;
    
    console.log(`Found ${entries.length} HTTP requests in HAR file`);
    
    // Generate JMX using AI with user's exact HAR JMX generation prompt
    const jmxPrompt = `You are an expert in Apache JMeter test plan creation.  
Your task is to generate a complete Apache JMeter (.jmx) file based on the provided HAR file (HTTP Archive).  

### Requirements:  
1. Parse the HAR file and extract:  
   - All HTTP requests (method, URL, headers, body, query params, cookies).  
   - Request order and sequence should be preserved as in the HAR file.  
   - Response payloads that may contain dynamic values (IDs, tokens).  

2. Create a JMeter Test Plan (.jmx) with the following:  
   - Thread Group with configurable threads, ramp-up, and loop count.  
   - HTTP Request Samplers for every request from HAR.  
   - Group requests by domain or sequence for readability.  
   - Add \`HTTP Header Manager\` for common headers (Authorization, Content-Type, User-Agent, etc.).  
   - Add \`CSV Data Set Config\` to externalize dynamic values (e.g., user IDs, emails, tokens).  
   - Replace hardcoded parameters with variables \`\${varName}\`.  

3. Correlation and Dynamic Data Handling:  
   - Use \`JSON Extractor\` or \`Regular Expression Extractor\` to capture response values (auth token, IDs, session keys).  
   - Replace dependent requests with extracted variables.  
   - If HAR contains repeated values (like auth tokens), store them in variables.  

4. Enhancements:  
   - Insert default test data where needed (if request body is empty or HAR doesn't provide enough).  
   - Add a \`View Results Tree\` listener for debugging.  
   - Ensure the JMX is well-formed XML and directly runnable in JMeter.  

### Output:  
- Provide the final JMX file content as valid XML inside a code block.  
- Do not summarize, only return the JMX file.  
- Ensure all nodes (\`TestPlan\`, \`ThreadGroup\`, \`HTTPSamplerProxy\`, \`HeaderManager\`, etc.) follow correct JMeter XML structure.  

### Input:  
HAR file content (JSON format) will be provided.  

### Task:  
Generate the complete JMX file according to the above rules.

### HAR file content:
${JSON.stringify(harData, null, 2)}`;

    let jmxGenerationResponse;
    
    if (aiProvider === 'google') {
      const googleAIApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!googleAIApiKey) {
        throw new Error("Google AI API key not configured");
      }
      
      jmxGenerationResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleAIApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: jmxPrompt
            }]
          }]
        }),
      });
    } else {
      // OpenAI (default)
      if (!openAIApiKey) {
        throw new Error("OpenAI API key not configured");
      }
      
      jmxGenerationResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07',
          messages: [
            { role: 'system', content: 'You are an expert JMeter test plan generator. Generate only valid JMeter XML files based on HAR file data.' },
            { role: 'user', content: jmxPrompt }
          ],
          max_completion_tokens: 8000,
        }),
      });
    }

    let jmxContent: string = '';
    try {
      if (!jmxGenerationResponse.ok) {
        const errorText = await jmxGenerationResponse.text();
        console.error(`${aiProvider} API error:`, errorText);
        throw new Error(`${aiProvider} API error: ${jmxGenerationResponse.statusText}`);
      }

      const jmxData = await jmxGenerationResponse.json();
      console.log(`${aiProvider} JMX Generation Response received`);
      
      if (aiProvider === 'google') {
        if (jmxData.candidates?.[0]?.content?.parts?.[0]?.text) {
          const aiText = jmxData.candidates[0].content.parts[0].text;
          // Extract XML content from code blocks if present
          const xmlMatch = aiText.match(/```(?:xml)?\s*([\s\S]*?)\s*```/) || aiText.match(/<\?xml[\s\S]*<\/jmeterTestPlan>/);
          if (xmlMatch) {
            jmxContent = xmlMatch[1] || xmlMatch[0];
          } else {
            jmxContent = aiText;
          }
        }
      } else {
        // OpenAI
        if (jmxData.choices?.[0]?.message?.content) {
          const aiText = jmxData.choices[0].message.content;
          // Extract XML content from code blocks if present
          const xmlMatch = aiText.match(/```(?:xml)?\s*([\s\S]*?)\s*```/) || aiText.match(/<\?xml[\s\S]*<\/jmeterTestPlan>/);
          if (xmlMatch) {
            jmxContent = xmlMatch[1] || xmlMatch[0];
          } else {
            jmxContent = aiText;
          }
        }
      }
    } catch (error) {
      console.error(`Error generating JMX with ${aiProvider}:`, error);
      throw new Error(`Failed to generate JMX file using AI: ${error.message}`);
    }

    // Validate that we got valid JMX content
    if (!jmxContent || !jmxContent.includes('<jmeterTestPlan')) {
      throw new Error('AI did not generate valid JMeter XML content');
    }
    
    console.log('JMeter XML generated successfully');
    
    return new Response(JSON.stringify({ 
      jmxContent,
      metadata: {
        provider: aiProvider === 'google' ? 'Google AI Studio' : 'OpenAI',
        generatedByAI: true,
        testPlanName: testPlanName
      },
      summary: {
        totalRequests: entries.length,
        uniqueDomains: [...new Set(entries.map(e => new URL(e.request.url).hostname))],
        methodsUsed: [...new Set(entries.map(e => e.request.method))],
        avgResponseTime: entries.reduce((sum, e) => sum + e.time, 0) / entries.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in har-to-jmeter function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// This function is no longer needed as JMX generation is now handled by AI