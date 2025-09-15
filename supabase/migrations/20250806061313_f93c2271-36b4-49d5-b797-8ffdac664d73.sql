-- Fix critical security issues

-- 1. Drop and recreate ai_usage_summary view without SECURITY DEFINER
DROP VIEW IF EXISTS public.ai_usage_summary;

CREATE VIEW public.ai_usage_summary AS
SELECT 
    user_id,
    feature_type,
    DATE_TRUNC('day', created_at) as usage_date,
    COUNT(*) as usage_count,
    SUM(tokens_used) as total_tokens,
    AVG(execution_time_ms) as avg_execution_time,
    (COUNT(*) FILTER (WHERE success = true)::float / COUNT(*)::float) as success_rate
FROM public.ai_usage_logs
GROUP BY user_id, feature_type, DATE_TRUNC('day', created_at);

-- 2. Add missing DELETE policies
CREATE POLICY "Users can delete test cases in their projects" 
ON public.test_cases 
FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = test_cases.project_id 
    AND projects.created_by = auth.uid()
));

CREATE POLICY "Users can delete user stories in their projects" 
ON public.user_stories 
FOR DELETE 
USING (EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = user_stories.project_id 
    AND projects.created_by = auth.uid()
));

CREATE POLICY "Users can delete their own AI usage logs" 
ON public.ai_usage_logs 
FOR DELETE 
USING (auth.uid() = user_id);

-- 3. Add missing UPDATE policy for ai_usage_logs
CREATE POLICY "Users can update their own AI usage logs" 
ON public.ai_usage_logs 
FOR UPDATE 
USING (auth.uid() = user_id);

-- 4. Add database constraints for data integrity
ALTER TABLE public.projects 
ADD CONSTRAINT projects_name_length_check 
CHECK (length(name) >= 1 AND length(name) <= 255);

ALTER TABLE public.projects 
ADD CONSTRAINT projects_description_length_check 
CHECK (description IS NULL OR length(description) <= 2000);

ALTER TABLE public.user_stories 
ADD CONSTRAINT user_stories_title_length_check 
CHECK (length(title) >= 1 AND length(title) <= 255);

ALTER TABLE public.test_cases 
ADD CONSTRAINT test_cases_title_length_check 
CHECK (length(title) >= 1 AND length(title) <= 255);

-- 5. Add indexes for better security and performance
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created 
ON public.ai_usage_logs(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_projects_created_by 
ON public.projects(created_by);

-- 6. Add audit trigger function for sensitive operations
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO public.ai_usage_logs (user_id, feature_type, success, execution_time_ms, tokens_used)
        VALUES (auth.uid(), 'audit_delete', true, 0, 0);
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;