"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, Upload, X } from "lucide-react";
import { fileHref, type FileInfo } from "@/lib/api";

type Props = {
  kind: "pdf" | "image" | "document";
  file: File | null;
  onChange: (file: File | null) => void;
  maxMB: number;
  required?: boolean;
  /** When editing: the file already stored. Leaving the field alone keeps it. */
  existing?: FileInfo | null;
};

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileField({ kind, file, onChange, maxMB, required, existing }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");

  const setPreviewUrl = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const reject = (message: string) => {
    setError(message);
    setPreviewUrl(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) {
      setError("");
      setPreviewUrl(null);
      onChange(null);
      return;
    }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const isImage = f.type.startsWith("image/");
    const validType = kind === "pdf" ? isPdf : kind === "image" ? isImage : isPdf || isImage;
    if (!validType) {
      return reject(
        kind === "pdf" ? "Please choose a PDF file." : kind === "image" ? "Please choose an image file." : "Please choose a PDF or image file.",
      );
    }
    if (f.size > maxMB * 1024 * 1024) return reject(`File is larger than ${maxMB}MB.`);

    setError("");
    setPreviewUrl(isImage ? URL.createObjectURL(f) : null);
    onChange(f);
  };

  const clear = () => {
    if (inputRef.current) inputRef.current.value = "";
    setError("");
    setPreviewUrl(null);
    onChange(null);
  };

  const Icon = kind === "image" ? ImagePlus : Upload;
  const kindLabel = kind === "pdf" ? "PDF only" : kind === "image" ? "Image" : "PDF or image";

  return (
    <div className="file-field">
      <div className="file-zone" data-filled={!!file || !!existing} data-invalid={!!error}>
        <input
          ref={inputRef}
          type="file"
          className="file-input"
          accept={kind === "pdf" ? "application/pdf,.pdf" : kind === "image" ? "image/*" : "application/pdf,.pdf,image/*"}
          required={required}
          onChange={handleChange}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="file-thumb" />
        ) : !file && existing?.contentType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fileHref(existing.url)} alt="" className="file-thumb" />
        ) : (
          <span className="file-icon">{file || existing ? <FileText size={18} strokeWidth={1.75} /> : <Icon size={18} strokeWidth={1.75} />}</span>
        )}
        <span className="file-text">
          {file ? (
            <>
              <span className="file-name">{file.name}</span>
              <span className="file-meta">{formatSize(file.size)}</span>
            </>
          ) : existing ? (
            <>
              <span className="file-name">{existing.filename}</span>
              <span className="file-meta">Current file · click to replace it</span>
            </>
          ) : (
            <>
              <span className="file-name">{kind === "pdf" ? "Click to upload PDF" : kind === "image" ? "Click to upload photo" : "Click to upload file"}</span>
              <span className="file-meta">{`${kindLabel} · Max ${maxMB}MB`}</span>
            </>
          )}
        </span>
        {file && (
          <button type="button" className="file-clear" aria-label="Remove file" onClick={clear}>
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      {error && <p className="file-error" role="alert">{error}</p>}
    </div>
  );
}
