import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Brain, 
  Zap, 
  Shield, 
  BarChart3, 
  GitBranch, 
  Rocket,
  Code2,
  Target,
  Clock
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "AI Test Generation",
    description: "Generate comprehensive test cases automatically using advanced AI algorithms that understand your application's context.",
    badge: "Smart",
    color: "text-blue-500"
  },
  {
    icon: Zap,
    title: "Lightning Fast Execution",
    description: "Run thousands of tests in parallel with our optimized execution engine. Get results in minutes, not hours.",
    badge: "Fast",
    color: "text-yellow-500"
  },
  {
    icon: Shield,
    title: "Advanced Security Testing",
    description: "Identify vulnerabilities and security flaws with AI-powered security testing protocols.",
    badge: "Secure",
    color: "text-green-500"
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description: "Track test performance, coverage metrics, and quality trends with beautiful, actionable dashboards.",
    badge: "Insights",
    color: "text-purple-500"
  },
  {
    icon: GitBranch,
    title: "CI/CD Integration",
    description: "Seamlessly integrate with your existing development workflow. Support for all major CI/CD platforms.",
    badge: "DevOps",
    color: "text-orange-500"
  },
  {
    icon: Target,
    title: "Smart Bug Detection",
    description: "AI-powered bug detection that learns from your codebase to catch issues before they reach production.",
    badge: "Precise",
    color: "text-red-500"
  },
  {
    icon: Code2,
    title: "Multi-Language Support",
    description: "Support for JavaScript, Python, Java, C#, and more. Test any application, anywhere.",
    badge: "Flexible",
    color: "text-cyan-500"
  },
  {
    icon: Clock,
    title: "Automated Scheduling",
    description: "Schedule tests to run automatically based on code changes, time intervals, or custom triggers.",
    badge: "Automated",
    color: "text-indigo-500"
  },
  {
    icon: Rocket,
    title: "Performance Testing",
    description: "Load test your applications with AI-generated scenarios that simulate real-world usage patterns.",
    badge: "Performance",
    color: "text-pink-500"
  }
];

const FeaturesSection = () => {
  return (
    <section id="features" className="py-20 bg-muted/30">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
            Features
          </Badge>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Everything You Need for{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              Perfect Testing
            </span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Comprehensive testing tools powered by artificial intelligence to help you build better software faster.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <Card 
                key={feature.title}
                className="group hover:shadow-glow transition-all duration-500 hover:-translate-y-1 bg-card/50 backdrop-blur-sm border-border/50"
              >
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-12 h-12 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className={`w-6 h-6 ${feature.color}`} />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {feature.badge}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl font-semibold group-hover:text-primary transition-colors">
                    {feature.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;