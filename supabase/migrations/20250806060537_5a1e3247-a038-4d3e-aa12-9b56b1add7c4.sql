-- Fix the security definer view issue by recreating without SECURITY DEFINER
DROP VIEW IF EXISTS public.ai_usage_summary;

-- Create regular view instead of security definer view
CREATE VIEW public.ai_usage_summary AS
SELECT 
  user_id,
  feature_type,
  COUNT(*) as usage_count,
  SUM(tokens_used) as total_tokens,
  AVG(execution_time_ms) as avg_execution_time,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate,
  DATE_TRUNC('day', created_at) as usage_date
FROM public.ai_usage_logs
WHERE user_id = auth.uid()  -- Filter by current user to respect RLS
GROUP BY user_id, feature_type, DATE_TRUNC('day', created_at);