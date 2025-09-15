import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('AI Analytics function called');

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

    console.log('Fetching AI analytics for user:', user.id);

    // Get overall AI usage stats
    const { data: usageStats, error: usageError } = await supabase
      .from('ai_usage_logs')
      .select('*')
      .eq('user_id', user.id);

    if (usageError) {
      console.error('Usage stats error:', usageError);
      throw usageError;
    }

    // Calculate metrics
    const totalUsage = usageStats?.length || 0;
    const successfulUsage = usageStats?.filter(log => log.success).length || 0;
    const totalTokens = usageStats?.reduce((sum, log) => sum + (log.tokens_used || 0), 0) || 0;
    const totalCost = usageStats?.reduce((sum, log) => sum + (log.openai_cost_usd || 0), 0) || 0;
    const openaiUsage = usageStats?.filter(log => log.openai_model) || [];
    const avgExecutionTime = usageStats?.length > 0 
      ? usageStats.reduce((sum, log) => sum + (log.execution_time_ms || 0), 0) / usageStats.length 
      : 0;

    // Group by feature type
    const featureUsage = usageStats?.reduce((acc: any, log) => {
      if (!acc[log.feature_type]) {
        acc[log.feature_type] = { 
          count: 0, 
          tokens: 0, 
          cost: 0, 
          avgTime: 0, 
          successRate: 0,
          models: new Set()
        };
      }
      acc[log.feature_type].count++;
      acc[log.feature_type].tokens += log.tokens_used || 0;
      acc[log.feature_type].cost += log.openai_cost_usd || 0;
      acc[log.feature_type].avgTime += log.execution_time_ms || 0;
      acc[log.feature_type].successRate += log.success ? 1 : 0;
      if (log.openai_model) {
        acc[log.feature_type].models.add(log.openai_model);
      }
      return acc;
    }, {}) || {};

    // Calculate averages and success rates
    Object.keys(featureUsage).forEach(feature => {
      const data = featureUsage[feature];
      data.avgTime = data.count > 0 ? data.avgTime / data.count : 0;
      data.successRate = data.count > 0 ? (data.successRate / data.count) * 100 : 0;
      data.models = Array.from(data.models);
    });

    // OpenAI specific metrics
    const openaiMetrics = {
      totalRequests: openaiUsage.length,
      totalCost: totalCost,
      modelBreakdown: openaiUsage.reduce((acc: any, log) => {
        const model = log.openai_model;
        if (model) {
          if (!acc[model]) {
            acc[model] = { 
              requests: 0, 
              promptTokens: 0, 
              completionTokens: 0, 
              cost: 0 
            };
          }
          acc[model].requests++;
          acc[model].promptTokens += log.openai_tokens_prompt || 0;
          acc[model].completionTokens += log.openai_tokens_completion || 0;
          acc[model].cost += log.openai_cost_usd || 0;
        }
        return acc;
      }, {}),
      avgCostPerRequest: openaiUsage.length > 0 ? totalCost / openaiUsage.length : 0
    };

    // Calculate utilization patterns (mock data for demonstration)
    const now = new Date();
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentUsage = usageStats?.filter(log => 
      new Date(log.created_at) >= last30Days
    ).length || 0;

    // Determine utilization level
    let utilizationLevel = 'optimal';
    let utilizationMessage = 'Your AI usage is well-balanced';
    
    if (recentUsage > 100) {
      utilizationLevel = 'high';
      utilizationMessage = 'You are a power user! Consider upgrading for better performance';
    } else if (recentUsage < 10) {
      utilizationLevel = 'low';
      utilizationMessage = 'You could benefit more from AI features. Try generating more test cases!';
    }

    // Daily usage trend (last 7 days)
    const dailyUsage = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      
      const dayUsage = usageStats?.filter(log => {
        const logDate = new Date(log.created_at);
        return logDate >= dayStart && logDate < dayEnd;
      }).length || 0;

      return {
        date: date.toISOString().split('T')[0],
        usage: dayUsage
      };
    }).reverse();

    const analytics = {
      overview: {
        totalUsage,
        successfulUsage,
        successRate: totalUsage > 0 ? (successfulUsage / totalUsage) * 100 : 0,
        totalTokens,
        totalCost: Math.round(totalCost * 100) / 100, // Round to cents
        avgExecutionTime: Math.round(avgExecutionTime)
      },
      openai: openaiMetrics,
      utilization: {
        level: utilizationLevel,
        message: utilizationMessage,
        recentUsage: recentUsage,
        trend: recentUsage > 50 ? 'increasing' : recentUsage > 10 ? 'stable' : 'decreasing'
      },
      featureBreakdown: featureUsage,
      dailyTrend: dailyUsage,
      recommendations: [
        utilizationLevel === 'low' ? 'Try using AI to generate test plans automatically' : null,
        utilizationLevel === 'high' ? 'Consider creating templates to optimize your workflows' : null,
        totalUsage > 0 && (successfulUsage / totalUsage) < 0.8 ? 'Review failed requests to improve success rate' : null
      ].filter(Boolean)
    };

    console.log('AI analytics calculated successfully');

    return new Response(
      JSON.stringify(analytics),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('AI Analytics error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});