import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const googleAIApiKey = Deno.env.get('GOOGLE_AI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadConfig {
  testPlanName: string;
  threadCount: number;
  rampUpTime: number;
  duration: number;
  loopCount: number;
  addAssertions: boolean;
  addCorrelation: boolean;
  addCsvConfig: boolean;
  baseUrl?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { swaggerSpec, loadConfig, aiProvider = 'google' } = await req.json();
    
    console.log('Processing Swagger spec with AI-powered JMeter generation...');
    console.log('AI Provider:', aiProvider);
    console.log('Load Config:', loadConfig);

    // Validate inputs
    if (!swaggerSpec || !swaggerSpec.paths) {
      throw new Error("Invalid Swagger specification - no paths found");
    }

    // Check API key availability
    if (aiProvider === 'google' && !googleAIApiKey) {
      throw new Error("Google AI API key not configured");
    }
    if (aiProvider === 'openai' && !openAIApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    // Extract API information for AI analysis
    const apiInfo = {
      title: swaggerSpec.info?.title || 'API',
      version: swaggerSpec.info?.version || '1.0',
      description: swaggerSpec.info?.description || '',
      baseUrl: loadConfig?.baseUrl || swaggerSpec.servers?.[0]?.url || 'https://api.example.com',
      endpoints: Object.keys(swaggerSpec.paths).length,
      methods: []
    };

    // Collect all HTTP methods and endpoints
    Object.entries(swaggerSpec.paths).forEach(([path, pathItem]: [string, any]) => {
      Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          apiInfo.methods.push({
            method: method.toUpperCase(),
            path,
            summary: operation.summary || '',
            tags: operation.tags || []
          });
        }
      });
    });

    console.log(`Found ${apiInfo.methods.length} API endpoints to analyze`);

    // Generate JMX generation prompt using user's exact specification
    const jmxPrompt = `You are an expert in JMeter test plan generation.  
Your task is to create a complete Apache JMeter (.jmx) file based on the provided Swagger (OpenAPI) specification.  

### Requirements:  
1. Parse the Swagger file to identify:  
   - All endpoints (paths + methods)  
   - Request parameters (path, query, headers)  
   - Request bodies (schemas, fields, data types)  
   - Authentication requirements  

2. Create a JMeter Test Plan (.jmx) with the following:  
   - Thread Group with configurable threads, ramp-up, and loop count.  
   - HTTP Request Samplers for every endpoint in Swagger.  
   - Group Samplers by API tag or path for better readability.  
   - Add \`HTTP Header Manager\` with required headers such as \`Content-Type: application/json\`, \`Authorization\`, etc.  
   - Add \`CSV Data Set Config\` to parameterize dynamic values like user IDs, emails, or tokens.  
   - For request bodies, insert variables (e.g., \`\${variableName}\`) instead of hardcoded values.  
   - Add realistic sample test data for variables based on Swagger schema (strings, numbers, booleans, arrays).  

3. Enhancements:  
   - Automatically handle path parameters with variables.  
   - Insert default test data where the Swagger schema does not provide examples.  
   - Add \`JSON Extractor\` or \`Regular Expression Extractor\` for correlation of response values (e.g., auth token).  
   - Ensure the JMX is well-formed XML and can be directly opened in JMeter without errors.  

### Output:  
- Provide the final JMX file content as valid XML inside code block.  
- Do not summarize, only return the JMX file.  
- Ensure all nodes (\`TestPlan\`, \`ThreadGroup\`, \`HTTPSamplerProxy\`, etc.) follow correct JMeter XML structure.  

### Input:  
Swagger/OpenAPI specification (YAML or JSON format) will be provided.  

### Task:  
Generate the complete JMX file according to the above rules.

### Swagger/OpenAPI specification:
${JSON.stringify(swaggerSpec, null, 2)}`;

    let jmeterXmlFromAI = "";

    // Call AI provider to generate JMeter XML
    if (aiProvider === 'google' && googleAIApiKey) {
      console.log('Calling Google AI Studio for JMX generation...');
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleAIApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: jmxPrompt
              }]
            }]
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Google AI API error:', errorText);
          throw new Error(`Google AI API error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Google AI Response received');
        
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const aiText = data.candidates[0].content.parts[0].text;
          // Extract XML content from code blocks if present
          const xmlMatch = aiText.match(/```(?:xml)?\s*([\s\S]*?)\s*```/) || aiText.match(/<\?xml[\s\S]*<\/jmeterTestPlan>/);
          if (xmlMatch) {
            jmeterXmlFromAI = xmlMatch[1] || xmlMatch[0];
          } else {
            jmeterXmlFromAI = aiText;
          }
        }
      } catch (error) {
        console.error('Google AI API call failed:', error);
        // Continue with fallback
      }
    } else if (aiProvider === 'openai' && openAIApiKey) {
      console.log('Calling OpenAI for JMX generation...');
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openAIApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-5-2025-08-07',
            messages: [
              { role: 'system', content: 'You are an expert JMeter test plan generator. Generate only valid JMeter XML files based on OpenAPI/Swagger specifications.' },
              { role: 'user', content: jmxPrompt }
            ],
            max_completion_tokens: 8000,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('OpenAI API error:', errorText);
          throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('OpenAI Response received');
        
        const aiText = data.choices[0].message.content;
        // Extract XML content from code blocks if present
        const xmlMatch = aiText.match(/```(?:xml)?\s*([\s\S]*?)\s*```/) || aiText.match(/<\?xml[\s\S]*<\/jmeterTestPlan>/);
        if (xmlMatch) {
          jmeterXmlFromAI = xmlMatch[1] || xmlMatch[0];
        } else {
          jmeterXmlFromAI = aiText;
        }
      } catch (error) {
        console.error('OpenAI API call failed:', error);
        // Continue with fallback
      }
    }

    // Use AI-generated JMeter XML if available, otherwise use fallback generation
    let finalJmeterXml: string;
    
    if (jmeterXmlFromAI && jmeterXmlFromAI.includes('<jmeterTestPlan')) {
      console.log('Using AI-generated JMeter XML');
      finalJmeterXml = enhanceJMeterXML(jmeterXmlFromAI, loadConfig);
    } else {
      console.log('Using fallback JMeter XML generation');
      // Fallback: generate basic JMeter XML locally
      finalJmeterXml = generateJMeterXML(swaggerSpec, loadConfig, { 
        scenarios: [{ name: "API Load Test", description: "Basic load test for all endpoints", priority: "high" }],
        bottlenecks: ["Response time", "Throughput", "Error rate"],
        assertions: [{ type: "responseTime", threshold: 5000 }, { type: "statusCode", values: [200, 201, 202, 204] }],
        strategy: "Gradual load increase with monitoring",
        correlations: ["token", "sessionId"]
      });
    }

    console.log('JMeter XML finalized successfully');

    return new Response(JSON.stringify({
      success: true,
      jmeterXml: finalJmeterXml,
      metadata: {
        provider: aiProvider === 'google' ? 'Google AI Studio' : 'OpenAI',
        endpoints: apiInfo.methods.length,
        generatedByAI: jmeterXmlFromAI && jmeterXmlFromAI.includes('<jmeterTestPlan'),
        testPlanName: loadConfig.testPlanName
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-jmeter-generator function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateJMeterXML(swaggerSpec: any, loadConfig: LoadConfig, aiAnalysis: any): string {
  const escapeXml = (text: string) => text.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case "'": return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });

  // Extract base URL info
  const baseUrl = loadConfig.baseUrl || swaggerSpec.servers?.[0]?.url || 'https://api.example.com';
  let urlParts;
  try {
    const url = new URL(baseUrl);
    urlParts = {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
      path: url.pathname
    };
  } catch {
    urlParts = { protocol: 'https', host: 'api.example.com', port: '443', path: '' };
  }

  // Group endpoints by tags
  const endpointGroups: { [key: string]: any[] } = {};
  
  Object.entries(swaggerSpec.paths || {}).forEach(([path, pathItem]: [string, any]) => {
    Object.entries(pathItem).forEach(([method, operation]: [string, any]) => {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
        const tag = operation.tags?.[0] || 'Default';
        if (!endpointGroups[tag]) endpointGroups[tag] = [];
        endpointGroups[tag].push({ path, method: method.toUpperCase(), operation });
      }
    });
  });

  // Generate HTTP samplers
  const generateHTTPSampler = (endpoint: any): string => {
    const { path, method, operation } = endpoint;
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
    
    return `
      <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escapeXml(method + ' ' + path)}" enabled="true">
        <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" enabled="true">
          <collectionProp name="Arguments.arguments"/>
        </elementProp>
        <stringProp name="HTTPSampler.domain">\${HOST}</stringProp>
        <stringProp name="HTTPSampler.port">\${PORT}</stringProp>
        <stringProp name="HTTPSampler.protocol">\${PROTOCOL}</stringProp>
        <stringProp name="HTTPSampler.contentEncoding"></stringProp>
        <stringProp name="HTTPSampler.path">${escapeXml(path)}</stringProp>
        <stringProp name="HTTPSampler.method">${method}</stringProp>
        <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
        <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
        <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
        <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
        ${hasBody ? `<boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
        <elementProp name="HTTPsampler.Arguments" elementType="Arguments">
          <collectionProp name="Arguments.arguments">
            <elementProp name="" elementType="HTTPArgument">
              <boolProp name="HTTPArgument.always_encode">false</boolProp>
              <stringProp name="Argument.value">{"sample": "data"}</stringProp>
              <stringProp name="Argument.metadata">=</stringProp>
            </elementProp>
          </collectionProp>
        </elementProp>` : ''}
      </HTTPSamplerProxy>
      <hashTree>
        ${loadConfig.addAssertions ? `
        <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Status Code Assertion" enabled="true">
          <collectionProp name="Asserion.test_strings">
            ${aiAnalysis.assertions?.find((a: any) => a.type === 'statusCode')?.values?.map((code: number) => 
              `<stringProp name="${code}">${code}</stringProp>`).join('') || 
              '<stringProp name="200">200</stringProp><stringProp name="201">201</stringProp>'}
          </collectionProp>
          <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
          <boolProp name="Assertion.assume_success">false</boolProp>
          <intProp name="Assertion.test_type">33</intProp>
        </ResponseAssertion>
        <hashTree/>
        <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="Response Time Assertion" enabled="true">
          <stringProp name="DurationAssertion.duration">${aiAnalysis.assertions?.find((a: any) => a.type === 'responseTime')?.threshold || 5000}</stringProp>
        </DurationAssertion>
        <hashTree/>` : ''}
        ${loadConfig.addCorrelation && aiAnalysis.correlations?.length > 0 ? `
        <JSONPostProcessor guiclass="JSONPostProcessorGui" testclass="JSONPostProcessor" testname="JSON Extractor" enabled="true">
          <stringProp name="JSONPostProcessor.referenceNames">${aiAnalysis.correlations[0]}</stringProp>
          <stringProp name="JSONPostProcessor.jsonPathExprs">$..${aiAnalysis.correlations[0]}</stringProp>
          <stringProp name="JSONPostProcessor.match_numbers">1</stringProp>
          <stringProp name="JSONPostProcessor.defaultValues">default_value</stringProp>
        </JSONPostProcessor>
        <hashTree/>` : ''}
      </hashTree>`;
  };

  // Generate thread groups
  let threadGroups = '';
  Object.entries(endpointGroups).forEach(([groupName, endpoints]) => {
    const samplers = endpoints.map(endpoint => generateHTTPSampler(endpoint)).join('');
    
    threadGroups += `
      <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${escapeXml(groupName)} Tests" enabled="true">
        <stringProp name="ThreadGroup.on_sample_error">continue</stringProp>
        <elementProp name="ThreadGroup.main_controller" elementType="LoopController" guiclass="LoopControlPanel" testclass="LoopController" testname="Loop Controller" enabled="true">
          <boolProp name="LoopController.continue_forever">false</boolProp>
          <stringProp name="LoopController.loops">${loadConfig.loopCount}</stringProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">${loadConfig.threadCount}</stringProp>
        <stringProp name="ThreadGroup.ramp_time">${loadConfig.rampUpTime}</stringProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">${loadConfig.duration}</stringProp>
        <stringProp name="ThreadGroup.delay"></stringProp>
        <boolProp name="ThreadGroup.same_user_on_next_iteration">true</boolProp>
      </ThreadGroup>
      <hashTree>
        ${loadConfig.addCsvConfig ? `
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
        <hashTree/>` : ''}
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
        <hashTree/>
        ${samplers}
      </hashTree>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${escapeXml(loadConfig.testPlanName)}" enabled="true">
      <stringProp name="TestPlan.comments">AI-Generated JMeter Test Plan - Created on ${new Date().toISOString()}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="PROTOCOL" elementType="Argument">
            <stringProp name="Argument.name">PROTOCOL</stringProp>
            <stringProp name="Argument.value">${urlParts.protocol}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="HOST" elementType="Argument">
            <stringProp name="Argument.name">HOST</stringProp>
            <stringProp name="Argument.value">${urlParts.host}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
          <elementProp name="PORT" elementType="Argument">
            <stringProp name="Argument.name">PORT</stringProp>
            <stringProp name="Argument.value">${urlParts.port}</stringProp>
            <stringProp name="Argument.metadata">=</stringProp>
          </elementProp>
        </collectionProp>
      </elementProp>
      <stringProp name="TestPlan.user_define_classpath"></stringProp>
    </TestPlan>
    <hashTree>
      ${threadGroups}
      
      <!-- Listeners -->
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
}

// Function to enhance AI-generated JMX with missing essential elements
function enhanceJMeterXML(aiGeneratedXml: string, loadConfig: LoadConfig): string {
  let enhancedXml = aiGeneratedXml;
  
  // Check and add missing listeners if not present
  if (!enhancedXml.includes('SummaryReport')) {
    console.log('Adding missing Summary Report listener');
    const summaryReport = `
      <!-- Summary Report -->
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
      <hashTree/>`;
    
    enhancedXml = enhancedXml.replace(
      '</hashTree>\n</jmeterTestPlan>',
      summaryReport + '\n    </hashTree>\n  </hashTree>\n</jmeterTestPlan>'
    );
  }

  if (!enhancedXml.includes('ViewResultsFullVisualizer')) {
    console.log('Adding missing View Results Tree listener');
    const viewResultsTree = `
      <!-- View Results Tree -->
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
            <responseData>true</responseData>
            <samplerData>true</samplerData>
            <xml>false</xml>
            <fieldNames>true</fieldNames>
            <responseHeaders>true</responseHeaders>
            <requestHeaders>true</requestHeaders>
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
      <hashTree/>`;
    
    enhancedXml = enhancedXml.replace(
      '</hashTree>\n</jmeterTestPlan>',
      viewResultsTree + '\n    </hashTree>\n  </hashTree>\n</jmeterTestPlan>'
    );
  }

  // Check and enhance HTTP samplers to ensure they have proper body data
  if (loadConfig.addCsvConfig && !enhancedXml.includes('CSVDataSet')) {
    console.log('Adding missing CSV Data Set Config');
    const csvConfig = `
        <CSVDataSet guiclass="TestBeanGUI" testclass="CSVDataSet" testname="CSV Data Set Config" enabled="true">
          <stringProp name="delimiter">,</stringProp>
          <stringProp name="fileEncoding">UTF-8</stringProp>
          <stringProp name="filename">test_data.csv</stringProp>
          <boolProp name="ignoreFirstLine">true</boolProp>
          <boolProp name="quotedData">false</boolProp>
          <boolProp name="recycle">true</boolProp>
          <stringProp name="shareMode">shareMode.all</stringProp>
          <boolProp name="stopThread">false</boolProp>
          <stringProp name="variableNames">userId,userEmail,authToken,testData</stringProp>
        </CSVDataSet>
        <hashTree/>`;
    
    // Add CSV config after thread group opening
    enhancedXml = enhancedXml.replace(
      /<ThreadGroup[^>]*>\s*<hashTree>/g,
      (match) => match + csvConfig
    );
  }

  return enhancedXml;
}