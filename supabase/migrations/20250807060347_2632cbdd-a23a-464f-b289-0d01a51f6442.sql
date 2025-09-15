-- Add OpenAI-specific tracking columns to ai_usage_logs table
ALTER TABLE public.ai_usage_logs 
ADD COLUMN openai_model text,
ADD COLUMN openai_tokens_prompt integer DEFAULT 0,
ADD COLUMN openai_tokens_completion integer DEFAULT 0,
ADD COLUMN openai_cost_usd decimal(10,6) DEFAULT 0.0;

-- Add index for OpenAI usage queries
CREATE INDEX idx_ai_usage_logs_openai_model ON public.ai_usage_logs(openai_model) 
WHERE openai_model IS NOT NULL;

-- Update ai_usage_summary view to include OpenAI metrics
DROP VIEW IF EXISTS public.ai_usage_summary;

CREATE VIEW public.ai_usage_summary AS
SELECT 
  user_id,
  DATE_TRUNC('day', created_at) as usage_date,
  feature_type,
  COUNT(*) as usage_count,
  COUNT(*) FILTER (WHERE success = true) as successful_requests,
  ROUND(
    (COUNT(*) FILTER (WHERE success = true)::decimal / COUNT(*)) * 100, 
    2
  ) as success_rate,
  SUM(tokens_used) as total_tokens,
  SUM(openai_tokens_prompt) as total_prompt_tokens,
  SUM(openai_tokens_completion) as total_completion_tokens,
  SUM(openai_cost_usd) as total_cost_usd,
  AVG(execution_time_ms) as avg_execution_time,
  STRING_AGG(DISTINCT openai_model, ', ') FILTER (WHERE openai_model IS NOT NULL) as models_used
FROM public.ai_usage_logs
GROUP BY user_id, DATE_TRUNC('day', created_at), feature_type;

-- Grant necessary permissions
GRANT SELECT ON public.ai_usage_summary TO authenticated;