-- Fix RLS policies for performance_reports table
-- Enable Row Level Security
ALTER TABLE public.performance_reports ENABLE ROW LEVEL SECURITY;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view their own performance reports" ON public.performance_reports;
DROP POLICY IF EXISTS "Users can insert their own performance reports" ON public.performance_reports;
DROP POLICY IF EXISTS "Users can update their own performance reports" ON public.performance_reports;
DROP POLICY IF EXISTS "Users can delete their own performance reports" ON public.performance_reports;

-- Create fixed policies
CREATE POLICY "Users can view their own performance reports"
ON public.performance_reports
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own performance reports"
ON public.performance_reports
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own performance reports"
ON public.performance_reports
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own performance reports"
ON public.performance_reports
FOR DELETE
USING (auth.uid() = created_by);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_performance_reports_created_by ON public.performance_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_performance_reports_created_at ON public.performance_reports(created_at);