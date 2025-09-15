-- Add missing columns to existing tables

-- Add markdown_settings to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS markdown_settings JSONB DEFAULT '{}'::jsonb;

-- Add steps and expected_result to test_cases table  
ALTER TABLE public.test_cases 
ADD COLUMN IF NOT EXISTS steps TEXT,
ADD COLUMN IF NOT EXISTS expected_result TEXT;

-- Add acceptance_criteria to user_stories table
ALTER TABLE public.user_stories 
ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT;