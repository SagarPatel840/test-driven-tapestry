import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, FolderOpen, Calendar, Users, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateText, sanitizeText } from "@/lib/security";
import { ProjectSettings } from "./ProjectSettings";

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  markdown_settings?: any;
}

interface ProjectsProps {
  onProjectSelect: (projectId: string, projectName: string) => void;
}

export const Projects = ({ onProjectSelect }: ProjectsProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [selectedProjectForSettings, setSelectedProjectForSettings] = useState<{ id: string; name: string } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    // Validate using security utilities
    const nameValidation = validateText(newProject.name, "Project name", 1, 255);
    if (!nameValidation.isValid) {
      toast({
        title: "Error",
        description: nameValidation.error,
        variant: "destructive",
      });
      return;
    }

    const descriptionValidation = validateText(newProject.description, "Description", 0, 2000, false);
    if (!descriptionValidation.isValid) {
      toast({
        title: "Error",
        description: descriptionValidation.error,
        variant: "destructive",
      });
      return;
    }

    // Sanitize input
    const sanitizedName = sanitizeText(newProject.name);
    const sanitizedDescription = sanitizeText(newProject.description);

    try {
      const { data, error } = await supabase
        .from('projects')
        .insert([{
          name: sanitizedName,
          description: sanitizedDescription,
          created_by: (await supabase.auth.getUser()).data.user?.id
        }])
        .select()
        .single();

      if (error) throw error;

      setProjects([data, ...projects]);
      setNewProject({ name: "", description: "" });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Project created successfully",
      });
    } catch (error) {
      console.error('Error creating project:', error);
      toast({
        title: "Error",
        description: "Failed to create project",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded"></div>
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-4 bg-muted rounded mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground">Manage your test management projects</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="gradient">
              <Plus className="mr-2 h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Create a new test management project to organize your user stories and test cases.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="Enter project name..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Enter project description..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createProject}>Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">No Projects Yet</h3>
              <p className="text-muted-foreground">Create your first project to get started with test management.</p>
            </div>
            <Button variant="gradient" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card 
              key={project.id} 
              className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-105"
              onClick={() => onProjectSelect(project.id, project.name)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {project.description || "No description provided"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectForSettings({ id: project.id, name: project.name });
                      }}
                      className="h-8 w-8 p-0"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Badge variant="secondary">
                      Active
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(project.updated_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    1 member
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedProjectForSettings && (
        <ProjectSettings
          projectId={selectedProjectForSettings.id}
          projectName={selectedProjectForSettings.name}
          isOpen={true}
          onClose={() => setSelectedProjectForSettings(null)}
        />
      )}
    </div>
  );
};