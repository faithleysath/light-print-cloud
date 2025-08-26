import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from '@/components/FileUpload';


// Define the base URL of the Flask API
const API_BASE_URL = 'http://localhost:5001';

function App() {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copies, setCopies] = useState<number>(1);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch printers on component mount
  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/printers`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setPrinters(data);
        if (data.length > 0) {
          setSelectedPrinter(data[0]); // Default to the first printer
        }
      } catch (error) {
        console.error("Failed to fetch printers:", error);
        setError("无法加载打印机列表，请确保后端服务正在运行。");
      }
    };

    fetchPrinters();
  }, []);

  // Effect for polling job status
  useEffect(() => {
    if (!jobId) return;

    const checkJobStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch job status.');
        }

        setJobStatus(`任务 ${jobId}: ${data.status} (${data.reasons})`);

        // Stop polling if the job is in a terminal state
        if (['completed', 'canceled', 'aborted'].includes(data.status)) {
          clearInterval(intervalId);
        }
      } catch (error: any) {
        console.error("Failed to check job status:", error);
        setError(`无法获取任务状态: ${error.message}`);
        clearInterval(intervalId); // Stop polling on error
      }
    };

    const intervalId = setInterval(checkJobStatus, 3000); // Poll every 3 seconds

    // Cleanup function to clear the interval when the component unmounts or jobId changes
    return () => clearInterval(intervalId);
  }, [jobId]);

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    generatePreview(selectedFile);
  };

  const generatePreview = async (selectedFile: File) => {
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/preview`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setPreviewUrl(`${API_BASE_URL}${data.preview_path}`);
        setError(null);
      } else {
        throw new Error(data.error || 'Preview generation failed.');
      }
    } catch (error: any) {
      console.error("Failed to generate preview:", error);
      setPreviewUrl(null);
      setError(`预览失败: ${error.message}`);
    }
  };

  const handlePrint = async () => {
    if (!file || !selectedPrinter) {
      setError("请选择文件和打印机。");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('printer', selectedPrinter);
    formData.append('copies', copies.toString());

    setError(null);
    setJobStatus("正在提交打印任务...");

    try {
      const response = await fetch(`${API_BASE_URL}/api/print`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setJobId(data.job_id);
        setJobStatus(`任务 ${data.job_id} 已提交，正在获取状态...`);
      } else {
        throw new Error(data.error || 'Print submission failed.');
      }
    } catch (error: any) {
      console.error("Failed to print:", error);
      setError(`打印失败: ${error.message}`);
      setJobStatus(null);
    }
  };

  return (
    <div className="container mx-auto p-4 min-h-screen flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-grow">
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader>
            <CardTitle>预览</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col">
            {error && (
              <div className="bg-destructive/20 border border-destructive text-destructive p-3 rounded-md mb-4">
                {error}
              </div>
            )}
            {previewUrl ? (
              <iframe src={previewUrl} title="File Preview" className="w-full h-full border-0 flex-grow"></iframe>
            ) : (
              <div className="flex-grow flex items-center justify-center bg-muted/50 rounded-md">
                <p className="text-muted-foreground">请上传文件以查看预览</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1 flex flex-col">
          <CardHeader>
            <CardTitle>打印设置</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col gap-6">
            <FileUpload onFileSelect={handleFileSelect} />
            
            {file && (
              <div className="text-sm text-center text-muted-foreground">
                已选择文件: <strong>{file.name}</strong>
              </div>
            )}

            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="printer-select">选择打印机</Label>
              <Select
                value={selectedPrinter}
                onValueChange={setSelectedPrinter}
                disabled={printers.length === 0}
              >
                <SelectTrigger id="printer-select">
                  <SelectValue placeholder="选择一个打印机..." />
                </SelectTrigger>
                <SelectContent>
                  {printers.map(printer => (
                    <SelectItem key={printer} value={printer}>{printer}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="copies-input">份数</Label>
              <Input
                id="copies-input"
                type="number"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value, 10)))}
                min="1"
              />
            </div>
          </CardContent>
          <div className="p-6 pt-0 mt-auto">
            <Button 
              className="w-full" 
              onClick={handlePrint} 
              disabled={!file || !selectedPrinter}
            >
              打印
            </Button>
            {jobStatus && <p className="mt-4 text-sm text-muted-foreground text-center">{jobStatus}</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default App;
