import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp, 
  Activity,
  Zap,
  Target
} from "lucide-react";

const TestDashboard = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-accent/10 text-accent border-accent/20">
            Dashboard Preview
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Powerful Testing{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Control Center
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Monitor, manage, and optimize your entire testing pipeline from one beautiful interface.
          </p>
        </div>
        
        {/* Dashboard Mock */}
        <div className="max-w-7xl mx-auto">
          {/* Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tests Passed</p>
                    <p className="text-3xl font-bold text-green-500">1,247</p>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <div className="flex items-center mt-2">
                  <TrendingUp className="w-4 h-4 text-green-500 mr-1" />
                  <span className="text-sm text-green-500">+12.5%</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Tests Failed</p>
                    <p className="text-3xl font-bold text-red-500">23</p>
                  </div>
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
                <div className="flex items-center mt-2">
                  <Target className="w-4 h-4 text-red-500 mr-1" />
                  <span className="text-sm text-red-500">-8.2%</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Test Coverage</p>
                    <p className="text-3xl font-bold text-blue-500">94.2%</p>
                  </div>
                  <Activity className="w-8 h-8 text-blue-500" />
                </div>
                <div className="flex items-center mt-2">
                  <TrendingUp className="w-4 h-4 text-blue-500 mr-1" />
                  <span className="text-sm text-blue-500">+2.1%</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Duration</p>
                    <p className="text-3xl font-bold text-purple-500">4.2s</p>
                  </div>
                  <Clock className="w-8 h-8 text-purple-500" />
                </div>
                <div className="flex items-center mt-2">
                  <Zap className="w-4 h-4 text-purple-500 mr-1" />
                  <span className="text-sm text-purple-500">-15.3%</span>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Main Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Recent Tests */}
            <Card className="lg:col-span-2 bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Recent Test Runs</CardTitle>
                  <Button variant="outline" size="sm">
                    <Play className="w-4 h-4 mr-2" />
                    Run All
                  </Button>
                </div>
                <CardDescription>Latest test execution results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { name: "Authentication Flow", status: "passed", duration: "2.3s", coverage: "98%" },
                    { name: "Payment Gateway", status: "passed", duration: "5.1s", coverage: "94%" },
                    { name: "User Registration", status: "failed", duration: "1.8s", coverage: "92%" },
                    { name: "Search Functionality", status: "passed", duration: "3.2s", coverage: "96%" },
                    { name: "API Integration", status: "running", duration: "...", coverage: "..." }
                  ].map((test, index) => (
                    <div key={index} className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        {test.status === "passed" && <CheckCircle className="w-5 h-5 text-green-500" />}
                        {test.status === "failed" && <XCircle className="w-5 h-5 text-red-500" />}
                        {test.status === "running" && <Clock className="w-5 h-5 text-yellow-500 animate-spin" />}
                        <div>
                          <p className="font-medium">{test.name}</p>
                          <p className="text-sm text-muted-foreground">{test.duration} • {test.coverage} coverage</p>
                        </div>
                      </div>
                      <Badge 
                        variant={test.status === "passed" ? "default" : test.status === "failed" ? "destructive" : "secondary"}
                        className={test.status === "passed" ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}
                      >
                        {test.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            
            {/* Test Progress */}
            <Card className="bg-card/50 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl">Test Progress</CardTitle>
                <CardDescription>Current testing pipeline status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Unit Tests</span>
                    <span className="text-green-500">245/245</span>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Integration Tests</span>
                    <span className="text-blue-500">87/92</span>
                  </div>
                  <Progress value={94.6} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>E2E Tests</span>
                    <span className="text-yellow-500">23/28</span>
                  </div>
                  <Progress value={82.1} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Performance Tests</span>
                    <span className="text-purple-500">12/15</span>
                  </div>
                  <Progress value={80} className="h-2" />
                </div>
                
                <div className="pt-4 border-t border-border">
                  <Button className="w-full bg-gradient-primary hover:opacity-90" size="sm">
                    <Zap className="w-4 h-4 mr-2" />
                    Generate New Tests
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};

export default TestDashboard;