import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileText, Settings, Zap, TestTube } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import * as yaml from "js-yaml";

type GeneratorType = 'api-test' | 'jmx-file';

interface JMeterConfig {
  threadCount: number;
  rampUpTime: number;
  loopCount: number;
  testPlanName: string;
  groupingStrategy: 'thread-groups' | 'simple-controllers';
  addAssertions: boolean;
  addCorrelation: boolean;
  generateCsvConfig: boolean;
}

export const APIPerformanceTesting = () => {
  // Common state
  const [baseUrl, setBaseUrl] = useState("");
  const [swaggerContent, setSwaggerContent] = useState("");
  const [selectedGenerator, setSelectedGenerator] = useState<GeneratorType | null>(null);
  
  // API Test Generator state
  const [testCases, setTestCases] = useState("");
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  
  // JMX Generator state
  const [jmeterXml, setJmeterXml] = useState("");
  const [isProcessingJmx, setIsProcessingJmx] = useState(false);
  const [jmeterConfig, setJmeterConfig] = useState<JMeterConfig>({
    threadCount: 10,
    rampUpTime: 10,
    loopCount: 1,
    testPlanName: "API Performance Test",
    groupingStrategy: 'thread-groups',
    addAssertions: true,
    addCorrelation: true,
    generateCsvConfig: false
  });

  const { toast } = useToast();

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      
      // Extract base URL from swagger spec using comprehensive logic
      const extractedBaseUrl = extractBaseUrlFromSpec(content);
      if (extractedBaseUrl) {
        setBaseUrl(extractedBaseUrl);
      }

      toast({
        title: "File uploaded successfully",
        description: `Loaded ${file.name}${extractedBaseUrl ? ` with base URL: ${extractedBaseUrl}` : ''}`,
      });
    } catch (error) {
      toast({
        title: "Error uploading file",
        description: "Please check your file format and try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Comprehensive Base URL extraction function
  const extractBaseUrlFromSpec = (content: string): string | null => {
    try {
      const parsedSpec = content.trim().startsWith('{') 
        ? JSON.parse(content) 
        : yaml.load(content) as any;

      // OpenAPI 3.x format - check servers array
      if (parsedSpec?.servers && Array.isArray(parsedSpec.servers) && parsedSpec.servers.length > 0) {
        const server = parsedSpec.servers[0];
        if (server.url) {
          // Handle relative URLs by making them absolute
          if (server.url.startsWith('/')) {
            return `https://localhost${server.url}`;
          }
          return server.url;
        }
      }

      // Swagger 2.x format - build from host, schemes, and basePath
      if (parsedSpec?.host) {
        const scheme = (parsedSpec.schemes && parsedSpec.schemes[0]) || 'https';
        const basePath = parsedSpec.basePath || '';
        return `${scheme}://${parsedSpec.host}${basePath}`;
      }

      return null;
    } catch (e) {
      console.warn('Failed to extract base URL from spec:', e);
      return null;
    }
  };

  // API Test Generator functions
  const generateTestCases = useCallback(async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Swagger content",
        description: "Please upload a Swagger/OpenAPI specification file first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingTests(true);
    
    try {
      // Parse the swagger content
      let parsedSpec;
      try {
        parsedSpec = swaggerContent.startsWith('{') ? JSON.parse(swaggerContent) : yaml.load(swaggerContent);
      } catch (e) {
        throw new Error("Invalid Swagger/OpenAPI format");
      }

      // Generate test cases based on the specification and custom prompt
      const generatedTestCases = generateAPITestCasesCSV(parsedSpec as any, customPrompt);
      setTestCases(generatedTestCases);

      toast({
        title: "Test cases generated successfully",
        description: "Generated CSV test cases from your API specification.",
      });
    } catch (error) {
      toast({
        title: "Error generating test cases",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingTests(false);
    }
  }, [swaggerContent, toast]);

  const generateAPITestCasesCSV = (spec: any, customPrompt?: string): string => {
    const operations: Array<{
      path: string;
      method: string;
      operationId?: string;
      summary?: string;
      description?: string;
      tags?: string[];
      parameters?: any[];
      requestBody?: any;
      responses?: any;
    }> = [];

    // Extract all operations from the spec
    Object.entries(spec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
      Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
          operations.push({
            path,
            method: method.toUpperCase(),
            operationId: operation.operationId,
            summary: operation.summary,
            description: operation.description,
            tags: operation.tags,
            parameters: operation.parameters,
            requestBody: operation.requestBody,
            responses: operation.responses
          });
        }
      });
    });

    return generateCSVTestCases(operations, spec, customPrompt);
  };

  // Helper function to generate example data from schema
  const generateExampleFromSchema = (schema: any, spec: any): string => {
    if (!schema) return "";

    // Handle $ref references to components/schemas
    if (schema.$ref && spec?.components?.schemas) {
      const schemaName = schema.$ref.split('/').pop();
      const referencedSchema = spec.components.schemas[schemaName];
      if (referencedSchema) {
        // Use example if available in referenced schema
        if (referencedSchema.example) {
          return JSON.stringify(referencedSchema.example);
        }
        return generateExampleFromSchema(referencedSchema, spec);
      }
    }

    // Use direct example if available
    if (schema.example) {
      return JSON.stringify(schema.example);
    }

    // Generate from schema properties
    const generateDataFromSchema = (schemaObj: any): any => {
      if (!schemaObj) return {};

      switch (schemaObj.type) {
        case 'object':
          const obj: any = {};
          if (schemaObj.properties) {
            Object.entries(schemaObj.properties).forEach(([key, prop]: [string, any]) => {
              obj[key] = generateDataFromSchema(prop);
            });
          }
          return obj;
          
        case 'array':
          return [generateDataFromSchema(schemaObj.items || { type: 'string' })];
          
        case 'string':
          if (schemaObj.example) return schemaObj.example;
          if (schemaObj.format === 'email') return 'user@example.com';
          if (schemaObj.format === 'date-time') return new Date().toISOString();
          if (schemaObj.format === 'date') return new Date().toISOString().split('T')[0];
          if (schemaObj.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
          if (schemaObj.enum) return schemaObj.enum[0];
          return schemaObj.default || 'sample_string';
          
        case 'number':
        case 'integer':
          if (schemaObj.example !== undefined) return schemaObj.example;
          if (schemaObj.default !== undefined) return schemaObj.default;
          if (schemaObj.minimum !== undefined) return schemaObj.minimum;
          return 123;
          
        case 'boolean':
          if (schemaObj.example !== undefined) return schemaObj.example;
          if (schemaObj.default !== undefined) return schemaObj.default;
          return true;
          
        default:
          return schemaObj.example || schemaObj.default || 'sample_value';
      }
    };

    const generatedData = generateDataFromSchema(schema);
    return JSON.stringify(generatedData);
  };

  const generateCSVTestCases = (operations: any[], spec: any, customPrompt?: string): string => {
    const csvHeaders = [
      "Sr.No.",
      "Module Name", 
      "Description",
      "Method",
      "API",
      "Request Headers",
      "Content-Type",
      "Token",
      "Body(Request)",
      "Expected Status Code",
      "Expected Response",
      "Actual Status Code", 
      "Actual Response",
      "Result",
      "Comment"
    ];

    const csvRows: string[] = [csvHeaders.join(",")];
    let serialNumber = 1;

    // Parse custom prompt for role information
    const isRoleBased = customPrompt?.toLowerCase().includes('role') || 
                       customPrompt?.toLowerCase().includes('admin') || 
                       customPrompt?.toLowerCase().includes('user') ||
                       customPrompt?.toLowerCase().includes('manager');

    const extractRoles = (prompt: string): string[] => {
      const rolePatterns = /(?:roles?[:\s]+|(?:admin|user|manager|super\s*user|employee|associate|requestor|guest)[,\s]*)/gi;
      const matches = prompt.match(/(?:admin|user|manager|super\s*user|employee|associate|requestor|guest)/gi) || [];
      return [...new Set(matches.map(role => role.toUpperCase().replace(/\s+/g, '_')))];
    };

    const roles = isRoleBased ? extractRoles(customPrompt || '') : [];
    if (roles.length === 0 && isRoleBased) {
      roles.push('SUPER_USER', 'MANAGER', 'USER');
    }

    operations.forEach((op) => {
      const moduleName = op.tags?.[0] || "API";
      const description = op.summary || op.description || `${op.method} operation for ${op.path}`;
      const apiPath = op.path;
      const method = op.method;
      
      // Generate request headers
      const requestHeaders = "Content Type: application/json";

      // Generate request body from schema if available
      let requestBody = "";
      if (op.requestBody?.content?.["application/json"]?.schema) {
        requestBody = generateExampleFromSchema(op.requestBody.content["application/json"].schema, spec);
      }

      // Get possible status codes from responses
      const responseCodes = Object.keys(op.responses || {});
      const successCodes = responseCodes.filter(code => code.startsWith('2'));
      
      const primarySuccessCode = successCodes[0] || "200";
      
      // Get parameter information
      const pathParams = (op.parameters || []).filter((p: any) => p.in === 'path');
      const requiredParams = (op.parameters || []).filter((p: any) => p.required);
      
      // 1. POSITIVE TEST CASE - Valid data
      csvRows.push([
        serialNumber.toString(),
        moduleName,
        `"${description} - Valid Request"`,
        method,
        apiPath,
        `"${requestHeaders}"`,
        "application/json",
        "Yes",
        requestBody ? `"${requestBody.replace(/"/g, '""')}"` : "",
        `200 OK`,
        "",
        "",
        "",
        "",
        "Positive test case with valid data"
      ].join(","));
      serialNumber++;

      // 2. ROLE-BASED TEST CASES (if roles detected in prompt)
      if (isRoleBased && roles.length > 0) {
        roles.forEach(role => {
          // Valid token test
          csvRows.push([
            serialNumber.toString(),
            moduleName,
            `"${description} - ${role} Access"`,
            method,
            apiPath,
            `"${requestHeaders}"`,
            "application/json",
            "Yes",
            requestBody ? `"${requestBody.replace(/"/g, '""')}"` : "",
            `200 OK`,
            "",
            "",
            "",
            "",
            `${role} role access test`
          ].join(","));
          serialNumber++;

          // No token test
          csvRows.push([
            serialNumber.toString(),
            moduleName,
            `"${description} - ${role} No Token"`,
            method,
            apiPath,
            `"${requestHeaders}"`,
            "application/json",
            "No",
            requestBody ? `"${requestBody.replace(/"/g, '""')}"` : "",
            `401 Unauthorized`,
            "",
            "",
            "",
            "",
            `${role} unauthorized access test`
          ].join(","));
          serialNumber++;
        });
      }

      // 3. AUTHENTICATION TEST CASE (if security schemes exist and not role-based)
      if ((spec.components?.securitySchemes || spec.securityDefinitions) && !isRoleBased) {
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Missing Authentication"`,
          method,
          apiPath,
          `"${requestHeaders}"`,
          "application/json",
          "No",
          requestBody ? `"${requestBody.replace(/"/g, '""')}"` : "",
          "401 Unauthorized",
          "",
          "",
          "",
          "",
          "Authentication test - missing or invalid credentials"
        ].join(","));
        serialNumber++;
      }

      // 4. VALIDATION TEST CASES - Missing required parameters
      if (requiredParams.length > 0) {
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Missing Required Parameters"`,
          method,
          apiPath,
          `"${requestHeaders}"`,
          "application/json",
          "Yes",
          "",
          "400 Bad Request",
          "",
          "",
          "",
          "",
          `Validation test - missing required parameters: ${requiredParams.map((p: any) => p.name).join(', ')}`
        ].join(","));
        serialNumber++;
      }

      // 5. INVALID DATA TYPE TEST CASE
      if (requestBody) {
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Invalid Data Types"`,
          method,
          apiPath,
          `"${requestHeaders}"`,
          "application/json",
          "Yes",
          `"{"invalidField": "invalid_data_type"}"`,
          "400 Bad Request",
          "",
          "",
          "",
          "",
          "Validation test - invalid data types in request body"
        ].join(","));
        serialNumber++;
      }

      // 6. BOUNDARY TEST CASES - for string/numeric fields
      if (op.requestBody?.content?.["application/json"]?.schema?.properties) {
        const schema = op.requestBody.content["application/json"].schema;
        const hasStringWithLimits = Object.values(schema.properties).some((prop: any) => 
          prop.type === 'string' && (prop.minLength || prop.maxLength)
        );
        const hasNumberWithLimits = Object.values(schema.properties).some((prop: any) => 
          (prop.type === 'number' || prop.type === 'integer') && (prop.minimum !== undefined || prop.maximum !== undefined)
        );

        if (hasStringWithLimits || hasNumberWithLimits) {
          csvRows.push([
            serialNumber.toString(),
            moduleName,
            `"${description} - Boundary Values"`,
            method,
            apiPath,
            `"${requestHeaders}"`,
            "application/json",
            "Yes",
            `"${generateBoundaryTestData(schema)}"`,
            "400 Bad Request",
            "",
            "",
            "",
            "",
            "Boundary test - values at or beyond allowed limits"
          ].join(","));
          serialNumber++;
        }
      }

      // 7. RESOURCE NOT FOUND TEST CASE (for operations with path parameters)
      if (pathParams.length > 0) {
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Resource Not Found"`,
          method,
          apiPath.replace(/{[^}]+}/g, 'nonexistent_id'),
          `"${requestHeaders}"`,
          "application/json",
          "Yes",
          requestBody ? `"${requestBody.replace(/"/g, '""')}"` : "",
          "404 Not Found",
          "",
          "",
          "",
          "",
          "Negative test - resource does not exist"
        ].join(","));
        serialNumber++;
      }

      // 8. METHOD NOT ALLOWED TEST CASE
      const otherMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].filter(m => m !== method);
      if (otherMethods.length > 0) {
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Method Not Allowed"`,
          otherMethods[0],
          apiPath,
          `"${requestHeaders}"`,
          "application/json",
          "Yes",
          "",
          "405 Method Not Allowed",
          "",
          "",
          "",
          "",
          `HTTP method ${otherMethods[0]} not allowed for this endpoint`
        ].join(","));
        serialNumber++;
      }

      // 9. CONTENT TYPE TEST CASES
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Invalid Content Type"`,
          method,
          apiPath,
          `"Content Type: text/plain"`,
          "text/plain",
          "Yes",
          "",
          "415 Unsupported Media Type",
          "",
          "",
          "",
          "",
          "Content type validation - unsupported media type"
        ].join(","));
        serialNumber++;
      }

      // 9. LARGE PAYLOAD TEST CASE (for POST/PUT operations)
      if (['POST', 'PUT', 'PATCH'].includes(method) && requestBody) {
        const largePayload = generateLargePayload();
        csvRows.push([
          serialNumber.toString(),
          moduleName,
          `"${description} - Large Payload"`,
          method,
          apiPath,
          `"${requestHeaders}"`,
          "application/json",
          "Yes",
          `"${largePayload}"`,
          "413 Payload Too Large",
          "",
          "",
          "",
          "",
          "Boundary test - payload size exceeds limits"
        ].join(","));
        serialNumber++;
      }
    });

    return csvRows.join("\n");
  };

  // Helper function to generate boundary test data
  const generateBoundaryTestData = (schema: any): string => {
    const boundaryData: any = {};
    
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, prop]: [string, any]) => {
        if (prop.type === 'string') {
          if (prop.maxLength) {
            // Generate string that exceeds max length
            boundaryData[key] = 'a'.repeat(prop.maxLength + 1);
          } else if (prop.minLength) {
            // Generate string shorter than min length
            boundaryData[key] = prop.minLength > 1 ? 'a'.repeat(prop.minLength - 1) : '';
          }
        } else if (prop.type === 'number' || prop.type === 'integer') {
          if (prop.maximum !== undefined) {
            boundaryData[key] = prop.maximum + 1;
          } else if (prop.minimum !== undefined) {
            boundaryData[key] = prop.minimum - 1;
          }
        }
      });
    }
    
    return JSON.stringify(boundaryData).replace(/"/g, '""');
  };

  // Helper function to generate large payload for testing
  const generateLargePayload = (): string => {
    const largeObject = {
      data: 'x'.repeat(10000), // Large string
      array: Array(1000).fill({ field: 'value' }), // Large array
      description: 'This is a test payload designed to exceed typical size limits for API requests'
    };
    return JSON.stringify(largeObject).replace(/"/g, '""');
  };

  const generateAPITestCases = (spec: any, framework: string): string => {
    const operations: Array<{
      path: string;
      method: string;
      operationId?: string;
      summary?: string;
      parameters?: any[];
      requestBody?: any;
      responses?: any;
    }> = [];

    // Extract all operations from the spec
    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
          operations.push({
            path,
            method: method.toUpperCase(),
            operationId: (operation as any).operationId,
            summary: (operation as any).summary,
            parameters: (operation as any).parameters,
            requestBody: (operation as any).requestBody,
            responses: (operation as any).responses
          });
        }
      }
    }

    switch (framework) {
      case "postman":
        return generatePostmanCollection(operations, spec);
      case "jest":
        return generateJestTests(operations, spec);
      case "newman":
        return generateNewmanTests(operations, spec);
      default:
        return generateGenericTests(operations, spec);
    }
  };

  const generatePostmanCollection = (operations: any[], spec: any): string => {
    const collection = {
      info: {
        name: `${spec.info?.title || 'API'} Test Collection`,
        description: spec.info?.description || 'Generated API test collection',
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: operations.map(op => ({
        name: `${op.method} ${op.path}`,
        request: {
          method: op.method,
          header: [
            {
              key: "Content-Type",
              value: "application/json"
            }
          ],
          url: {
            raw: `{{baseUrl}}${op.path}`,
            host: ["{{baseUrl}}"],
            path: op.path.split('/').filter(Boolean)
          },
          body: op.method !== 'GET' ? {
            mode: "raw",
            raw: JSON.stringify({
              "sample": "data"
            }, null, 2)
          } : undefined
        },
        event: [
          {
            listen: "test",
            script: {
              exec: [
                "pm.test('Status code is success', function () {",
                "    pm.expect(pm.response.code).to.be.oneOf([200, 201, 202, 204]);",
                "});",
                "",
                "pm.test('Response time is less than 2000ms', function () {",
                "    pm.expect(pm.response.responseTime).to.be.below(2000);",
                "});",
                "",
                "pm.test('Response has valid JSON', function () {",
                "    pm.response.to.have.jsonBody();",
                "});"
              ]
            }
          }
        ]
      }))
    };

    return JSON.stringify(collection, null, 2);
  };

  const generateJestTests = (operations: any[], spec: any): string => {
    return `// Jest API Tests for ${spec.info?.title || 'API'}
import axios from 'axios';

const baseURL = process.env.API_BASE_URL || '${baseUrl}';
const api = axios.create({ baseURL });

describe('${spec.info?.title || 'API'} Tests', () => {
  beforeAll(() => {
    // Setup authentication tokens or other prerequisites
  });

${operations.map(op => `
  describe('${op.method} ${op.path}', () => {
    test('should return successful response', async () => {
      const response = await api.${op.method.toLowerCase()}('${op.path}'${op.method !== 'GET' ? ', { sample: "data" }' : ''});
      
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.data).toBeDefined();
    });

    test('should complete within reasonable time', async () => {
      const startTime = Date.now();
      await api.${op.method.toLowerCase()}('${op.path}'${op.method !== 'GET' ? ', { sample: "data" }' : ''});
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds
    });
  });`).join('')}
});`;
  };

  const generateNewmanTests = (operations: any[], spec: any): string => {
    return `#!/bin/bash
# Newman test script for ${spec.info?.title || 'API'}

echo "Running API tests with Newman..."

# Set environment variables
export BASE_URL=\${BASE_URL:-"${baseUrl}"}

# Run the collection
newman run postman_collection.json \\
  --environment environment.json \\
  --reporters cli,json,html \\
  --reporter-html-export results.html \\
  --reporter-json-export results.json \\
  --timeout-request 30000 \\
  --delay-request 100

echo "Test execution completed. Check results.html for detailed report."`;
  };

  const generateGenericTests = (operations: any[], spec: any): string => {
    return `# API Test Cases for ${spec.info?.title || 'API'}

## Test Suite Overview
- Total Endpoints: ${operations.length}
- API Version: ${spec.info?.version || 'N/A'}
- Base URL: ${baseUrl || 'To be configured'}

## Test Cases

${operations.map((op, index) => `
### Test Case ${index + 1}: ${op.method} ${op.path}
**Description:** ${op.summary || 'API endpoint test'}
**Method:** ${op.method}
**Endpoint:** ${op.path}

**Test Steps:**
1. Send ${op.method} request to ${op.path}
2. Verify response status code is 2xx
3. Verify response content type is application/json
4. Verify response time is under 2000ms
5. Validate response schema

**Expected Results:**
- Status Code: 200-299
- Response Time: < 2000ms
- Valid JSON response
- Schema validation passes

**Test Data:**
${op.method !== 'GET' ? '```json\n{\n  "sample": "test data"\n}\n```' : 'No body required'}

---`).join('')}

## Environment Setup
1. Configure base URL: ${baseUrl || 'To be configured'}
2. Set up authentication tokens
3. Prepare test data
4. Configure test environment variables`;
  };

  const downloadTestCases = useCallback(() => {
    if (!testCases.trim()) {
      toast({
        title: "No test cases to download",
        description: "Please generate test cases first.",
        variant: "destructive",
      });
      return;
    }

    const getFileExtension = () => {
      return "csv";
    };

    const blob = new Blob([testCases], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-test-cases.${getFileExtension()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Test cases downloaded",
      description: "Downloaded CSV test cases successfully.",
    });
  }, [testCases, toast]);

  // JMX Generator functions
  const generateJMeterPlan = useCallback(async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Swagger content",
        description: "Please upload a Swagger/OpenAPI specification file first.",
        variant: "destructive",
      });
      return;
    }

    // Enhanced base URL validation and fallback
    let finalBaseUrl = baseUrl.trim();
    
    if (!finalBaseUrl) {
      // Try to extract base URL from spec if not manually provided
      const extractedUrl = extractBaseUrlFromSpec(swaggerContent);
      if (extractedUrl) {
        finalBaseUrl = extractedUrl;
        setBaseUrl(extractedUrl);
        toast({
          title: "Base URL extracted",
          description: `Using base URL from specification: ${extractedUrl}`,
        });
      } else {
        toast({
          title: "Missing Base URL",
          description: "Please provide a base URL for the API or ensure your specification includes server information.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsProcessingJmx(true);
    
    try {
      // Parse the swagger content
      let parsedSpec;
      try {
        parsedSpec = swaggerContent.startsWith('{') ? JSON.parse(swaggerContent) : yaml.load(swaggerContent);
      } catch (e) {
        throw new Error("Invalid Swagger/OpenAPI format");
      }

      // Generate JMeter XML with validated base URL
      const jmxContent = generateJMeterXml(parsedSpec as any, { ...jmeterConfig, baseUrl: finalBaseUrl });
      setJmeterXml(jmxContent);

      toast({
        title: "JMX file generated successfully",
        description: `Your JMeter test plan has been generated with base URL: ${finalBaseUrl}`,
      });
    } catch (error) {
      toast({
        title: "Error generating JMX file",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingJmx(false);
    }
  }, [swaggerContent, baseUrl, jmeterConfig, toast]);

  const generateJMeterXml = (spec: any, config: JMeterConfig & { baseUrl: string }): string => {
    // Enhanced URL parsing with better error handling
    const urlParts = (() => {
      try {
        const url = new URL(config.baseUrl);
        const defaultPort = url.protocol === 'https:' ? '443' : '80';
        return {
          protocol: url.protocol.replace(':', ''),
          domain: url.hostname,
          port: url.port || defaultPort,
          path: url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : ''
        };
      } catch (error) {
        console.warn('Failed to parse base URL, attempting fallback parsing:', error);
        
        // Enhanced fallback parsing
        let cleanUrl = config.baseUrl.trim();
        
        // Add protocol if missing
        if (!cleanUrl.match(/^https?:\/\//)) {
          cleanUrl = `https://${cleanUrl}`;
        }
        
        try {
          const url = new URL(cleanUrl);
          const defaultPort = url.protocol === 'https:' ? '443' : '80';
          return {
            protocol: url.protocol.replace(':', ''),
            domain: url.hostname,
            port: url.port || defaultPort,
            path: url.pathname !== '/' ? url.pathname.replace(/\/$/, '') : ''
          };
        } catch (fallbackError) {
          console.error('Fallback URL parsing also failed:', fallbackError);
          
          // Last resort manual parsing
          const urlWithoutProtocol = cleanUrl.replace(/^https?:\/\//, '');
          const [hostPort, ...pathParts] = urlWithoutProtocol.split('/');
          const [host, port] = hostPort.split(':');
          const isHttps = cleanUrl.startsWith('https://');
          
          return {
            protocol: isHttps ? 'https' : 'http',
            domain: host || 'localhost',
            port: port || (isHttps ? '443' : '80'),
            path: pathParts.length > 0 ? '/' + pathParts.join('/') : ''
          };
        }
      }
    })();

    // Extract paths and operations
    const operations: Array<{
      path: string;
      method: string;
      operationId?: string;
      summary?: string;
      parameters?: any[];
      requestBody?: any;
      tags?: string[];
    }> = [];

    for (const [path, pathItem] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
          operations.push({
            path,
            method: method.toUpperCase(),
            operationId: (operation as any).operationId,
            summary: (operation as any).summary,
            parameters: (operation as any).parameters,
            requestBody: (operation as any).requestBody,
            tags: (operation as any).tags
          });
        }
      }
    }

    // Enhanced function to generate request body from Swagger examples or schema
    const generateRequestBody = (operation: any): string => {
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(operation.method)) {
        return '';
      }

      // Try to get example from operation requestBody
      if (operation.requestBody?.content) {
        const contentTypes = Object.keys(operation.requestBody.content);
        const jsonContentType = contentTypes.find(ct => ct.includes('json')) || contentTypes[0];
        
        if (jsonContentType && operation.requestBody.content[jsonContentType]) {
          const content = operation.requestBody.content[jsonContentType];
          
          // Priority 1: Use direct example if available
          if (content.example) {
            return JSON.stringify(content.example, null, 2);
          }
          
          // Priority 2: Use examples object if available
          if (content.examples) {
            const exampleKey = Object.keys(content.examples)[0];
            const exampleValue = content.examples[exampleKey];
            
            if (exampleValue?.value) {
              return JSON.stringify(exampleValue.value, null, 2);
            }
            
            // Some examples might be directly the value
            if (exampleValue && typeof exampleValue === 'object' && !exampleValue.value) {
              return JSON.stringify(exampleValue, null, 2);
            }
          }
          
          // Priority 3: Generate from schema
          if (content.schema) {
            const generatedData = generateDataFromSchema(content.schema, spec);
            return JSON.stringify(generatedData, null, 2);
          }
        }
      }

      // Priority 4: Check if there's a global example in components/schemas
      if (spec.components?.schemas && operation.requestBody?.content) {
        const contentTypes = Object.keys(operation.requestBody.content);
        const jsonContentType = contentTypes.find(ct => ct.includes('json'));
        
        if (jsonContentType) {
          const schema = operation.requestBody.content[jsonContentType].schema;
          if (schema?.$ref) {
            const schemaName = schema.$ref.split('/').pop();
            const schemaDefinition = spec.components.schemas[schemaName];
            
            if (schemaDefinition?.example) {
              return JSON.stringify(schemaDefinition.example, null, 2);
            }
            
            if (schemaDefinition) {
              const generatedData = generateDataFromSchema(schemaDefinition, spec);
              return JSON.stringify(generatedData, null, 2);
            }
          }
        }
      }

      // Fallback: generate basic request body based on common patterns
      return JSON.stringify({
        "id": 1,
        "name": "Sample Name",
        "description": "Sample Description",
        "status": "active",
        "timestamp": new Date().toISOString()
      }, null, 2);
    };

    // Helper function to generate dummy data from schema
    const generateDataFromSchema = (schema: any, specRef?: any): any => {
      if (!schema) return {};

      // Handle $ref references to components/schemas
      if (schema.$ref && specRef?.components?.schemas) {
        const schemaName = schema.$ref.split('/').pop();
        const referencedSchema = specRef.components.schemas[schemaName];
        if (referencedSchema) {
          // Use example if available in referenced schema
          if (referencedSchema.example) {
            return referencedSchema.example;
          }
          return generateDataFromSchema(referencedSchema, specRef);
        }
      }

      switch (schema.type) {
        case 'object':
          const obj: any = {};
          if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
              obj[key] = generateDataFromSchema(prop, specRef);
            }
          }
          return obj;
          
        case 'array':
          return [generateDataFromSchema(schema.items || { type: 'string' }, specRef)];
          
        case 'string':
          if (schema.example) return schema.example;
          if (schema.format === 'email') return 'user@example.com';
          if (schema.format === 'date-time') return new Date().toISOString();
          if (schema.format === 'date') return new Date().toISOString().split('T')[0];
          if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
          if (schema.format === 'uri') return 'https://example.com';
          if (schema.enum) return schema.enum[0];
          return schema.default || 'sample_string';
          
        case 'number':
        case 'integer':
          if (schema.example !== undefined) return schema.example;
          if (schema.default !== undefined) return schema.default;
          if (schema.minimum !== undefined) return schema.minimum;
          return 123;
          
        case 'boolean':
          if (schema.example !== undefined) return schema.example;
          if (schema.default !== undefined) return schema.default;
          return true;
          
        default:
          return schema.example || schema.default || 'sample_value';
      }
    };

    // Group operations by tags
    const groupedOperations = operations.reduce((groups, op) => {
      const tags = op.tags && op.tags.length > 0 ? op.tags : ['default'];
      
      tags.forEach(tag => {
        if (!groups[tag]) {
          groups[tag] = [];
        }
        groups[tag].push(op);
      });
      
      return groups;
    }, {} as Record<string, typeof operations>);

    // Generate thread groups for each tag
    const threadGroups = Object.entries(groupedOperations).map(([tag, tagOperations]) => {
      const httpSamplers = tagOperations.map(op => {
        const operationDescription = op.summary || `${op.method} ${op.path}`;
        const samplerName = `[${op.method}] ${op.path} → ${operationDescription}`;
        
        // Enhanced path construction with proper URL building
        let fullPath = op.path.replace(/{([^}]+)}/g, '${$1}');
        
        // Build complete path by combining base path and operation path
        const pathComponents = [];
        
        // Add URL base path if it exists
        if (urlParts.path) {
          pathComponents.push(urlParts.path);
        }
        
        // Add Swagger 2.x basePath if it exists and not already included
        if (spec.basePath && spec.basePath !== '/' && !urlParts.path.includes(spec.basePath)) {
          pathComponents.push(spec.basePath);
        }
        
        // Add the operation path
        pathComponents.push(fullPath);
        
        // Join paths and normalize (remove double slashes, ensure leading slash)
        fullPath = '/' + pathComponents
          .join('/')
          .split('/')
          .filter(Boolean)
          .join('/');

        // Generate request body for operations that need it
        const requestBody = generateRequestBody(op);
        const hasBody = requestBody && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method);

        return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${samplerName}" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain">${urlParts.domain}</stringProp>
          <stringProp name="HTTPSampler.port">${urlParts.port}</stringProp>
          <stringProp name="HTTPSampler.protocol">${urlParts.protocol}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding"></stringProp>
          <stringProp name="HTTPSampler.path">${fullPath}</stringProp>
          <stringProp name="HTTPSampler.method">${op.method}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout">30000</stringProp>
          <stringProp name="HTTPSampler.response_timeout">30000</stringProp>${hasBody ? `
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${requestBody}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>` : ''}
        </HTTPSamplerProxy>
        <hashTree>
          ${config.addAssertions ? `
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="HTTP Success Assertion" enabled="true">
            <collectionProp name="Asserion.test_strings">
              <stringProp name="49586">200</stringProp>
              <stringProp name="49587">201</stringProp>
              <stringProp name="49588">202</stringProp>
              <stringProp name="49589">204</stringProp>
            </collectionProp>
            <stringProp name="Assertion.custom_message">Expected successful HTTP status code (2xx)</stringProp>
            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
            <boolProp name="Assertion.assume_success">false</boolProp>
            <intProp name="Assertion.test_type">33</intProp>
          </ResponseAssertion>
          <hashTree/>` : ''}
        </hashTree>`;
      }).join('\n');

      return `
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${tag.charAt(0).toUpperCase() + tag.slice(1)} APIs" enabled="true">
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
      </ThreadGroup>
      <hashTree>
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Content-Type</stringProp>
              <stringProp name="Header.value">application/json</stringProp>
            </elementProp>
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Accept</stringProp>
              <stringProp name="Header.value">application/json</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>
        <hashTree/>${httpSamplers}
      </hashTree>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.5">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${config.testPlanName}" enabled="true">
      <stringProp name="TestPlan.comments">Generated from OpenAPI/Swagger specification - Grouped by Tags</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="domain" elementType="Argument">
            <stringProp name="Argument.name">domain</stringProp>
            <stringProp name="Argument.value">${urlParts.domain}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="port" elementType="Argument">
            <stringProp name="Argument.name">port</stringProp>
            <stringProp name="Argument.value">${urlParts.port}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="protocol" elementType="Argument">
            <stringProp name="Argument.name">protocol</stringProp>
            <stringProp name="Argument.value">${urlParts.protocol}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>${threadGroups}
      ${config.generateCsvConfig ? `
      <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="Test Data CSV Config" enabled="true">
        <stringProp name="delimiter">,</stringProp>
        <stringProp name="fileEncoding">UTF-8</stringProp>
        <stringProp name="filename">test-data.csv</stringProp>
        <boolProp name="ignoreFirstLine">true</boolProp>
        <boolProp name="quotedData">false</boolProp>
        <boolProp name="recycle">true</boolProp>
        <stringProp name="shareMode">shareMode.all</stringProp>
        <boolProp name="stopThread">false</boolProp>
        <stringProp name="variableNames">userId,orderId,productId,email</stringProp>
      </CSVDataSet>
      <hashTree/>` : ''}
      <ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="View Results Tree" enabled="true">
        <boolProp name="ResultCollector.error_logging">false</boolProp>
        <objProp>
          <name>saveConfig</name>
          <value class="SampleSaveConfiguration">
            <time>true</time>
            <latency>true</latency>
            <timestamp>true</timestamp>
            <success>true</success>
            <label>true</label>
            <code>true</code>
            <message>true</message>
            <threadName>true</threadName>
            <dataType>true</dataType>
            <encoding>false</encoding>
            <assertions>true</assertions>
            <subresults>true</subresults>
            <responseData>false</responseData>
            <samplerData>false</samplerData>
            <xml>false</xml>
            <fieldNames>true</fieldNames>
            <responseHeaders>false</responseHeaders>
            <requestHeaders>false</requestHeaders>
            <responseDataOnError>false</responseDataOnError>
            <saveAssertionResultsFailureMessage>true</saveAssertionResultsFailureMessage>
            <assertionsResultsToSave>0</assertionsResultsToSave>
            <bytes>true</bytes>
            <sentBytes>true</sentBytes>
            <url>true</url>
            <threadCounts>true</threadCounts>
            <idleTime>true</idleTime>
            <connectTime>true</connectTime>
          </value>
        </objProp>
        <stringProp name="filename"></stringProp>
      </ResultCollector>
      <hashTree/>
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
  };

  const downloadJMeterXml = useCallback(() => {
    if (!jmeterXml.trim()) {
      toast({
        title: "No JMX file to download",
        description: "Please generate a JMeter test plan first.",
        variant: "destructive",
      });
      return;
    }

    const blob = new Blob([jmeterXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${jmeterConfig.testPlanName.replace(/\s+/g, '_')}.jmx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "JMX file downloaded",
      description: "Your JMeter test plan has been downloaded successfully.",
    });
  }, [jmeterXml, jmeterConfig.testPlanName, toast]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          API & Performance Testing
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate test cases and performance tests from your Swagger/OpenAPI specification.
        </p>
      </div>

      {/* Common Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Swagger/OpenAPI Specification
          </CardTitle>
          <CardDescription>
            Provide your API specification and base URL for generating tests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="base-url">Base URL</Label>
            <Input
              id="base-url"
              placeholder="https://api.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="swagger-upload">Upload Specification File</Label>
            <Input
              id="swagger-upload"
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="swagger-content">Specification Content</Label>
            <Textarea
              id="swagger-content"
              placeholder="Paste your Swagger/OpenAPI specification here or upload a file above..."
              value={swaggerContent}
              onChange={(e) => setSwaggerContent(e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Generator Selection Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedGenerator === 'api-test' ? 'ring-2 ring-primary bg-accent/50' : ''
          }`}
          onClick={() => setSelectedGenerator('api-test')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              API Test Case Generator
            </CardTitle>
            <CardDescription>
              Generate comprehensive API test cases from your Swagger specification.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Supports Postman collections, Jest tests, Newman scripts, and generic test cases.
            </p>
          </CardContent>
        </Card>

        <Card 
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedGenerator === 'jmx-file' ? 'ring-2 ring-primary bg-accent/50' : ''
          }`}
          onClick={() => setSelectedGenerator('jmx-file')}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              JMX File Generator
            </CardTitle>
            <CardDescription>
              Generate JMeter performance test plans (.jmx files) for load testing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Create configurable JMeter test plans with thread groups, assertions, and correlation extractors.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Generator-Specific Content */}
      {selectedGenerator === 'api-test' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              API Test Case Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Output Format:</strong> CSV with comprehensive test scenarios
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Generates test cases including positive, negative, boundary, validation, authentication, and status code validations (200, 400, 401, 404, 500).
              </p>
            </div>

            <div>
              <Label htmlFor="custom-prompt">Custom Prompt (Optional)</Label>
              <Textarea
                id="custom-prompt"
                placeholder="Provide custom instructions for test case generation (e.g., specify roles like ADMIN, USER, MANAGER, or specific test scenarios you want to include)..."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                When role-based access details are provided, role-specific test cases will be generated.
              </p>
            </div>

            <div className="flex gap-4">
              <Button 
                onClick={generateTestCases} 
                disabled={isGeneratingTests || !swaggerContent.trim()}
                className="flex-1"
              >
                <FileText className="mr-2 h-4 w-4" />
                {isGeneratingTests ? "Generating..." : "Generate Test Cases"}
              </Button>

              <Button 
                onClick={downloadTestCases} 
                disabled={!testCases.trim()}
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>

            {testCases && (
              <div>
                <Label>Generated Test Cases</Label>
                <div className="mt-1 border rounded-md">
                  <ScrollArea className="h-96">
                    <Textarea
                      value={testCases}
                      readOnly
                      className="font-mono text-sm border-0 resize-none"
                      style={{ minHeight: 'auto' }}
                    />
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedGenerator === 'jmx-file' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              JMeter Test Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="test-plan-name">Test Plan Name</Label>
                <Input
                  id="test-plan-name"
                  value={jmeterConfig.testPlanName}
                  onChange={(e) => setJmeterConfig(prev => ({ ...prev, testPlanName: e.target.value }))}
                />
              </div>

              <div>
                <Label htmlFor="thread-count">Thread Count</Label>
                <Input
                  id="thread-count"
                  type="number"
                  min="1"
                  value={jmeterConfig.threadCount}
                  onChange={(e) => setJmeterConfig(prev => ({ ...prev, threadCount: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <Label htmlFor="ramp-up-time">Ramp-up Time (seconds)</Label>
                <Input
                  id="ramp-up-time"
                  type="number"
                  min="1"
                  value={jmeterConfig.rampUpTime}
                  onChange={(e) => setJmeterConfig(prev => ({ ...prev, rampUpTime: parseInt(e.target.value) || 1 }))}
                />
              </div>

              <div>
                <Label htmlFor="loop-count">Loop Count</Label>
                <Input
                  id="loop-count"
                  type="number"
                  min="1"
                  value={jmeterConfig.loopCount}
                  onChange={(e) => setJmeterConfig(prev => ({ ...prev, loopCount: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="add-assertions">Add Response Assertions</Label>
                <Switch
                  id="add-assertions"
                  checked={jmeterConfig.addAssertions}
                  onCheckedChange={(checked) => setJmeterConfig(prev => ({ ...prev, addAssertions: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="add-correlation">Add Correlation Extractors</Label>
                <Switch
                  id="add-correlation"
                  checked={jmeterConfig.addCorrelation}
                  onCheckedChange={(checked) => setJmeterConfig(prev => ({ ...prev, addCorrelation: checked }))}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="csv-config">Generate CSV Data Config</Label>
                <Switch
                  id="csv-config"
                  checked={jmeterConfig.generateCsvConfig}
                  onCheckedChange={(checked) => setJmeterConfig(prev => ({ ...prev, generateCsvConfig: checked }))}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <Button 
                onClick={generateJMeterPlan} 
                disabled={isProcessingJmx || !swaggerContent.trim() || !baseUrl.trim()}
                className="flex-1"
              >
                <Zap className="mr-2 h-4 w-4" />
                {isProcessingJmx ? "Generating..." : "Generate JMX File"}
              </Button>

              <Button 
                onClick={downloadJMeterXml} 
                disabled={!jmeterXml.trim()}
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>

            {jmeterXml && (
              <div>
                <Label>Generated JMX Content</Label>
                <Textarea
                  value={jmeterXml}
                  readOnly
                  rows={10}
                  className="font-mono text-sm mt-1"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};