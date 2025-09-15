import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');


serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Generate test report function called');
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
    const { testCases, projectName, testExecutionData, reportType, projectId } = body;

    // Input validation
    if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Test cases array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectName || typeof projectName !== 'string' || projectName.length > 255) {
      return new Response(
        JSON.stringify({ error: 'Project name is required and must be less than 255 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (reportType && !['executive', 'detailed', 'summary'].includes(reportType)) {
      return new Response(
        JSON.stringify({ error: 'Report type must be one of: executive, detailed, summary' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limit test cases to prevent excessive API usage
    if (testCases.length > 200) {
      return new Response(
        JSON.stringify({ error: 'Maximum 200 test cases allowed per request' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Generating test report for project:', projectName);

    // Calculate statistics
    const totalTests = testCases.length;
    const passedTests = testCases.filter((tc: any) => tc.status === 'passed').length;
    const failedTests = testCases.filter((tc: any) => tc.status === 'failed').length;
    const blockedTests = testCases.filter((tc: any) => tc.status === 'blocked').length;
    const pendingTests = testCases.filter((tc: any) => tc.status === 'pending').length;
    const passRate = totalTests > 0 ? ((passedTests / totalTests) * 100).toFixed(1) : 0;

    const prompt = `Generate a professional test execution report for the project "${projectName}".

Test Statistics:
- Total Test Cases: ${totalTests}
- Passed: ${passedTests}
- Failed: ${failedTests}
- Blocked: ${blockedTests}
- Pending: ${pendingTests}
- Pass Rate: ${passRate}%

Test Cases Details:
${testCases.map((tc: any, index: number) => `
${index + 1}. ${tc.title}
   Status: ${tc.status}
   Priority: ${tc.priority}
   User Story: ${tc.userStoryTitle || 'N/A'}
   ${tc.status === 'failed' ? 'Issue: Test failed during execution' : ''}
`).join('\n')}

Report Type: ${reportType || 'Executive Summary'}
Execution Period: ${testExecutionData?.startDate || 'N/A'} to ${testExecutionData?.endDate || new Date().toISOString().split('T')[0]}

Create a detailed test execution report that includes:
1. Executive Summary
2. Test Execution Overview
3. Test Results Summary with charts description
4. Detailed Test Results by Priority/User Story
5. Failed Test Cases Analysis
6. Risk Assessment
7. Quality Metrics and Trends
8. Recommendations and Next Steps
9. Appendix with test case details

Format the response as a professional document with clear sections, bullet points, and actionable insights.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a senior QA manager with expertise in test reporting, quality metrics, and stakeholder communication. Generate comprehensive, data-driven test reports that provide clear insights and actionable recommendations.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6,
        max_tokens: 4000,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('OpenAI API error:', data);
      throw new Error(data.error?.message || 'Failed to generate test report');
    }

    const testReport = data.choices[0].message.content;

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
        feature_type: 'test_report_generation',
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
    
    console.log('Test report generated successfully');

    return new Response(JSON.stringify({ 
      testReport,
      statistics: {
        totalTests,
        passedTests,
        failedTests,
        blockedTests,
        pendingTests,
        passRate: parseFloat(passRate)
      },
      metadata: {
        projectName,
        generatedAt: new Date().toISOString(),
        reportType,
        executionPeriod: testExecutionData
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in generate-test-report function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});