import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Header = () => {
  const { user, signOut, loading } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getUserInitials = (email: string) => {
    if (!email) return 'U';
    const parts = email.split('@')[0].split('.');
    if (parts.length > 1) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return email.charAt(0).toUpperCase();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">TC</span>
          </div>
          <span className="text-xl font-bold">TestCraft AI</span>
          <Badge variant="secondary" className="ml-2">Beta</Badge>
        </div>
        
        <nav className="hidden md:flex items-center space-x-8">
          <a href="#features" className="text-sm hover:text-primary transition-colors">Features</a>
          <a href="#pricing" className="text-sm hover:text-primary transition-colors">Pricing</a>
          <a href="#docs" className="text-sm hover:text-primary transition-colors">Docs</a>
          <a href="#contact" className="text-sm hover:text-primary transition-colors">Contact</a>
        </nav>
        
        <div className="flex items-center space-x-4">
          {loading ? (
            <div className="w-20 h-8 animate-pulse bg-muted rounded" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center space-x-3 p-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-primary text-white font-medium text-sm">
                      {getUserInitials(user.email || '')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline font-medium">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleSignOut} className="flex items-center space-x-2">
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button variant="default" size="sm" className="bg-gradient-primary hover:opacity-90" asChild>
                <Link to="/auth">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;