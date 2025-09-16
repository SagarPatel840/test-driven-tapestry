-- Create table for storing performance test reports
CREATE TABLE public.performance_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  report_name text NOT NULL,
  ai_provider text NOT NULL CHECK (ai_provider IN ('gemini', 'azure-openai')),
  report_content text NOT NULL,
  csv_files_metadata jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed'))
);

-- Enable RLS
ALTER TABLE public.performance_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for performance reports
CREATE POLICY "Users can create performance reports in their projects" 
ON public.performance_reports 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND 
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = performance_reports.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can view performance reports in their projects" 
ON public.performance_reports 
FOR SELECT 
using (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = performance_reports.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update performance reports in their projects" 
ON public.performance_reports 
FOR UPDATE 
using (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = performance_reports.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete performance reports in their projects" 
ON public.performance_reports 
FOR DELETE 
using (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = performance_reports.project_id 
    AND projects.created_by = auth.uid()
  )
);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_performance_reports_updated_at
BEFORE UPDATE ON public.performance_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();