import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  Clock,
  CheckCircle,
  AlertTriangle,
  Lightbulb,
  RefreshCw,
  DollarSign,
  Zap
} from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Bar } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AIAnalyticsData {
  overview: {
    totalUsage: number;
    successfulUsage: number;
    successRate: number;
    totalTokens: number;
    totalCost: number;
    avgExecutionTime: number;
  };
  openai: {
    totalRequests: number;
    totalCost: number;
    avgCostPerRequest: number;
    modelBreakdown: Record<string, {
      requests: number;
      promptTokens: number;
      completionTokens: number;
      cost: number;
    }>;
  };
  utilization: {
    level: 'low' | 'optimal' | 'high';
    message: string;
    recentUsage: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  };
  featureBreakdown: Record<string, {
    count: number;
    tokens: number;
    cost: number;
    avgTime: number;
    successRate: number;
    models: string[];
  }>;
  dailyTrend: Array<{
    date: string;
    usage: number;
  }>;
  recommendations: string[];
}

export const AIAnalytics = () => {
  const [analytics, setAnalytics] = useState<AIAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('ai-analytics');
      
      if (error) throw error;
      
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching AI analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load AI analytics data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold">AI Usage Analytics</h2>
          <div className="animate-spin">
            <Brain className="h-6 w-6 text-primary" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-8 bg-muted rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="space-y-6">
        <h2 className="text-3xl font-bold">AI Usage Analytics</h2>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">No analytics data available</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getUtilizationColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-warning';
      case 'high': return 'text-destructive';
      default: return 'text-success';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="h-4 w-4 text-success" />;
      case 'decreasing': return <TrendingDown className="h-4 w-4 text-destructive" />;
      default: return <BarChart3 className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const chartConfig = {
    usage: {
      label: "Daily Usage",
      color: "hsl(var(--primary))",
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-8 w-8 text-primary" />
            AI Usage Analytics
          </h2>
          <p className="text-muted-foreground">
            Insights into your AI feature utilization and performance
          </p>
        </div>
        <Button variant="outline" onClick={fetchAnalytics}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh Data
        </Button>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total AI Requests</CardTitle>
            <Brain className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overview.totalUsage}</div>
            <p className="text-xs text-muted-foreground">
              {analytics.overview.successfulUsage} successful
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overview.successRate.toFixed(1)}%</div>
            <Progress value={analytics.overview.successRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            <BarChart3 className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overview.totalTokens.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              ~{Math.round(analytics.overview.totalTokens / Math.max(analytics.overview.totalUsage, 1))} avg per request
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${analytics.overview.totalCost.toFixed(3)}</div>
            <p className="text-xs text-muted-foreground">
              OpenAI API usage
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.overview.avgExecutionTime}ms</div>
            <p className="text-xs text-muted-foreground">
              Processing time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* OpenAI Analytics */}
      {analytics.openai.totalRequests > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              OpenAI Usage Analytics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{analytics.openai.totalRequests}</div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-success">${analytics.openai.totalCost.toFixed(3)}</div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-accent">${analytics.openai.avgCostPerRequest.toFixed(4)}</div>
                <p className="text-sm text-muted-foreground">Avg Cost/Request</p>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="text-lg font-semibold">Model Breakdown</h4>
              <div className="grid grid-cols-1 gap-4">
                {Object.entries(analytics.openai.modelBreakdown).map(([model, data]) => (
                  <div key={model} className="p-4 rounded-lg border bg-gradient-hero">
                    <div className="flex justify-between items-center mb-2">
                      <h5 className="font-medium">{model}</h5>
                      <Badge variant="outline">{data.requests} requests</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Prompt Tokens:</span>
                        <div className="font-medium">{data.promptTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Completion Tokens:</span>
                        <div className="font-medium">{data.completionTokens.toLocaleString()}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Cost:</span>
                        <div className="font-medium text-success">${data.cost.toFixed(3)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Utilization Analysis */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getTrendIcon(analytics.utilization.trend)}
              Utilization Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Utilization Level</span>
              <Badge 
                variant="outline" 
                className={`capitalize ${getUtilizationColor(analytics.utilization.level)}`}
              >
                {analytics.utilization.level}
              </Badge>
            </div>
            
            <div className="p-4 rounded-lg bg-gradient-hero">
              <p className="text-sm">{analytics.utilization.message}</p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Recent Usage (30 days)</span>
                <span className="font-medium">{analytics.utilization.recentUsage} requests</span>
              </div>
              <Progress 
                value={Math.min((analytics.utilization.recentUsage / 100) * 100, 100)} 
                className="h-2" 
              />
            </div>
          </CardContent>
        </Card>

        {/* Daily Usage Trend */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Daily Usage Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.dailyTrend}>
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { weekday: 'short' })}
                  />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line 
                    type="monotone" 
                    dataKey="usage" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Feature Breakdown */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Feature Usage Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(analytics.featureBreakdown).map(([feature, data]) => (
              <div key={feature} className="p-4 rounded-lg border bg-card">
                <h4 className="font-medium capitalize mb-2">{feature.replace('_', ' ')}</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Requests:</span>
                    <span className="font-medium">{data.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Success Rate:</span>
                    <span className="font-medium">{data.successRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Time:</span>
                    <span className="font-medium">{Math.round(data.avgTime)}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cost:</span>
                    <span className="font-medium text-success">${data.cost.toFixed(3)}</span>
                  </div>
                  {data.models.length > 0 && (
                    <div className="flex justify-between">
                      <span>Models:</span>
                      <span className="font-medium text-xs">{data.models.join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {analytics.recommendations.length > 0 && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-accent" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-gradient-hero">
                  <AlertTriangle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-sm">{recommendation}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};