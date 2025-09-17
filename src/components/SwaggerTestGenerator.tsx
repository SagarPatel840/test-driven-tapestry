import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Upload, Target, FileJson, Brain, Zap } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

export const SwaggerTestGenerator = () => {
  const [swaggerContent, setSwaggerContent] = useState("");
  const [testCases, setTestCases] = useState<string[][]>([]);
  const [postmanCollection, setPostmanCollection] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [aiProvider, setAiProvider] = useState<'google' | 'openai'>('google');
  const { toast } = useToast();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setSwaggerContent(content);
      
      toast({
        title: "File uploaded successfully",
        description: "Swagger/OpenAPI specification loaded"
      });
    } catch (error) {
      toast({
        title: "Error reading file",
        description: "Please ensure the file is a valid Swagger/OpenAPI specification",
        variant: "destructive"
      });
    }
  };

  const generateTestCases = async () => {
    if (!swaggerContent.trim()) {
      toast({
        title: "Missing Input",
        description: "Please provide a Swagger/OpenAPI specification",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      // Parse swagger content to validate it
      let swaggerSpec;
      try {
        swaggerSpec = JSON.parse(swaggerContent);
      } catch (error) {
        throw new Error("Invalid JSON format in Swagger specification");
      }
      
      if (!swaggerSpec.paths || Object.keys(swaggerSpec.paths).length === 0) {
        throw new Error("No API paths found in the specification");
      }

      setProgress(30);

      // Call the appropriate edge function based on AI provider selection
      const functionName = aiProvider === 'google' ? 'swagger-to-test-cases' : 'swagger-to-test-cases-openai';
      console.log(`Using AI provider: ${aiProvider}, calling function: ${functionName}`);
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { swaggerSpec }
      });

      if (error) throw error;

      setProgress(70);

      if (data.success) {
        setTestCases(data.csvData || []);
        setPostmanCollection(data.postmanCollection || null);
        setProgress(100);
        
        toast({
          title: "Test Cases Generated",
          description: `Generated ${(data.csvData?.length || 1) - 1} test cases using ${data.metadata?.provider || aiProvider === 'google' ? 'Google AI Studio' : 'Azure OpenAI'}`
        });
      } else {
        throw new Error(data.error || "Failed to generate test cases");
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate test cases",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadCSV = () => {
    if (!testCases || testCases.length === 0) return;
    
    const csvContent = testCases
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'api-test-cases.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPostmanCollection = () => {
    if (!postmanCollection) return;
    
    const blob = new Blob([JSON.stringify(postmanCollection, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'postman-collection.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Brain className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold">AI-Powered API Test Generator</h1>
      </div>
      <p className="text-muted-foreground">
        Upload your Swagger/OpenAPI specification and choose your AI provider to generate comprehensive test cases including CSV exports and Postman collections
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Swagger/OpenAPI Specification</CardTitle>
          <CardDescription>Upload or paste your API specification</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="fileUpload">Upload File</Label>
            <Input
              id="fileUpload"
              type="file"
              accept=".json,.yaml,.yml"
              onChange={handleFileUpload}
              className="cursor-pointer"
            />
          </div>

          <div>
            <Label htmlFor="aiProvider">AI Provider</Label>
            <Select value={aiProvider} onValueChange={(value: 'google' | 'openai') => setAiProvider(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select AI provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    Google AI Studio (Gemini)
                  </div>
                </SelectItem>
                <SelectItem value="openai">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Azure OpenAI (GPT-4)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="swaggerContent">Or Paste Content</Label>
            <Textarea
              id="swaggerContent"
              value={swaggerContent}
              onChange={(e) => setSwaggerContent(e.target.value)}
              placeholder="Paste your Swagger/OpenAPI specification here..."
              className="min-h-[300px] font-mono text-sm"
            />
          </div>

          <Button 
            onClick={generateTestCases} 
            disabled={isProcessing || !swaggerContent.trim()}
            className="w-full"
          >
            {aiProvider === 'google' ? <Brain className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
            {isProcessing ? `Generating with ${aiProvider === 'google' ? 'Google AI' : 'Azure OpenAI'}...` : `Generate Test Cases with ${aiProvider === 'google' ? 'Google AI' : 'Azure OpenAI'}`}
          </Button>

          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">
                {progress < 30 ? "Analyzing Swagger specification..." :
                 progress < 70 ? `Generating test cases with ${aiProvider === 'google' ? 'Google AI Studio' : 'Azure OpenAI'}...` :
                 "Finalizing results..."}
              </p>
            </div>
          )}

          {testCases && testCases.length > 0 && (
            <div className="flex gap-2 mt-4">
              <Button 
                onClick={downloadCSV} 
                variant="outline"
                size="sm"
              >
                <Download className="mr-2 h-4 w-4" />
                Download CSV
              </Button>
              
              <Button 
                onClick={downloadPostmanCollection} 
                disabled={!postmanCollection}
                variant="outline"
                size="sm"
              >
                <FileJson className="mr-2 h-4 w-4" />
                Download Postman
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Panels */}
      {testCases && testCases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Test Cases</CardTitle>
            <CardDescription>Preview of AI-generated test cases and exports</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="csv" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="csv">CSV Table</TabsTrigger>
                <TabsTrigger value="postman">Postman Collection</TabsTrigger>
                <TabsTrigger value="preview">UI Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="csv" className="mt-4">
                <div className="border rounded-lg">
                  <ScrollArea className="h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {testCases?.[0]?.map((header, index) => (
                            <TableHead key={index}>{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {testCases?.slice(1).map((row, rowIndex) => (
                          <TableRow key={rowIndex}>
                            {row.map((cell, cellIndex) => (
                              <TableCell key={cellIndex} className="max-w-xs truncate">
                                {cell}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="postman" className="mt-4">
                <Textarea
                  value={postmanCollection ? JSON.stringify(postmanCollection, null, 2) : ''}
                  readOnly
                  className="min-h-[400px] font-mono text-sm"
                />
              </TabsContent>

              <TabsContent value="preview" className="mt-4">
                <div className="space-y-4">
                  {testCases?.slice(1).map((row, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium">{row[2]}</h4>
                        <div className="flex gap-2">
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                            {row[1]}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            row[5] === 'Positive' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
                          }`}>
                            {row[5]}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <p><strong>Endpoint:</strong> {row[0]}</p>
                        <p><strong>Expected:</strong> {row[4]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};