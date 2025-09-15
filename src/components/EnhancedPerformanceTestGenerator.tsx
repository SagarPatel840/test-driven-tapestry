import { useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, Download, Zap, FileText, Settings, BarChart3, CheckCircle, AlertTriangle, TestTube, Brain } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as yaml from "js-yaml";

interface CommonLoadConfig {
  testPlanName: string;
  threadCount: number;
  rampUpTime: number;
  duration: number;
  loopCount: number;
  addAssertions: boolean;
  addCorrelation: boolean;
  addCsvConfig: boolean;
}

interface SwaggerConfig {
  baseUrl: string;
  groupBy: 'tag' | 'path';
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

export const EnhancedPerformanceTestGenerator = () => {
  // Common state
  const [activeTab, setActiveTab] = useState("swagger");
  const { toast } = useToast();

  // Common load testing configuration
  const [loadConfig, setLoadConfig] = useState<CommonLoadConfig>({
    testPlanName: "Performance Test Plan",
    threadCount: 10,
    rampUpTime: 60,
    duration: 300,
    loopCount: 1,
    addAssertions: true,
    addCorrelation: false,
    addCsvConfig: false
  });

  // Swagger to JMX state
  const [swaggerContent, setSwaggerContent] = useState("");
  const [swaggerJmeterXml, setSwaggerJmeterXml] = useState("");
  const [isSwaggerProcessing, setIsSwaggerProcessing] = useState(false);
  const [swaggerConfig, setSwaggerConfig] = useState<SwaggerConfig>({
    baseUrl: "",
    groupBy: 'tag'
  });
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const [aiAnalysis, setAiAnalysis] = useState<Analysis | null>(null);

  // HAR to JMX state
  const [harFile, setHarFile] = useState<File | null>(null);
  const [harContent, setHarContent] = useState("");
  const [isHarProcessing, setIsHarProcessing] = useState(false);
  const [harProgress, setHarProgress] = useState(0);
  const [harResult, setHarResult] = useState<ProcessingResult | null>(null);

  // Swagger to JMX Functions
  const handleSwaggerFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      
      // Try to parse and extract base URL
      try {
        const spec = content.trim().startsWith('{') 
          ? JSON.parse(content) 
          : yaml.load(content) as any;
        
        if (spec.servers?.[0]?.url) {
          setSwaggerConfig(prev => ({ ...prev, baseUrl: spec.servers[0].url }));
        } else if (spec.host) {
          const scheme = spec.schemes?.[0] || 'https';
          setSwaggerConfig(prev => ({ ...prev, baseUrl: `${scheme}://${spec.host}${spec.basePath || ''}` }));
        }
      } catch {
        // Parsing failed, continue with manual base URL entry
      }
      
      toast({
        title: "Swagger file uploaded successfully",
        description: "OpenAPI/Swagger specification loaded"
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Please ensure the file is a valid Swagger/OpenAPI specification",
        variant: "destructive"
      });
    }
  };

  const generateSwaggerJMeterXml = (spec: any, swaggerConfig: SwaggerConfig, loadConfig: CommonLoadConfig): string => {
    const parseBaseUrl = (url: string) => {
      try {
        const urlObj = new URL(url);
        return {
          protocol: urlObj.protocol.replace(':', ''),
          host: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'),
          path: urlObj.pathname
        };
      } catch {
        return { protocol: 'https', host: 'api.example.com', port: '443', path: '' };
      }
    };

    const baseUrlInfo = parseBaseUrl(swaggerConfig.baseUrl || spec.servers?.[0]?.url || 'https://api.example.com');
    
    const generateAuthManager = () => {
      if (!spec.components?.securitySchemes && !spec.securityDefinitions) return '';
      
      const schemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
      let authConfig = '';
      
      Object.entries(schemes).forEach(([name, scheme]: [string, any]) => {
        if (scheme.type === 'apiKey') {
          authConfig += `
            <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="API Key Headers" enabled="true">
              <collectionProp name="HeaderManager.headers">
                <elementProp name="" elementType="Header">
                  <stringProp name="Header.name">${scheme.name}</stringProp>
                  <stringProp name="Header.value">\${API_KEY}</stringProp>
                </elementProp>
              </collectionProp>
            </HeaderManager>
            <hashTree/>`;
        } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
          authConfig += `
            <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Bearer Token Headers" enabled="true">
              <collectionProp name="HeaderManager.headers">
                <elementProp name="" elementType="Header">
                  <stringProp name="Header.name">Authorization</stringProp>
                  <stringProp name="Header.value">Bearer \${TOKEN}</stringProp>
                </elementProp>
              </collectionProp>
            </HeaderManager>
            <hashTree/>`;
        }
      });
      
      return authConfig;
    };

    const generateAssertion = () => {
      if (!loadConfig.addAssertions) return '';
      return `
        <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Response Assertion" enabled="true">
          <collectionProp name="Asserion.test_strings">
            <stringProp name="49586">200</stringProp>
            <stringProp name="49587">201</stringProp>
            <stringProp name="49588">202</stringProp>
            <stringProp name="49589">204</stringProp>
          </collectionProp>
          <stringProp name="Assertion.custom_message">Expected successful HTTP status code</stringProp>
          <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
          <boolProp name="Assertion.assume_success">false</boolProp>
          <intProp name="Assertion.test_type">33</intProp>
        </ResponseAssertion>
        <hashTree/>`;
    };

    const generateJsonExtractor = () => {
      if (!loadConfig.addCorrelation) return '';
      return `
        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="JSON Extractor" enabled="true">
          <stringProp name="JSONPostProcessor.referenceNames">extracted_id</stringProp>
          <stringProp name="JSONPostProcessor.jsonPathExprs">$..id</stringProp>
          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
          <stringProp name="JSONPostProcessor.defaultValues">default_id</stringProp>
        </JSONPostProcessor>
        <hashTree/>`;
    };

    const generateCsvConfig = () => {
      if (!loadConfig.addCsvConfig) return '';
      return `
        <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="CSV Data Set Config" enabled="true">
          <stringProp name="delimiter">,</stringProp>
          <stringProp name="fileEncoding">UTF-8</stringProp>
          <stringProp name="filename">test_data.csv</stringProp>
          <boolProp name="ignoreFirstLine">true</boolProp>
          <boolProp name="quotedData">false</boolProp>
          <boolProp name="recycle">true</boolProp>
          <stringProp name="shareMode">shareMode.all</stringProp>
          <boolProp name="stopThread">false</boolProp>
          <stringProp name="variableNames">test_variable</stringProp>
        </CSVDataSet>
        <hashTree/>`;
    };

    const generateSampleData = (schema: any): string => {
      if (!schema || !schema.properties) return '{}';
      
      const sampleData: any = {};
      Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
        switch (prop.type) {
          case 'string':
            sampleData[key] = prop.example || `sample_${key}`;
            break;
          case 'integer':
          case 'number':
            sampleData[key] = prop.example || 123;
            break;
          case 'boolean':
            sampleData[key] = prop.example !== undefined ? prop.example : true;
            break;
          case 'array':
            sampleData[key] = [prop.items?.example || 'sample_item'];
            break;
          default:
            sampleData[key] = prop.example || `sample_${key}`;
        }
      });
      
      return JSON.stringify(sampleData, null, 2);
    };

    const generateHttpSampler = (path: string, method: string, operation: any) => {
      const requestBody = operation.requestBody?.content?.['application/json']?.schema 
        ? generateSampleData(operation.requestBody.content['application/json'].schema)
        : '';

      const hasBody = ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && requestBody;

      return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${method.toUpperCase()} ${path}" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" enabled="true">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">\${HOST}</stringProp>
          <stringProp name="HTTPSampler.port">\${PORT}</stringProp>
          <stringProp name="HTTPSampler.protocol">\${PROTOCOL}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path">${path}</stringProp>
          <stringProp name="HTTPSampler.method">${method.toUpperCase()}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout"></stringProp>
          <stringProp name="HTTPSampler.response_timeout"></stringProp>
          ${hasBody ? `<boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${requestBody.replace(/"/g, '&quot;')}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>` : ''}
        </HTTPSamplerProxy>
        <hashTree>
          ${loadConfig.addAssertions ? generateAssertion() : ''}
          ${loadConfig.addCorrelation ? generateJsonExtractor() : ''}
        </hashTree>`;
    };

    const groupOperations = () => {
      const groups: { [key: string]: Array<{path: string, method: string, operation: any}> } = {};
      
      Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
        Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const groupKey = swaggerConfig.groupBy === 'tag' 
              ? (operation.tags?.[0] || 'Default')
              : path.split('/')[1] || 'root';
            
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push({ path, method, operation });
          }
        });
      });
      
      return groups;
    };

    const groups = groupOperations();
    
    let threadGroups = '';
    Object.entries(groups).forEach(([groupName, operations]) => {
      const samplers = operations.map(({ path, method, operation }) => 
        generateHttpSampler(path, method, operation)
      ).join('\n');

      threadGroups += `
        <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${groupName} Tests" enabled="true">
          <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
          <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
            <boolProp name="LoopController.continue_forever">false</boolProp>
            <stringProp name="LoopController.loops">${loadConfig.loopCount}</stringProp>
          </elementProp>
          <stringProp name="ThreadGroup.num_threads">${loadConfig.threadCount}</stringProp>
          <stringProp name="ThreadGroup.ramp_time">${loadConfig.rampUpTime}</stringProp>
          <boolProp name="ThreadGroup.scheduler">false</boolProp>
          <stringProp name="ThreadGroup.duration"></stringProp>
          <stringProp name="ThreadGroup.delay"></stringProp>
          <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
        </ThreadGroup>
        <hashTree>
          ${loadConfig.addCsvConfig ? generateCsvConfig() : ''}
          ${generateAuthManager()}
          ${samplers}
        </hashTree>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${loadConfig.testPlanName}" enabled="true">
      <stringProp name="TestPlan.comments">Generated from OpenAPI/Swagger specification</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="PROTOCOL" elementType="Argument">
            <stringProp name="Argument.name">PROTOCOL</stringProp>
            <stringProp name="Argument.value">${baseUrlInfo.protocol}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="HOST" elementType="Argument">
            <stringProp name="Argument.name">HOST</stringProp>
            <stringProp name="Argument.value">${baseUrlInfo.host}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="PORT" elementType="Argument">
            <stringProp name="Argument.name">PORT</stringProp>
            <stringProp name="Argument.value">${baseUrlInfo.port}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      ${threadGroups}
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
  };

  const handleSwaggerGenerate = async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Input",
        description: "Please provide a Swagger/OpenAPI specification",
        variant: "destructive"
      });
      return;
    }

    setIsSwaggerProcessing(true);

    try {
      const spec = swaggerContent.trim().startsWith('{') 
        ? JSON.parse(swaggerContent) 
        : yaml.load(swaggerContent) as any;
      
      if (!spec.paths || Object.keys(spec.paths).length === 0) {
        throw new Error("No API paths found in the specification");
      }

      // Use AI-powered JMeter generation
      const { data, error } = await supabase.functions.invoke('ai-jmeter-generator', {
        body: { 
          swaggerSpec: spec, 
          loadConfig: { ...loadConfig, baseUrl: swaggerConfig.baseUrl },
          aiProvider 
        }
      });

      if (error) throw error;

      if (data.success) {
        setSwaggerJmeterXml(data.jmeterXml);
        setAiAnalysis(data.analysis);
        
        toast({
          title: "AI-Enhanced JMeter Test Plan Generated",
          description: `Generated intelligent test plan with ${data.metadata?.threadGroups || 1} thread groups using ${data.metadata?.provider}`
        });
      } else {
        throw new Error(data.error || "Failed to generate JMeter test plan");
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate JMeter test plan",
        variant: "destructive"
      });
    } finally {
      setIsSwaggerProcessing(false);
    }
  };

  const handleSwaggerDownload = () => {
    if (!swaggerJmeterXml) return;
    
    const blob = new Blob([swaggerJmeterXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${loadConfig.testPlanName.replace(/\s+/g, '_')}.jmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // HAR to JMX Functions
  const handleHarFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleHarPasteContent = (content: string) => {
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

    setIsHarProcessing(true);
    setHarProgress(0);
    setHarResult(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setHarProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const { data, error } = await supabase.functions.invoke('har-to-jmeter', {
        body: {
          harContent,
          loadConfig: {
            threadCount: loadConfig.threadCount,
            rampUpTime: loadConfig.rampUpTime,
            duration: loadConfig.duration,
            loopCount: loadConfig.loopCount
          },
          testPlanName: loadConfig.testPlanName
        }
      });

      clearInterval(progressInterval);
      setHarProgress(100);

      if (error) throw error;

      setHarResult(data);
      
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
      setIsHarProcessing(false);
    }
  };

  const downloadHarJMX = () => {
    if (!harResult) return;
    
    const blob = new Blob([harResult.jmxContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${loadConfig.testPlanName.replace(/\s+/g, '_')}.jmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <TestTube className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Performance Test Generator</h1>
      </div>
      <p className="text-muted-foreground">
        Generate JMeter performance test plans from Swagger/OpenAPI specifications or HAR files with advanced AI analysis.
      </p>

      {/* Common Load Testing Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Load Testing Configuration
          </CardTitle>
          <CardDescription>
            Configure the common performance test parameters for both Swagger and HAR conversions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="testPlanName">Test Plan Name</Label>
            <Input
              id="testPlanName"
              value={loadConfig.testPlanName}
              onChange={(e) => setLoadConfig(prev => ({ ...prev, testPlanName: e.target.value }))}
              placeholder="Enter test plan name"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="threadCount">Thread Count</Label>
              <Input
                id="threadCount"
                type="number"
                value={loadConfig.threadCount}
                onChange={(e) => setLoadConfig(prev => ({ ...prev, threadCount: parseInt(e.target.value) || 1 }))}
                min="1"
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
              <Label htmlFor="duration">Duration (s)</Label>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="assertions">Add Response Assertions</Label>
              <Switch
                id="assertions"
                checked={loadConfig.addAssertions}
                onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, addAssertions: checked }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="correlation">Add JSON Extractors</Label>
              <Switch
                id="correlation"
                checked={loadConfig.addCorrelation}
                onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, addCorrelation: checked }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="csvConfig">Add CSV Data Set</Label>
              <Switch
                id="csvConfig"
                checked={loadConfig.addCsvConfig}
                onCheckedChange={(checked) => setLoadConfig(prev => ({ ...prev, addCsvConfig: checked }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="swagger">Swagger to JMX</TabsTrigger>
          <TabsTrigger value="har">HAR to JMX</TabsTrigger>
        </TabsList>

        <TabsContent value="swagger" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Swagger Configuration Panel */}
            <Card>
              <CardHeader>
                <CardTitle>Swagger/OpenAPI Input</CardTitle>
                <CardDescription>Upload or paste your API specification</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="swaggerFile">Upload Swagger/OpenAPI File</Label>
                  <Input
                    id="swaggerFile"
                    type="file"
                    accept=".json,.yaml,.yml"
                    onChange={handleSwaggerFileUpload}
                    className="cursor-pointer"
                  />
                </div>

                <div className="text-center text-muted-foreground">— OR —</div>

                <div>
                  <Label htmlFor="swaggerContent">Paste Swagger JSON/YAML</Label>
                  <Textarea
                    id="swaggerContent"
                    placeholder="Paste your Swagger/OpenAPI specification here..."
                    value={swaggerContent}
                    onChange={(e) => {
                      const content = e.target.value;
                      setSwaggerContent(content);
                      
                      // Auto-extract base URL when content is pasted
                      if (content.trim()) {
                        try {
                          const spec = content.trim().startsWith('{') 
                            ? JSON.parse(content) 
                            : yaml.load(content) as any;
                          
                          if (spec.servers?.[0]?.url && !swaggerConfig.baseUrl) {
                            setSwaggerConfig(prev => ({ ...prev, baseUrl: spec.servers[0].url }));
                          } else if (spec.host && !swaggerConfig.baseUrl) {
                            const scheme = spec.schemes?.[0] || 'https';
                            setSwaggerConfig(prev => ({ ...prev, baseUrl: `${scheme}://${spec.host}${spec.basePath || ''}` }));
                          }
                        } catch {
                          // Parsing failed, continue with manual base URL entry
                        }
                      }
                    }}
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="baseUrl">Base URL (Optional)</Label>
                  <Input
                    id="baseUrl"
                    value={swaggerConfig.baseUrl}
                    onChange={(e) => setSwaggerConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                    placeholder="https://api.example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="groupBy">Group Requests By</Label>
                  <Select 
                    value={swaggerConfig.groupBy} 
                    onValueChange={(value: 'tag' | 'path') => setSwaggerConfig(prev => ({ ...prev, groupBy: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tag">Tag</SelectItem>
                      <SelectItem value="path">Path</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  onClick={handleSwaggerGenerate} 
                  disabled={!swaggerContent.trim() || isSwaggerProcessing}
                  className="w-full"
                  size="lg"
                >
                  {isSwaggerProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Generate JMeter Test Plan
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Swagger Results Panel */}
            <div className="space-y-6">
              {swaggerJmeterXml && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      JMeter Test Plan Generated
                    </CardTitle>
                    <CardDescription>
                      Your performance test plan is ready for download
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button onClick={handleSwaggerDownload} className="w-full" size="lg">
                      <Download className="h-4 w-4 mr-2" />
                      Download JMX File
                    </Button>
                    
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        JMeter test plan successfully generated with your configured settings.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              )}

              {!swaggerJmeterXml && !isSwaggerProcessing && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                      <div>
                        <h3 className="text-lg font-semibold">Ready to Generate</h3>
                        <p className="text-muted-foreground">
                          Upload your Swagger/OpenAPI specification to get started.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="har" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* HAR Input Section */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    HAR File Input
                  </CardTitle>
                  <CardDescription>
                    Upload a HAR file captured from browser developer tools
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="harFile">Upload HAR File</Label>
                    <Input
                      id="harFile"
                      type="file"
                      accept=".har"
                      onChange={handleHarFileUpload}
                      className="cursor-pointer"
                    />
                    {harFile && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Selected: {harFile.name}
                      </p>
                    )}
                  </div>

                  <div className="text-center text-muted-foreground">— OR —</div>

                  <div>
                    <Label htmlFor="harContent">Paste HAR JSON Content</Label>
                    <Textarea
                      id="harContent"
                      placeholder="Paste your HAR file JSON content here..."
                      value={harContent}
                      onChange={(e) => handleHarPasteContent(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Generate JMeter Script
                  </CardTitle>
                  <CardDescription>
                    Process your HAR file with AI analysis
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button 
                    onClick={processHarFile} 
                    disabled={!harContent || isHarProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isHarProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Processing with AI...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Generate JMeter Script
                      </>
                    )}
                  </Button>

                  {isHarProcessing && (
                    <div className="space-y-2">
                      <Progress value={harProgress} className="w-full" />
                      <p className="text-sm text-muted-foreground text-center">
                        {harProgress < 30 ? "Analyzing HAR file..." :
                         harProgress < 60 ? "Running AI analysis..." :
                         harProgress < 90 ? "Generating JMeter XML..." :
                         "Finalizing..."}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* HAR Results Section */}
            <div className="space-y-6">
              {harResult && (
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
                          <div className="text-2xl font-bold text-primary">{harResult.summary.totalRequests}</div>
                          <div className="text-sm text-muted-foreground">HTTP Requests</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold text-primary">{harResult.summary.uniqueDomains.length}</div>
                          <div className="text-sm text-muted-foreground">Unique Domains</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>HTTP Methods Used:</Label>
                        <div className="flex flex-wrap gap-2">
                          {harResult.summary.methodsUsed.map(method => (
                            <Badge key={method} variant="outline">{method}</Badge>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Domains:</Label>
                        <div className="flex flex-wrap gap-2">
                          {harResult.summary.uniqueDomains.map(domain => (
                            <Badge key={domain} variant="secondary">{domain}</Badge>
                          ))}
                        </div>
                      </div>

                      <Button onClick={downloadHarJMX} className="w-full" size="lg">
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
                        Intelligent insights from AI analysis
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
                          {harResult.analysis.scenarios?.map((scenario, index) => (
                            <div key={index} className="p-3 border rounded-lg">
                              <h4 className="font-semibold">{scenario.name}</h4>
                              <p className="text-sm text-muted-foreground">{scenario.description}</p>
                            </div>
                          ))}
                        </TabsContent>
                        
                        <TabsContent value="correlation" className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            {harResult.analysis.correlationFields?.map((field, index) => (
                              <Badge key={index} variant="outline">{field}</Badge>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            These fields will be automatically extracted and correlated in the JMeter script.
                          </p>
                        </TabsContent>
                        
                        <TabsContent value="groups" className="space-y-3">
                          {harResult.analysis.requestGroups?.map((group, index) => (
                            <div key={index} className="p-3 border rounded-lg">
                              <h4 className="font-semibold">{group.name}</h4>
                              <p className="text-sm text-muted-foreground">Pattern: {group.pattern}</p>
                            </div>
                          ))}
                        </TabsContent>
                        
                        <TabsContent value="assertions" className="space-y-3">
                          {harResult.analysis.assertions?.map((assertion, index) => (
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

              {!harResult && !isHarProcessing && (
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
        </TabsContent>
      </Tabs>
    </div>
  );
};