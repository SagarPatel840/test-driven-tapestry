import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, Zap, FileText, Settings, BarChart3, CheckCircle, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface LoadConfig {
  threadCount: number;
  rampUpTime: number;
  duration: number;
  loopCount: number;
  responseTimeThreshold: number;
  throughputThreshold: number;
  errorRateThreshold: number;
  connectionTimeout: number;
  responseTimeout: number;
  followRedirects: boolean;
  useKeepAlive: boolean;
  enableReporting: boolean;
  addAssertions: boolean;
  addCorrelation: boolean;
  generateCsvConfig: boolean;
}

interface Analysis {
  correlationFields: string[];
  requestGroups: Array<{ name: string; pattern: string }>;
  parameterization: Array<{ field: string; description: string }>;
  scenarios: Array<{ name: string; description: string }>;
  assertions: Array<{ type: string; threshold?: number; value?: string; values?: number[] }>;
}

interface ProcessingResult {
  jmxContent: string;
  analysis: Analysis;
  summary: {
    totalRequests: number;
    uniqueDomains: string[];
    methodsUsed: string[];
    avgResponseTime: number;
  };
}

export const HarToJMeter = () => {
  const [harFile, setHarFile] = useState<File | null>(null);
  const [harContent, setHarContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [testPlanName, setTestPlanName] = useState("HAR Performance Test");
  const [loadConfig, setLoadConfig] = useState<LoadConfig>({
    threadCount: 10,
    rampUpTime: 60,
    duration: 300,
    loopCount: 1,
    responseTimeThreshold: 5000,
    throughputThreshold: 100,
    errorRateThreshold: 5,
    connectionTimeout: 10000,
    responseTimeout: 30000,
    followRedirects: true,
    useKeepAlive: true,
    enableReporting: true,
    addAssertions: true,
    addCorrelation: true,
    generateCsvConfig: false
  });
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.har')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a .har file",
        variant: "destructive"
      });
      return;
    }

    try {
      const content = await file.text();
      const harData = JSON.parse(content);
      
      if (!harData.log || !harData.log.entries) {
        throw new Error("Invalid HAR file format");
      }

      setHarFile(file);
      setHarContent(content);
      
      toast({
        title: "HAR File Loaded",
        description: `Found ${harData.log.entries.length} HTTP requests`
      });
    } catch (error) {
      toast({
        title: "Error Reading File",
        description: "Please ensure the file is a valid HAR file",
        variant: "destructive"
      });
    }
  };

  const handlePasteContent = (content: string) => {
    try {
      const harData = JSON.parse(content);
      
      if (!harData.log || !harData.log.entries) {
        throw new Error("Invalid HAR format");
      }

      setHarContent(content);
      setHarFile(null);
      
      toast({
        title: "HAR Content Loaded",
        description: `Found ${harData.log.entries.length} HTTP requests`
      });
    } catch (error) {
      toast({
        title: "Invalid HAR Content",
        description: "Please paste valid HAR JSON content",
        variant: "destructive"
      });
    }
  };

  const processHarFile = async () => {
    if (!harContent) {
      toast({
        title: "Missing Input",
        description: "Please upload a HAR file or paste HAR content",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setResult(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke('har-to-jmeter', {
        body: {
          harContent,
          loadConfig,
          testPlanName,
          aiProvider
        }
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (error) throw error;

      setResult(data);
      
      toast({
        title: "JMeter Script Generated",
        description: "Your performance test script is ready for download!"
      });
    } catch (error) {
      console.error('Processing error:', error);
      toast({
        title: "Processing Failed",
        description: error instanceof Error ? error.message : "Failed to process HAR file",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadJMX = () => {
    if (!result) return;
    
    const blob = new Blob([result.jmxContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${testPlanName.replace(/\s+/g, '_')}.jmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">HAR to JMeter Converter</h1>
      </div>
      <p className="text-muted-foreground">
        Upload a HAR file and let AI generate an intelligent JMeter performance test script with advanced correlation, parameterization, and assertions.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                HAR File Input
              </CardTitle>
              <CardDescription>
                Upload a HAR file captured from browser developer tools or paste the JSON content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="harFile">Upload HAR File</Label>
                <Input
                  id="harFile"
                  type="file"
                  accept=".har"
                  onChange={handleFileUpload}
                  className="cursor-pointer"
                />
                {harFile && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Selected: {harFile.name}
                  </p>
                )}
              </div>

              <div className="text-center text-muted-foreground">
                — OR —
              </div>

              <div>
                <Label htmlFor="harContent">Paste HAR JSON Content</Label>
                <Textarea
                  id="harContent"
                  placeholder="Paste your HAR file JSON content here..."
                  value={harContent}
                  onChange={(e) => handlePasteContent(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Load Testing Configuration
              </CardTitle>
              <CardDescription>
                Configure the performance test parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="testPlanName">Test Plan Name</Label>
                <Input
                  id="testPlanName"
                  value={testPlanName}
                  onChange={(e) => setTestPlanName(e.target.value)}
                  placeholder="Enter test plan name"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="threadCount">Thread Count (Virtual Users)</Label>
                  <Input
                    id="threadCount"
                    type="number"
                    value={loadConfig.threadCount}
                    onChange={(e) => setLoadConfig(prev => ({ ...prev, threadCount: parseInt(e.target.value) || 1 }))}
                    min="1"
                    max="1000"
                  />
                </div>
                <div>
                  <Label htmlFor="rampUpTime">Ramp-up Time (s)</Label>
                  <Input
                    id="rampUpTime"
                    type="number"
                    value={loadConfig.rampUpTime}
                    onChange={(e) => setLoadConfig(prev => ({ ...prev, rampUpTime: parseInt(e.target.value) || 1 }))}
                    min="1"
                  />
                </div>
                <div>
                  <Label htmlFor="duration">Test Duration (s)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={loadConfig.duration}
                    onChange={(e) => setLoadConfig(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
                    min="1"
                  />
                </div>
                <div>
                  <Label htmlFor="loopCount">Loop Count</Label>
                  <Input
                    id="loopCount"
                    type="number"
                    value={loadConfig.loopCount}
                    onChange={(e) => setLoadConfig(prev => ({ ...prev, loopCount: parseInt(e.target.value) || 1 }))}
                    min="1"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Performance Thresholds</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="responseTimeThreshold">Response Time (ms)</Label>
                    <Input
                      id="responseTimeThreshold"
                      type="number"
                      value={loadConfig.responseTimeThreshold}
                      onChange={(e) => setLoadConfig(prev => ({ ...prev, responseTimeThreshold: parseInt(e.target.value) || 1000 }))}
                      min="100"
                    />
                  </div>
                  <div>
                    <Label htmlFor="throughputThreshold">Throughput (req/sec)</Label>
                    <Input
                      id="throughputThreshold"
                      type="number"
                      value={loadConfig.throughputThreshold}
                      onChange={(e) => setLoadConfig(prev => ({ ...prev, throughputThreshold: parseInt(e.target.value) || 1 }))}
                      min="1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="errorRateThreshold">Error Rate (%)</Label>
                    <Input
                      id="errorRateThreshold"
                      type="number"
                      value={loadConfig.errorRateThreshold}
                      onChange={(e) => setLoadConfig(prev => ({ ...prev, errorRateThreshold: parseInt(e.target.value) || 1 }))}
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Connection Settings</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="connectionTimeout">Connection Timeout (ms)</Label>
                    <Input
                      id="connectionTimeout"
                      type="number"
                      value={loadConfig.connectionTimeout}
                      onChange={(e) => setLoadConfig(prev => ({ ...prev, connectionTimeout: parseInt(e.target.value) || 1000 }))}
                      min="1000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="responseTimeout">Response Timeout (ms)</Label>
                    <Input
                      id="responseTimeout"
                      type="number"
                      value={loadConfig.responseTimeout}
                      onChange={(e) => setLoadConfig(prev => ({ ...prev, responseTimeout: parseInt(e.target.value) || 1000 }))}
                      min="1000"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">JMeter Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="addAssertions"
                      checked={loadConfig.addAssertions}
                      onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, addAssertions: checked }))}
                    />
                    <Label htmlFor="addAssertions">Add Response Assertions</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="addCorrelation"
                      checked={loadConfig.addCorrelation}
                      onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, addCorrelation: checked }))}
                    />
                    <Label htmlFor="addCorrelation">Enable Dynamic Correlation</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="generateCsvConfig"
                      checked={loadConfig.generateCsvConfig}
                      onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, generateCsvConfig: checked }))}
                    />
                    <Label htmlFor="generateCsvConfig">Generate CSV Data Configuration</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="followRedirects"
                      checked={loadConfig.followRedirects}
                      onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, followRedirects: checked }))}
                    />
                    <Label htmlFor="followRedirects">Follow Redirects</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="useKeepAlive"
                      checked={loadConfig.useKeepAlive}
                      onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, useKeepAlive: checked }))}
                    />
                    <Label htmlFor="useKeepAlive">Use Keep-Alive</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enableReporting"
                      checked={loadConfig.enableReporting}
                      onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, enableReporting: checked }))}
                    />
                    <Label htmlFor="enableReporting">Enable Detailed Reporting</Label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="aiProvider">AI Provider</Label>
                <Select value={aiProvider} onValueChange={(value: 'google' | 'openai') => setAiProvider(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">Google AI (Gemini)</SelectItem>
                    <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button 
                onClick={processHarFile} 
                disabled={!harContent || isProcessing}
                className="w-full"
                size="lg"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Processing with AI...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate JMX
                  </>
                )}
              </Button>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progress} className="w-full" />
                  <p className="text-sm text-muted-foreground text-center">
                    {progress < 30 ? "Analyzing HAR file..." :
                     progress < 60 ? "Running AI analysis..." :
                     progress < 90 ? "Generating JMeter XML..." :
                     "Finalizing..."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          {result && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Generation Complete
                  </CardTitle>
                  <CardDescription>
                    Your JMeter performance test script has been generated successfully
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">{result.summary.totalRequests}</div>
                      <div className="text-sm text-muted-foreground">HTTP Requests</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">{result.summary.uniqueDomains.length}</div>
                      <div className="text-sm text-muted-foreground">Unique Domains</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>HTTP Methods Used:</Label>
                    <div className="flex flex-wrap gap-2">
                      {result.summary.methodsUsed.map(method => (
                        <Badge key={method} variant="outline">{method}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Domains:</Label>
                    <div className="flex flex-wrap gap-2">
                      {result.summary.uniqueDomains.map(domain => (
                        <Badge key={domain} variant="secondary">{domain}</Badge>
                      ))}
                    </div>
                  </div>

                  <Button onClick={downloadJMX} className="w-full" size="lg">
                    <Download className="h-4 w-4 mr-2" />
                    Download JMX File
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    AI Analysis Results
                  </CardTitle>
                  <CardDescription>
                    Intelligent insights from OpenAI analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="scenarios" className="w-full">
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
                      <TabsTrigger value="correlation">Correlation</TabsTrigger>
                      <TabsTrigger value="groups">Groups</TabsTrigger>
                      <TabsTrigger value="assertions">Assertions</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="scenarios" className="space-y-3">
                      {result.analysis.scenarios?.map((scenario, index) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <h4 className="font-semibold">{scenario.name}</h4>
                          <p className="text-sm text-muted-foreground">{scenario.description}</p>
                        </div>
                      ))}
                    </TabsContent>
                    
                    <TabsContent value="correlation" className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        {result.analysis.correlationFields?.map((field, index) => (
                          <Badge key={index} variant="outline">{field}</Badge>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        These fields will be automatically extracted and correlated in the JMeter script.
                      </p>
                    </TabsContent>
                    
                    <TabsContent value="groups" className="space-y-3">
                      {result.analysis.requestGroups?.map((group, index) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <h4 className="font-semibold">{group.name}</h4>
                          <p className="text-sm text-muted-foreground">Pattern: {group.pattern}</p>
                        </div>
                      ))}
                    </TabsContent>
                    
                    <TabsContent value="assertions" className="space-y-3">
                      {result.analysis.assertions?.map((assertion, index) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <h4 className="font-semibold capitalize">{assertion.type} Assertion</h4>
                          {assertion.threshold && (
                            <p className="text-sm text-muted-foreground">Threshold: {assertion.threshold}ms</p>
                          )}
                          {assertion.values && (
                            <p className="text-sm text-muted-foreground">Values: {assertion.values.join(', ')}</p>
                          )}
                          {assertion.value && (
                            <p className="text-sm text-muted-foreground">Value: {assertion.value}</p>
                          )}
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          )}

          {!result && !isProcessing && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                  <div>
                    <h3 className="text-lg font-semibold">Ready to Generate</h3>
                    <p className="text-muted-foreground">
                      Upload a HAR file and configure your load test parameters to get started.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Help Section */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>How to capture HAR files:</strong> Open browser Developer Tools (F12) → Network tab → 
          Perform your user actions → Right-click on any request → "Save all as HAR with content"
        </AlertDescription>
      </Alert>
    </div>
  );
};