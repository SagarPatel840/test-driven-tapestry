-- Create profiles table to store user display names
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Profiles are viewable by everyone" 
ON public.profiles 
FOR SELECT 
USING (true);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Add trigger for timestamps
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create a view for admin user analytics
CREATE VIEW public.admin_user_analytics AS
SELECT 
  p.display_name COALESCE(p.email, 'User ' || SUBSTRING(CAST(al.user_id AS text), 1, 8)) as user_display,
  al.user_id,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE al.success = true) as successful_requests,
  SUM(al.tokens_used) as total_tokens,
  SUM(al.openai_tokens_prompt) as total_prompt_tokens,
  SUM(al.openai_tokens_completion) as total_completion_tokens,
  SUM(al.openai_cost_usd) as total_cost_usd,
  AVG(al.execution_time_ms) as avg_execution_time,
  MIN(al.created_at) as first_usage,
  MAX(al.created_at) as last_usage,
  STRING_AGG(DISTINCT al.feature_type, ', ') as features_used,
  STRING_AGG(DISTINCT al.openai_model, ', ') FILTER (WHERE al.openai_model IS NOT NULL) as models_used
FROM public.ai_usage_logs al
LEFT JOIN public.profiles p ON p.user_id = al.user_id
GROUP BY al.user_id, p.display_name, p.email
ORDER BY total_tokens DESC;

-- Grant necessary permissions
GRANT SELECT ON public.admin_user_analytics TO authenticated;