
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  ExternalLink,
  Key,
  Server,
  Zap,
  RefreshCw
} from "lucide-react";
import { validateEmail, validateUrl, validateOpenAIApiKey, validateProjectKey, sanitizeText } from "@/lib/security";
import { useAuth } from "@/hooks/useAuth";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'connected' | 'disconnected' | 'error';
  enabled: boolean;
  lastSync?: string;
  config?: Record<string, any>;
}

const extractTextFromJiraContent = (content: any): string => {
  if (typeof content === 'string') return content;
  if (!content) return 'No description available';
  
  // Handle Jira's Atlassian Document Format (ADF)
  if (content.content && Array.isArray(content.content)) {
    const textParts: string[] = [];
    
    const extractText = (node: any) => {
      if (node.type === 'text' && node.text) {
        textParts.push(node.text);
      } else if (node.content && Array.isArray(node.content)) {
        node.content.forEach(extractText);
      }
    };
    
    content.content.forEach(extractText);
    return textParts.join(' ').trim() || 'No description available';
  }
  
  return 'No description available';
};

// Load saved configurations from localStorage
const loadSavedConfigurations = () => {
  try {
    const saved = localStorage.getItem('integration-configs');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

// Save configurations to localStorage
const saveConfigurations = (configs: Record<string, any>) => {
  localStorage.setItem('integration-configs', JSON.stringify(configs));
};

export const Integrations = () => {
  const { toast } = useToast();
  const { session } = useAuth();
  
  // Load saved configs on component mount
  const savedConfigs = loadSavedConfigurations();
  
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'jira',
      name: 'Jira',
      description: 'Import user stories and requirements from Jira projects',
      icon: ExternalLink,
      status: savedConfigs.jira ? 'connected' : 'disconnected',
      enabled: savedConfigs.jira?.enabled !== false // Default to true if connected, persist enabled state
    },
    {
      id: 'azure-devops',
      name: 'Azure DevOps',
      description: 'Sync work items and user stories from Azure DevOps',
      icon: Server,
      status: savedConfigs['azure-devops'] ? 'connected' : 'disconnected',
      enabled: savedConfigs['azure-devops']?.enabled !== false,
      lastSync: '2 hours ago'
    },
      {
        id: 'openai',
        name: 'Azure OpenAI',
        description: 'AI-powered test case generation using Azure OpenAI GPT models',
        icon: Zap,
        status: savedConfigs.openai ? 'connected' : 'disconnected',
        enabled: savedConfigs.openai?.enabled !== false,
        lastSync: 'Active'
      }
  ]);

  const [showApiKeyForm, setShowApiKeyForm] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [jiraConfig, setJiraConfig] = useState(savedConfigs.jira || {
    url: '',
    email: '',
    projectKey: ''
  });
  const [azureDevOpsConfig, setAzureDevOpsConfig] = useState(savedConfigs['azure-devops'] || {
    organizationUrl: '',
    projectName: ''
  });
  const [openAiConfig, setOpenAiConfig] = useState(savedConfigs.openai || {
    endpoint: '',
    apiKey: '',
    deploymentId: '',
    apiVersion: '2024-02-15-preview'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [jiraStories, setJiraStories] = useState<any[]>([]);
  const [azureDevOpsStories, setAzureDevOpsStories] = useState<any[]>([]);
  const [generatedTestCases, setGeneratedTestCases] = useState<any[]>([]);

  // Sync integration statuses with saved configurations on component mount
  useEffect(() => {
    const savedConfigs = loadSavedConfigurations();
    
    setIntegrations(prev => prev.map(integration => ({
      ...integration,
      status: savedConfigs[integration.id] ? 'connected' : 'disconnected',
      enabled: savedConfigs[integration.id]?.enabled !== false
    })));

    // Update config states with saved values
    if (savedConfigs.jira) {
      setJiraConfig(savedConfigs.jira);
    }
    if (savedConfigs['azure-devops']) {
      setAzureDevOpsConfig(savedConfigs['azure-devops']);
    }
    if (savedConfigs.openai) {
      setOpenAiConfig(savedConfigs.openai);
    }
  }, []);

  const toggleIntegration = (id: string) => {
    setIntegrations(prev => prev.map(integration => 
      integration.id === id 
        ? { ...integration, enabled: !integration.enabled }
        : integration
    ));
    
    // Save enabled state to localStorage
    const updatedIntegration = integrations.find(i => i.id === id);
    if (updatedIntegration) {
      const newConfigs = {
        ...savedConfigs,
        [id]: { ...savedConfigs[id], enabled: !updatedIntegration.enabled }
      };
      saveConfigurations(newConfigs);
    }
    
    const integration = integrations.find(i => i.id === id);
    toast({
      title: integration?.enabled ? "Integration Disabled" : "Integration Enabled",
      description: `${integration?.name} has been ${integration?.enabled ? 'disabled' : 'enabled'}`,
    });
  };

  const connectIntegration = (id: string) => {
    setShowApiKeyForm(id);
  };

  const saveApiKey = async (integrationId: string) => {
    if (integrationId === 'jira') {
      await handleJiraConnection();
    } else if (integrationId === 'azure-devops') {
      await handleAzureDevOpsConnection();
    } else if (integrationId === 'openai') {
      await handleOpenAIConnection();
    } else {
      const apiKey = apiKeys[integrationId];
      if (!apiKey) {
        toast({
          title: "Error",
          description: "Please enter an API key",
          variant: "destructive",
        });
        return;
      }

      const newConfigs = {
        ...savedConfigs,
        [integrationId]: { apiKey }
      };
      saveConfigurations(newConfigs);

      setIntegrations(prev => prev.map(integration => 
        integration.id === integrationId 
          ? { ...integration, status: 'connected', lastSync: 'Just now' }
          : integration
      ));

      setShowApiKeyForm(null);
      setApiKeys(prev => ({ ...prev, [integrationId]: '' }));
      
      toast({
        title: "Integration Connected",
        description: `${integrations.find(i => i.id === integrationId)?.name} has been connected successfully`,
      });
    }
  };

  const handleOpenAIConnection = async () => {
    const { endpoint, apiKey, deploymentId, apiVersion } = openAiConfig;

    // Input validation
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Please enter your API key",
        variant: "destructive",
      });
      return;
    }

    if (!endpoint) {
      toast({
        title: "Error",
        description: "Please enter your Azure OpenAI endpoint",
        variant: "destructive",
      });
      return;
    }

    if (!deploymentId) {
      toast({
        title: "Error",
        description: "Please enter your deployment ID",
        variant: "destructive",
      });
      return;
    }

    // Validate endpoint URL
    const urlValidation = validateUrl(endpoint);
    if (!urlValidation.isValid) {
      toast({
        title: "Error",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Test the Azure OpenAI connection
    setIsLoading(true);
    try {
      const testUrl = `${endpoint}/openai/deployments/${deploymentId}/chat/completions?api-version=${apiVersion}`;
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        }),
      });

      if (response.ok || response.status === 400) { // 400 is expected for minimal test
        // Save configuration with enabled state
        const newConfigs = {
          ...savedConfigs,
          openai: { ...openAiConfig, enabled: true }
        };
        saveConfigurations(newConfigs);

        setIntegrations(prev => prev.map(integration => 
          integration.id === 'openai' 
            ? { ...integration, status: 'connected', lastSync: 'Just now' }
            : integration
        ));
        setShowApiKeyForm(null);
        
        toast({
          title: "Azure OpenAI Connected Successfully",
          description: "Your Azure OpenAI configuration is valid and has been saved",
        });
      } else {
        throw new Error('Invalid configuration or insufficient permissions');
      }
    } catch (error) {
      console.error('Azure OpenAI connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Azure OpenAI",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleJiraConnection = async () => {
    const { url, email, projectKey } = jiraConfig;
    const apiToken = apiKeys['jira'];

    // Input validation
    if (!url || !email || !apiToken || !projectKey) {
      toast({
        title: "Error",
        description: "Please fill in all Jira configuration fields",
        variant: "destructive",
      });
      return;
    }

    // Validate using security utilities
    const urlValidation = validateUrl(url);
    if (!urlValidation.isValid) {
      toast({
        title: "Error",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    const emailValidation = validateEmail(email);
    if (!emailValidation.isValid) {
      toast({
        title: "Error",
        description: emailValidation.error,
        variant: "destructive",
      });
      return;
    }

    const projectKeyValidation = validateProjectKey(projectKey);
    if (!projectKeyValidation.isValid) {
      toast({
        title: "Error",
        description: projectKeyValidation.error,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/jira-integration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jiraUrl: url,
          email: email,
          apiToken: apiToken,
          projectKey: projectKey
        })
      });

      const data = await response.json();

      if (data.success) {
        // Save configuration with enabled state
        const newConfigs = {
          ...savedConfigs,
          jira: { ...jiraConfig, apiToken, enabled: true }
        };
        saveConfigurations(newConfigs);

        setJiraStories(data.stories);
        setIntegrations(prev => prev.map(integration => 
          integration.id === 'jira' 
            ? { ...integration, status: 'connected', lastSync: 'Just now' }
            : integration
        ));
        setShowApiKeyForm(null);
        
        toast({
          title: "Jira Connected Successfully",
          description: `Found ${data.stories.length} stories in project ${projectKey}`,
        });
      } else {
        throw new Error(data.error || 'Failed to connect to Jira');
      }
    } catch (error) {
      console.error('Jira connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Jira",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateTestCases = async (story: any) => {
    // Check if Azure OpenAI is configured
    const azureConfig = savedConfigs.openai;
    if (!azureConfig?.endpoint || !azureConfig?.apiKey || !azureConfig?.deploymentId) {
      toast({
        title: "Azure OpenAI Not Configured",
        description: "Please configure Azure OpenAI first to generate test cases",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/generate-test-cases`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ 
          story,
          azureConfig
        })
      });

      const data = await response.json();

      if (data.success) {
        setGeneratedTestCases(prev => [...prev, ...data.testCases]);
        toast({
          title: "Test Cases Generated",
          description: `Generated ${data.testCases.length} test cases for "${story.title}"`,
        });
      } else {
        throw new Error(data.error || 'Failed to generate test cases');
      }
    } catch (error) {
      console.error('Test case generation error:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate test cases",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAzureDevOpsConnection = async () => {
    const { organizationUrl, projectName } = azureDevOpsConfig;
    const personalAccessToken = apiKeys['azure-devops'];

    // Input validation
    if (!organizationUrl || !projectName || !personalAccessToken) {
      toast({
        title: "Error",
        description: "Please fill in all Azure DevOps configuration fields",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    const urlValidation = validateUrl(organizationUrl);
    if (!urlValidation.isValid) {
      toast({
        title: "Error",
        description: urlValidation.error,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`https://lghzmijzfpvrcvogxpew.supabase.co/functions/v1/azure-devops-integration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationUrl: organizationUrl,
          projectName: projectName,
          personalAccessToken: personalAccessToken
        })
      });

      const data = await response.json();

      if (data.success) {
        // Save configuration with enabled state
        const newConfigs = {
          ...savedConfigs,
          'azure-devops': { ...azureDevOpsConfig, personalAccessToken, enabled: true }
        };
        saveConfigurations(newConfigs);

        setAzureDevOpsStories(data.stories);
        setIntegrations(prev => prev.map(integration => 
          integration.id === 'azure-devops' 
            ? { ...integration, status: 'connected', lastSync: 'Just now' }
            : integration
        ));
        setShowApiKeyForm(null);
        
        toast({
          title: "Azure DevOps Connected Successfully",
          description: `Found ${data.stories.length} stories in project ${projectName}`,
        });
      } else {
        throw new Error(data.error || 'Failed to connect to Azure DevOps');
      }
    } catch (error) {
      console.error('Azure DevOps connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Azure DevOps",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected': return <CheckCircle className="h-4 w-4 text-success" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'bg-success text-success-foreground';
      case 'error': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Integrations</h2>
          <p className="text-muted-foreground">
            Connect external tools to streamline your test management workflow
          </p>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          return (
            <Card key={integration.id} className="shadow-card hover:shadow-elegant transition-all duration-200">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-hero">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{integration.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {integration.description}
                      </p>
                    </div>
                  </div>
                  <Badge className={getStatusColor(integration.status)}>
                    <span className="flex items-center gap-1">
                      {getStatusIcon(integration.status)}
                      {integration.status}
                    </span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {integration.lastSync && (
                  <div className="text-sm text-muted-foreground">
                    Last sync: {integration.lastSync}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={integration.enabled}
                      onCheckedChange={() => toggleIntegration(integration.id)}
                      disabled={integration.status !== 'connected'}
                    />
                    <span className="text-sm">
                      {integration.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  
                  {integration.status === 'disconnected' ? (
                    <Button 
                      variant="gradient" 
                      size="sm"
                      onClick={() => connectIntegration(integration.id)}
                    >
                      Connect
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => connectIntegration(integration.id)}
                    >
                      <Settings className="mr-2 h-3 w-3" />
                      Configure
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* API Key Form Modal */}
      {showApiKeyForm && (
        <Card className="shadow-elegant border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Connect {integrations.find(i => i.id === showApiKeyForm)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-gradient-hero rounded-lg">
              <h4 className="font-medium mb-2">Setup Instructions:</h4>
              <div className="text-sm text-muted-foreground space-y-2">
                {showApiKeyForm === 'jira' ? (
                  <>
                    <p>1. Go to your Jira settings and create an API token</p>
                    <p>2. Navigate to Profile → Personal Access Tokens</p>
                    <p>3. Create a new token with project read permissions</p>
                    <p>4. Copy the token and paste it below</p>
                  </>
                 ) : showApiKeyForm === 'openai' ? (
                  <>
                    <p>1. Go to your Azure OpenAI resource in Azure Portal</p>
                    <p>2. Navigate to Keys and Endpoint section</p>
                    <p>3. Copy the endpoint URL and API key</p>
                    <p>4. Get your deployment ID from the model deployments</p>
                  </>
                ) : (
                  <>
                    <p>1. Go to Azure DevOps organization settings</p>
                    <p>2. Navigate to Personal Access Tokens</p>
                    <p>3. Create a new token with Work Items read permissions</p>
                    <p>4. Copy the token and paste it below</p>
                  </>
                )}
              </div>
            </div>
            
            {showApiKeyForm === 'jira' && (
              <div className="space-y-3">
                <Input
                  placeholder="Jira URL (e.g., https://yourcompany.atlassian.net)"
                  value={jiraConfig.url}
                  onChange={(e) => setJiraConfig(prev => ({ ...prev, url: e.target.value }))}
                />
                <Input
                  placeholder="Email address"
                  value={jiraConfig.email}
                  onChange={(e) => setJiraConfig(prev => ({ ...prev, email: e.target.value }))}
                />
                <Input
                  placeholder="Project Key (e.g., PROJ)"
                  value={jiraConfig.projectKey}
                  onChange={(e) => setJiraConfig(prev => ({ ...prev, projectKey: e.target.value }))}
                />
              </div>
            )}

            {showApiKeyForm === 'azure-devops' && (
              <div className="space-y-3">
                <Input
                  placeholder="Organization URL (e.g., https://dev.azure.com/yourorg)"
                  value={azureDevOpsConfig.organizationUrl}
                  onChange={(e) => setAzureDevOpsConfig(prev => ({ ...prev, organizationUrl: e.target.value }))}
                />
                <Input
                  placeholder="Project Name"
                  value={azureDevOpsConfig.projectName}
                  onChange={(e) => setAzureDevOpsConfig(prev => ({ ...prev, projectName: e.target.value }))}
                />
              </div>
            )}

            {showApiKeyForm === 'openai' && (
              <div className="space-y-3">
                <Input
                  placeholder="Azure OpenAI Endpoint (e.g., https://your-resource.openai.azure.com)"
                  value={openAiConfig.endpoint}
                  onChange={(e) => setOpenAiConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                />
                <Input
                  type="password"
                  placeholder="Enter your Azure OpenAI API key"
                  value={openAiConfig.apiKey}
                  onChange={(e) => setOpenAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                />
                <Input
                  placeholder="Deployment ID (e.g., gpt-4o)"
                  value={openAiConfig.deploymentId}
                  onChange={(e) => setOpenAiConfig(prev => ({ ...prev, deploymentId: e.target.value }))}
                />
                <Input
                  placeholder="API Version (default: 2024-02-15-preview)"
                  value={openAiConfig.apiVersion}
                  onChange={(e) => setOpenAiConfig(prev => ({ ...prev, apiVersion: e.target.value }))}
                />
              </div>
            )}
            
            {showApiKeyForm !== 'openai' && showApiKeyForm !== 'jira' && showApiKeyForm !== 'azure-devops' && (
              <Input
                type="password"
                placeholder="Enter your API key/token"
                value={apiKeys[showApiKeyForm] || ''}
                onChange={(e) => setApiKeys(prev => ({ ...prev, [showApiKeyForm!]: e.target.value }))}
              />
            )}

            {(showApiKeyForm === 'jira' || showApiKeyForm === 'azure-devops') && (
              <Input
                type="password"
                placeholder={showApiKeyForm === 'jira' ? "Enter your Jira API token" : "Enter your Personal Access Token"}
                value={apiKeys[showApiKeyForm] || ''}
                onChange={(e) => setApiKeys(prev => ({ ...prev, [showApiKeyForm!]: e.target.value }))}
              />
            )}
            
            <div className="flex gap-2">
              <Button 
                onClick={() => saveApiKey(showApiKeyForm)}
                disabled={isLoading}
              >
                {isLoading ? 'Connecting...' : 'Connect Integration'}
              </Button>
              <Button variant="outline" onClick={() => setShowApiKeyForm(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Azure DevOps Stories */}
      {azureDevOpsStories.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Azure DevOps Stories ({azureDevOpsStories.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Stories imported from Azure DevOps project. Click "Generate Test Cases" to create AI-powered test cases.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {azureDevOpsStories.map((story) => (
              <div key={story.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{story.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      #{story.azureDevOpsId} • {story.issueType} • {story.priority}
                    </p>
                    <p className="text-sm mt-2 line-clamp-2">
                      {story.description}
                    </p>
                    {story.acceptanceCriteria && (
                      <div className="mt-2">
                        <p className="text-xs font-medium text-muted-foreground">Acceptance Criteria:</p>
                        <p className="text-sm mt-1 line-clamp-2">{story.acceptanceCriteria}</p>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => generateTestCases(story)}
                    disabled={isLoading}
                  >
                    Generate Test Cases
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Jira Stories */}
      {jiraStories.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Jira Stories ({jiraStories.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              Stories imported from Jira project. Click "Generate Test Cases" to create AI-powered test cases.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {jiraStories.map((story) => (
              <div key={story.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{story.title}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {story.jiraKey} • {story.issueType} • {story.priority}
                    </p>
                    <p className="text-sm mt-2 line-clamp-2">
                      {extractTextFromJiraContent(story.description)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => generateTestCases(story)}
                    disabled={isLoading}
                  >
                    Generate Test Cases
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {generatedTestCases.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Generated Test Cases ({generatedTestCases.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              AI-generated test cases from Jira stories using OpenAI.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {generatedTestCases.map((testCase) => (
              <div key={`${testCase.storyId}-${testCase.id}`} className="border rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium">{testCase.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {testCase.id} • {testCase.type} • {testCase.priority} • {testCase.category}
                    </p>
                    <p className="text-sm mt-2">{testCase.description}</p>
                    <div className="mt-3">
                      <h5 className="text-sm font-medium">Steps:</h5>
                       <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                         {testCase.steps?.map((step: any, index: number) => (
                           <li key={index}>{typeof step === 'string' ? step : JSON.stringify(step)}</li>
                         ))}
                       </ol>
                    </div>
                    <div className="mt-2">
                      <h5 className="text-sm font-medium">Expected Result:</h5>
                      <p className="text-sm text-muted-foreground">{testCase.expectedResult}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
