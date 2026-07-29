/**
 * fileSave.ts
 *
 * Sostituisce il download silenzioso (che finisce sempre nella cartella
 * Download di default) con la finestra nativa "Salva con nome" del sistema
 * operativo, che permette di scegliere cartella e nome file. La cartella
 * scelta l'ultima volta viene ricordata (tramite IndexedDB, che supporta la
 * memorizzazione degli handle di file/cartella) e riproposta di default alla
 * prossima esportazione.
 *
 * Disponibile solo nei browser basati su Chromium (File System Access API).
 * Negli altri browser (Firefox, Safari) si ricade sul download classico.
 */

const DB_NAME = 'rilo-file-save';
const STORE_NAME = 'handles';
const LAST_HANDLE_KEY = 'lastSavedFile';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getLastHandle(): Promise<FileSystemFileHandle | undefined> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(LAST_HANDLE_KEY);
      req.onsuccess = () => resolve(req.result as FileSystemFileHandle | undefined);
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

async function setLastHandle(handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(handle, LAST_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* ignora — non blocca il salvataggio se non riusciamo a ricordare la cartella */
  }
}

export interface SaveFileOptions {
  /** Nome file proposto di default nella finestra "Salva con nome" */
  suggestedName: string;
  /** MIME type del file (es. 'application/pdf') */
  mimeType: string;
  /** Estensioni accettate, es. ['.pdf'] */
  extensions: string[];
  /** Descrizione del tipo di file mostrata nel filtro della finestra di salvataggio */
  description?: string;
}

export type SaveFileResult = 'saved' | 'cancelled' | 'fallback';

/**
 * Salva un Blob aprendo la finestra nativa "Salva con nome" (se supportata),
 * riproponendo di default l'ultima cartella usata. Ricade sul download
 * classico nei browser che non supportano la File System Access API.
 */
export async function saveFileWithPicker(blob: Blob, opts: SaveFileOptions): Promise<SaveFileResult> {
  const w = window as any;

  if (typeof w.showSaveFilePicker === 'function') {
    try {
      const lastHandle = await getLastHandle();
      const pickerOptions: any = {
        suggestedName: opts.suggestedName,
        types: [{
          description: opts.description || 'File',
          accept: { [opts.mimeType]: opts.extensions },
        }],
      };
      // "startIn" accetta un handle usato in precedenza: il browser apre la
      // finestra nella stessa cartella dell'ultimo salvataggio.
      if (lastHandle) pickerOptions.startIn = lastHandle;

      const handle: FileSystemFileHandle = await w.showSaveFilePicker(pickerOptions);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      await setLastHandle(handle);
      return 'saved';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      console.error('showSaveFilePicker non riuscito, ripiego sul download classico:', e);
      // prosegue con il fallback qui sotto
    }
  }

  const { saveAs } = await import('file-saver');
  saveAs(blob, opts.suggestedName);
  return 'fallback';
}
