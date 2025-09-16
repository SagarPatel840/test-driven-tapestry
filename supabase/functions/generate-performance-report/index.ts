import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY');
const azureApiKey = Deno.env.get('AZURE_OPENAI_API_KEY');
const azureEndpoint = Deno.env.get('AZURE_OPENAI_ENDPOINT');
const azureDeployment = Deno.env.get('AZURE_OPENAI_DEPLOYMENT_NAME');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper function to generate multiple report formats
function generateMultipleFormats(reportContent: string, reportName: string) {
  // Convert Markdown to HTML with professional styling
  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportName}</title>
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
        h4 { color: #1f2937; font-size: 1.2em; margin-top: 20px; margin-bottom: 10px; font-weight: 600; }
        p { margin-bottom: 15px; }
        ul, ol { margin-bottom: 20px; }
        li { margin-bottom: 8px; }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 25px 0;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        th, td { 
            padding: 15px; 
            text-align: left; 
            border-bottom: 1px solid #e5e7eb;
        }
        th { 
            background: linear-gradient(135deg, #2563eb, #3b82f6);
            color: white; 
            font-weight: 600;
            font-size: 1.05em;
        }
        tr:nth-child(even) { background-color: #f8fafc; }
        tr:hover { background-color: #e0f2fe; }
        code { 
            background: #f1f5f9; 
            padding: 3px 6px; 
            border-radius: 4px; 
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        pre { 
            background: #1e293b; 
            color: #e2e8f0;
            padding: 20px; 
            border-radius: 8px; 
            overflow-x: auto;
            margin: 20px 0;
        }
        .metric-badge {
            display: inline-block;
            background: linear-gradient(135deg, #10b981, #34d399);
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: 600;
            margin: 2px;
        }
        .critical { background: linear-gradient(135deg, #dc2626, #ef4444); }
        .warning { background: linear-gradient(135deg, #d97706, #f59e0b); }
        .success { background: linear-gradient(135deg, #059669, #10b981); }
        .info { background: linear-gradient(135deg, #2563eb, #3b82f6); }
        .section {
            margin: 30px 0;
            padding: 25px;
            border-radius: 8px;
            background: #f8fafc;
            border-left: 5px solid #2563eb;
        }
        .footer {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 0.9em;
        }
        @media print {
            body { background: white; }
            .container { box-shadow: none; padding: 20px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${reportName}</h1>
            <div class="generated-date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
        </div>
        ${markdownToHtml(reportContent)}
        <div class="footer">
            <p><strong>Performance Testing Report</strong> | Confidential Document</p>
            <p>Generated by Advanced Performance Testing Suite</p>
        </div>
    </div>
</body>
</html>`;

  // Generate Word document content (RTF format for compatibility)
  const wordContent = generateWordDocument(reportContent, reportName);

  return {
    html: htmlContent,
    word: wordContent,
    markdown: reportContent
  };
}

// Simple Markdown to HTML converter
function markdownToHtml(markdown: string): string {
  let html = markdown
    // Headers
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    // Bold and Italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Lists
    .replace(/^\- (.*$)/gim, '<li>$1</li>')
    .replace(/^(\d+)\. (.*$)/gim, '<li>$1. $2</li>')
    // Line breaks
    .replace(/\n/g, '<br>');

  // Wrap consecutive list items in ul tags
  html = html.replace(/(<li>.*?<\/li>)(<br>)*/g, (match, li) => {
    return li;
  });

  // Handle tables (basic support)
  const lines = html.split('<br>');
  let inTable = false;
  let tableHtml = '';
  const processedLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('|') && line.split('|').length > 2) {
      if (!inTable) {
        inTable = true;
        tableHtml = '<table>';
        const cells = line.split('|').filter(cell => cell.trim() !== '');
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<th>${cell.trim()}</th>`;
        });
        tableHtml += '</tr>';
      } else {
        const cells = line.split('|').filter(cell => cell.trim() !== '');
        if (!line.includes('---')) {
          tableHtml += '<tr>';
          cells.forEach(cell => {
            tableHtml += `<td>${cell.trim()}</td>`;
          });
          tableHtml += '</tr>';
        }
      }
    } else {
      if (inTable) {
        tableHtml += '</table>';
        processedLines.push(tableHtml);
        tableHtml = '';
        inTable = false;
      }
      if (line) {
        processedLines.push(line);
      }
    }
  }

  if (inTable) {
    tableHtml += '</table>';
    processedLines.push(tableHtml);
  }

  return processedLines.join('<br>').replace(/(<br>)+/g, '<br>');
}

// Generate Word document in RTF format
function generateWordDocument(content: string, reportName: string): string {
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // Convert markdown to RTF
  let rtfContent = content
    .replace(/^# (.*$)/gim, '\\par\\b\\fs32 $1\\b0\\fs24\\par')
    .replace(/^## (.*$)/gim, '\\par\\b\\fs28 $2\\b0\\fs24\\par')
    .replace(/^### (.*$)/gim, '\\par\\b\\fs26 $1\\b0\\fs24\\par')
    .replace(/\*\*(.*?)\*\*/g, '\\b $1\\b0')
    .replace(/\*(.*?)\*/g, '\\i $1\\i0')
    .replace(/^\- (.*$)/gim, '\\par\\bullet $1')
    .replace(/\n/g, '\\par');

  return `{\\rtf1\\ansi\\deff0 {\\fonttbl {\\f0 Times New Roman;}}
\\f0\\fs24
\\par\\qc\\b\\fs36 ${reportName}\\b0\\fs24
\\par\\qc Generated on: ${date}
\\par\\par
${rtfContent}
\\par\\par
\\qc\\i Generated by Advanced Performance Testing Suite\\i0
}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { csvFiles, reportName, aiProvider, projectId } = await req.json();

    if (!csvFiles || !Array.isArray(csvFiles) || csvFiles.length === 0) {
      throw new Error('CSV files are required');
    }

    if (!reportName || !aiProvider || !projectId) {
      throw new Error('Report name, AI provider, and project ID are required');
    }

    console.log(`Generating performance report using ${aiProvider}`);

    // Get user from auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Prepare the comprehensive analysis prompt for Senior QA level
    const analysisPrompt = `You are acting as a Senior Performance Test Engineer with 10+ years of experience in enterprise performance testing.
I will provide you with multiple CSV files containing performance test results from different runs or scenarios.

Your expert analysis must be COMPREHENSIVE and DETAILED, following industry best practices for performance testing analysis.

**ANALYSIS REQUIREMENTS:**
1. Perform deep statistical analysis of all CSV files collectively
2. Identify performance baselines, trends, and statistical significance
3. Calculate key metrics: response time percentiles (50th, 90th, 95th, 99th), throughput (TPS/RPS), error rates, resource utilization
4. Detect performance regressions, improvements, and anomalies using statistical methods
5. Provide root cause analysis for performance bottlenecks
6. Compare against industry benchmarks and SLA requirements
7. Generate actionable recommendations with priority levels

**CRITICAL FORMATTING REQUIREMENTS:**
- Use professional markdown formatting with clear hierarchy
- Present data in comparative tables with statistical analysis
- Include performance trend indicators and variance analysis
- Use emoji symbols for visual clarity: ✅ improvements, ❌ issues, ⚠️ warnings, 📊 metrics, 🔍 insights, 🎯 targets
- Maintain executive-level professionalism for C-suite presentation

**REQUIRED REPORT STRUCTURE:**

# Performance Test Analysis Report

## Executive Summary
[Provide 3-4 bullet points summarizing critical findings, overall system health, and business impact]

## Test Environment & Configuration
[Analyze test setup from CSV data - load patterns, user counts, duration]

## Performance Metrics Dashboard

### Response Time Analysis
| Metric | Run 1 | Run 2 | Run 3 | Baseline | Status | Variance |
|--------|-------|-------|-------|----------|--------|----------|
[Create detailed comparison table with statistical analysis]

### Throughput Analysis  
| Endpoint/Transaction | TPS/RPS | Peak Load | Capacity | Trend | Notes |
|---------------------|---------|-----------|----------|-------|-------|
[Detailed throughput breakdown with capacity planning insights]

### Error Rate Analysis
| Error Type | Frequency | % of Total | Impact | Root Cause | Action Required |
|------------|-----------|------------|--------|------------|-----------------|
[Comprehensive error analysis with business impact assessment]

## Statistical Analysis & Trends
### Performance Trend Analysis
📊 **Key Observations:**
- [Detailed trend analysis with statistical significance]
- [Performance degradation or improvement patterns]
- [Seasonal/time-based variations if applicable]

### Load Testing Results by Scenario
[Analyze different load scenarios - baseline, stress, spike, volume tests]

## Bottleneck Identification & Root Cause Analysis

### Critical Performance Issues ❌
1. **[Issue Name]** - Impact Level: HIGH/MEDIUM/LOW
   - **Symptoms:** [Detailed description]
   - **Root Cause:** [Technical analysis]
   - **Business Impact:** [Revenue/user experience impact]
   - **Recommended Action:** [Specific technical solution]
   - **Priority:** P0/P1/P2 with timeline

### Performance Bottlenecks ⚠️
[Detailed analysis of system bottlenecks - database, network, application, infrastructure]

### Resource Utilization Analysis
[CPU, Memory, Disk I/O, Network analysis if data available]

## Comparative Analysis Across Test Runs

### Performance Improvements ✅
- [Quantified improvements with percentage changes]
- [Performance optimization validation results]

### Performance Regressions ❌  
- [Detailed regression analysis with impact assessment]
- [Comparison against previous benchmarks]

### Stability Analysis
🔍 **System Stability Metrics:**
- Error rate consistency across test duration
- Response time variance and standard deviation
- System recovery patterns after peak load

## Capacity Planning & Scalability Assessment

### Current Capacity Analysis
📊 **Current System Limits:**
- Maximum sustainable load: [X] TPS/concurrent users
- Breaking point: [Y] TPS/concurrent users  
- Scalability bottlenecks: [Detailed analysis]

### Future Capacity Requirements
🎯 **Capacity Planning Recommendations:**
- Projected load growth accommodation
- Infrastructure scaling requirements
- Performance optimization ROI analysis

## Compliance & SLA Analysis
[Compare results against defined SLAs and performance requirements]

## Risk Assessment & Mitigation
### High Risk Areas ⚠️
[Identify areas of concern for production deployment]

### Mitigation Strategies
[Specific technical and operational recommendations]

## Detailed Recommendations & Action Plan

### Immediate Actions (P0 - Within 1 week)
1. [Specific action item with owner and timeline]
2. [Critical performance fix requirements]

### Short-term Improvements (P1 - Within 1 month)  
1. [Performance optimization recommendations]
2. [Infrastructure scaling requirements]

### Long-term Strategy (P2 - 3-6 months)
1. [Architectural improvements]
2. [Performance monitoring and alerting enhancements]
3. [Capacity planning implementation]

### Performance Testing Strategy Enhancement
[Recommendations for improving future testing approaches]

## Appendix: Technical Details
### Test Data Quality Assessment
[Analysis of CSV data completeness and reliability]

### Statistical Methods Used
[Brief description of analytical methods applied]

## Conclusion & Sign-off
[Final assessment with executive summary for stakeholder communication]

---
**Report Prepared By:** Senior Performance Test Engineer  
**Review Date:** [Current Date]  
**Next Review:** [Recommended follow-up timeline]

**IMPORTANT:** Ensure ALL recommendations include:
- Specific technical actions
- Business impact quantification  
- Implementation timelines
- Success criteria and KPIs
- Risk assessment for each recommendation

Write this report as if presenting to both CTO/Engineering VP and business stakeholders. Include specific numbers, percentages, and quantitative analysis throughout.

Here are the CSV file contents for analysis:

${csvFiles.map((file: any, index: number) => `
=== CSV File ${index + 1}: ${file.name} ===
File Size: ${file.size || 'Unknown'} bytes
Content:
${file.content}
`).join('\n')}`;

    let reportContent = '';

    if (aiProvider === 'gemini') {
      if (!googleApiKey) {
        throw new Error('Google AI API key not configured');
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${googleApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: analysisPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 4000,
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API error:', errorText);

        try {
          const errorData = JSON.parse(errorText);
          const err: any = new Error(
            errorData.error?.message || `Gemini API error: ${response.status}`
          );
          err.status = errorData.error?.code || response.status;
          if (errorData.error?.details) err.details = errorData.error.details;
          throw err;
        } catch (_) {
          const err: any = new Error(`Gemini API error: ${response.status} - ${errorText}`);
          err.status = response.status;
          throw err;
        }
      }

      const data = await response.json();
      reportContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Failed to generate report';

    } else if (aiProvider === 'azure-openai') {
      if (!azureApiKey || !azureEndpoint || !azureDeployment) {
        throw new Error('Azure OpenAI configuration not complete');
      }

      const response = await fetch(`${azureEndpoint}/openai/deployments/${azureDeployment}/chat/completions?api-version=2024-08-01-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': azureApiKey,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a Senior Performance Testing Expert. Analyze the provided performance test data and generate comprehensive reports.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          max_tokens: 4000,
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Azure OpenAI API error:', errorText);
        const err: any = new Error(`Azure OpenAI API error: ${response.status}`);
        err.status = response.status;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.error?.message) err.message = `Azure OpenAI API error: ${parsed.error.message}`;
        } catch (_) {
          // ignore parse error
        }
        throw err;
      }

      const data = await response.json();
      reportContent = data.choices?.[0]?.message?.content || 'Failed to generate report';
    } else {
      throw new Error('Invalid AI provider specified');
    }

    // Generate multiple formats
    const formats = generateMultipleFormats(reportContent, reportName);

    // Save the report to database
    const { data: report, error: insertError } = await supabase
      .from('performance_reports')
      .insert({
        project_id: projectId,
        created_by: user.id,
        report_name: reportName,
        ai_provider: aiProvider,
        report_content: reportContent,
        csv_files_metadata: csvFiles.map((file: any) => ({
          name: file.name,
          size: file.size || 0,
          uploaded_at: new Date().toISOString()
        }))
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw new Error('Failed to save report to database');
    }

    return new Response(JSON.stringify({
      success: true,
      report: {
        id: report.id,
        name: report.report_name,
        content: report.report_content,
        aiProvider: report.ai_provider,
        createdAt: report.created_at,
        formats: formats
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in generate-performance-report function:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return new Response(JSON.stringify({ 
      success: false, 
      error: error?.message || 'Unexpected error',
      status
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});