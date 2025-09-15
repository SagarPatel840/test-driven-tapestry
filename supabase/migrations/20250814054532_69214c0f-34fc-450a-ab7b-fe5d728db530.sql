-- Add markdown_settings column to projects table
ALTER TABLE public.projects 
ADD COLUMN markdown_settings TEXT DEFAULT '';

-- Add comment for documentation
COMMENT ON COLUMN public.projects.markdown_settings IS 'Markdown-formatted settings and context for AI test generation (test cases, automation scripts, test plans, test reports)';