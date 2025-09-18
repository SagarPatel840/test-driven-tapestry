import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Download, Zap, FileText, BarChart3, CheckCircle, AlertTriangle, TestTube, Brain, Eye, Trash2, FileDown } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as yaml from "js-yaml";

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

interface PerformanceReport {
  id: string;
  report_name: string;
  created_at: string;
  ai_provider: string;
  report_content: string;
  csv_files_metadata: any; // Changed from specific array type to any to handle Json type
}

interface CSVFile {
  name: string;
  content: string;
  size: number;
}

export const EnhancedPerformanceTestGenerator = () => {
  // Main tab state
  const [activeMainTab, setActiveMainTab] = useState("generate-jmx");
  const [activeJmxTab, setActiveJmxTab] = useState("swagger");
  const { toast } = useToast();

  // Swagger to JMX state
  const [swaggerContent, setSwaggerContent] = useState("");
  const [swaggerJmeterXml, setSwaggerJmeterXml] = useState("");
  const [isSwaggerProcessing, setIsSwaggerProcessing] = useState(false);
  const [swaggerProgress, setSwaggerProgress] = useState(0);
  const [swaggerConfig, setSwaggerConfig] = useState<SwaggerConfig>({
    baseUrl: "",
    groupBy: 'tag'
  });
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const [aiAnalysis, setAiAnalysis] = useState<Analysis | null>(null);
  const [swaggerResult, setSwaggerResult] = useState<{ totalEndpoints: number; aiProvider: string } | null>(null);

  // HAR to JMX state
  const [harFile, setHarFile] = useState<File | null>(null);
  const [harContent, setHarContent] = useState("");
  const [isHarProcessing, setIsHarProcessing] = useState(false);
  const [harProgress, setHarProgress] = useState(0);
  const [harResult, setHarResult] = useState<ProcessingResult | null>(null);

  // Generated Reports state
  const [reports, setReports] = useState<PerformanceReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [selectedCSVFiles, setSelectedCSVFiles] = useState<CSVFile[]>([]);
  const [reportName, setReportName] = useState("");
  const [reportAiProvider, setReportAiProvider] = useState<'gemini' | 'azure-openai'>('gemini');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState<PerformanceReport | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);

  // Load a project id for the current user (fallback to most recently created)
  useEffect(() => {
    const loadProject = async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!error && data && data.length > 0) {
        setCurrentProjectId(data[0].id);
      }
    };
    loadProject();
  }, []);

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

  const generateSwaggerJMeterXml = (spec: any, swaggerConfig: SwaggerConfig): string => {
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
          <hashTree/>
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
            <stringProp name="LoopController.loops">1</stringProp>
          </elementProp>
          <stringProp name="ThreadGroup.num_threads">10</stringProp>
          <stringProp name="ThreadGroup.ramp_time">60</stringProp>
          <boolProp name="ThreadGroup.scheduler">false</boolProp>
          <stringProp name="ThreadGroup.duration"></stringProp>
          <stringProp name="ThreadGroup.delay"></stringProp>
          <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
        </ThreadGroup>
        <hashTree>
          ${generateAuthManager()}
          ${samplers}
        </hashTree>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="Performance Test Plan" enabled="true">
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

  const processSwagger = useCallback(async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "No Swagger content",
        description: "Please upload a Swagger/OpenAPI specification file first",
        variant: "destructive"
      });
      return;
    }

    if (!swaggerConfig.baseUrl.trim()) {
      toast({
        title: "Base URL required",
        description: "Please enter the base URL for your API",
        variant: "destructive"
      });
      return;
    }

    setIsSwaggerProcessing(true);
    setSwaggerProgress(0);
    setSwaggerJmeterXml("");
    setAiAnalysis(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setSwaggerProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      console.log('Processing Swagger content with AI...');
      const spec = swaggerContent.trim().startsWith('{') 
        ? JSON.parse(swaggerContent) 
        : yaml.load(swaggerContent) as any;

      console.log('Parsed spec:', spec);
      console.log('Using AI provider:', aiProvider);

      // Prepare load config for the edge function
      const loadConfig = {
        testPlanName: "API Performance Test",
        threadCount: 10,
        rampUpTime: 60,
        duration: 300,
        loopCount: 1,
        addAssertions: true,
        addCorrelation: true,
        addCsvConfig: false,
        baseUrl: swaggerConfig.baseUrl
      };

      // Call the AI-powered JMeter generator edge function
      const { data, error } = await supabase.functions.invoke('ai-jmeter-generator', {
        body: {
          swaggerSpec: spec,
          loadConfig: loadConfig,
          aiProvider: aiProvider
        }
      });

      clearInterval(progressInterval);
      setSwaggerProgress(100);

      if (error) {
        console.error('AI JMeter generation error:', error);
        throw new Error(error.message || 'Failed to generate JMeter test plan with AI');
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Unknown error occurred during AI generation');
      }

      console.log('AI-generated JMX content received:', data.metadata);
      setSwaggerJmeterXml(data.jmeterXml);

      // Calculate total endpoints from the Swagger spec
      const totalEndpoints = Object.keys(spec.paths || {}).reduce((total, path) => {
        const pathMethods = Object.keys(spec.paths[path] || {}).filter(method => 
          ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)
        );
        return total + pathMethods.length;
      }, 0);

      setSwaggerResult({
        totalEndpoints,
        aiProvider: data.metadata?.provider || aiProvider
      });

      toast({
        title: "JMeter test plan generated successfully",
        description: `Generated with ${data.metadata?.provider || aiProvider} AI - ${totalEndpoints} endpoints processed`
      });

    } catch (error: any) {
      console.error('Error processing swagger with AI:', error);
      toast({
        title: "AI processing failed",
        description: error.message || "Failed to generate JMeter test plan with AI",
        variant: "destructive"
      });
    } finally {
      setIsSwaggerProcessing(false);
    }
  }, [swaggerContent, swaggerConfig, aiProvider, toast]);

  const downloadSwaggerJMX = () => {
    if (!swaggerJmeterXml) return;

    const blob = new Blob([swaggerJmeterXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'swagger-test-plan.jmx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // HAR to JMX Functions
  const handleHarFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setHarFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const harData = JSON.parse(content);
        
        if (!harData.log || !harData.log.entries) {
          throw new Error('Invalid HAR file format');
        }
        
        setHarContent(content);
        toast({
          title: "HAR file uploaded successfully",
          description: `Loaded ${harData.log.entries.length} HTTP requests`
        });
      } catch (error) {
        toast({
          title: "Error reading HAR file",
          description: "Please ensure the file is a valid HAR format",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const processHar = useCallback(async () => {
    if (!harContent) {
      toast({
        title: "No HAR file uploaded",
        description: "Please upload a HAR file first",
        variant: "destructive"
      });
      return;
    }

    setIsHarProcessing(true);
    setHarProgress(0);
    setHarResult(null);

    try {
      console.log('Starting HAR processing with AI provider:', aiProvider);
      
      const progressInterval = setInterval(() => {
        setHarProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { data, error } = await supabase.functions.invoke('har-to-jmeter', {
        body: { 
          harContent, 
          aiProvider,
          loadConfig: {
            testPlanName: "HAR Performance Test",
            threadCount: 10,
            rampUpTime: 60,
            duration: 300,
            loopCount: 1,
            addAssertions: true,
            addCorrelation: true,
            addCsvConfig: false
          }
        }
      });

      clearInterval(progressInterval);
      setHarProgress(100);

      if (error) {
        console.error('HAR processing error:', error);
        throw new Error(error.message || 'Failed to process HAR file');
      }

      if (!data) {
        console.error('No data received from HAR processing');
        throw new Error('No data received from HAR processing');
      }

      console.log('HAR processing response received:', {
        hasJmxContent: !!data.jmxContent,
        hasError: !!data.error,
        summary: data.summary
      });

      // Check if there's an error in the response
      if (data.error) {
        throw new Error(data.error || 'HAR processing failed');
      }

      // The HAR function returns data directly (not wrapped in success/data structure)
      if (data.jmxContent) {
        const harResultData = {
          jmxContent: data.jmxContent,
          analysis: {
            correlationFields: [],
            requestGroups: [],
            parameterization: [],
            scenarios: [],
            assertions: []
          },
          summary: data.summary || {
            totalRequests: 0,
            uniqueDomains: [],
            methodsUsed: [],
            avgResponseTime: 0
          }
        };
        
        setHarResult(harResultData);
        toast({
          title: "HAR file processed successfully",
          description: `JMeter test plan generated with ${data.summary?.totalRequests || 0} requests`
        });
      } else {
        throw new Error('No JMX content received from HAR processing');
      }
    } catch (error: any) {
      console.error('HAR processing error:', error);
      toast({
        title: "Processing failed",
        description: error.message || "Failed to process HAR file",
        variant: "destructive"
      });
    } finally {
      setIsHarProcessing(false);
      setTimeout(() => setHarProgress(0), 1000);
    }
  }, [harContent, toast]);

  const downloadHarJMX = () => {
    if (!harResult?.jmxContent) return;

    const blob = new Blob([harResult.jmxContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'har-test-plan.jmx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Report Generation Functions
  useEffect(() => {
    if (activeMainTab === "generate-report") {
      fetchReports();
    }
  }, [activeMainTab]);

  const fetchReports = async () => {
    setIsLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('performance_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error: any) {
      console.error('Error fetching reports:', error);
      toast({
        title: "Error loading reports",
        description: error.message || "Failed to load performance reports",
        variant: "destructive"
      });
    } finally {
      setIsLoadingReports(false);
    }
  };

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    files.forEach(file => {
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const newFile: CSVFile = {
            name: file.name,
            content,
            size: file.size
          };
          
          setSelectedCSVFiles(prev => {
            const exists = prev.some(f => f.name === file.name);
            if (exists) return prev;
            return [...prev, newFile];
          });
        };
        reader.readAsText(file);
      }
    });

    toast({
      title: "CSV files uploaded",
      description: `${files.length} file(s) added for analysis`
    });
  };

  const removeCSVFile = (fileName: string) => {
    setSelectedCSVFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const generateReport = async () => {
    if (selectedCSVFiles.length === 0) {
      toast({
        title: "No CSV files selected",
        description: "Please upload at least one CSV file",
        variant: "destructive"
      });
      return;
    }

    if (!reportName.trim()) {
      toast({
        title: "Report name required",
        description: "Please enter a name for your report",
        variant: "destructive"
      });
      return;
    }

    setIsGeneratingReport(true);

    try {
      if (!currentProjectId) {
        toast({
          title: "No project found",
          description: "Create a project first, then generate a report",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-performance-report', {
        body: {
          csvFiles: selectedCSVFiles,
          reportName: reportName.trim(),
          aiProvider: reportAiProvider,
          projectId: currentProjectId
        }
      });

      console.log('Supabase response:', { data, error });

      if (error) {
        console.error('Supabase functions error:', error);
        throw new Error(
          reportAiProvider === 'gemini'
            ? 'Gemini is currently rate-limited or quota-exhausted. Please wait ~1 minute or switch to Azure OpenAI.'
            : `Function call failed: ${error.message}`
        );
      }

      if (data?.success) {
        toast({
          title: "Report generated successfully",
          description: "Your performance analysis report has been created"
        });
        
        setSelectedCSVFiles([]);
        setReportName("");
        setIsReportDialogOpen(false); // Close dialog after successful generation
        fetchReports();
      } else {
        throw new Error(data?.error || 'Unknown error occurred');
      }
    } catch (error: any) {
      console.error('Error generating report:', error);
      toast({
        title: "Report generation failed",
        description: error.message || "Failed to generate performance report",
        variant: "destructive"
      });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const deleteReport = async (reportId: string) => {
    try {
      const { error } = await supabase
        .from('performance_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      toast({
        title: "Report deleted",
        description: "Performance report has been removed"
      });
      
      fetchReports();
      if (selectedReport?.id === reportId) {
        setSelectedReport(null);
      }
    } catch (error: any) {
      console.error('Error deleting report:', error);
      toast({
        title: "Error deleting report",
        description: error.message || "Failed to delete report",
        variant: "destructive"
      });
    }
  };

  const downloadReportAsHTML = (report: PerformanceReport) => {
    const date = new Date(report.created_at).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${report.report_name}</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            line-height: 1.6; 
            margin: 0; 
            padding: 40px;
            color: #333;
            background: #fafafa;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            padding: 60px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 50px;
            padding-bottom: 30px;
            border-bottom: 3px solid #2563eb;
        }
        .header h1 {
            color: #1e40af;
            font-size: 2.5em;
            margin: 0;
            font-weight: 700;
        }
        .generated-date {
            color: #6b7280;
            font-size: 1.1em;
            margin-top: 10px;
        }
        h1 { color: #1e40af; font-size: 2.2em; margin-top: 40px; margin-bottom: 20px; font-weight: 700; }
        h2 { color: #2563eb; font-size: 1.8em; margin-top: 35px; margin-bottom: 15px; font-weight: 600; border-left: 4px solid #2563eb; padding-left: 15px; }
        h3 { color: #3b82f6; font-size: 1.4em; margin-top: 25px; margin-bottom: 12px; font-weight: 600; }
        .content { white-space: pre-wrap; }
        .footer {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${report.report_name}</h1>
            <div class="generated-date">Generated on: ${date}</div>
        </div>
        <div class="content">${report.report_content.replace(/\n/g, '<br>')}</div>
        <div class="footer">
            <p><strong>Performance Testing Report</strong> | Confidential Document</p>
            <p>AI Provider: ${report.ai_provider} | Files analyzed: ${report.csv_files_metadata?.length || 0}</p>
        </div>
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_name.replace(/\s+/g, '_')}_Report.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadReportAsWord = (report: PerformanceReport) => {
    const date = new Date(report.created_at).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let rtfContent = report.report_content
      .replace(/^# (.*$)/gim, '\\par\\b\\fs32 $1\\b0\\fs24\\par')
      .replace(/^## (.*$)/gim, '\\par\\b\\fs28 $1\\b0\\fs24\\par')
      .replace(/^### (.*$)/gim, '\\par\\b\\fs26 $1\\b0\\fs24\\par')
      .replace(/\*\*(.*?)\*\*/g, '\\b $1\\b0')
      .replace(/\*(.*?)\*/g, '\\i $1\\i0')
      .replace(/^\- (.*$)/gim, '\\par\\bullet $1')
      .replace(/\n/g, '\\par');

    const wordContent = `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
\\par\\qc\\b\\fs36 ${report.report_name}\\b0\\fs24
\\par\\qc Generated on: ${date}
\\par\\qc AI Provider: ${report.ai_provider} | Files: ${report.csv_files_metadata?.length || 0}
\\par\\par
${rtfContent}
\\par\\par
\\qc\\i Generated by Advanced Performance Testing Suite\\i0
}`;

    const blob = new Blob([wordContent], { type: 'application/rtf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_name.replace(/\s+/g, '_')}_Report.rtf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadReportAsPDF = (report: PerformanceReport) => {
    const date = new Date(report.created_at).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${report.report_name}</title>
    <style>
        @page { size: A4; margin: 2cm; }
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #1e40af; font-size: 2em; margin: 0; }
        .generated-date { color: #6b7280; margin-top: 10px; font-size: 0.9em; }
        .content { white-space: pre-wrap; }
        .footer { margin-top: 40px; text-align: center; color: #666; font-size: 0.8em; page-break-inside: avoid; }
        h1 { color: #1e40af; font-size: 1.5em; margin-top: 25px; page-break-after: avoid; }
        h2 { color: #2563eb; font-size: 1.3em; margin-top: 20px; page-break-after: avoid; }
        h3 { color: #3b82f6; font-size: 1.1em; margin-top: 15px; page-break-after: avoid; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${report.report_name}</h1>
        <div class="generated-date">Generated on: ${date}</div>
        <div class="generated-date">AI Provider: ${report.ai_provider} | Files analyzed: ${report.csv_files_metadata?.length || 0}</div>
    </div>
    <div class="content">${report.report_content.replace(/\n/g, '<br>')}</div>
    <div class="footer">
        <p><strong>Performance Testing Report</strong> | Confidential Document | Generated by Advanced Performance Testing Suite</p>
    </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Performance Test Generator</h1>
        <p className="text-muted-foreground">
          Generate JMeter test plans and analyze performance reports
        </p>
      </div>

      <Tabs value={activeMainTab} onValueChange={setActiveMainTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generate-jmx" className="flex items-center gap-2">
            <TestTube className="h-4 w-4" />
            Generate JMX
          </TabsTrigger>
          <TabsTrigger value="generate-report" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Generate Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate-jmx" className="space-y-6">
          <div className="flex items-center gap-2 mb-6">
            <FileText className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold">JMX Generation Tools</h2>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 min-h-[800px]">
            {/* Swagger to JMX Section */}
            <div className="space-y-6">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    Swagger to JMX
                  </CardTitle>
                  <CardDescription>
                    Upload your OpenAPI/Swagger specification to generate JMeter test plans
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="swaggerFile">Swagger/OpenAPI File</Label>
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
                    <Label htmlFor="swaggerContent">Paste Swagger/OpenAPI Content</Label>
                    <Textarea
                      id="swaggerContent"
                      placeholder="Paste your Swagger/OpenAPI JSON or YAML content here..."
                      value={swaggerContent}
                      onChange={(e) => setSwaggerContent(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="baseUrl">Base URL</Label>
                      <Input
                        id="baseUrl"
                        placeholder="https://api.example.com"
                        value={swaggerConfig.baseUrl}
                        onChange={(e) => setSwaggerConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                      />
                    </div>

                    <div>
                      <Label htmlFor="groupBy">Group Operations By</Label>
                      <Select 
                        value={swaggerConfig.groupBy} 
                        onValueChange={(value: 'tag' | 'path') => setSwaggerConfig(prev => ({ ...prev, groupBy: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tag">Tags</SelectItem>
                          <SelectItem value="path">Path</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="swaggerAiProvider">AI Provider</Label>
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
                  </div>

                  <Button 
                    onClick={() => {
                      console.log('Generate JMeter Test Plan button clicked');
                      console.log('Swagger content length:', swaggerContent.length);
                      console.log('Base URL:', swaggerConfig.baseUrl);
                      processSwagger();
                    }} 
                    disabled={!swaggerContent.trim() || !swaggerConfig.baseUrl.trim() || isSwaggerProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isSwaggerProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Generating with AI...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        Generate JMeter Test Plan
                      </>
                    )}
                  </Button>

                  {isSwaggerProcessing && swaggerProgress > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing Progress</span>
                        <span>{swaggerProgress}%</span>
                      </div>
                      <Progress value={swaggerProgress} className="w-full" />
                    </div>
                  )}

                  {swaggerJmeterXml && (
                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="font-medium">JMeter Test Plan Generated</span>
                      </div>
                      {swaggerResult && (
                        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                          <div>
                            <div className="font-medium">Total Endpoints</div>
                            <div className="text-lg font-bold text-primary">{swaggerResult.totalEndpoints}</div>
                          </div>
                          <div>
                            <div className="font-medium">AI Provider</div>
                            <div className="text-lg font-bold text-primary">{swaggerResult.aiProvider}</div>
                          </div>
                        </div>
                      )}
                      <Button onClick={downloadSwaggerJMX} className="w-full" variant="outline">
                        <Download className="w-4 h-4 mr-2" />
                        Download JMX File
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* HAR to JMX Section */}
            <div className="space-y-6">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    HAR to JMX
                  </CardTitle>
                  <CardDescription>
                    Upload a HAR file to generate JMeter performance test scripts
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
                    <Label htmlFor="harContentPaste">Paste HAR JSON Content</Label>
                    <Textarea
                      id="harContentPaste"
                      placeholder="Paste your HAR file JSON content here..."
                      value={harContent}
                      onChange={(e) => setHarContent(e.target.value)}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="harAiProvider">AI Provider</Label>
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
                    onClick={processHar} 
                    disabled={!harContent.trim() || isHarProcessing}
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
                        <Zap className="w-4 h-4 mr-2" />
                        Generate JMeter Test Plan
                      </>
                    )}
                  </Button>

                  {isHarProcessing && harProgress > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing Progress</span>
                        <span>{harProgress}%</span>
                      </div>
                      <Progress value={harProgress} className="w-full" />
                    </div>
                  )}

                  {harResult && (
                    <div className="pt-4 border-t space-y-3">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="font-medium">JMeter Script Generated</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div>
                          <div className="font-medium">Total Requests</div>
                          <div className="text-lg font-bold text-primary">{harResult.summary.totalRequests}</div>
                        </div>
                        <div>
                          <div className="font-medium">Avg Response Time</div>
                          <div className="text-lg font-bold text-primary">{harResult.summary.avgResponseTime}ms</div>
                        </div>
                      </div>
                      <Button onClick={downloadHarJMX} className="w-full" variant="outline">
                        <Download className="w-4 h-4 mr-2" />
                        Download JMX File
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="generate-report" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Performance Reports</h2>
              <p className="text-muted-foreground">View and manage your generated performance analysis reports</p>
            </div>
            
            <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  Generate Report
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] bg-background border z-50">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Generate New Performance Report
                  </DialogTitle>
                  <DialogDescription>
                    Upload CSV files and generate an AI-powered performance analysis report
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                  <div>
                    <Label htmlFor="report-name">Report Name</Label>
                    <Input
                      id="report-name"
                      placeholder="Enter report name"
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="csv-files">Upload CSV Files</Label>
                    <Input
                      id="csv-files"
                      type="file"
                      accept=".csv"
                      multiple
                      onChange={handleCSVUpload}
                      className="mt-2"
                    />
                  </div>

                  {selectedCSVFiles.length > 0 && (
                    <div className="space-y-2">
                      <Label>Selected Files</Label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {selectedCSVFiles.map((file) => (
                          <div key={file.name} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                            <div>
                              <p className="text-sm font-medium">{file.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {(file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeCSVFile(file.name)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>AI Provider</Label>
                    <Select value={reportAiProvider} onValueChange={(value: 'gemini' | 'azure-openai') => setReportAiProvider(value)}>
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border z-50">
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                        <SelectItem value="azure-openai">Azure OpenAI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={generateReport}
                    disabled={isGeneratingReport || selectedCSVFiles.length === 0 || !reportName.trim()}
                    className="w-full"
                  >
                    {isGeneratingReport ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Generating Report...
                      </>
                    ) : (
                      <>
                        <Brain className="h-4 w-4 mr-2" />
                        Generate Report
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-6 w-full">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Generated Reports
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoadingReports ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-16 bg-muted animate-pulse rounded" />
                    ))}
                  </div>
                ) : reports.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No reports generated yet. Click "Generate Report" to create your first analysis.
                  </p>
                ) : (
                  <ScrollArea className="h-[400px] w-full">
                    <div className="space-y-3 pr-4">
                      {reports.map((report) => (
                        <div
                          key={report.id}
                          className={`group relative p-4 border rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${
                            selectedReport?.id === report.id 
                              ? 'border-primary bg-primary/5 shadow-sm' 
                              : 'hover:border-muted-foreground/60 hover:bg-muted/30'
                          }`}
                          onClick={() => setSelectedReport(report)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                                <h4 className="font-semibold text-sm truncate max-w-[200px]">
                                  {report.report_name}
                                </h4>
                                {selectedReport?.id === report.id && (
                                  <Badge variant="outline" className="text-xs">
                                    Selected
                                  </Badge>
                                )}
                              </div>
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <span>📅</span>
                                  {new Date(report.created_at).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </p>
                                <div className="flex items-center gap-3">
                                  <Badge 
                                    variant={report.ai_provider === 'gemini' ? 'default' : 'secondary'} 
                                    className="text-xs"
                                  >
                                    <Brain className="w-2 h-2 mr-1" />
                                    {report.ai_provider === 'gemini' ? 'Gemini' : 'Azure OpenAI'}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <FileText className="w-3 h-3" />
                                    {report.csv_files_metadata?.length || 0} files
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={(e) => e.stopPropagation()}
                                    className="h-8 w-8 p-0"
                                  >
                                    <FileDown className="h-3 w-3" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadReportAsHTML(report);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <FileText className="h-3 w-3" />
                                    HTML
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadReportAsWord(report);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <FileText className="h-3 w-3" />
                                    Word
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      downloadReportAsPDF(report);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <FileText className="h-3 w-3" />
                                    PDF
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteReport(report.id);
                                }}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Report Preview
                </CardTitle>
                <CardDescription>
                  {selectedReport 
                    ? `${selectedReport.report_name} - Generated on ${new Date(selectedReport.created_at).toLocaleDateString()}` 
                    : "Select a report from the list above to view its content"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedReport ? (
                  <ScrollArea className="h-[600px] w-full">
                    <div className="prose max-w-none pr-4">
                      <div 
                        className="whitespace-pre-wrap text-sm leading-relaxed p-4 bg-muted/30 rounded border"
                        dangerouslySetInnerHTML={{ __html: selectedReport.report_content }}
                      />
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground border rounded bg-muted/20">
                    <div className="text-center space-y-2">
                      <FileText className="h-16 w-16 mx-auto opacity-30" />
                      <p className="text-lg">Select a report to view preview</p>
                      <p className="text-sm">The report content will appear here</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};