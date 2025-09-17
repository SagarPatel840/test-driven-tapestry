import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Target, FileJson, AlertTriangle, CheckCircle, Brain, Settings, TestTube } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import * as yaml from "js-yaml";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Endpoint {
  path: string;
  method: string;
  summary?: string;
  operationId?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
  tags?: string[];
  security?: any[];
}

interface TestCase {
  testCaseId: string;
  moduleName: string;
  endpoint: string;
  method: string;
  description: string;
  contentType: string;
  roles: string;
  token: string;
  preconditions: string;
  request: string;
  expectedResponse: string;
}

export const AdvancedAPITestGenerator = () => {
  const [swaggerContent, setSwaggerContent] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [postmanCollection, setPostmanCollection] = useState<any>(null);
  const [csvContent, setCsvContent] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [includeSecurityTests, setIncludeSecurityTests] = useState(true);
  const [includeBoundaryTests, setIncludeBoundaryTests] = useState(true);
  const [includeRoleBasedTests, setIncludeRoleBasedTests] = useState(true);
  const [customRoles, setCustomRoles] = useState("admin,user,manager");
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      analyzeSwaggerSpec(content);
      
      toast({
        title: "File uploaded successfully",
        description: "Swagger/OpenAPI specification analyzed and parsed"
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Please ensure the file is a valid Swagger/OpenAPI specification",
        variant: "destructive"
      });
    }
  };

  const analyzeSwaggerSpec = (content: string) => {
    try {
      let spec: any;
      
      // Parse JSON or YAML
      if (content.trim().startsWith('{')) {
        spec = JSON.parse(content);
      } else {
        spec = yaml.load(content) as any;
      }

      const parsedEndpoints: Endpoint[] = [];

      // Extract all endpoints with comprehensive details
      Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
        Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
          if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
            parsedEndpoints.push({
              path,
              method: method.toUpperCase(),
              summary: operation.summary,
              operationId: operation.operationId,
              parameters: operation.parameters || [],
              requestBody: operation.requestBody,
              responses: operation.responses || {},
              tags: operation.tags || [],
              security: operation.security || spec.security || []
            });
          }
        });
      });

      setEndpoints(parsedEndpoints);
      
      toast({
        title: "Analysis Complete",
        description: `Found ${parsedEndpoints.length} API endpoints`
      });
    } catch (error) {
      console.error('Error analyzing spec:', error);
      toast({
        title: "Analysis Error",
        description: "Failed to analyze Swagger specification",
        variant: "destructive"
      });
    }
  };

  const generateComprehensiveTestCases = async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Input",
        description: "Please upload a Swagger/OpenAPI specification first",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const spec = swaggerContent.trim().startsWith('{') 
        ? JSON.parse(swaggerContent) 
        : yaml.load(swaggerContent) as any;

      const allTestCases: TestCase[] = [];
      let testCaseCounter = 1;

      // Process each endpoint
      for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        const moduleName = endpoint.tags?.[0] || 'API';
        
        // 1. Positive Test Cases
        const positiveTest: TestCase = {
          testCaseId: `TC_${String(testCaseCounter).padStart(3, '0')}`,
          moduleName,
          endpoint: endpoint.path,
          method: endpoint.method,
          description: `Successful ${endpoint.method} request - ${endpoint.summary || 'Valid request'}`,
          contentType: needsContentType(endpoint.method) ? 'Yes' : 'No',
          roles: hasSecurityRequirement(endpoint) && includeRoleBasedTests ? 'Yes' : 'No',
          token: hasSecurityRequirement(endpoint) ? 'Yes' : 'No',
          preconditions: generatePreconditions(endpoint),
          request: generateSampleRequest(endpoint, spec, 'positive'),
          expectedResponse: getExpectedSuccessResponse(endpoint)
        };
        allTestCases.push(positiveTest);
        testCaseCounter++;

        // Generate additional test cases based on configuration
        if (includeSecurityTests) {
          // Add security tests
          const securityTests = generateSecurityTestCases(endpoint, spec, testCaseCounter, moduleName);
          allTestCases.push(...securityTests);
          testCaseCounter += securityTests.length;
        }

        if (includeBoundaryTests && endpoint.requestBody) {
          // Add boundary tests
          const boundaryTests = generateBoundaryTestCases(endpoint, spec, testCaseCounter, moduleName);
          allTestCases.push(...boundaryTests);
          testCaseCounter += boundaryTests.length;
        }

        if (includeRoleBasedTests && hasSecurityRequirement(endpoint)) {
          // Add role-based tests
          const roleTests = generateRoleBasedTests(endpoint, spec, testCaseCounter, moduleName);
          allTestCases.push(...roleTests);
          testCaseCounter += roleTests.length;
        }

        setProgress(((i + 1) / endpoints.length) * 80);
      }

      setTestCases(allTestCases);
      
      // Generate CSV
      const csv = generateCSVContent(allTestCases);
      setCsvContent(csv);
      setProgress(90);

      // Generate Postman Collection
      const collection = generatePostmanCollection(spec, allTestCases);
      setPostmanCollection(collection);
      setProgress(100);

      toast({
        title: "Test Cases Generated Successfully",
        description: `Generated ${allTestCases.length} comprehensive test cases with CSV and Postman collection`
      });
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

  // Helper functions
  const needsContentType = (method: string): boolean => {
    return ['POST', 'PUT', 'PATCH'].includes(method);
  };

  const hasSecurityRequirement = (endpoint: Endpoint): boolean => {
    return endpoint.security && endpoint.security.length > 0;
  };

  const generatePreconditions = (endpoint: Endpoint): string => {
    const conditions = [];
    
    if (hasSecurityRequirement(endpoint)) {
      conditions.push('Valid authentication token required');
    }
    
    if (endpoint.parameters?.some(p => p.required)) {
      conditions.push('Required parameters must be provided');
    }
    
    if (needsContentType(endpoint.method)) {
      conditions.push('Content-Type: application/json header required');
    }
    
    return conditions.length > 0 ? conditions.join('; ') : 'None';
  };

  const generateSampleRequest = (endpoint: Endpoint, spec: any, scenario: string, role?: string): string => {
    const request: any = {
      method: endpoint.method,
      url: endpoint.path,
      headers: {}
    };

    // Add authentication based on scenario
    if (scenario === 'positive' || scenario === 'role-based') {
      request.headers['Authorization'] = role ? `Bearer {{${role.toUpperCase()}_TOKEN}}` : 'Bearer {{AUTH_TOKEN}}';
    }

    // Add content-type if needed
    if (needsContentType(endpoint.method)) {
      request.headers['Content-Type'] = 'application/json';
    }

    // Add sample body for POST/PUT/PATCH
    if (endpoint.requestBody && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      request.body = generateSampleRequestBody(endpoint.requestBody, spec);
    }

    return JSON.stringify(request, null, 2);
  };

  const generateSampleRequestBody = (requestBody: any, spec: any): string => {
    if (!requestBody?.content?.['application/json']?.schema) return '{}';
    
    const schema = requestBody.content['application/json'].schema;
    return JSON.stringify(generateSampleFromSchema(schema, spec), null, 2);
  };

  const generateSampleFromSchema = (schema: any, spec: any): any => {
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/', '').split('/');
      let resolved = spec;
      for (const segment of refPath) {
        resolved = resolved?.[segment];
      }
      return generateSampleFromSchema(resolved, spec);
    }

    switch (schema.type) {
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
            obj[key] = generateSampleFromSchema(prop, spec);
          });
        }
        return obj;
        
      case 'array':
        if (schema.items) {
          return [generateSampleFromSchema(schema.items, spec)];
        }
        return [];
        
      case 'string':
        return schema.example || 'sample_string';
        
      case 'number':
      case 'integer':
        return schema.example || 123;
        
      case 'boolean':
        return schema.example !== undefined ? schema.example : true;
        
      default:
        return schema.example || null;
    }
  };

  const getExpectedSuccessResponse = (endpoint: Endpoint): string => {
    const responses = endpoint.responses || {};
    
    // Look for success response codes
    for (const code of ['200', '201', '202', '204']) {
      if (responses[code]) {
        return `${code} ${responses[code].description || 'Success'}`;
      }
    }
    
    return '200 Success';
  };

  const generateSecurityTestCases = (endpoint: Endpoint, spec: any, startCounter: number, moduleName: string): TestCase[] => {
    const tests: TestCase[] = [];
    
    // Missing token test
    tests.push({
      testCaseId: `TC_${String(startCounter).padStart(3, '0')}`,
      moduleName,
      endpoint: endpoint.path,
      method: endpoint.method,
      description: `${endpoint.method} request without authentication token`,
      contentType: needsContentType(endpoint.method) ? 'Yes' : 'No',
      roles: 'No',
      token: 'No',
      preconditions: 'No authentication token provided',
      request: generateSampleRequest(endpoint, spec, 'no-auth'),
      expectedResponse: '401 Unauthorized - Missing or invalid authentication'
    });

    return tests;
  };

  const generateBoundaryTestCases = (endpoint: Endpoint, spec: any, startCounter: number, moduleName: string): TestCase[] => {
    const tests: TestCase[] = [];
    
    // Empty body test
    tests.push({
      testCaseId: `TC_${String(startCounter).padStart(3, '0')}`,
      moduleName,
      endpoint: endpoint.path,
      method: endpoint.method,
      description: `${endpoint.method} request with empty body`,
      contentType: 'Yes',
      roles: 'No',
      token: hasSecurityRequirement(endpoint) ? 'Yes' : 'No',
      preconditions: 'Empty request body',
      request: JSON.stringify({ method: endpoint.method, url: endpoint.path, body: '{}' }, null, 2),
      expectedResponse: '400 Bad Request - Invalid or missing required fields'
    });

    return tests;
  };

  const generateRoleBasedTests = (endpoint: Endpoint, spec: any, startCounter: number, moduleName: string): TestCase[] => {
    const tests: TestCase[] = [];
    const roles = customRoles.split(',').map(r => r.trim()).filter(Boolean);
    
    roles.forEach((role, index) => {
      tests.push({
        testCaseId: `TC_${String(startCounter + index).padStart(3, '0')}`,
        moduleName,
        endpoint: endpoint.path,
        method: endpoint.method,
        description: `${endpoint.method} request with ${role} role`,
        contentType: needsContentType(endpoint.method) ? 'Yes' : 'No',
        roles: 'Yes',
        token: 'Yes',
        preconditions: `User authenticated with ${role} role`,
        request: generateSampleRequest(endpoint, spec, 'role-based', role),
        expectedResponse: role === 'admin' ? '200 Success' : '403 Forbidden - Insufficient privileges'
      });
    });

    return tests;
  };

  const generateCSVContent = (testCases: TestCase[]): string => {
    const headers = [
      'Test Case ID',
      'Module Name',
      'Endpoint',
      'Method',
      'Description',
      'Content Type',
      'Roles',
      'Token',
      'Preconditions',
      'Request',
      'Expected Response'
    ];

    const rows = testCases.map(tc => [
      tc.testCaseId,
      tc.moduleName,
      tc.endpoint,
      tc.method,
      tc.description,
      tc.contentType,
      tc.roles,
      tc.token,
      tc.preconditions,
      tc.request.replace(/"/g, '""'),
      tc.expectedResponse
    ]);

    return [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
  };

  const generatePostmanCollection = (spec: any, testCases: TestCase[]): any => {
    return {
      info: {
        name: spec.info?.title || 'API Test Collection',
        description: `Generated test collection for ${spec.info?.title || 'API'}`,
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: testCases.map(tc => ({
        name: tc.description,
        request: JSON.parse(tc.request),
        event: [
          {
            listen: 'test',
            script: {
              exec: [
                `pm.test("${tc.description}", function () {`,
                `    pm.expect(pm.response.text()).to.include("${tc.expectedResponse.split(' ')[0]}");`,
                `});`
              ]
            }
          }
        ]
      }))
    };
  };

  const downloadCSV = () => {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-test-cases.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPostmanCollection = () => {
    const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'postman-collection.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Brain className="h-8 w-8 text-primary" />
          <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            AI-Powered API Test Generator
          </h2>
        </div>
        <p className="text-muted-foreground max-w-3xl mx-auto">
          Advanced AI-powered system that analyzes OpenAPI/Swagger specifications and generates comprehensive test cases with intelligent test scenarios, CSV outputs, and Postman collections.
        </p>
      </div>

      {/* Test Generation Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Test Generation Configuration
          </CardTitle>
          <CardDescription>
            Configure the AI-powered test generation parameters for comprehensive API testing coverage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="securityTests">Security Tests</Label>
              <Switch
                id="securityTests"
                checked={includeSecurityTests}
                onCheckedChange={setIncludeSecurityTests}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="boundaryTests">Boundary Tests</Label>
              <Switch
                id="boundaryTests"
                checked={includeBoundaryTests}
                onCheckedChange={setIncludeBoundaryTests}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="roleTests">Role-based Tests</Label>
              <Switch
                id="roleTests"
                checked={includeRoleBasedTests}
                onCheckedChange={setIncludeRoleBasedTests}
              />
            </div>
          </div>

          {includeRoleBasedTests && (
            <div>
              <Label htmlFor="customRoles">Custom Roles (comma-separated)</Label>
              <Input
                id="customRoles"
                value={customRoles}
                onChange={(e) => setCustomRoles(e.target.value)}
                placeholder="admin,user,manager"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Swagger/OpenAPI Input */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Swagger/OpenAPI Input
          </CardTitle>
          <CardDescription>Upload or paste your API specification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="swaggerFile">Upload Swagger/OpenAPI File</Label>
            <Input
              id="swaggerFile"
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
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
              onChange={(e) => setSwaggerContent(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          {swaggerContent && (
            <Button 
              onClick={() => analyzeSwaggerSpec(swaggerContent)}
              className="w-full"
            >
              Analyze Specification
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Analysis Results */}
      {endpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Analysis Results
            </CardTitle>
            <CardDescription>
              Discovered API endpoints from your specification
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{endpoints.length}</div>
                <div className="text-sm text-muted-foreground">Endpoints</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {endpoints.filter(e => e.method === 'GET').length}
                </div>
                <div className="text-sm text-muted-foreground">GET</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {endpoints.filter(e => e.method === 'POST').length}
                </div>
                <div className="text-sm text-muted-foreground">POST</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {endpoints.filter(e => ['PUT', 'PATCH', 'DELETE'].includes(e.method)).length}
                </div>
                <div className="text-sm text-muted-foreground">Others</div>
              </div>
            </div>

            <Button 
              onClick={generateComprehensiveTestCases}
              disabled={isProcessing}
              className="w-full"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Generating Test Cases...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Generate AI-Powered Test Cases
                </>
              )}
            </Button>

            {isProcessing && (
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Test Results */}
      {testCases.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Generated Test Cases
              </CardTitle>
              <CardDescription>
                Comprehensive test cases with multiple scenarios and edge cases
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{testCases.length}</div>
                  <div className="text-sm text-muted-foreground">Total Tests</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {testCases.filter(tc => tc.description.includes('Successful')).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Positive</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {testCases.filter(tc => tc.token === 'No' || tc.token.includes('Invalid')).length}
                  </div>
                  <div className="text-sm text-muted-foreground">Security</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {testCases.filter(tc => tc.roles === 'Yes').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Role-based</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <Button onClick={downloadCSV} variant="outline" className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
                <Button onClick={downloadPostmanCollection} variant="outline" className="flex-1">
                  <FileJson className="h-4 w-4 mr-2" />
                  Download Postman Collection
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Test Cases Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Test Cases Preview</CardTitle>
              <CardDescription>
                Generated test cases with all required fields (showing first 10)
              </CardDescription>
            </CardHeader>
            <CardContent>
<div className="border rounded-lg">
  <ScrollArea className="h-96">
    <div className="min-w-full">
      <table className="w-full text-sm border-collapse border border-border">
        <thead className="bg-muted">
          <tr>
            <th className="border border-border p-2 text-left">Test ID</th>
            <th className="border border-border p-2 text-left">Module</th>
            <th className="border border-border p-2 text-left">Method</th>
            <th className="border border-border p-2 text-left">Description</th>
            <th className="border border-border p-2 text-left">Auth</th>
            <th className="border border-border p-2 text-left">Roles</th>
          </tr>
        </thead>
        <tbody>
          {testCases.slice(0, 10).map((testCase, index) => (
            <tr key={index} className="hover:bg-muted/50">
              <td className="border border-border p-2 font-mono text-xs">{testCase.testCaseId}</td>
              <td className="border border-border p-2">{testCase.moduleName}</td>
              <td className="border border-border p-2">
                <Badge variant={testCase.method === 'GET' ? 'secondary' : 'default'} className="text-xs">
                  {testCase.method}
                </Badge>
              </td>
              <td className="border border-border p-2 max-w-xs truncate">{testCase.description}</td>
              <td className="border border-border p-2 text-center">
                <span className={`px-2 py-1 rounded text-xs ${
                  testCase.token === 'Yes' 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                }`}>
                  {testCase.token}
                </span>
              </td>
              <td className="border border-border p-2 text-center">
                <span className={`px-2 py-1 rounded text-xs ${
                  testCase.roles === 'Yes' 
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                }`}>
                  {testCase.roles}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {testCases.length > 10 && (
        <div className="text-center text-sm text-muted-foreground py-2">
          ... and {testCases.length - 10} more test cases
        </div>
      )}
    </div>
  </ScrollArea>
</div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};