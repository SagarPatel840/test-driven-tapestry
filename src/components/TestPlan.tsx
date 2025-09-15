import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { 
  FileText, 
  Download, 
  Loader2, 
  Target,
  CheckCircle,
  Calendar,
  Users,
  Upload,
  Settings
} from "lucide-react";

interface TestPlanProps {
  projectId: string;
}

export const TestPlan = ({ projectId }: TestPlanProps) => {
  const [loading, setLoading] = useState(false);
  const [testPlan, setTestPlan] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [testingScope, setTestingScope] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [requirementsDoc, setRequirementsDoc] = useState("");
  const [userStories, setUserStories] = useState<any[]>([]);
  const { toast } = useToast();
  const { session } = useAuth();

  // Load user stories when component mounts
  useState(() => {
    const loadUserStories = () => {
      const stored = localStorage.getItem(`userStories_${projectId}`);
      if (stored) {
        const stories = JSON.parse(stored);
        setUserStories(stories);
      }
    };
    loadUserStories();
  });

  // Load OpenAI config from localStorage (from integrations)
  const loadOpenAIConfig = () => {
    try {
      const saved = localStorage.getItem('integration-configs');
      const configs = saved ? JSON.parse(saved) : {};
      return configs.openai;
    } catch {
      return null;
    }
  };

  const generateTestPlan = async () => {
    if (!projectName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }

    // Check if OpenAI is configured
    const openAIConfig = loadOpenAIConfig();
    if (!openAIConfig?.endpoint || !openAIConfig?.apiKey || !openAIConfig?.deploymentId) {
      toast({
        title: "Error",
        description: "Please configure Azure OpenAI in the Integrations tab first",
        variant: "destructive",
      });
      return;
    }

    if (userStories.length === 0 && !requirementsDoc.trim()) {
      toast({
        title: "Error", 
        description: "Please add user stories or upload a requirements document",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-test-plan', {
        body: {
          userStories,
          projectName,
          testingScope,
          customPrompt: customPrompt.trim(),
          requirementsDoc: requirementsDoc.trim(),
          openAIConfig
        }
      });

      if (error) throw error;

      setTestPlan(data.testPlan);
      toast({
        title: "Success",
        description: "Test plan generated successfully!",
      });
    } catch (error) {
      console.error('Error generating test plan:', error);
      toast({
        title: "Error",
        description: "Failed to generate test plan. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTestPlan = () => {
    if (!testPlan) return;
    
    const blob = new Blob([testPlan], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'project'}-test-plan.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Test Plan Generator</h2>
          <p className="text-muted-foreground">
            Generate comprehensive test plans using AI
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Test Plan Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                placeholder="Enter project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="testingScope">Testing Scope</Label>
              <Select value={testingScope} onValueChange={setTestingScope}>
                <SelectTrigger>
                  <SelectValue placeholder="Select testing scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full Application Testing</SelectItem>
                  <SelectItem value="functional">Functional Testing Only</SelectItem>
                  <SelectItem value="regression">Regression Testing</SelectItem>
                  <SelectItem value="integration">Integration Testing</SelectItem>
                  <SelectItem value="performance">Performance Testing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="customPrompt">Custom Prompt (Optional)</Label>
            <Textarea
              id="customPrompt"
              placeholder="Enter specific requirements or constraints for the test plan generation..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={3}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="requirementsDoc">Requirements Document (Optional)</Label>
            <Textarea
              id="requirementsDoc"
              placeholder="Paste your requirements document content here as an alternative to user stories..."
              value={requirementsDoc}
              onChange={(e) => setRequirementsDoc(e.target.value)}
              rows={6}
            />
          </div>
          
          <div className="space-y-2">
            <Label>User Stories ({userStories.length} available)</Label>
            <div className="flex flex-wrap gap-2">
              {userStories.slice(0, 5).map((story, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {story.title}
                </Badge>
              ))}
              {userStories.length > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{userStories.length - 5} more
                </Badge>
              )}
            </div>
            {userStories.length === 0 && !requirementsDoc.trim() && (
              <p className="text-sm text-muted-foreground">
                Add user stories in the User Stories tab or paste requirements document above
              </p>
            )}
          </div>

          <Button 
            onClick={generateTestPlan} 
            disabled={loading}
            className="w-full md:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Test Plan...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Test Plan
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Test Plan */}
      {testPlan && (
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Generated Test Plan
              </CardTitle>
              <Button variant="outline" onClick={downloadTestPlan}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono overflow-auto max-h-96">
                {testPlan}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">User Stories</p>
                <p className="text-2xl font-bold">{userStories.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-accent" />
              <div>
                <p className="text-sm font-medium">Test Plans</p>
                <p className="text-2xl font-bold">{testPlan ? 1 : 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-success" />
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-sm font-semibold text-success">
                  {testPlan ? 'Generated' : 'Ready'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};