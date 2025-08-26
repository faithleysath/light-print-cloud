import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { UploadCloud } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Necessary to allow drop
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  const handleClick = () => {
    document.getElementById('file-input')?.click();
  };

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center w-full p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ease-in-out",
        isDragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        id="file-input"
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept=".pdf,.txt,.png,.jpg,.jpeg,.gif,.doc,.docx,application/pdf,text/plain,image/png,image/jpeg,image/gif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />
      <div className="flex flex-col items-center justify-center text-center">
        <UploadCloud className={cn("w-12 h-12 mb-4", isDragging ? "text-primary" : "text-muted-foreground")} />
        <p className="mb-2 text-sm text-muted-foreground">
          <span className="font-semibold">点击上传</span> 或拖拽文件到此区域
        </p>
        <p className="text-xs text-muted-foreground">支持 PDF, DOCX, TXT, JPG, PNG 等</p>
      </div>
    </div>
  );
};
