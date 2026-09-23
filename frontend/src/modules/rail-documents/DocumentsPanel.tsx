import { Download, FileText, RefreshCw, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Alert, Button } from "../../shared/ui";
import { downloadFile, getPreview, listFiles, uploadFile, type StoredFile } from "./api/files";
import styles from "./DocumentsPanel.module.css";
import { useI18n } from "../../shared/i18n/I18nContext";

const PAGE_SIZE = 20;
const ACCEPT = ".csv,.xlsx,.pdf,.docx,.png,.jpg,.jpeg,.webp";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function formatSize(size: number, units: [string, string]): string {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} ${units[0]}`
    : `${(size / (1024 * 1024)).toFixed(1).replace(".", ",")} ${units[1]}`;
}

function FileRowsSkeleton() {
  const { t } = useI18n();
  return <div className={styles.skeleton} aria-busy="true" aria-label={t("Загружаем документы", "Құжаттар жүктелуде", "Loading documents")}>
    {Array.from({ length: 3 }, (_, index) => <div className={styles.skeletonRow} aria-hidden="true" key={index}><i /><span><i /><i /></span></div>)}
  </div>;
}

export function DocumentsPanel() {
  const { t } = useI18n();
  const fallback = t("Попробуйте ещё раз.", "Қайталап көріңіз.", "Please try again.");
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
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(errorText(reason, fallback)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fallback]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function refresh() {
    setPending("refresh");
    setError(null);
    try {
      const items = await listFiles();
      setFiles(items);
      setHasMore(items.length === PAGE_SIZE);
    } catch (reason) { setError(errorText(reason, fallback)); }
    finally { setPending(null); }
  }

  async function loadMore() {
    setPending("more");
    setError(null);
    try {
      const items = await listFiles(PAGE_SIZE, files.length);
      setFiles((current) => [...current, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch (reason) { setError(errorText(reason, fallback)); }
    finally { setPending(null); }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setMessage(null);
    setError(null);
    if (file.size === 0) { setError(t("Файл пуст. Выберите другой файл.", "Файл бос. Басқа файлды таңдаңыз.", "The file is empty. Choose another file.")); return; }
    setPending("upload");
    try {
      const saved = await uploadFile(file);
      setFiles((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setMessage(t(`Файл «${saved.filename}» загружен.`, `«${saved.filename}» файлы жүктелді.`, `File “${saved.filename}” uploaded.`));
    } catch (reason) { setError(errorText(reason, fallback)); }
    finally { setPending(null); }
  }

  async function handleDownload(file: StoredFile) {
    setPending(`download:${file.id}`);
    setError(null);
    try { await downloadFile(file); }
    catch (reason) { setError(t(`Не удалось скачать «${file.filename}»: ${errorText(reason, fallback)}`, `«${file.filename}» файлын жүктеп алу мүмкін болмады: ${errorText(reason, fallback)}`, `Could not download “${file.filename}”: ${errorText(reason, fallback)}`)); }
    finally { setPending(null); }
  }

  async function handlePreview(file: StoredFile) {
    if (preview?.file.id === file.id) { setPreview(null); return; }
    setPending(`preview:${file.id}`);
    setError(null);
    try {
      const blob = await getPreview(file.id);
      setPreview({ file, url: URL.createObjectURL(blob) });
    } catch (reason) { setError(t(`Не удалось открыть «${file.filename}»: ${errorText(reason, fallback)}`, `«${file.filename}» файлын ашу мүмкін болмады: ${errorText(reason, fallback)}`, `Could not open “${file.filename}”: ${errorText(reason, fallback)}`)); }
    finally { setPending(null); }
  }

  return <div className={styles.panel}>
    <div className={styles.toolbar}>
      <input ref={inputRef} className={styles.fileInput} type="file" accept={ACCEPT} aria-label={t("Выбрать документ для загрузки", "Жүктелетін құжатты таңдау", "Choose a document to upload")} onChange={(event) => void handleUpload(event)} />
      <Button size="sm" variant="secondary" icon={<Upload size={15} strokeWidth={1.8} />} loading={pending === "upload"} disabled={pending !== null} onClick={() => inputRef.current?.click()}>{t("Загрузить файл", "Файл жүктеу", "Upload file")}</Button>
      <button className={styles.refresh} type="button" aria-label={t("Обновить список документов", "Құжаттар тізімін жаңарту", "Refresh document list")} disabled={pending !== null} onClick={() => void refresh()}><RefreshCw size={16} strokeWidth={1.8} /></button>
    </div>
    {message && <p className={styles.message} role="status">{message}</p>}
    {error && <Alert tone="danger" title={t("Ошибка документов", "Құжат қатесі", "Document error")} action={<Button size="sm" variant="secondary" onClick={() => void refresh()}>{t("Повторить", "Қайталау", "Try again")}</Button>}>{error}</Alert>}
    {loading ? <FileRowsSkeleton /> : files.length === 0 ? <div className={styles.empty}><FileText size={22} strokeWidth={1.8} /><b>{t("Документов пока нет", "Әзірге құжаттар жоқ", "No documents yet")}</b><span>{t("Загрузите данные закупок или другой рабочий файл.", "Сатып алу деректерін немесе басқа жұмыс файлын жүктеңіз.", "Upload procurement data or another work file.")}</span></div> : <div className={styles.list} aria-busy={pending === "more"}>
      {files.map((file) => <div className={styles.row} key={file.id}>
        <span className={styles.icon} aria-hidden="true"><FileText size={17} strokeWidth={1.8} /></span>
        <div className={styles.details}><b title={file.filename}>{file.filename}</b><span>{formatSize(file.size_bytes, [t("КБ", "КБ", "KB"), t("МБ", "МБ", "MB")])} · {file.kind === "sheet" ? t("Таблица", "Кесте", "Spreadsheet") : file.kind === "pdf" ? "PDF" : file.kind === "image" ? t("Изображение", "Сурет", "Image") : t("Документ", "Құжат", "Document")}</span></div>
        <div className={styles.actions}>
          {file.preview_url && <button type="button" disabled={pending !== null} onClick={() => void handlePreview(file)}>{pending === `preview:${file.id}` ? t("Открываем…", "Ашылуда…", "Opening…") : t("Открыть", "Ашу", "Open")}</button>}
          <button type="button" aria-label={`${t("Скачать", "Жүктеп алу", "Download")} ${file.filename}`} title={t("Скачать", "Жүктеп алу", "Download")} disabled={pending !== null} onClick={() => void handleDownload(file)}><Download size={16} strokeWidth={1.8} /></button>
        </div>
      </div>)}
      {hasMore && <Button className={styles.more} size="sm" variant="ghost" loading={pending === "more"} disabled={pending !== null} onClick={() => void loadMore()}>{t("Показать ещё", "Тағы көрсету", "Show more")}</Button>}
    </div>}
    {preview && <div className={styles.preview}>
      <div><b>{preview.file.filename}</b><button type="button" aria-label={t("Закрыть предпросмотр", "Алдын ала қарауды жабу", "Close preview")} onClick={() => setPreview(null)}><X size={16} strokeWidth={1.8} /></button></div>
      <img src={preview.url} alt={`${t("Предпросмотр первой страницы файла", "Файлдың бірінші бетінің алдын ала көрінісі", "Preview of first page of file")} ${preview.file.filename}`} />
    </div>}
  </div>;
}
