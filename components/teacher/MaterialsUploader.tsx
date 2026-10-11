"use client";

import React, { useState, useRef, useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  UploadCloud,
  FileText,
  X,
  File,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { extractTextFromFile } from "@/lib/pdf/extractor";

interface MaterialsUploaderProps {
  classId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function MaterialsUploader({
  classId,
  isOpen,
  onClose,
  onSuccess,
}: MaterialsUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"file" | "outline">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const resetState = () => {
    setSelectedFile(null);
    setDocTitle("");
    setOutlineText("");
    setUploadProgress(0);
    setStatusText("");
    setIsProcessing(false);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    // Derive default title from file name without extension
    const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
    setDocTitle(cleanTitle);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      if (activeTab === "file") {
        if (!selectedFile) {
          toast({ title: "Please select a file to upload", variant: "destructive" });
          setIsProcessing(false);
          return;
        }

        setStatusText("Initiating upload...");
        setUploadProgress(10);

        // Step 1: Initialize upload and get signed URL
        const initRes = await fetch(`/api/classes/${classId}/materials/init`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            mime: selectedFile.type || "application/pdf",
            sizeBytes: selectedFile.size,
            title: docTitle.trim() || selectedFile.name,
          }),
        });

        const initJson = await initRes.json();
        if (!initJson.ok) {
          throw new Error(initJson.error?.message || "Could not prepare upload session");
        }

        const { materialId, uploadUrl } = initJson.data;

        let uploadedToStorage = false;
        if (uploadUrl) {
          try {
            setStatusText("Uploading directly to storage...");
            await new Promise<void>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open("PUT", uploadUrl, true);
              if (selectedFile.type) {
                xhr.setRequestHeader("Content-Type", selectedFile.type);
              }

              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  const pct = Math.round((ev.loaded / ev.total) * 60) + 10;
                  setUploadProgress(pct);
                }
              };

              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  setUploadProgress(75);
                  uploadedToStorage = true;
                  resolve();
                } else {
                  reject(new Error(`Storage upload failed with HTTP status ${xhr.status}`));
                }
              };

              xhr.onerror = () => reject(new Error("Network error during direct storage upload"));
              xhr.send(selectedFile);
            });
          } catch (storageErr) {
            console.warn("Direct storage upload failed, falling back to local extraction:", storageErr);
          }
        }

        // If not uploaded to storage, extract text locally in browser
        let fallbackContentText: string | undefined = undefined;
        if (!uploadedToStorage) {
          setStatusText("Processing and extracting document locally...");
          setUploadProgress(50);
          fallbackContentText = await extractTextFromFile(selectedFile);
          setUploadProgress(75);
        }

        // Step 3: Complete and trigger AI analysis
        setStatusText("Analyzing document structure & building concept skeleton...");
        setUploadProgress(85);

        const completeRes = await fetch(`/api/classes/${classId}/materials/${materialId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentText: fallbackContentText,
          }),
        });

        const completeJson = await completeRes.json();
        setUploadProgress(100);

        if (completeJson.ok) {
          const status = completeJson.data?.ingestResult?.status || completeJson.data?.status;
          if (status === "waiting_quota") {
            toast({
              title: "Material Saved & Queued",
              description: `Upload saved. The AI daily quota resets at ${completeJson.data?.ingestResult?.resumeAt || "midnight Pacific"}. It will be analyzed automatically.`,
              variant: "amber",
            });
          } else {
            toast({
              title: "Material Uploaded & Analyzed",
              description: "AI topic router generated curriculum map proposals for review.",
              variant: "success",
            });
          }
        } else {
          toast({
            title: "Upload Saved",
            description: completeJson.error?.message || "File uploaded successfully.",
            variant: "amber",
          });
        }
      } else {
        // Tab 2: Typed course outline
        if (!outlineText.trim()) {
          toast({ title: "Please enter your outline notes", variant: "destructive" });
          setIsProcessing(false);
          return;
        }

        setStatusText("Processing outline...");
        setUploadProgress(30);

        // Upload as text document
        const initRes = await fetch(`/api/classes/${classId}/materials`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: docTitle.trim() || "Course Outline",
            contentText: outlineText,
          }),
        });

        const json = await initRes.json();
        setUploadProgress(100);

        if (json.ok) {
          toast({
            title: "Outline Analyzed",
            description: "AI topic router processed your syllabus structure.",
            variant: "success",
          });
        } else {
          toast({
            title: "Outline Error",
            description: json.error?.message || "Failed to process outline.",
            variant: "destructive",
          });
        }
      }

      resetState();
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete upload.";
      toast({
        title: "Upload Alert",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">Real Course Ingestion</Badge>
              <Badge variant="emerald" className="text-[10px]">Direct Storage Pipeline</Badge>
            </div>
            <h3 className="font-extrabold text-lg text-slate-900 dark:text-white mt-1">
              Add Learning Material & Curriculum
            </h3>
          </div>
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "file"
                ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <UploadCloud className="h-3.5 w-3.5" /> Upload File (PDF, Slides)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("outline")}
            className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "outline"
                ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
                : "text-slate-600 dark:text-slate-400"
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> Paste Course Outline
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Document Title (Optional) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Document Title <span className="text-slate-400 font-normal">(optional, auto-derived from file)</span>
            </label>
            <Input
              placeholder="e.g. Chapter 4: Nyquist Stability & Bode Plots"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              disabled={isProcessing}
              className="text-xs"
            />
          </div>

          {activeTab === "file" ? (
            <div className="space-y-3">
              {/* Drag and drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-teal-500 bg-teal-500/10 scale-[0.99]"
                    : selectedFile
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-slate-300 dark:border-slate-700 hover:border-teal-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelect(e.target.files[0]);
                    }
                  }}
                />

                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <File className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {selectedFile.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready for ingestion
                      </p>
                    </div>
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 underline font-semibold">
                      Click or drag to choose another file
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="h-10 w-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto">
                      <UploadCloud className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Drag and drop your document here, or click to browse
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        PDF textbooks, lecture slides (PPTX), Word docs (DOCX), or plain notes
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-slate-400">
                      Up to 100 MB • Direct signed URL bypasses serverless size caps
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Course Outline / Syllabus Headings
              </label>
              <textarea
                rows={7}
                placeholder={`1. Introduction to Feedback Control\n2. Frequency Domain Analysis & Transfer Functions\n3. Stability Criteria & Root Locus\n4. PID Controller Design & Tuning`}
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-900 focus:border-teal-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 font-mono"
              />
              <p className="text-[11px] text-slate-500">
                Headings in your outline will be mapped 1:1 to course modules and Knowledge Components.
              </p>
            </div>
          )}

          {/* Progress Indicator */}
          {isProcessing && (
            <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 animate-spin" /> {statusText}
                </span>
                <span className="font-mono text-slate-500">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-teal-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isProcessing}
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isProcessing || (activeTab === "file" && !selectedFile) || (activeTab === "outline" && !outlineText.trim())}
              className="text-xs"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {isProcessing ? "Processing..." : "Ingest & Route to Map"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
