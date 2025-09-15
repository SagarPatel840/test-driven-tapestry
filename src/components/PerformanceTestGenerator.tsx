import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Upload, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface JMeterConfig {
  testPlanName: string;
  threadCount: number;
  rampUpTime: number;
  loopCount: number;
  baseUrl: string;
  groupBy: 'tag' | 'path';
  addAssertions: boolean;
  addCorrelation: boolean;
  addCsvConfig: boolean;
}

export const PerformanceTestGenerator = () => {
  const [swaggerContent, setSwaggerContent] = useState("");
  const [jmeterXml, setJmeterXml] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<JMeterConfig>({
    testPlanName: "API Performance Test",
    threadCount: 10,
    rampUpTime: 30,
    loopCount: 1,
    baseUrl: "",
    groupBy: 'tag',
    addAssertions: true,
    addCorrelation: false,
    addCsvConfig: false
  });
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      
      // Try to parse and extract base URL
      try {
        const spec = JSON.parse(content);
        if (spec.servers?.[0]?.url) {
          setConfig(prev => ({ ...prev, baseUrl: spec.servers[0].url }));
        }
      } catch {
        // Try YAML parsing here if needed
      }
      
      toast({
        title: "File uploaded successfully",
        description: "Swagger/OpenAPI specification loaded"
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Please ensure the file is a valid Swagger/OpenAPI specification",
        variant: "destructive"
      });
    }
  };

  const generateJMeterXml = (spec: any, config: JMeterConfig): string => {
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

    const baseUrlInfo = parseBaseUrl(config.baseUrl || spec.servers?.[0]?.url || 'https://api.example.com');
    
    const generateAuthManager = () => {
      if (!spec.components?.securitySchemes) return '';
      
      const schemes = spec.components.securitySchemes;
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
            </HeaderManager>`;
        } else if (scheme.type === 'http' && scheme.scheme === 'bearer') {
          authConfig += `
            <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Bearer Token Headers" enabled="true">
              <collectionProp name="HeaderManager.headers">
                <elementProp name="" elementType="Header">
                  <stringProp name="Header.name">Authorization</stringProp>
                  <stringProp name="Header.value">Bearer \${TOKEN}</stringProp>
                </elementProp>
              </collectionProp>
            </HeaderManager>`;
        }
      });
      
      return authConfig;
    };

    const generateAssertion = () => {
      if (!config.addAssertions) return '';
      return `
        <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Response Assertion" enabled="true">
          <collectionProp name="Asserion.test_strings">
            <stringProp name="49586">200</stringProp>
          </collectionProp>
          <stringProp name="Assertion.custom_message"></stringProp>
          <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
          <boolProp name="Assertion.assume_success">false</boolProp>
          <intProp name="Assertion.test_type">1</intProp>
        </ResponseAssertion>`;
    };

    const generateJsonExtractor = () => {
      if (!config.addCorrelation) return '';
      return `
        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="JSON Extractor" enabled="true">
          <stringProp name="JSONPostProcessor.referenceNames">extracted_value</stringProp>
          <stringProp name="JSONPostProcessor.jsonPathExprs">$..id</stringProp>
          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
          <stringProp name="JSONPostProcessor.defaultValues">default</stringProp>
        </JSONPostProcessor>`;
    };

    const generateCsvConfig = () => {
      if (!config.addCsvConfig) return '';
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
        </CSVDataSet>`;
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
          <elementProp name="HTTPsampler.postBodyRaw" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${requestBody.replace(/"/g, '&quot;')}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>` : ''}
        </HTTPSamplerProxy>
        ${config.addAssertions ? generateAssertion() : ''}
        ${config.addCorrelation ? generateJsonExtractor() : ''}`;
    };

    const groupOperations = () => {
      const groups: { [key: string]: Array<{path: string, method: string, operation: any}> } = {};
      
      Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
        Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
          if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
            const groupKey = config.groupBy === 'tag' 
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
            <stringProp name="LoopController.loops">${config.loopCount}</stringProp>
          </elementProp>
          <stringProp name="ThreadGroup.num_threads">${config.threadCount}</stringProp>
          <stringProp name="ThreadGroup.ramp_time">${config.rampUpTime}</stringProp>
          <boolProp name="ThreadGroup.scheduler">false</boolProp>
          <stringProp name="ThreadGroup.duration"></stringProp>
          <stringProp name="ThreadGroup.delay"></stringProp>
          <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
          ${generateCsvConfig()}
          ${generateAuthManager()}
          ${samplers}
        </ThreadGroup>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${config.testPlanName}" enabled="true">
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

  const handleGenerateJMeter = () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Input",
        description: "Please provide a Swagger/OpenAPI specification",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      const spec = JSON.parse(swaggerContent);
      
      if (!spec.paths || Object.keys(spec.paths).length === 0) {
        throw new Error("No API paths found in the specification");
      }

      const jmxContent = generateJMeterXml(spec, config);
      setJmeterXml(jmxContent);
      
      toast({
        title: "JMeter Test Plan Generated",
        description: "Your performance test plan is ready for download"
      });
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate JMeter test plan",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!jmeterXml) return;
    
    const blob = new Blob([jmeterXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.testPlanName.replace(/\s+/g, '_')}.jmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">Performance Test Generator</h1>
      </div>
      <p className="text-muted-foreground">
        Convert your OpenAPI/Swagger specifications into JMeter performance test plans
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Configure your JMeter test plan settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="testPlanName">Test Plan Name</Label>
              <Input
                id="testPlanName"
                value={config.testPlanName}
                onChange={(e) => setConfig(prev => ({ ...prev, testPlanName: e.target.value }))}
                placeholder="Enter test plan name"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="threadCount">Threads</Label>
                <Input
                  id="threadCount"
                  type="number"
                  value={config.threadCount}
                  onChange={(e) => setConfig(prev => ({ ...prev, threadCount: parseInt(e.target.value) || 1 }))}
                  min="1"
                />
              </div>
              <div>
                <Label htmlFor="rampUpTime">Ramp-up (s)</Label>
                <Input
                  id="rampUpTime"
                  type="number"
                  value={config.rampUpTime}
                  onChange={(e) => setConfig(prev => ({ ...prev, rampUpTime: parseInt(e.target.value) || 1 }))}
                  min="1"
                />
              </div>
              <div>
                <Label htmlFor="loopCount">Loops</Label>
                <Input
                  id="loopCount"
                  type="number"
                  value={config.loopCount}
                  onChange={(e) => setConfig(prev => ({ ...prev, loopCount: parseInt(e.target.value) || 1 }))}
                  min="1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                value={config.baseUrl}
                onChange={(e) => setConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.example.com"
              />
            </div>

            <div>
              <Label htmlFor="groupBy">Group By</Label>
              <Select value={config.groupBy} onValueChange={(value: 'tag' | 'path') => setConfig(prev => ({ ...prev, groupBy: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tag">Tags</SelectItem>
                  <SelectItem value="path">Path</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-1">
                <Checkbox
                  id="addAssertions"
                  checked={config.addAssertions}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, addAssertions: checked as boolean }))}
                />
                <Label htmlFor="addAssertions">Add Response Assertions</Label>
              </div>

              <div className="flex items-center gap-1">
                <Checkbox
                  id="addCorrelation"
                  checked={config.addCorrelation}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, addCorrelation: checked as boolean }))}
                />
                <Label htmlFor="addCorrelation">Add JSON Extractors</Label>
              </div>

              <div className="flex items-center gap-1">
                <Checkbox
                  id="addCsvConfig"
                  checked={config.addCsvConfig}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, addCsvConfig: checked as boolean }))}
                />
                <Label htmlFor="addCsvConfig">Add CSV Data Config</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Swagger/OpenAPI Specification</CardTitle>
            <CardDescription>Upload or paste your API specification</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="fileUpload">Upload File</Label>
              <Input
                id="fileUpload"
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileUpload}
                className="cursor-pointer"
              />
            </div>

            <div>
              <Label htmlFor="swaggerContent">Or Paste Content</Label>
              <Textarea
                id="swaggerContent"
                value={swaggerContent}
                onChange={(e) => setSwaggerContent(e.target.value)}
                placeholder="Paste your Swagger/OpenAPI specification here..."
                className="min-h-[300px] font-mono text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleGenerateJMeter} 
                disabled={isProcessing || !swaggerContent.trim()}
                className="flex-1"
              >
                <Zap className="mr-2 h-4 w-4" />
                {isProcessing ? "Generating..." : "Generate JMeter Plan"}
              </Button>
              
              {jmeterXml && (
                <Button onClick={handleDownload} variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Panel */}
      {jmeterXml && (
        <Card>
          <CardHeader>
            <CardTitle>Generated JMeter Test Plan</CardTitle>
            <CardDescription>Preview of your JMeter XML configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={jmeterXml}
              readOnly
              className="min-h-[400px] font-mono text-sm"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};