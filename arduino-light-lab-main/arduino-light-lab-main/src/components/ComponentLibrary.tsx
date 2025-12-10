import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMPONENT_DATA, getComponentIcon } from "@/config/componentsData";
import { toast } from "sonner";

interface ComponentLibraryProps {
  onClose: () => void;
  onAddComponent?: (componentId: string) => void;
}

export const ComponentLibrary = ({ onClose, onAddComponent }: ComponentLibraryProps) => {
  const handleComponentClick = (componentId: string, componentName: string) => {
    if (onAddComponent) {
      onAddComponent(componentId);
    }
    toast.success(`${componentName} added to canvas!`);
  };

  const categories = [
    { id: 'boards', label: 'Boards' },
    { id: 'sensors', label: 'Sensors' },
    { id: 'displays', label: 'Displays' },
    { id: 'actuators', label: 'Actuators' },
    { id: 'communication', label: 'Communication' },
    { id: 'modules', label: 'Modules' },
    { id: 'basic', label: 'Basic' },
  ];

  return (
    <div className="fixed right-0 top-0 h-full w-96 bg-card border-l shadow-lg z-50 animate-in slide-in-from-right">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Component Library</h2>
          <p className="text-xs text-muted-foreground">{COMPONENT_DATA.length} components available</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="sensors" className="h-[calc(100%-80px)]">
        <div className="px-4 pt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sensors">Sensors</TabsTrigger>
            <TabsTrigger value="displays">Displays</TabsTrigger>
            <TabsTrigger value="actuators">Motors</TabsTrigger>
          </TabsList>
          <TabsList className="grid w-full grid-cols-4 mt-2">
            <TabsTrigger value="communication">Comm</TabsTrigger>
            <TabsTrigger value="modules">Modules</TabsTrigger>
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="boards">Boards</TabsTrigger>
          </TabsList>
        </div>

        {categories.map((category) => (
          <TabsContent key={category.id} value={category.id} className="h-full mt-2">
            <ScrollArea className="h-[calc(100vh-220px)] px-4">
              <div className="space-y-2 pb-4">
                {COMPONENT_DATA
                  .filter((component) => component.category === category.id)
                  .map((component) => {
                    const Icon = getComponentIcon(component.id);
                    return (
                      <Card
                        key={component.id}
                        className="p-3 cursor-grab hover:bg-accent/50 transition-colors hover:shadow-md active:cursor-grabbing"
                        onClick={() => handleComponentClick(component.id, component.name)}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("componentId", component.id);
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm truncate">{component.name}</h3>
                            <p className="text-xs text-muted-foreground truncate">
                              {component.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
