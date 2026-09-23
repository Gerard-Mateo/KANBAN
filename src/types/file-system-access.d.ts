// The rest of the File System Access API (FileSystemDirectoryHandle,
// createWritable, permission methods, ...) is already in lib.dom.d.ts for
// this TS version; only the Window entry point is missing.
interface DirectoryPickerOptions {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: FileSystemHandle | string;
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
