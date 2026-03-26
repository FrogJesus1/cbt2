/**
 * use-file-upload.js
 *
 * Drag-and-drop + file-picker hook used by the Pattern upload component.
 *
 * Returns:
 *   [ stateObj, handlerObj ]
 *
 * stateObj:  { files, isDragging, errors }
 * handlerObj: { removeFile, handleDragEnter, handleDragLeave, handleDragOver,
 *               handleDrop, openFileDialog, getInputProps }
 *
 * Each file in `files` has shape:
 *   { id, file, preview }   — file is the native File object; preview is an
 *                              object-URL string for images, null otherwise.
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId() { return ++_idCounter; }

/** Format a byte count as a human-readable string. */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k     = 1024;
  const units = ["B", "KB", "MB", "GB"];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${units[i]}`;
}

/**
 * Check whether a file matches an accept string.
 * The accept string is a comma-separated list of extensions (.roz) or MIME types
 * (image/*). Extension matching is case-insensitive.
 */
function matchesAccept(file, accept) {
  if (!accept || accept === "*" || accept === "*/*") return true;
  const parts = accept.split(",").map(s => s.trim().toLowerCase());
  const ext   = "." + file.name.split(".").pop().toLowerCase();
  const mime  = (file.type || "").toLowerCase();
  return parts.some(p => {
    if (p.startsWith(".")) return ext === p;
    if (p.endsWith("/*")) return mime.startsWith(p.slice(0, -1));
    return mime === p;
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {number} [opts.maxFiles=1]
 * @param {number} [opts.maxSize]         — bytes; falsy = no limit
 * @param {string} [opts.accept="*"]
 * @param {boolean} [opts.multiple=false]
 * @param {Function} [opts.onFilesChange]  — called with FileWithPreview[]
 */
export function useFileUpload({
  maxFiles  = 1,
  maxSize,
  accept    = "*",
  multiple  = false,
  onFilesChange,
} = {}) {
  const [files,      setFiles]      = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errors,     setErrors]     = useState([]);
  const inputRef   = useRef(null);
  const dragCount  = useRef(0); // tracks nested dragenter/dragleave pairs

  // Revoke object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      files.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add files from a FileList / File[] ──────────────────────────────────

  const addFiles = useCallback((incoming) => {
    const list   = Array.from(incoming || []);
    const errs   = [];
    const accepted = [];

    for (const file of list) {
      if (!matchesAccept(file, accept)) {
        errs.push(`"${file.name}" — unsupported type. Accepted: ${accept}`);
        continue;
      }
      if (maxSize && file.size > maxSize) {
        errs.push(`"${file.name}" — too large (max ${formatBytes(maxSize)})`);
        continue;
      }
      accepted.push(file);
    }

    setErrors(errs);
    if (!accepted.length) return;

    setFiles(prev => {
      const next = multiple
        ? [...prev, ...accepted.map(toItem)].slice(-maxFiles)
        : [toItem(accepted[0])];

      onFilesChange?.(next);
      return next;
    });
  }, [accept, maxSize, maxFiles, multiple, onFilesChange]);

  function toItem(file) {
    const preview = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : null;
    return { id: nextId(), file, preview };
  }

  // ── Remove ───────────────────────────────────────────────────────────────

  const removeFile = useCallback((id) => {
    setFiles(prev => {
      const next = prev.filter(f => {
        if (f.id !== id) return true;
        if (f.preview) URL.revokeObjectURL(f.preview);
        return false;
      });
      onFilesChange?.(next);
      return next;
    });
  }, [onFilesChange]);

  // ── Drag handlers ────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current += 1;
    if (dragCount.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current = Math.max(0, dragCount.current - 1);
    if (dragCount.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current = 0;
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ── File dialog ──────────────────────────────────────────────────────────

  const openFileDialog = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
      inputRef.current.click();
    }
  }, []);

  const getInputProps = useCallback(() => ({
    ref:      inputRef,
    type:     "file",
    accept,
    multiple: multiple && maxFiles > 1,
    onChange: (e) => addFiles(e.target.files),
    style:    { display: "none" },
  }), [accept, multiple, maxFiles, addFiles]);

  // ── Public API ───────────────────────────────────────────────────────────

  return [
    { files, isDragging, errors },
    { removeFile, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, getInputProps },
  ];
}
