import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AzureDevOpsWorkItem {
  id: number;
  fields: {
    'System.Title': string;
    'System.Description'?: string;
    'System.WorkItemType': string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'System.State': string;
    'Microsoft.VSTS.Common.AcceptanceCriteria'?: string;
  };
}

serve(async (req) => {
  console.log('Azure DevOps integration function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const body = await req.json();
    console.log('Request body:', body);

    const { organizationUrl, projectName, personalAccessToken } = body;

    // Input validation
    if (!organizationUrl || !projectName || !personalAccessToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: organizationUrl, projectName, and personalAccessToken are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate URL format
    try {
      new URL(organizationUrl);
    } catch {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid organization URL format' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate input lengths (security measure)
    if (organizationUrl.length > 200 || projectName.length > 100 || personalAccessToken.length > 200) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Input values exceed maximum allowed length' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Construct Azure DevOps API URL for work items using WIQL
    const baseUrl = organizationUrl.endsWith('/') ? organizationUrl.slice(0, -1) : organizationUrl;
    const wiqlUrl = `${baseUrl}/_apis/wit/wiql?api-version=7.1`;

    console.log('Fetching from Azure DevOps WIQL API:', wiqlUrl);

    // Prepare authentication
    const authToken = btoa(`:${personalAccessToken}`);

    // WIQL query to get User Stories and Features for the specific project
    const wiqlQuery = {
      query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${projectName}' AND ([System.WorkItemType] = 'User Story' OR [System.WorkItemType] = 'Feature') ORDER BY [System.CreatedDate] DESC`
    };

    // First, get work item IDs using WIQL
    const wiqlResponse = await fetch(wiqlUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(wiqlQuery),
    });

    console.log('Azure DevOps WIQL response status:', wiqlResponse.status);

    if (!wiqlResponse.ok) {
      const errorText = await wiqlResponse.text();
      console.error('Azure DevOps WIQL error:', errorText);
      
      // Check if response is HTML (authentication failure usually returns HTML)
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        throw new Error('Authentication failed or invalid URL. Please check your Personal Access Token and organization URL.');
      }
      
      if (wiqlResponse.status === 401) {
        throw new Error('Authentication failed. Please check your Personal Access Token.');
      } else if (wiqlResponse.status === 404) {
        throw new Error('Project not found. Please check your organization URL and project name.');
      } else {
        throw new Error(`Azure DevOps WIQL API error: ${wiqlResponse.status} ${wiqlResponse.statusText}`);
      }
    }

    let wiqlData;
    try {
      const responseText = await wiqlResponse.text();
      console.log('WIQL response text (first 200 chars):', responseText.substring(0, 200));
      
      // Check if response is HTML
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
      }
      
      wiqlData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse WIQL response:', parseError);
      throw new Error('Invalid response from Azure DevOps API. Please check your credentials and URL.');
    }

    console.log('WIQL response:', { workItemCount: wiqlData.workItems?.length || 0 });

    if (!wiqlData.workItems || wiqlData.workItems.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          stories: [],
          message: 'No User Stories or Features found in the specified project'
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get work item IDs
    const workItemIds = wiqlData.workItems.map((item: any) => item.id);
    const idsParam = workItemIds.join(',');
    
    // Now get the full work item details
    const workItemsUrl = `${baseUrl}/_apis/wit/workitems?ids=${idsParam}&$expand=Fields&api-version=7.1`;
    console.log('Fetching work item details:', workItemsUrl);

    const response = await fetch(workItemsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    console.log('Azure DevOps work items response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure DevOps work items error:', errorText);
      
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html')) {
        throw new Error('Authentication failed or invalid URL. Please check your credentials.');
      }
      
      throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText}`);
    }

    let data;
    try {
      const responseText = await response.text();
      console.log('Work items response text (first 200 chars):', responseText.substring(0, 200));
      
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        throw new Error('Received HTML response instead of JSON. Check authentication and URL.');
      }
      
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse work items response:', parseError);
      throw new Error('Invalid response from Azure DevOps API. Please check your credentials and URL.');
    }

    console.log('Azure DevOps API response:', { count: data.count, hasValue: !!data.value });

    // Transform work items to user stories format
    const userStories = data.value?.map((workItem: AzureDevOpsWorkItem) => ({
      id: workItem.id.toString(),
      title: workItem.fields['System.Title'] || 'Untitled',
      description: workItem.fields['System.Description'] || 'No description available',
      acceptanceCriteria: workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
      priority: workItem.fields['Microsoft.VSTS.Common.Priority'] ? 
        workItem.fields['Microsoft.VSTS.Common.Priority'] === 1 ? 'high' :
        workItem.fields['Microsoft.VSTS.Common.Priority'] === 2 ? 'medium' :
        workItem.fields['Microsoft.VSTS.Common.Priority'] === 3 ? 'low' : 'medium'
        : 'medium',
      status: workItem.fields['System.State']?.toLowerCase() || 'new',
      issueType: workItem.fields['System.WorkItemType'] || 'User Story',
      azureDevOpsId: workItem.id,
      source: 'azure-devops'
    })) || [];

    console.log('Transformed user stories:', { count: userStories.length });

    return new Response(
      JSON.stringify({
        success: true,
        stories: userStories,
        message: `Successfully fetched ${userStories.length} user stories from Azure DevOps`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Azure DevOps integration error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred while connecting to Azure DevOps'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});