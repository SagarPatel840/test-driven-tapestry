-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_stories table  
CREATE TABLE public.user_stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  status TEXT DEFAULT 'draft',
  priority TEXT DEFAULT 'medium',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create test_cases table
CREATE TABLE public.test_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_story_id UUID REFERENCES public.user_stories(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ai_usage_logs table
CREATE TABLE public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for projects
CREATE POLICY "Users can view their own projects" 
ON public.projects 
FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own projects" 
ON public.projects 
FOR INSERT 
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own projects" 
ON public.projects 
FOR UPDATE 
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own projects" 
ON public.projects 
FOR DELETE 
USING (auth.uid() = created_by);

-- RLS policies for user_stories
CREATE POLICY "Users can view user stories in their projects" 
ON public.user_stories 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = user_stories.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can create user stories in their projects" 
ON public.user_stories 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = user_stories.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update user stories in their projects" 
ON public.user_stories 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = user_stories.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete user stories in their projects" 
ON public.user_stories 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = user_stories.project_id 
    AND projects.created_by = auth.uid()
  )
);

-- RLS policies for test_cases
CREATE POLICY "Users can view test cases in their projects" 
ON public.test_cases 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = test_cases.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can create test cases in their projects" 
ON public.test_cases 
FOR INSERT 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = test_cases.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can update test cases in their projects" 
ON public.test_cases 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = test_cases.project_id 
    AND projects.created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete test cases in their projects" 
ON public.test_cases 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = test_cases.project_id 
    AND projects.created_by = auth.uid()
  )
);

-- RLS policies for ai_usage_logs
CREATE POLICY "Users can view their own AI usage logs" 
ON public.ai_usage_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI usage logs" 
ON public.ai_usage_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_stories_updated_at
BEFORE UPDATE ON public.user_stories
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_test_cases_updated_at
BEFORE UPDATE ON public.test_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();