import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Upload, Target, FileJson, AlertTriangle, CheckCircle, Brain, Settings, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Endpoint {
  path: string;
  method: string;
  summary?: string;
  operationId?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
}

interface AISuggestion {
  type: 'edge-case' | 'boundary' | 'security' | 'invalid-param';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export const APITestGenerator = () => {
  const [swaggerContent, setSwaggerContent] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [testCases, setTestCases] = useState<Array<any>>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [postmanCollection, setPostmanCollection] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      parseEndpoints(content);
      
      toast({
        title: "File uploaded successfully",
        description: "Swagger/OpenAPI specification loaded and parsed"
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Please ensure the file is a valid Swagger/OpenAPI specification",
        variant: "destructive"
      });
    }
  };

  const parseEndpoints = (content: string) => {
    try {
      const spec = JSON.parse(content);
      const parsedEndpoints: Endpoint[] = [];

      Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
        Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
          if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
            parsedEndpoints.push({
              path,
              method: method.toUpperCase(),
              summary: operation.summary,
              operationId: operation.operationId,
              parameters: operation.parameters,
              requestBody: operation.requestBody,
              responses: operation.responses
            });
          }
        });
      });

      setEndpoints(parsedEndpoints);
    } catch (error) {
      console.error('Error parsing endpoints:', error);
    }
  };

  const generateTestCases = async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Input",
        description: "Please provide a Swagger/OpenAPI specification",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const spec = JSON.parse(swaggerContent);
      
      if (!spec.paths || Object.keys(spec.paths).length === 0) {
        throw new Error("No API paths found in the specification");
      }

      setProgress(30);

      // Use AI-powered test case generation from existing edge functions
      const functionName = aiProvider === 'google' ? 'swagger-to-test-cases' : 'swagger-to-test-cases-openai';
      console.log(`Using AI provider: ${aiProvider}, calling function: ${functionName}`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { swaggerSpec: spec }
      });

      if (error) throw error;

      setProgress(70);

      if (data.success) {
        // Convert CSV data to test case objects
        const csvData = data.csvData || [];
        const generatedTestCases = csvData.slice(1).map((row: string[], index: number) => ({
          id: `test_case_${index}`,
          endpoint: row[0] || '',
          method: row[1] || 'GET',
          testCase: row[2] || '',
          testData: row[3] || '',
          expectedResult: row[4] || '',
          type: row[5] || 'Positive'
        }));

        setTestCases(generatedTestCases);
        setPostmanCollection(data.postmanCollection || null);
        setProgress(90);

        // Generate AI suggestions based on the generated test cases
        const suggestions = generateAISuggestions(spec, generatedTestCases);
        setAiSuggestions(suggestions);
        setProgress(100);
        
        toast({
          title: "AI-Generated Test Cases Complete",
          description: `Generated ${generatedTestCases.length} test cases using ${data.metadata?.provider || aiProvider === 'google' ? 'Google AI Studio' : 'Azure OpenAI'}`
        });
      } else {
        throw new Error(data.error || "Failed to generate test cases");
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate test cases",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePositiveTestCases = (path: string, method: string, operation: any, operationId: string) => {
    return [{
      id: `${operationId}_positive`,
      endpoint: path,
      method: method.toUpperCase(),
      testCase: `Successful ${method.toUpperCase()} request to ${path}`,
      expectedStatusCode: operation.responses?.['200'] ? '200' : 
                         operation.responses?.['201'] ? '201' : 
                         operation.responses?.['204'] ? '204' : '200',
      contentType: 'application/json',
      token: '{{TOKEN}}',
      testData: operation.requestBody?.content?.['application/json']?.schema ? 
               generateSampleData(operation.requestBody.content['application/json'].schema) : '',
      type: 'Positive'
    }];
  };

  const generateNegativeTestCases = (path: string, method: string, operation: any, operationId: string) => {
    const cases = [];
    
    if (operation.responses?.['400']) {
      cases.push({
        id: `${operationId}_invalid_data`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `Invalid data for ${method.toUpperCase()} request to ${path}`,
        expectedStatusCode: '400',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '{"invalid": "data"}',
        type: 'Negative'
      });
    }

    if (operation.responses?.['404']) {
      cases.push({
        id: `${operationId}_not_found`,
        endpoint: path.includes('{') ? path.replace(/\{[^}]+\}/g, '999999') : `${path}/nonexistent`,
        method: method.toUpperCase(),
        testCase: `Resource not found for ${method.toUpperCase()} request`,
        expectedStatusCode: '404',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '',
        type: 'Negative'
      });
    }

    return cases;
  };

  const generateAITestCases = async (path: string, method: string, operation: any, operationId: string, spec: any) => {
    const cases = [];
    
    // Comprehensive test cases generated based on OpenAI logic
    
    // 1. Positive test case
    cases.push({
      id: `${operationId}_positive`,
      endpoint: path,
      method: method.toUpperCase(),
      testCase: `Successful ${method.toUpperCase()} request to ${path}`,
      expectedStatusCode: operation.responses?.['200'] ? '200' : 
                         operation.responses?.['201'] ? '201' : 
                         operation.responses?.['204'] ? '204' : '200',
      contentType: 'application/json',
      token: '{{TOKEN}}',
      testData: operation.requestBody?.content?.['application/json']?.schema ? 
               generateSampleData(operation.requestBody.content['application/json'].schema) : '',
      type: 'Positive'
    });

    // 2. Missing Token test
    cases.push({
      id: `${operationId}_no_token`,
      endpoint: path,
      method: method.toUpperCase(),
      testCase: `${method.toUpperCase()} ${path} without authentication token`,
      expectedStatusCode: '401',
      contentType: 'application/json',
      token: '',
      testData: operation.requestBody?.content?.['application/json']?.schema ? 
               generateSampleData(operation.requestBody.content['application/json'].schema) : '',
      type: 'Authentication'
    });

    // 3. Missing Content-Type test
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      cases.push({
        id: `${operationId}_no_content_type`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `${method.toUpperCase()} ${path} without Content-Type header`,
        expectedStatusCode: '400',
        contentType: '',
        token: '{{TOKEN}}',
        testData: operation.requestBody?.content?.['application/json']?.schema ? 
                 generateSampleData(operation.requestBody.content['application/json'].schema) : '',
        type: 'Header Validation'
      });
    }

    // 4. Invalid Token test
    cases.push({
      id: `${operationId}_invalid_token`,
      endpoint: path,
      method: method.toUpperCase(),
      testCase: `${method.toUpperCase()} ${path} with invalid token`,
      expectedStatusCode: '401',
      contentType: 'application/json',
      token: 'invalid_token_123',
      testData: operation.requestBody?.content?.['application/json']?.schema ? 
               generateSampleData(operation.requestBody.content['application/json'].schema) : '',
      type: 'Authentication'
    });

    // 5. Invalid JSON payload test
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      cases.push({
        id: `${operationId}_invalid_json`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `${method.toUpperCase()} ${path} with invalid JSON`,
        expectedStatusCode: '400',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '{"invalid": json}',
        type: 'Data Validation'
      });
    }

    // 6. Empty payload test
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      cases.push({
        id: `${operationId}_empty_payload`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `${method.toUpperCase()} ${path} with empty payload`,
        expectedStatusCode: '400',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '',
        type: 'Data Validation'
      });
    }

    // 7. Resource not found test
    if (path.includes('{')) {
      cases.push({
        id: `${operationId}_not_found`,
        endpoint: path.replace(/\{[^}]+\}/g, '999999'),
        method: method.toUpperCase(),
        testCase: `${method.toUpperCase()} non-existent resource`,
        expectedStatusCode: '404',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '',
        type: 'Resource Validation'
      });
    }

    // 8. SQL Injection test
    if (path.includes('{')) {
      cases.push({
        id: `${operationId}_sql_injection`,
        endpoint: path.replace(/\{[^}]+\}/g, "'; DROP TABLE users; --"),
        method: method.toUpperCase(),
        testCase: `${method.toUpperCase()} ${path} with SQL injection attempt`,
        expectedStatusCode: '400',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '',
        type: 'Security'
      });
    }

    // 9. XSS attempt test
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) && operation.requestBody?.content?.['application/json']?.schema) {
      cases.push({
        id: `${operationId}_xss_attempt`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `${method.toUpperCase()} ${path} with XSS payload`,
        expectedStatusCode: '400',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '{"name": "<script>alert(\\"XSS\\")</script>", "description": "<img src=x onerror=alert(\\"XSS\\")>"}',
        type: 'Security'
      });
    }

    // 10. Rate limiting test
    cases.push({
      id: `${operationId}_rate_limit`,
      endpoint: path,
      method: method.toUpperCase(),
      testCase: `${method.toUpperCase()} ${path} rate limiting test`,
      expectedStatusCode: '429',
      contentType: 'application/json',
      token: '{{TOKEN}}',
      testData: operation.requestBody?.content?.['application/json']?.schema ? 
               generateSampleData(operation.requestBody.content['application/json'].schema) : '',
      type: 'Rate Limiting'
    });

    return cases;
  };

  const generateBoundaryTestCases = (path: string, method: string, operation: any, operationId: string) => {
    const cases = [];
    
    // Generate boundary tests for string parameters
    if (operation.requestBody?.content?.['application/json']?.schema?.properties) {
      const schema = operation.requestBody.content['application/json'].schema;
      
      cases.push({
        id: `${operationId}_empty_payload`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `Empty payload for ${method.toUpperCase()} ${path}`,
        expectedStatusCode: '400',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: '{}',
        type: 'Boundary'
      });

      cases.push({
        id: `${operationId}_large_payload`,
        endpoint: path,
        method: method.toUpperCase(),
        testCase: `Large payload for ${method.toUpperCase()} ${path}`,
        expectedStatusCode: '413',
        contentType: 'application/json',
        token: '{{TOKEN}}',
        testData: JSON.stringify({ data: 'x'.repeat(10000) }),
        type: 'Boundary'
      });
    }

    return cases;
  };

  const generatePostmanCollection = (spec: any, testCases: any[]) => {
    const collection = {
      info: {
        name: `${spec.info?.title || 'API'} Test Collection`,
        description: spec.info?.description || 'Generated test collection',
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      variable: [
        {
          key: "baseUrl",
          value: spec.servers?.[0]?.url || "{{baseUrl}}",
          type: "string"
        },
        {
          key: "TOKEN",
          value: "{{TOKEN}}",
          type: "string"
        }
      ],
      item: testCases.map(testCase => ({
        name: testCase.testCase,
        request: {
          method: testCase.method,
          header: [
            {
              key: "Content-Type",
              value: testCase.contentType,
              type: "text"
            },
            ...(testCase.token ? [{
              key: "Authorization",
              value: `Bearer ${testCase.token}`,
              type: "text"
            }] : [])
          ],
          body: testCase.testData ? {
            mode: "raw",
            raw: testCase.testData,
            options: {
              raw: {
                language: "json"
              }
            }
          } : undefined,
          url: {
            raw: `{{baseUrl}}${testCase.endpoint}`,
            host: ["{{baseUrl}}"],
            path: testCase.endpoint.split('/').filter(Boolean)
          }
        },
        response: [],
        event: [
          {
            listen: "test",
            script: {
              exec: [
                `pm.test("Status code is ${testCase.expectedStatusCode}", function () {`,
                `    pm.response.to.have.status(${testCase.expectedStatusCode});`,
                "});"
              ],
              type: "text/javascript"
            }
          }
        ]
      }))
    };

    return collection;
  };

  const generateAISuggestions = (spec: any, testCases: any[]): AISuggestion[] => {
    const suggestions: AISuggestion[] = [];

    // Check for missing edge cases
    const hasFileUpload = Object.values(spec.paths || {}).some((pathItem: any) =>
      Object.values(pathItem).some((operation: any) =>
        operation.requestBody?.content?.['multipart/form-data']
      )
    );

    if (hasFileUpload) {
      suggestions.push({
        type: 'edge-case',
        title: 'File Upload Edge Cases',
        description: 'Consider testing large files, unsupported formats, and empty files',
        priority: 'high'
      });
    }

    // Check for pagination endpoints
    const hasPagination = Object.values(spec.paths || {}).some((pathItem: any) =>
      Object.values(pathItem).some((operation: any) =>
        operation.parameters?.some((param: any) => 
          ['page', 'limit', 'offset', 'cursor'].includes(param.name?.toLowerCase())
        )
      )
    );

    if (hasPagination) {
      suggestions.push({
        type: 'boundary',
        title: 'Pagination Boundary Tests',
        description: 'Test with page=0, negative pages, and extremely large page numbers',
        priority: 'medium'
      });
    }

    // Security suggestions
    suggestions.push({
      type: 'security',
      title: 'SQL Injection Tests',
      description: 'Test path parameters and query strings with SQL injection payloads',
      priority: 'high'
    });

    suggestions.push({
      type: 'security',
      title: 'XSS Prevention Tests',
      description: 'Test input fields with XSS payloads to ensure proper sanitization',
      priority: 'high'
    });

    // Parameter validation suggestions
    const hasNumberParams = Object.values(spec.paths || {}).some((pathItem: any) =>
      Object.values(pathItem).some((operation: any) =>
        operation.parameters?.some((param: any) => 
          ['integer', 'number'].includes(param.schema?.type)
        )
      )
    );

    if (hasNumberParams) {
      suggestions.push({
        type: 'invalid-param',
        title: 'Numeric Parameter Validation',
        description: 'Test with string values, negative numbers, and floating point precision',
        priority: 'medium'
      });
    }

    return suggestions;
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

  const extractRolesFromPrompt = (prompt: string): string[] => {
    const roles = [];
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('admin')) roles.push('admin');
    if (lowerPrompt.includes('user')) roles.push('user');
    if (lowerPrompt.includes('guest')) roles.push('guest');
    if (lowerPrompt.includes('manager')) roles.push('manager');
    if (lowerPrompt.includes('moderator')) roles.push('moderator');
    
    return roles.length > 0 ? roles : ['user', 'admin'];
  };

  const determineRoleExpectedStatus = (role: string, operation: any): string => {
    // Simple logic - admin gets 200, others might get 403 for certain operations
    if (role === 'admin') return '200';
    if (['post', 'put', 'delete'].includes((operation.operationId || '').toLowerCase())) {
      return role === 'user' ? '403' : '200';
    }
    return '200';
  };

  const downloadTestCases = () => {
    if (testCases.length === 0) return;
    
    const csvHeaders = [
      'ID',
      'Endpoint',
      'Method', 
      'Test Case',
      'Expected Status Code',
      'Content-Type',
      'Token',
      'Test Data',
      'Type'
    ];
    
    const csvContent = [
      csvHeaders.join(','),
      ...testCases.map(tc => [
        tc.id,
        tc.endpoint,
        tc.method,
        `"${tc.testCase}"`,
        tc.expectedStatusCode,
        tc.contentType,
        tc.token,
        `"${tc.testData.replace(/"/g, '""')}"`,
        tc.type
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api_test_cases.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPostmanCollection = () => {
    if (!postmanCollection) return;
    
    const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${postmanCollection.info.name.replace(/\s+/g, '_')}.postman_collection.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Target className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">API Test Case Generator</h1>
      </div>
      <p className="text-muted-foreground">
        Generate comprehensive test cases from your OpenAPI/Swagger specifications with AI-powered suggestions
      </p>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Panel */}
        <Card>
          <CardHeader>
            <CardTitle>API Specification</CardTitle>
            <CardDescription>Upload or paste your Swagger/OpenAPI specification</CardDescription>
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
                onChange={(e) => {
                  setSwaggerContent(e.target.value);
                  if (e.target.value.trim()) {
                    parseEndpoints(e.target.value);
                  }
                }}
                placeholder="Paste your Swagger/OpenAPI specification here..."
                className="min-h-[200px] font-mono text-sm"
              />
            </div>

            <div>
              <Label htmlFor="aiProvider">AI Provider</Label>
              <Select value={aiProvider} onValueChange={(value: 'google' | 'openai') => setAiProvider(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select AI provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      Google AI Studio (Gemini)
                    </div>
                  </SelectItem>
                  <SelectItem value="openai">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Azure OpenAI (GPT-4)
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="customPrompt">Custom Instructions</Label>
              <Textarea
                id="customPrompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add custom instructions for test case generation (e.g., 'Include admin and user role testing', 'Focus on security scenarios', etc.)"
                className="min-h-[100px]"
              />
            </div>

            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Generating test cases...</div>
                  <div className="text-sm text-muted-foreground">{progress}%</div>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                onClick={generateTestCases} 
                disabled={isProcessing || !swaggerContent.trim()}
                className="flex-1"
              >
                {aiProvider === 'google' ? <Brain className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
                {isProcessing ? `Generating with ${aiProvider === 'google' ? 'Google AI' : 'Azure OpenAI'}...` : `Generate with ${aiProvider === 'google' ? 'Google AI' : 'Azure OpenAI'}`}
              </Button>
              
              {testCases.length > 0 && (
                <>
                  <Button onClick={downloadTestCases} variant="outline">
                    <Download className="mr-2 h-4 w-4" />
                    CSV
                  </Button>
                  {postmanCollection && (
                    <Button onClick={downloadPostmanCollection} variant="outline">
                      <FileJson className="mr-2 h-4 w-4" />
                      Postman
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              {endpoints.length > 0 && `${endpoints.length} endpoints found`}
              {testCases.length > 0 && ` • ${testCases.length} test cases generated`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="endpoints" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
                <TabsTrigger value="tests">Test Cases</TabsTrigger>
              </TabsList>
              
              <TabsContent value="endpoints" className="mt-4">
                {endpoints.length > 0 ? (
                  <ScrollArea className="h-96">
                    <div className="space-y-2">
                      {endpoints.map((endpoint, index) => (
                        <div key={index} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{endpoint.method}</Badge>
                            <code className="text-sm font-mono">{endpoint.path}</code>
                          </div>
                          {endpoint.summary && (
                            <p className="text-sm text-muted-foreground mt-1">{endpoint.summary}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <Target className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No endpoints parsed yet</p>
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="tests" className="mt-4">
                {testCases.length > 0 ? (
                  <ScrollArea className="h-96">
                    <div className="space-y-2">
                      {testCases.map((testCase, index) => (
                        <div key={index} className="p-3 border rounded-lg space-y-1">
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-sm">{testCase.testCase}</h4>
                            <Badge variant="outline">{testCase.type}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <span className="font-mono bg-muted px-1 rounded">{testCase.method}</span> {testCase.endpoint}
                            <span className="ml-2">→ {testCase.expectedStatusCode}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    <CheckCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No test cases generated yet</p>
                  </div>
                )}
              </TabsContent>
              
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};