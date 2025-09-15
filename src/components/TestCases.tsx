import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  TestTube, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search,
  Download,
  Upload,
  Code2,
  ChevronDown,
  ChevronUp,
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
import * as XLSX from 'xlsx';

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

interface TestCasesProps {
  projectId: string;
}

export const TestCases = ({ projectId }: TestCasesProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load test cases from database
  const loadTestCases = async () => {
    if (!session?.user?.id) return;

    setIsLoading(true);
    try {
      // Get projects for the current user
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', session.user.id);

      if (projectsError) throw projectsError;

      if (!projects || projects.length === 0) {
        setTestCases([]);
        return;
      }

      // Get test cases from user's projects with user story information
      const { data: dbTestCases, error: testCasesError } = await supabase
        .from('test_cases')
        .select(`
          *,
          user_stories!inner(title, project_id),
          projects!inner(created_by)
        `)
        .in('project_id', projects.map(p => p.id))
        .order('created_at', { ascending: false });

      if (testCasesError) throw testCasesError;

      // Transform database results to match TestCase interface
      const transformedTestCases: TestCase[] = (dbTestCases || []).map(tc => ({
        id: tc.id,
        title: tc.title,
        description: tc.description || '',
        steps: tc.steps ? tc.steps.split('\n').filter(step => step.trim()) : [],
        expectedResult: tc.expected_result || '',
        priority: tc.priority as 'low' | 'medium' | 'high',
        status: tc.status as 'not-run' | 'passed' | 'failed' | 'blocked',
        userStoryId: tc.user_story_id || '',
        userStoryTitle: tc.user_stories?.title || 'Unknown Story',
        estimatedTime: '5-10 min' // Default estimation
      }));

      setTestCases(transformedTestCases);
    } catch (error) {
      console.error('Error loading test cases:', error);
      toast({
        title: "Error",
        description: "Failed to load test cases from database",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load test cases on component mount and when session changes
  useEffect(() => {
    if (session?.user?.id) {
      loadTestCases();
    }
  }, [session?.user?.id]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'blocked': return <Clock className="h-4 w-4 text-warning" />;
      default: return <TestTube className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'bg-success text-success-foreground';
      case 'failed': return 'bg-destructive text-destructive-foreground';
      case 'blocked': return 'bg-warning text-warning-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': return 'bg-warning text-warning-foreground';
      case 'low': return 'bg-success text-success-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const filteredTestCases = testCases.filter(testCase => {
    const matchesSearch = testCase.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         testCase.userStoryTitle.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Group test cases by user story
  const groupedTestCases = filteredTestCases.reduce((acc, testCase) => {
    const storyId = testCase.userStoryId;
    if (!acc[storyId]) {
      acc[storyId] = {
        storyTitle: testCase.userStoryTitle,
        testCases: []
      };
    }
    acc[storyId].testCases.push(testCase);
    return acc;
  }, {} as Record<string, { storyTitle: string; testCases: TestCase[] }>);

  const toggleStoryExpansion = (storyId: string) => {
    setExpandedStories(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(storyId)) {
        newExpanded.delete(storyId);
      } else {
        newExpanded.add(storyId);
      }
      return newExpanded;
    });
  };


  const exportTests = () => {
    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const excelData = testCases.map(tc => ({
      'Test Case ID': tc.id,
      'Title': tc.title,
      'Description': tc.description,
      'Steps': tc.steps.join('\n'),
      'Expected Result': tc.expectedResult,
      'Priority': tc.priority,
      'Status': tc.status,
      'User Story': tc.userStoryTitle,
      'Estimated Time': tc.estimatedTime
    }));
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    
    // Generate Excel file and download
    XLSX.writeFile(wb, 'test-cases.xlsx');

    toast({
      title: "Export Complete",
      description: "Test cases exported to Excel format successfully",
    });
  };

  const exportTestsByStory = (storyId: string, storyTitle: string) => {
    const storyTestCases = groupedTestCases[storyId]?.testCases || [];
    
    // Create Excel workbook
    const wb = XLSX.utils.book_new();
    
    // Prepare data for Excel
    const excelData = storyTestCases.map(tc => ({
      'Test Case ID': tc.id,
      'Title': tc.title,
      'Description': tc.description,
      'Steps': tc.steps.join('\n'),
      'Expected Result': tc.expectedResult,
      'Priority': tc.priority,
      'Status': tc.status,
      'Estimated Time': tc.estimatedTime
    }));
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(excelData);
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    
    // Generate Excel file and download
    const filename = `test-cases-${storyTitle.replace(/[^a-zA-Z0-9]/g, '-')}.xlsx`;
    XLSX.writeFile(wb, filename);

    toast({
      title: "Export Complete",
      description: `Test cases for "${storyTitle}" exported to Excel successfully`,
    });
  };

  const generateSeleniumAutomation = async (testCase: TestCase) => {
    try {
      toast({
        title: "Generating Automation",
        description: `Creating Selenium Java code for: ${testCase.title}`,
      });

      // Transform steps to match expected format
      const transformedTestCase = {
        ...testCase,
        steps: testCase.steps.map(step => ({ type: 'action', content: step }))
      };

      const { data, error } = await supabase.functions.invoke('generate-selenium-automation', {
        body: { testCase: transformedTestCase }
      });

      if (error) throw error;

      if (data.success) {
        // Create and download the Java file
        const blob = new Blob([data.seleniumCode], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.className}.java`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast({
          title: "Automation Generated",
          description: `Selenium Java test file ${data.className}.java has been downloaded`,
        });
      }
    } catch (error) {
      console.error('Error generating automation:', error);
      toast({
        title: "Generation Failed",
        description: "Failed to generate Selenium automation code",
        variant: "destructive",
      });
    }
  };

  const deleteTestCase = async (testCaseId: string, testCaseTitle: string) => {
    try {
      const { error } = await supabase
        .from('test_cases')
        .delete()
        .eq('id', testCaseId);

      if (error) throw error;

      // Remove from local state
      setTestCases(prev => prev.filter(tc => tc.id !== testCaseId));

      toast({
        title: "Test Case Deleted",
        description: `"${testCaseTitle}" has been deleted successfully`,
      });
    } catch (error) {
      console.error('Error deleting test case:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete test case",
        variant: "destructive",
      });
    }
  };

  const importFromExcel = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/)) {
      toast({
        title: "Invalid File",
        description: "Please select an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        toast({
          title: "Empty File",
          description: "The Excel file appears to be empty",
          variant: "destructive",
        });
        return;
      }

      // Validate and transform Excel data to test cases
      const validTestCases = [];
      const errors = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i] as any;
        const rowNum = i + 2; // Excel row number (header is row 1)

        // Required fields validation
        if (!row.title && !row.Title && !row.TITLE) {
          errors.push(`Row ${rowNum}: Title is required`);
          continue;
        }

        if (!row.user_story_title && !row['User Story Title'] && !row['USER STORY TITLE']) {
          errors.push(`Row ${rowNum}: User Story Title is required`);
          continue;
        }

        // Get user story ID by title
        const userStoryTitle = row.user_story_title || row['User Story Title'] || row['USER STORY TITLE'];
        
        // For now, we'll need to find or create user stories - this is a simplified approach
        // In a real scenario, you might want to handle this more robustly
        
        const testCase = {
          title: row.title || row.Title || row.TITLE,
          description: row.description || row.Description || row.DESCRIPTION || '',
          steps: (row.steps || row.Steps || row.STEPS || '').toString().split('\n').filter((s: string) => s.trim()),
          expectedResult: row.expected_result || row['Expected Result'] || row['EXPECTED RESULT'] || '',
          priority: (row.priority || row.Priority || row.PRIORITY || 'medium').toLowerCase(),
          userStoryTitle: userStoryTitle,
          project_id: projectId
        };

        // Validate priority
        if (!['low', 'medium', 'high'].includes(testCase.priority)) {
          testCase.priority = 'medium';
        }

        validTestCases.push(testCase);
      }

      if (errors.length > 0) {
        toast({
          title: "Import Errors",
          description: `${errors.length} rows had errors. First error: ${errors[0]}`,
          variant: "destructive",
        });
        return;
      }

      if (validTestCases.length === 0) {
        toast({
          title: "No Valid Data",
          description: "No valid test cases found in the Excel file",
          variant: "destructive",
        });
        return;
      }

      // Get user stories to match titles with IDs
      const { data: userStories, error: storiesError } = await supabase
        .from('user_stories')
        .select('id, title')
        .eq('project_id', projectId);

      if (storiesError) throw storiesError;

      // Process and insert test cases
      const testCasesToInsert = [];
      const missingStories = new Set();

      for (const testCase of validTestCases) {
        const matchingStory = userStories?.find(story => 
          story.title.toLowerCase() === testCase.userStoryTitle.toLowerCase()
        );

        if (matchingStory) {
          testCasesToInsert.push({
            title: testCase.title,
            description: testCase.description,
            steps: testCase.steps.join('\n'),
            expected_result: testCase.expectedResult,
            priority: testCase.priority,
            status: 'not-run',
            project_id: projectId,
            user_story_id: matchingStory.id
          });
        } else {
          missingStories.add(testCase.userStoryTitle);
        }
      }

      if (missingStories.size > 0) {
        toast({
          title: "Missing User Stories",
          description: `Some user stories were not found: ${Array.from(missingStories).join(', ')}. Please create them first.`,
          variant: "destructive",
        });
      }

      if (testCasesToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('test_cases')
          .insert(testCasesToInsert);

        if (insertError) throw insertError;

        toast({
          title: "Import Successful",
          description: `Successfully imported ${testCasesToInsert.length} test cases from Excel`,
        });

        // Refresh the test cases list
        await loadTestCases();
      }

    } catch (error) {
      console.error('Error importing Excel file:', error);
      toast({
        title: "Import Failed",
        description: "Failed to import test cases from Excel file",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const downloadTemplate = () => {
    // Create Excel workbook for template
    const wb = XLSX.utils.book_new();
    
    // Template data with sample rows and instructions
    const templateData = [
      {
        'title': 'User Login Test',
        'description': 'Test user login functionality with valid credentials',
        'steps': 'Navigate to login page\nEnter valid username\nEnter valid password\nClick login button',
        'expected_result': 'User should be successfully logged in and redirected to dashboard',
        'priority': 'high',
        'user_story_title': 'User Authentication'
      },
      {
        'title': 'Password Reset Test', 
        'description': 'Test password reset functionality',
        'steps': 'Click forgot password\nEnter email address\nClick reset button\nCheck email for reset link',
        'expected_result': 'Password reset email should be sent successfully',
        'priority': 'medium',
        'user_story_title': 'User Authentication'
      }
    ];
    
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Add instructions sheet
    const instructionsData = [
      { Field: 'title', Description: 'Test case title (Required)', Example: 'User Login Test' },
      { Field: 'description', Description: 'Test case description (Optional)', Example: 'Test user login functionality' },
      { Field: 'steps', Description: 'Test steps separated by new lines (Optional)', Example: 'Step 1\\nStep 2\\nStep 3' },
      { Field: 'expected_result', Description: 'Expected test result (Optional)', Example: 'User should be logged in' },
      { Field: 'priority', Description: 'Priority: low, medium, or high (Optional, defaults to medium)', Example: 'high' },
      { Field: 'user_story_title', Description: 'User story title that exists in your project (Required)', Example: 'User Authentication' }
    ];
    
    const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
    
    // Add worksheets to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases Template');
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
    
    // Download template
    XLSX.writeFile(wb, 'test-cases-import-template.xlsx');
    
    toast({
      title: "Template Downloaded",
      description: "Excel template for importing test cases has been downloaded",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Test Cases</h2>
          <p className="text-muted-foreground">
            AI-generated test cases from user stories {isLoading && '(Loading...)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate} disabled={isLoading}>
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
          <Button variant="outline" onClick={importFromExcel} disabled={isLoading}>
            <Upload className="mr-2 h-4 w-4" />
            Import Excel
          </Button>
          <Button variant="outline" onClick={exportTests} disabled={isLoading}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Search */}
      <Card className="shadow-card">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search test cases..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Test Cases Grouped by User Story */}
      <div className="space-y-6">
        {Object.entries(groupedTestCases).map(([storyId, storyData]) => {
          const isExpanded = expandedStories.has(storyId);
          const storyTestCases = storyData.testCases;
          
          return (
            <div key={storyId} className="space-y-4">
              {/* User Story Header */}
              <Card className="shadow-card">
                <CardHeader 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => toggleStoryExpansion(storyId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-xl">{storyData.storyTitle}</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {storyTestCases.length} test case{storyTestCases.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          exportTestsByStory(storyId, storyData.storyTitle);
                        }}
                      >
                        <Download className="mr-2 h-3 w-3" />
                        Export Story
                      </Button>
                      <div className="flex gap-1">
                        {['passed', 'failed', 'not-run', 'blocked'].map(status => {
                          const count = storyTestCases.filter(tc => tc.status === status).length;
                          if (count === 0) return null;
                          return (
                            <Badge key={status} className={getStatusColor(status)} variant="secondary">
                              {count}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              {/* Test Cases for this story */}
              {isExpanded && (
                <div className="space-y-3 ml-8">
                  {storyTestCases.map((testCase) => (
                    <Card key={testCase.id} className="shadow-card hover:shadow-elegant transition-all duration-200">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <CardTitle className="text-lg">{testCase.title}</CardTitle>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>Est. {testCase.estimatedTime}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Badge className={getPriorityColor(testCase.priority)}>
                              {testCase.priority}
                            </Badge>
                            <Badge className={getStatusColor(testCase.status)}>
                              <span className="flex items-center gap-1">
                                {getStatusIcon(testCase.status)}
                                {testCase.status.replace('-', ' ')}
                              </span>
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">{testCase.description}</p>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">Test Steps:</h4>
                            <ol className="text-xs space-y-1">
                              {testCase.steps.map((step, index) => (
                                <li key={index} className="flex gap-2">
                                  <span className="font-mono text-muted-foreground">{index + 1}.</span>
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium mb-2">Expected Result:</h4>
                            <p className="text-xs text-muted-foreground bg-gradient-hero p-3 rounded">
                              {testCase.expectedResult}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t">
                          <div className="text-xs text-muted-foreground">
                            Test ID: {testCase.id}
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => generateSeleniumAutomation(testCase)}
                            >
                              <Code2 className="mr-2 h-3 w-3" />
                              Generate Automation
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-3 w-3" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Test Case</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{testCase.title}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteTestCase(testCase.id, testCase.title)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(groupedTestCases).length === 0 && (
          <Card className="shadow-card">
            <CardContent className="text-center py-12">
              <TestTube className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Test Cases Found</h3>
              <p className="text-muted-foreground">
                Generate test cases from user stories to see them here.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Hidden file input for Excel import */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </div>
  );
};