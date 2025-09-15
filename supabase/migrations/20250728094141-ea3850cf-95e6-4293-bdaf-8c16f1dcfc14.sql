-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policies for projects
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

-- Create user_stories table
CREATE TABLE public.user_stories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on user_stories
ALTER TABLE public.user_stories ENABLE ROW LEVEL SECURITY;

-- Create policies for user_stories
CREATE POLICY "Users can view user stories from their projects" 
ON public.user_stories 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = user_stories.project_id 
  AND projects.created_by = auth.uid()
));

CREATE POLICY "Users can create user stories in their projects" 
ON public.user_stories 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = project_id 
  AND projects.created_by = auth.uid()
));

CREATE POLICY "Users can update user stories in their projects" 
ON public.user_stories 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = user_stories.project_id 
  AND projects.created_by = auth.uid()
));

-- Create test_cases table
CREATE TABLE public.test_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_story_id UUID REFERENCES public.user_stories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  steps TEXT,
  expected_result TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on test_cases
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;

-- Create policies for test_cases
CREATE POLICY "Users can view test cases from their projects" 
ON public.test_cases 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = test_cases.project_id 
  AND projects.created_by = auth.uid()
));

CREATE POLICY "Users can create test cases in their projects" 
ON public.test_cases 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = project_id 
  AND projects.created_by = auth.uid()
));

CREATE POLICY "Users can update test cases in their projects" 
ON public.test_cases 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.projects 
  WHERE projects.id = test_cases.project_id 
  AND projects.created_by = auth.uid()
));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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