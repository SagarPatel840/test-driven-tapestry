import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Download, 
  Loader2, 
  BarChart3,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle
} from "lucide-react";

interface TestReportProps {
  projectId: string;
}

interface TestCase {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'blocked' | 'pending';
  priority: 'low' | 'medium' | 'high';
  userStoryTitle?: string;
}

export const TestReport = ({ projectId }: TestReportProps) => {
  const [loading, setLoading] = useState(false);
  const [testReport, setTestReport] = useState<string>("");
  const [statistics, setStatistics] = useState<any>(null);
  const [projectName, setProjectName] = useState("");
  const [reportType, setReportType] = useState("executive");
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const loadTestCases = () => {
      const stored = localStorage.getItem(`testCases_${projectId}`);
      if (stored) {
        const cases = JSON.parse(stored);
        setTestCases(cases);
      }
    };
    loadTestCases();
  }, [projectId]);

  const generateTestReport = async () => {
    if (!projectName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }

    if (testCases.length === 0) {
      toast({
        title: "Error", 
        description: "No test cases found. Please add test cases first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-test-report', {
        body: {
          testCases,
          projectName,
          reportType,
          testExecutionData: {
            startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
          }
        }
      });

      if (error) throw error;

      setTestReport(data.testReport);
      setStatistics(data.statistics);
      toast({
        title: "Success",
        description: "Test report generated successfully!",
      });
    } catch (error) {
      console.error('Error generating test report:', error);
      toast({
        title: "Error",
        description: "Failed to generate test report. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTestReport = () => {
    if (!testReport) return;
    
    const blob = new Blob([testReport], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName || 'project'}-test-report.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'blocked': return <AlertCircle className="h-4 w-4 text-warning" />;
      case 'pending': return <Clock className="h-4 w-4 text-muted-foreground" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-success';
      case 'failed': return 'text-destructive';
      case 'blocked': return 'text-warning';
      case 'pending': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Test Report Generator</h2>
          <p className="text-muted-foreground">
            Generate comprehensive test execution reports
          </p>
        </div>
      </div>

      {/* Test Statistics Overview */}
      {testCases.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-sm font-medium">Total Tests</p>
                  <p className="text-2xl font-bold">{testCases.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <div>
                  <p className="text-sm font-medium">Passed</p>
                  <p className="text-2xl font-bold">{testCases.filter(tc => tc.status === 'passed').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <div>
                  <p className="text-sm font-medium">Failed</p>
                  <p className="text-2xl font-bold">{testCases.filter(tc => tc.status === 'failed').length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-accent" />
                <div>
                  <p className="text-sm font-medium">Pass Rate</p>
                  <p className="text-2xl font-bold">
                    {testCases.length > 0 ? Math.round((testCases.filter(tc => tc.status === 'passed').length / testCases.length) * 100) : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Configuration */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Report Configuration
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
              <Label htmlFor="reportType">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select report type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive">Executive Summary</SelectItem>
                  <SelectItem value="detailed">Detailed Analysis</SelectItem>
                  <SelectItem value="stakeholder">Stakeholder Report</SelectItem>
                  <SelectItem value="technical">Technical Report</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Test Cases Status Overview</Label>
            <div className="flex flex-wrap gap-2">
              {['passed', 'failed', 'blocked', 'pending'].map(status => {
                const count = testCases.filter(tc => tc.status === status).length;
                return (
                  <Badge key={status} variant="outline" className={`text-xs ${getStatusColor(status)}`}>
                    {getStatusIcon(status)}
                    <span className="ml-1">{status}: {count}</span>
                  </Badge>
                );
              })}
            </div>
          </div>

          <Button 
            onClick={generateTestReport} 
            disabled={loading}
            className="w-full md:w-auto"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Test Report
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Generated Test Report */}
      {testReport && (
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex justify-between items-start">
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-success" />
                Generated Test Report
              </CardTitle>
              <Button variant="outline" onClick={downloadTestReport}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {statistics && (
              <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-semibold mb-2">Quick Statistics</h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                  <div>Total: <span className="font-bold">{statistics.totalTests}</span></div>
                  <div>Passed: <span className="font-bold text-success">{statistics.passedTests}</span></div>
                  <div>Failed: <span className="font-bold text-destructive">{statistics.failedTests}</span></div>
                  <div>Blocked: <span className="font-bold text-warning">{statistics.blockedTests}</span></div>
                  <div>Pass Rate: <span className="font-bold">{statistics.passRate}%</span></div>
                </div>
              </div>
            )}
            <div className="bg-muted/50 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono overflow-auto max-h-96">
                {testReport}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};