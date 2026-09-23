import { Download, FileText, RefreshCw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Alert, Button } from "../../shared/ui";
import { downloadFile, getPreview, listFiles, uploadFile, type StoredFile } from "./api/files";
import styles from "./DocumentsPanel.module.css";

const PAGE_SIZE = 20;
const ACCEPT = ".csv,.xlsx,.pdf,.docx,.png,.jpg,.jpeg,.webp";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Попробуйте ещё раз.";
}

function formatSize(size: number): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} КБ`
    : `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} МБ`;
}

function FileRowsSkeleton() {
  return <div className={styles.skeleton} aria-busy="true" aria-label="Загружаем документы">
    {Array.from({ length: 3 }, (_, index) => <div className={styles.skeletonRow} aria-hidden="true" key={index}><i /><span><i /><i /></span></div>)}
  </div>;
}

export function DocumentsPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: StoredFile; url: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listFiles(PAGE_SIZE, 0, controller.signal)
      .then((items) => { setFiles(items); setHasMore(items.length === PAGE_SIZE); setError(null); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function refresh() {
    setPending("refresh");
    setError(null);
    try {
      const items = await listFiles();
      setFiles(items);
      setHasMore(items.length === PAGE_SIZE);
    } catch (reason) { setError(errorText(reason)); }
    finally { setPending(null); }
  }

  async function loadMore() {
    setPending("more");
    setError(null);
    try {
      const items = await listFiles(PAGE_SIZE, files.length);
      setFiles((current) => [...current, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch (reason) { setError(errorText(reason)); }
    finally { setPending(null); }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setMessage(null);
    setError(null);
    if (file.size === 0) { setError("Файл пуст. Выберите другой файл."); return; }
    setPending("upload");
    try {
      const saved = await uploadFile(file);
      setFiles((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setMessage(`Файл «${saved.filename}» загружен.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setPending(null); }
  }

  async function handleDownload(file: StoredFile) {
    setPending(`download:${file.id}`);
    setError(null);
    try { await downloadFile(file); }
    catch (reason) { setError(`Не удалось скачать «${file.filename}»: ${errorText(reason)}`); }
    finally { setPending(null); }
  }

  async function handlePreview(file: StoredFile) {
    if (preview?.file.id === file.id) { setPreview(null); return; }
    setPending(`preview:${file.id}`);
    setError(null);
    try {
      const blob = await getPreview(file.id);
      setPreview({ file, url: URL.createObjectURL(blob) });
    } catch (reason) { setError(`Не удалось открыть «${file.filename}»: ${errorText(reason)}`); }
    finally { setPending(null); }
  }

  return <div className={styles.panel}>
    <div className={styles.toolbar}>
      <input ref={inputRef} className={styles.fileInput} type="file" accept={ACCEPT} aria-label="Выбрать документ для загрузки" onChange={(event) => void handleUpload(event)} />
      <Button size="sm" variant="secondary" icon={<Upload size={15} strokeWidth={1.8} />} loading={pending === "upload"} disabled={pending !== null} onClick={() => inputRef.current?.click()}>Загрузить файл</Button>
      <button className={styles.refresh} type="button" aria-label="Обновить список документов" disabled={pending !== null} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} /></button>
    </div>
    {message && <p className={styles.message} role="status">{message}</p>}
    {error && <Alert tone="danger" title="Ошибка документов" action={<Button size="sm" variant="secondary" onClick={() => void refresh()}>Повторить</Button>}>{error}</Alert>}
    {loading ? <FileRowsSkeleton /> : files.length === 0 ? <div className={styles.empty}><FileText size={22} strokeWidth={1.8} /><b>Документов пока нет</b><span>Загрузите данные закупок или другой рабочий файл.</span></div> : <div className={styles.list} aria-busy={pending === "more"}>
      {files.map((file) => <div className={styles.row} key={file.id}>
        <span className={styles.icon} aria-hidden="true"><FileText size={17} strokeWidth={1.8} /></span>
        <div className={styles.details}><b title={file.filename}>{file.filename}</b><span>{formatSize(file.size_bytes)} · {file.kind === "sheet" ? "Таблица" : file.kind === "pdf" ? "PDF" : file.kind === "image" ? "Изображение" : "Документ"}</span></div>
        <div className={styles.actions}>
          {file.preview_url && <button type="button" disabled={pending !== null} onClick={() => void handlePreview(file)}>{pending === `preview:${file.id}` ? "Открываем…" : "Открыть"}</button>}
          <button type="button" aria-label={`Скачать ${file.filename}`} title="Скачать" disabled={pending !== null} onClick={() => void handleDownload(file)}><Download size={16} strokeWidth={1.8} /></button>
        </div>
      </div>)}
      {hasMore && <Button className={styles.more} size="sm" variant="ghost" loading={pending === "more"} disabled={pending !== null} onClick={() => void loadMore()}>Показать ещё</Button>}
    </div>}
    {preview && <div className={styles.preview}>
      <div><b>{preview.file.filename}</b><button type="button" aria-label="Закрыть предпросмотр" onClick={() => setPreview(null)}><X size={16} strokeWidth={1.8} /></button></div>
      <img src={preview.url} alt={`Предпросмотр первой страницы файла ${preview.file.filename}`} />
    </div>}
  </div>;
}
