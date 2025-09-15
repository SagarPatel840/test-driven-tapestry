import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LoadConfig {
  threadCount: number;
  rampUpTime: number;
  duration: number;
  loopCount: number;
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    headers: Array<{ name: string; value: string }>;
  };
  time: number;
  startedDateTime: string;
}

interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { harContent, loadConfig, testPlanName = "HAR Performance Test", aiProvider = 'openai' } = await req.json();
    
    console.log('Processing HAR file with OpenAI...');
    
    // Parse HAR content
    const harData: HarFile = typeof harContent === 'string' ? JSON.parse(harContent) : harContent;
    const entries = harData.log.entries;
    
    console.log(`Found ${entries.length} HTTP requests in HAR file`);
    
    // Analyze HAR with OpenAI to get intelligent insights
    const analysisPrompt = `
    Analyze the following HAR file data and provide intelligent insights for performance testing:
    
    Number of requests: ${entries.length}
    Sample requests: ${JSON.stringify(entries.slice(0, 5).map(e => ({
      method: e.request.method,
      url: e.request.url,
      status: e.response.status,
      contentType: e.request.headers.find(h => h.name.toLowerCase() === 'content-type')?.value
    })), null, 2)}
    
    Please provide:
    1. Identify authentication tokens, session IDs, and dynamic values that need correlation
    2. Suggest logical groupings for requests (login, browse, checkout, etc.)
    3. Recommend parameterization opportunities
    4. Identify critical performance scenarios
    5. Suggest appropriate assertions beyond status codes
    
    Respond in JSON format:
    {
      "correlationFields": ["token", "sessionId", "csrfToken"],
      "requestGroups": [{"name": "Login", "pattern": "/login"}, {"name": "API", "pattern": "/api/"}],
      "parameterization": [{"field": "userId", "description": "User ID for different users"}],
      "scenarios": [{"name": "Login Storm", "description": "High concurrent login attempts"}],
      "assertions": [{"type": "responseTime", "threshold": 2000}, {"type": "contentType", "value": "application/json"}]
    }
    `;

    let aiAnalysisResponse;
    
    if (aiProvider === 'google') {
      const googleAIApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
      if (!googleAIApiKey) {
        throw new Error("Google AI API key not configured");
      }
      
      aiAnalysisResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleAIApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: analysisPrompt
            }]
          }]
        }),
      });
    } else {
      // OpenAI (default)
      if (!openAIApiKey) {
        throw new Error("OpenAI API key not configured");
      }
      
      aiAnalysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: aiProvider === 'openai' ? 'gpt-5-2025-08-07' : 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are an expert performance testing engineer. Analyze HAR files and provide intelligent insights for JMeter test creation.' },
            { role: 'user', content: analysisPrompt }
          ],
          max_completion_tokens: 2000,
        }),
      });
    }

    let analysis: any = {};
    try {
      if (!aiAnalysisResponse.ok) {
        const errorText = await aiAnalysisResponse.text();
        console.error(`${aiProvider} API error:`, errorText);
        throw new Error(`${aiProvider} API error: ${aiAnalysisResponse.statusText}`);
      }

      const analysisData = await aiAnalysisResponse.json();
      console.log(`${aiProvider} Analysis Response:`, analysisData);
      
      if (aiProvider === 'google') {
        if (analysisData.candidates?.[0]?.content?.parts?.[0]?.text) {
          const aiText = analysisData.candidates[0].content.parts[0].text;
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          }
        }
      } else {
        // OpenAI
        if (analysisData.choices?.[0]?.message?.content) {
          const aiText = analysisData.choices[0].message.content;
          const jsonMatch = aiText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          } else {
            analysis = JSON.parse(aiText);
          }
        }
      }
    } catch (error) {
      console.error(`Error parsing ${aiProvider} analysis:`, error);
      // Fallback to basic analysis
      analysis = {
        correlationFields: ["JSESSIONID", "token", "csrf"],
        requestGroups: [{ name: "All Requests", pattern: ".*" }],
        parameterization: [],
        scenarios: [{ name: "Load Test", description: "Basic load test scenario" }],
        assertions: [{ type: "responseCode", values: [200, 201, 202] }]
      };
    }

    // Generate JMeter XML
    const jmxContent = generateJMeterXML(entries, loadConfig, testPlanName, analysis);
    
    console.log('JMeter XML generated successfully');
    
    return new Response(JSON.stringify({ 
      jmxContent,
      analysis,
      summary: {
        totalRequests: entries.length,
        uniqueDomains: [...new Set(entries.map(e => new URL(e.request.url).hostname))],
        methodsUsed: [...new Set(entries.map(e => e.request.method))],
        avgResponseTime: entries.reduce((sum, e) => sum + e.time, 0) / entries.length
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in har-to-jmeter function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function generateJMeterXML(entries: HarEntry[], loadConfig: LoadConfig, testPlanName: string, analysis: any): string {
  const timestamp = Date.now();
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

  // Group requests by analysis or default grouping
  const requestGroups: { [key: string]: HarEntry[] } = {};
  
  entries.forEach(entry => {
    let groupName = 'Default';
    if (analysis.requestGroups) {
      for (const group of analysis.requestGroups) {
        if (entry.request.url.includes(group.pattern) || new RegExp(group.pattern).test(entry.request.url)) {
          groupName = group.name;
          break;
        }
      }
    }
    
    if (!requestGroups[groupName]) {
      requestGroups[groupName] = [];
    }
    requestGroups[groupName].push(entry);
  });

  // Generate HTTP samplers for each request
  const generateHTTPSampler = (entry: HarEntry, index: number): string => {
    const url = new URL(entry.request.url);
    const headers = entry.request.headers.filter(h => 
      !['host', 'content-length', 'connection'].includes(h.name.toLowerCase())
    );
    
    const postData = entry.request.postData?.text || '';
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(entry.request.method) && postData;
    
    return `
      <HTTPSamplerProxy guiclass="HttpTestSampleGui" testclass="HTTPSamplerProxy" testname="${escapeXml(entry.request.method + ' ' + url.pathname)}" enabled="true">
        <elementProp name="HTTPsampler.Arguments" elementType="Arguments" guiclass="HTTPArgumentsPanel" testclass="Arguments" enabled="true">
          <collectionProp name="Arguments.arguments">
            ${entry.request.queryString.map(param => `
            <elementProp name="${escapeXml(param.name)}" elementType="HTTPArgument">
              <boolProp name="HTTPArgument.always_encode">false</boolProp>
              <stringProp name="Argument.value">${escapeXml(param.value)}</stringProp>
              <stringProp name="Argument.metadata">=</stringProp>
              <boolProp name="HTTPArgument.use_equals">true</boolProp>
              <stringProp name="Argument.name">${escapeXml(param.name)}</stringProp>
            </elementProp>
            `).join('')}
          </collectionProp>
        </elementProp>
        <stringProp name="HTTPSampler.domain">${escapeXml(url.hostname)}</stringProp>
        <stringProp name="HTTPSampler.port">${url.port || (url.protocol === 'https:' ? '443' : '80')}</stringProp>
        <stringProp name="HTTPSampler.protocol">${url.protocol.replace(':', '')}</stringProp>
        <stringProp name="HTTPSampler.contentEncoding"></stringProp>
        <stringProp name="HTTPSampler.path">${escapeXml(url.pathname)}</stringProp>
        <stringProp name="HTTPSampler.method">${entry.request.method}</stringProp>
        <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
        <boolProp name="HTTPSampler.auto_redirects">false</boolProp>
        <boolProp name="HTTPSampler.use_keepalive">true</boolProp>
        <boolProp name="HTTPSampler.DO_MULTIPART_POST">false</boolProp>
        <stringProp name="HTTPSampler.embedded_url_re"></stringProp>
        <stringProp name="HTTPSampler.connect_timeout"></stringProp>
        <stringProp name="HTTPSampler.response_timeout"></stringProp>
        ${hasBody ? `
        <boolProp name="HTTPSampler.postBodyRaw">true</boolProp>
        <elementProp name="HTTPsampler.postBodyRaw" elementType="Arguments">
          <collectionProp name="Arguments.arguments">
            <elementProp name="" elementType="HTTPArgument">
              <boolProp name="HTTPArgument.always_encode">false</boolProp>
              <stringProp name="Argument.value">${escapeXml(postData)}</stringProp>
              <stringProp name="Argument.metadata">=</stringProp>
            </elementProp>
          </collectionProp>
        </elementProp>
        ` : ''}
      </HTTPSamplerProxy>
      
      ${headers.length > 0 ? `
      <HeaderManager guiclass="HeaderPanel" testclass="HeaderManager" testname="HTTP Header Manager" enabled="true">
        <collectionProp name="HeaderManager.headers">
          ${headers.map(header => `
          <elementProp name="" elementType="Header">
            <stringProp name="Header.name">${escapeXml(header.name)}</stringProp>
            <stringProp name="Header.value">${escapeXml(header.value)}</stringProp>
          </elementProp>
          `).join('')}
        </collectionProp>
      </HeaderManager>
      ` : ''}
      
      <!-- Response Code Assertions -->
      <ResponseAssertion guiclass="AssertionGui" testclass="ResponseAssertion" testname="Response Code Assertion" enabled="true">
        <collectionProp name="Asserion.test_strings">
          <stringProp name="49586">200</stringProp>
          <stringProp name="49587">201</stringProp>
          <stringProp name="49588">202</stringProp>
        </collectionProp>
        <stringProp name="Assertion.custom_message"></stringProp>
        <stringProp name="Assertion.test_field">Assertion.response_code</stringProp>
        <boolProp name="Assertion.assume_success">false</boolProp>
        <intProp name="Assertion.test_type">8</intProp>
      </ResponseAssertion>
      
      <!-- Response Time Assertion -->
      <DurationAssertion guiclass="DurationAssertionGui" testclass="DurationAssertion" testname="Duration Assertion" enabled="true">
        <stringProp name="DurationAssertion.duration">5000</stringProp>
      </DurationAssertion>
      
      <!-- JSON Extractor for correlation -->
      ${analysis.correlationFields && analysis.correlationFields.length > 0 ? `
      <com.atlantbh.jmeter.plugins.jsonutils.jsonpathextractor.JSONPathExtractor guiclass="com.atlantbh.jmeter.plugins.jsonutils.jsonpathextractor.gui.JSONPathExtractorGui" testclass="com.atlantbh.jmeter.plugins.jsonutils.jsonpathextractor.JSONPathExtractor" testname="JSON Extractor" enabled="true">
        <stringProp name="JSONPATH">$..token</stringProp>
        <stringProp name="VAR">authToken</stringProp>
        <stringProp name="DEFAULT">NOT_FOUND</stringProp>
        <stringProp name="VARIABLE">authToken</stringProp>
        <stringProp name="SUBJECT">BODY</stringProp>
      </com.atlantbh.jmeter.plugins.jsonutils.jsonpathextractor.JSONPathExtractor>
      ` : ''}
    `;
  };

  // Generate Thread Groups for each request group
  const threadGroups = Object.entries(requestGroups).map(([groupName, groupEntries]) => `
    <ThreadGroup guiclass="ThreadGroupGui" testclass="ThreadGroup" testname="${escapeXml(groupName)} Thread Group" enabled="true">
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
      
      <!-- Cookie Manager -->
      <CookieManager guiclass="CookiePanel" testclass="CookieManager" testname="HTTP Cookie Manager" enabled="true">
        <collectionProp name="CookieManager.cookies"/>
        <boolProp name="CookieManager.clearEachIteration">false</boolProp>
        <boolProp name="CookieManager.controlledByThreadGroup">false</boolProp>
      </CookieManager>
      
      <!-- HTTP Cache Manager -->
      <CacheManager guiclass="CacheManagerGui" testclass="CacheManager" testname="HTTP Cache Manager" enabled="true">
        <boolProp name="clearEachIteration">true</boolProp>
        <boolProp name="useExpires">true</boolProp>
        <boolProp name="CacheManager.controlledByThread">false</boolProp>
      </CacheManager>
      
      ${groupEntries.map((entry, index) => generateHTTPSampler(entry, index)).join('\n')}
    </ThreadGroup>
  `).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan version="1.2" properties="5.0" jmeter="5.4.1">
  <hashTree>
    <TestPlan guiclass="TestPlanGui" testclass="TestPlan" testname="${escapeXml(testPlanName)}" enabled="true">
      <stringProp name="TestPlan.comments">Generated from HAR file using AI analysis on ${new Date().toISOString()}</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.tearDown_on_shutdown">true</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.arguments" elementType="Arguments" guiclass="ArgumentsPanel" testclass="Arguments" testname="User Defined Variables" enabled="true">
        <collectionProp name="Arguments.arguments">
          <elementProp name="BASE_URL" elementType="Argument">
            <stringProp name="Argument.name">BASE_URL</stringProp>
            <stringProp name="Argument.value">${entries.length > 0 ? new URL(entries[0].request.url).origin : 'https://example.com'}</stringProp>
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
            <saveAssertionResultsFailureMessage>true</saveAssertionResultsMessage>
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
    </hashTree>
  </hashTree>
</jmeterTestPlan>`;
}