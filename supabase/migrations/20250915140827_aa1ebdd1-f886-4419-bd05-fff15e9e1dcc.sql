-- Update RLS policies for performance_reports to allow user-scoped access without requiring projects table
DROP POLICY IF EXISTS "Users can view performance reports in their projects" ON public.performance_reports;
DROP POLICY IF EXISTS "Users can create performance reports in their projects" ON public.performance_reports;  
DROP POLICY IF EXISTS "Users can update performance reports in their projects" ON public.performance_reports;
DROP POLICY IF EXISTS "Users can delete performance reports in their projects" ON public.performance_reports;

-- Create simpler user-scoped policies
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