import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  LayoutDashboard, 
  FileText, 
  TestTube, 
  Settings, 
  Plus,
  Menu,
  X,
  ArrowLeft,
  FolderOpen,
  Target,
  BarChart3,
  Brain,
  Zap,
  FileCode
} from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  selectedProject?: { id: string; name: string } | null;
  onBackToProjects?: () => void;
}

export const Layout = ({ children, currentView, onViewChange, selectedProject, onBackToProjects }: LayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const projectNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'user-stories', label: 'User Stories', icon: FileText },
    { id: 'test-cases', label: 'Test Cases', icon: TestTube },
    { id: 'test-plan', label: 'Test Plan', icon: Target },
    { id: 'test-report', label: 'Test Report', icon: BarChart3 },
    { id: 'api', label: 'API', icon: Target },
    { id: 'performance', label: 'Performance', icon: Zap },
    { id: 'ai-analytics', label: 'AI Analytics', icon: Brain },
    { id: 'integrations', label: 'Integrations', icon: Settings },
  ];

  const mainNavItems = [
    { id: 'projects', label: 'Projects', icon: FolderOpen },
  ];

  const navItems = selectedProject ? projectNavItems : mainNavItems;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <div className="lg:hidden bg-card border-b px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          TestCraft AI
        </h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? <X /> : <Menu />}
        </Button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="p-6">
            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent hidden lg:block">
              TestCraft AI
            </h1>
            {selectedProject && onBackToProjects && (
              <div className="mt-4 hidden lg:block">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBackToProjects}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Projects
                </Button>
                <div className="mt-2 p-3 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">{selectedProject.name}</p>
                  <p className="text-xs text-muted-foreground">Current Project</p>
                </div>
              </div>
            )}
          </div>
          
          <nav className="px-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={currentView === item.id ? "default" : "ghost"}
                  className="w-full justify-start"
                  onClick={() => {
                    onViewChange(item.id);
                    setSidebarOpen(false);
                  }}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {item.label}
                </Button>
              );
            })}
          </nav>

        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 lg:ml-0">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};