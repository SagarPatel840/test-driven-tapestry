import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generate test plan function called');
    const startTime = Date.now();

    // Get user from auth
    const authHeader = req.headers.get('Authorization')!;
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
    const { userStories, projectName, testingScope, projectId, customPrompt, requirementsDoc, openAIConfig } = body;

    // Validate OpenAI configuration
    if (!openAIConfig?.endpoint || !openAIConfig?.apiKey || !openAIConfig?.deploymentId) {
      return new Response(
        JSON.stringify({ error: 'Azure OpenAI configuration is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Input validation - either user stories or requirements document required
    if ((!userStories || !Array.isArray(userStories) || userStories.length === 0) && !requirementsDoc) {
      return new Response(
        JSON.stringify({ error: 'Either user stories or requirements document is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectName || typeof projectName !== 'string' || projectName.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Project name is required and must be less than 255 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (testingScope && typeof testingScope !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Testing scope must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit user stories to prevent excessive API usage
    if (userStories && userStories.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 user stories allowed per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Generating test plan for project:', projectName);

    // Build content section
    let contentSection = '';
    
    if (userStories && userStories.length > 0) {
      contentSection += `User Stories:\n${userStories.map((story: any, index: number) => `${index + 1}. ${story.title}: ${story.description}`).join('\n')}\n\n`;
    }
    
    if (requirementsDoc) {
      contentSection += `Requirements Document:\n${requirementsDoc}\n\n`;
    }

    let prompt = `Generate a comprehensive test plan for the project "${projectName}".

${contentSection}Testing Scope: ${testingScope || 'Full application testing'}`;

    if (customPrompt) {
      prompt += `\n\nAdditional Requirements:\n${customPrompt}`;
    }

    prompt += `\n\nCreate a detailed test plan that includes:
1. Test Objectives
2. Test Scope and Approach
3. Test Environment Requirements
4. Test Schedule and Milestones
5. Risk Assessment
6. Entry and Exit Criteria
7. Test Deliverables
8. Resource Requirements
9. Test Strategy for each requirement/story
10. Performance and Security Testing considerations

Format the response as a structured document with clear sections and subsections.`;

    // Use Azure OpenAI endpoint
    const azureEndpoint = `${openAIConfig.endpoint}/openai/deployments/${openAIConfig.deploymentId}/chat/completions?api-version=${openAIConfig.apiVersion || '2024-02-15-preview'}`;

    const response = await fetch(azureEndpoint, {
      method: 'POST',
      headers: {
        'api-key': openAIConfig.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert test manager with deep knowledge of software testing methodologies, test planning, and quality assurance. Generate comprehensive, professional test plans that follow industry standards.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      throw new Error(data.error?.message || 'Failed to generate test plan');
    }

    const testPlan = data.choices[0].message.content;

    // Calculate cost and log usage
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || 0;
    const cost = (promptTokens * 0.00015 / 1000) + (completionTokens * 0.0006 / 1000);

    // Log successful usage
    try {
      await supabase.from('ai_usage_logs').insert({
        user_id: user.id,
        project_id: projectId,
        feature_type: 'test_plan_generation',
        tokens_used: totalTokens,
        openai_model: 'gpt-4o-mini',
        openai_tokens_prompt: promptTokens,
        openai_tokens_completion: completionTokens,
        openai_cost_usd: cost,
        execution_time_ms: Date.now() - startTime,
        success: true
      });
    } catch (logError) {
      console.error('Failed to log AI usage:', logError);
    }
    
    console.log('Test plan generated successfully');

    return new Response(JSON.stringify({ 
      testPlan,
      metadata: {
        projectName,
        generatedAt: new Date().toISOString(),
        userStoriesCount: userStories?.length || 0,
        hasRequirementsDoc: !!requirementsDoc,
        hasCustomPrompt: !!customPrompt,
        testingScope
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-test-plan function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});