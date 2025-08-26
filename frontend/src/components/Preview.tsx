import { useMemo } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

interface PreviewProps {
  previewType: 'pdf' | 'image' | 'text' | 'none';
  previewUrl: string | null;
  textContent: string | null;
  pageRange: string;
  numPages: number | null;
  onPdfLoadSuccess: (numPages: number) => void;
  onPdfLoadError: (error: Error) => void;
}

export function Preview({
  previewType,
  previewUrl,
  textContent,
  pageRange,
  numPages,
  onPdfLoadSuccess,
  onPdfLoadError,
}: PreviewProps) {
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

  switch (previewType) {
    case 'pdf':
      return (
        <div className="flex-grow w-full h-full overflow-auto bg-muted/50 rounded-md p-4">
          <Document
            file={previewUrl}
            onLoadSuccess={({ numPages }) => onPdfLoadSuccess(numPages)}
            onLoadError={onPdfLoadError}
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
}
