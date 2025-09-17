import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, FileText, Settings, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import * as yaml from "js-yaml";

interface JMeterConfig {
  threadCount: number;
  rampUpTime: number;
  loopCount: number;
  duration: number;
  baseUrl: string;
  testPlanName: string;
  groupingStrategy: 'thread-groups' | 'simple-controllers';
  addAssertions: boolean;
  addCorrelation: boolean;
  generateCsvConfig: boolean;
  responseTimeThreshold: number;
  throughputThreshold: number;
  errorRateThreshold: number;
  connectionTimeout: number;
  responseTimeout: number;
  followRedirects: boolean;
  useKeepAlive: boolean;
  enableReporting: boolean;
}

export const SwaggerToJMeter = () => {
  const [swaggerContent, setSwaggerContent] = useState("");
  const [jmeterXml, setJmeterXml] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<JMeterConfig>({
    threadCount: 10,
    rampUpTime: 60,
    loopCount: 1,
    duration: 300,
    baseUrl: "",
    testPlanName: "API Performance Test",
    groupingStrategy: 'thread-groups',
    addAssertions: true,
    addCorrelation: true,
    generateCsvConfig: false,
    responseTimeThreshold: 5000,
    throughputThreshold: 100,
    errorRateThreshold: 5,
    connectionTimeout: 10000,
    responseTimeout: 30000,
    followRedirects: true,
    useKeepAlive: true,
    enableReporting: true
  });
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const { toast } = useToast();

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      
      // Try to extract base URL from swagger spec
      let parsedSpec;
      try {
        parsedSpec = file.name.endsWith('.yaml') || file.name.endsWith('.yml') 
          ? yaml.load(content) as any
          : JSON.parse(content);
        
        if (parsedSpec?.servers?.[0]?.url) {
          setConfig(prev => ({ ...prev, baseUrl: parsedSpec.servers[0].url }));
        } else if (parsedSpec?.host) {
          const scheme = parsedSpec.schemes?.[0] || 'https';
          setConfig(prev => ({ ...prev, baseUrl: `${scheme}://${parsedSpec.host}${parsedSpec.basePath || ''}` }));
        }
      } catch (e) {
        // If parsing fails, just use the content as-is
      }

      toast({
        title: "File uploaded successfully",
        description: `Loaded ${file.name}`,
      });
    } catch (error) {
      toast({
        title: "Error uploading file",
        description: "Please check your file format and try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const generateJMeterXml = (spec: any, config: JMeterConfig): string => {
    const timestamp = Date.now();
    
    // Parse base URL to extract domain, port, protocol
    const urlParts = (() => {
      try {
        const url = new URL(config.baseUrl);
        return {
          protocol: url.protocol.replace(':', ''),
          domain: url.hostname,
          port: url.port || (url.protocol === 'https:' ? '443' : '80'),
          path: url.pathname !== '/' ? url.pathname : ''
        };
      } catch {
        return {
          protocol: 'https',
          domain: config.baseUrl.replace(/^https?:\/\//, '').split('/')[0],
          port: '',
          path: ''
        };
      }
    })();

    // Helper function to generate authentication managers
    const generateAuthManagers = (): string => {
      if (!spec.components?.securitySchemes && !spec.securityDefinitions) return '';
      
      const securitySchemes = spec.components?.securitySchemes || spec.securityDefinitions || {};
      let authManagers = '';
      
      for (const [schemeName, scheme] of Object.entries(securitySchemes)) {
        const schemeObj = scheme as any;
        
        if (schemeObj.type === 'apiKey') {
          if (schemeObj.in === 'header') {
            authManagers += `
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="API Key Header Manager - ${schemeName}" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">${schemeObj.name}</stringProp>
              <stringProp name="Header.value">\${API_KEY_${schemeName.toUpperCase()}}</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>
        <hashTree/>`;
          }
        } else if (schemeObj.type === 'http' && schemeObj.scheme === 'bearer') {
          authManagers += `
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="Bearer Token Manager - ${schemeName}" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Authorization</stringProp>
              <stringProp name="Header.value">Bearer \${BEARER_TOKEN}</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>
        <hashTree/>`;
        } else if (schemeObj.type === 'http' && schemeObj.scheme === 'basic') {
          authManagers += `
        <AuthManager guiclass="AuthPanel" testclass="AuthManager" testname="HTTP Authorization Manager - ${schemeName}" enabled="true">
          <collectionProp name="AuthManager.auth_list">
            <elementProp name="" elementType="Authorization">
              <stringProp name="Authorization.url">\${BASE_URL}</stringProp>
              <stringProp name="Authorization.username">\${BASIC_USERNAME}</stringProp>
              <stringProp name="Authorization.password">\${BASIC_PASSWORD}</stringProp>
              <stringProp name="Authorization.domain"></stringProp>
              <stringProp name="Authorization.realm"></stringProp>
            </elementProp>
          </collectionProp>
        </AuthManager>
        <hashTree/>`;
        }
      }
      
      return authManagers;
    };

    // Helper function to generate assertions
    const generateResponseAssertions = (samplerName: string): string => {
      if (!config.addAssertions) return '';
      
      return `
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
        <hashTree/>`;
    };

    // Helper function to generate JSON extractors for correlation
    const generateJsonExtractors = (op: any): string => {
      if (!config.addCorrelation) return '';
      
      const extractors: string[] = [];
      
      // Extract common ID patterns
      const idPatterns = ['id', 'userId', 'orderId', 'productId', 'customerId', 'petId'];
      
      idPatterns.forEach(pattern => {
        extractors.push(`
        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract ${pattern}" enabled="true">
          <stringProp name="JSONPostProcessor.referenceNames">${pattern}</stringProp>
          <stringProp name="JSONPostProcessor.jsonPathExprs">$.${pattern}</stringProp>
          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
          <stringProp name="JSONPostProcessor.defaultValues">NOT_FOUND</stringProp>
        </JSONPostProcessor>
        <hashTree/>`);
      });
      
      return extractors.join('\n');
    };

    // Helper function to generate CSV config
    const generateCsvConfig = (): string => {
      if (!config.generateCsvConfig) return '';
      
      return `
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
        <hashTree/>`;
    };
    
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

    // Helper function to resolve $ref schemas
    const resolveSchema = (schema: any, spec: any): any => {
      if (schema.$ref) {
        const refPath = schema.$ref.replace('#/', '').split('/');
        let resolved = spec;
        for (const segment of refPath) {
          resolved = resolved?.[segment];
        }
        return resolved || {};
      }
      return schema;
    };

    // Helper function to generate request body for POST/PUT/DELETE requests
    const generateRequestBody = (requestBody: any): string => {
      if (!requestBody?.content) return '';
      
      const jsonContent = requestBody.content['application/json'];
      if (!jsonContent?.schema) return '';
      
      // Counter for generating unique IDs
      let idCounter = 1;
      
      // Generate sample JSON based on schema with realistic data
      const generateSampleJson = (schema: any, propertyName?: string): any => {
        // Resolve $ref if present
        const resolvedSchema = resolveSchema(schema, spec);
        
        // Check for example value first
        if (resolvedSchema.example !== undefined) {
          return resolvedSchema.example;
        }
        
        // Check for examples array
        if (resolvedSchema.examples && Array.isArray(resolvedSchema.examples) && resolvedSchema.examples.length > 0) {
          return resolvedSchema.examples[0];
        }
        
        switch (resolvedSchema.type) {
          case 'object':
            const obj: any = {};
            if (resolvedSchema.properties) {
              for (const [key, prop] of Object.entries(resolvedSchema.properties)) {
                obj[key] = generateSampleJson(prop as any, key);
              }
            }
            return obj;
            
          case 'array':
            if (resolvedSchema.items) {
              return [generateSampleJson(resolvedSchema.items)];
            }
            return [];
            
          case 'string':
            // Generate more realistic string values based on property names
            if (propertyName) {
              const lowerName = propertyName.toLowerCase();
              if (lowerName.includes('id')) return String(idCounter++);
              if (lowerName.includes('name')) return `sample${propertyName.charAt(0).toUpperCase() + propertyName.slice(1)}`;
              if (lowerName.includes('email')) return 'sample@example.com';
              if (lowerName.includes('url') || lowerName.includes('link')) return 'https://example.com';
              if (lowerName.includes('phone')) return '+1234567890';
              if (lowerName.includes('address')) return '123 Sample St';
              if (lowerName.includes('city')) return 'Sample City';
              if (lowerName.includes('country')) return 'Sample Country';
              if (lowerName.includes('description') || lowerName.includes('comment')) return 'Sample description';
              if (lowerName.includes('status')) return 'active';
              if (lowerName.includes('type') || lowerName.includes('category')) return 'sample';
            }
            
            // Check enum values
            if (resolvedSchema.enum && resolvedSchema.enum.length > 0) {
              return resolvedSchema.enum[0];
            }
            
            return 'sample';
            
          case 'integer':
            // Generate realistic integers based on property names
            if (propertyName) {
              const lowerName = propertyName.toLowerCase();
              if (lowerName.includes('id')) return idCounter++;
              if (lowerName.includes('count') || lowerName.includes('quantity')) return 5;
              if (lowerName.includes('age')) return 25;
              if (lowerName.includes('year')) return new Date().getFullYear();
              if (lowerName.includes('month')) return Math.floor(Math.random() * 12) + 1;
              if (lowerName.includes('day')) return Math.floor(Math.random() * 28) + 1;
              if (lowerName.includes('price') || lowerName.includes('amount')) return 100;
            }
            
            // Check for minimum/maximum constraints
            if (resolvedSchema.minimum !== undefined) {
              return Math.max(resolvedSchema.minimum, 1);
            }
            if (resolvedSchema.maximum !== undefined) {
              return Math.min(resolvedSchema.maximum, 100);
            }
            
            return 1;
            
          case 'number':
            // Similar logic for numbers but with decimals
            if (propertyName) {
              const lowerName = propertyName.toLowerCase();
              if (lowerName.includes('price') || lowerName.includes('amount') || lowerName.includes('cost')) return 99.99;
              if (lowerName.includes('rate') || lowerName.includes('percentage')) return 0.15;
              if (lowerName.includes('weight')) return 1.5;
              if (lowerName.includes('height')) return 1.75;
            }
            
            if (resolvedSchema.minimum !== undefined) {
              return Math.max(resolvedSchema.minimum, 1.0);
            }
            if (resolvedSchema.maximum !== undefined) {
              return Math.min(resolvedSchema.maximum, 100.0);
            }
            
            return 1.0;
            
          case 'boolean':
            if (propertyName) {
              const lowerName = propertyName.toLowerCase();
              if (lowerName.includes('active') || lowerName.includes('enabled') || lowerName.includes('available')) return true;
              if (lowerName.includes('deleted') || lowerName.includes('disabled') || lowerName.includes('hidden')) return false;
            }
            return true;
            
          default:
            return null;
        }
      };
      
      const sampleData = generateSampleJson(jsonContent.schema);
      return JSON.stringify(sampleData, null, 2);
    };

    // Helper function to generate HTTP sampler for an operation
    const generateHttpSampler = (op: any): string => {
      // Better naming convention: [METHOD] /path → Description
      const operationDescription = op.summary || `${op.method} ${op.path}`;
      const samplerName = `[${op.method}] ${op.path} → ${operationDescription}`;
      const pathWithoutParams = op.path.replace(/{([^}]+)}/g, '${$1}');
      const needsBody = ['POST', 'PUT', 'PATCH'].includes(op.method);
      const requestBody = needsBody ? generateRequestBody(op.requestBody) : '';
      
      // Use parameterized URL instead of hardcoded domain/port
      const bodyDataProp = requestBody ? `
          <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
            <collectionProp name="Arguments.arguments">
              <elementProp name="" elementType="HTTPArgument">
                <boolProp name="HTTPArgument.always_encode">false</boolProp>
                <stringProp name="Argument.value">${requestBody.replace(/"/g, '&quot;')}</stringProp>
                <stringProp name="Argument.metadata">=</stringProp>
              </elementProp>
            </collectionProp>
          </elementProp>` : `
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>`;
      
      const assertions = generateResponseAssertions(samplerName);
      const extractors = generateJsonExtractors(op);
      
      return `
        <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${samplerName}" enabled="true">
          ${bodyDataProp}
          <stringProp name="HTTPSampler.domain">\${__P(domain,${urlParts.domain})}</stringProp>
          <stringProp name="HTTPSampler.port">\${__P(port,${urlParts.port})}</stringProp>
          <stringProp name="HTTPSampler.protocol">\${__P(protocol,${urlParts.protocol})}</stringProp>
          <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
          <stringProp name="HTTPSampler.path">\${BASE_PATH}${pathWithoutParams}</stringProp>
          <stringProp name="HTTPSampler.method">${op.method}</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
          <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
          <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
          <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
          <stringProp name="HTTPSampler.connect_timeout">\${CONNECTION_TIMEOUT}</stringProp>
          <stringProp name="HTTPSampler.response_timeout">\${RESPONSE_TIMEOUT}</stringProp>
        </HTTPSamplerProxy>
        <hashTree>
          ${assertions}
          ${extractors}
        </hashTree>`;
    };

    // Group operations by tags
    const tagGroups = new Map<string, typeof operations>();
    operations.forEach(op => {
      const tag = op.tags?.[0] || 'Default';
      if (!tagGroups.has(tag)) {
        tagGroups.set(tag, []);
      }
      tagGroups.get(tag)!.push(op);
    });

    // Generate Thread Groups for each tag
    const threadGroups = Array.from(tagGroups.entries()).map(([tag, tagOperations]) => {
      const httpSamplers = tagOperations.map(op => generateHttpSampler(op)).join('\n');
      const authManagers = generateAuthManagers();
      const csvConfig = generateCsvConfig();
      
      return `
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${tag} APIs" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">\${__P(loops,${config.loopCount})}</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">\${__P(threads,${config.threadCount})}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">\${__P(rampup,${config.rampUpTime})}</stringProp>
        <boolProp name="ThreadGroup.scheduler">false</boolProp>
        <stringProp name="ThreadGroup.duration"></stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        ${csvConfig}
        
        <ConfigTestElement guiclass="HttpDefaultsGui" testclass="ConfigTestElement" testname="HTTP Request Defaults" enabled="true">
          <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
            <collectionProp name="Arguments.arguments"/>
          </elementProp>
          <stringProp name="HTTPSampler.domain"></stringProp>
          <stringProp name="HTTPSampler.port"></stringProp>
          <stringProp name="HTTPSampler.protocol"></stringProp>
          <stringProp name="HTTPSampler.contentEncoding">UTF-8</stringProp>
          <stringProp name="HTTPSampler.path"></stringProp>
          <stringProp name="HTTPSampler.concurrentPool">6</stringProp>
          <stringProp name="HTTPSampler.connect_timeout">\${CONNECTION_TIMEOUT}</stringProp>
          <stringProp name="HTTPSampler.response_timeout">\${RESPONSE_TIMEOUT}</stringProp>
        </ConfigTestElement>
        <hashTree/>
        
        ${authManagers}
        
        <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager - ${tag}" enabled="true">
          <collectionProp name="HeaderManager.headers">
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Content-Type</stringProp>
              <stringProp name="Header.value">application/json</stringProp>
            </elementProp>
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">Accept</stringProp>
              <stringProp name="Header.value">application/json</stringProp>
            </elementProp>
            <elementProp name="" elementType="Header">
              <stringProp name="Header.name">User-Agent</stringProp>
              <stringProp name="Header.value">JMeter Performance Test - ${tag}</stringProp>
            </elementProp>
          </collectionProp>
        </HeaderManager>
        <hashTree/>

        ${httpSamplers}

        <ResultCollector guiclass="ViewResultsFullVisualizer" testclass="ResultCollector" testname="View Results Tree - ${tag}" enabled="true">
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
        
        <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report - ${tag}" enabled="true">
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
        
        <ResultCollector guiclass="AggregateReport" testclass="ResultCollector" testname="Aggregate Report - ${tag}" enabled="true">
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
      </hashTree>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${config.testPlanName}" enabled="true">
      <stringProp name="TestPlan.comments">Generated from OpenAPI/Swagger specification
Generated on: ${new Date(timestamp).toISOString()}
Swagger Version: ${spec.openapi || spec.swagger || 'Unknown'}
Base URL: ${config.baseUrl}
Grouping Strategy: ${config.groupingStrategy}
Assertions: ${config.addAssertions ? 'Enabled' : 'Disabled'}
Correlation: ${config.addCorrelation ? 'Enabled' : 'Disabled'}
CSV Config: ${config.generateCsvConfig ? 'Enabled' : 'Disabled'}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="BASE_URL" elementType="Argument">
            <stringProp name="Argument.name">BASE_URL</stringProp>
            <stringProp name="Argument.value">${config.baseUrl}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="BASE_PATH" elementType="Argument">
            <stringProp name="Argument.name">BASE_PATH</stringProp>
            <stringProp name="Argument.value">${urlParts.path}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="CONNECTION_TIMEOUT" elementType="Argument">
            <stringProp name="Argument.name">CONNECTION_TIMEOUT</stringProp>
            <stringProp name="Argument.value">60000</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="RESPONSE_TIMEOUT" elementType="Argument">
            <stringProp name="Argument.name">RESPONSE_TIMEOUT</stringProp>
            <stringProp name="Argument.value">60000</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="BEARER_TOKEN" elementType="Argument">
            <stringProp name="Argument.name">BEARER_TOKEN</stringProp>
            <stringProp name="Argument.value">your_bearer_token_here</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="BASIC_USERNAME" elementType="Argument">
            <stringProp name="Argument.name">BASIC_USERNAME</stringProp>
            <stringProp name="Argument.value">your_username_here</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="BASIC_PASSWORD" elementType="Argument">
            <stringProp name="Argument.name">BASIC_PASSWORD</stringProp>
            <stringProp name="Argument.value">your_password_here</stringProp>
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

  const handleGenerateJMeter = async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "No Swagger specification",
        description: "Please upload a Swagger/OpenAPI file first.",
        variant: "destructive",
      });
      return;
    }

    if (!config.baseUrl.trim()) {
      toast({
        title: "Missing base URL",
        description: "Please enter a valid base URL for the API.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // Parse swagger/openapi spec
      let spec;
      try {
        spec = JSON.parse(swaggerContent);
      } catch {
        try {
          spec = yaml.load(swaggerContent);
        } catch (yamlError) {
          throw new Error("Invalid JSON or YAML format");
        }
      }

      // Basic validation
      if (!spec || typeof spec !== 'object') {
        throw new Error("Invalid specification format");
      }
      
      if (!spec.openapi && !spec.swagger) {
        throw new Error("Not a valid OpenAPI/Swagger specification");
      }
      
      if (!spec.paths || typeof spec.paths !== 'object') {
        throw new Error("No paths found in the specification");
      }
      
      // Call AI-powered JMeter generator
      const { data, error } = await supabase.functions.invoke('ai-jmeter-generator', {
        body: {
          swaggerSpec: spec,
          loadConfig: config,
          aiProvider
        }
      });

      if (error) throw error;

      setJmeterXml(data.jmeterXml);

      toast({
        title: "AI-Generated JMeter Test Plan Ready",
        description: `Created with ${data.metadata.provider} for ${data.metadata.endpoints} endpoints`,
      });
    } catch (error) {
      console.error('Error generating JMeter file:', error);
      toast({
        title: "Error generating JMeter file",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
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
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Swagger to JMeter Converter
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload your OpenAPI/Swagger specification to generate a ready-to-execute JMeter test plan
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Test Configuration
            </CardTitle>
            <CardDescription>
              Configure your JMeter test parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="testPlanName">Test Plan Name</Label>
              <Input
                id="testPlanName"
                value={config.testPlanName}
                onChange={(e) => setConfig(prev => ({ ...prev, testPlanName: e.target.value }))}
                placeholder="API Performance Test"
              />
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="threadCount">Thread Count (Virtual Users)</Label>
                <Input
                  id="threadCount"
                  type="number"
                  min="1"
                  max="1000"
                  value={config.threadCount}
                  onChange={(e) => setConfig(prev => ({ ...prev, threadCount: parseInt(e.target.value) || 1 }))}
                />
              </div>
              
              <div>
                <Label htmlFor="rampUpTime">Ramp-up Time (s)</Label>
                <Input
                  id="rampUpTime"
                  type="number"
                  min="1"
                  value={config.rampUpTime}
                  onChange={(e) => setConfig(prev => ({ ...prev, rampUpTime: parseInt(e.target.value) || 1 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="duration">Test Duration (seconds)</Label>
                <Input
                  id="duration"
                  type="number"
                  min="1"
                  value={config.duration}
                  onChange={(e) => setConfig(prev => ({ ...prev, duration: parseInt(e.target.value) || 1 }))}
                />
              </div>
              
              <div>
                <Label htmlFor="loopCount">Loop Count</Label>
                <Input
                  id="loopCount"
                  type="number"
                  min="1"
                  value={config.loopCount}
                  onChange={(e) => setConfig(prev => ({ ...prev, loopCount: parseInt(e.target.value) || 1 }))}
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
                    value={config.responseTimeThreshold}
                    onChange={(e) => setConfig(prev => ({ ...prev, responseTimeThreshold: parseInt(e.target.value) || 1000 }))}
                    min="100"
                  />
                </div>
                <div>
                  <Label htmlFor="throughputThreshold">Throughput (req/sec)</Label>
                  <Input
                    id="throughputThreshold"
                    type="number"
                    value={config.throughputThreshold}
                    onChange={(e) => setConfig(prev => ({ ...prev, throughputThreshold: parseInt(e.target.value) || 1 }))}
                    min="1"
                  />
                </div>
                <div>
                  <Label htmlFor="errorRateThreshold">Error Rate (%)</Label>
                  <Input
                    id="errorRateThreshold"
                    type="number"
                    value={config.errorRateThreshold}
                    onChange={(e) => setConfig(prev => ({ ...prev, errorRateThreshold: parseInt(e.target.value) || 1 }))}
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
                    value={config.connectionTimeout}
                    onChange={(e) => setConfig(prev => ({ ...prev, connectionTimeout: parseInt(e.target.value) || 1000 }))}
                    min="1000"
                  />
                </div>
                <div>
                  <Label htmlFor="responseTimeout">Response Timeout (ms)</Label>
                  <Input
                    id="responseTimeout"
                    type="number"
                    value={config.responseTimeout}
                    onChange={(e) => setConfig(prev => ({ ...prev, responseTimeout: parseInt(e.target.value) || 1000 }))}
                    min="1000"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="groupingStrategy">Grouping Strategy</Label>
                <Select 
                  value={config.groupingStrategy} 
                  onValueChange={(value: 'thread-groups' | 'simple-controllers') => 
                    setConfig(prev => ({ ...prev, groupingStrategy: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select grouping strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thread-groups">Thread Groups per Tag (Recommended)</SelectItem>
                    <SelectItem value="simple-controllers">Simple Controllers per Tag</SelectItem>
                  </SelectContent>
                </Select>
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
              
              <h4 className="text-sm font-medium">JMeter Configuration</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="addAssertions"
                    checked={config.addAssertions}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, addAssertions: checked }))}
                  />
                  <Label htmlFor="addAssertions">Add Response Assertions</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="addCorrelation"
                    checked={config.addCorrelation}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, addCorrelation: checked }))}
                  />
                  <Label htmlFor="addCorrelation">Enable Dynamic Correlation</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="generateCsvConfig"
                    checked={config.generateCsvConfig}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, generateCsvConfig: checked }))}
                  />
                  <Label htmlFor="generateCsvConfig">Generate CSV Data Config</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="followRedirects"
                    checked={config.followRedirects}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, followRedirects: checked }))}
                  />
                  <Label htmlFor="followRedirects">Follow Redirects</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="useKeepAlive"
                    checked={config.useKeepAlive}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, useKeepAlive: checked }))}
                  />
                  <Label htmlFor="useKeepAlive">Use Keep-Alive</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enableReporting"
                    checked={config.enableReporting}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enableReporting: checked }))}
                  />
                  <Label htmlFor="enableReporting">Detailed Reporting</Label>
                </div>
              </div>

              <Button 
                onClick={handleGenerateJMeter}
                disabled={!swaggerContent.trim() || isProcessing}
                size="lg"
                className="w-full"
              >
                <Zap className="mr-2 h-4 w-4" />
                {isProcessing ? "Generating with AI..." : "Generate JMX"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Upload Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Swagger/OpenAPI
            </CardTitle>
            <CardDescription>
              Upload your API specification file (JSON or YAML format)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="swaggerFile">Choose File</Label>
              <Input
                id="swaggerFile"
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileUpload}
                className="cursor-pointer"
              />
            </div>
            
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-4">
                Or paste your specification directly:
              </p>
              <Textarea
                placeholder="Paste your OpenAPI/Swagger specification here..."
                value={swaggerContent}
                onChange={(e) => setSwaggerContent(e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-4 justify-center">        
        {jmeterXml && (
          <Button 
            onClick={handleDownload}
            variant="gradient"
            size="lg"
            className="min-w-[200px]"
          >
            <Download className="mr-2 h-4 w-4" />
            Download JMX File
          </Button>
        )}
      </div>

      {/* Preview */}
      {jmeterXml && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Generated JMeter XML Preview
            </CardTitle>
            <CardDescription>
              Preview of the generated JMX file content
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={jmeterXml}
              readOnly
              rows={20}
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};