-- Create AI usage tracking table
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  feature_type TEXT NOT NULL, -- 'test_cases', 'test_plan', 'test_report', 'automation'
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  tokens_used INTEGER DEFAULT 0,
  execution_time_ms INTEGER DEFAULT 0,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for AI usage logs
CREATE POLICY "Users can view their own AI usage logs" 
ON public.ai_usage_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI usage logs" 
ON public.ai_usage_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create AI usage summary view
CREATE OR REPLACE VIEW public.ai_usage_summary AS
SELECT 
  user_id,
  feature_type,
  COUNT(*) as usage_count,
  SUM(tokens_used) as total_tokens,
  AVG(execution_time_ms) as avg_execution_time,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate,
  DATE_TRUNC('day', created_at) as usage_date
FROM public.ai_usage_logs
GROUP BY user_id, feature_type, DATE_TRUNC('day', created_at);

-- Create indexes for better performance
CREATE INDEX idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX idx_ai_usage_logs_feature_type ON public.ai_usage_logs(feature_type);
CREATE INDEX idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at);