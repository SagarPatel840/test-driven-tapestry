
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generate test cases function called');
    const startTime = Date.now();

    // Get user from auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header missing' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { story, azureConfig, customPrompt } = body;

    // Input validation
    if (!story || !story.title) {
      return new Response(
        JSON.stringify({ error: 'Story data with title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate story title length
    if (story.title.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Story title exceeds maximum length of 255 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate description if too long for optimal AI processing
    if (story.description && story.description.length > 5000) {
      console.log(`Truncating long description from ${story.description.length} to 5000 characters`);
      story.description = story.description.substring(0, 5000) + '... [truncated]';
    }

    // Validate Azure OpenAI config
    if (!azureConfig || !azureConfig.endpoint || !azureConfig.apiKey || !azureConfig.deploymentId) {
      return new Response(
        JSON.stringify({ error: 'Azure OpenAI configuration is required (endpoint, apiKey, deploymentId)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating test cases for story: ${story.title}`);

    let prompt = `Generate comprehensive test cases for the following user story:

Title: ${story.title}
Description: ${story.description || 'No description provided'}
Priority: ${story.priority || 'Medium'}
Issue Type: ${story.issueType || 'Story'}

Please generate test cases that include:
1. Positive test scenarios
2. Negative test scenarios  
3. Edge cases
4. Boundary conditions
5. User acceptance criteria validation`;

    // Add custom prompt instructions if provided
    if (customPrompt && customPrompt.trim()) {
      prompt += `

ADDITIONAL CUSTOM REQUIREMENTS:
${customPrompt.trim()}

Please ensure the test cases incorporate these custom requirements along with the standard test case types listed above.`;
    }

    prompt += `

Format the response as a JSON array of test case objects with the following structure:
{
  "id": "TC001",
  "title": "Test case title",
  "description": "Detailed test case description",
  "type": "positive|negative|edge|boundary", 
  "priority": "high|medium|low",
  "steps": ["Step 1", "Step 2", "Step 3"],
  "expectedResult": "Expected outcome",
  "category": "functional|ui|integration|performance"
}

Generate 8-12 test cases covering all important scenarios.`;

    // Build Azure OpenAI endpoint from user config
    const azureEndpoint = `${azureConfig.endpoint}/openai/deployments/${azureConfig.deploymentId}/chat/completions?api-version=${azureConfig.apiVersion}`;
    
    const response = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'api-key': azureConfig.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a QA expert who generates comprehensive test cases. Return only valid JSON arrays without any markdown formatting or explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure OpenAI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `Azure OpenAI API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Calculate cost (Azure OpenAI gpt-4o pricing may vary - using standard rates as estimate)
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    const cost = (promptTokens * 0.00003 / 1000) + (completionTokens * 0.00006 / 1000); // GPT-4o Azure pricing estimate

    // Log usage to analytics
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: story.project_id,
        feature_type: 'test_case_generation',
        tokens_used: totalTokens,
        openai_model: `azure-${azureConfig.deploymentId}`,
        openai_tokens_prompt: promptTokens,
        openai_tokens_completion: completionTokens,
        openai_cost_usd: cost,
        execution_time_ms: Date.now() - startTime,
        success: true
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
    }

    try {
      // Parse the JSON response from OpenAI
      const testCases = JSON.parse(content);
      
      // Add additional metadata
      const enrichedTestCases = testCases.map((testCase: any, index: number) => ({
        ...testCase,
        id: testCase.id || `TC${String(index + 1).padStart(3, '0')}`,
        storyId: story.id,
        storyTitle: story.title,
        generatedAt: new Date().toISOString(),
        source: `Azure OpenAI ${azureConfig.deploymentId}`
      }));

      console.log(`Generated ${enrichedTestCases.length} test cases for story ${story.id}`);

      return new Response(
        JSON.stringify({
          success: true,
          testCases: enrichedTestCases,
          story: story
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      console.log('Raw content:', content);
      
      // Log failed usage
      try {
        await supabase.from('ai_usage_logs').insert({
          user_id: user.id,
          project_id: story.project_id,
          feature_type: 'test_case_generation',
          tokens_used: data.usage?.total_tokens || 0,
          openai_model: `azure-${azureConfig.deploymentId}`,
          openai_tokens_prompt: data.usage?.prompt_tokens || 0,
          openai_tokens_completion: data.usage?.completion_tokens || 0,
          openai_cost_usd: ((data.usage?.prompt_tokens || 0) * 0.00015 / 1000) + ((data.usage?.completion_tokens || 0) * 0.0006 / 1000),
          execution_time_ms: Date.now() - startTime,
          success: false
        });
      } catch (logError) {
        console.error('Failed to log AI usage:', logError);
      }
      
      return new Response(
        JSON.stringify({
          error: 'Failed to parse generated test cases',
          details: 'Azure OpenAI response was not valid JSON',
          rawContent: content
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error in generate-test-cases function:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to generate test cases',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
