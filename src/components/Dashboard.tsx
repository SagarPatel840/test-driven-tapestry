import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  TestTube, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  Plus,
  ArrowRight,
  Brain
} from "lucide-react";

interface DashboardProps {
  onViewChange: (view: string) => void;
  projectId: string;
}

interface DashboardStats {
  userStoriesCount: number;
  testCasesCount: number;
  testCasesPassed: number;
  aiUsageCount: number;
  timeSaved: number;
}

interface RecentActivity {
  id: string;
  action: string;
  item: string;
  time: string;
  status: string;
}

export const Dashboard = ({ onViewChange }: DashboardProps) => {
  const { toast } = useToast();
  const { session } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    userStoriesCount: 0,
    testCasesCount: 0,
    testCasesPassed: 0,
    aiUsageCount: 0,
    timeSaved: 0
  });
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const created = new Date(date);
    const diffMs = now.getTime() - created.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return created.toLocaleDateString();
  };

  const loadDashboardData = async () => {
    if (!session?.user?.id) return;

    setIsLoading(true);
    try {
      // Get user's projects
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id')
        .eq('created_by', session.user.id);

      if (projectsError) throw projectsError;

      if (!projects || projects.length === 0) {
        setStats({
          userStoriesCount: 0,
          testCasesCount: 0,
          testCasesPassed: 0,
          aiUsageCount: 0,
          timeSaved: 0
        });
        setRecentActivities([]);
        return;
      }

      const projectIds = projects.map(p => p.id);

      // Load user stories count
      const { count: userStoriesCount, error: storiesError } = await supabase
        .from('user_stories')
        .select('*', { count: 'exact', head: true })
        .in('project_id', projectIds);

      if (storiesError) throw storiesError;

      // Load test cases data
      const { data: testCases, error: testCasesError } = await supabase
        .from('test_cases')
        .select('status')
        .in('project_id', projectIds);

      if (testCasesError) throw testCasesError;

      const testCasesCount = testCases?.length || 0;
      const testCasesPassed = testCases?.filter(tc => tc.status === 'passed').length || 0;

      // Load AI usage data
      const { data: aiUsage, error: aiError } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .eq('user_id', session.user.id)
        .in('project_id', projectIds);

      if (aiError) throw aiError;

      const aiUsageCount = aiUsage?.length || 0;
      const timeSaved = Math.round((testCasesCount * 15) / 60); // 15 min per test case converted to hours

      setStats({
        userStoriesCount: userStoriesCount || 0,
        testCasesCount,
        testCasesPassed,
        aiUsageCount,
        timeSaved
      });

      // Load recent activities (combining user stories and test cases updates)
      const [userStoriesData, testCasesData] = await Promise.all([
        supabase
          .from('user_stories')
          .select('id, title, updated_at, created_at')
          .in('project_id', projectIds)
          .order('updated_at', { ascending: false })
          .limit(5),
        supabase
          .from('test_cases')
          .select('id, title, updated_at, created_at, user_stories!inner(title)')
          .in('project_id', projectIds)
          .order('updated_at', { ascending: false })
          .limit(5)
      ]);

      const activities: RecentActivity[] = [];

      // Add user story activities
      if (userStoriesData.data) {
        userStoriesData.data.forEach(story => {
          const isNew = new Date(story.updated_at).getTime() === new Date(story.created_at).getTime();
          activities.push({
            id: `story-${story.id}`,
            action: isNew ? "Created user story" : "Updated user story",
            item: story.title,
            time: formatTimeAgo(story.updated_at),
            status: isNew ? "created" : "updated"
          });
        });
      }

      // Add test case activities
      if (testCasesData.data) {
        testCasesData.data.forEach(testCase => {
          const isNew = new Date(testCase.updated_at).getTime() === new Date(testCase.created_at).getTime();
          activities.push({
            id: `test-${testCase.id}`,
            action: isNew ? "Created test case" : "Updated test case",
            item: testCase.title,
            time: formatTimeAgo(testCase.updated_at),
            status: isNew ? "created" : "updated"
          });
        });
      }

      // Sort all activities by most recent and take top 6
      activities.sort((a, b) => {
        const getTime = (time: string) => {
          if (time === "Just now") return Date.now();
          if (time.includes("hour")) {
            const hours = parseInt(time.split(" ")[0]);
            return Date.now() - (hours * 60 * 60 * 1000);
          }
          if (time.includes("day")) {
            const days = parseInt(time.split(" ")[0]);
            return Date.now() - (days * 24 * 60 * 60 * 1000);
          }
          return new Date(time).getTime();
        };
        return getTime(b.time) - getTime(a.time);
      });

      setRecentActivities(activities.slice(0, 6));

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) {
      loadDashboardData();
    }
  }, [session?.user?.id]);

  const statsConfig = [
    {
      title: "User Stories",
      value: stats.userStoriesCount.toString(),
      change: `${stats.userStoriesCount > 0 ? 'Active stories' : 'No stories yet'}`,
      icon: FileText,
      color: "text-primary"
    },
    {
      title: "Test Cases",
      value: stats.testCasesCount.toString(),
      change: `${stats.testCasesPassed} passed`,
      icon: TestTube,
      color: "text-accent"
    },
    {
      title: "Time Saved",
      value: `${stats.timeSaved}hrs`,
      change: "~15min per test case",
      icon: Clock,
      color: "text-success"
    },
    {
      title: "AI Usage",
      value: stats.aiUsageCount.toString(),
      change: "AI-powered features",
      icon: Brain,
      color: "text-warning"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your test management activity
          </p>
        </div>
        <Button variant="gradient" onClick={() => onViewChange('user-stories')}>
          <Plus className="mr-2 h-4 w-4" />
          Add User Story
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          statsConfig.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card key={index} className="shadow-card hover:shadow-elegant transition-all duration-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.change}
                  </p>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gradient-hero">
                  <div className="space-y-1 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <div className="text-right">
                    <Skeleton className="h-5 w-16 mb-1" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))
            ) : recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg bg-gradient-hero">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">{activity.item}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="mb-1">
                      {activity.status}
                    </Badge>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No recent activity</p>
                <p className="text-xs">Start creating user stories and test cases to see activity here</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => onViewChange('user-stories')}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Import from Jira
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => onViewChange('user-stories')}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Import from Azure DevOps
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => onViewChange('test-plan')}
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Generate Test Plan
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between"
              onClick={() => onViewChange('test-report')}
            >
              <span className="flex items-center gap-2">
                <TestTube className="h-4 w-4" />
                Generate Test Report
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};