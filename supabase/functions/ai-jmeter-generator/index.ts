import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { swaggerSpec, loadConfig, aiProvider = 'google' } = await req.json();
    
    if (!swaggerSpec) {
      throw new Error('Swagger specification is required');
    }

    console.log(`🚀 Starting AI-driven JMeter generation with ${aiProvider}`);
    console.log(`📋 Load config:`, JSON.stringify(loadConfig, null, 2));

    // Analyze the Swagger spec with AI
    const analysis = await analyzeSwaggerWithAI(swaggerSpec, aiProvider);
    console.log(`🧠 AI Analysis completed:`, JSON.stringify(analysis, null, 2));

    // Generate enhanced JMeter XML with AI insights
    const jmeterXml = generateEnhancedJMeterXml(swaggerSpec, loadConfig, analysis);
    
    console.log(`✅ Enhanced JMeter XML generated successfully`);

    return new Response(JSON.stringify({
      success: true,
      jmeterXml,
      analysis,
      metadata: {
        provider: aiProvider === 'google' ? 'Google AI Studio' : 'Azure OpenAI',
        totalEndpoints: Object.keys(swaggerSpec.paths || {}).length,
        threadGroups: analysis.recommendedThreadGroups?.length || 1
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Error in AI JMeter generator:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error occurred',
      details: error.toString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function analyzeSwaggerWithAI(swaggerSpec: any, aiProvider: string) {
  const prompt = `
Analyze this Swagger/OpenAPI specification for performance testing and provide intelligent insights:

${JSON.stringify(swaggerSpec, null, 2)}

Please provide a JSON response with the following structure:
{
  "recommendedThreadGroups": [
    {
      "name": "string",
      "endpoints": ["array of endpoint paths"],
      "recommendedThreads": "number",
      "rampUpTime": "number",
      "rationale": "string explaining why this grouping"
    }
  ],
  "parameterization": [
    {
      "parameter": "string",
      "description": "string", 
      "sampleValues": ["array"],
      "strategy": "csv|random|sequential"
    }
  ],
  "correlationFields": [
    {
      "field": "string",
      "extractFrom": "response_body|header",
      "useIn": ["array of endpoints"],
      "jsonPath": "string"
    }
  ],
  "performanceAssertions": [
    {
      "type": "response_time|throughput|error_rate",
      "threshold": "number",
      "description": "string"
    }
  ],
  "loadScenarios": [
    {
      "name": "string",
      "description": "string",
      "pattern": "constant|ramp_up|spike|stress",
      "duration": "number (seconds)",
      "users": "number"
    }
  ],
  "securityConsiderations": [
    {
      "endpoint": "string",
      "concern": "string",
      "recommendation": "string"
    }
  ]
}

Focus on:
1. Logical grouping of endpoints based on business functions
2. Realistic parameterization strategies
3. Response correlation opportunities
4. Performance expectations based on operation types
5. Load testing scenarios that make business sense
`;

  if (aiProvider === 'google') {
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
    if (!googleApiKey) {
      throw new Error('Google AI API key not configured');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Google AI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    try {
      return JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
    } catch {
      // Fallback analysis if AI parsing fails
      return generateFallbackAnalysis(swaggerSpec);
    }

  } else {
    // Azure OpenAI
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a performance testing expert. Analyze Swagger specs and provide JSON responses only.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 4000,
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';
    
    try {
      return JSON.parse(aiResponse.replace(/```json\n?|\n?```/g, ''));
    } catch {
      return generateFallbackAnalysis(swaggerSpec);
    }
  }
}

function generateFallbackAnalysis(swaggerSpec: any) {
  const endpoints = Object.keys(swaggerSpec.paths || {});
  
  return {
    recommendedThreadGroups: [{
      name: "Default API Group",
      endpoints: endpoints,
      recommendedThreads: 10,
      rampUpTime: 60,
      rationale: "Default grouping for all endpoints"
    }],
    parameterization: [{
      parameter: "userId",
      description: "User identifier for testing",
      sampleValues: ["1", "2", "3", "4", "5"],
      strategy: "csv"
    }],
    correlationFields: [{
      field: "id",
      extractFrom: "response_body",
      useIn: endpoints,
      jsonPath: "$.id"
    }],
    performanceAssertions: [{
      type: "response_time",
      threshold: 2000,
      description: "Response time should be under 2 seconds"
    }],
    loadScenarios: [{
      name: "Normal Load",
      description: "Standard user load simulation",
      pattern: "ramp_up",
      duration: 300,
      users: 10
    }],
    securityConsiderations: []
  };
}

function generateEnhancedJMeterXml(swaggerSpec: any, loadConfig: any, analysis: any): string {
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

  const baseUrlInfo = parseBaseUrl(loadConfig.baseUrl || swaggerSpec.servers?.[0]?.url || 'https://api.example.com');

  // Generate CSV configurations based on AI analysis
  const generateCsvConfigs = () => {
    if (!analysis.parameterization || analysis.parameterization.length === 0) return '';
    
    return analysis.parameterization.map((param: any) => `
      <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="${param.parameter} CSV Config" enabled="true">
        <stringProp name="delimiter">,</stringProp>
        <stringProp name="fileEncoding">UTF-8</stringProp>
        <stringProp name="filename">${param.parameter}_data.csv</stringProp>
        <boolProp name="ignoreFirstLine">true</boolProp>
        <boolProp name="quotedData">false</boolProp>
        <boolProp name="recycle">true</boolProp>
        <stringProp name="shareMode">shareMode.all</stringProp>
        <boolProp name="stopThread">false</boolProp>
        <stringProp name="variableNames">${param.parameter}</stringProp>
      </CSVDataSet>
      <hashTree/>`).join('\n');
  };

  // Generate correlation extractors based on AI analysis
  const generateCorrelationExtractors = () => {
    if (!analysis.correlationFields || analysis.correlationFields.length === 0) return '';
    
    return analysis.correlationFields.map((field: any) => `
      <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="Extract ${field.field}" enabled="true">
        <stringProp name="JSONPostProcessor.referenceNames">${field.field}</stringProp>
        <stringProp name="JSONPostProcessor.jsonPathExprs">${field.jsonPath}</stringProp>
        <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
        <stringProp name="JSONPostProcessor.defaultValues">default_${field.field}</stringProp>
      </JSONPostProcessor>
      <hashTree/>`).join('\n');
  };

  // Generate performance assertions based on AI analysis
  const generatePerformanceAssertions = () => {
    if (!analysis.performanceAssertions || analysis.performanceAssertions.length === 0) return '';
    
    return analysis.performanceAssertions.map((assertion: any) => {
      if (assertion.type === 'response_time') {
        return `
          <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="Response Time Assertion" enabled="true">
            <stringProp name="DurationAssertion.duration">${assertion.threshold}</stringProp>
          </DurationAssertion>
          <hashTree/>`;
      } else {
        return `
          <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status Code Assertion" enabled="true">
            <collectionProp name="Asserion.test_strings">
              <stringProp name="49586">200</stringProp>
              <stringProp name="49587">201</stringProp>
              <stringProp name="49588">202</stringProp>
              <stringProp name="49589">204</stringProp>
            </collectionProp>
            <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
            <boolProp name="Assertion.assume_success">false</boolProp>
            <intProp name="Assertion.test_type">33</intProp>
          </ResponseAssertion>
          <hashTree/>`;
      }
    }).join('\n');
  };

  // Generate HTTP samplers for each endpoint
  const generateHttpSamplers = (endpoints: string[]) => {
    return endpoints.map(path => {
      const pathItem = swaggerSpec.paths[path];
      const methods = Object.keys(pathItem).filter(m => ['get', 'post', 'put', 'delete', 'patch'].includes(m));
      
      return methods.map(method => {
        const operation = pathItem[method];
        const requestBody = operation.requestBody?.content?.['application/json']?.schema 
          ? generateSampleData(operation.requestBody.content['application/json'].schema)
          : '';

        const hasBody = ['post', 'put', 'patch'].includes(method) && requestBody;

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
            ${generatePerformanceAssertions()}
            ${generateCorrelationExtractors()}
          </hashTree>`;
      }).join('\n');
    }).join('\n');
  };

  // Generate thread groups based on AI recommendations
  const generateThreadGroups = () => {
    if (!analysis.recommendedThreadGroups || analysis.recommendedThreadGroups.length === 0) {
      // Fallback to single thread group
      const allEndpoints = Object.keys(swaggerSpec.paths || {});
      return `
        <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="Default Tests" enabled="true">
          <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
          <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
            <boolProp name="LoopController.continue_forever">false</boolProp>
            <stringProp name="LoopController.loops">${loadConfig.loopCount || 1}</stringProp>
          </elementProp>
          <stringProp name="ThreadGroup.num_threads">${loadConfig.threadCount || 10}</stringProp>
          <stringProp name="ThreadGroup.ramp_time">${loadConfig.rampUpTime || 60}</stringProp>
          <boolProp name="ThreadGroup.scheduler">true</boolProp>
          <stringProp name="ThreadGroup.duration">${loadConfig.duration || 300}</stringProp>
          <stringProp name="ThreadGroup.delay">0</stringProp>
          <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
        </ThreadGroup>
        <hashTree>
          ${generateCsvConfigs()}
          ${generateHttpSamplers(allEndpoints)}
        </hashTree>`;
    }

    return analysis.recommendedThreadGroups.map((group: any) => `
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${group.name}" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">${loadConfig.loopCount || 1}</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${group.recommendedThreads || loadConfig.threadCount || 10}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${group.rampUpTime || loadConfig.rampUpTime || 60}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${loadConfig.duration || 300}</stringProp>
        <stringProp name="ThreadGroup.delay">0</stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        ${generateCsvConfigs()}
        ${generateHttpSamplers(group.endpoints)}
      </hashTree>`).join('\n');
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.6">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${loadConfig.testPlanName || 'AI-Enhanced Performance Test'}" enabled="true">
      <stringProp name="TestPlan.comments">AI-Enhanced JMeter Test Plan generated from OpenAPI/Swagger specification</stringProp>
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
    </TestPlan>
    <hashTree>
      ${generateThreadGroups()}
      
      <!-- Enhanced Listeners -->
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
      
      <ResultCollector guiclass="SummaryReport" testclass="ResultCollector" testname="Summary Report" enabled="true">
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
}

function generateSampleData(schema: any): string {
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
}