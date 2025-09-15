import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Code, Brain } from "lucide-react";
import heroImage from "@/assets/hero-bg.jpg";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroImage})` }}
      >
        <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]"></div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 container mx-auto px-6 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">
            <Zap className="w-3 h-3 mr-1" />
            AI-Powered Testing Revolution
          </Badge>
          
          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
            Craft Perfect Tests with{" "}
            <span className="bg-gradient-primary bg-clip-text text-transparent">
              AI Intelligence
            </span>
          </h1>
          
          {/* Subheading */}
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed max-w-3xl mx-auto">
            Transform your QA process with intelligent test generation, automated execution, 
            and AI-driven insights. TestCraft AI makes testing faster, smarter, and more reliable.
          </p>
          
          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              className="bg-gradient-primary hover:opacity-90 text-white shadow-glow text-lg px-8 py-6"
            >
              <Brain className="w-5 h-5 mr-2" />
              Start Testing with AI
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-border hover:bg-muted text-lg px-8 py-6"
            >
              <Code className="w-5 h-5 mr-2" />
              View Documentation
            </Button>
          </div>
          
          {/* Feature Pills */}
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              "Smart Test Generation",
              "Auto Bug Detection", 
              "Performance Analytics",
              "CI/CD Integration"
            ].map((feature) => (
              <Badge 
                key={feature}
                variant="secondary" 
                className="px-4 py-2 bg-card/50 backdrop-blur-sm border border-border/50"
              >
                {feature}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      
      {/* Animated Elements */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
        <div className="w-6 h-10 border-2 border-primary/30 rounded-full flex justify-center">
          <div className="w-1 h-3 bg-primary/30 rounded-full mt-2 animate-pulse"></div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;