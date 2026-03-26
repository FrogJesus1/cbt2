/**
 * file-upload.jsx
 *
 * Compact drag-and-drop file upload component ("Pattern").
 *
 * Usage:
 *   <Pattern
 *     accept=".roz,.rozs,.json"
 *     multiple={false}
 *     maxFiles={1}
 *     onFilesChange={handleFiles}
 *   />
 *
 * onFilesChange receives an array of { id, file, preview } objects.
 * Call reader.readAsText(item.file) to get the text content.
 */

import { formatBytes, useFileUpload } from "@/hooks/use-file-upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CircleAlertIcon, FileIcon, PlusIcon, XIcon } from "lucide-react";

export function Pattern({
  maxFiles      = 3,
  maxSize       = 2 * 1024 * 1024, // 2 MB
  accept        = "image/*",
  multiple      = true,
  className,
  onFilesChange,
}) {
  const [
    { files, isDragging, errors },
    {
      removeFile,
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      openFileDialog,
      getInputProps,
    },
  ] = useFileUpload({ maxFiles, maxSize, accept, multiple, onFilesChange });

  return (
    <div className={cn("w-full max-w-lg", className)}>

      {/* ── Drop zone ─────────────────────────────────────────────────── */}
      <div
        className={cn(
          "border-border rounded-lg flex items-center gap-3 border border-dashed p-4 transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <input {...getInputProps()} className="sr-only" />

        {/* Upload button */}
        <Button
          onClick={openFileDialog}
          size="sm"
          className={cn(isDragging && "animate-bounce")}
        >
          <PlusIcon className="h-4 w-4" />
          Add file
        </Button>

        {/* File previews / placeholder */}
        <div className="flex flex-1 items-center gap-2">
          {files.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Drop file or click to upload
            </p>
          ) : (
            files.map((fileItem) => {
              const isImg = fileItem.file.type.startsWith("image/");
              return (
                <div key={fileItem.id} className="group/item relative shrink-0">
                  {isImg && fileItem.preview ? (
                    <img
                      src={fileItem.preview}
                      alt={fileItem.file.name}
                      className="h-12 w-12 rounded-lg border object-cover"
                      title={`${fileItem.file.name} (${formatBytes(fileItem.file.size)})`}
                    />
                  ) : (
                    <div
                      className="bg-muted flex h-12 w-12 items-center justify-center rounded-lg border"
                      title={`${fileItem.file.name} (${formatBytes(fileItem.file.size)})`}
                    >
                      <FileIcon className="text-muted-foreground h-5 w-5" />
                    </div>
                  )}

                  {/* Remove button */}
                  <Button
                    onClick={() => removeFile(fileItem.id)}
                    variant="outline"
                    size="icon"
                    className="absolute -end-2 -top-2 size-5 rounded-full opacity-0 shadow-md transition-opacity group-hover/item:opacity-100"
                  >
                    <XIcon className="size-3" />
                  </Button>
                </div>
              );
            })
          )}
        </div>

        {/* File count badge */}
        {files.length > 0 && (
          <div className="text-muted-foreground shrink-0 text-xs">
            {files.length}/{maxFiles}
          </div>
        )}
      </div>

      {/* ── Error messages ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div
          className="mt-3 rounded-lg border border-red-500/40 bg-red-950/30 px-4 py-3"
          style={{ fontSize: "13px" }}
        >
          <div className="flex items-center gap-2 text-red-400 font-semibold mb-1">
            <CircleAlertIcon className="h-4 w-4 shrink-0" />
            File upload error
          </div>
          {errors.map((err, i) => (
            <p key={i} className="text-red-300/80 pl-6" style={{ fontSize: "12px" }}>
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
