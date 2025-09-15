import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string;
    issuetype: {
      name: string;
    };
    priority: {
      name: string;
    };
    status: {
      name: string;
    };
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { jiraUrl, email, apiToken, projectKey } = body;

    // Input validation
    if (!jiraUrl || !email || !apiToken || !projectKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: jiraUrl, email, apiToken, projectKey' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate URL format
    try {
      const url = new URL(jiraUrl);
      if (!url.protocol.startsWith('http')) {
        throw new Error('Invalid URL protocol');
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid Jira URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate input lengths
    if (jiraUrl.length > 500 || email.length > 100 || apiToken.length > 500 || projectKey.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Input parameters exceed maximum length' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanitize projectKey for JQL query
    const sanitizedProjectKey = projectKey.replace(/[^a-zA-Z0-9_-]/g, '');

    console.log(`Fetching Jira issues from project: ${projectKey}`);

    const auth = btoa(`${email}:${apiToken}`);
    const jiraApiUrl = `${jiraUrl}/rest/api/3/search?jql=project=${sanitizedProjectKey}&fields=summary,description,issuetype,priority,status&maxResults=50`;

    const response = await fetch(jiraApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Jira API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Jira API error: ${response.status}`,
          details: errorText 
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const issues: JiraIssue[] = data.issues || [];

    // Transform Jira issues to user stories format
    const userStories = issues.map((issue: JiraIssue) => ({
      id: issue.key,
      title: issue.fields.summary,
      description: issue.fields.description || 'No description provided',
      priority: issue.fields.priority?.name || 'Medium',
      status: issue.fields.status?.name || 'To Do',
      source: 'Jira',
      issueType: issue.fields.issuetype?.name || 'Story',
      jiraKey: issue.key
    }));

    console.log(`Successfully fetched ${userStories.length} issues from Jira`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stories: userStories,
        totalCount: data.total || userStories.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in jira-integration function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch Jira issues',
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});