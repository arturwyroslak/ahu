import { Activity, History, Home, Settings, Zap, Server, BarChart3, Bot, GitBranch } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  {
    title: "Create Task",
    url: "/",
    icon: Home,
    badge: null,
  },
  {
    title: "System Status",
    url: "/system-status",
    icon: Server,
    badge: null,
  },
  {
    title: "Statistics",
    url: "/statistics",
    icon: BarChart3,
    badge: null,
  },
  {
    title: "History",
    url: "/history",
    icon: History,
    badge: null,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    badge: null,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar className="border-r-2 border-sidebar-border neon-border relative overflow-visible">
      {/* Sidebar background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-3/4 h-1/3 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-0 w-1/2 h-1/4 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      
      <SidebarHeader className="p-6 border-b border-sidebar-border relative">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent neon-pulse shadow-lg">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-bold text-primary neon-text">AI GitHub Agent</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="w-3 h-3" />
              <span>Autonomous Development</span>
            </div>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4 relative">
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-semibold text-accent uppercase tracking-wider mb-2 px-2">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {menuItems.map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                      className={`relative group transition-all duration-200 ${
                        isActive 
                          ? 'bg-primary/15 toggle-elevate toggle-elevated shadow-lg' 
                          : 'hover:bg-primary/5'
                      }`}
                    >
                      <Link href={item.url} className="flex items-center gap-3 w-full">
                        {isActive && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/4 bg-primary rounded-r-full shadow-lg shadow-primary/50" />
                        )}
                        <item.icon className={`h-4 w-4 transition-all ${isActive ? 'text-primary scale-110' : 'text-sidebar-foreground group-hover:text-primary'}`} />
                        <span className={`font-medium transition-colors ${isActive ? 'text-primary neon-text-secondary' : 'text-sidebar-foreground group-hover:text-primary'}`}>
                          {item.title}
                        </span>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="w-3 h-3 text-primary animate-pulse" />
          <span>Runtime Active</span>
          <div className="ml-auto flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse delay-75" />
            <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse delay-150" />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
