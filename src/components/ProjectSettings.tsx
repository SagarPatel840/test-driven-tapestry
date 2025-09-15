import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, FileText, TestTube, PlayCircle, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateText, sanitizeText } from "@/lib/security";

interface ProjectSettingsProps {
  projectId: string;
  projectName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MarkdownSettings {
  general: string;
  testCases: string;
  automation: string;
  testPlan: string;
  testReport: string;
}

const defaultSettings: MarkdownSettings = {
  general: `# Project Context

## Application Overview
Describe your application's purpose, key features, and target users.

## Technology Stack
- Frontend: React, TypeScript
- Backend: Node.js, Express
- Database: PostgreSQL
- Testing: Jest, Cypress

## Business Rules
List important business rules and constraints that should be considered during test generation.`,

  testCases: `# Test Case Generation Settings

## Test Coverage Requirements
- Unit tests for all business logic
- Integration tests for API endpoints
- E2E tests for critical user journeys

## Test Data Requirements
- Use realistic test data
- Include edge cases and boundary conditions
- Consider accessibility requirements

## Specific Focus Areas
List specific features or components that need thorough testing.`,

  automation: `# Automation Script Settings

## Automation Framework
- Selenium WebDriver
- Page Object Model pattern
- Data-driven testing approach

## Environment Configuration
- Base URL: https://your-app.com
- Test environment credentials
- Browser compatibility requirements

## Automation Guidelines
- Use explicit waits
- Implement proper error handling
- Include logging and reporting`,

  testPlan: `# Test Plan Generation Settings

## Testing Scope
Define what will and won't be tested in this project.

## Test Strategy
- Testing types (unit, integration, system, acceptance)
- Test execution approach
- Defect management process

## Entry and Exit Criteria
- Entry criteria: What must be ready before testing begins
- Exit criteria: What must be achieved to complete testing

## Risk Assessment
List potential risks and mitigation strategies.`,

  testReport: `# Test Report Generation Settings

## Reporting Requirements
- Executive summary format
- Detailed test results
- Defect analysis and trends

## Metrics to Include
- Test coverage percentage
- Pass/fail rates
- Defect density
- Performance metrics

## Stakeholder Information
- Primary audience for reports
- Reporting frequency
- Communication preferences`
};

export const ProjectSettings = ({ projectId, projectName, isOpen, onClose }: ProjectSettingsProps) => {
  const [settings, setSettings] = useState<MarkdownSettings>(defaultSettings);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && projectId) {
      fetchSettings();
    }
  }, [isOpen, projectId]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('markdown_settings')
        .eq('id', projectId)
        .single();

      if (error) throw error;

      if (data?.markdown_settings) {
        try {
          const parsedSettings = typeof data.markdown_settings === 'string' 
            ? JSON.parse(data.markdown_settings) 
            : data.markdown_settings;
          setSettings({ ...defaultSettings, ...parsedSettings });
        } catch {
          // If parsing fails, use defaults
          setSettings(defaultSettings);
        }
      }
    } catch (error) {
      console.error('Error fetching project settings:', error);
      toast({
        title: "Error",
        description: "Failed to load project settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Validate each setting
      for (const [key, value] of Object.entries(settings)) {
        const validation = validateText(value, `${key} settings`, 0, 10000, false);
        if (!validation.isValid) {
          toast({
            title: "Error",
            description: validation.error,
            variant: "destructive",
          });
          setSaving(false);
          return;
        }
      }

      // Sanitize settings
      const sanitizedSettings = Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [key, sanitizeText(value)])
      );

      const { error } = await supabase
        .from('projects')
        .update({ 
          markdown_settings: JSON.stringify(sanitizedSettings),
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Project settings saved successfully",
      });
      onClose();
    } catch (error) {
      console.error('Error saving project settings:', error);
      toast({
        title: "Error",
        description: "Failed to save project settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: keyof MarkdownSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
    toast({
      title: "Settings Reset",
      description: "All settings have been reset to defaults",
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {projectName} - AI Generation Settings
          </DialogTitle>
          <DialogDescription>
            Configure markdown-based context and instructions for AI-powered test generation features.
            These settings will be used when generating test cases, automation scripts, test plans, and reports.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-pulse">Loading settings...</div>
          </div>
        ) : (
          <Tabs defaultValue="general" className="mt-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="testCases" className="flex items-center gap-1">
                <TestTube className="h-4 w-4" />
                Test Cases
              </TabsTrigger>
              <TabsTrigger value="automation" className="flex items-center gap-1">
                <PlayCircle className="h-4 w-4" />
                Automation
              </TabsTrigger>
              <TabsTrigger value="testPlan" className="flex items-center gap-1">
                <ClipboardCheck className="h-4 w-4" />
                Test Plan
              </TabsTrigger>
              <TabsTrigger value="testReport" className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                Report
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>General Project Context</CardTitle>
                  <CardDescription>
                    Provide general information about your project that will be used across all AI generation features.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.general}
                    onChange={(e) => updateSetting('general', e.target.value)}
                    rows={15}
                    placeholder="Enter general project context in markdown format..."
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="testCases" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Test Case Generation Settings</CardTitle>
                  <CardDescription>
                    Configure specific requirements and guidelines for AI test case generation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.testCases}
                    onChange={(e) => updateSetting('testCases', e.target.value)}
                    rows={15}
                    placeholder="Enter test case generation settings in markdown format..."
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="automation" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Automation Script Settings</CardTitle>
                  <CardDescription>
                    Define automation framework preferences and scripting guidelines.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.automation}
                    onChange={(e) => updateSetting('automation', e.target.value)}
                    rows={15}
                    placeholder="Enter automation script settings in markdown format..."
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="testPlan" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Test Plan Generation Settings</CardTitle>
                  <CardDescription>
                    Configure test strategy, scope, and planning requirements.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.testPlan}
                    onChange={(e) => updateSetting('testPlan', e.target.value)}
                    rows={15}
                    placeholder="Enter test plan settings in markdown format..."
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="testReport" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Test Report Generation Settings</CardTitle>
                  <CardDescription>
                    Define reporting requirements and metrics preferences.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={settings.testReport}
                    onChange={(e) => updateSetting('testReport', e.target.value)}
                    rows={15}
                    placeholder="Enter test report settings in markdown format..."
                    className="font-mono text-sm"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={resetToDefaults}
            disabled={saving}
          >
            Reset to Defaults
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};