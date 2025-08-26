import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUpload } from '@/components/FileUpload';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure the PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();


// Define the base URL of the Flask API
const API_BASE_URL = '';

interface PrinterOptions {
  media_supported: string[];
  print_quality_supported: string[];
  // sides_supported is removed as per user feedback for manual duplex handling
  color_supported: string[];
}

type PreviewType = 'pdf' | 'image' | 'text' | 'none';

function App() {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>('');
  const [printerOptions, setPrinterOptions] = useState<PrinterOptions | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<PreviewType>('none');
  const [copies, setCopies] = useState<number>(1);
  const [pageRange, setPageRange] = useState<string>('');
  const [paperSize, setPaperSize] = useState<string>(''); // Will be set based on printer options
  const [colorMode, setColorMode] = useState<string>(''); // Will be set based on printer options
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);

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

  // Effect to fetch printer options when a printer is selected
  useEffect(() => {
    if (!selectedPrinter) {
      setPrinterOptions(null);
      return;
    }

    const fetchPrinterOptions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/printers/${selectedPrinter}/options`);
        if (!response.ok) {
          throw new Error('Failed to fetch printer options');
        }
        const options: PrinterOptions = await response.json();
        setPrinterOptions(options);

        // Set default values based on the fetched options
        if (options.media_supported?.length > 0) {
          setPaperSize(options.media_supported[0]);
        }
        if (options.color_supported?.length > 0) {
          setColorMode(options.color_supported.includes('color') ? 'color' : options.color_supported[0]);
        }

      } catch (error) {
        console.error("Failed to fetch printer options:", error);
        setError(`无法加载打印机选项: ${selectedPrinter}`);
        setPrinterOptions(null); // Clear options on error
      }
    };

    fetchPrinterOptions();
  }, [selectedPrinter]);

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
        if (['completed', 'canceled', 'aborted'].includes(data.status)) {
          clearInterval(intervalId);
        }
      } catch (error: any) {
        console.error("Failed to check job status:", error);
        setError(`无法获取任务状态: ${error.message}`);
        clearInterval(intervalId); // Stop polling on error
      }
    };
    const intervalId = setInterval(checkJobStatus, 3000);
    return () => clearInterval(intervalId);
  }, [jobId]);

  // Effect for revoking object URL to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Memoize the parsed page numbers to avoid re-calculating on every render
  const pagesToRender = useMemo(() => {
    if (!pageRange) return null;
    const pages = new Set<number>();
    const parts = pageRange.split(',');
    try {
      for (const part of parts) {
        const trimmedPart = part.trim();
        if (trimmedPart.includes('-')) {
          const [start, end] = trimmedPart.split('-').map(Number);
          if (!isNaN(start) && !isNaN(end) && start <= end) {
            for (let i = start; i <= end; i++) pages.add(i);
          }
        } else {
          const pageNum = Number(trimmedPart);
          if (!isNaN(pageNum)) pages.add(pageNum);
        }
      }
      const sortedPages = Array.from(pages).sort((a, b) => a - b);
      if (numPages) {
        return sortedPages.filter(p => p > 0 && p <= numPages);
      }
      return sortedPages;
    } catch (e) {
      console.error("Error parsing page range:", e);
      return null;
    }
  }, [pageRange, numPages]);

  const handleFileSelect = async (selectedFile: File) => {
    const allowedExtensions = ['pdf', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'doc', 'docx'];
    const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase();

    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      setError(`不支持的文件类型: .${fileExtension}。请上传支持的格式。`);
      setFile(null);
      setPreviewUrl(null);
      setTextContent(null);
      setPreviewType('none');
      return;
    }

    setFile(selectedFile);
    setError(null);

    // Cleanup previous preview states
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setTextContent(null);
    setNumPages(null);

    const imageTypes = ['png', 'jpg', 'jpeg', 'gif'];
    if (imageTypes.includes(fileExtension)) {
      setPreviewType('image');
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(objectUrl);
    } else if (fileExtension === 'txt') {
      setPreviewType('text');
      const reader = new FileReader();
      reader.onload = (e) => {
        setTextContent(e.target?.result as string);
      };
      reader.readAsText(selectedFile);
    } else if (fileExtension === 'pdf') {
      setPreviewType('pdf');
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreviewUrl(objectUrl);
    } else {
      // For other types like DOCX, send to backend
      setPreviewType('none'); // Show loading or placeholder
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
          setPreviewType('pdf'); // Backend converts to PDF
        } else {
          throw new Error(data.error || 'Preview generation failed.');
        }
      } catch (error: any) {
        console.error("Failed to generate preview:", error);
        setError(`预览失败: ${error.message}`);
      }
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
    if (pageRange) formData.append('page_range', pageRange);
    formData.append('paper_size', paperSize);
    formData.append('color_mode', colorMode);
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

  const renderPreview = () => {
    switch (previewType) {
      case 'pdf':
        return (
          <div className="flex-grow w-full h-full overflow-auto bg-muted/50 rounded-md p-4">
            <Document
              file={previewUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              onLoadError={(e) => {
                console.error('Failed to load PDF:', e);
                setError(`无法加载PDF预览: ${e.message}`);
              }}
              className="flex flex-col items-center"
            >
              {pagesToRender ? (
                pagesToRender.map((pageNumber) => (
                  <div key={`page_wrapper_${pageNumber}`} className="mb-4">
                    <Page pageNumber={pageNumber} className="shadow-lg" />
                    <p className="text-center text-sm text-muted-foreground mt-2">第 {pageNumber} 页</p>
                  </div>
                ))
              ) : (
                Array.from(new Array(numPages || 0), (_, index) => {
                  const pageNumber = index + 1;
                  return (
                    <div key={`page_wrapper_${pageNumber}`} className="mb-4">
                      <Page pageNumber={pageNumber} className="shadow-lg" />
                      <p className="text-center text-sm text-muted-foreground mt-2">第 {pageNumber} 页 / 共 {numPages} 页</p>
                    </div>
                  );
                })
              )}
            </Document>
          </div>
        );
      case 'image':
        return (
          <div className="flex-grow w-full h-full flex items-center justify-center overflow-auto bg-muted/50 rounded-md p-4">
            <img src={previewUrl!} alt="File Preview" className="max-w-full max-h-full object-contain" />
          </div>
        );
      case 'text':
        return (
          <div className="flex-grow w-full h-full overflow-auto bg-muted/50 rounded-md p-4">
            <pre className="text-sm whitespace-pre-wrap">{textContent}</pre>
          </div>
        );
      default:
        return (
          <div className="flex-grow flex items-center justify-center bg-muted/50 rounded-md">
            <p className="text-muted-foreground">请上传文件以查看预览</p>
          </div>
        );
    }
  };

  return (
    <div className="container mx-auto p-4 h-screen flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-grow min-h-0">
        <Card className="lg:col-span-2 flex flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>预览</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col min-h-0">
            {error && (
              <div className="bg-destructive/20 border border-destructive text-destructive p-3 rounded-md mb-4">
                {error}
              </div>
            )}
            {renderPreview()}
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
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="page-range-input">页面范围 (例如: 1, 3-5, 8)</Label>
              <Input
                id="page-range-input"
                type="text"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
                placeholder="所有页面"
              />
            </div>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="paper-size-select">纸张大小</Label>
              <Select 
                value={paperSize} 
                onValueChange={setPaperSize}
                disabled={!printerOptions?.media_supported || printerOptions.media_supported.length === 0}
              >
                <SelectTrigger id="paper-size-select">
                  <SelectValue placeholder="选择纸张大小..." />
                </SelectTrigger>
                <SelectContent>
                  {printerOptions?.media_supported?.map(size => (
                    <SelectItem key={size} value={size}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="color-mode-select">颜色</Label>
              <Select 
                value={colorMode} 
                onValueChange={setColorMode}
                disabled={!printerOptions?.color_supported || printerOptions.color_supported.length === 0}
              >
                <SelectTrigger id="color-mode-select">
                  <SelectValue placeholder="选择颜色模式..." />
                </SelectTrigger>
                <SelectContent>
                  {printerOptions?.color_supported?.map(mode => (
                    <SelectItem key={mode} value={mode}>{mode === 'color' ? '彩色' : '黑白'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
