-- Add markdown_settings column to projects table
ALTER TABLE public.projects 
ADD COLUMN markdown_settings TEXT DEFAULT '';

-- Update the updated_at trigger to include the new column
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON COLUMN public.projects.markdown_settings IS 'Markdown-formatted settings and context for AI test generation (test cases, automation scripts, test plans, test reports)';