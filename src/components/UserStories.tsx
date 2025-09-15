import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  FileText, 
  Bot, 
  ExternalLink, 
  Settings,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  Cloud,
  Trash2
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface TestCase {
  id: string;
  title: string;
  description: string;
  steps: string[];
  expectedResult: string;
  priority: 'low' | 'medium' | 'high';
  status: 'not-run' | 'passed' | 'failed' | 'blocked';
  userStoryId: string;
  userStoryTitle: string;
  estimatedTime: string;
}

interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  source: 'manual' | 'jira' | 'azure';
  priority: 'low' | 'medium' | 'high';
  status: 'draft' | 'ready' | 'in-progress' | 'completed';
  testCasesGenerated: number;
}

interface UserStoriesProps {
  onViewChange: (view: string) => void;
  projectId: string;
}

export const UserStories = ({ onViewChange, projectId }: UserStoriesProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const [stories, setStories] = useState<UserStory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentProject, setCurrentProject] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newStory, setNewStory] = useState<{
    title: string;
    description: string;
    acceptanceCriteria: string;
    priority: 'low' | 'medium' | 'high';
  }>({
    title: '',
    description: '',
    acceptanceCriteria: '',
    priority: 'medium'
  });

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  
  // Custom prompt states for regeneration
  const [showCustomPromptDialog, setShowCustomPromptDialog] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedStoryForRegenerate, setSelectedStoryForRegenerate] = useState<string | null>(null);

  // Filtered stories
  const filteredStories = stories.filter(story => {
    const matchesSearch = story.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         story.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || story.priority === priorityFilter;
    const matchesStatus = statusFilter === 'all' || story.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || story.source === sourceFilter;
    
    return matchesSearch && matchesPriority && matchesStatus && matchesSource;
  });

  // Load saved configurations from localStorage
  const loadSavedConfigurations = () => {
    try {
      const saved = localStorage.getItem('integration-configs');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  };

  // Extract text from Jira's Atlassian Document Format (ADF)
  const extractTextFromJiraContent = (content: any): string => {
    if (typeof content === 'string') return content;
    if (!content) return 'No description available';
    
    if (content.content && Array.isArray(content.content)) {
      const textParts: string[] = [];
      
      const extractText = (node: any) => {
        if (node.type === 'text' && node.text) {
          textParts.push(node.text);
        } else if (node.content && Array.isArray(node.content)) {
          node.content.forEach(extractText);
        }
      };
      
      content.content.forEach(extractText);
      return textParts.join(' ').trim() || 'No description available';
    }
    
    return 'No description available';
  };

  // Get or create a default project
  const getOrCreateProject = async () => {
    if (!session?.user?.id) return null;

    try {
      // First, try to get an existing project
      const { data: projects, error: fetchError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('created_by', session.user.id)
        .limit(1);

      if (fetchError) {
        console.error('Error fetching projects:', fetchError);
        return null;
      }

      if (projects && projects.length > 0) {
        return projects[0].id;
      }

      // Create a default project if none exists
      const { data: newProject, error: createError } = await supabase
        .from('projects')
        .insert({
          name: 'Default Project',
          description: 'Default project for user stories',
          created_by: session.user.id
        })
        .select('id')
        .single();

      if (createError) {
        console.error('Error creating project:', createError);
        return null;
      }

      return newProject.id;
    } catch (error) {
      console.error('Error in getOrCreateProject:', error);
      return null;
    }
  };

  // Load stories from database
  const loadStoriesFromDatabase = async () => {
    if (!session?.user?.id) return;

    setIsLoading(true);
    try {
      const projectId = await getOrCreateProject();
      if (!projectId) {
        throw new Error('Failed to get or create project');
      }

      setCurrentProject(projectId);

      const { data: dbStories, error } = await supabase
        .from('user_stories')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const transformedStories: UserStory[] = await Promise.all(
        (dbStories || []).map(async (story) => {
          // Count test cases for this story
          const { count } = await supabase
            .from('test_cases')
            .select('*', { count: 'exact', head: true })
            .eq('user_story_id', story.id)
            .eq('project_id', projectId);

          return {
            id: story.id,
            title: story.title,
            description: story.description || '',
            acceptanceCriteria: story.acceptance_criteria || '',
            source: 'manual' as const,
            priority: story.priority as 'low' | 'medium' | 'high',
            status: story.status as 'draft' | 'ready' | 'in-progress' | 'completed',
            testCasesGenerated: count || 0
          };
        })
      );

      setStories(transformedStories);
    } catch (error) {
      console.error('Error loading stories from database:', error);
      toast({
        title: "Error",
        description: "Failed to load user stories from database",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load stories from external integrations and sync to database
  const syncFromIntegrations = async () => {
    if (!session?.user?.id || !currentProject) {
      toast({
        title: "Error",
        description: "Please make sure you're logged in and have a project",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    const savedConfigs = loadSavedConfigurations();
    let syncedCount = 0;

    try {
      // Sync Jira stories
      if (savedConfigs.jira?.enabled) {
        const { url, email, apiToken, projectKey } = savedConfigs.jira;
        
        if (url && email && apiToken && projectKey) {
          try {
            const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/jira-integration`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jiraUrl: url,
                email: email,
                apiToken: apiToken,
                projectKey: projectKey
              })
            });

            const data = await response.json();

            if (data.success && data.stories) {
              for (const story of data.stories) {
                // Check if story already exists by title and project_id
                const { data: existingStory } = await supabase
                  .from('user_stories')
                  .select('id')
                  .eq('project_id', currentProject)
                  .eq('title', story.title)
                  .single();

                if (existingStory) {
                  // Update existing story
                  const { error } = await supabase
                    .from('user_stories')
                    .update({
                      description: extractTextFromJiraContent(story.description),
                      acceptance_criteria: story.acceptanceCriteria || '',
                      priority: story.priority?.toLowerCase() || 'medium',
                      status: story.status?.toLowerCase().replace(' ', '-') || 'draft'
                    })
                    .eq('id', existingStory.id);

                  if (!error) {
                    syncedCount++;
                  }
                } else {
                  // Insert new story (let database generate UUID)
                  const { error } = await supabase
                    .from('user_stories')
                    .insert({
                      project_id: currentProject,
                      title: story.title,
                      description: extractTextFromJiraContent(story.description),
                      acceptance_criteria: story.acceptanceCriteria || '',
                      priority: story.priority?.toLowerCase() || 'medium',
                      status: story.status?.toLowerCase().replace(' ', '-') || 'draft',
                      created_by: session?.user?.id || ''
                    });

                  if (!error) {
                    syncedCount++;
                  }
                }
              }
            }
          } catch (error) {
            console.error('Failed to sync Jira stories:', error);
          }
        }
      }

      // Sync Azure DevOps stories
      if (savedConfigs['azure-devops']?.enabled) {
        const { organizationUrl, projectName, personalAccessToken } = savedConfigs['azure-devops'];
        
        if (organizationUrl && projectName && personalAccessToken) {
          try {
            const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/azure-devops-integration`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                organizationUrl,
                projectName,
                personalAccessToken
              })
            });

            const data = await response.json();

            if (data.success && data.stories) {
              for (const story of data.stories) {
                // Check if story already exists by title and project_id
                const { data: existingStory } = await supabase
                  .from('user_stories')
                  .select('id')
                  .eq('project_id', currentProject)
                  .eq('title', story.title)
                  .single();

                if (existingStory) {
                  // Update existing story
                  const { error } = await supabase
                    .from('user_stories')
                    .update({
                      description: story.description,
                      acceptance_criteria: story.acceptanceCriteria || '',
                      priority: story.priority || 'medium',
                      status: story.status || 'draft'
                    })
                    .eq('id', existingStory.id);

                  if (!error) {
                    syncedCount++;
                  }
                } else {
                  // Insert new story (let database generate UUID)
                  const { error } = await supabase
                    .from('user_stories')
                    .insert({
                      project_id: currentProject,
                      title: story.title,
                      description: story.description,
                      acceptance_criteria: story.acceptanceCriteria || '',
                      priority: story.priority || 'medium',
                      status: story.status || 'draft',
                      created_by: session?.user?.id || ''
                    });

                  if (!error) {
                    syncedCount++;
                  }
                }
              }
            }
          } catch (error) {
            console.error('Failed to sync Azure DevOps stories:', error);
          }
        }
      }

      if (syncedCount > 0) {
        toast({
          title: "Sync Complete",
          description: `Synced ${syncedCount} user stories from external systems`,
        });
        // Reload stories from database
        await loadStoriesFromDatabase();
      } else {
        toast({
          title: "No Changes",
          description: "No new stories to sync from external systems",
        });
      }
    } catch (error) {
      console.error('Error syncing from integrations:', error);
      toast({
        title: "Sync Failed",
        description: "Failed to sync stories from external integrations",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Load stories on component mount
  useEffect(() => {
    if (session?.user?.id) {
      loadStoriesFromDatabase();
    }
  }, [session?.user?.id]);

  const handleAddStory = async () => {
    if (!newStory.title || !newStory.description) {
      toast({
        title: "Error",
        description: "Please fill in title and description",
        variant: "destructive",
      });
      return;
    }

    if (!session?.user?.id || !currentProject) {
      toast({
        title: "Error",
        description: "Please make sure you're logged in",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_stories')
        .insert({
          project_id: currentProject,
          title: newStory.title,
          description: newStory.description,
          acceptance_criteria: newStory.acceptanceCriteria,
          priority: newStory.priority,
          status: 'draft',
          created_by: session?.user?.id || ''
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const newUserStory: UserStory = {
        id: data.id,
        title: data.title,
        description: data.description || '',
        acceptanceCriteria: data.acceptance_criteria || '',
        source: 'manual',
        priority: data.priority as 'low' | 'medium' | 'high',
        status: data.status as 'draft' | 'ready' | 'in-progress' | 'completed',
        testCasesGenerated: 0
      };

      setStories(prev => [newUserStory, ...prev]);
      setNewStory({ title: '', description: '', acceptanceCriteria: '', priority: 'medium' });
      setShowAddForm(false);
      
      toast({
        title: "Success",
        description: "User story created and saved to database",
      });
    } catch (error) {
      console.error('Error creating story:', error);
      toast({
        title: "Error",
        description: "Failed to create user story",
        variant: "destructive",
      });
    }
  };

  const generateTestCases = async (storyId: string, customPrompt?: string) => {
    const story = stories.find(s => s.id === storyId);
    if (!story) return;

    if (!session?.access_token) {
      toast({
        title: "Authentication Error",
        description: "Please log in to generate test cases",
        variant: "destructive",
      });
      return;
    }

    // Check if Azure OpenAI is configured
    const savedConfigs = loadSavedConfigurations();
    const azureConfig = savedConfigs.openai;
    if (!azureConfig?.endpoint || !azureConfig?.apiKey || !azureConfig?.deploymentId) {
      toast({
        title: "Azure OpenAI Not Configured",
        description: "Please configure Azure OpenAI in integrations first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/generate-test-cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          story: {
            id: story.id,
            title: story.title,
            description: story.description,
            acceptanceCriteria: story.acceptanceCriteria,
            priority: story.priority,
            issueType: 'Story'
          },
          azureConfig,
          customPrompt
        })
      });

      const data = await response.json();

      if (data.success && data.testCases) {
        if (!currentProject) {
          throw new Error('No project selected');
        }

        // Delete existing test cases for this user story (for regeneration)
        await supabase
          .from('test_cases')
          .delete()
          .eq('user_story_id', storyId)
          .eq('project_id', currentProject);

        // Save new test cases to database
        const testCasesToInsert = data.testCases.map((testCase: any) => ({
          project_id: currentProject,
          user_story_id: storyId,
          title: testCase.title || testCase.name || 'Test Case',
          description: testCase.description || '',
          steps: testCase.steps ? (Array.isArray(testCase.steps) ? testCase.steps.join('\n') : testCase.steps) : '',
          expected_result: testCase.expectedResult || testCase.expected || '',
          priority: (testCase.priority || 'medium').toLowerCase(),
          status: 'draft'
        }));

        const { error: insertError } = await supabase
          .from('test_cases')
          .insert(testCasesToInsert);

        if (insertError) {
          throw insertError;
        }

        // Update story status in database
        await supabase
          .from('user_stories')
          .update({ status: 'completed' })
          .eq('id', storyId)
          .eq('project_id', currentProject);

        // Update local state with actual count from database
        const updatedStories = stories.map(s => 
          s.id === storyId 
            ? { ...s, testCasesGenerated: data.testCases.length, status: 'completed' as const }
            : s
        );
        setStories(updatedStories);

        toast({
          title: "Test Cases Generated & Saved",
          description: `Generated and saved ${data.testCases.length} test cases for this story`,
        });
      }
    } catch (error) {
      console.error('Error generating test cases:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate test cases. Please try again.",
        variant: "destructive",
      });
    }
  };

  const deleteUserStory = async (storyId: string, storyTitle: string) => {
    try {
      // First delete all associated test cases
      const { error: testCasesError } = await supabase
        .from('test_cases')
        .delete()
        .eq('user_story_id', storyId);

      if (testCasesError) throw testCasesError;

      // Then delete the user story
      const { error } = await supabase
        .from('user_stories')
        .delete()
        .eq('id', storyId);

      if (error) throw error;

      // Remove from local state
      setStories(prev => prev.filter(story => story.id !== storyId));

      toast({
        title: "User Story Deleted",
        description: `"${storyTitle}" and its test cases have been deleted successfully`,
      });
    } catch (error) {
      console.error('Error deleting user story:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete user story",
        variant: "destructive",
      });
    }
  };

  const handleRegenerateClick = (storyId: string) => {
    setSelectedStoryForRegenerate(storyId);
    setCustomPrompt('');
    setShowCustomPromptDialog(true);
  };

  const handleCustomRegenerate = async () => {
    if (!selectedStoryForRegenerate) return;
    
    setShowCustomPromptDialog(false);
    await generateTestCases(selectedStoryForRegenerate, customPrompt || undefined);
    setSelectedStoryForRegenerate(null);
    setCustomPrompt('');
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': return 'bg-warning text-warning-foreground';
      case 'low': return 'bg-success text-success-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'jira': return <ExternalLink className="h-3 w-3" />;
      case 'azure': return <ExternalLink className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">User Stories</h2>
          <p className="text-muted-foreground">
            Manage user stories and generate test cases with AI
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={syncFromIntegrations}
            disabled={isSyncing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync from Integrations'}
          </Button>
          <Button variant="outline" onClick={() => onViewChange('integrations')}>
            <Settings className="mr-2 h-4 w-4" />
            Setup Integrations
          </Button>
          <Button variant="gradient" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Story
          </Button>
        </div>
      </div>

      {/* Sync Info Card */}
      <Card className="shadow-card border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Cloud className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium">Database Integration</p>
              <p className="text-sm text-muted-foreground">
                User stories are automatically saved to your database. Use the "Sync from Integrations" button to import stories from Jira or Azure DevOps.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search user stories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Source</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="jira">Jira</SelectItem>
                  <SelectItem value="azure">Azure</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Story Form */}
      {showAddForm && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Add New User Story</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Story title"
              value={newStory.title}
              onChange={(e) => setNewStory({ ...newStory, title: e.target.value })}
            />
            <Textarea
              placeholder="Story description (As a... I want... So that...)"
              value={newStory.description}
              onChange={(e) => setNewStory({ ...newStory, description: e.target.value })}
              rows={3}
            />
            <Textarea
              placeholder="Acceptance criteria"
              value={newStory.acceptanceCriteria}
              onChange={(e) => setNewStory({ ...newStory, acceptanceCriteria: e.target.value })}
              rows={4}
            />
            <Select value={newStory.priority} onValueChange={(value: 'low' | 'medium' | 'high') => setNewStory({ ...newStory, priority: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button onClick={handleAddStory} disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create Story'}
              </Button>
              <Button variant="outline" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {isLoading && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Loading user stories from database...</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && stories.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No User Stories Found</h3>
            <p className="text-muted-foreground mb-4">
              Create your first user story manually or sync from your external integrations like Jira or Azure DevOps.
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="gradient" onClick={() => setShowAddForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Story
              </Button>
              <Button variant="outline" onClick={() => onViewChange('integrations')}>
                <Settings className="mr-2 h-4 w-4" />
                Setup Integrations
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Filtered Results */}
      {!isLoading && stories.length > 0 && filteredStories.length === 0 && (
        <Card className="shadow-card">
          <CardContent className="py-8 text-center">
            <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Stories Match Your Filters</h3>
            <p className="text-muted-foreground mb-4">
              Try adjusting your search terms or filters to see more results.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stories Table */}
      {!isLoading && filteredStories.length > 0 && (
        <Card className="shadow-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Test Cases</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStories.map((story) => (
                  <TableRow key={story.id}>
                    <TableCell className="font-medium max-w-48">
                      <div className="truncate" title={story.title}>
                        {story.title}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <div className="truncate text-muted-foreground" title={story.description}>
                        {story.description}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="flex items-center gap-1 w-fit">
                        {getSourceIcon(story.source)}
                        {story.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getPriorityColor(story.priority)}>
                        {story.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{story.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {story.testCasesGenerated > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {story.testCasesGenerated} cases
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {story.testCasesGenerated === 0 ? (
                          <Button 
                            variant="gradient" 
                            size="sm"
                            onClick={() => generateTestCases(story.id)}
                          >
                            <Sparkles className="mr-1 h-3 w-3" />
                            Generate
                          </Button>
                        ) : (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleRegenerateClick(story.id)}
                            >
                              <Sparkles className="mr-1 h-3 w-3" />
                              Regenerate
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => onViewChange('test-cases')}
                            >
                              <Bot className="mr-1 h-3 w-3" />
                              View
                            </Button>
                          </>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete User Story</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{story.title}"? This will also delete all associated test cases. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteUserStory(story.id, story.title)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Custom Prompt Dialog for Regeneration */}
      <Dialog open={showCustomPromptDialog} onOpenChange={setShowCustomPromptDialog}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Customize Test Case Generation</DialogTitle>
            <DialogDescription>
              Add specific instructions for generating test cases. Leave empty for default generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">Custom Instructions (Optional)</Label>
              <Textarea
                id="custom-prompt"
                placeholder="e.g., Focus on security testing, Include edge cases for invalid inputs, Generate tests for mobile responsiveness..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomPromptDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomRegenerate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Test Cases
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};